import { Sonamu, PuriWrapper, Puri } from "sonamu";
import { UserModel } from "../application/user/user.model";
import assert from "assert";
import { DatabaseSchema } from "../application/sonamu.generated";

// 사용 예제
async function examples() {
  await Sonamu.init(true, false);
  const wdb = UserModel.getDB("r");
  const db = new PuriWrapper<DatabaseSchema>(wdb);

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
    assert(typeof firstUser.userId === "number");
    assert(typeof firstUser.userName === "string");
    assert(typeof firstUser.userEmail === "string");
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
    assert(typeof emp.user_id === "number");
    assert(typeof emp.username === "string");
    assert(typeof emp.employee_number === "string");
    console.log("First employee:", emp);
  }

  console.log("\n=== Example 3: Subquery Example ===");
  const subQuery = db
    .table("users")
    .select({
      id: "users.id",
      username: "users.username",
      role: "users.role",
    })
    .where("role", "=", "admin");

  const mainQuery = db
    .fromSubquery(subQuery, "admin_users")
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
    assert(typeof admin.user_id === "number");
    assert(typeof admin.username === "string");
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
    assert(typeof dept.department_id === "number");
    assert(typeof dept.department_name === "string");
    assert(typeof dept.employee_count === "number");
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
    .whereGroup((g) =>
      g.where("users.role", "admin").orWhere("users.is_verified", true)
    )
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
    .join(
      "projects__employees",
      "projects.id",
      "projects__employees.project_id"
    )
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
    assert(typeof project.project_id === "number");
    assert(typeof project.project_name === "string");
    assert(project.project_status === "in_progress");
    assert(typeof project.employee_name === "string");
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
    .leftJoin(
      "departments as parent_dept",
      "departments.parent_id",
      "parent_dept.id"
    )
    .join("companies", "departments.company_id", "companies.id")
    .select({
      dept_id: "departments.id",
      dept_name: "departments.name",
      parent_name: Puri.rawString("parent_dept.name"),
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
