import { Naite, Puri } from "sonamu";
import { describe, vi } from "vitest";
import { UserModel } from "../application/user/user.model";
import { bootstrap, test } from "../testing/bootstrap";
import { expectQuery } from "../testing/expect-query";

bootstrap(vi);
describe("Puri Query", () => {
  describe("A. BASIC CRUD", () => {
    test("select", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").select({ id: "users.id" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"select"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS \`id\`"`);
    });

    test("select with alias", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").select({ userId: "users.id" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"select"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS \`userId\`"`);
    });

    test("selectAll", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").selectAll();
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"select"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "columns").toMatchInlineSnapshot(`"*"`);
    });

    test("insert", async () => {
      const db = UserModel.getPuri("w");
      await db
        .table("users")
        .insert({ username: "테스트", email: "test@test.com", password: "test", role: "normal" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"insert"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
    });

    test("update", async () => {
      const db = UserModel.getPuri("w");
      await db.table("users").where("users.id", 1).update({ username: "수정됨" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"update"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "set").toMatchInlineSnapshot(`"username = '수정됨'"`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
    });

    test("delete", async () => {
      const db = UserModel.getPuri("w");
      await db.table("users").where("users.id", 1).delete();
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"delete"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
    });
  });

  describe("B. JOIN", () => {
    test("inner join", async () => {
      const db = UserModel.getPuri("r");
      // employees와 users 조인
      await db.table("employees").join("users", "employees.user_id", "users.id");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "join").toMatchInlineSnapshot(
        `"INNER JOIN users ON "employees"."user_id" = "users"."id""`,
      );
    });

    test("left join", async () => {
      const db = UserModel.getPuri("r");
      // employees와 departments 조인 (department_id가 nullable이므로 LEFT JOIN 적합)
      await db
        .table("employees")
        .leftJoin("departments", "employees.department_id", "departments.id");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "join").toMatchInlineSnapshot(
        `"LEFT JOIN departments ON "employees"."department_id" = "departments"."id""`,
      );
    });

    test("multiple join", async () => {
      const db = UserModel.getPuri("r");
      // employees -> departments -> companies
      await db
        .table("employees")
        .leftJoin("departments", "employees.department_id", "departments.id")
        .leftJoin("companies", "departments.company_id", "companies.id");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "join").toMatchInlineSnapshot(
        `"LEFT JOIN departments ON "employees"."department_id" = "departments"."id" LEFT JOIN companies ON "departments"."company_id" = "companies"."id""`,
      );
    });

    test("many-to-many join", async () => {
      const db = UserModel.getPuri("r");
      // projects <-> projects__employees <-> employees (M:N 관계)
      await db
        .table("projects")
        .leftJoin("projects__employees", "projects.id", "projects__employees.project_id")
        .leftJoin("employees", "projects__employees.employee_id", "employees.id");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "join").toMatchInlineSnapshot(
        `"LEFT JOIN projects__employees ON "projects"."id" = "projects__employees"."project_id" LEFT JOIN employees ON "projects__employees"."employee_id" = "employees"."id""`,
      );
    });

    test("self join with alias", async () => {
      const db = UserModel.getPuri("r");
      // departments.parent_id -> departments.id (자기참조)
      // child: 하위 부서, parent: 상위 부서
      await db
        .table({ child: "departments" })
        .leftJoin({ parent: "departments" }, "child.parent_id", "parent.id");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "join").toMatchInlineSnapshot(
        `"LEFT JOIN departments ON "child"."parent_id" = "parent"."id""`,
      );
    });

    test("join with subquery", async () => {
      const db = UserModel.getPuri("r");
      // departments + 부서별 직원 수 서브쿼리 조인
      await db.table("departments").leftJoin(
        {
          emp_stats: db
            .table("employees")
            .select({ department_id: "employees.department_id" })
            .groupBy("employees.department_id"),
        },
        "departments.id",
        "emp_stats.department_id",
      );
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "join").toMatchInlineSnapshot(
        `"LEFT JOIN (subquery) AS emp_stats ON "departments"."id" = "emp_stats"."department_id""`,
      );
    });
  });

  describe("C. WHERE", () => {
    describe("C. WHERE", () => {
      test("where - 단일조건", async () => {
        const db = UserModel.getPuri("r");
        await db.table("users").where("users.id", 1);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
      });

      test("where - 객체조건", async () => {
        const db = UserModel.getPuri("r");
        await db.table("users").where({ "users.id": 1, "users.username": "test" });
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `""users"."id" = 1 AND "users"."username" = 'test'"`,
        );
      });

      test("where - 비교연산자", async () => {
        const db = UserModel.getPuri("r");
        await db.table("employees").where("employees.salary", ">", "70000");
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""employees"."salary" > '70000'"`);
      });

      test("where - 범위조건", async () => {
        const db = UserModel.getPuri("r");
        await db
          .table("employees")
          .where("employees.salary", ">=", "60000")
          .where("employees.salary", "<=", "80000");
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `""employees"."salary" >= '60000' AND "employees"."salary" <= '80000'"`,
        );
      });

      test("where - 체이닝(AND)", async () => {
        const db = UserModel.getPuri("r");
        await db.table("users").where("users.role", "normal").where("users.is_verified", true);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `""users"."role" = 'normal' AND "users"."is_verified" = TRUE"`,
        );
      });

      test("where - 체이닝(OR)", async () => {
        const db = UserModel.getPuri("r");
        await db
          .table("users")
          .whereGroup((g) => g.where("users.role", "admin"))
          .orWhereGroup((g) => g.where("users.role", "normal"));
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `"("users"."role" = 'admin') OR ("users"."role" = 'normal')"`,
        );
      });

      test("whereIn", async () => {
        const db = UserModel.getPuri("r");
        await db.table("projects").whereIn("projects.status", ["in_progress", "planning"]);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `""projects"."status" IN ('in_progress', 'planning')"`,
        );
      });

      test("whereNotIn", async () => {
        const db = UserModel.getPuri("r");
        await db.table("projects").whereNotIn("projects.status", ["cancelled", "completed"]);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `""projects"."status" NOT IN ('cancelled', 'completed')"`,
        );
      });

      test("whereNull", async () => {
        const db = UserModel.getPuri("r");
        await db.table("employees").where("employees.hire_date", null);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""employees"."hire_date" IS NULL"`);
      });

      test("where - LIKE", async () => {
        const db = UserModel.getPuri("r");
        await db.table("users").where("users.bio", "like", "%개발%");
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""users"."bio" LIKE '%개발%'"`);
      });
    });
  });

  describe("D. AGGREGATE FUNCTIONS(집계함수)", () => {
    test("count", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ total: Puri.count("employees.id") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        `"COUNT("employees".id)::INTEGER AS "total""`,
      );
    });

    test("sum", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ totalSalary: Puri.sum("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        `"SUM("employees".salary) AS \`totalSalary\`"`,
      );
    });

    test("avg", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ avgSalary: Puri.avg("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        `"AVG("employees".salary) AS \`avgSalary\`"`,
      );
    });

    test("max", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ maxSalary: Puri.max("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        `"MAX("employees".salary) AS \`maxSalary\`"`,
      );
    });

    test("min", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ minSalary: Puri.min("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        `"MIN("employees".salary) AS \`minSalary\`"`,
      );
    });

    test("groupBy", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("employees")
        .select({
          department_id: "employees.department_id",
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "groupBy").toMatchInlineSnapshot(`""employees"."department_id""`);
    });

    test("groupBy - 다중 컬럼", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("projects")
        .select({
          status: "projects.status",
          count: Puri.count("projects.id"),
        })
        .groupBy("projects.status", "projects.created_at");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "groupBy").toMatchInlineSnapshot(
        `""projects"."status", "projects"."created_at""`,
      );
    });

    test("having", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("employees")
        .select({
          department_id: "employees.department_id",
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id")
        .having("COUNT(employees.id) >= 2");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "having").toMatchInlineSnapshot(`"COUNT("employees".id) >= 2"`);
    });

    test("집계 + groupBy + having 조합", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("employees")
        .select({
          department_id: "employees.department_id",
          avgSalary: Puri.avg("employees.salary"),
          maxSalary: Puri.max("employees.salary"),
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id")
        .having("AVG(employees.salary) >= 70000");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "groupBy").toMatchInlineSnapshot(`""employees"."department_id""`);
      expectQuery(query, "having").toMatchInlineSnapshot(`"AVG("employees".salary) >= 70000"`);
    });
  });

  describe("E. SORT & PAGINATION", () => {
    test("orderBy - 단일 컬럼", async () => {
      const db = UserModel.getPuri("r");

      await db.table("users").orderBy("users.created_at", "desc");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "orderBy").toMatchInlineSnapshot(`""users"."created_at" DESC"`);
    });

    test("orderBy - 다중 컬럼", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("employees")
        .orderBy("employees.salary", "desc")
        .orderBy("employees.hire_date", "asc");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "orderBy").toMatchInlineSnapshot(
        `""employees"."salary" DESC, "employees"."hire_date" ASC"`,
      );
    });

    test("limit", async () => {
      const db = UserModel.getPuri("r");
      await db.table("projects").limit(10);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "pagination").toMatchInlineSnapshot(`"LIMIT 10"`);
    });

    test("limit + offset", async () => {
      const db = UserModel.getPuri("r");
      await db.table("projects").limit(10).offset(10);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "pagination").toMatchInlineSnapshot(`"LIMIT 10 OFFSET 10"`);
    });

    test("orderBy + limit + offset 조합", async () => {
      const db = UserModel.getPuri("r");
      await db.table("projects").orderBy("projects.created_at", "desc").limit(10).offset(10);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "orderBy").toMatchInlineSnapshot(`""projects"."created_at" DESC"`);
      expectQuery(query, "pagination").toMatchInlineSnapshot(`"LIMIT 10 OFFSET 10"`);
    });
  });

  describe("F. UPDATE HELPERS", () => {
    test("increment", async () => {
      const db = UserModel.getPuri("w");
      await db.table("projects").where("projects.id", 1).increment("budget", 1000);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "set").toMatchInlineSnapshot(`"budget = "budget" + 1000"`);
    });

    test("decrement", async () => {
      const db = UserModel.getPuri("w");
      await db.table("projects").where("projects.id", 1).decrement("budget", 500);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "set").toMatchInlineSnapshot(`"budget = "budget" - 500"`);
    });

    test("increment - 조건부 업데이트", async () => {
      const db = UserModel.getPuri("w");
      await db.table("projects").where("projects.id", 1).increment("budget", 100);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "set").toMatchInlineSnapshot(`"budget = "budget" + 100"`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""projects"."id" = 1"`);
    });
  });

  describe("G. ETC", () => {
    test("first", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").orderBy("users.created_at", "desc").first();
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "pagination").toMatchInlineSnapshot(`"LIMIT 1"`);
      expectQuery(query, "orderBy").toMatchInlineSnapshot(`""users"."created_at" DESC"`);
    });

    test("pluck", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").where("users.role", "admin").pluck("users.email");
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."email""`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""users"."role" = 'admin'"`);
    });
  });
});
