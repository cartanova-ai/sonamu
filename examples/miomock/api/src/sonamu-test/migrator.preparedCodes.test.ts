import { EntityManager, Migrator, Naite } from "sonamu";
import { type EntityJson } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";

import { mockEntityManagerGet } from "../testing/test-helpers";

bootstrap(vi, { forTesting: false });

describe("Migrator - preparedCodes 생성", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  // 테스트 실행 후 EntityManager 초기화
  afterEach(async () => {
    await EntityManager.reload();
  });

  test("컬럼 추가 감지", async () => {
    // given: UserEntity에 test_column 컬럼 추가
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          name: "test_column_string_array",
          type: "string[]",
          desc: "Test String Array Column",
          length: 256,
        },
        {
          name: "test_column_numeric_array",
          type: "numeric[]",
          desc: "Test Numeric Array Column",
          precision: 10,
          scale: 2,
        },
      ],
    }));
    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_add2_alter7");

    // up
    expect(alterCode?.formatted).toContain(
      'table.specificType("test_column_string_array", "varchar(256)[]").notNullable()',
    );
    expect(alterCode?.formatted).toContain(
      'table.specificType("test_column_numeric_array", "numeric(10, 2)[]").notNullable()',
    );

    // down
    expect(alterCode?.formatted).toContain(
      'table.dropColumns("test_column_numeric_array", "test_column_string_array")',
    );
  });

  test("컬럼 삭제 감지", async () => {
    // Entity에서 props 제거 → alter_drop 코드
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: original.props.filter((prop) => prop.name !== "deleted_at"),
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    const alterCode = status.preparedCodes.find((code) => code.title.startsWith("alter_users_"));
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_drop1_alter6");

    // up
    expect(alterCode?.formatted).toContain('table.dropColumns("deleted_at")');

    // down
    expect(alterCode?.formatted).toContain(
      'table.timestamp("deleted_at", { useTz: true, precision: 3 }).nullable()',
    );
  });

  test("컬럼 속성 변경 감지", async () => {
    // UserEntity.deleted_at nullable -> notNullable로 변경
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: original.props.map((prop) => {
        if (prop.name === "deleted_at") {
          return { ...prop, nullable: false };
        }
        return prop;
      }),
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_alter7");

    // up
    expect(alterCode?.formatted).toContain(
      'table.timestamp("deleted_at", { useTz: true, precision: 3 }).notNullable()',
    );
    expect(alterCode?.formatted).toContain(
      'table.timestamp("deleted_at", { useTz: true, precision: 3 }).nullable()',
    );

    // down
    expect(alterCode?.formatted).toContain(
      'table.timestamp("deleted_at", { useTz: true, precision: 3 }).nullable()',
    );
    expect(alterCode?.formatted).toContain(
      'table.timestamp("deleted_at", { useTz: true, precision: 3 }).notNullable()',
    );
  });

  test("컬럼 이름 변경 감지 (Drop & Add)", async () => {
    // UserEntity의 username 컬럼을 full_name으로 변경
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: original.props.map((prop) => {
        if (prop.name === "username") {
          return {
            ...prop,
            name: "full_name",
          };
        }
        return prop;
      }),
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    const alterCode = status.preparedCodes.find(
      (code) => code.table === "users" && code.type === "normal",
    );
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_add1_drop1_alter7");

    // up
    expect(alterCode?.formatted).toContain('table.string("full_name", 255).notNullable()');
    expect(alterCode?.formatted).toContain('table.dropColumns("username")');

    // down
    expect(alterCode?.formatted).toContain('table.dropColumns("full_name")');
    expect(alterCode?.formatted).toContain('table.string("username", 255).notNullable()');
  });

  test("인덱스 추가 감지 (INDEX, UNIQUE, FULLTEXT)", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      indexes: [
        ...original.indexes,
        { type: "index", columns: [{ name: "name" }], name: "departments_name_index" },
        {
          type: "unique",
          columns: [{ name: "company_id" }],
          name: "departments_company_id_unique",
        },
      ],
    }));
    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toMatchInlineSnapshot(
      `
      "import type { Knex } from "knex";

      export async function up(knex: Knex): Promise<void> {
        await knex.raw(
          \`CREATE INDEX departments_name_index ON departments USING btree(name ASC NULLS LAST);\`,
        );
        await knex.raw(
          \`CREATE UNIQUE INDEX departments_company_id_unique ON departments USING btree(company_id ASC NULLS LAST) NULLS DISTINCT;\`,
        );
      }

      export async function down(knex: Knex): Promise<void> {
        await knex.schema.alterTable("departments", (table) => {
          table.dropIndex(["name"], "departments_name_index");
          table.dropIndex(["company_id"], "departments_company_id_unique");
        });
      }
      "
    `,
    );
  });

  test("인덱스 삭제 감지", async () => {
    mockEntityManagerGet("User", (original) => ({
      ...original,
      indexes: [],
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();
    const preparedCodes = status.preparedCodes.find((code) => code.table === "users");
    expect(preparedCodes).toBeDefined();
    expect(preparedCodes?.title).toBe("alter_users_alter7");

    // up
    expect(preparedCodes?.formatted).toContain('table.dropIndex(["email"], "users_email_unique")');

    // down
    expect(preparedCodes?.formatted).toContain(
      "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email ASC NULLS LAST) NULLS DISTINCT;",
    );
  });

  test("인덱스 옵션 - using", async () => {
    mockEntityManagerGet("User", (original) => ({
      ...original,
      indexes: [
        ...original.indexes,
        {
          type: "index",
          columns: [{ name: "birth_date" }],
          name: "users_birth_date_index",
        },
        {
          type: "index",
          columns: [{ name: "email" }],
          name: "users_email_index",
          using: "btree",
        },
        {
          type: "index",
          columns: [{ name: "username" }],
          name: "users_username_index",
          using: "hash",
        },
        {
          type: "index",
          columns: [{ name: "role" }],
          name: "users_role_index",
          using: "gin",
        },
        {
          type: "index",
          columns: [{ name: "bio" }],
          name: "users_bio_index",
          using: "gist",
        },
      ],
    }));
    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toMatchInlineSnapshot(
      `
      "import type { Knex } from "knex";

      export async function up(knex: Knex): Promise<void> {
        await knex.raw(\`CREATE INDEX users_bio_index ON users USING gist(bio);\`);
        await knex.raw(
          \`CREATE INDEX users_birth_date_index ON users USING btree(birth_date ASC NULLS LAST);\`,
        );
        await knex.raw(\`CREATE INDEX users_email_index ON users USING btree(email ASC NULLS LAST);\`);
        await knex.raw(\`CREATE INDEX users_role_index ON users USING gin(role);\`);
        await knex.raw(\`CREATE INDEX users_username_index ON users USING hash(username);\`);
      }

      export async function down(knex: Knex): Promise<void> {
        await knex.schema.alterTable("users", (table) => {
          table.dropIndex(["bio"], "users_bio_index");
          table.dropIndex(["birth_date"], "users_birth_date_index");
          table.dropIndex(["email"], "users_email_index");
          table.dropIndex(["role"], "users_role_index");
          table.dropIndex(["username"], "users_username_index");
        });
      }
      "
    `,
    );
  });

  test("인덱스 옵션 - sortOrder DESC", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      indexes: [
        ...original.indexes,
        {
          type: "index",
          columns: [{ name: "name", sortOrder: "DESC" }],
          name: "departments_name_desc_index",
        },
      ],
    }));
    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toMatchInlineSnapshot(
      `
      "import type { Knex } from "knex";

      export async function up(knex: Knex): Promise<void> {
        await knex.raw(
          \`CREATE INDEX departments_name_desc_index ON departments USING btree(name DESC NULLS FIRST);\`,
        );
      }

      export async function down(knex: Knex): Promise<void> {
        await knex.schema.alterTable("departments", (table) => {
          table.dropIndex(["name"], "departments_name_desc_index");
        });
      }
      "
    `,
    );
  });

  test("인덱스 옵션 - nullsFirst 명시", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      indexes: [
        ...original.indexes,
        {
          type: "index",
          columns: [{ name: "name", sortOrder: "ASC", nullsFirst: true }],
          name: "departments_name_nulls_first_index",
        },
      ],
    }));
    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toMatchInlineSnapshot(
      `
      "import type { Knex } from "knex";

      export async function up(knex: Knex): Promise<void> {
        await knex.raw(
          \`CREATE INDEX departments_name_nulls_first_index ON departments USING btree(name ASC NULLS FIRST);\`,
        );
      }

      export async function down(knex: Knex): Promise<void> {
        await knex.schema.alterTable("departments", (table) => {
          table.dropIndex(["name"], "departments_name_nulls_first_index");
        });
      }
      "
    `,
    );
  });

  test("인덱스 옵션 - nullsNotDistinct (UNIQUE)", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      indexes: [
        ...original.indexes,
        {
          type: "unique",
          columns: [{ name: "name" }],
          name: "departments_name_unique",
          nullsNotDistinct: true,
        },
      ],
    }));
    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toMatchInlineSnapshot(
      `
      "import type { Knex } from "knex";

      export async function up(knex: Knex): Promise<void> {
        await knex.raw(
          \`CREATE UNIQUE INDEX departments_name_unique ON departments USING btree(name ASC NULLS LAST) NULLS NOT DISTINCT;\`,
        );
      }

      export async function down(knex: Knex): Promise<void> {
        await knex.schema.alterTable("departments", (table) => {
          table.dropIndex(["name"], "departments_name_unique");
        });
      }
      "
    `,
    );
  });

  test("인덱스 옵션 - 복합 인덱스 (다중 컬럼, 각기 다른 옵션)", async () => {
    mockEntityManagerGet("Department", (original) => ({
      ...original,
      indexes: [
        ...original.indexes,
        {
          type: "index",
          columns: [
            { name: "company_id", sortOrder: "ASC", nullsFirst: false },
            { name: "name", sortOrder: "DESC", nullsFirst: true },
          ],
          name: "departments_company_name_composite_index",
        },
      ],
    }));
    const status = await migrator.getStatus();

    const alterCode = status.preparedCodes.find((code) => code.table === "departments");
    expect(alterCode).toBeDefined();
    expect(alterCode?.formatted).toMatchInlineSnapshot(
      `
      "import type { Knex } from "knex";

      export async function up(knex: Knex): Promise<void> {
        await knex.raw(
          \`CREATE INDEX departments_company_name_composite_index ON departments USING btree(company_id ASC NULLS LAST, name DESC NULLS FIRST);\`,
        );
      }

      export async function down(knex: Knex): Promise<void> {
        await knex.schema.alterTable("departments", (table) => {
          table.dropIndex(["company_id", "name"], "departments_company_name_composite_index");
        });
      }
      "
    `,
    );
  });

  // FIXME: FTS 적용 후 케이스 처리 필요
  describe("인덱스 변경 감지", () => {
    test("옵션 변경 감지 - sortOrder 변경 시 alter 코드 생성", async () => {
      // User 엔티티의 기존 email unique 인덱스를 DESC로 변경
      mockEntityManagerGet("User", (original) => ({
        ...original,
        indexes: [
          {
            type: "unique",
            name: "users_email_unique",
            columns: [{ name: "email", sortOrder: "DESC" }],
          },
        ],
      }));
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.title).toBe("alter_users_alter7");

      // up: 기존 인덱스 삭제 후 새 인덱스 생성
      expect(alterCode?.formatted).toContain('table.dropIndex(["email"], "users_email_unique")');
      expect(alterCode?.formatted).toContain(
        "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email DESC NULLS FIRST) NULLS DISTINCT;",
      );

      // down: 변경된 인덱스 삭제 후 원래 인덱스 복원
      expect(alterCode?.formatted).toContain(
        "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email ASC NULLS LAST) NULLS DISTINCT;",
      );
    });

    test("옵션 변경 감지 - nullsNotDistinct 변경 시 alter 코드 생성", async () => {
      // User 엔티티의 기존 email unique 인덱스에 nullsNotDistinct 추가
      mockEntityManagerGet("User", (original) => ({
        ...original,
        indexes: [
          {
            type: "unique",
            name: "users_email_unique",
            columns: [{ name: "email" }],
            nullsNotDistinct: true,
          },
        ],
      }));
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.title).toBe("alter_users_alter7");

      // up: 기존 인덱스 삭제 후 NULLS NOT DISTINCT 인덱스 생성
      expect(alterCode?.formatted).toContain('table.dropIndex(["email"], "users_email_unique")');
      expect(alterCode?.formatted).toContain(
        "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email ASC NULLS LAST) NULLS NOT DISTINCT;",
      );

      // down: 변경된 인덱스 삭제 후 원래 인덱스 복원
      expect(alterCode?.formatted).toContain(
        "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email ASC NULLS LAST) NULLS DISTINCT;",
      );
    });

    test("옵션 변경 감지 - nullsFirst 변경 시 alter 코드 생성", async () => {
      // User 엔티티의 기존 email unique 인덱스의 nullsFirst를 true로 변경
      mockEntityManagerGet("User", (original) => ({
        ...original,
        indexes: [
          {
            type: "unique",
            name: "users_email_unique",
            columns: [{ name: "email", nullsFirst: true }],
          },
        ],
      }));
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.title).toBe("alter_users_alter7");

      // up: 기존 인덱스 삭제 후 NULLS FIRST 인덱스 생성
      expect(alterCode?.formatted).toContain('table.dropIndex(["email"], "users_email_unique")');
      expect(alterCode?.formatted).toContain(
        "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email ASC NULLS FIRST) NULLS DISTINCT;",
      );

      // down: 원래 인덱스 복원 (NULLS LAST)
      expect(alterCode?.formatted).toContain(
        "CREATE UNIQUE INDEX users_email_unique ON users USING btree(email ASC NULLS LAST) NULLS DISTINCT;",
      );
    });
  });

  test("FK 추가 감지 (BelongsToOne)", async () => {
    // UserEntity에 Company에 대한 BelongsToOne relation 추가
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "company",
          with: "Company",
          desc: "회사",
          relationType: "BelongsToOne",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // then

    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_add1_alter7");

    // up
    expect(alterCode?.formatted).toContain('table.integer("company_id").notNullable()');

    // down
    expect(alterCode?.formatted).toContain('table.dropColumns("company_id")');
  });

  test("FK 추가 감지 (OneToOne)", async () => {
    // UserEntity에 Company에 대한 OneToOne relation 추가 (실제 존재하는 Company 엔티티 사용)
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "main_company",
          with: "Company",
          desc: "메인 회사",
          relationType: "OneToOne",
          hasJoinColumn: true,
          useConstraint: true,
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // then
    const alterCode = status.preparedCodes.find((code) => code.table === "users");
    expect(alterCode).toBeDefined();
    expect(alterCode?.title).toBe("alter_users_add1_alter7");

    // up
    expect(alterCode?.formatted).toContain('table.integer("main_company_id").notNullable()');

    // down
    expect(alterCode?.formatted).toContain('table.dropColumns("main_company_id")');
    // unique constraint
    // expect(addProfileFKConstraintCode?.formatted).toContain('table.unique(["main_company_id"])');
  });

  test("FK 추가 감지 (HasMany)", async () => {
    // CompanyEntity에 Department에 대한 HasMany relation 추가
    mockEntityManagerGet("Company", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "departments",
          with: "Department",
          joinColumn: "company_id",
          fromColumn: "id",
          relationType: "HasMany",
        },
      ],
    }));

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // HasMany 관계는 마이그레이션 코드 생성 안함
    expect(status.preparedCodes.length).toBe(0);
  });

  test("FK 추가 감지 (ManyToMany)", async () => {
    // given: User와 Label 간의 ManyToMany 관계 추가
    // 1. Label 엔티티 생성
    // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
    const labelEntity = {
      id: "Label",
      table: "labels",
      title: "LABEL",
      props: [
        { name: "id", type: "integer", desc: "ID" },
        { name: "name", desc: "라벨명", type: "string", length: 100 },
      ],
      indexes: [],
      subsets: {},
      enums: {},
    } as EntityJson;
    await EntityManager.register(labelEntity);

    // 2. User 엔티티에 ManyToMany 관계 추가
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "labels",
          with: "Label",
          desc: "라벨",
          relationType: "ManyToMany",
          joinTable: "users__labels",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
    }));

    // when
    const status = await migrator.getStatus();

    // then
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();
    expect(status.preparedCodes.length).toBe(3);

    // Label 테이블 생성 코드
    const createLabelCode = status.preparedCodes[0];
    expect(createLabelCode).toBeDefined();
    expect(createLabelCode?.title).toBe("create__labels");

    // 조인테이블 (users__labels) 생성 코드
    const createJoinTableCode = status.preparedCodes[1];
    expect(createJoinTableCode).toBeDefined();
    expect(createJoinTableCode?.title).toBe("create__users__labels");
    // 생성된 조인테이블의 컬럼 user_id, label_id, uuid
    expect(createJoinTableCode?.formatted).toContain("user_id");
    expect(createJoinTableCode?.formatted).toContain("label_id");

    // FIXED: 2025-12-09 uuid 없어야 함
    expect(createJoinTableCode?.formatted).not.toContain('table.uuid("uuid")');
    expect(createJoinTableCode?.formatted).not.toContain(
      'table.unique(["uuid"], "users__labels_uuid_unique")',
    );

    // 조인테이블 FK 생성 코드
    const user_label_FKCode = status.preparedCodes[2];
    expect(user_label_FKCode).toBeDefined();
    expect(user_label_FKCode?.title).toBe("foreign__users__labels__user_id_label_id");
    // FK가 users.id와 labels.id를 참조하는지 확인
    expect(user_label_FKCode?.formatted).toContain('references("users.id")');
    expect(user_label_FKCode?.formatted).toContain('references("labels.id")');
    expect(user_label_FKCode?.formatted).toContain("CASCADE");
  });

  test("FK 삭제 감지", async () => {
    // UserEntity에 FK 추가
    const mock = mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "company",
          with: "Company",
          desc: "회사",
          relationType: "BelongsToOne",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
    }));

    // FK 추가 후 상태 확인
    const statusAfterFK = await migrator.getStatus();
    expect(statusAfterFK.preparedCodes.length).toBeGreaterThan(0);

    // mock 초기화
    mock.mockRestore();

    const statusRestored = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // company_id 컬럼이 삭제되는 것을 확인 (FK도 함께 삭제됨)
    expect(statusRestored.preparedCodes.length).toBe(0); // 이미 DB에 추가된 적이 없으므로 코드가 생성되지 않음
  });

  test("FK 변경 감지 (onUpdate/onDelete)", async () => {
    // UserEntity에 RESTRICT FK 추가
    const mock = mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "company",
          with: "Company",
          desc: "회사",
          relationType: "BelongsToOne",
          onUpdate: "RESTRICT",
          onDelete: "RESTRICT",
        },
      ],
    }));

    // FK 추가 상태 확인
    const statusAfterRESTRICT = await migrator.getStatus();
    expect(statusAfterRESTRICT.preparedCodes.length).toBeGreaterThan(0);

    // mock 초기화 후 onUpdate/onDelete를 CASCADE로 변경
    mock.mockRestore();
    mockEntityManagerGet("User", (original) => ({
      ...original,
      props: [
        ...original.props,
        {
          type: "relation",
          name: "company",
          with: "Company",
          desc: "회사",
          relationType: "BelongsToOne",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
    }));

    // FK 변경 상태 확인
    const statusAfterCASCADE = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // FK 변경 코드 확인
    const foreignCode = statusAfterCASCADE.preparedCodes.find(
      (code) => code.table === "users" && code.title.includes("foreigns"),
    );
    expect(foreignCode).toBeDefined();
    expect(foreignCode?.formatted).toContain("CASCADE");
  });

  test("신규 엔티티 감지", async () => {
    // 새 Entity 등록 → create table 마이그레이션 코드 생성
    // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
    const newEntity = {
      id: "TestEntity",
      table: "test_entities",
      title: "TEST ENTITY",
      props: [
        { name: "id", type: "integer", desc: "ID" },
        {
          name: "created_at",
          type: "date",
          desc: "등록일시",
          dbDefault: "CURRENT_TIMESTAMP",
        },
        { name: "name", desc: "이름", type: "string", length: 255 },
        { name: "description", desc: "설명", type: "string", nullable: true },
      ],
      indexes: [],
      subsets: {},
      enums: {},
    } as EntityJson;
    await EntityManager.register(newEntity);

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // then
    const createTableCode = status.preparedCodes.find(
      (code) => code.title === "create__test_entities",
    );

    expect(createTableCode).toBeDefined();
    expect(createTableCode?.title).toBe("create__test_entities");

    // up
    expect(createTableCode?.formatted).toContain('knex.schema.createTable("test_entities"');
    expect(createTableCode?.formatted).toContain("table.increments().primary()");
    expect(createTableCode?.formatted).toContain('table.string("name", 255).notNullable()');
    expect(createTableCode?.formatted).toContain('table.text("description").nullable()');

    // down
    expect(createTableCode?.formatted).toContain('knex.schema.dropTable("test_entities")');
  });

  test("코드 정렬 순서", async () => {
    // normal 타입이 foreign 타입보다 앞에 정렬
    // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
    const newEntity = {
      id: "TestOrderEntity",
      table: "test_order_entities",
      title: "TEST ORDER ENTITY",
      props: [
        { name: "id", type: "integer", desc: "ID" },
        {
          name: "created_at",
          type: "date",
          desc: "등록일시",
          dbDefault: "CURRENT_TIMESTAMP",
        },
        { name: "name", desc: "이름", type: "string", length: 255 },
        {
          type: "relation",
          name: "company",
          with: "Company",
          desc: "회사",
          relationType: "BelongsToOne",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      ],
      indexes: [],
      subsets: {},
      enums: {},
    } as EntityJson;
    await EntityManager.register(newEntity);

    const status = await migrator.getStatus();
    expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

    // then
    const createTableCode = status.preparedCodes.find(
      (code) => code.title === "create__test_order_entities",
    );
    const foreignCode = status.preparedCodes.find(
      (code) => code.title === "foreign__test_order_entities__company_id",
    );

    expect(createTableCode).toBeDefined();
    expect(foreignCode).toBeDefined();
    expect(createTableCode?.type).toBe("normal");
    expect(foreignCode?.type).toBe("foreign");

    // normal 타입이 foreign 타입보다 앞에 정렬되어야 함
    const createTableIndex = status.preparedCodes.findIndex(
      (code) => code.title === "create__test_order_entities",
    );
    const foreignIndex = status.preparedCodes.findIndex(
      (code) => code.title === "foreign__test_order_entities__company_id",
    );

    expect(createTableIndex).toBeLessThan(foreignIndex);
  });

  describe("String/UUID PK 지원", () => {
    // 목적: string/uuid 타입의 PK를 가진 엔티티의 마이그레이션 코드 생성 검증

    test("String PK 엔티티 생성 - length 지정", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const stringPkEntity = {
        id: "ExternalResource",
        table: "external_resources",
        title: "외부 리소스",
        props: [
          { name: "id", type: "string", desc: "외부 시스템 ID", length: 100 },
          { name: "name", type: "string", desc: "리소스명", length: 255 },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(stringPkEntity);

      const status = await migrator.getStatus();

      const createCode = status.preparedCodes.find(
        (code) => code.title === "create__external_resources",
      );
      expect(createCode).toBeDefined();

      // string PK는 table.string("id", length).primary().notNullable() 형태로 생성
      expect(createCode?.formatted).toContain('table.string("id", 100).primary().notNullable()');
      expect(createCode?.formatted).not.toContain("table.increments()");
    });

    test("String PK 엔티티 생성 - length 미지정 (text)", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const stringPkEntity = {
        id: "TextIdEntity",
        table: "text_id_entities",
        title: "Text ID 엔티티",
        props: [
          { name: "id", type: "string", desc: "Text ID" }, // length 없음
          { name: "data", type: "string", desc: "데이터" },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(stringPkEntity);

      const status = await migrator.getStatus();

      const createCode = status.preparedCodes.find(
        (code) => code.title === "create__text_id_entities",
      );
      expect(createCode).toBeDefined();

      // length가 없으면 text 타입으로 생성
      expect(createCode?.formatted).toContain('table.text("id").primary().notNullable()');
    });

    test("UUID PK 엔티티 생성", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const uuidPkEntity = {
        id: "UuidEntity",
        table: "uuid_entities",
        title: "UUID 엔티티",
        props: [
          { name: "id", type: "uuid", desc: "UUID" },
          { name: "action", type: "string", desc: "작업", length: 50 },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(uuidPkEntity);

      const status = await migrator.getStatus();

      const createCode = status.preparedCodes.find(
        (code) => code.title === "create__uuid_entities",
      );
      expect(createCode).toBeDefined();

      // uuid PK는 table.uuid("id").primary().notNullable() 형태로 생성
      expect(createCode?.formatted).toContain('table.uuid("id").primary().notNullable()');
      expect(createCode?.formatted).not.toContain("table.increments()");
    });

    test("String PK 엔티티를 참조하는 FK (BelongsToOne)", async () => {
      // 1. String PK를 가진 엔티티 등록
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const stringPkEntity = {
        id: "ExternalSystem",
        table: "external_systems",
        title: "외부 시스템",
        props: [
          { name: "id", type: "string", desc: "외부 시스템 ID", length: 50 },
          { name: "name", type: "string", desc: "시스템명", length: 100 },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(stringPkEntity);

      // 2. String PK를 참조하는 엔티티 등록
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const refEntity = {
        id: "SystemLog",
        table: "system_logs",
        title: "시스템 로그",
        props: [
          { name: "id", type: "integer", desc: "ID" },
          { name: "message", type: "string", desc: "메시지" },
          {
            type: "relation",
            name: "external_system",
            with: "ExternalSystem",
            desc: "외부 시스템",
            relationType: "BelongsToOne",
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(refEntity);

      const status = await migrator.getStatus();

      // FK 컬럼이 string 타입으로 생성되어야 함
      const createLogCode = status.preparedCodes.find(
        (code) => code.title === "create__system_logs",
      );
      expect(createLogCode).toBeDefined();

      // FK 컬럼은 참조 엔티티의 PK 타입(string, length: 50)을 따라야 함
      expect(createLogCode?.formatted).toContain('table.string("external_system_id", 50)');
      expect(createLogCode?.formatted).not.toContain('table.integer("external_system_id")');
    });

    test("UUID PK 엔티티를 참조하는 FK (BelongsToOne)", async () => {
      // 1. UUID PK를 가진 엔티티 등록
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const uuidPkEntity = {
        id: "Transaction",
        table: "transactions",
        title: "거래",
        props: [
          { name: "id", type: "uuid", desc: "UUID" },
          { name: "amount", type: "number", desc: "금액" },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(uuidPkEntity);

      // 2. UUID PK를 참조하는 엔티티 등록
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const refEntity = {
        id: "TransactionDetail",
        table: "transaction_details",
        title: "거래 상세",
        props: [
          { name: "id", type: "integer", desc: "ID" },
          { name: "description", type: "string", desc: "설명" },
          {
            type: "relation",
            name: "transaction",
            with: "Transaction",
            desc: "거래",
            relationType: "BelongsToOne",
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(refEntity);

      const status = await migrator.getStatus();

      // FK 컬럼이 uuid 타입으로 생성되어야 함
      const createDetailCode = status.preparedCodes.find(
        (code) => code.title === "create__transaction_details",
      );
      expect(createDetailCode).toBeDefined();

      // FK 컬럼은 참조 엔티티의 PK 타입(uuid)을 따라야 함
      expect(createDetailCode?.formatted).toContain('table.uuid("transaction_id")');
      expect(createDetailCode?.formatted).not.toContain('table.integer("transaction_id")');
    });

    test("String PK 엔티티 간 ManyToMany 관계", async () => {
      // 1. String PK를 가진 두 엔티티 등록
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const entityA = {
        id: "Article",
        table: "articles",
        title: "아티클",
        props: [
          { name: "id", type: "string", desc: "아티클 ID", length: 36 },
          { name: "title", type: "string", desc: "제목", length: 255 },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(entityA);

      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const entityB = {
        id: "Category",
        table: "categories",
        title: "카테고리",
        props: [
          { name: "id", type: "string", desc: "카테고리 ID", length: 20 },
          { name: "name", type: "string", desc: "카테고리명", length: 100 },
        ],
        indexes: [],
        subsets: {},
        enums: {},
      } as EntityJson;
      await EntityManager.register(entityB);

      // 2. Article에 ManyToMany 관계 추가 (mock 사용)
      mockEntityManagerGet("Article", (original) => ({
        ...original,
        props: [
          ...original.props,
          {
            type: "relation",
            name: "categories",
            with: "Category",
            desc: "카테고리들",
            relationType: "ManyToMany",
            joinTable: "articles__categories",
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
        ],
      }));

      const status = await migrator.getStatus();

      // Join 테이블 생성 코드 확인
      const createJoinTableCode = status.preparedCodes.find(
        (code) => code.title === "create__articles__categories",
      );
      expect(createJoinTableCode).toBeDefined();

      // Join 테이블의 FK 컬럼들이 각 엔티티의 PK 타입을 따라야 함
      expect(createJoinTableCode?.formatted).toContain('table.string("article_id", 36)');
      expect(createJoinTableCode?.formatted).toContain('table.string("category_id", 20)');
      expect(createJoinTableCode?.formatted).not.toContain('table.integer("article_id")');
      expect(createJoinTableCode?.formatted).not.toContain('table.integer("category_id")');
    });
  });

  // SON-395 issue
  describe("배열 타입 컬럼 length 처리", () => {
    test("string[] + length 컬럼 추가 시 varchar(N)[] 코드가 생성되어야 한다", async () => {
      mockEntityManagerGet("User", (original) => ({
        ...original,
        props: [
          ...original.props,
          {
            name: "tags",
            type: "string[]",
            length: 500,
            nullable: true,
            desc: "태그 배열",
          },
        ],
      }));

      const status = await migrator.getStatus();
      const alterCode = status.preparedCodes.find((code) => code.table === "users");

      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain(
        'table.specificType("tags", "varchar(500)[]").nullable()',
      );
      expect(alterCode?.formatted).not.toContain('"text[]"');
    });

    test("string[] + length 없는 컬럼 추가 시 text[] 코드가 생성되어야 한다", async () => {
      mockEntityManagerGet("User", (original) => ({
        ...original,
        props: [
          ...original.props,
          {
            name: "labels",
            type: "string[]",
            nullable: true,
            desc: "라벨 배열",
          },
        ],
      }));

      const status = await migrator.getStatus();
      const alterCode = status.preparedCodes.find((code) => code.table === "users");

      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain('table.specificType("labels", "text[]").nullable()');
      expect(alterCode?.formatted).not.toContain("varchar");
    });

    test("integer[] 컬럼 추가 시 integer[] 코드가 생성되어야 한다", async () => {
      mockEntityManagerGet("User", (original) => ({
        ...original,
        props: [
          ...original.props,
          {
            name: "scores",
            type: "integer[]",
            nullable: false,
            desc: "점수 배열",
          },
        ],
      }));

      const status = await migrator.getStatus();
      const alterCode = status.preparedCodes.find((code) => code.table === "users");

      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain(
        'table.specificType("scores", "integer[]").notNullable()',
      );
    });
  });
});
