import { BaseModelClass, transactional, api, Sonamu } from "sonamu";
import { UserSaveParams } from "../application/user/user.types";
import assert from "assert";

/**
 * @transactional 데코레이터 사용 예제
 *
 * @transactional 데코레이터는 메서드를 자동으로 트랜잭션으로 감싸줍니다.
 * 메서드 실행 중 에러가 발생하면 자동으로 롤백되고,
 * 정상 완료되면 자동으로 커밋됩니다.
 */

class TransactionalExampleModelClass extends BaseModelClass {
  modelName = "TransactionalExample";

  /**
   * 예제 1: 기본 @transactional 사용
   * - 별도의 옵션 없이 기본 트랜잭션 적용
   * - 기본값: dbPreset = "w" (write DB)
   */
  @transactional()
  async example1_basicTransaction(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w"); // 자동으로 트랜잭션 컨텍스트가 주입됨

    // register
    spa.map((sp) => {
      wdb.ubRegister("users", sp);
    });

    // 기존처럼 wdb.transaction()을 호출할 필요 없음!
    const ids = await wdb.ubUpsert("users");
    return ids;
  }

  /**
   * 예제 2: Isolation Level 설정
   * - MySQL의 트랜잭션 격리 수준을 지정할 수 있습니다
   * - READ UNCOMMITTED, READ COMMITTED, REPEATABLE READ, SERIALIZABLE
   */
  @transactional({ isolation: "repeatable read" })
  async example2_isolationLevel(
    userId: number,
    loginTime: Date
  ): Promise<void> {
    const wdb = this.getPuri("w");

    // 동시성 제어가 중요한 경우 isolation level 설정
    const user = await wdb
      .table("users")
      .select({ id: "id", last_login_at: "last_login_at" })
      .where("id", userId)
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // last_login_at 업데이트
    await wdb
      .table("users")
      .where("id", userId)
      .update({ last_login_at: loginTime });
  }

  /**
   * 예제 3: 자동 롤백 테스트
   * - 에러가 발생하면 자동으로 롤백됩니다
   */
  @transactional()
  async example3_autoRollback(userData: {
    email: string;
    username: string;
    password: string;
    shouldFail?: boolean;
  }): Promise<number> {
    const wdb = this.getPuri("w");

    // 첫 번째 insert 성공
    const [userId] = await wdb.table("users").insert({
      email: userData.email,
      username: userData.username,
      password: userData.password,
      role: "normal",
      is_verified: false,
      birth_date: null,
      last_login_at: null,
    });

    // 두 번째 작업에서 에러 발생
    if (userData.shouldFail) {
      throw new Error("Intentional error - 트랜잭션이 롤백됩니다");
    }

    assert(userId);

    // 추가 작업: bio 업데이트
    await wdb
      .table("users")
      .where("id", userId)
      .update({ bio: "New user bio" });

    // 에러 발생 시 insert와 update 모두 롤백됨
    return userId;
  }

  /**
   * 예제 4: 중첩 트랜잭션
   * - @transactional이 적용된 메서드가 다른 @transactional 메서드를 호출
   * - 내부적으로 같은 트랜잭션 컨텍스트를 재사용합니다
   */
  @transactional()
  async example4_nestedTransaction(userId: number): Promise<void> {
    const wdb = this.getPuri("w");

    await wdb.table("users").where("id", userId).update({
      last_login_at: new Date(),
    });

    // 다른 @transactional 메서드 호출
    // 같은 트랜잭션 컨텍스트를 공유함
    await this.example4_inner(userId);
  }

  @transactional()
  async example4_inner(userId: number): Promise<void> {
    const wdb = this.getPuri("w");

    // 유저의 is_verified 상태 업데이트
    await wdb.table("users").where("id", userId).update({ is_verified: true });
  }

  /**
   * 예제 5: @api와 @transactional 함께 사용
   * - 두 데코레이터를 함께 사용할 수 있습니다
   * - 순서는 상관없습니다
   */
  @api({ httpMethod: "POST" })
  @transactional()
  async example5_withApiDecorator(
    spa: UserSaveParams[]
  ): Promise<{ ids: number[] }> {
    const wdb = this.getPuri("w");

    spa.map((sp) => {
      wdb.ubRegister("users", sp);
    });

    const ids = await wdb.ubUpsert("users");
    return { ids };
  }

