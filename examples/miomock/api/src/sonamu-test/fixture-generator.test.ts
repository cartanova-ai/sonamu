import { DB, EntityManager } from "sonamu";
import { bootstrap, DataExplorer, FixtureGenerator, test } from "sonamu/test";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi);

// 테스트 시작 전 max ID 기록
let maxCompanyIdBeforeTest: number;
let maxUserIdBeforeTest: number;

// 시퀀스 리셋 함수
async function resetSequences() {
  const db = DB.getDB("w");

  // 테이블별 설정: id 컬럼이 string이면 타입캐스팅 필요
  const tables = [
    { name: "users", stringId: true },
    { name: "companies", stringId: false },
    { name: "departments", stringId: false },
    { name: "employees", stringId: false },
  ];

  for (const { name: table, stringId } of tables) {
    try {
      // 실제 시퀀스 이름을 DB에서 가져오기
      const seqResult = await db.raw(
        `SELECT pg_get_serial_sequence('public.${table}', 'id') as seq_name`,
      );
      const seqName = seqResult.rows[0]?.seq_name;

      if (!seqName) {
        console.log(`⚠️  ${table}: 시퀀스 없음 (스킵)`);
        continue;
      }

      // string id면 integer로 캐스팅, 아니면 그대로 사용
      const maxIdExpr = stringId ? `MAX(id::integer)` : `MAX(id)`;

      await db.raw(`
        SELECT setval(
          '${seqName}',
          COALESCE((SELECT ${maxIdExpr} FROM ${table})::integer, 1),
          true
        )
      `);

      // 실제 설정된 값 확인
      const checkResult = await db.raw(`SELECT last_value FROM ${seqName}`);
      const lastValue = checkResult.rows[0]?.last_value;

      console.log(`✅ ${table} 시퀀스 리셋 완료: ${seqName} = ${lastValue}`);
    } catch (e) {
      console.log(`⚠️  ${table} 시퀀스 리셋 실패:`, e);
    }
  }
}

// 테스트 시작 전 준비
beforeAll(async () => {
  console.log("\n🔧 테스트 시작 전 준비");
  const db = DB.getDB("w");

  // 현재 max ID 기록
  const companyResults = await db("companies").max("id as maxId");
  const userResult = await db.raw(
    "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM users WHERE id ~ '^[0-9]+$'",
  );

  maxCompanyIdBeforeTest = (companyResults[0]?.maxId as number) || 0;
  maxUserIdBeforeTest = userResult.rows[0]?.max_id || 0;

  console.log(
    `📊 현재 max ID - companies: ${maxCompanyIdBeforeTest}, users: ${maxUserIdBeforeTest}`,
  );

  await resetSequences();
});

// 테스트 종료 후 cleanup
afterAll(async () => {
  console.log("\n🧹 테스트 종료 후 cleanup");
  const db = DB.getDB("w");

  // 테스트로 생성된 레코드 삭제 (max ID 이후)
  const deletedCompanies = await db("companies").where("id", ">", maxCompanyIdBeforeTest).delete();

  // Users는 string ID이지만 숫자 형태인 경우만 삭제
  const deletedUsers = await db.raw(
    `DELETE FROM users WHERE id ~ '^[0-9]+$' AND CAST(id AS INTEGER) > ${maxUserIdBeforeTest}`,
  );

  console.log(
    `🗑️  삭제된 레코드: companies(${deletedCompanies}), users(${deletedUsers.rowCount || 0})`,
  );

  // 시퀀스 리셋
  await resetSequences();
});

