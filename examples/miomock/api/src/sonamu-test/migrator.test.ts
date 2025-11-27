import { type EntityJson, EntityManager, Migrator, Naite, Sonamu } from "sonamu";
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

    test.todo("조인테이블 포함");
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

      test("Shadow DB 테스트", async () => {
        // apply 전 runShadowTest 호출됨
      });
    });
  });

  // @TODO: DDL Transaction 이슈로 skip
  describe.skip("rollback", () => {});

  describe.skip("delCodes", () => {
    test("pending 파일 삭제 성공", async () => {
      // 모든 DB에서 미적용 파일만 삭제 가능
    });

    test("적용된 파일 삭제 불가", async () => {
      // 하나라도 적용된 파일은 에러 throw
    });

    test("존재하지 않는 파일은 스킵", async () => {
      // 에러 없이 0 반환
    });
  });

  describe.skip("runShadowTest", () => {
    test("Shadow DB 생성 및 마이그레이션 테스트", async () => {
      // test DB → test__migration_shadow 생성
      // mysqldump → sed 치환 → migrate.latest()
    });

    test("테스트 완료 후 Shadow DB 삭제", async () => {
      // cleanup 확인
    });

    test("마이그레이션 실패 시 에러", async () => {
      // migrate.latest() 실패 → ServiceUnavailableException
      // cleanup은 여전히 실행
    });
  });

  describe.todo("Integration - 통합 워크플로우", () => {
    test.todo(
      "Entity 변경 → 적용 - 초기 상태 → Entity 변경 → preparedCodes 생성 → 파일 생성 → Shadow 테스트 → 적용 → 최신 상태 확인",
    );
    test.todo("생성 → 삭제 - preparedCodes 생성 → 파일 생성 → 파일 삭제 → pending 없어짐");
    test.todo("적용 → 롤백 - pending 적용 → status === 0 → 롤백 → pending 다시 생김");
    test.todo("실패 복구 - Shadow 테스트 실패 → 파일 수정 → 재시도 성공 → 적용");
    test.todo("다중 환경 동기화 - development 최신, 다른 DB 뒤쳐짐 → 일괄 적용 → 모든 DB 동기화");
    test.todo("Pending 누적 - pending 있는 상태에서 Entity 변경 → 새 코드 추가 → pending 누적");
  });
});
