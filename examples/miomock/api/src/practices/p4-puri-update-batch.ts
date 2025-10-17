import { Sonamu } from "sonamu";
import { EmployeeModel } from "../application/employee/employee.model";
import assert from "assert";

// UpdateBatch 예제
async function examples() {
  await Sonamu.init(true, false);
  const puri = EmployeeModel.getPuri("w");

  console.log("\n=== Example 1: Basic UpdateBatch - Bulk Update ===");
  await puri.transaction(async (trx) => {
    // 1. 여러 User 생성
    Array.from({ length: 5 }, (_, i) =>
      trx.ubRegister("users", {
        email: `updatetest${i}@test.com`,
        username: `updateuser${i}`,
        password: "password",
        role: "normal",
        is_verified: false,
      })
    );

    const userIds = await trx.ubUpsert("users");
    console.log(`Created ${userIds.length} users`);

    // 2. 생성된 사용자들의 정보 수정 (ubRegister로 변경사항 등록)
    userIds.forEach((userId, i) => {
      trx.ubRegister("users", {
        id: userId,
        username: `updated_user${i}`,
        bio: `Updated bio for user ${i}`,
        is_verified: true,
      });
    });

    // 3. updateBatch로 일괄 업데이트
    await trx.ubUpdateBatch("users", {
      chunkSize: 100,
      where: "id", // id를 기준으로 매칭
    });

    console.log("✅ Batch update completed");

    // 4. 업데이트 결과 확인
    const updatedUsers = await trx
      .table("users")
      .select({
        id: "id",
        username: "username",
        bio: "bio",
        is_verified: "is_verified",
      })
      .whereIn("id", userIds);

    console.log("Updated users:", updatedUsers);

    // 검증
    assert(updatedUsers.every((u) => u.username.startsWith("updated_user")));
    assert(updatedUsers.every((u) => u.bio?.startsWith("Updated bio")));
    assert(updatedUsers.every((u) => u.is_verified === true));

    // 정리
    await trx.table("users").whereIn("id", userIds).delete();
    console.log("✅ Cleanup completed");
  });

  console.log("\n=== Example 2: UpdateBatch with Composite Key ===");
  await puri.transaction(async (trx) => {
    // 1. 여러 User 생성
    Array.from({ length: 3 }, (_, i) => {
      trx.ubRegister("users", {
        email: `emp${i}@test.com`,
        username: `emp${i}`,
        password: "password",
        role: "normal",
        is_verified: true,
      });
    });

    const userIds = await trx.ubUpsert("users");

    // 2. Employee 생성 (초기 급여로)
    userIds.forEach((userId, i) => {
      trx.ubRegister("employees", {
        user_id: userId,
        employee_number: `E${1000 + i}`,
        salary: String(50000 + i * 1000),
      });
    });

    const employeeIds = await trx.ubUpsert("employees");

    console.log(
      `Created ${userIds.length} users and ${employeeIds.length} employees`
    );

    // 3. Employee 급여 업데이트 (user_id + employee_number 복합 키로 매칭)
    // 주의: id로 매칭하지 않고 user_id + employee_number로 매칭
    // 이 방식은 employee_number가 변경되지 않는다는 전제 하에 유용
    userIds.forEach((userId, i) => {
      trx.ubRegister("employees", {
        user_id: userId!, // 매칭 키 1
        employee_number: `E${1000 + i}`, // 매칭 키 2
        salary: String(60000 + i * 1000), // 업데이트할 값
      });
    });

    // 4. updateBatch (user_id + employee_number로 매칭)
    await trx.ubUpdateBatch("employees", {
      where: ["user_id", "employee_number"], // 복합 키로 매칭
    });

    console.log("✅ Batch update with composite key completed");

    // 5. 결과 확인
    const updatedEmployees = await trx
      .table("employees")
      .select({
        id: "id",
        user_id: "user_id",
        employee_number: "employee_number",
        salary: "salary",
      })
      .whereIn("id", employeeIds);

    console.log("Updated employees:", updatedEmployees);

    // 검증 - 급여가 올라갔는지 확인
    updatedEmployees.forEach((emp, i) => {
      const expectedSalary = 60000 + i * 1000;
      assert(
        Number(emp.salary) === expectedSalary,
        `Employee ${i} salary mismatch`
      );
    });

    // 정리
    await trx.table("employees").whereIn("id", employeeIds).delete();
    await trx.table("users").whereIn("id", userIds).delete();
    console.log("✅ Cleanup completed");
  });

  console.log("\n=== Example 3: Partial Updates ===");
  await puri.transaction(async (trx) => {
    // 1. User 생성
    trx.ubRegister("users", {
      email: "partial@test.com",
      username: "partialuser",
      password: "password",
      role: "normal",
      is_verified: false,
      bio: "Original bio",
    });

    const userIds = await trx.ubUpsert("users");

    console.log(`Created user: ${userIds[0]}`);

    // 2. bio만 업데이트 (다른 필드는 그대로)
    trx.ubRegister("users", {
      id: userIds[0],
      bio: "Updated bio only",
    });

    await trx.ubUpdateBatch("users");

    // 3. 결과 확인
    const updatedUser = await trx
      .table("users")
      .selectAll()
      .where("id", userIds[0]!)
      .first();

    console.log("Updated user:", updatedUser);

    // 검증 - bio만 변경되고 나머지는 그대로
    assert(updatedUser);
    assert(updatedUser.bio === "Updated bio only");
    assert(updatedUser.username === "partialuser"); // 변경 안됨
    assert(updatedUser.is_verified === false); // 변경 안됨

    // 정리
    await trx.table("users").where("id", userIds[0]!).delete();
    console.log("✅ Cleanup completed");
  });

  console.log("\n=== All UpdateBatch examples completed! ===");
}

examples().finally(async () => {
  await Sonamu.destroy();
});
