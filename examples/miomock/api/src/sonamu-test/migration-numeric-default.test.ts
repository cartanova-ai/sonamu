import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

import { type Knex } from "knex";
import {
  Entity,
  generateAlterCode,
  generateCreateCode,
  getMigrationSetFromEntity,
  PostgreSQLSchemaReader,
} from "sonamu";
import { type EntityJson, type MigrationColumn, type MigrationSet } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, describe, expect, vi } from "vitest";

import { UserModel } from "../application/user/user.model";

bootstrap(vi);

const TABLE_NAMES = [
  "numeric_array_default_tests",
  "numeric_array_generated_tests",
  "numeric_array_alter_tests",
  "numeric_typmod_reader_tests",
  "numeric_array_constrained_alter_tests",
  "numeric_array_partial_metadata_tests",
] as const;

const AUXILIARY_SCHEMA = "sonamu_numeric_reader_aux";

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
      id: "NumericDefaultTest",
      table,
      title: "Numeric 기본 메타데이터 테스트",
      props: [{ name: "id", type: "integer" }, ...props],
      indexes: [],
      subsets: {},
      enums: {},
    }),
  );
}

function getColumn(migrationSet: MigrationSet, name: string): MigrationColumn {
  const column = migrationSet.columns.find((candidate) => candidate.name === name);
  if (column === undefined) {
    throw new Error(`${name} 컬럼을 찾지 못했습니다.`);
  }
  return column;
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

describe("Numeric 기본 precision/scale", () => {
  afterEach(async () => {
    const knex = UserModel.getPuri("w").knex;
    for (const tableName of TABLE_NAMES) {
      await knex.schema.dropTableIfExists(tableName);
    }
  });

  test("생략한 number[]와 numeric[]은 유효한 create를 만들고 introspection 후 반복 diff가 없어야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[1];
      const entitySet = buildEntitySet(table, [
        { name: "number_values", type: "number[]" },
        { name: "numeric_values", type: "numeric[]" },
        { name: "constrained_values", type: "numeric[]", precision: 12, scale: 3 },
      ]);
      const [createCode] = await generateCreateCode(entitySet);

      expect(createCode).toBeDefined();
      expect(createCode?.formatted).toContain('.specificType("number_values", "numeric[]")');
      expect(createCode?.formatted).toContain('.specificType("numeric_values", "numeric[]")');
      expect(createCode?.formatted).toContain(
        '.specificType("constrained_values", "numeric(12, 3)[]")',
      );
      expect(createCode?.formatted).not.toContain("undefined");

      const migration = await generateExecutableCreate(entitySet);
      await migration.up(isolatedKnex);
      await isolatedKnex.raw(
        `INSERT INTO ${table} (number_values, numeric_values, constrained_values)
         VALUES (ARRAY[1.234]::numeric[], ARRAY[2.345]::numeric[], ARRAY[3.456]::numeric(12, 3)[])`,
      );

      const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(dbSet).not.toBeNull();
      if (dbSet === null) {
        throw new Error("생성한 numeric[] 테이블을 introspection하지 못했습니다.");
      }
      expect(getColumn(dbSet, "constrained_values")).toEqual({
        name: "constrained_values",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 12,
        scale: 3,
        nullable: false,
      });
      await expect(generateAlterCode(entitySet, dbSet)).resolves.toEqual([]);
      await expect(
        isolatedKnex.raw<{
          rows: { number_value: string; numeric_value: string; constrained_value: string }[];
        }>(
          `SELECT number_values[1]::text AS number_value,
                  numeric_values[1]::text AS numeric_value,
                  constrained_values[1]::text AS constrained_value
           FROM ${table}`,
        ),
      ).resolves.toMatchObject({
        rows: [{ number_value: "1.234", numeric_value: "2.345", constrained_value: "3.456" }],
      });
    });
  });

  test("PostgreSQL reader는 numeric과 varchar 배열 typmod를 단일 및 전체 조회에서 동일하게 복원해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    const table = TABLE_NAMES[3];

    try {
      await knex.raw(`CREATE SCHEMA ${AUXILIARY_SCHEMA}`);
      await knex.raw(`
        CREATE TABLE ${table} (
          id serial PRIMARY KEY,
          numeric_array numeric[] NOT NULL,
          constrained_array numeric(12, 3)[] NOT NULL,
          zero_scale_array numeric(9, 0)[] NOT NULL,
          negative_scale_array numeric(6, -2)[] NOT NULL,
          precision_only_array numeric(7)[] NOT NULL,
          constrained_scalar numeric(11, 4) NOT NULL,
          zero_scale_scalar numeric(9, 0) NOT NULL,
          negative_scale_scalar numeric(6, -2) NOT NULL,
          constrained_varchar_array varchar(17)[] NOT NULL,
          varchar_array varchar[] NOT NULL
        )
      `);
      await knex.raw(`
        CREATE TABLE ${AUXILIARY_SCHEMA}.${table} (
          id serial PRIMARY KEY,
          auxiliary_only numeric(31, 9)[] NOT NULL
        )
      `);

      const singleSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(knex, table);
      const allSet = (await PostgreSQLSchemaReader.getMigrationSetFromDBAll(knex)).get(table);

      expect(singleSet).not.toBeNull();
      expect(allSet).toBeDefined();
      if (singleSet === null || allSet === undefined) {
        throw new Error("numeric typmod 테이블을 introspection하지 못했습니다.");
      }
      expect(allSet).toEqual(singleSet);
      expect(singleSet.columns.some((column) => column.name === "auxiliary_only")).toBe(false);
      expect(getColumn(singleSet, "numeric_array")).toEqual({
        name: "numeric_array",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        nullable: false,
      });
      for (const [name, precision, scale] of [
        ["constrained_array", 12, 3],
        ["zero_scale_array", 9, 0],
        ["negative_scale_array", 6, -2],
        ["precision_only_array", 7, 0],
      ] satisfies [string, number, number][]) {
        expect(getColumn(singleSet, name)).toEqual({
          name,
          type: "numberOrNumeric[]",
          numberType: "numeric",
          precision,
          scale,
          nullable: false,
        });
      }
      for (const [name, precision, scale] of [
        ["constrained_scalar", 11, 4],
        ["zero_scale_scalar", 9, 0],
        ["negative_scale_scalar", 6, -2],
      ] satisfies [string, number, number][]) {
        expect(getColumn(singleSet, name)).toEqual({
          name,
          type: "numberOrNumeric",
          numberType: "numeric",
          precision,
          scale,
          nullable: false,
        });
      }
      expect(getColumn(singleSet, "constrained_varchar_array")).toEqual({
        name: "constrained_varchar_array",
        type: "string[]",
        length: 17,
        nullable: false,
      });
      expect(getColumn(singleSet, "varchar_array")).toEqual({
        name: "varchar_array",
        type: "string[]",
        nullable: false,
      });
    } finally {
      await knex.raw(`DROP SCHEMA IF EXISTS ${AUXILIARY_SCHEMA} CASCADE`);
    }
  });

  test("numeric 배열의 생략 및 부분 metadata는 undefined 없는 유효한 타입을 생성해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[5];
      const entitySet = buildEntitySet(table, [
        { name: "no_metadata", type: "number[]" },
        { name: "precision_only", type: "number[]", precision: 12 },
        { name: "scale_only", type: "numeric[]", scale: 4 },
      ]);
      const [createCode] = await generateCreateCode(entitySet);

      expect(createCode).toBeDefined();
      expect(createCode?.formatted).toContain('.specificType("no_metadata", "numeric[]")');
      expect(createCode?.formatted).toContain(
        '.specificType("precision_only", "numeric(12, 2)[]")',
      );
      expect(createCode?.formatted).toContain('.specificType("scale_only", "numeric(8, 4)[]")');
      expect(createCode?.formatted).not.toContain("undefined");

      const migration = await generateExecutableCreate(entitySet);
      await migration.up(isolatedKnex);
      const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);

      expect(dbSet).not.toBeNull();
      if (dbSet === null) {
        throw new Error("부분 metadata numeric[] 테이블을 introspection하지 못했습니다.");
      }
      expect(getColumn(dbSet, "precision_only")).toEqual({
        name: "precision_only",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 12,
        scale: 2,
        nullable: false,
      });
      expect(getColumn(dbSet, "scale_only")).toEqual({
        name: "scale_only",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 8,
        scale: 4,
        nullable: false,
      });
      await expect(generateAlterCode(entitySet, dbSet)).resolves.toEqual([]);
    });
  });

  test("numeric scalar만 생략된 precision/scale을 8,2로 보완해야 한다", () => {
    const migrationSet = buildEntitySet("numeric_default_metadata_tests", [
      { name: "number_scalar", type: "number" },
      { name: "numeric_scalar", type: "numeric" },
      { name: "number_array", type: "number[]" },
      { name: "numeric_array", type: "numeric[]" },
      { name: "number_explicit", type: "number", precision: 12, scale: 4 },
      { name: "numeric_explicit", type: "numeric", precision: 14, scale: 5 },
      { name: "number_array_explicit", type: "number[]", precision: 16, scale: 6 },
      { name: "numeric_array_explicit", type: "numeric[]", precision: 18, scale: 7 },
      { name: "real_scalar", type: "number", numberType: "real" },
      { name: "double_scalar", type: "number", numberType: "double precision" },
      { name: "real_array", type: "number[]", numberType: "real" },
      { name: "double_array", type: "number[]", numberType: "double precision" },
    ]);

    expect(getColumn(migrationSet, "number_scalar")).toMatchObject({
      type: "numberOrNumeric",
      numberType: "numeric",
      precision: 8,
      scale: 2,
    });
    expect(getColumn(migrationSet, "numeric_scalar")).toMatchObject({
      type: "numberOrNumeric",
      numberType: "numeric",
      precision: 8,
      scale: 2,
    });

    for (const name of ["number_array", "numeric_array"]) {
      const column = getColumn(migrationSet, name);
      expect(column).toMatchObject({ type: "numberOrNumeric[]", numberType: "numeric" });
      expect(column.precision).toBeUndefined();
      expect(column.scale).toBeUndefined();
    }

    expect(getColumn(migrationSet, "number_explicit")).toMatchObject({
      precision: 12,
      scale: 4,
    });
    expect(getColumn(migrationSet, "numeric_explicit")).toMatchObject({
      precision: 14,
      scale: 5,
    });
    expect(getColumn(migrationSet, "number_array_explicit")).toMatchObject({
      precision: 16,
      scale: 6,
    });
    expect(getColumn(migrationSet, "numeric_array_explicit")).toMatchObject({
      precision: 18,
      scale: 7,
    });

    for (const [name, numberType] of [
      ["real_scalar", "real"],
      ["real_array", "real"],
      ["double_scalar", "double precision"],
      ["double_array", "double precision"],
    ] satisfies [string, "real" | "double precision"][]) {
      const column = getColumn(migrationSet, name);
      expect(column.numberType).toBe(numberType);
      expect(column.precision).toBeUndefined();
      expect(column.scale).toBeUndefined();
    }
  });

  test("unconstrained numeric[]은 두 entity 배열 타입 모두 no-op이고 기존 소수를 보존해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[0];
      await isolatedKnex.raw(`
        CREATE TABLE ${table} (
          id serial PRIMARY KEY,
          amounts numeric[] NOT NULL
        )
      `);
      await isolatedKnex.raw(`INSERT INTO ${table} (amounts) VALUES (ARRAY[1.234]::numeric[])`);

      const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(dbSet).not.toBeNull();
      if (dbSet === null) {
        throw new Error("numeric[] 테이블을 introspection하지 못했습니다.");
      }
      expect(getColumn(dbSet, "amounts")).toMatchObject({
        type: "numberOrNumeric[]",
        numberType: "numeric",
      });
      expect(getColumn(dbSet, "amounts").precision).toBeUndefined();
      expect(getColumn(dbSet, "amounts").scale).toBeUndefined();

      const numberArraySet = buildEntitySet(table, [{ name: "amounts", type: "number[]" }]);
      const numericArraySet = buildEntitySet(table, [{ name: "amounts", type: "numeric[]" }]);
      const [numberDiff, numericDiff] = await Promise.all([
        generateAlterCode(numberArraySet, dbSet),
        generateAlterCode(numericArraySet, dbSet),
      ]);

      expect(numberDiff).toEqual([]);
      expect(numericDiff).toEqual([]);
      await expect(
        isolatedKnex.raw<{ rows: { amount: string }[] }>(
          `SELECT amounts[1]::text AS amount FROM ${table}`,
        ),
      ).resolves.toMatchObject({ rows: [{ amount: "1.234" }] });
    });
  });

  test("unconstrained numeric[]의 explicit metadata alter up/down은 타입과 기존 값을 보존해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[2];
      await isolatedKnex.raw(`
        CREATE TABLE ${table} (
          id serial PRIMARY KEY,
          amounts numeric[] NOT NULL
        )
      `);
      await isolatedKnex.raw(`INSERT INTO ${table} (amounts) VALUES (ARRAY[1.234]::numeric[])`);

      const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(dbSet).not.toBeNull();
      if (dbSet === null) {
        throw new Error("alter 전 numeric[] 테이블을 introspection하지 못했습니다.");
      }
      const sourceSet = buildEntitySet(table, [{ name: "amounts", type: "numeric[]" }]);
      const targetSet = buildEntitySet(table, [
        { name: "amounts", type: "numeric[]", precision: 12, scale: 3 },
      ]);
      const [alterCode] = await generateAlterCode(targetSet, dbSet);

      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain('.specificType("amounts", "numeric(12, 3)[]")');
      expect(alterCode?.formatted).toContain('.specificType("amounts", "numeric[]")');
      expect(alterCode?.formatted).not.toContain("undefined");
      if (alterCode === undefined) {
        throw new Error("numeric[] alter 코드가 생성되지 않았습니다.");
      }
      const migration = loadExecutableMigration(alterCode.formatted);

      await migration.up(isolatedKnex);
      const targetDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(targetDbSet).not.toBeNull();
      if (targetDbSet === null) {
        throw new Error("alter 후 constrained numeric[] 테이블을 introspection하지 못했습니다.");
      }
      expect(getColumn(targetDbSet, "amounts")).toEqual({
        name: "amounts",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 12,
        scale: 3,
        nullable: false,
      });
      await expect(generateAlterCode(targetSet, targetDbSet)).resolves.toEqual([]);
      await expect(
        isolatedKnex.raw<{ rows: { data_type: string; amount: string }[] }>(`
          SELECT format_type(a.atttypid, a.atttypmod) AS data_type, t.amounts[1]::text AS amount
          FROM pg_attribute a
          CROSS JOIN ${table} t
          WHERE a.attrelid = '${table}'::regclass AND a.attname = 'amounts'
        `),
      ).resolves.toMatchObject({ rows: [{ data_type: "numeric(12,3)[]", amount: "1.234" }] });

      await migration.down(isolatedKnex);
      const restoredDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(restoredDbSet).not.toBeNull();
      if (restoredDbSet === null) {
        throw new Error("down 후 unconstrained numeric[] 테이블을 introspection하지 못했습니다.");
      }
      expect(getColumn(restoredDbSet, "amounts")).toEqual({
        name: "amounts",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        nullable: false,
      });
      await expect(generateAlterCode(sourceSet, restoredDbSet)).resolves.toEqual([]);
      await expect(
        isolatedKnex.raw<{ rows: { data_type: string; amount: string }[] }>(`
          SELECT format_type(a.atttypid, a.atttypmod) AS data_type, t.amounts[1]::text AS amount
          FROM pg_attribute a
          CROSS JOIN ${table} t
          WHERE a.attrelid = '${table}'::regclass AND a.attname = 'amounts'
        `),
      ).resolves.toMatchObject({ rows: [{ data_type: "numeric[]", amount: "1.234" }] });
    });
  });

  test("constrained numeric[] alter의 down은 원래 precision과 scale을 정확히 복원해야 한다", async () => {
    const knex = UserModel.getPuri("w").knex;
    await knex.transaction(async (isolatedKnex) => {
      const table = TABLE_NAMES[4];
      await isolatedKnex.raw(`
        CREATE TABLE ${table} (
          id serial PRIMARY KEY,
          amounts numeric(10, 4)[] NOT NULL
        )
      `);
      await isolatedKnex.raw(
        `INSERT INTO ${table} (amounts) VALUES (ARRAY[1200.0000]::numeric(10, 4)[])`,
      );

      const sourceDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(sourceDbSet).not.toBeNull();
      if (sourceDbSet === null) {
        throw new Error("constrained numeric[] 원본을 introspection하지 못했습니다.");
      }
      expect(getColumn(sourceDbSet, "amounts")).toEqual({
        name: "amounts",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 10,
        scale: 4,
        nullable: false,
      });
      const sourceSet = buildEntitySet(table, [
        { name: "amounts", type: "numeric[]", precision: 10, scale: 4 },
      ]);
      const targetSet = buildEntitySet(table, [
        { name: "amounts", type: "numeric[]", precision: 12, scale: -2 },
      ]);
      const [alterCode] = await generateAlterCode(targetSet, sourceDbSet);

      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain('.specificType("amounts", "numeric(12, -2)[]")');
      expect(alterCode?.formatted).toContain('.specificType("amounts", "numeric(10, 4)[]")');
      if (alterCode === undefined) {
        throw new Error("constrained numeric[] alter 코드가 생성되지 않았습니다.");
      }
      const migration = loadExecutableMigration(alterCode.formatted);

      await migration.up(isolatedKnex);
      const targetDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(targetDbSet).not.toBeNull();
      if (targetDbSet === null) {
        throw new Error("negative scale numeric[]을 introspection하지 못했습니다.");
      }
      expect(getColumn(targetDbSet, "amounts")).toEqual({
        name: "amounts",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 12,
        scale: -2,
        nullable: false,
      });
      await expect(generateAlterCode(targetSet, targetDbSet)).resolves.toEqual([]);
      await expect(
        isolatedKnex.raw<{ rows: { amount: string }[] }>(
          `SELECT amounts[1]::text AS amount FROM ${table}`,
        ),
      ).resolves.toMatchObject({ rows: [{ amount: "1200" }] });

      await migration.down(isolatedKnex);
      const restoredDbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(isolatedKnex, table);
      expect(restoredDbSet).not.toBeNull();
      if (restoredDbSet === null) {
        throw new Error("원래 constrained numeric[]을 introspection하지 못했습니다.");
      }
      expect(getColumn(restoredDbSet, "amounts")).toEqual({
        name: "amounts",
        type: "numberOrNumeric[]",
        numberType: "numeric",
        precision: 10,
        scale: 4,
        nullable: false,
      });
      await expect(generateAlterCode(sourceSet, restoredDbSet)).resolves.toEqual([]);
      await expect(
        isolatedKnex.raw<{ rows: { amount: string }[] }>(
          `SELECT amounts[1]::text AS amount FROM ${table}`,
        ),
      ).resolves.toMatchObject({ rows: [{ amount: "1200.0000" }] });
    });
  });

  test("명시한 numeric metadata 변경은 실제 alter로 감지해야 한다", async () => {
    const table = "numeric_explicit_change_tests";
    const currentSet = buildEntitySet(table, [
      { name: "scalar_value", type: "numeric", precision: 10, scale: 2 },
      { name: "array_value", type: "number[]", precision: 12, scale: 3 },
    ]);
    const targetSet = buildEntitySet(table, [
      { name: "scalar_value", type: "numeric", precision: 11, scale: 4 },
      { name: "array_value", type: "number[]", precision: 13, scale: 5 },
    ]);

    const alterCodes = await generateAlterCode(targetSet, currentSet);

    expect(alterCodes).toHaveLength(1);
    expect(alterCodes[0]?.formatted).toContain('.decimal("scalar_value", 11, 4)');
    expect(alterCodes[0]?.formatted).toContain('"numeric(13, 5)[]"');
    expect(alterCodes[0]?.formatted).toContain('.decimal("scalar_value", 10, 2)');
    expect(alterCodes[0]?.formatted).toContain('"numeric(12, 3)[]"');
  });
});
