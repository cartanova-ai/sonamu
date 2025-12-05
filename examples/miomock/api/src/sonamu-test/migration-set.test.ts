import {
  EntityManager,
  getMigrationSetFromEntity,
  type PgColumn,
  PostgreSQLSchemaReader,
} from "sonamu";
import { beforeEach, describe, expect, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";
import {
  CompanyMigrationTestEntity,
  MigrationSetTestEntity,
  PostMigrationTestEntity,
  ProfileMigrationTestEntity,
  TagMigrationTestEntity,
} from "../testing/mock-entities";
import { mockEntityManagerGetMultiple } from "../testing/test-helpers";

bootstrap(vi);
describe("migration-set.ts", () => {
  beforeEach(() => {
    mockEntityManagerGetMultiple({
      MigrationSetTest: MigrationSetTestEntity(),
      Company: CompanyMigrationTestEntity(),
      Profile: ProfileMigrationTestEntity(),
      Tag: TagMigrationTestEntity(),
      Post: PostMigrationTestEntity(),
    });
  });

  describe("getMigrationSetFromEntity", () => {
    test("virtual과 HasMany 속성은 MigrationSet에서 제외되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      expect(result.columns.find((c) => c.name === "test_virtual_prop")).toBeUndefined();
      expect(result.columns.find((c) => c.name === "test_has_many_posts")).toBeUndefined();
      expect(result.columns.find((c) => c.name === "test_has_many_posts_id")).toBeUndefined();
    });

    test("기본 타입 컬럼들이 올바르게 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const stringCol = result.columns.find((c) => c.name === "test_string_col");
      expect(stringCol).toMatchObject({ type: "string", length: 255, nullable: false });

      const integerCol = result.columns.find((c) => c.name === "test_integer_nullable");
      expect(integerCol).toMatchObject({ type: "integer", nullable: true });

      const booleanCol = result.columns.find((c) => c.name === "test_boolean_col");
      expect(booleanCol).toMatchObject({ type: "boolean", nullable: false });

      const datetimeCol = result.columns.find((c) => c.name === "test_datetime_col");
      expect(datetimeCol).toMatchObject({ type: "date" });

      const jsonCol = result.columns.find((c) => c.name === "test_json_col");
      expect(jsonCol).toMatchObject({ type: "json" });
    });

    test("BelongsToOne 관계가 FK 컬럼과 제약조건으로 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const belongsToOneFK = result.columns.find(
        (c) => c.name === "test_belongs_to_one_company_id",
      );
      expect(belongsToOneFK).toMatchObject({ type: "integer", nullable: true });

      const belongsToOneFKRelation = result.foreigns.find((f) =>
        f.columns.includes("test_belongs_to_one_company_id"),
      );
      expect(belongsToOneFKRelation).toMatchObject({
        to: "companies.id",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    });

    test("OneToOne 관계가 올바르게 처리되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const oneToOneFK = result.columns.find((c) => c.name === "test_one_to_one_profile_id");
      expect(oneToOneFK).toMatchObject({ type: "integer", nullable: false });

      const oneToOneFKRelation = result.foreigns.find((f) =>
        f.columns.includes("test_one_to_one_profile_id"),
      );
      expect(oneToOneFKRelation).toMatchObject({
        to: "profiles.id",
        onUpdate: "RESTRICT",
        onDelete: "RESTRICT",
      });
    });

    test("ManyToMany 관계가 조인테이블로 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const manyToManyJoinTable = result.joinTables.find(
        (jt) => jt.table === "migration_set_tests__tags",
      );
      expect(manyToManyJoinTable).toBeDefined();
      expect(manyToManyJoinTable?.columns.map((c) => c.name)).toEqual(
        expect.arrayContaining(["id", "migration_set_test_id", "tag_id", "uuid"]),
      );
      expect(manyToManyJoinTable?.foreigns).toHaveLength(2);
    });

    test("UUID 컬럼과 유니크 인덱스가 자동 추가되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const autoUUIDCol = result.columns.find((c) => c.name === "uuid");
      expect(autoUUIDCol).toMatchObject({ type: "uuid", nullable: true });

      const uniqueUUIDIndex = result.indexes.find(
        (idx) => idx.type === "unique" && idx.columns.includes("uuid"),
      );
      expect(uniqueUUIDIndex).toBeDefined();
    });

    test("인덱스가 올바르게 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      expect(result.indexes).toEqual(
        expect.arrayContaining([
          { type: "index", columns: ["test_string_col"], name: "idx_test_string_col" },
          { type: "unique", columns: ["test_enum_status"], name: "uq_test_enum_status" },
          {
            type: "index",
            columns: ["test_string_col", "test_integer_nullable"],
            name: "idx_composite",
          },
        ]),
      );
    });

    test("전체 변환 결과가 스냅샷과 일치해야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      expect(result).toMatchSnapshot();
    });
  });

  describe("resolveDBColType", () => {
    test("uuid -> uuid", () => {
      const col = {
        udt_name: "uuid",
      } as PgColumn;

      const result = PostgreSQLSchemaReader.resolveDBColType(col);
      expect(result).toMatchObject({ type: "uuid" });
    });

    describe("Integer types", () => {
      test("int4 -> integer", () => {
        const col = {
          udt_name: "int4",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "integer" });
      });

      test("int8 -> bigInteger", () => {
        const col = {
          udt_name: "int8",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "bigInteger" });
      });
    });

    describe("String types", () => {
      test("character varying -> string", () => {
        const col = {
          data_type: "character varying",
          character_maximum_length: 100,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string", length: 100 });
      });

      test("text -> string", () => {
        const col = {
          data_type: "text",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string" });
      });

      test("varchar(255) -> string with length", () => {
        const col = {
          data_type: "character varying",
          character_maximum_length: 255,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string", length: 255 });
      });

      test("varchar(no length) -> string without length", () => {
        const col = {
          data_type: "character varying",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string" });
      });
    });

    describe("Numeric types", () => {
      test("numeric(10, 2) -> numberOrNumeric", () => {
        const col = {
          udt_name: "numeric",
          numeric_precision: 10,
          numeric_scale: 2,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({
          type: "numberOrNumeric",
          numberType: "numeric",
          precision: 10,
          scale: 2,
        });
      });

      test("numeric(no precision, no scale) -> numberOrNumeric", () => {
        const col = {
          udt_name: "numeric",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "numberOrNumeric", numberType: "numeric" });
      });

      test("float4 -> numberOrNumeric", () => {
        const col = {
          udt_name: "float4",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "numberOrNumeric", numberType: "real" });
      });

      test("float8 -> numberOrNumeric", () => {
        const col = {
          udt_name: "float8",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "numberOrNumeric", numberType: "double precision" });
      });
    });

    describe("Boolean types", () => {
      test("bool -> boolean", () => {
        const col = {
          udt_name: "bool",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "boolean" });
      });
    });

    describe("Date/Time types", () => {
      test("timestamptz -> date", () => {
        const col = {
          udt_name: "timestamptz",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "date" });
      });

      test("date -> date", () => {
        const col = {
          udt_name: "date",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "date" });
      });
    });

    describe("JSON types", () => {
      test("json -> json", () => {
        const col = {
          udt_name: "json",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "json" });
      });

      test("jsonb -> json", () => {
        const col = {
          udt_name: "jsonb",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "json" });
      });
    });

    test("unknown type -> error", () => {
      const col = {
        udt_name: "sonamu_type",
        data_type: "sonamu_type",
      } as PgColumn;

      const result = () => PostgreSQLSchemaReader.resolveDBColType(col);

      expect(result).toThrowError(
        "resolve 불가능한 PostgreSQL 컬럼 타입: sonamu_type (sonamu_type)",
      );
    });
  });
});
