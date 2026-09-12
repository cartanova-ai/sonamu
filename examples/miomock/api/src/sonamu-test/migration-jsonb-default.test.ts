import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

import { type Knex } from "knex";
import {
  Entity,
  EntityJsonSchema,
  generateAlterCode,
  generateCreateCode,
  getMigrationSetFromEntity,
  PostgreSQLSchemaReader,
} from "sonamu";
import { type EntityJson, type MigrationSet } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, describe, expect, vi } from "vitest";

import { UserModel } from "../application/user/user.model";

bootstrap(vi);

const TABLE_NAMES = [
  "jsonb_default_empty_tests",
  "jsonb_default_alter_tests",
  "default_control_tests",
] as const;

type ExecutableMigration = {
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
};

type ExecutableMigrationModule = {
  exports: Partial<ExecutableMigration>;
};

function buildEntitySet(table: string, props: EntityJson["props"]): MigrationSet {
  return getMigrationSetFromEntity(
    new Entity({
      id: "JsonbDefaultTest",
      table,
      title: "JSONB 기본값 테스트",
      props: [{ name: "id", type: "integer" }, ...props],
      indexes: [],
      subsets: {},
      enums: {},
    }),
  );
}

function buildJsonSet(table: string, defaultTo: string, nullable = false): MigrationSet {
  return buildEntitySet(table, [
    { name: "payload", type: "json", id: "JsonbDefaultPayload", dbDefault: defaultTo, nullable },
  ]);
}

function buildSchemaValidatedJsonSet(
  table: string,
  defaultTo: string | number | boolean,
): MigrationSet {
  const parsed: unknown = EntityJsonSchema.parse({
    id: "JsonbScalarDefaultTest",
    table,
    title: "JSONB 스칼라 기본값 테스트",
    props: [
      { name: "id", type: "integer" },
      { name: "payload", type: "json", id: "JsonbScalarPayload", dbDefault: defaultTo },
    ],
    indexes: [],
    subsets: {},
    enums: {},
  });

  // SAFETY: EntityJsonSchema가 number/boolean dbDefault를 포함한 전체 엔티티를 검증했습니다.
  return getMigrationSetFromEntity(new Entity(parsed as EntityJson));
}

function loadExecutableMigration(formatted: string | null): ExecutableMigration {
  if (formatted === null) {
    throw new Error("실행할 마이그레이션 코드가 없습니다.");
  }

  const executableCode = `${stripTypeScriptTypes(formatted).replaceAll(
    "export async function",
    "async function",
  )}\nmodule.exports = { up, down };`;
  const migrationModule: ExecutableMigrationModule = { exports: {} };

  runInNewContext(executableCode, {
    exports: migrationModule.exports,
    module: migrationModule,
  });

  if (migrationModule.exports.up === undefined || migrationModule.exports.down === undefined) {
    throw new Error("생성된 마이그레이션에서 up/down 함수를 찾을 수 없습니다.");
  }

  return {
    up: migrationModule.exports.up,
    down: migrationModule.exports.down,
  };
}

async function generateExecutableCreate(entitySet: MigrationSet): Promise<ExecutableMigration> {
  const [createCode] = await generateCreateCode(entitySet);
  if (createCode === undefined) {
    throw new Error("create 마이그레이션 코드가 생성되지 않았습니다.");
  }
  return loadExecutableMigration(createCode.formatted);
}

