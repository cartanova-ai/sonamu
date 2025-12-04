import { EntityManager, getMigrationSetFromEntity } from "sonamu";
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
      expect(datetimeCol).toMatchObject({ type: "timestamp" });

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
    // test.skip("MySQL의 컬럼 타입들을 표준 MigrationColumn 타입으로 정확히 변환", () => {
    //   // varchar
    //   expect(PostgreSQLSchemaReader.resolveDBColType("varchar(100)").toEqual({
    //     type: "string",
    //     length: 100,
    //   });
    //   // int unsigned
    //   expect(PostgreSQLSchemaReader.resolveDBColType("int unsigned", "age")).toEqual({
    //     type: "integer",
    //   });
    //   // tinyint(1)
    //   expect(PostgreSQLSchemaReader.resolveDBColType("tinyint(1)", "is_active")).toEqual({
    //     type: "boolean",
    //   });
    //   // tinyint unsigned
    //   expect(PostgreSQLSchemaReader.resolveDBColType("tinyint unsigned", "is_active")).toEqual({
    //     type: "boolean",
    //   });
    //   // longtext
    //   expect(PostgreSQLSchemaReader.resolveDBColType("longtext", "description")).toEqual({
    //     type: "longtext",
    //   });
    //   // datetime
    //   expect(PostgreSQLSchemaReader.resolveDBColType("datetime", "created_at")).toEqual({
    //     type: "datetime",
    //   });
    //   // decimal(12,2)
    //   expect(PostgreSQLSchemaReader.resolveDBColType("decimal(12,2)", "price")).toEqual({
    //     type: "decimal",
    //     precision: 12,
    //     scale: 2,
    //   });
    //   // char(36)
    //   expect(PostgreSQLSchemaReader.resolveDBColType("char(36)", "uuid")).toEqual({ type: "uuid" });
    //   // text
    //   expect(PostgreSQLSchemaReader.resolveDBColType("text", "any_field")).toEqual({ type: "text" });
    //   // mediumtext
    //   expect(PostgreSQLSchemaReader.resolveDBColType("mediumtext", "any_field")).toEqual({
    //     type: "mediumtext",
    //   });
    //   // timestamp
    //   expect(PostgreSQLSchemaReader.resolveDBColType("timestamp", "any_field")).toEqual({
    //     type: "timestamp",
    //   });
    //   // json
    //   expect(PostgreSQLSchemaReader.resolveDBColType("json", "any_field")).toEqual({ type: "json" });
    //   // date
    //   expect(PostgreSQLSchemaReader.resolveDBColType("date", "any_field")).toEqual({ type: "date" });
    //   // time
    //   expect(PostgreSQLSchemaReader.resolveDBColType("time", "any_field")).toEqual({ type: "time" });
    //   // float(8,4)
    //   expect(PostgreSQLSchemaReader.resolveDBColType("float(8,4)", "any_field")).toEqual({
    //     type: "float",
    //     precision: 8,
    //     scale: 4,
    //   });
    // });
    // test("알 수 없는 DB 컬럼 타입은 에러를 발생시켜야 한다", () => {
    //   // given & when
    //   const fn = () => PostgreSQLSchemaReader.resolveDBColType("unknown_type", "any_field");
    //   // then
    //   expect(fn).toThrow("resolve 불가능한 DB컬럼 타입 unknown_type unknown_type");
    // });
  });
});
