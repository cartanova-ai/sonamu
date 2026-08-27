import { DB, EntityManager } from "sonamu";
import { bootstrap, DataExplorer, FixtureGenerator, test } from "sonamu/test";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { z } from "zod";

import {
  cleanupTestRecords,
  getFixtureMaxIds,
  resetSequencesToFixture,
} from "../testing/test-helpers";

bootstrap(vi);

// fixture-generator 테스트에서 insert된 레코드 ID 추적
const insertedUserIds = new Set<string>();
const insertedCompanyIds = new Set<number>();
const insertedDepartmentIds = new Set<number>();
const insertedEmployeeIds = new Set<number>();
const stringId = z.string();
const numericId = z.number();

// fixture 데이터의 max ID
let fixtureMaxIds: Awaited<ReturnType<typeof getFixtureMaxIds>>;

/** FixtureManager 초기화 후 테스트용 생성기를 현재 트랜잭션에 연결한다. */
const getGenerator = () => {
  const sourceDb = DB.getDB("fixture");
  const targetDb = DB.testTransaction || DB.getDB("w");
  return new FixtureGenerator(sourceDb, targetDb, "test", EntityManager);
};

// 테스트 시작 전 준비
beforeAll(async () => {
  console.log("\n🔧 테스트 시작 전 준비");

  fixtureMaxIds = await getFixtureMaxIds();
  console.log(
    `📊 fixture max ID - companies: ${fixtureMaxIds.companies}, users: ${fixtureMaxIds.users}`,
  );

  await resetSequencesToFixture(fixtureMaxIds);
});

// 테스트 종료 후 cleanup
afterAll(async () => {
  console.log("\n🧹 테스트 종료 후 cleanup");

  const deleted = await cleanupTestRecords(fixtureMaxIds);
  console.log(`🗑️  삭제된 레코드: companies(${deleted.companies}), users(${deleted.users})`);

  await resetSequencesToFixture(fixtureMaxIds);
});