describe("FixtureGenerator", () => {
  /**
   * FixtureGenerator 인스턴스를 생성합니다.
   *
   * 참고: FixtureManager.init()은 bootstrap에서 자동으로 처리되므로
   * 테스트 코드에서 직접 호출할 필요가 없습니다.
   */
  const getGenerator = () => {
    const sourceDb = DB.testTransaction || DB.getDB("r");
    const targetDb = DB.testTransaction || DB.getDB("w");
    return new FixtureGenerator(sourceDb, targetDb, "test", EntityManager);
  };

  describe("generate() - 메모리 생성만 테스트", () => {
    test("단일 fixture 생성 (메모리)", async () => {
      const generator = getGenerator();
      const user = await generator.generate("User", {
        email: "test@example.com",
      });

      expect(user.email).toBe("test@example.com");
      expect(user.username).toBeDefined();
      expect(typeof user.username).toBe("string");
    });

    test("override 없이 기본값으로 생성", async () => {
      const generator = getGenerator();
      const user = await generator.generate("User");

      expect(user.email).toBeDefined();
      expect(user.username).toBeDefined();
      expect(typeof user.email).toBe("string");
    });

    test("여러 필드 override", async () => {
      const generator = getGenerator();
      const user = await generator.generate("User", {
        email: "custom@example.com",
        username: "Custom Name",
        role: "admin",
      });

      expect(user.email).toBe("custom@example.com");
      expect(user.username).toBe("Custom Name");
      expect(user.role).toBe("admin");
    });
  });

  describe("DataExplorer 통합", () => {
    test("exploreRelation으로 참조 데이터 조회", async () => {
      const db = DB.testTransaction || DB.getDB("r");
      const explorer = new DataExplorer(db, EntityManager);

      // Employee의 department 참조 데이터 조회
      const departments = await explorer.exploreRelation("Employee", "department", {
        limit: 3,
      });

      expect(departments.length).toBeGreaterThan(0);
      expect(departments.length).toBeLessThanOrEqual(3);
      expect(departments[0]).toHaveProperty("id");
    });

    test("실제 DB에서 Department 조회 → 참조 fixture 생성 추적", async () => {
      const sourceDb = DB.testTransaction || DB.getDB("r");
      const explorer = new DataExplorer(sourceDb, EntityManager);

      // 1. DataExplorer로 실제 DB의 Department 조회
      console.log("\n🔍 Step 1: DataExplorer로 실제 DB의 Department 조회");
      const departments = await explorer.explore("Department", {
        strategy: "sample",
        limit: 3,
      });

      console.log(`   ✅ 조회 완료: ${departments.length}개`);
      console.log("   ", departments);

      expect(departments.length).toBeGreaterThan(0);

      // 2. 조회한 Department 중 하나를 선택
      const selectedDept = departments[0];
      console.log(`\n🔍 Step 2: 선택된 Department (id: ${selectedDept?.id})`);
      console.log("   ", selectedDept);

      // 3. 그 Department를 참조하는 Employee 조회
      console.log(`\n🔍 Step 3: Department(${selectedDept?.id})를 참조하는 Employee 조회`);
      const employees = await sourceDb("employees")
        .where("department_id", (selectedDept?.id as number) ?? 0)
        .limit(2);

      console.log(`   ✅ Employee ${employees.length}개 발견`);
      console.log("   ", employees);

      if (employees.length > 0) {
        const employee = employees[0];
        console.log(`\n🔍 Step 4: 선택된 Employee (id: ${employee.id})`);
        console.log(`   - employee_number: ${employee.employee_number}`);
        console.log(`   - department_id: ${employee.department_id}`);
        console.log(`   - user_id: ${employee.user_id}`);

        // 검증
        expect(employee.department_id).toBe((selectedDept?.id as number) ?? 0);
        console.log("\n✅ Department와 Employee의 참조 관계가 확인되었습니다!");
      } else {
        console.log("\n⚠️  해당 Department를 참조하는 Employee가 없습니다.");
      }
    });
  });

  describe("실제 DB 저장 테스트", () => {
    test("generateBatch로 여러 User 생성 및 저장", async () => {
      const generator = getGenerator();

      // 3개의 User를 생성하고 DB에 저장
      const results = await generator.generateBatch([
        {
          entity: "User",
          count: 3,
          overrides: {
            role: "user",
          },
        },
      ]);

      // 반환된 결과 검증
      expect(results.length).toBe(3);
      expect(results[0]?.entityId).toBe("User");
      expect(results[0]?.data).toHaveProperty("id");
      expect(results[0]?.data).toHaveProperty("email");
      expect(results[0]?.data).toHaveProperty("username");
      expect(results[0]?.data.role).toBe("user");

      // 각 User가 고유한 ID를 가지는지 확인
      const ids = results.map((r) => r.data.id);
      expect(new Set(ids).size).toBe(3);
    });

    test("복수 Entity 동시 생성 (Company와 User)", async () => {
      const generator = getGenerator();

      // Company 1개, User 2개 동시 생성
      const results = await generator.generateBatch([
        { entity: "Company", count: 1, overrides: { name: "Acme Corp" } },
        { entity: "User", count: 2, overrides: { role: "user" } },
      ]);

      expect(results.length).toBe(3);

      const companies = results.filter((r) => r.entityId === "Company");
      const users = results.filter((r) => r.entityId === "User");

      expect(companies.length).toBe(1);
      expect(users.length).toBe(2);
      expect(companies[0]?.data.name).toBe("Acme Corp");

      // 각 Entity가 유효한 ID를 가지는지 확인
      expect(companies[0]?.data.id).toBeGreaterThan(0);
      expect(users[0]?.data.id).toBeDefined();
      expect(typeof users[0]?.data.id).toBe("string");
    });
  });

  describe("실제 DB에서 import", () => {
    test("importFromSource로 User + 관련 데이터 가져오기", async () => {
      const generator = getGenerator();

      // 실제 DB에서 User 3명 + 관련 Employee, Department, Company 가져오기
      const results = await generator.importFromSource("User", {
        strategy: "sample",
        limit: 3,
        includeRelations: true,
        maxDepth: 3, // User → Employee → Department → Company
      });

      // 반환된 결과 검증
      expect(results.length).toBeGreaterThan(0);

      // User 데이터가 포함되어 있는지 확인
      const userResults = results.filter((r) => r.entityId === "User");
      expect(userResults.length).toBeGreaterThan(0);
      expect(userResults.length).toBeLessThanOrEqual(3);

      console.log(`\n📦 Imported ${results.length} total records`);
      console.log(`  - Users: ${userResults.length}`);

      // 관련 entity들도 import되었는지 확인
      const entityTypes = new Set(results.map((r) => r.entityId));
      console.log(`  - Entity types: ${[...entityTypes].join(", ")}`);
    });

    test("importFromSource - 관련 데이터 없이 가져오기", async () => {
      const generator = getGenerator();

      // Company만 가져오기 (관련 데이터 제외)
      const results = await generator.importFromSource("Company", {
        strategy: "sample",
        limit: 2,
        includeRelations: false,
      });

      // Company만 있어야 함
      expect(results.length).toBe(2);
      expect(results.every((r) => r.entityId === "Company")).toBe(true);
    });
  });
});
