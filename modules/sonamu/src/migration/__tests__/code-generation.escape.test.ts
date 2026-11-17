import { runInNewContext } from "node:vm";

import knex from "knex";
import { transformWithOxc } from "vite";
import { afterEach, describe, expect, test, vi } from "vitest";

import { type MigrationColumn, type MigrationIndex, type MigrationSet } from "../../types/types";
import { generateAlterCode, generateCreateCode } from "../code-generation";
import { PostgreSQLSchemaReader } from "../postgresql-schema-reader";

type BuilderCall = { method: string; args: unknown[] };
type RawCall = { rawSql: string };
// 생성 코드가 호출하는 table builder 체인 대역 (모든 메서드가 다시 대역을 반환)
type TableBuilderStub = { [method: string]: (...args: unknown[]) => TableBuilderStub };
type KnexStub = {
  raw: (rawSql: string) => RawCall;
  schema: {
    createTable: (table: string, callback: (builder: TableBuilderStub) => void) => Promise<void>;
    alterTable: (table: string, callback: (builder: TableBuilderStub) => void) => Promise<void>;
    dropTable: (table: string) => Promise<void>;
  };
};
type MigrationFunction = (knex: KnexStub) => Promise<void>;
// 주입된 코드가 실행되면 vm 컨텍스트(globalThis)에 남기는 표식
type MigrationContext = { __son624Executed?: number };

function buildSet(
  columns: MigrationColumn[],
  indexes: MigrationIndex[] = [],
  table = "son624_codegen",
): MigrationSet {
  return {
    table,
    columns: [{ name: "id", type: "integer", nullable: false }, ...columns],
    indexes,
    foreigns: [],
  };
}

/**
 * 생성된 마이그레이션을 실제로 실행하되, knex 대신 호출을 기록하는 대역을 넘긴다.
 * 격리된 vm 컨텍스트에서 실행하므로 주입된 코드가 실행되면 컨텍스트에 표식이 남는다.
 */
async function runMigration(formatted: string | null, direction: "up" | "down" = "up") {
  if (formatted === null) {
    throw new Error("생성된 마이그레이션 코드가 없습니다.");
  }
  // 타입만 제거하고, export 선언은 스크립트 함수 선언으로 바꿔 vm에서 실행한다.
  const { code } = await transformWithOxc(formatted, "migration.ts", { lang: "ts" });
  const script = `${code.replace(/^export /gm, "")}\n({ up, down });`;

  const rawSqls: string[] = [];
  const builderCalls: BuilderCall[] = [];
  // 체인의 모든 메서드 호출을 기록하고 같은 대역을 돌려준다.
  const builder = new Proxy<TableBuilderStub>(
    {},
    {
      get:
        (_target, method) =>
        (...args: unknown[]) => {
          builderCalls.push({ method: String(method), args });
          return builder;
        },
    },
  );
  const runTableCallback = async (
    _table: string,
    callback: (builder: TableBuilderStub) => void,
  ) => {
    callback(builder);
  };
  const knexStub: KnexStub = {
    raw: (rawSql: string): RawCall => {
      rawSqls.push(rawSql);
      return { rawSql };
    },
    schema: {
      createTable: runTableCallback,
      alterTable: runTableCallback,
      dropTable: async () => {},
    },
  };

  const context: MigrationContext = {};
  const migration: Record<"up" | "down", MigrationFunction> = runInNewContext(script, context);
  await migration[direction](knexStub);

  return { rawSqls, builderCalls, executedMarker: context.__son624Executed };
}

function findDefaultToArgs(builderCalls: BuilderCall[]): unknown[][] {
  return builderCalls.filter((call) => call.method === "defaultTo").map((call) => call.args);
}

