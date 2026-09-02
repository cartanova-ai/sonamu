import {
  Entity,
  EntityManager,
  getMigrationSetFromEntity,
  Migrator,
  PostgreSQLSchemaReader,
} from "sonamu";
import { type EntityJson, type MigrationSet } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";

import { mockEntityManagerGet } from "../testing/test-helpers";

bootstrap(vi, { forTesting: false });

function buildDbSetWithGeneratedSearchText(
  entitySet: MigrationSet,
  expression: string,
): MigrationSet {
  return {
    ...entitySet,
    columns: entitySet.columns.map((column) =>
      column.name === "search_text"
        ? {
            ...column,
            generated: {
              type: "STORED",
              expression,
            },
          }
        : column,
    ),
  };
}

describe("Migrator - Generated Column", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  afterEach(async () => {
    await EntityManager.reload();
  });

  test("STORED Generated Column 추가 감지", async () => {
    // given: User 엔티티에 STORED Generated Column 추가
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "username_upper",
          type: "string",
          desc: "대문자 사용자명",
          generated: {
            type: "STORED",
            expression: "UPPER(username)",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_add1_alter7");

    // Generated Column은 ALTER TABLE ADD COLUMN 방식으로 생성
    expect(alterCode?.formatted).toContain(
      'ALTER TABLE "users" ADD COLUMN "username_upper" text GENERATED ALWAYS AS (UPPER(username)) STORED NOT NULL',
    );

    // down에서는 일반 컬럼처럼 dropColumns로 삭제
    expect(alterCode?.formatted).toContain('table.dropColumns("username_upper")');
  });

  test("VIRTUAL Generated Column 추가 감지", async () => {
    // given: User 엔티티에 VIRTUAL Generated Column 추가
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "email_domain",
          type: "string",
          desc: "이메일 도메인",
          nullable: true,
          generated: {
            type: "VIRTUAL",
            expression: "SPLIT_PART(email, '@', 2)",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();

    // VIRTUAL Generated Column (nullable이므로 NOT NULL 없음)
    expect(alterCode?.formatted).toContain(
      `ALTER TABLE "users" ADD COLUMN "email_domain" text GENERATED ALWAYS AS (SPLIT_PART(email, '@', 2)) VIRTUAL`,
    );
  });

  test("Generated Column이 있는 신규 엔티티 생성", async () => {
    // given: Generated Column이 포함된 새 엔티티
    // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
    const newEntity = {
      id: "Product",
      table: "products",
      title: "PRODUCT",
      props: [
        { name: "id", type: "integer", desc: "ID" },
        { name: "price", type: "integer", desc: "가격" },
        { name: "quantity", type: "integer", desc: "수량" },
        {
          name: "total_price",
          type: "integer",
          desc: "총 가격",
          generated: {
            type: "STORED",
            expression: "price * quantity",
          },
        },
      ],
      indexes: [],
      subsets: {},
      enums: {},
    } as EntityJson;
    await EntityManager.register(newEntity);

    const status = await migrator.getStatus();

    const createCode = status.preparedCodes.find((code) => code.title === "create__products");
    expect(createCode).toBeDefined();

    // 일반 컬럼은 createTable 내부에서 생성
    expect(createCode?.formatted).toContain("table.increments()");
    expect(createCode?.formatted).toContain('table.integer("price")');
    expect(createCode?.formatted).toContain('table.integer("quantity")');

    // Generated Column은 createTable 외부에서 ALTER TABLE로 생성
    expect(createCode?.formatted).toContain(
      'ALTER TABLE "products" ADD COLUMN "total_price" integer GENERATED ALWAYS AS (price * quantity) STORED NOT NULL',
    );
  });

  test("일반 컬럼과 Generated Column 동시 추가", async () => {
    // given: 일반 컬럼과 Generated Column을 동시에 추가
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "nickname",
          type: "string",
          desc: "닉네임",
          length: 50,
        },
        {
          name: "display_name",
          type: "string",
          desc: "표시 이름",
          generated: {
            type: "STORED",
            expression: "COALESCE(nickname, username)",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_add2_alter7");

    // 일반 컬럼은 alterTable 내부에서 추가
    expect(alterCode?.formatted).toContain('table.string("nickname", 50)');

    // Generated Column은 alterTable 외부에서 ALTER TABLE로 추가
    expect(alterCode?.formatted).toContain(
      'ALTER TABLE "users" ADD COLUMN "display_name" text GENERATED ALWAYS AS (COALESCE(nickname, username)) STORED NOT NULL',
    );
  });

  test("숫자 타입 Generated Column (integer)", async () => {
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "name_length",
          type: "integer",
          desc: "이름 길이",
          generated: {
            type: "STORED",
            expression: "LENGTH(username)",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toContain(
      'ADD COLUMN "name_length" integer GENERATED ALWAYS AS (LENGTH(username)) STORED NOT NULL',
    );
  });

  test("boolean 타입 Generated Column", async () => {
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "has_long_name",
          type: "boolean",
          desc: "긴 이름 여부",
          generated: {
            type: "STORED",
            expression: "LENGTH(username) > 10",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toContain(
      'ADD COLUMN "has_long_name" boolean GENERATED ALWAYS AS (LENGTH(username) > 10) STORED NOT NULL',
    );
  });

  test("date 타입 Generated Column", async () => {
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "created_date",
          type: "date",
          desc: "생성 날짜 (날짜만)",
          generated: {
            type: "STORED",
            expression: "DATE(created_at)",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toContain(
      'ADD COLUMN "created_date" timestamptz GENERATED ALWAYS AS (DATE(created_at)) STORED NOT NULL',
    );
  });

  test("numeric 타입 Generated Column (precision, scale)", async () => {
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "score_percent",
          type: "numeric",
          desc: "점수 백분율",
          precision: 5,
          scale: 2,
          generated: {
            type: "STORED",
            expression: "id * 100.0 / 1000",
          },
        },
      ],
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toContain(
      'ADD COLUMN "score_percent" numeric(5, 2) GENERATED ALWAYS AS (id * 100.0 / 1000) STORED NOT NULL',
    );
  });

  test("Generated Column 삭제 감지", async () => {
    // given: Department 엔티티에서 code 컬럼 제거
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      props: original.props.filter((p) => p.name !== "code"),
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_departments_drop1_alter1");

    // up: Generated Column도 일반 컬럼처럼 dropColumns로 삭제
    expect(alterCode?.formatted).toContain('table.dropColumns("code")');

    // down: Generated Column 복원은 ALTER TABLE ADD COLUMN으로
    expect(alterCode?.formatted).toContain(
      `ALTER TABLE "departments" ADD COLUMN "code" varchar(10) GENERATED ALWAYS AS (('DEP-'::text || lpad((id)::text, 3, '0'::text))) STORED NOT NULL`,
    );
  });

  test("Generated Column expression 변경은 감지하지 않음", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      props: original.props.map((p) => {
        if (p.name === "code" && "generated" in p) {
          return {
            ...p,
            generated: {
              type: "STORED",
              expression: "'DEPT-' || LPAD(id::text, 4, '0')", // expression 변경
            },
          };
        }
        return p;
      }),
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeUndefined();
  });

  test("searchText generated expression 변경은 helper와 index를 포함해 재생성해야 한다", async () => {
    const originalUser = EntityManager.get("User").toJson();
    const previousUser = {
      ...originalUser,
      props: [
        ...originalUser.props,
        {
          name: "tags",
          type: "string[]",
          nullable: true,
          desc: "검색 태그",
        },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "username", caseInsensitive: true }],
        },
      ],
      indexes: [
        ...originalUser.indexes,
        {
          type: "index",
          name: "users_search_text_trgm",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    } satisfies EntityJson;
    const nextUser = {
      ...previousUser,
      props: previousUser.props.map((prop) =>
        prop.name === "search_text"
          ? {
              ...prop,
              sourceColumns: [
                { name: "username", caseInsensitive: false },
                { name: "tags", caseInsensitive: true },
              ],
            }
          : prop,
      ),
    } satisfies EntityJson;

    const originalGetMigrationSetFromDBAll =
      PostgreSQLSchemaReader.getMigrationSetFromDBAll.bind(PostgreSQLSchemaReader);
    const originalGetByTable = EntityManager.getByTable.bind(EntityManager);
    const dbSet = buildDbSetWithGeneratedSearchText(
      getMigrationSetFromEntity(new Entity(previousUser)),
      `trim(lower(COALESCE(username, '')))`,
    );

    const getSpy = mockEntityManagerGet("User", () => nextUser);
    const getByTableSpy = vi.spyOn(EntityManager, "getByTable").mockImplementation((table) => {
      if (table === "users") {
        return new Entity(nextUser);
      }

      return originalGetByTable(table);
    });
    const schemaReaderSpy = vi
      .spyOn(PostgreSQLSchemaReader, "getMigrationSetFromDBAll")
      .mockImplementation(async (compareDB) => {
        // users만 합성 dbSet으로 바꾸고 나머지 테이블은 실제 스키마를 그대로 쓴다.
        const dbSets = await originalGetMigrationSetFromDBAll(compareDB);
        dbSets.set("users", dbSet);
        return dbSets;
      });

    try {
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain(
        'table.dropIndex(["search_text"], "users_search_text_trgm")',
      );
      expect(alterCode?.formatted).toContain('table.dropColumns("search_text")');
      expect(alterCode?.formatted).toContain(
        "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
      );
      expect(alterCode?.formatted).toContain(
        `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(username, '') || ' ' || COALESCE(sonamu_text_array_agg(tags), ''))) STORED NOT NULL`,
      );
      expect(alterCode?.formatted).toContain(
        "CREATE INDEX users_search_text_trgm ON users USING gin(search_text gin_trgm_ops);",
      );
    } finally {
      schemaReaderSpy.mockRestore();
      getByTableSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  test("searchText helper kind가 바뀌어도 down path는 이전 helper를 복원해야 한다", async () => {
    const originalUser = EntityManager.get("User").toJson();
    const previousUser = {
      ...originalUser,
      props: [
        ...originalUser.props,
        {
          name: "aliases",
          type: "json",
          nullable: true,
          id: "MigratorGeneratedColumnRollbackAliasesJson",
          desc: "검색 별칭",
        },
        {
          name: "tags",
          type: "string[]",
          nullable: true,
          desc: "검색 태그",
        },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "aliases", caseInsensitive: true }],
        },
      ],
      indexes: [
        ...originalUser.indexes,
        {
          type: "index",
          name: "users_search_text_trgm",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    } satisfies EntityJson;
    const nextUser = {
      ...previousUser,
      props: previousUser.props.map((prop) =>
        prop.name === "search_text"
          ? {
              ...prop,
              sourceColumns: [{ name: "tags", caseInsensitive: true }],
            }
          : prop,
      ),
    } satisfies EntityJson;

    const originalGetMigrationSetFromDBAll =
      PostgreSQLSchemaReader.getMigrationSetFromDBAll.bind(PostgreSQLSchemaReader);
    const originalGetByTable = EntityManager.getByTable.bind(EntityManager);
    const dbSet = buildDbSetWithGeneratedSearchText(
      getMigrationSetFromEntity(new Entity(previousUser)),
      `trim(COALESCE(sonamu_jsonb_array_agg(aliases), ''))`,
    );

    const getSpy = mockEntityManagerGet("User", () => nextUser);
    const getByTableSpy = vi.spyOn(EntityManager, "getByTable").mockImplementation((table) => {
      if (table === "users") {
        return new Entity(nextUser);
      }

      return originalGetByTable(table);
    });
    const schemaReaderSpy = vi
      .spyOn(PostgreSQLSchemaReader, "getMigrationSetFromDBAll")
      .mockImplementation(async (compareDB) => {
        // users만 합성 dbSet으로 바꾸고 나머지 테이블은 실제 스키마를 그대로 쓴다.
        const dbSets = await originalGetMigrationSetFromDBAll(compareDB);
        dbSets.set("users", dbSet);
        return dbSets;
      });

    try {
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain(
        "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
      );
      expect(alterCode?.formatted).toContain(
        `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(sonamu_text_array_agg(tags), ''))) STORED NOT NULL`,
      );
      expect(alterCode?.formatted).toContain(
        "CREATE OR REPLACE FUNCTION sonamu_jsonb_array_agg(arr jsonb, ci boolean DEFAULT true)",
      );
      expect(alterCode?.formatted).toContain(
        `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(sonamu_jsonb_array_agg(aliases), ''))) STORED NOT NULL`,
      );
    } finally {
      schemaReaderSpy.mockRestore();
      getByTableSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  test("searchText가 제거되어도 down path는 기존 trigram index를 복원해야 한다", async () => {
    const originalUser = EntityManager.get("User").toJson();
    const previousUser = {
      ...originalUser,
      props: [
        ...originalUser.props,
        {
          name: "tags",
          type: "string[]",
          nullable: true,
          desc: "검색 태그",
        },
        {
          name: "search_text",
          type: "searchText",
          sourceColumns: [{ name: "tags", caseInsensitive: true }],
        },
      ],
      indexes: [
        ...originalUser.indexes,
        {
          type: "index",
          name: "users_search_text_trgm",
          using: "gin",
          columns: [{ name: "search_text", opclass: "gin_trgm_ops" }],
        },
      ],
    } satisfies EntityJson;
    const nextUser = {
      ...previousUser,
      props: previousUser.props.filter((prop) => prop.name !== "search_text"),
      indexes: previousUser.indexes.filter((index) => index.name !== "users_search_text_trgm"),
    } satisfies EntityJson;

    const originalGetMigrationSetFromDBAll =
      PostgreSQLSchemaReader.getMigrationSetFromDBAll.bind(PostgreSQLSchemaReader);
    const originalGetByTable = EntityManager.getByTable.bind(EntityManager);
    const dbSet = buildDbSetWithGeneratedSearchText(
      getMigrationSetFromEntity(new Entity(previousUser)),
      `trim(COALESCE(sonamu_text_array_agg(tags), ''))`,
    );

    const getSpy = mockEntityManagerGet("User", () => nextUser);
    const getByTableSpy = vi.spyOn(EntityManager, "getByTable").mockImplementation((table) => {
      if (table === "users") {
        return new Entity(nextUser);
      }

      return originalGetByTable(table);
    });
    const schemaReaderSpy = vi
      .spyOn(PostgreSQLSchemaReader, "getMigrationSetFromDBAll")
      .mockImplementation(async (compareDB) => {
        // users만 합성 dbSet으로 바꾸고 나머지 테이블은 실제 스키마를 그대로 쓴다.
        const dbSets = await originalGetMigrationSetFromDBAll(compareDB);
        dbSets.set("users", dbSet);
        return dbSets;
      });

    try {
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain('table.dropColumns("search_text")');
      expect(alterCode?.formatted).toContain(
        "CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)",
      );
      expect(alterCode?.formatted).toContain(
        `ADD COLUMN "search_text" text GENERATED ALWAYS AS (trim(COALESCE(sonamu_text_array_agg(tags), ''))) STORED NOT NULL`,
      );
      expect(alterCode?.formatted).toContain(
        "CREATE INDEX users_search_text_trgm ON users USING gin(search_text gin_trgm_ops);",
      );
    } finally {
      schemaReaderSpy.mockRestore();
      getByTableSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  test("Generated Column type 변경 감지 (STORED → VIRTUAL)", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      props: original.props.map((p) => {
        if (p.name === "code" && "generated" in p) {
          return {
            ...p,
            generated: {
              type: "VIRTUAL", // STORED → VIRTUAL 변경
              expression: "'DEP-' || LPAD(id::text, 3, '0')",
            },
          };
        }
        return p;
      }),
    }));

    const status = await migrator.getStatus();

    // Generated Column의 type 변경은 ALTER로 처리 불가하므로
    // drop + add로 처리됨
    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_departments_add1_drop1_alter1");

    // up: drop 후 VIRTUAL로 재생성
    expect(alterCode?.formatted).toContain('table.dropColumns("code")');
    expect(alterCode?.formatted).toContain(
      `ALTER TABLE "departments" ADD COLUMN "code" varchar(10) GENERATED ALWAYS AS ('DEP-' || LPAD(id::text, 3, '0')) VIRTUAL NOT NULL`,
    );

    // down: drop 후 원래 STORED로 복원
    expect(alterCode?.formatted).toContain(
      `ALTER TABLE "departments" ADD COLUMN "code" varchar(10) GENERATED ALWAYS AS (('DEP-'::text || lpad((id)::text, 3, '0'::text))) STORED NOT NULL`,
    );
  });

  test("Generated Column을 일반 컬럼으로 변경 감지", async () => {
    // Generated Column을 일반 컬럼으로 변경하면 drop + add로 감지
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      props: original.props.map((p) => {
        if (p.name === "code") {
          // generated 속성 제거하여 일반 컬럼으로 변경
          return {
            name: "code",
            type: "string",
            desc: "부서번호",
            length: 10,
          };
        }
        return p;
      }),
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toMatch(/^alter_departments_add1_drop1_alter\d+$/);

    // up: Generated Column drop 후 일반 컬럼으로 재생성
    expect(alterCode?.formatted).toContain('table.dropColumns("code")');
    expect(alterCode?.formatted).toContain('table.string("code", 10)');

    // down: 일반 컬럼 drop 후 원래 Generated Column 복원
    expect(alterCode?.formatted).toContain(
      `ALTER TABLE "departments" ADD COLUMN "code" varchar(10) GENERATED ALWAYS AS (('DEP-'::text || lpad((id)::text, 3, '0'::text))) STORED NOT NULL`,
    );
  });

  test("일반 컬럼을 Generated Column으로 변경 감지", async () => {
    // Department의 name 컬럼을 Generated Column으로 변경 시도
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      props: original.props.map((p) => {
        if (p.name === "name") {
          return {
            ...p,
            generated: {
              type: "STORED",
              expression: "'DEPT-' || id::text",
            },
          };
        }
        return p;
      }),
    }));

    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toMatch(/^alter_departments_add1_drop1_alter\d+$/);

    // up: 일반 컬럼 drop 후 Generated Column으로 재생성
    expect(alterCode?.formatted).toContain('table.dropColumns("name")');
    expect(alterCode?.formatted).toContain(
      `ALTER TABLE "departments" ADD COLUMN "name" varchar(128) GENERATED ALWAYS AS ('DEPT-' || id::text) STORED NOT NULL`,
    );

    // down: Generated Column drop 후 원래 일반 컬럼 복원
    expect(alterCode?.formatted).toContain('table.dropColumns("name")');
    expect(alterCode?.formatted).toContain('table.string("name", 128).notNullable()');
  });
});
