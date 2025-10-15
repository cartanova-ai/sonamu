import { Puri, Sonamu } from "sonamu";
import { UserModel } from "../application/user/user.model";

// BaseModel.getPuri() 사용 예제
async function examples() {
  await Sonamu.init(true, false);

  // getPuri를 사용하여 PuriWrapper 인스턴스 가져오기
  const puri = UserModel.getPuri("r");

  console.log("\n=== Example: Using getPuri() from BaseModel ===");

  // 사용자 목록 조회
  const users = await puri
    .table("users")
    .select({
      userId: "id",
      userName: "username",
      userEmail: "email",
      userRole: "role",
    })
    .where("role", "admin")
    .limit(5)
    .debug();

  console.log(`Found ${users.length} admin users`);
  if (users[0]) {
    console.log("First admin user:", users[0]);
  }

  // Join을 사용한 복잡한 쿼리
  console.log("\n=== Example: Complex Query with Joins ===");
  const usersWithEmployees = await puri
    .table("users")
    .join("employees", "users.id", "employees.user_id")
    .leftJoin("departments", "employees.department_id", "departments.id")
    .select({
      user_id: "users.id",
      username: "users.username",
      employee_number: "employees.employee_number",
      department_name: "departments.name",
    })
    .limit(10)
    .debug();

  console.log(`Found ${usersWithEmployees.length} users with employee info`);
  if (usersWithEmployees[0]) {
    console.log("First result:", usersWithEmployees[0]);
  }

  // 조인절에 서브쿼리 사용 예제
  console.log("\n=== Example: Subquery in Join Clause ===");

  // 부서별 평균 급여를 계산하는 서브쿼리
  const avgSalarySubquery = puri
    .table("employees")
    .select({
      dept_id: "department_id",
      avg_salary: Puri.rawNumber("AVG(CAST(salary AS DECIMAL))"),
    })
    .where("salary", "!=", null)
    .groupBy("department_id");

  // 서브쿼리를 조인하여 부서 정보와 평균 급여를 함께 조회
  const departmentsWithAvgSalary = await puri
    .fromSubquery(avgSalarySubquery, "dept_avg")
    .join("departments", "dept_avg.dept_id", "departments.id")
    .join("companies", "departments.company_id", "companies.id")
    .select({
      department_id: "departments.id",
      department_name: "departments.name",
      company_name: "companies.name",
      average_salary: "dept_avg.avg_salary",
    })
    .orderBy("dept_avg.avg_salary", "desc")
    .limit(10)
    .debug();

  console.log(
    `Found ${departmentsWithAvgSalary.length} departments with avg salary`
  );
  if (departmentsWithAvgSalary[0]) {
    console.log(
      "Department with highest avg salary:",
      departmentsWithAvgSalary[0]
    );
  }

  // 고급 예제: 여러 서브쿼리를 조인
  console.log("\n=== Example: Multiple Subqueries in Joins ===");

  // 서브쿼리 1: 각 부서의 직원 수
  const employeeCountSubquery = puri
    .table("employees")
    .select({
      dept_id: "department_id",
      emp_count: Puri.count("id"),
    })
    .where("department_id", "!=", null)
    .groupBy("department_id");

  // 서브쿼리 2: 각 부서의 최고 급여
  const maxSalarySubquery = puri
    .table("employees")
    .select({
      dept_id: "department_id",
      max_salary: Puri.rawNumber("MAX(CAST(salary AS DECIMAL))"),
    })
    .where("salary", "!=", null)
    .groupBy("department_id");

  // 두 서브쿼리를 조인하여 부서별 통계 조회
  const departmentStats = await puri
    .fromSubquery(employeeCountSubquery, "emp_cnt")
    .join("departments", "emp_cnt.dept_id", "departments.id")
    .join(maxSalarySubquery, "max_sal", "emp_cnt.dept_id", "max_sal.dept_id")
    .select({
      department_id: "departments.id",
      department_name: "departments.name",
      employee_count: "emp_cnt.emp_count",
      max_salary: "max_sal.max_salary",
    })
    .orderBy("emp_cnt.emp_count", "desc")
    .limit(10)
    .debug();

  console.log(`Found ${departmentStats.length} departments with full stats`);
  if (departmentStats[0]) {
    console.log("First department stats:", departmentStats[0]);
  }

  // Transaction 예제
  console.log("\n=== Example: Transaction with getPuri() ===");
  const wPuri = UserModel.getPuri("w");

  await wPuri.transaction(async (trx) => {
    const userCount = await trx
      .table("users")
      .select({
        total: Puri.rawNumber("COUNT(*)"),
      })
      .first();

    console.log("Total users in transaction:", userCount);
  });

  console.log("\n=== All examples completed! ===");
}

examples().finally(async () => {
  await Sonamu.destroy();
});
