import { type EntityJson, EntityManager, GenMigrationCode, Migrator, Naite, Sonamu } from "sonamu";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

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

  afterEach(async () => {
    await EntityManager.reload();
  });

  describe("getStatus", () => {
    test("마이그레이션 최신 상태 확인", async () => {
      const status = await migrator.getStatus();

      // codes 검증
      Naite.expect("getMigrationCodes:results").toHaveLength(13);
      expect(status.codes).toHaveLength(13);
      expect(status.codes[0]).toHaveProperty("name");
      expect(status.codes[0]).toHaveProperty("path");

      // 각 DB 상태 검증
      const statuses = Naite.get("getStatus:status");
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
      Naite.expect("getStatus:status").toMatchSnapshot();

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

      Naite.expect("getStatus:conns").toMatchSnapshot();

      // production, development, test, fixture_remote
      Naite.expect("getStatus:conns").toHaveLength(4);
    });
  });

  describe("preparedCodes 생성", () => {
    test("컬럼 추가 감지", async () => {
      // given
      // UserEntity에 test_column 컬럼 추가
      const userEntity = EntityManager.get("User");
      userEntity.props.push({
        name: "test_column",
        type: "string",
        desc: "Test Column",
        length: 256,
      });

      const status = await migrator.getStatus();

      // preparedCodes 스냅샷
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      status.preparedCodes.forEach((code) => {
        expect(code.table).toContain("users");
        expect(code.title).toContain("alter_users_add1");
        expect(code.type).toContain("normal");
      });
    });

    test("컬럼 삭제 감지", async () => {
      // Entity에서 props 제거 → alter_drop 코드
      const userEntity = EntityManager.get("User");
      userEntity.props = userEntity.props.filter((prop) => prop.name !== "deleted_at");

      const status = await migrator.getStatus();

      // preparedCodes 스냅샷
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      status.preparedCodes.forEach((code) => {
        expect(code.table).toContain("users");
        expect(code.title).toContain("alter_users_drop1");
        expect(code.type).toContain("normal");
      });
    });

    test("컬럼 속성 변경 감지", async () => {
      // userEntity의 deleted_at 컬럼의 nullable 속성을 false에서 true로 변경
      const userEntity = EntityManager.get("User");
      userEntity.props
        .filter((p) => p.name === "deleted_at")
        .forEach((p) => {
          p.nullable = false;
        });

      const status = await migrator.getStatus();

      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      status.preparedCodes.forEach((code) => {
        expect(code.table).toContain("users");
        expect(code.title).toContain("alter_users_alter1");
        expect(code.type).toContain("normal");
      });
    });

    test("컬럼 이름 변경 감지 (Drop & Add)", async () => {
      // UserEntity의 username 컬럼을 full_name으로 변경
      const userEntity = EntityManager.get("User");
      const nameProp = userEntity.props.find((p) => p.name === "username");
      expect(nameProp).toBeDefined();
      if (nameProp) {
        nameProp.name = "full_name";
      }

      const status = await migrator.getStatus();

      // preparedCodes 스냅샷
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      // then: drop 1, add 1 발생
      const alterCode = status.preparedCodes.find((code) => code.title.startsWith("alter_users_"));
      expect(alterCode).toBeDefined();
      expect(alterCode?.title).toContain("add1");
      expect(alterCode?.title).toContain("drop1");

      expect(alterCode?.formatted).toContain("// add");
      expect(alterCode?.formatted).toContain('table.string("full_name", 255).notNullable()');
      expect(alterCode?.formatted).toContain("// drop columns");
      expect(alterCode?.formatted).toContain('table.dropColumns("username")');
    });

    test("인덱스 추가 감지 (Normal, Unique)", async () => {
      // UserEntity에 인덱스 추가
      const userEntity = EntityManager.get("User");
      userEntity.indexes.push({
        type: "index",
        columns: ["email", "username"],
      });
      userEntity.indexes.push({
        type: "unique",
        columns: ["email"],
      });

      const status = await migrator.getStatus();
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      const alterCode = status.preparedCodes.find(
        (code) => code.table === "users" && code.type === "normal",
      );
      expect(alterCode).toBeDefined();
      expect(alterCode?.formatted).toContain('table.index(["email", "username"])');
      expect(alterCode?.formatted).toContain('table.unique(["email"])');
    });

    test("인덱스 삭제 감지", async () => {
      // UserEntity의 기존 인덱스 삭제 (fulltext index)
      const userEntity = EntityManager.get("User");
      userEntity.indexes = [];

      const status = await migrator.getStatus();
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      const alterCode = status.preparedCodes.find(
        (code) => code.table === "users" && code.type === "normal",
      );
      expect(alterCode).toBeDefined();
      // fulltext index drop
      expect(alterCode?.formatted).toContain('table.dropIndex(["bio"])');
    });

    test("인덱스 변경 감지", async () => {
      // UserEntity의 fulltext 인덱스 컬럼 변경
      const userEntity = EntityManager.get("User");
      const ftIndex = userEntity.indexes.find((i) => i.type === "fulltext");
      if (ftIndex) {
        ftIndex.columns = ["bio", "username"];
      }

      const status = await migrator.getStatus();
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      const alterCode = status.preparedCodes.find(
        (code) => code.table === "users" && code.type === "normal",
      );
      expect(alterCode).toBeDefined();
      // 이전 인덱스 drop
      expect(alterCode?.formatted).toContain('table.dropIndex(["bio"])');
      // 새로운 인덱스 추가
      expect(alterCode?.formatted).toContain(
        "ALTER TABLE users ADD FULLTEXT INDEX users_bio_username_index (bio, username) WITH PARSER ngram",
      );
    });

    test("FK 추가 감지", async () => {
      // UserEntity에 Company에 대한 BelongsToOne relation 추가
      const userEntity = EntityManager.get("User");
      userEntity.props.push({
        type: "relation",
        name: "company",
        with: "Company",
        desc: "회사",
        relationType: "BelongsToOne",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });

      const status = await migrator.getStatus();
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      // then
      const addCompanyIdCode = status.preparedCodes[0];
      const addCompanyFKConstraintCode = status.preparedCodes[1];

      expect(status.preparedCodes).toHaveLength(2);
      expect(addCompanyIdCode?.title).toBe("alter_users_add1");
      expect(addCompanyIdCode?.formatted).toContain(
        'table.integer("company_id").unsigned().notNullable()',
      );

      expect(addCompanyFKConstraintCode?.title).toBe("alter_users_foreigns");
      expect(addCompanyFKConstraintCode?.formatted).toContain(
        'table.foreign("company_id").references("companies.id").onUpdate("CASCADE").onDelete("CASCADE")',
      );
    });

    test("FK 삭제 감지", async () => {
      // UserEntity에 FK 추가
      const userEntity = EntityManager.get("User");
      userEntity.props.push({
        type: "relation",
        name: "company",
        with: "Company",
        desc: "회사",
        relationType: "BelongsToOne",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });

      // FK 추가 후 상태 확인
      let status = await migrator.getStatus();
      expect(status.preparedCodes.length).toBeGreaterThan(0);

      // FK 제거
      const companyPropIndex = userEntity.props.findIndex((p) => p.name === "company");
      if (companyPropIndex !== -1) {
        userEntity.props.splice(companyPropIndex, 1);
      }

      status = await migrator.getStatus();
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      // company_id 컬럼이 삭제되는 것을 확인 (FK도 함께 삭제됨)
      expect(status.preparedCodes.length).toBe(0); // 이미 DB에 추가된 적이 없으므로 코드가 생성되지 않음
    });

    test("FK 변경 감지 (onUpdate/onDelete)", async () => {
      // UserEntity에 FK 추가 (RESTRICT)
      const userEntity = EntityManager.get("User");
      userEntity.props.push({
        type: "relation",
        name: "company",
        with: "Company",
        desc: "회사",
        relationType: "BelongsToOne",
        onUpdate: "RESTRICT",
        onDelete: "RESTRICT",
      });

      // 먼저 이 상태로 코드 생성
      let status = await migrator.getStatus();
      expect(status.preparedCodes.length).toBeGreaterThan(0);

      // onUpdate/onDelete를 CASCADE로 변경
      const companyProp = userEntity.props.find((p) => p.name === "company");
      if (
        companyProp &&
        companyProp.type === "relation" &&
        companyProp.relationType === "BelongsToOne"
      ) {
        companyProp.onUpdate = "CASCADE";
        companyProp.onDelete = "CASCADE";
      }

      status = await migrator.getStatus();
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      // FK 변경 코드 확인
      const foreignCode = status.preparedCodes.find(
        (code) => code.table === "users" && code.title.includes("foreigns"),
      );
      expect(foreignCode).toBeDefined();
      expect(foreignCode?.formatted).toContain("CASCADE");
    });

    test("신규 테이블 감지", async () => {
      // 새 Entity 등록 → create 코드
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
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

      // then
      const createTableCode = status.preparedCodes.find(
        (code) => code.title === "create__test_entities",
      );

      expect(createTableCode).toBeDefined();
      expect(createTableCode?.type).toBe("normal");
      expect(createTableCode?.table).toBe("test_entities");
      expect(createTableCode?.formatted).toContain('knex.schema.createTable("test_entities"');
      expect(createTableCode?.formatted).toContain("table.increments().primary()");
      expect(createTableCode?.formatted).toContain('table.string("name", 255).notNullable()');
      expect(createTableCode?.formatted).toContain('table.text("description").nullable()');
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
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();

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

    test("조인테이블 (ManyToMany)", async () => {
      // given: User와 Label 간의 ManyToMany 관계 추가
      const userEntity = EntityManager.get("User");

      // 1. Lable 엔티티 생성
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
      userEntity.props.push({
        type: "relation",
        name: "labels",
        with: "Label",
        desc: "라벨",
        relationType: "ManyToMany",
        joinTable: "users__labels",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });

      // when
      await migrator.getStatus();

      // then
      const preparedCodes: GenMigrationCode[] = Naite.get('getStatus:preparedCodes');
      Naite.expect("getStatus:preparedCodes").toMatchSnapshot();
      expect(preparedCodes.length).toBe(3)

      // Label 테이블 생성 코드
      const createLableCode = preparedCodes[0]
      expect(createLableCode).toBeDefined();
      expect(createLableCode?.title).toBe("create__labels");

      // 조인테이블 (users__labels) 생성 코드
      const createJoinTableCode = preparedCodes[1]
      expect(createJoinTableCode).toBeDefined();
      expect(createJoinTableCode?.title).toBe("create__users__labels");
      // 생성된 조인테이블의 컬럼 user_id, label_id, uuid
      expect(createJoinTableCode?.formatted).toContain("user_id");
      expect(createJoinTableCode?.formatted).toContain("label_id");
      expect(createJoinTableCode?.formatted).toContain('table.uuid("uuid")');
      expect(createJoinTableCode?.formatted).toContain('table.unique(["uuid"])');

      // 조인테이블 FK 생성 코드
      const user_lable_FKCode = preparedCodes[2];
      expect(user_lable_FKCode).toBeDefined();
      expect(user_lable_FKCode?.title).toBe("foreign__users__labels__user_id_label_id");
      // FK가 users.id와 labels.id를 참조하는지 확인
      expect(user_lable_FKCode?.formatted).toContain('references("users.id")');
      expect(user_lable_FKCode?.formatted).toContain('references("labels.id")');
      expect(user_lable_FKCode?.formatted).toContain("CASCADE");
    });
  });

  describe("runAction", () => {
    describe("apply", () => {
      test("단일(test)DB에 마이그레이션 적용", async () => {
        // apply 실행 (test DB)
        const result = await migrator.runAction("apply", ["test"]);
        Naite.expect("runAction:action").toBe("apply");
        Naite.expect("runAction:targets").toEqual(["test"]);
        Naite.expect("runAction:result").toMatchSnapshot();

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

  describe("runShadowTest", () => {
    test("Shadow DB 생성 및 마이그레이션 테스트 결과 확인", async () => {
      // when
      const result = await migrator.runShadowTest();

      Naite.expect("runShadowTest:tmpSqlPath").toBe("/tmp/miomock_test__migration_shadow.sql");
      expect(result[0]).toMatchObject({
        applied: expect.any(Array),
        batchNo: expect.any(Number),
        connKey: "shadow",
      });
    });
  });

  // @TODO: DDL Transaction 이슈로 skip
  describe.skip("rollback", () => {});

  // @TODO: DDL Transaction 이슈로 skip (pending상태를 만들어줄 수 없음)
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
