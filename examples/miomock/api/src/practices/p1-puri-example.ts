import assert from "assert";

import { Puri, Sonamu } from "sonamu";
import { z } from "zod";

import { UserModel } from "../application/user/user.model";

// 사용 예제
async function examples() {
  await Sonamu.init(true, false);
  const db = UserModel.getPuri("r");

  console.log("\n=== Example 1: Basic Select with Alias ===");
  const users = await db
    .table("users")
    .select({
      userId: "id",
      userName: "username",
      userEmail: "email",
      userRole: "role",
    })
    .limit(5)
    .debug();

  console.log(`Found ${users.length} users`);
  const firstUser = users[0];
  if (firstUser) {
    z.number().parse(firstUser.userId);
    z.string().parse(firstUser.userName);
    z.string().parse(firstUser.userEmail);
    console.log("First user:", firstUser);
  }

  console.log("\n=== Example 2: Join with Employees and Departments ===");
  const usersWithEmployees = await db
    .table("users")
    .join("employees", "users.id", "employees.user_id")
    .leftJoin("departments", "employees.department_id", "departments.id")
    .select({
      user_id: "users.id",
      username: "users.username",
      employee_number: "employees.employee_number",
      department_name: "departments.name",
      salary: "employees.salary",
    })
    .limit(10)
    .debug();

  console.log(`Found ${usersWithEmployees.length} users with employee info`);
  if (usersWithEmployees[0]) {
    const emp = usersWithEmployees[0];
    z.number().parse(emp.user_id);
    z.string().parse(emp.username);
    z.string().parse(emp.employee_number);
    console.log("First employee:", emp);
  }

  console.log("\n=== Example 3: Subquery Example ===");
  const subQuery = db.table("users").where("role", "admin").select({
    id: "users.id",
    username: "users.username",
    role: "users.role",
  });

  const mainQuery = db
    .table({ admin_users: subQuery })
    .join("employees", "admin_users.id", "employees.user_id")
    .select({
      user_id: "admin_users.id",
      username: "admin_users.username",
      role: "admin_users.role",
      employee_number: "employees.employee_number",
    })
    .limit(10);

  const adminEmployees = await mainQuery.debug();
  console.log(`Found ${adminEmployees.length} admin employees`);
  if (adminEmployees[0]) {
    const admin = adminEmployees[0];
    z.number().parse(admin.user_id);
    z.string().parse(admin.username);
    assert(admin.role === "admin");
    console.log("First admin employee:", admin);
  }

  console.log("\n=== Example 4: SQL Functions (Aggregations) ===");
  const departmentStats = await db
    .table("departments")
    .join("employees", "departments.id", "employees.department_id")
    .select({
      department_id: "departments.id",
      department_name: "departments.name",
      employee_count: Puri.count("employees.id"),
      avg_salary: Puri.rawNumber("AVG(CAST(employees.salary AS DECIMAL))"),
      max_salary: Puri.rawNumber("MAX(CAST(employees.salary AS DECIMAL))"),
    })
    .groupBy("departments.id", "departments.name")
    .having("employee_count", ">", 0)
    .orderBy("employee_count", "desc")
    .limit(10)
    .debug();

  console.log(`Found ${departmentStats.length} departments with stats`);
  if (departmentStats[0]) {
    const dept = departmentStats[0];
    z.number().parse(dept.department_id);
    z.string().parse(dept.department_name);
    z.number().parse(dept.employee_count);
    console.log("Department with most employees:", dept);
  }

  console.log("\n=== Example 5: Complex Where Conditions with Groups ===");
  const complexQuery = await db
    .table("users")
    .join("employees", "users.id", "employees.user_id")
    .leftJoin("departments", "employees.department_id", "departments.id")
    .select({
      user_id: "users.id",
      username: "users.username",
      employee_number: "employees.employee_number",
      department_name: "departments.name",
    })
    // WHERE (users.role = 'admin' OR users.is_verified = true)
    .whereGroup((g) => g.where("users.role", "admin").orWhere("users.is_verified", true))
    // AND (employees.salary IS NOT NULL)
    .where("employees.salary", "!=", null)
    .orderBy("users.created_at", "desc")
    .limit(10)
    .debug();

  console.log(`Found ${complexQuery.length} users matching complex criteria`);
  if (complexQuery[0]) {
    console.log("First result:", complexQuery[0]);
  }

  console.log("\n=== Example 6: Multiple Joins - Projects with Employees ===");
  const projectsQuery = await db
    .table("projects")
    .join("projects__employees", "projects.id", "projects__employees.project_id")
    .join("employees", "projects__employees.employee_id", "employees.id")
    .join("users", "employees.user_id", "users.id")
    .leftJoin("departments", "employees.department_id", "departments.id")
    .select({
      project_id: "projects.id",
      project_name: "projects.name",
      project_status: "projects.status",
      employee_name: "users.username",
      employee_number: "employees.employee_number",
      department_name: "departments.name",
    })
    .where("projects.status", "in_progress")
    .limit(10)
    .debug();

  console.log(`Found ${projectsQuery.length} project-employee relations`);
  if (projectsQuery[0]) {
    const project = projectsQuery[0];
    z.number().parse(project.project_id);
    z.string().parse(project.project_name);
    assert(project.project_status === "in_progress");
    z.string().parse(project.employee_name);
    console.log("First project-employee:", project);
  }

  console.log("\n=== Example 7: Using whereIn ===");
  const specificUsers = await db
    .table("users")
    .select({
      id: "id",
      username: "username",
      email: "email",
    })
    .whereIn("role", ["admin", "normal"])
    .limit(10)
    .debug();

  console.log(`Found ${specificUsers.length} users with specific roles`);

  console.log("\n=== Example 7.5: Using pluck ===");
  // 기본 컬럼 pluck - 특정 컬럼의 값들만 배열로 반환
  const userIds = await db.table("users").where("role", "admin").pluck("id");

  console.log(`Found ${userIds.length} admin user IDs:`, userIds);
  assert(Array.isArray(userIds));
  if (userIds.length > 0) {
    z.number().parse(userIds[0]);
    console.log("First user ID:", userIds[0]);
  }

  // 조인된 테이블 컬럼 pluck
  const departmentNames = await db
    .table("users")
    .join("employees", "users.id", "employees.user_id")
    .leftJoin("departments", "employees.department_id", "departments.id")
    .where("users.role", "admin")
    .pluck("departments.name");

  console.log(`Found ${departmentNames.length} department names:`, departmentNames);
  assert(Array.isArray(departmentNames));
  if (departmentNames.length > 0 && departmentNames[0] !== null) {
    z.string().parse(departmentNames[0]);
  }

  // select로 선택된 컬럼 pluck
  const usernames = await db
    .table("users")
    .select({
      userId: "id",
      userName: "username",
    })
    .appendSelect({
      userBio: "bio",
    })
    .where("role", "admin")
    .pluck("username");

  console.log(`Found ${usernames.length} usernames:`, usernames);
  assert(Array.isArray(usernames));
  if (usernames.length > 0) {
    z.string().parse(usernames[0]);
  }

  console.log("\n=== Example 8: Transaction Example ===");
  await db.transaction(async (trx) => {
    // 트랜잭션 내에서 쿼리 실행
    const userCount = await trx
      .table("users")
      .select({
        count: Puri.count(),
      })
      .first();

    console.log("Total users in transaction:", userCount);
  });

  console.log("\n=== Example 9: Department Hierarchy ===");
  const departments = await db
    .table("departments")
    .leftJoin({ parent_dept: "departments" }, "departments.parent_id", "parent_dept.id")
    .join("companies", "departments.company_id", "companies.id")
    .select({
      dept_id: "departments.id",
      dept_name: "departments.name",
      parent_name: "parent_dept.name",
      company_name: "companies.name",
    })
    .limit(10)
    .debug();

  console.log(`Found ${departments.length} departments with hierarchy`);
  if (departments[0]) {
    console.log("First department:", departments[0]);
  }

  console.log("\n=== All examples completed! ===");
}
examples().finally(async () => {
  await Sonamu.destroy();
});
