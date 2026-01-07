import {
  type EntityJson,
  EntityManager,
  type MigrationStatus,
  Migrator,
  Naite,
  Sonamu,
} from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";
import { mockEntityManagerGet } from "../testing/test-helpers";

bootstrap(vi);
describe("Migrator test", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    // Sonamu가 테스팅 로드된 상태이므로 다시 초기화
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);

    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  describe("getStatus", () => {
    test("마이그레이션 최신 상태 확인", async () => {
      const status = await migrator.getStatus();

      // codes 검증
      expect(Naite.get("migrator:getMigrationCodes:results").first()).toBeDefined();
      expect(status.codes).toBeDefined();
      expect(status.codes[0]).toHaveProperty("name");
      expect(status.codes[0]).toHaveProperty("path");

      // 각 DB 상태 검증
      const statuses = Naite.get("migrator:getStatus:status").result();
      expect(statuses[0]).toBe(0); // test
      expect(statuses[1]).toBe(0); // fixture_remote
      expect(statuses[2]).toBe(0); // development
      expect(statuses[3]).toBe(0); // production

      // conns 구조 검증
      expect(status.conns).toHaveLength(4);
      status.conns.forEach((conn) => {
        expect(conn).toHaveProperty("name");
        expect(conn).toHaveProperty("connKey");
        expect(conn).toHaveProperty("connString");
        expect(conn).toHaveProperty("currentVersion");
        expect(conn).toHaveProperty("status");
        expect(conn).toHaveProperty("pending");
        expect(conn.status).toBe(0);
        expect(conn.pending).toEqual([]);
      });

      // preparedCodes 검증 (Entity와 DB 일치 시 빈 배열)
      expect(status.preparedCodes).toEqual([]);
    });

    test("일부 DB 미적용 상태 확인", async () => {
      // given: test DB에 미적용 마이그레이션 코드가 있는 상태

      const status = await migrator.getStatus();

      // statuses 스냅샷
      expect(Naite.get("migrator:getStatus:status").result()).toMatchSnapshot();

      // pending이 있는 DB 확인
      const pendingConns = status.conns.filter((conn) => conn.pending.length > 0);
      if (pendingConns.length > 0) {
        pendingConns.forEach((conn) => {
          expect(conn.status).toBeGreaterThan(0);
          expect(Array.isArray(conn.pending)).toBe(true);
        });
      }
    });

    test("각 db의 connections 확인", async () => {
      await migrator.getStatus();

      const dbUser = Sonamu.config.database.defaultOptions.connection?.user ?? "root";
      expect(Naite.get("migrator:getStatus:conns").first()).toMatchObject([
        // 이거 아래에 나타나는 순서가 중요한 테스트입니다!
        // 이 순서는 Sonamu UI의 DB Migration 탭에 표시되는 순서와 동일합니다.
        {
          connKey: "test",
          connString: `pg://${dbUser}@0.0.0.0:5432/miomock_test`,
          currentVersion: expect.any(String),
          name: "test",
          pending: [],
          status: 0,
        },
        {
          connKey: "fixture",
          connString: `pg://${dbUser}@0.0.0.0:5432/miomock_fixture`,
          currentVersion: expect.any(String),
          name: "fixture",
          pending: [],
          status: 0,
        },
        {
          connKey: "development_master",
          connString: `pg://${dbUser}@0.0.0.0:5432/miomock`,
          currentVersion: expect.any(String),
          name: "development",
          pending: [],
          status: 0,
        },
        {
          connKey: "production_master",
          connString: `pg://${dbUser}@0.0.0.0:5432/miomock`,
          currentVersion: expect.any(String),
          name: "production",
          pending: [],
          status: 0,
        },
      ]);

      // production, development, test, fixture_remote
      expect(Naite.get("migrator:getStatus:conns").first()).toHaveLength(4);
    });
  });

  describe("preparedCodes 생성", () => {
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
      expect(alterCode?.title).toBe("alter_users_add2_alter4");

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
      expect(alterCode?.title).toBe("alter_users_drop1_alter3");

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
      expect(alterCode?.title).toBe("alter_users_alter4");

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
      expect(alterCode?.title).toBe("alter_users_add1_drop1_alter4");

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
      expect(preparedCodes?.title).toBe("alter_users_alter4");

      // up
      expect(preparedCodes?.formatted).toContain(
        'table.dropIndex(["email"], "users_email_unique")',
      );

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
        console.log(alterCode);
        expect(alterCode).toBeDefined();
        expect(alterCode?.title).toBe("alter_users_alter4");

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
        expect(alterCode?.title).toBe("alter_users_alter4");

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
        expect(alterCode?.title).toBe("alter_users_alter4");

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
      expect(alterCode?.title).toBe("alter_users_add1_alter4");

      // up
      expect(alterCode?.formatted).toContain('table.integer("company_id").notNullable()');

      // down
      expect(alterCode?.formatted).toContain('table.dropColumns("company_id")');
    });

    test("FK 추가 감지 (OneToOne)", async () => {
      // UserEntity에 Profile에 대한 OneToOne relation 추가
      mockEntityManagerGet("User", (original) => ({
        ...original,
        props: [
          ...original.props,
          {
            type: "relation",
            name: "profile",
            with: "Profile",
            desc: "프로필",
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
      expect(alterCode?.title).toBe("alter_users_add1_alter4");

      // up
      expect(alterCode?.formatted).toContain('table.integer("profile_id").notNullable()');

      // down
      expect(alterCode?.formatted).toContain('table.dropColumns("profile_id")');
      // unique constraint
      // expect(addProfileFKConstraintCode?.formatted).toContain('table.unique(["profile_id"])');
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
  });

  describe.skip("runAction", () => {
    describe("apply", () => {
      test("단일(test)DB에 마이그레이션 적용", async () => {
        // apply 실행 (test DB)
        const result = await migrator.runAction("apply", ["test"]);
        expect(Naite.get("migrator:runAction:action").first()).toBe("apply");
        expect(Naite.get("migrator:runAction:targets").first()).toEqual(["test"]);

        // then
        expect(result[0]?.connKey).toBe("test");
        expect(result[0]?.batchNo).toBe(3);
      });

      test("다중 DB 동시 적용", async () => {
        // when: 여러 DB에 병렬 적용, 각 DB별 독립적 결과
        const result = await migrator.runAction("apply", [
          "test",
          "fixture",
          "development_master",
          "production_master",
        ]);

        // development와 production은 동일한 DB를 가리키고 있기 때문에 총 3개의 DB가 적용되어야 함
        expect(result).toHaveLength(3);
        expect(result[0]?.connKey).toBe("test");
        expect(result[0]?.batchNo).toBeGreaterThan(1);

        expect(result[1]?.connKey).toBe("fixture_remote");
        expect(result[1]?.batchNo).toBeGreaterThan(1);

        expect(result[2]?.connKey).toBe("development_master");
        expect(result[2]?.batchNo).toBeGreaterThan(1);
      });
    });
  });

  describe("runShadowTest", () => {
    test("Shadow DB 생성 및 마이그레이션 테스트 결과 확인", async () => {
      // when
      const result = await migrator.runShadowTest();

      expect(result[0]).toMatchObject({
        applied: expect.any(Array),
        batchNo: expect.any(Number),
        connKey: "shadow",
      });
    });
  });

  describe("validateDeletableCodes", () => {
    const mockConns = [
      {
        status: 0,
        pending: [
          "20251206_add_column1[pending]",
          "20251206_alter_column2[pending]",
          "20251206_drop_column3[pending]",
        ],
      },
    ] as MigrationStatus["conns"];

    test("pending 상태인 파일은 검증 통과", () => {
      const result = migrator.validateDeletable(mockConns, [
        "20251206_add_column1[pending]",
        "20251206_alter_column2[pending]",
        "20251206_drop_column3[pending]",
      ]);

      expect(result.canDelete).toBe(true);
      expect(result.appliedCodes).toEqual([]);
    });

    test("applied 상태인 파일은 검증 불가", () => {
      const result = migrator.validateDeletable(mockConns, ["20251206_add_column1[applied]"]);

      expect(result.canDelete).toBe(false);
      expect(result.appliedCodes).toEqual(["20251206_add_column1[applied]"]);
    });

    test("mixed - 일부만 pending 상태인 경우", () => {
      const result = migrator.validateDeletable(mockConns, [
        "20251206_add_column1[applied]",
        "20251206_alter_column2[pending]",
      ]);

      expect(result.canDelete).toBe(false);
      expect(result.appliedCodes).toEqual(["20251206_add_column1[applied]"]);
    });

    test("여러 DB 중 하나라도 applied 상태인 경우", () => {
      const multiConns = [
        {
          status: 0,
          pending: ["20251206_add_column1[pending]"],
        },
        {
          status: 0,
          pending: [],
        }, // 여기선 applied
      ] as MigrationStatus["conns"];

      const result = migrator.validateDeletable(multiConns, ["20251206_add_column1[pending]"]);

      expect(result.canDelete).toBe(false);
      expect(result.appliedCodes).toEqual(["20251206_add_column1[pending]"]);
    });
  });

  describe("Integration - 통합 워크플로우", () => {
    test.todo("Entity 변경 → 코드 생성 → Shadow 테스트 → 적용 → 최신 상태");
    test.todo("생성 → 삭제 - preparedCodes 생성 → 파일 생성 → 파일 삭제 → pending 없어짐");
    test.todo("적용 → 롤백 - pending 적용 → status === 0 → 롤백 → pending 다시 생김");
    test.todo("실패 복구 - Shadow 테스트 실패 → 파일 수정 → 재시도 성공 → 적용");
    test.todo("다중 환경 동기화 - development 최신, 다른 DB 뒤쳐짐 → 일괄 적용 → 모든 DB 동기화");
    test.todo("Pending 누적 - pending 있는 상태에서 Entity 변경 → 새 코드 추가 → pending 누적");
  });

  describe("Generated Column", () => {
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
      expect(alterCode?.title).toBe("alter_users_add1_alter4");

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
      expect(alterCode?.title).toBe("alter_users_add2_alter4");

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
      expect(alterCode?.title).toBe("alter_departments_add1_drop1_alter1");

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
      expect(alterCode?.title).toBe("alter_departments_add1_drop1_alter1");

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
});