  /**
   * 예제 6: 복잡한 트랜잭션 시나리오 (Company → Department → User → Employee)
   * - 여러 테이블에 대한 작업을 하나의 트랜잭션으로 묶음
   * - UBRef를 사용한 참조 관계 처리
   */
  @transactional({ isolation: "serializable" })
  async example6_complexTransaction(companyData: {
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

    // 1. Company 등록
    const companyRef = wdb.ubRegister("companies", {
      name: companyData.companyName,
    });

    // 2. Department 등록 (Company 참조)
    const departmentRef = wdb.ubRegister("departments", {
      name: companyData.departmentName,
      company_id: companyRef, // UBRef 사용
    });

    // 3. User & Employee 등록
    companyData.users.forEach((userData) => {
      const userRef = wdb.ubRegister("users", {
        email: userData.email,
        username: userData.username,
        password: userData.password,
        role: "normal",
        is_verified: true,
      });

      wdb.ubRegister("employees", {
        user_id: userRef, // UBRef 사용
        department_id: departmentRef, // UBRef 사용
        employee_number: userData.employeeNumber,
        salary: userData.salary,
      });
    });

    // 4. DB에 순서대로 저장
    const [companyId] = await wdb.ubUpsert("companies");
    const [departmentId] = await wdb.ubUpsert("departments");
    const userIds = await wdb.ubUpsert("users");
    const employeeIds = await wdb.ubUpsert("employees");

    return { companyId: companyId!, userIds, employeeIds };
  }

  /**
   * 예제 7: 기존 transaction() 방식과 비교
   */

  // Before: 기존 방식
  async saveOldWay(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    spa.map((sp) => {
      wdb.ubRegister("users", sp);
    });

    // 명시적으로 transaction 호출
    return wdb.transaction(async (trx) => {
      const ids = await trx.ubUpsert("users");
      return ids;
    });
  }

  // After: @transactional 방식
  @transactional()
  async saveNewWay(spa: UserSaveParams[]): Promise<number[]> {
    const wdb = this.getPuri("w");

    spa.map((sp) => {
      wdb.ubRegister("users", sp);
    });

    // transaction 호출 없이 바로 작업
    const ids = await wdb.ubUpsert("users");
    return ids;
  }
}

export const TransactionalExampleModel = new TransactionalExampleModelClass();

/**
 * 사용 가이드:
 *
 * 1. @transactional() 데코레이터를 메서드에 추가
 * 2. 메서드 내에서 this.getPuri()로 PuriWrapper 획득
 * 3. 평소처럼 데이터베이스 작업 수행
 * 4. 에러 발생 시 자동 롤백, 성공 시 자동 커밋
 *
 * 장점:
 * - 보일러플레이트 코드 감소 (wdb.transaction() 호출 불필요)
 * - 가독성 향상
 * - 트랜잭션 경계가 명확함
 * - 중첩 트랜잭션 자동 처리
 * - Isolation level 쉽게 설정 가능
 *
 * 주의사항:
 * - @transactional이 적용된 메서드는 반드시 async 함수여야 함
 * - 메서드 내에서 this.getPuri()를 통해 DB 접근
 * - 데코레이터 적용 시 this 컨텍스트가 유지됨
 */

// 실행 가능한 예제 테스트
async function runExamples() {
  await Sonamu.init(true, false);

  console.log("\n=== Example 1: Basic Transaction ===");
  try {
    const ids = await TransactionalExampleModel.example1_basicTransaction([
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
    console.log("✅ Created user IDs:", ids);

    // Cleanup
    await TransactionalExampleModel.getPuri("w")
      .table("users")
      .whereIn("id", ids)
      .delete();
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n=== Example 2: Isolation Level ===");
  try {
    // 테스트용 유저 생성
    const [userId] = await TransactionalExampleModel.getPuri("w")
      .table("users")
      .insert({
        email: "isolation@example.com",
        username: "isolation_user",
        password: "pass123",
        role: "normal",
        is_verified: false,
      });

    assert(userId);

    // Isolation level로 업데이트
    await TransactionalExampleModel.example2_isolationLevel(userId, new Date());

    // 확인
    const user = await TransactionalExampleModel.getPuri("r")
      .table("users")
      .where("id", userId)
      .first();
    assert(user);
    assert(user.last_login_at !== null);
    console.log("✅ Isolation level transaction completed successfully");

    // Cleanup
    await TransactionalExampleModel.getPuri("w")
      .table("users")
      .where("id", userId)
      .delete();
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n=== Example 3: Auto Rollback Test ===");
  try {
    // 성공 케이스
    const userId = await TransactionalExampleModel.example3_autoRollback({
      email: "rollback-success@example.com",
      username: "rollback_success",
      password: "pass123",
      shouldFail: false,
    });
    console.log("✅ Transaction committed, user ID:", userId);

    // 확인
    const user = await TransactionalExampleModel.getPuri("r")
      .table("users")
      .where("id", userId)
      .first();
    assert(user);
    assert(user.bio === "New user bio");
    console.log("✅ Bio updated successfully");

    // Cleanup
    await TransactionalExampleModel.getPuri("w")
      .table("users")
      .where("id", userId)
      .delete();
  } catch (error) {
    console.error("❌ Error:", error);
  }

  try {
    // 실패 케이스
    await TransactionalExampleModel.example3_autoRollback({
      email: "rollback-fail@example.com",
      username: "rollback_fail",
      password: "pass123",
      shouldFail: true,
    });
  } catch (error) {
    console.log(
      "✅ Transaction rolled back as expected:",
      (error as Error).message
    );

    // 롤백 확인
    const user = await TransactionalExampleModel.getPuri("r")
      .table("users")
      .where("email", "rollback-fail@example.com")
      .first();
    assert(!user, "User should not exist after rollback");
    console.log("✅ Rollback verified - user was not created");
  }

  console.log("\n=== Example 4: Nested Transaction ===");
  try {
    // 테스트용 유저 생성
    const [userId] = await TransactionalExampleModel.getPuri("w")
      .table("users")
      .insert({
        email: "nested@example.com",
        username: "nested_user",
        password: "pass123",
        role: "normal",
        is_verified: false,
      });

    assert(userId);

    // 중첩 트랜잭션 실행
    await TransactionalExampleModel.example4_nestedTransaction(userId);

    // 확인
    const user = await TransactionalExampleModel.getPuri("r")
      .table("users")
      .where("id", userId)
      .first();
    assert(user);
    assert(user.is_verified === true);
    assert(user.last_login_at !== null);
    console.log("✅ Nested transaction completed successfully");

    // Cleanup
    await TransactionalExampleModel.getPuri("w")
      .table("users")
      .where("id", userId)
      .delete();
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n=== Example 5: @api with @transactional ===");
  try {
    const result = await TransactionalExampleModel.example5_withApiDecorator([
      {
        email: "api-test@example.com",
        username: "api_testuser",
        password: "hashedpass123",
        role: "normal",
        birth_date: null,
        last_login_at: null,
        bio: null,
        is_verified: false,
      },
    ]);
    console.log("✅ @api + @transactional works! IDs:", result.ids);

    // Cleanup
    await TransactionalExampleModel.getPuri("w")
      .table("users")
      .whereIn("id", result.ids)
      .delete();
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n=== Example 6: Complex Transaction with UBRef ===");
  try {
    const result = await TransactionalExampleModel.example6_complexTransaction({
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

    console.log("✅ Complex transaction completed:", result);

    // Cleanup (외래 키 역순으로 삭제)
    await TransactionalExampleModel.getPuri("w")
      .table("employees")
      .whereIn("id", result.employeeIds)
      .delete();
    await TransactionalExampleModel.getPuri("w")
      .table("users")
      .whereIn("id", result.userIds)
      .delete();
    await TransactionalExampleModel.getPuri("w")
      .table("departments")
      .where("company_id", result.companyId)
      .delete();
    await TransactionalExampleModel.getPuri("w")
      .table("companies")
      .where("id", result.companyId)
      .delete();
    console.log("✅ Cleanup completed");
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n=== All @transactional examples completed! ===");
}

// 이 파일을 직접 실행하면 예제가 실행됩니다
if (require.main === module) {
  runExamples().finally(async () => {
    await Sonamu.destroy();
  });
}
