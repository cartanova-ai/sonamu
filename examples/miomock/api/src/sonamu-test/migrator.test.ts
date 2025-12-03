import { type EntityJson, EntityManager, Migrator, Naite, Sonamu } from "sonamu";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";
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
        {
          connKey: "test",
          connString: `mysql2://${dbUser}@0.0.0.0:3306/miomock_test`,
          currentVersion: expect.any(String),
          name: "test",
          pending: [],
          status: 0,
        },
        {
          connKey: "fixture_remote",
          connString: `mysql2://${dbUser}@0.0.0.0:3306/miomock_fixture_remote`,
          currentVersion: expect.any(String),
          name: "fixture_remote",
          pending: [],
          status: 0,
        },
        {
          connKey: "development_master",
          connString: `mysql2://${dbUser}@0.0.0.0:3306/miomock`,
          currentVersion: expect.any(String),
          name: "development",
          pending: [],
          status: 0,
        },
        {
          connKey: "production_master",
          connString: `mysql2://${dbUser}@0.0.0.0:3306/miomock`,
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
            name: "test_column",
            type: "string",
            desc: "Test Column",
            length: 256,
          },
        ],
      }));
      const status = await migrator.getStatus();
      expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchSnapshot();

      const alterCode = status.preparedCodes.find((code) => code.table === "users");
      expect(alterCode).toBeDefined();
      expect(alterCode?.title).toBe("alter_users_add1");

      // up
      expect(alterCode?.formatted).toContain('table.string("test_column", 256).notNullable()');

      // down
      expect(alterCode?.formatted).toContain('table.dropColumns("test_column")');
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
      expect(alterCode?.title).toBe("alter_users_drop1");

      // up
      expect(alterCode?.formatted).toContain('table.dropColumns("deleted_at")');

      // down
      expect(alterCode?.formatted).toContain('table.datetime("deleted_at").nullable()');
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
      expect(alterCode?.title).toBe("alter_users_alter1");

      // up
      expect(alterCode?.formatted).toContain('table.datetime("deleted_at").notNullable()');
      expect(alterCode?.formatted).toContain('table.datetime("deleted_at").nullable()');

      // down
      expect(alterCode?.formatted).toContain('table.datetime("deleted_at").nullable()');
      expect(alterCode?.formatted).toContain('table.datetime("deleted_at").notNullable()');
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
      expect(alterCode?.title).toBe("alter_users_add1_drop1");

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
          { type: "index", columns: ["name"] },
          { type: "unique", columns: ["company_id"] },
          { type: "fulltext", columns: ["parent_id"], parser: "ngram" },
        ],
      }));
      const status = await migrator.getStatus();

      const alterCode = status.preparedCodes.find((code) => code.table === "departments");
      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toMatchInlineSnapshot(
        `
        "import type { Knex } from "knex";

        export async function up(knex: Knex): Promise<void> {
          await knex.schema.alterTable("departments", (table) => {
            table.index(["name"]);
            table.unique(["company_id"]);
          });
          await knex.raw(
            \`ALTER TABLE departments ADD FULLTEXT INDEX departments_parent_id_index (parent_id) WITH PARSER ngram\`,
          );
        }

        export async function down(knex: Knex): Promise<void> {
          return knex.schema.alterTable("departments", (table) => {
            table.dropIndex(["parent_id"]);
            table.dropIndex(["name"]);
            table.dropUnique(["company_id"]);
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
      expect(preparedCodes?.title).toBe("alter_users");

      // up
      expect(preparedCodes?.formatted).toContain('table.dropIndex(["bio"])');
      expect(preparedCodes?.formatted).toContain('table.dropUnique(["email"])');

      // down
      expect(preparedCodes?.formatted).toContain('table.index(["bio"], undefined, "FULLTEXT")');
      expect(preparedCodes?.formatted).toContain('table.unique(["email"])');
    });

    test("인덱스 변경 감지", async () => {
      // UserEntity의 fulltext 인덱스 컬럼 변경
      mockEntityManagerGet("User", (original) => ({
        ...original,
        indexes: [{ type: "fulltext", columns: ["bio", "username"] }],
      }));

      await migrator.getStatus();
      expect(Naite.get("migrator:getStatus:preparedCodes").first()).toMatchInlineSnapshot(`
        [
          {
            "formatted": "import type { Knex } from "knex";

        export async function up(knex: Knex): Promise<void> {
          await knex.schema.alterTable("users", (table) => {
            table.index(["bio", "username"], undefined, "FULLTEXT");
            table.dropIndex(["bio"]);
            table.dropUnique(["email"]);
          });
        }

        export async function down(knex: Knex): Promise<void> {
          return knex.schema.alterTable("users", (table) => {
            table.dropIndex(["bio", "username"]);
            table.index(["bio"], undefined, "FULLTEXT");
            table.unique(["email"]);
          });
        }
        ",
            "table": "users",
            "title": "alter_users",
            "type": "normal",
          },
        ]
      `);
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
      expect(alterCode?.title).toBe("alter_users_add1");

      // up
      expect(alterCode?.formatted).toContain(
        'table.integer("company_id").unsigned().notNullable()',
      );

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
      expect(alterCode?.title).toBe("alter_users_add1");

      // up
      expect(alterCode?.formatted).toContain(
        'table.integer("profile_id").unsigned().notNullable()',
      );

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
          { name: "id", type: "integer", unsigned: true, desc: "ID" },
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
      expect(createJoinTableCode?.formatted).toContain('table.uuid("uuid")');
      expect(createJoinTableCode?.formatted).toContain('table.unique(["uuid"])');

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
          { name: "id", type: "integer", unsigned: true, desc: "ID" },
          {
            name: "created_at",
            type: "timestamp",
            desc: "등록일시",
            dbDefault: "CURRENT_TIMESTAMP",
          },
          { name: "name", desc: "이름", type: "string", length: 255 },
          { name: "description", desc: "설명", type: "text", textType: "text", nullable: true },
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
          { name: "id", type: "integer", unsigned: true, desc: "ID" },
          {
            name: "created_at",
            type: "timestamp",
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

  describe("runAction", () => {
    describe("apply", () => {
      test("단일(test)DB에 마이그레이션 적용", async () => {
        // apply 실행 (test DB)
        const result = await migrator.runAction("apply", ["test"]);
        expect(Naite.get("migrator:runAction:action").first()).toBe("apply");
        expect(Naite.get("migrator:runAction:targets").first()).toEqual(["test"]);

        // then
        expect(result[0]?.connKey).toBe("test");
        expect(result[0]?.batchNo).toBeGreaterThan(1);
      });

      test("다중 DB 동시 적용", async () => {
        // when: 여러 DB에 병렬 적용, 각 DB별 독립적 결과
        const result = await migrator.runAction("apply", [
          "test",
          "fixture_remote",
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

  // SKIP: Shadow DB 테스트 실행 시 시간이 오래 걸려 필요시에만 확인
  describe.skip("runShadowTest", () => {
    test("Shadow DB 생성 및 마이그레이션 테스트 결과 확인", async () => {
      // when
      const result = await migrator.runShadowTest();

      expect(Naite.get("migrator:runShadowTest:tmpSqlPath").first()).toBe(
        "/tmp/miomock_test__migration_shadow.sql",
      );
      expect(result[0]).toMatchObject({
        applied: expect.any(Array),
        batchNo: expect.any(Number),
        connKey: "shadow",
      });
    });
  });

  // @TODO: DDL Transaction 이슈로 skip
  describe.skip("rollback", () => {});

  // @TODO: SchemaReader가 분리되어있지 않아 DB 상태를 조작할수없어서 skip (pending상태를 만들어줄 수 없음)
  describe.skip("delCodes", () => {
    test.todo("이미 applied된 파일은 삭제 불가");
    test.todo("pending 상태인 파일은 삭제 가능");
    test.todo("마이그레이션 파일이 존재하지 않을 시 삭제된 개수 반영 안됨");
  });

  describe("Integration - 통합 워크플로우", () => {
    test.todo("Entity 변경 → 코드 생성 → Shadow 테스트 → 적용 → 최신 상태");
    test.todo("생성 → 삭제 - preparedCodes 생성 → 파일 생성 → 파일 삭제 → pending 없어짐");
    test.todo("적용 → 롤백 - pending 적용 → status === 0 → 롤백 → pending 다시 생김");
    test.todo("실패 복구 - Shadow 테스트 실패 → 파일 수정 → 재시도 성공 → 적용");
    test.todo("다중 환경 동기화 - development 최신, 다른 DB 뒤쳐짐 → 일괄 적용 → 모든 DB 동기화");
    test.todo("Pending 누적 - pending 있는 상태에서 Entity 변경 → 새 코드 추가 → pending 누적");
  });
});