describe("JSONB 빈 기본값 비교", () => {
  afterEach(async () => {
    const knex = UserModel.getPuri("w").knex;
    for (const tableName of TABLE_NAMES) {
      await knex.schema.dropTableIfExists(tableName);
    }
  });

  test("SQL quoted 빈 배열과 객체는 기존 DB reader 표현과 동일하게 비교되어야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[0];
      const entitySet = buildEntitySet(table, [
        { name: "array_plain", type: "json", id: "ArrayPlain", dbDefault: "'[]'" },
        { name: "object_plain", type: "json", id: "ObjectPlain", dbDefault: "'{}'" },
        { name: "array_cast", type: "json", id: "ArrayCast", dbDefault: "'[]'::jsonb" },
        { name: "object_cast", type: "json", id: "ObjectCast", dbDefault: "'{}'::jsonb" },
        { name: "array_spaced", type: "json", id: "ArraySpaced", dbDefault: "  '[]'  " },
        { name: "object_spaced", type: "json", id: "ObjectSpaced", dbDefault: "  '{}'  " },
      ]);
      const migration = await generateExecutableCreate(entitySet);

      await migration.up(isolatedKnex);
      await expect(
        isolatedKnex(table)
          .insert({})
          .returning([
            "array_plain",
            "object_plain",
            "array_cast",
            "object_cast",
            "array_spaced",
            "object_spaced",
          ]),
      ).resolves.toEqual([
        {
          array_plain: [],
          object_plain: {},
          array_cast: [],
          object_cast: {},
          array_spaced: [],
          object_spaced: {},
        },
      ]);

      const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(dbSet).not.toBeNull();
      if (dbSet === null) {
        throw new Error("생성한 JSONB 기본값 테이블을 introspection하지 못했습니다.");
      }

      expect(
        Object.fromEntries(
          dbSet.columns
            .filter((column) => column.name !== "id")
            .map((column) => [column.name, column.defaultTo]),
        ),
      ).toEqual({
        array_plain: '"[]"',
        object_plain: '"{}"',
        array_cast: '"[]"',
        object_cast: '"{}"',
        array_spaced: '"[]"',
        object_spaced: '"{}"',
      });
      await expect(generateAlterCode(entitySet, dbSet)).resolves.toEqual([]);
    });
  });

  test("빈 배열에서 빈 객체로 바뀌면 실행 가능한 up/down을 생성해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[1];
      const previousSet = buildJsonSet(table, "'[]'");
      const targetSet = buildJsonSet(table, "'{}'");
      const createMigration = await generateExecutableCreate(previousSet);
      await createMigration.up(isolatedKnex);

      const previousDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(previousDbSet).not.toBeNull();
      if (previousDbSet === null) {
        throw new Error("변경 전 JSONB 테이블을 introspection하지 못했습니다.");
      }
      const [alterCode] = await generateAlterCode(targetSet, previousDbSet);
      if (alterCode === undefined) {
        throw new Error("JSONB 기본값 alter 코드가 생성되지 않았습니다.");
      }
      const alterMigration = loadExecutableMigration(alterCode.formatted);

      await alterMigration.up(isolatedKnex);
      await expect(isolatedKnex(table).insert({}).returning("payload")).resolves.toEqual([
        { payload: {} },
      ]);
      const targetDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);

      await alterMigration.down(isolatedKnex);
      await expect(isolatedKnex(table).insert({}).returning("payload")).resolves.toEqual([
        { payload: [] },
      ]);
      const restoredDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);

      expect(targetDbSet).not.toBeNull();
      expect(restoredDbSet).not.toBeNull();
      if (targetDbSet === null || restoredDbSet === null) {
        throw new Error("변경된 JSONB 테이블을 introspection하지 못했습니다.");
      }
      await expect(generateAlterCode(targetSet, targetDbSet)).resolves.toEqual([]);
      await expect(generateAlterCode(previousSet, restoredDbSet)).resolves.toEqual([]);
    });
  });

  test.each([
    ["SQL NULL과 JSON null", "null", '"null"'],
    ["비어 있지 않은 quoted JSON", "'[1]'", '"[1]"'],
    ["raw SQL과 빈 배열", "jsonb_build_array()", '"[]"'],
    ["실제 빈 값 변경", "'[]'", '"{}"'],
  ] satisfies [string, string, string][])(
    "%s은 보수적으로 서로 다른 기본값으로 남겨야 한다",
    async (_caseName, entityDefault, dbDefault) => {
      const table = "jsonb_default_comparison_tests";
      const entitySet = buildJsonSet(table, entityDefault);
      const dbSet = buildJsonSet(table, dbDefault);

      await expect(generateAlterCode(entitySet, dbSet)).resolves.toHaveLength(1);
    },
  );

  test.each([
    ["boolean", false, false, true],
    ["number", 1, 1, 2],
  ] satisfies [string, boolean | number, boolean | number, boolean | number][])(
    "스키마가 허용한 JSON %s 기본값은 동일성과 실제 변경을 구분해야 한다",
    async (_caseName, entityDefault, sameDefault, changedDefault) => {
      const table = "jsonb_scalar_default_comparison_tests";
      const entitySet = buildSchemaValidatedJsonSet(table, entityDefault);
      const sameSet = buildSchemaValidatedJsonSet(table, sameDefault);
      const changedSet = buildSchemaValidatedJsonSet(table, changedDefault);
      const entitySetBefore = structuredClone(entitySet);
      const changedSetBefore = structuredClone(changedSet);

      await expect(generateAlterCode(entitySet, sameSet)).resolves.toEqual([]);
      const alterCodes = await generateAlterCode(entitySet, changedSet);

      expect(alterCodes).toHaveLength(1);
      expect(alterCodes[0]?.formatted).toContain(`knex.raw("${String(entityDefault)}")`);
      expect(alterCodes[0]?.formatted).toContain(`knex.raw("${String(changedDefault)}")`);
      expect(entitySet).toEqual(entitySetBefore);
      expect(changedSet).toEqual(changedSetBefore);
    },
  );

  test("기존 JavaScript hex escape와 bare null 기본값의 생성 동작을 유지해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[2];
      const entitySet = buildEntitySet(table, [
        {
          name: "legacy_hex",
          type: "json",
          id: "LegacyHexPayload",
          dbDefault: String.raw`"\x5b\x5d"`,
        },
        {
          name: "nullable_payload",
          type: "json",
          id: "NullablePayload",
          dbDefault: "null",
          nullable: true,
        },
      ]);
      const migration = await generateExecutableCreate(entitySet);

      await migration.up(isolatedKnex);
      await expect(
        isolatedKnex(table).insert({}).returning(["legacy_hex", "nullable_payload"]),
      ).resolves.toEqual([{ legacy_hex: [], nullable_payload: null }]);
      await expect(
        isolatedKnex.raw<{ rows: { is_sql_null: boolean }[] }>(
          `SELECT nullable_payload IS NULL AS is_sql_null FROM ${table}`,
        ),
      ).resolves.toMatchObject({ rows: [{ is_sql_null: true }] });
    });
  });

  test("nullable 변경 생성은 기본값 비교와 입력 객체를 보존해야 한다", async () => {
    const table = "jsonb_default_nullable_tests";
    const entitySet = buildJsonSet(table, "'[]'", true);
    const dbSet = buildJsonSet(table, '"[]"', false);
    const entitySetBefore = structuredClone(entitySet);
    const dbSetBefore = structuredClone(dbSet);

    const alterCodes = await generateAlterCode(entitySet, dbSet);

    expect(alterCodes).toHaveLength(1);
    expect(alterCodes[0]?.formatted).toContain('.jsonb("payload").nullable()');
    expect(entitySet).toEqual(entitySetBefore);
    expect(dbSet).toEqual(dbSetBefore);
  });

  test("다른 컬럼만 바뀐 혼합 diff에서 동등한 JSONB 컬럼은 alter 코드에서 제외해야 한다", async () => {
    const table = "jsonb_default_mixed_column_tests";
    const entitySet = buildEntitySet(table, [
      { name: "payload", type: "json", id: "MixedPayload", dbDefault: "'[]'" },
      { name: "label", type: "string", length: 128 },
    ]);
    const dbSet = buildEntitySet(table, [
      { name: "payload", type: "json", id: "MixedPayload", dbDefault: '"[]"' },
      { name: "label", type: "string", length: 64 },
    ]);
    const entitySetBefore = structuredClone(entitySet);
    const dbSetBefore = structuredClone(dbSet);

    const alterCodes = await generateAlterCode(entitySet, dbSet);

    expect(alterCodes).toHaveLength(1);
    expect(alterCodes[0]?.formatted).toContain('.string("label", 128)');
    expect(alterCodes[0]?.formatted).not.toContain('.jsonb("payload")');
    expect(entitySet).toEqual(entitySetBefore);
    expect(dbSet).toEqual(dbSetBefore);
  });
});
