import { Puri, Sonamu } from "sonamu";
import { EmployeeModel } from "../application/employee/employee.model";
import assert from "assert";

// UpsertBuilder 예제
async function examples() {
  await Sonamu.init(true, false);
  const puri = EmployeeModel.getPuri("w");

  console.log(
    "\n=== Example 1: Basic UBRef Relations (Company → Department → User → Employee) ==="
  );
  await puri.transaction(async (trx) => {
    // 1. Company 등록
    const companyRef = trx.ubRegister("companies", {
      name: "Test Company Inc.",
    });

    // 2. Department 등록 (Company 참조)
    const departmentRef = trx.ubRegister("departments", {
      name: "Engineering",
      company_id: companyRef, // UBRef 사용
    });

    // 3. User 등록
    const userRef = trx.ubRegister("users", {
      email: "engineer@test.com",
      username: "test_engineer",
      password: "hashed_password",
      role: "normal",
      is_verified: true,
    });

    // 4. Employee 등록 (User, Department 참조)
    trx.ubRegister("employees", {
      user_id: userRef, // UBRef 사용
      department_id: departmentRef, // UBRef 사용
      employee_number: "E001",
      salary: "50000",
    });

    // 5. DB에 순서대로 저장
    const [companyId] = await trx.ubUpsert("companies");
    const [departmentId] = await trx.ubUpsert("departments");
    const [userId] = await trx.ubUpsert("users");
    const [employeeId] = await trx.ubUpsert("employees");

    // 6. 검증
    assert(companyId);
    assert(departmentId);
    assert(userId);
    assert(employeeId);

    console.log("Created IDs:", {
      companyId,
      departmentId,
      userId,
      employeeId,
    });

    // 실제로 생성된 Employee 조회
    const employee = await trx
      .table("employees")
      .selectAll()
      .where("id", employeeId!)
      .first();

    assert(employee);
    assert(employee.employee_number === "E001");
    assert(employee.user_id === userId);
    assert(employee.department_id === departmentId);

    console.log("✅ Employee created successfully:", {
      id: employee.id,
      employee_number: employee.employee_number,
      user_id: employee.user_id,
      department_id: employee.department_id,
    });

    // 7. 정리 (외래 키 역순으로 삭제)
    await trx.table("employees").where("id", employeeId!).delete();
    await trx.table("users").where("id", userId!).delete();
    await trx.table("departments").where("id", departmentId!).delete();
    await trx.table("companies").where("id", companyId!).delete();

    console.log("✅ Cleanup completed");
  });

  console.log(
    "\n=== Example 2: ManyToMany Relations (Project ↔ Employee) ==="
  );
  await puri.transaction(async (trx) => {
    // 1. Project 등록
    const projectRef = trx.ubRegister("projects", {
      name: "New Feature Development",
      status: "in_progress",
      description: "Building awesome features",
    });

    // 2. User 등록
    const user1Ref = trx.ubRegister("users", {
      email: "dev1@test.com",
      username: "dev1",
      password: "pass",
      role: "normal",
      is_verified: true,
    });

    const user2Ref = trx.ubRegister("users", {
      email: "dev2@test.com",
      username: "dev2",
      password: "pass",
      role: "normal",
      is_verified: true,
    });

    // 3. Employee 등록
    const employee1Ref = trx.ubRegister("employees", {
      user_id: user1Ref,
      employee_number: "E100",
    });

    const employee2Ref = trx.ubRegister("employees", {
      user_id: user2Ref,
      employee_number: "E101",
    });

    // 4. ManyToMany 조인 테이블 등록
    trx.ubRegister("projects__employees", {
      project_id: projectRef, // UBRef 사용
      employee_id: employee1Ref, // UBRef 사용
    });

    trx.ubRegister("projects__employees", {
      project_id: projectRef,
      employee_id: employee2Ref,
    });

    // 5. DB에 순서대로 저장
    const [projectId] = await trx.ubUpsert("projects");
    const userIds = await trx.ubUpsert("users");
    const employeeIds = await trx.ubUpsert("employees");
    await trx.ubUpsert("projects__employees");

    // 6. 검증
    assert(projectId);
    assert(userIds.length === 2);
    assert(employeeIds.length === 2);

    console.log("Created IDs:", { projectId, userIds, employeeIds });

    // 조인 테이블 확인
    const joinRecords = await trx
      .table("projects__employees")
      .selectAll()
      .where("project_id", projectId!);

    assert(joinRecords.length === 2);
    assert(
      JSON.stringify(joinRecords.map((r) => r.employee_id).sort()) ===
        JSON.stringify(employeeIds.sort())
    );

    console.log("✅ ManyToMany relations created successfully");
    console.log("Join records:", joinRecords);

    // 7. 정리 (외래 키 역순으로 삭제)
    await trx
      .table("projects__employees")
      .where("project_id", projectId!)
      .delete();
    await trx.table("employees").whereIn("id", employeeIds).delete();
    await trx.table("users").whereIn("id", userIds).delete();
    await trx.table("projects").where("id", projectId!).delete();

    console.log("✅ Cleanup completed");
  });

  console.log("\n=== Example 3: Bulk Insert with UBRef ===");
  await puri.transaction(async (trx) => {
    // 1. Company 생성
    const companyRef = trx.ubRegister("companies", {
      name: "Tech Startup",
    });

    // 2. 여러 Department 등록
    const deptRefs = ["Engineering", "Sales", "Marketing"].map((name) =>
      trx.ubRegister("departments", {
        name,
        company_id: companyRef,
      })
    );

    // 3. 여러 User 등록
    const userRefs = Array.from({ length: 5 }, (_, i) =>
      trx.ubRegister("users", {
        email: `user${i}@startup.com`,
        username: `user${i}`,
        password: "password",
        role: "normal",
        is_verified: true,
      })
    );

    // 4. 각 User마다 Employee 등록 (다른 부서에 배치)
    userRefs.forEach((userRef, i) => {
      trx.ubRegister("employees", {
        user_id: userRef,
        department_id: deptRefs[i % deptRefs.length], // 순환 배치
        employee_number: `E${1000 + i}`,
        salary: String(50000 + i * 5000),
      });
    });

    // 5. 일괄 저장
    const [companyId] = await trx.ubUpsert("companies");
    const departmentIds = await trx.ubUpsert("departments");
    const userIds = await trx.ubUpsert("users");
    const employeeIds = await trx.ubUpsert("employees");

    console.log("Bulk insert results:", {
      companyId,
      departmentCount: departmentIds.length,
      userCount: userIds.length,
      employeeCount: employeeIds.length,
    });

    // 검증
    assert(departmentIds.length === 3);
    assert(userIds.length === 5);
    assert(employeeIds.length === 5);

    // 부서별 직원 수 확인
    const deptStats = await trx
      .table("departments")
      .join("employees", "departments.id", "employees.department_id")
      .select({
        dept_id: "departments.id",
        dept_name: "departments.name",
        employee_count: Puri.rawNumber("COUNT(employees.id)"),
      })
      .whereIn("departments.id", departmentIds)
      .groupBy("departments.id", "departments.name");

    console.log("✅ Department statistics:", deptStats);

    // 정리
    await trx.table("employees").whereIn("id", employeeIds).delete();
    await trx.table("users").whereIn("id", userIds).delete();
    await trx.table("departments").whereIn("id", departmentIds).delete();
    await trx.table("companies").where("id", companyId!).delete();

    console.log("✅ Cleanup completed");
  });

  console.log("\n=== All UpsertBuilder examples completed! ===");
}

examples().finally(async () => {
  await Sonamu.destroy();
});
