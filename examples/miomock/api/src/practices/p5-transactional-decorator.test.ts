import { describe, test, expect, beforeEach } from "vitest";
import { bootstrap } from "../testing/bootstrap";
import { BaseModelClass, transactional, api } from "sonamu";
import { UserSaveParams } from "../application/user/user.types";
import assert from "assert";

bootstrap();

/**
 * @transactional 데코레이터 테스트
 */
class TransactionalTestModelClass extends BaseModelClass {
  modelName = "TransactionalTest";

  @transactional()
  async basicTransaction(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");
    spa.map((sp) => {
      wdb.ubRegister("users", sp);
    });
    const ids = await wdb.ubUpsert("users");
    return ids;
  }

  @transactional({ isolation: "read committed" })
  async isolationLevel(userId: number, loginTime: Date): Promise<void> {
    const wdb = this.getPuri("w");
    const user = await wdb
      .table("users")
      .select({ id: "id", last_login_at: "last_login_at" })
      .where("id", userId)
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await wdb
      .table("users")
      .where("id", userId)
      .update({ last_login_at: loginTime });
  }

  @transactional()
  async autoRollback(userData: {
    email: string;
    username: string;
    password: string;
    shouldFail?: boolean;
  }): Promise<number> {
    const wdb = this.getPuri("w");

    const [userId] = await wdb.table("users").insert({
      email: userData.email,
      username: userData.username,
      password: userData.password,
      role: "normal",
      is_verified: false,
      birth_date: null,
      last_login_at: null,
      bio: null,
    });

    if (userData.shouldFail) {
      throw new Error("Intentional error");
    }

    assert(userId);

    await wdb
      .table("users")
      .where("id", userId)
      .update({ bio: "New user bio" });

    return userId;
  }

  @transactional()
  async nestedTransaction(userId: number): Promise<void> {
    const wdb = this.getPuri("w");
    await wdb.table("users").where("id", userId).update({
      last_login_at: new Date(),
    });
    await wdb.debugTransaction();

    await this.nestedTransactionInner(userId);
  }

  @transactional()
  async nestedTransactionInner(userId: number): Promise<void> {
    const wdb = this.getPuri("w");
    await wdb.table("users").where("id", userId).update({ is_verified: true });
    await wdb.debugTransaction();

    throw new Error("Intentional error");
  }

  @transactional({ isolation: "serializable" })
  async complexTransaction(companyData: {
    companyName: string;
    departmentName: string;
    users: Array<{
      email: string;
      username: string;
      password: string;
      employeeNumber: string;
      salary: string;
    }>;
  }): Promise<{ companyId: number; userIds: number[]; employeeIds: number[] }> {
    const wdb = this.getPuri("w");

    const companyRef = wdb.ubRegister("companies", {
      name: companyData.companyName,
    });

    const departmentRef = wdb.ubRegister("departments", {
      name: companyData.departmentName,
      company_id: companyRef,
    });

    companyData.users.forEach((userData) => {
      const userRef = wdb.ubRegister("users", {
        email: userData.email,
        username: userData.username,
        password: userData.password,
        role: "normal",
        is_verified: true,
      });

      wdb.ubRegister("employees", {
        user_id: userRef,
        department_id: departmentRef,
        employee_number: userData.employeeNumber,
        salary: userData.salary,
      });
    });

    const [companyId] = await wdb.ubUpsert("companies");
    await wdb.ubUpsert("departments");
    const userIds = await wdb.ubUpsert("users");
    const employeeIds = await wdb.ubUpsert("employees");

    return { companyId: companyId!, userIds, employeeIds };
  }
}

const TestModel = new TransactionalTestModelClass();