describe("FixtureGenerator", () => {
  describe("generate() - 메모리 생성만 테스트", () => {
    test("단일 fixture 생성 (메모리)", async () => {
      const generator = getGenerator();
      const user = await generator.generate("User", {
        email: "test@example.com",
      });

      expect(user.email).toBe("test@example.com");
      expect(user.username).toBeDefined();
      expect(z.string().safeParse(user.username).success).toBe(true);
    });

    test("override 없이 기본값으로 생성", async () => {
      const generator = getGenerator();
      const user = await generator.generate("User");

      expect(user.email).toBeDefined();
      expect(user.username).toBeDefined();
      expect(z.string().safeParse(user.email).success).toBe(true);
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

      const departments = await explorer.explore("Department", {
        strategy: "sample",
        limit: 3,
      });

      expect(departments.length).toBeGreaterThan(0);
      expect(departments.length).toBeLessThanOrEqual(3);

      const selectedDept = departments[0];
      expect(selectedDept).toHaveProperty("id");
      expect(selectedDept).toHaveProperty("company_id");

      const selectedDepartmentId = numericId.parse(selectedDept?.id);
      const employees = await sourceDb("employees")
        .where("department_id", selectedDepartmentId)
        .limit(2);

      if (employees.length > 0) {
        const employee = employees[0];
        expect(employee).toHaveProperty("id");
        expect(employee).toHaveProperty("employee_number");
        expect(employee).toHaveProperty("user_id");
        expect(employee.department_id).toBe(selectedDepartmentId);
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

      // 반환된 결과 검증 (fixtureCompanions로 Account도 함께 생성됨)
      const userResults = results.filter((r) => r.entityId === "User");
      const accountResults = results.filter((r) => r.entityId === "Account");
      expect(userResults.length).toBe(3);
      expect(accountResults.length).toBe(3);
      expect(userResults[0]?.data).toHaveProperty("id");
      expect(userResults[0]?.data).toHaveProperty("email");
      expect(userResults[0]?.data).toHaveProperty("username");
      expect(userResults[0]?.data.role).toBe("user");

      // 각 User가 고유한 ID를 가지는지 확인
      const ids = userResults.map((r) => r.data.id);
      expect(new Set(ids).size).toBe(3);
    });

    test("복수 Entity 동시 생성 (Company와 User)", async () => {
      const generator = getGenerator();

      // Company 1개, User 2개 동시 생성
      const results = await generator.generateBatch([
        { entity: "Company", count: 1, overrides: { name: "Acme Corp" } },
        { entity: "User", count: 2, overrides: { role: "user" } },
      ]);

      // fixtureCompanions로 Account도 함께 생성되므로 총 5개 (1 Company + 2 User + 2 Account)
      expect(results.length).toBe(5);

      const companies = results.filter((r) => r.entityId === "Company");
      const users = results.filter((r) => r.entityId === "User");

      expect(companies.length).toBe(1);
      expect(users.length).toBe(2);
      expect(companies[0]?.data.name).toBe("Acme Corp");

      // 각 Entity가 유효한 ID를 가지는지 확인
      expect(companies[0]?.data.id).toBeGreaterThan(0);
      expect(users[0]?.data.id).toBeDefined();
      expect(stringId.safeParse(users[0]?.data.id).success).toBe(true);
    });
  });

  describe("fixtureCompanions - User 생성 시 Account 자동 생성", () => {
    test("User 1개 생성 시 Account 1개 자동 생성", async () => {
      const generator = getGenerator();

      const results = await generator.generateBatch([{ entity: "User", count: 1 }]);

      const userResults = results.filter((r) => r.entityId === "User");
      const accountResults = results.filter((r) => r.entityId === "Account");

      expect(userResults.length).toBe(1);
      expect(accountResults.length).toBe(1);

      if (!userResults[0] || !accountResults[0]) {
        throw new Error("userResults 또는 accountResults가 비어 있습니다");
      }
      const user = userResults[0];
      const account = accountResults[0];

      // FK 연결 확인
      expect(account.data.user_id).toBe(user.data.id);
      // {{email}} 템플릿 치환 확인
      expect(account.data.account_id).toBe(user.data.email);
      // 고정 override 확인
      expect(account.data.provider_id).toBe("credential");
    });

    test("User N개 생성 시 Account N개 자동 생성 (1:1 매핑)", async () => {
      const generator = getGenerator();

      const results = await generator.generateBatch([{ entity: "User", count: 3 }]);

      const userResults = results.filter((r) => r.entityId === "User");
      const accountResults = results.filter((r) => r.entityId === "Account");

      expect(userResults.length).toBe(3);
      expect(accountResults.length).toBe(3);

      // 각 User에 대해 매핑되는 Account가 정확히 1개씩 존재하는지 확인
      for (const user of userResults) {
        const matched = accountResults.filter((a) => a.data.user_id === user.data.id);
        expect(matched.length).toBe(1);
        expect(matched[0]?.data.account_id).toBe(user.data.email);
      }
    });

    test("DB에 Account가 실제 저장되었는지 확인", async () => {
      const generator = getGenerator();
      const db = DB.getDB("w");

      const results = await generator.generateBatch([{ entity: "User", count: 1 }]);

      const user = results.find((r) => r.entityId === "User");
      if (!user) {
        throw new Error("User 결과를 찾을 수 없습니다");
      }
      const accountFromResult = results.find((r) => r.entityId === "Account");
      console.log("user.data.id:", user.data.id);
      console.log("accountFromResult:", accountFromResult?.data);
      const allAccounts = await db("accounts").select("id", "user_id").limit(5);
      console.log("accounts in DB:", allAccounts);

      const dbAccount = await db("accounts").where("user_id", user.data.id).first();

      expect(dbAccount).toBeDefined();
      expect(dbAccount.provider_id).toBe("credential");
      expect(dbAccount.account_id).toBe(user.data.email);
    });
  });

  describe("fixture DB에서 test DB로 import", () => {
    afterEach(async () => {
      // import 테스트에서 insert된 레코드를 각 테스트 후 즉시 삭제
      const db = DB.getDB("w");

      if (insertedUserIds.size > 0) {
        const userIdsArray = Array.from(insertedUserIds);
        await db("users").whereIn("id", userIdsArray).delete();
        insertedUserIds.clear();
      }

      if (insertedEmployeeIds.size > 0) {
        await db("employees").whereIn("id", Array.from(insertedEmployeeIds)).delete();
        insertedEmployeeIds.clear();
      }

      if (insertedDepartmentIds.size > 0) {
        await db("departments").whereIn("id", Array.from(insertedDepartmentIds)).delete();
        insertedDepartmentIds.clear();
      }

      if (insertedCompanyIds.size > 0) {
        await db("companies").whereIn("id", Array.from(insertedCompanyIds)).delete();
        insertedCompanyIds.clear();
      }
    });

    test("importFromSource로 User + 관련 데이터 가져오기", async () => {
      const generator = getGenerator();

      // fixture DB에서 User 3명 + 관련 Employee, Department, Company 가져오기
      const results = await generator.importFromSource("User", {
        strategy: "sample",
        limit: 3,
        includeRelations: true,
        maxDepth: 3, // User → Employee → Department → Company
      });

      // insert된 ID 추적
      results.forEach((result) => {
        if (result.entityId === "User") {
          insertedUserIds.add(stringId.parse(result.data.id));
        } else if (result.entityId === "Employee") {
          insertedEmployeeIds.add(numericId.parse(result.data.id));
        } else if (result.entityId === "Department") {
          insertedDepartmentIds.add(numericId.parse(result.data.id));
        } else if (result.entityId === "Company") {
          insertedCompanyIds.add(numericId.parse(result.data.id));
        }
      });

      // 반환된 결과 검증
      expect(results.length).toBeGreaterThan(0);

      // User 데이터가 포함되어 있는지 확인
      const userResults = results.filter((r) => r.entityId === "User");
      expect(userResults.length).toBeGreaterThan(0);
      expect(userResults.length).toBeLessThanOrEqual(3);

      // 각 결과가 유효한 데이터를 가지는지 확인
      userResults.forEach((result) => {
        expect(result.entityId).toBe("User");
        expect(result.data).toBeDefined();
        expect(result.data.id).toBeDefined();
      });
    });

    test("importFromSource - 관련 데이터 없이 가져오기", async () => {
      const generator = getGenerator();

      // Company만 가져오기 (관련 데이터 제외)
      const results = await generator.importFromSource("Company", {
        strategy: "sample",
        limit: 2,
        includeRelations: false,
      });

      // insert된 ID 추적
      results.forEach((result) => {
        insertedCompanyIds.add(numericId.parse(result.data.id));
      });

      // Company만 있어야 함
      expect(results.length).toBe(2);
      expect(results.every((r) => r.entityId === "Company")).toBe(true);

      // 각 결과가 유효한 데이터를 가지는지 확인
      results.forEach((result) => {
        expect(result.data).toBeDefined();
        expect(result.data.id).toBeDefined();
        expect(result.data.name).toBeDefined();
      });
    });

    test("importFromSource - 관계 체인 자동 import 검증 (User → Employee → Department → Company)", async () => {
      const generator = getGenerator();

      // User 1명 + 관계 체인 전체를 가져오기
      const results = await generator.importFromSource("User", {
        strategy: "sample",
        limit: 1,
        includeRelations: true,
        maxDepth: 3, // User → Employee → Department → Company
      });

      // insert된 ID 추적
      results.forEach((result) => {
        if (result.entityId === "User") {
          insertedUserIds.add(stringId.parse(result.data.id));
        } else if (result.entityId === "Employee") {
          insertedEmployeeIds.add(numericId.parse(result.data.id));
        } else if (result.entityId === "Department") {
          insertedDepartmentIds.add(numericId.parse(result.data.id));
        } else if (result.entityId === "Company") {
          insertedCompanyIds.add(numericId.parse(result.data.id));
        }
      });

      // 결과 검증
      expect(results.length).toBeGreaterThan(0);

      // 결과 분석: 엔티티별 개수 확인
      const entityCounts = results.reduce<Record<string, number>>((acc, r) => {
        acc[r.entityId] = (acc[r.entityId] || 0) + 1;
        return acc;
      }, {});

      // User는 반드시 import되어야 함
      expect(entityCounts.User).toBeGreaterThan(0);

      // Employee가 있는 User를 가져왔다면, 관계 체인이 모두 import되었는지 검증
      if (entityCounts.Employee) {
        expect(entityCounts.Department).toBeGreaterThan(0);
        expect(entityCounts.Company).toBeGreaterThan(0);
      }
    });
  });
});