describe("마이그레이션 코드 생성 이스케이프 (SON-624)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("따옴표·백틱·${}가 든 문자열 dbDefault는 하나의 문자열 값으로만 쓰여야 한다", async () => {
    const value = 'it\'s "quoted" `tick` ${globalThis.__son624Executed = 1} \\ end';
    const [migration] = await generateCreateCode(
      buildSet([
        {
          name: "label",
          type: "string",
          length: 200,
          nullable: false,
          defaultTo: JSON.stringify(value),
        },
      ]),
    );

    const result = await runMigration(migration.formatted);

    expect(findDefaultToArgs(result.builderCalls)).toEqual([[value]]);
    expect(result.executedMarker).toBeUndefined();
  });

  test("따옴표·백틱·${}가 든 SQL dbDefault는 knex.raw의 SQL 문자열로만 쓰여야 한다", async () => {
    const sqlDefault = "'it''s' || '`' || '${globalThis.__son624Executed = 1}' || '\\'";
    const [migration] = await generateCreateCode(
      buildSet([{ name: "label", type: "string", nullable: false, defaultTo: sqlDefault }]),
    );

    const result = await runMigration(migration.formatted);

    expect(findDefaultToArgs(result.builderCalls)).toEqual([[{ rawSql: sqlDefault }]]);
    expect(result.executedMarker).toBeUndefined();
  });

  test("작은따옴표를 닫고 JS를 끼워 넣는 SQL dbDefault도 실행되지 않아야 한다", async () => {
    const sqlDefault = "0'), (globalThis.__son624Executed = 1), ('";
    const [migration] = await generateCreateCode(
      buildSet([{ name: "count", type: "integer", nullable: false, defaultTo: sqlDefault }]),
    );

    const result = await runMigration(migration.formatted);

    expect(findDefaultToArgs(result.builderCalls)).toEqual([[{ rawSql: sqlDefault }]]);
    expect(result.executedMarker).toBeUndefined();
  });

  test("이스케이프된 따옴표·JS 이스케이프가 든 문자열 리터럴 dbDefault는 값으로만 쓰여야 한다", async () => {
    const [migration] = await generateCreateCode(
      buildSet([
        {
          name: "escaped",
          type: "string",
          nullable: false,
          defaultTo: String.raw`"x\", (globalThis.__son624Executed = 1), \""`,
        },
        { name: "legacy_hex", type: "string", nullable: false, defaultTo: String.raw`"\x5b\x5d"` },
      ]),
    );

    const result = await runMigration(migration.formatted);

    expect(findDefaultToArgs(result.builderCalls)).toEqual([
      ['x", (globalThis.__son624Executed = 1), "'],
      ["[]"],
    ]);
    expect(result.executedMarker).toBeUndefined();
  });

  test("큰따옴표로 시작하지만 문자열 하나가 아닌 dbDefault는 생성을 거부해야 한다", async () => {
    const payload = '"x", (globalThis.__son624Executed = 1, {})';

    await expect(
      generateCreateCode(
        buildSet([{ name: "label", type: "string", nullable: true, defaultTo: payload }]),
      ),
    ).rejects.toThrow("하나의 문자열 리터럴이어야 합니다");
  });

  test("DB에서 읽은 기본값이 JS 식이 되는 경우에도 alter 코드 생성을 거부해야 한다", async () => {
    const entitySet = buildSet([
      { name: "label", type: "string", nullable: true, defaultTo: '"safe"' },
    ]);
    const dbSet = buildSet([
      {
        name: "label",
        type: "string",
        nullable: true,
        defaultTo: '"x", (globalThis.__son624Executed = 1), "',
      },
    ]);

    await expect(generateAlterCode(entitySet, dbSet)).rejects.toThrow(
      "하나의 문자열 리터럴이어야 합니다",
    );
  });

  test("generated expression의 ${}는 JS로 평가되지 않고 SQL 문자열로 남아야 한다", async () => {
    const expression = "length(name) + ${(globalThis.__son624Executed = 1, 0)} + length('`\\\\')";
    const [migration] = await generateCreateCode(
      buildSet([
        { name: "name", type: "string", nullable: false },
        {
          name: "name_length",
          type: "integer",
          nullable: false,
          generated: { type: "STORED", expression },
        },
      ]),
    );

    const result = await runMigration(migration.formatted);

    expect(result.rawSqls).toEqual([
      `ALTER TABLE "son624_codegen" ADD COLUMN "name_length" integer GENERATED ALWAYS AS (${expression}) STORED NOT NULL`,
    ]);
    expect(result.executedMarker).toBeUndefined();
  });

  test("index where의 ${}·백틱은 JS로 평가되지 않고 SQL 문자열로 남아야 한다", async () => {
    const where = "name <> '${(globalThis.__son624Executed = 1, \"x\")}' AND name <> '`'";
    const [migration] = await generateCreateCode(
      buildSet(
        [{ name: "name", type: "string", nullable: false }],
        [{ type: "index", name: "son624_codegen_name_index", columns: [{ name: "name" }], where }],
      ),
    );

    const result = await runMigration(migration.formatted);

    expect(result.rawSqls).toEqual([
      `CREATE INDEX son624_codegen_name_index ON son624_codegen (name) WHERE ${where};`,
    ]);
    expect(result.executedMarker).toBeUndefined();
  });

  test.each([
    {
      label: "dbDefault",
      set: buildSet([
        {
          name: "count",
          type: "integer",
          nullable: false,
          defaultTo: "0; create table gen06_sqli_default(id int)",
        },
      ]),
    },
    {
      label: "index where",
      set: buildSet(
        [{ name: "name", type: "string", nullable: false }],
        [
          {
            type: "index",
            name: "son624_codegen_name_index",
            columns: [{ name: "name" }],
            where: "id > 0; create table gen06_sqli_where(id int)",
          },
        ],
      ),
    },
    {
      label: "generated expression",
      set: buildSet([
        {
          name: "name_length",
          type: "integer",
          nullable: false,
          generated: { type: "STORED", expression: "1); create table gen06_sqli_expr(id int" },
        },
      ]),
    },
  ])("$label 값에 ';'로 SQL 문장을 이어 붙이면 생성을 거부해야 한다", async ({ set }) => {
    await expect(generateCreateCode(set)).rejects.toThrow("';'를 쓸 수 없습니다");
  });

  test("식별자 이름은 JS 문자열 값과 인용된 SQL 식별자로만 쓰여야 한다", async () => {
    const columnName = "x', (globalThis.__son624Executed = 1), 'y\"z";
    const indexName = 'bad name") ON other_table (id';
    const [migration] = await generateCreateCode(
      buildSet(
        [{ name: columnName, type: "string", length: 20, nullable: false }],
        [{ type: "index", name: indexName, columns: [{ name: columnName }] }],
      ),
    );

    const result = await runMigration(migration.formatted);

    expect(result.builderCalls).toContainEqual({ method: "string", args: [columnName, 20] });
    expect(result.rawSqls).toEqual([
      'CREATE INDEX "bad name"") ON other_table (id" ON son624_codegen ("x\', (globalThis.__son624Executed = 1), \'y""z");',
    ]);
    expect(result.executedMarker).toBeUndefined();
  });

  test("PK 타입 변경 주석에 DB 메타데이터의 줄바꿈이 들어가도 코드가 되지 않아야 한다", async () => {
    vi.spyOn(PostgreSQLSchemaReader, "getReferencingForeignKeys").mockResolvedValue([
      {
        tableName: "son624_child\nglobalThis.__son624Executed = 1 //",
        constraintName: "son624_child_parent_id_foreign",
        columnName: "parent_id",
        referencedTableName: "son624_codegen",
        referencedColumnName: "id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    ]);
    const compareDB = knex({ client: "pg" });
    const entitySet = buildSet([]);
    const dbSet = buildSet([]);
    entitySet.columns[0] = { name: "id", type: "string", length: 36, nullable: false };

    try {
      const [migration] = await generateAlterCode(entitySet, dbSet, compareDB);
      const result = await runMigration(migration.formatted);

      expect(result.executedMarker).toBeUndefined();
      expect(result.rawSqls).toContain(
        'ALTER TABLE "son624_child\nglobalThis.__son624Executed = 1 //" DROP CONSTRAINT "son624_child_parent_id_foreign"',
      );
    } finally {
      await compareDB.destroy();
    }
  });
});