describe("@transactional decorator", () => {
  describe("Example 1: Basic Transaction", () => {
    test("should create users within a transaction", async () => {
      const ids = await TestModel.basicTransaction([
        {
          email: "test1@example.com",
          username: "testuser1",
          password: "hashedpass123",
          role: "normal",
          birth_date: null,
          last_login_at: null,
          bio: null,
          is_verified: false,
        },
      ]);

      expect(ids).toHaveLength(1);
      expect(ids[0]).toBeGreaterThan(0);
      assert(ids[0]);

      // 사용자 생성 확인
      const rdb = TestModel.getPuri("r");
      const user = await rdb.table("users").where("id", ids[0]).first();
      expect(user).toBeDefined();
      expect(user?.email).toBe("test1@example.com");

      // 정리
      await TestModel.getPuri("w").table("users").whereIn("id", ids).delete();
    });
  });

  describe("Example 2: Isolation Level", () => {
    test("should update user with specified isolation level", async () => {
      // 테스트 사용자 생성
      const wdb = TestModel.getPuri("w");
      const [userId] = await wdb.table("users").insert({
        email: "isolation@example.com",
        username: "isolation_user",
        password: "pass123",
        role: "normal",
        is_verified: false,
        birth_date: null,
        last_login_at: null,
        bio: null,
      });

      assert(userId);

      const loginTime = new Date();
      await TestModel.isolationLevel(userId, loginTime);

      // 업데이트 확인
      const rdb = TestModel.getPuri("r");
      const user = await rdb.table("users").where("id", userId).first();
      expect(user?.last_login_at).not.toBeNull();

      // 정리
      await TestModel.getPuri("w").table("users").where("id", userId).delete();
    });
  });

  describe("Example 3: Auto Rollback", () => {
    test("should commit when no error occurs", async () => {
      const userId = await TestModel.autoRollback({
        email: "rollback-success@example.com",
        username: "rollback_success",
        password: "pass123",
        shouldFail: false,
      });

      // insert와 update가 커밋되었는지 확인
      const user = await TestModel.getPuri("r")
        .table("users")
        .where("id", userId)
        .first();
      expect(user).toBeDefined();
      expect(user?.bio).toBe("New user bio");

      // 정리
      await TestModel.getPuri("w").table("users").where("id", userId).delete();
    });

    test("should rollback when error occurs", async () => {
      await expect(
        TestModel.autoRollback({
          email: "rollback-fail@example.com",
          username: "rollback_fail",
          password: "pass123",
          shouldFail: true,
        })
      ).rejects.toThrow("Intentional error");

      // 롤백 확인 - 사용자가 존재하지 않아야 함
      const user = await TestModel.getPuri("r")
        .table("users")
        .where("email", "rollback-fail@example.com")
        .first();
      expect(user).toBeUndefined();
    });
  });

  describe("Example 4: Nested Transaction", () => {
    test.only("should handle nested @transactional methods", async () => {
      // 테스트 사용자 생성
      const wdb = TestModel.getPuri("w");
      await wdb.debugTransaction();
      const [userId] = await wdb.table("users").insert({
        email: "nested@example.com",
        username: "nested_user",
        password: "pass123",
        role: "normal",
        is_verified: false,
        birth_date: null,
        last_login_at: null,
        bio: null,
      });

      assert(userId);

      await expect(TestModel.nestedTransaction(userId)).rejects.toThrow(
        "Intentional error"
      );

      // 트랜잭션 상태 롤백인지 확인
      const [trxStates] = await wdb.knex.raw(`
        SELECT *
        FROM performance_schema.events_transactions_current
        WHERE THREAD_ID = (
            SELECT THREAD_ID
            FROM performance_schema.threads
            WHERE PROCESSLIST_ID = CONNECTION_ID()
          )
      `);
      expect(trxStates.length).toBe(1);
      expect(trxStates[0].STATE).toBe("ROLLED BACK");

      // 두 업데이트가 모두 롤백되었는지 확인
      const user = await TestModel.getPuri("r")
        .table("users")
        .where("id", userId)
        .first();
      expect(user?.is_verified).toBe(false);
      expect(user?.last_login_at).toBeNull();

      // 정리
      await TestModel.getPuri("w").table("users").where("id", userId).delete();
    });
  });

  describe("Example 5: Complex Transaction with UBRef", () => {
    test("should handle complex multi-table transaction", async () => {
      const result = await TestModel.complexTransaction({
        companyName: "Tech Corp",
        departmentName: "Engineering",
        users: [
          {
            email: "engineer1@techcorp.com",
            username: "engineer1",
            password: "pass123",
            employeeNumber: "E2001",
            salary: "80000",
          },
          {
            email: "engineer2@techcorp.com",
            username: "engineer2",
            password: "pass123",
            employeeNumber: "E2002",
            salary: "85000",
          },
        ],
      });

      expect(result.companyId).toBeGreaterThan(0);
      expect(result.userIds).toHaveLength(2);
      expect(result.employeeIds).toHaveLength(2);

      // 관계 확인
      const employees = await TestModel.getPuri("r")
        .table("employees")
        .whereIn("id", result.employeeIds);
      expect(employees).toHaveLength(2);
      employees.forEach((emp) => {
        expect(result.userIds).toContain(emp.user_id);
      });

      // 정리 (외래 키 순서)
      await TestModel.getPuri("w")
        .table("employees")
        .whereIn("id", result.employeeIds)
        .delete();
      await TestModel.getPuri("w")
        .table("users")
        .whereIn("id", result.userIds)
        .delete();
      await TestModel.getPuri("w")
        .table("departments")
        .where("company_id", result.companyId)
        .delete();
      await TestModel.getPuri("w")
        .table("companies")
        .where("id", result.companyId)
        .delete();
    });
  });
});
