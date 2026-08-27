import { type Knex } from "knex";
import {
  EntityManager,
  generateAlterCode,
  getAlterIndexesTo,
  getMigrationSetFromEntity,
  PostgreSQLSchemaReader,
  setMigrationIndexDefaults,
} from "sonamu";
import { type MigrationIndex, type MigrationSet, type PgColumn } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { UserModel } from "../application/user/user.model";
import {
  CompanyMigrationTestEntity,
  MigrationSetTestEntity,
  PostMigrationTestEntity,
  ProfileMigrationTestEntity,
  TagMigrationTestEntity,
} from "../testing/mock-entities";
import { mockEntityManagerGetMultiple } from "../testing/test-helpers";

bootstrap(vi);

const createCompareDB = (rows: unknown[] = []) =>
  ({
    raw: vi.fn().mockResolvedValue({ rows }),
  }) satisfies Pick<Knex, "raw">;

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
        expect.arrayContaining(["id", "migration_set_test_id", "tag_id"]),
      );
      expect(manyToManyJoinTable?.foreigns).toHaveLength(2);
    });

    test("FIXED: 2025-12-09 UUID 컬럼과 유니크 인덱스가 자동 추가되지 않아야 한다.", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const autoUUIDCol = result.columns.find((c) => c.name === "uuid");
      expect(autoUUIDCol).toBeUndefined();

      const uniqueUUIDIndex = result.indexes.find(
        (idx) => idx.type === "unique" && idx.columns.find((c) => c.name === "uuid"),
      );
      expect(uniqueUUIDIndex).toBeUndefined();
    });

    test("인덱스가 올바르게 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("MigrationSetTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      expect(result.indexes).toEqual(
        expect.arrayContaining([
          { type: "index", columns: [{ name: "test_string_col" }], name: "idx_test_string_col" },
          { type: "unique", columns: [{ name: "test_enum_status" }], name: "uq_test_enum_status" },
          {
            type: "index",
            columns: [{ name: "test_string_col" }, { name: "test_integer_nullable" }],
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
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const col = {
        udt_name: "uuid",
      } as PgColumn;

      const result = PostgreSQLSchemaReader.resolveDBColType(col);
      expect(result).toMatchObject({ type: "uuid" });
    });

    describe("Integer types", () => {
      test("int4 -> integer", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "int4",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "integer" });
      });

      test("int8 -> bigInteger", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "int8",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "bigInteger" });
      });
    });

    describe("String types", () => {
      test("character varying -> string", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "varchar",
          character_maximum_length: 100,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string", length: 100 });
      });

      test("text -> string", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "text",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string" });
      });

      test("varchar(255) -> string with length", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "varchar",
          character_maximum_length: 255,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string", length: 255 });
      });

      test("varchar(no length) -> string without length", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "varchar",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string" });
      });
    });

    describe("Array types", () => {
      test("_varchar(500) -> string[] with length", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "_varchar",
          character_maximum_length: 500,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string[]", length: 500 });
      });

      test("_varchar(no length) -> string[] without length", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "_varchar",
          character_maximum_length: null,
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string[]" });
        expect(result).not.toHaveProperty("length");
      });

      test("_text -> string[] without length", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "_text",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "string[]" });
        expect(result).not.toHaveProperty("length");
      });

      test("_int4 -> integer[]", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "_int4",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "integer[]" });
      });

      test("_bool -> boolean[]", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "_bool",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "boolean[]" });
      });
    });

    describe("Numeric types", () => {
      test("numeric(10, 2) -> numberOrNumeric", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "numeric",
          precision: 10,
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
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "numeric",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "numberOrNumeric", numberType: "numeric" });
      });

      test("float4 -> numberOrNumeric", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "float4",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "numberOrNumeric", numberType: "real" });
      });

      test("float8 -> numberOrNumeric", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "float8",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "numberOrNumeric", numberType: "double precision" });
      });
    });

    describe("Boolean types", () => {
      test("bool -> boolean", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "bool",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "boolean" });
      });
    });

    describe("Date/Time types", () => {
      test("timestamptz -> date", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "timestamptz",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "date" });
      });
    });

    describe("JSON types", () => {
      test("json -> json", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "json",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "json" });
      });

      test("jsonb -> json", () => {
        // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
        const col = {
          udt_name: "jsonb",
        } as PgColumn;

        const result = PostgreSQLSchemaReader.resolveDBColType(col);
        expect(result).toMatchObject({ type: "json" });
      });
    });

    test("unknown type -> error", () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const col = {
        udt_name: "sonamu_type",
      } as PgColumn;

      const result = () => PostgreSQLSchemaReader.resolveDBColType(col);

      expect(result).toThrowError("resolve 불가능한 PostgreSQL 컬럼 타입: sonamu_type");
    });
  });

  describe("PostgreSQLSchemaReader - 기존 테이블 검증", () => {
    test("projects 테이블의 GIN 인덱스는 sortOrder/nullsFirst가 없어야 한다", async () => {
      const rdb = UserModel.getPuri("r");
      // when: 이미 존재하는 projects 테이블 읽기
      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(rdb.knex, "projects");

      // then: GIN 인덱스 확인
      const ginIndex = migrationSet?.indexes.find(
        (idx) => idx.name === "projects_textsearchable_index_col_index",
      );

      expect(ginIndex?.using).toBe("gin");
      ginIndex?.columns.forEach((col) => {
        expect(col).not.toHaveProperty("sortOrder");
        expect(col).not.toHaveProperty("nullsFirst");
      });
    });

    test("users 테이블의 BTREE 인덱스는 sortOrder/nullsFirst가 있어야 한다", async () => {
      const rdb = UserModel.getPuri("r");
      // when: users 테이블 읽기
      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(rdb.knex, "users");

      // then: BTREE 인덱스 확인 (email 인덱스가 있다면)
      const btreeIndex = migrationSet?.indexes.find((idx) => idx.using === "btree" || !idx.using);

      if (btreeIndex) {
        btreeIndex.columns.forEach((col) => {
          expect(col).toHaveProperty("sortOrder");
          expect(col).toHaveProperty("nullsFirst");
        });
      }
    });

    test("PGroonga 인덱스는 sortOrder/nullsFirst가 없어야 한다", async () => {
      const rdb = UserModel.getPuri("r");
      // when
      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(rdb.knex, "users");

      // then: PGroonga 인덱스 확인
      const pgroongaIndex = migrationSet?.indexes.find((idx) => idx.using === "pgroonga");

      if (pgroongaIndex) {
        pgroongaIndex.columns.forEach((col) => {
          expect(col).not.toHaveProperty("sortOrder");
          expect(col).not.toHaveProperty("nullsFirst");
        });
      }
    });
  });

  describe("PostgreSQLSchemaReader - partial index roundtrip", () => {
    const tableName = "partial_index_roundtrip_tests";

    afterEach(async () => {
      const wdb = UserModel.getPuri("w").knex;
      await wdb.raw(`DROP TABLE IF EXISTS ${tableName}`);
    });

    test("실제 partial unique index를 introspection한 뒤 migration diff가 no-op이어야 한다", async () => {
      const wdb = UserModel.getPuri("w").knex;
      await wdb.raw(`DROP TABLE IF EXISTS ${tableName}`);
      await wdb.raw(`
        CREATE TABLE ${tableName} (
          id integer NOT NULL,
          email text NOT NULL,
          deleted_at timestamptz(3) NULL
        )
      `);
      await wdb.raw(`
        CREATE UNIQUE INDEX partial_index_roundtrip_email_active_unique
        ON ${tableName} USING btree(email ASC NULLS LAST)
        NULLS NOT DISTINCT
        WHERE deleted_at IS NULL
      `);

      const entitySet: MigrationSet = {
        table: tableName,
        columns: [
          { name: "id", type: "integer", nullable: false },
          { name: "email", type: "string", nullable: false },
          { name: "deleted_at", type: "date", nullable: true },
        ],
        indexes: [
          {
            type: "unique",
            name: "partial_index_roundtrip_email_active_unique",
            using: "btree",
            columns: [{ name: "email", sortOrder: "ASC", nullsFirst: false }],
            nullsNotDistinct: true,
            where: "deleted_at IS NULL",
          },
        ],
        foreigns: [],
      };

      const dbSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(wdb, tableName);

      expect(dbSet).not.toBeNull();
      if (dbSet === null) {
        throw new Error("partial index roundtrip table was not introspected");
      }

      expect(dbSet?.indexes[0]).toMatchObject({
        type: "unique",
        name: "partial_index_roundtrip_email_active_unique",
        using: "btree",
        nullsNotDistinct: true,
        columns: [{ name: "email", sortOrder: "ASC", nullsFirst: false }],
        where: "(deleted_at IS NULL)",
      });
      expect(getAlterIndexesTo(entitySet.indexes, dbSet?.indexes ?? [])).toEqual({
        add: [],
        drop: [],
      });
      await expect(generateAlterCode(entitySet, dbSet)).resolves.toEqual([]);
    });
  });

  describe("PostgreSQLSchemaReader - pg_get_indexdef 파싱", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("GIN 단일 컬럼 인덱스에서 opclass를 복원해야 한다", async () => {
      const compareDB = createCompareDB();

      vi.spyOn(PostgreSQLSchemaReader, "readTable").mockResolvedValue([
        [
          {
            column_name: "search_text",
            data_type: "text",
            udt_name: "text",
            character_maximum_length: null,
            precision: null,
            numeric_scale: null,
            is_nullable: "NO",
            column_default: null,
            is_generated: "",
            generation_expression: null,
          },
        ],
        [
          {
            index_name: "idx_search_text_trgm",
            column_name: "search_text",
            is_unique: false,
            is_primary: false,
            index_type: "gin",
            nulls_first: false,
            sort_order: "ASC",
            nulls_not_distinct: false,
            column_order: 1,
            index_definition:
              "CREATE INDEX idx_search_text_trgm ON public.items USING gin (search_text gin_trgm_ops)",
          },
        ],
        [],
      ]);

      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(compareDB, "items");
      const index = migrationSet?.indexes.find((item) => item.name === "idx_search_text_trgm");

      expect(index).toMatchObject({
        type: "index",
        using: "gin",
        columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
      });
    });

    test("GIST 다중 컬럼 인덱스에서 컬럼별 opclass를 복원해야 한다", async () => {
      const compareDB = createCompareDB();

      vi.spyOn(PostgreSQLSchemaReader, "readTable").mockResolvedValue([
        [
          {
            column_name: "title_ko",
            data_type: "text",
            udt_name: "text",
            character_maximum_length: null,
            precision: null,
            numeric_scale: null,
            is_nullable: "NO",
            column_default: null,
            is_generated: "",
            generation_expression: null,
          },
          {
            column_name: "title_en",
            data_type: "text",
            udt_name: "text",
            character_maximum_length: null,
            precision: null,
            numeric_scale: null,
            is_nullable: "NO",
            column_default: null,
            is_generated: "",
            generation_expression: null,
          },
        ],
        [
          {
            index_name: "idx_titles_trgm_gist",
            column_name: "title_ko",
            is_unique: false,
            is_primary: false,
            index_type: "gist",
            nulls_first: false,
            sort_order: "ASC",
            nulls_not_distinct: false,
            column_order: 1,
            index_definition:
              "CREATE INDEX idx_titles_trgm_gist ON public.items USING gist (title_ko gist_trgm_ops, title_en gist_trgm_ops)",
          },
          {
            index_name: "idx_titles_trgm_gist",
            column_name: "title_en",
            is_unique: false,
            is_primary: false,
            index_type: "gist",
            nulls_first: false,
            sort_order: "ASC",
            nulls_not_distinct: false,
            column_order: 2,
            index_definition:
              "CREATE INDEX idx_titles_trgm_gist ON public.items USING gist (title_ko gist_trgm_ops, title_en gist_trgm_ops)",
          },
        ],
        [],
      ]);

      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(compareDB, "items");
      const index = migrationSet?.indexes.find((item) => item.name === "idx_titles_trgm_gist");

      expect(index).toMatchObject({
        type: "index",
        using: "gist",
        columns: [
          { name: "title_ko", opclass: "gist_trgm_ops" },
          { name: "title_en", opclass: "gist_trgm_ops" },
        ],
      });
    });

    test("HNSW 인덱스는 type/opclass/WITH 옵션을 함께 복원해야 한다", async () => {
      const compareDB = createCompareDB([{ column_name: "embedding", dimensions: 1536 }]);

      vi.spyOn(PostgreSQLSchemaReader, "readTable").mockResolvedValue([
        [
          {
            column_name: "embedding",
            data_type: "USER-DEFINED",
            udt_name: "vector",
            character_maximum_length: null,
            precision: null,
            numeric_scale: null,
            is_nullable: "NO",
            column_default: null,
            is_generated: "",
            generation_expression: null,
          },
        ],
        [
          {
            index_name: "idx_embedding_hnsw",
            column_name: "embedding",
            is_unique: false,
            is_primary: false,
            index_type: "hnsw",
            nulls_first: false,
            sort_order: "ASC",
            nulls_not_distinct: false,
            column_order: 1,
            index_definition:
              "CREATE INDEX idx_embedding_hnsw ON public.items USING hnsw (embedding vector_cosine_ops) WITH (m = 24, ef_construction = 80)",
          },
        ],
        [],
      ]);

      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(compareDB, "items");
      const index = migrationSet?.indexes.find((item) => item.name === "idx_embedding_hnsw");

      expect(index).toMatchObject({
        type: "hnsw",
        columns: [{ name: "embedding", opclass: "vector_cosine_ops" }],
        m: 24,
        efConstruction: 80,
      });
      expect(index).not.toHaveProperty("using");
      expect(
        getAlterIndexesTo(
          [
            {
              type: "hnsw",
              name: "idx_embedding_hnsw",
              columns: [{ name: "embedding", opclass: "vector_cosine_ops" }],
              m: 24,
              efConstruction: 80,
            },
          ],
          migrationSet?.indexes ?? [],
        ),
      ).toEqual({ add: [], drop: [] });
    });

    test("IVFFlat 인덱스는 type/opclass/lists 옵션을 복원해야 한다", async () => {
      const compareDB = createCompareDB([{ column_name: "embedding", dimensions: 1536 }]);

      vi.spyOn(PostgreSQLSchemaReader, "readTable").mockResolvedValue([
        [
          {
            column_name: "embedding",
            data_type: "USER-DEFINED",
            udt_name: "vector",
            character_maximum_length: null,
            precision: null,
            numeric_scale: null,
            is_nullable: "NO",
            column_default: null,
            is_generated: "",
            generation_expression: null,
          },
        ],
        [
          {
            index_name: "idx_embedding_ivfflat",
            column_name: "embedding",
            is_unique: false,
            is_primary: false,
            index_type: "ivfflat",
            nulls_first: false,
            sort_order: "ASC",
            nulls_not_distinct: false,
            column_order: 1,
            index_definition:
              "CREATE INDEX idx_embedding_ivfflat ON public.items USING ivfflat (embedding vector_ip_ops) WITH (lists = 250)",
          },
        ],
        [],
      ]);

      const migrationSet = await PostgreSQLSchemaReader.getMigrationSetFromDB(compareDB, "items");
      const index = migrationSet?.indexes.find((item) => item.name === "idx_embedding_ivfflat");

      expect(index).toMatchObject({
        type: "ivfflat",
        columns: [{ name: "embedding", opclass: "vector_ip_ops" }],
        lists: 250,
      });
      expect(index).not.toHaveProperty("using");
      expect(
        getAlterIndexesTo(
          [
            {
              type: "ivfflat",
              name: "idx_embedding_ivfflat",
              columns: [{ name: "embedding", opclass: "vector_ip_ops" }],
              lists: 250,
            },
          ],
          migrationSet?.indexes ?? [],
        ),
      ).toEqual({ add: [], drop: [] });
    });
  });

  describe("setMigrationIndexDefaults", () => {
    test("BTREE 인덱스는 sortOrder/nullsFirst 기본값이 추가되어야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "index",
        name: "idx_test",
        columns: [{ name: "test_col" }],
        using: "btree",
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.columns).toEqual([{ name: "test_col", sortOrder: "ASC", nullsFirst: false }]);
      expect(result.nullsNotDistinct).toBe(false);
      expect(result.using).toBe("btree");
    });

    test("using이 없는 인덱스는 btree로 간주하여 기본값이 추가되어야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "index",
        name: "idx_test",
        columns: [{ name: "test_col" }],
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.using).toBe("btree");
      expect(result.columns).toEqual([{ name: "test_col", sortOrder: "ASC", nullsFirst: false }]);
    });

    test("GIN 인덱스는 sortOrder/nullsFirst 기본값이 추가되지 않아야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "index",
        name: "idx_test_gin",
        columns: [{ name: "test_tsv" }],
        using: "gin",
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.columns).toEqual([{ name: "test_tsv" }]);
      expect(result.columns[0]).not.toHaveProperty("sortOrder");
      expect(result.columns[0]).not.toHaveProperty("nullsFirst");
    });

    test("GIST 인덱스는 sortOrder/nullsFirst 기본값이 추가되지 않아야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "index",
        name: "idx_test_gist",
        columns: [{ name: "test_col" }],
        using: "gist",
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.columns).toEqual([{ name: "test_col" }]);
    });

    test("HASH 인덱스는 sortOrder/nullsFirst 기본값이 추가되지 않아야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "index",
        name: "idx_test_hash",
        columns: [{ name: "test_col" }],
        using: "hash",
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.columns).toEqual([{ name: "test_col" }]);
    });

    test("HNSW 벡터 인덱스는 sortOrder/nullsFirst 기본값이 추가되지 않아야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "hnsw",
        name: "idx_embedding_hnsw",
        columns: [{ name: "embedding" }],
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.columns).toEqual([{ name: "embedding" }]);
      expect(result.using).toBeUndefined();
    });

    test("IVFFlat 벡터 인덱스는 sortOrder/nullsFirst 기본값이 추가되지 않아야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "ivfflat",
        name: "idx_embedding_ivfflat",
        columns: [{ name: "embedding" }],
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then
      expect(result.columns).toEqual([{ name: "embedding" }]);
      expect(result.using).toBeUndefined();
    });

    test("이미 sortOrder가 있는 경우 기존 값을 유지해야 한다", () => {
      // given
      const index: MigrationIndex = {
        type: "index",
        name: "idx_test",
        columns: [{ name: "test_col", sortOrder: "DESC" }],
        using: "btree",
      };

      // when
      const result = setMigrationIndexDefaults(index);

      // then: DESC는 유지, nullsFirst는 true (PostgreSQL 기본값)
      expect(result.columns).toEqual([{ name: "test_col", sortOrder: "DESC", nullsFirst: true }]);
    });
  });

  describe("getAlterIndexesTo - Multiple GIN Indexes", () => {
    test("서로 다른 컬럼의 GIN 인덱스 2개를 구별할 수 있어야 한다", () => {
      // given
      const entityIndexes: MigrationIndex[] = [
        {
          type: "index",
          name: "idx_question_tsv",
          columns: [{ name: "question_tsv" }],
          using: "gin",
        },
        {
          type: "index",
          name: "idx_answer_tsv",
          columns: [{ name: "answer_tsv" }],
          using: "gin",
        },
      ];

      const dbIndexes: MigrationIndex[] = [
        {
          type: "index",
          name: "idx_question_tsv",
          columns: [{ name: "question_tsv" }],
          using: "gin",
          nullsNotDistinct: false,
        },
        {
          type: "index",
          name: "idx_answer_tsv",
          columns: [{ name: "answer_tsv" }],
          using: "gin",
          nullsNotDistinct: false,
        },
      ];

      // when
      const result = getAlterIndexesTo(entityIndexes, dbIndexes);

      // then: 정상적으로 매칭되어 add/drop 없음
      expect(result.add).toEqual([]);
      expect(result.drop).toEqual([]);
    });

    test("새로운 GIN 인덱스 추가를 감지할 수 있어야 한다", () => {
      // given: Entity에 새 인덱스 추가
      const entityIndexes: MigrationIndex[] = [
        {
          type: "index",
          name: "idx_question_tsv",
          columns: [{ name: "question_tsv" }],
          using: "gin",
        },
        {
          type: "index",
          name: "idx_answer_tsv",
          columns: [{ name: "answer_tsv" }],
          using: "gin",
        },
      ];

      const dbIndexes: MigrationIndex[] = [
        {
          type: "index",
          name: "idx_question_tsv",
          columns: [{ name: "question_tsv" }],
          using: "gin",
          nullsNotDistinct: false,
        },
      ];

      // when
      const result = getAlterIndexesTo(entityIndexes, dbIndexes);

      // then: answer_tsv 인덱스가 추가로 감지됨
      expect(result.add).toHaveLength(1);
      expect(result.add?.[0]?.columns[0]?.name).toBe("answer_tsv");
      expect(result.drop).toEqual([]);
    });
  });
});
