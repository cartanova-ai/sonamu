import { randomUUID } from "node:crypto";

import { Naite, Puri } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";

import { UserModel } from "../application/user/user.model";
import { expectQuery } from "../testing/expect-query";
import {
  cleanupTestRecords,
  getFixtureMaxIds,
  resetSequencesToFixture,
} from "../testing/test-helpers";

bootstrap(vi);

let fixtureMaxIds: Awaited<ReturnType<typeof getFixtureMaxIds>>;

beforeAll(async () => {
  fixtureMaxIds = await getFixtureMaxIds();
  await resetSequencesToFixture(fixtureMaxIds);
});

describe("Puri Query", () => {
  describe("A. BASIC CRUD", () => {
    afterEach(async () => {
      await cleanupTestRecords(fixtureMaxIds);
    });

    async function expectConflictJsonValue(value: string[] | string | Record<string, unknown>) {
      const db = UserModel.getPuri("w");
      const [inserted] = await db
        .table("sync_fixtures")
        .insert({ name: "충돌 전", status: "draft", tags: ["tag1"] })
        .returning("id");

      expect(inserted).toBeDefined();
      if (!inserted) {
        return;
      }

      const [updated] = await db
        .table("sync_fixtures")
        .insert({ id: inserted.id, name: "충돌 후", status: "active", tags: ["tag2"] })
        .onConflict("id", { update: { tags: JSON.parse(JSON.stringify(value)) } })
        .returning("*");

      expect(updated?.tags).toEqual(value);
    }

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

    test("insert - 단일 객체", async () => {
      const db = UserModel.getPuri("w");
      await db.table("users").insert({
        id: randomUUID(),
        username: "테스트",
        email: "test@test.com",
        password: "test",
        role: "normal",
      });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"insert"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
    });

    test("insert - 배열 (다중 행)", async () => {
      const db = UserModel.getPuri("w");
      await db.table("users").insert([
        {
          id: randomUUID(),
          username: "user1",
          email: "user1@test.com",
          password: "pass1",
          role: "normal",
        },
        {
          id: randomUUID(),
          username: "user2",
          email: "user2@test.com",
          password: "pass2",
          role: "normal",
        },
        {
          id: randomUUID(),
          username: "user3",
          email: "user3@test.com",
          password: "pass3",
          role: "admin",
        },
      ]);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"insert"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);

      expect(query).toContain("user1@test.com");
      expect(query).toContain("user2@test.com");
      expect(query).toContain("user3@test.com");
    });

    test("insert - JSON 컬럼", async () => {
      const db = UserModel.getPuri("w");
      await db.table("sync_fixtures").insert({
        name: "테스트",
        code: null,
        status: "draft" as const,
        tags: ["tag1", "tag2"],
      });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"insert"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"sync_fixtures"`);
      expectQuery(query, "values").toMatchInlineSnapshot(
        `"NULL,'테스트','draft','["tag1","tag2"]'"`,
      );
    });

    test("update", async () => {
      const db = UserModel.getPuri("w");
      await db.table("users").where("users.id", "1").update({ username: "수정됨" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"update"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "set").toMatchInlineSnapshot(`"username = '수정됨'"`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = '1'"`);
    });

    test("update - JSON 컬럼", async () => {
      const db = UserModel.getPuri("w");
      await db
        .table("sync_fixtures")
        .where("sync_fixtures.id", 1)
        .update({ tags: ["tag3", "tag4"] });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"update"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"sync_fixtures"`);
      expectQuery(query, "set").toMatchInlineSnapshot(`"tags = '["tag3","tag4"]'"`);
    });

    test("onConflict 객체 update - JSON 배열", async () => {
      await expectConflictJsonValue(["tag3", "tag4"]);
    });

    test("onConflict 객체 update - JSON 문자열", async () => {
      await expectConflictJsonValue("tag3");
    });

    test("onConflict 객체 update - JSON 객체", async () => {
      await expectConflictJsonValue({ primary: "tag3" });
    });

    test("onConflict 컬럼 update - EXCLUDED JSON 값을 사용", async () => {
      const db = UserModel.getPuri("w");
      const [inserted] = await db
        .table("sync_fixtures")
        .insert({ name: "충돌 전", status: "draft", tags: ["tag1"] })
        .returning("id");

      expect(inserted).toBeDefined();
      if (!inserted) {
        return;
      }

      const [updated] = await db
        .table("sync_fixtures")
        .insert({ id: inserted.id, name: "충돌 후", status: "active", tags: ["tag2", "tag3"] })
        .onConflict("id", { update: ["tags"] })
        .returning("*");

      expect(updated?.tags).toEqual(["tag2", "tag3"]);
    });

    test("delete", async () => {
      const db = UserModel.getPuri("w");
      await db.table("users").where("users.id", "1").delete();
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"delete"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = '1'"`);
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
        await db.table("users").where("users.id", "1");
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = '1'"`);
      });

      test("where - 객체조건", async () => {
        const db = UserModel.getPuri("r");
        await db.table("users").where({ "users.id": "1", "users.username": "test" });
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(
          `""users"."id" = '1' AND "users"."username" = 'test'"`,
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

      test("where로 NULL 체크", async () => {
        const db = UserModel.getPuri("r");
        await db.table("employees").where("employees.hire_date", null);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""employees"."hire_date" IS NULL"`);
      });

      test("where로 NOT NULL 체크", async () => {
        const db = UserModel.getPuri("r");
        await db.table("employees").where("employees.hire_date", "!=", null);
        const query = Naite.get("puri:executed-query").first();

        expectQuery(query, "where").toMatchInlineSnapshot(`""employees"."hire_date" IS NOT NULL"`);
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
        `"COUNT("employees"."id")::INTEGER AS "total""`,
      );
    });

    test("sum", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ totalSalary: Puri.sum("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"SUM("employees"."salary") AS `totalSalary`"',
      );
    });

    test("avg", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ avgSalary: Puri.avg("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"AVG("employees"."salary") AS `avgSalary`"',
      );
    });

    test("max", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ maxSalary: Puri.max("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"MAX("employees"."salary") AS `maxSalary`"',
      );
    });

    test("min", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ minSalary: Puri.min("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"MIN("employees"."salary") AS `minSalary`"',
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
      await db.table("sync_fixtures").where("sync_fixtures.id", 1).increment("priority", 10);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "set").toMatchInlineSnapshot(`"priority = "priority" + 10"`);
    });

    test("decrement", async () => {
      const db = UserModel.getPuri("w");
      await db.table("sync_fixtures").where("sync_fixtures.id", 1).decrement("priority", 5);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "set").toMatchInlineSnapshot(`"priority = "priority" - 5"`);
    });

    test("increment - 조건부 업데이트", async () => {
      const db = UserModel.getPuri("w");
      await db.table("sync_fixtures").where("sync_fixtures.id", 1).increment("priority", 1);
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "set").toMatchInlineSnapshot(`"priority = "priority" + 1"`);
      expectQuery(query, "where").toMatchInlineSnapshot(`""sync_fixtures"."id" = 1"`);
    });
  });

  describe("G. VECTOR SIMILARITY", () => {
    // 테스트용 임베딩 벡터
    const embeddingMock = [0.1, 0.2, 0.3];

    test("cosine (default)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock);
      const query = Naite.get("puri:executed-query").first();

      // columns: 1 - (col <=> vec) as similarity
      expect(query).toContain(`1 - ("documents"."title_content_embedding" <=>`);
      expect(query).toContain(`as similarity`);
      // orderBy: col <=> vec (ASC 암시)
      expect(query).toContain(`order by "documents"."title_content_embedding" <=>`);
      // where: col IS NOT NULL
      expect(query).toContain(`"documents"."title_content_embedding" is not null`);
    });

    test("l2", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "l2",
        });
      const query = Naite.get("puri:executed-query").first();

      // columns: col <-> vec as similarity (1- 없음)
      expect(query).toContain(`"documents"."title_content_embedding" <->`);
      expect(query).toContain(`as similarity`);
      expect(query).not.toContain(`1 -`); // l2는 distance 그대로
      // orderBy: col <-> vec
      expect(query).toContain(`order by "documents"."title_content_embedding" <->`);
      // where: col IS NOT NULL
      expect(query).toContain(`"documents"."title_content_embedding" is not null`);
    });

    test("inner_product", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "inner_product",
        });
      const query = Naite.get("puri:executed-query").first();

      // columns: -(col <#> vec) as similarity
      expect(query).toContain(`-("documents"."title_content_embedding" <#>`);
      expect(query).toContain(`as similarity`);
      // orderBy: col <#> vec
      expect(query).toContain(`order by "documents"."title_content_embedding" <#>`);
      // where: col IS NOT NULL
      expect(query).toContain(`"documents"."title_content_embedding" is not null`);
    });

    test("cosine (threshold)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "cosine",
          threshold: 0.7,
        });
      const query = Naite.get("puri:executed-query").first();

      // where: col IS NOT NULL AND col <=> vec <= (1 - threshold)
      // threshold 0.7 → cosine_distance <= 0.3
      expect(query).toContain(`"documents"."title_content_embedding" is not null`);
      expect(query).toMatch(/<=> '\[.*\]'::vector <= 0\.3/);
    });

    test("cosine (distinctOn)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "cosine",
          distinctOn: "documents.id",
        });
      const query = Naite.get("puri:executed-query").first();

      // 서브쿼리로 감싸짐
      expect(query).toContain(`from (select`);
      expect(query).toContain(`as "distinct_vectors"`);
      // DISTINCT ON
      expect(query).toContain(`DISTINCT ON ("documents"."id")`);
      // 안쪽 ORDER BY: distinctOn 컬럼 + 벡터 거리
      expect(query).toMatch(
        /order by "documents"\."id", "documents"\."title_content_embedding" <=>/,
      );
      // 바깥 ORDER BY: similarity desc
      expect(query).toContain(`order by "similarity" desc`);
    });

    test("cosine (distinctOn + threshold)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "cosine",
          distinctOn: "documents.title",
          threshold: 0.6,
        });
      const query = Naite.get("puri:executed-query").first();

      // 서브쿼리로 감싸짐
      expect(query).toContain(`from (select`);
      // threshold는 바깥 WHERE에서 similarity로 필터
      expect(query).toContain(`"similarity" >= 0.6`);
    });

    test("cosine (distinctOn + limit)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "cosine",
          distinctOn: "documents.id",
        })
        .limit(5);
      const query = Naite.get("puri:executed-query").first();

      // 서브쿼리로 감싸짐
      expect(query).toContain(`from (select`);
      expect(query).toContain(`as "distinct_vectors"`);
      // limit은 바깥 쿼리에 걸림
      expect(query).toContain(`order by "similarity" desc limit 5`);
    });

    test("cosine (distinctOn 없이 기존 동작 유지)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "cosine",
        });
      const query = Naite.get("puri:executed-query").first();

      // 서브쿼리 없음
      expect(query).not.toContain(`from (select`);
      expect(query).not.toContain(`distinct_vectors`);
      expect(query).not.toContain(`DISTINCT ON`);
      // 직접 테이블에서 조회
      expect(query).toContain(`from "documents"`);
      // similarity 계산
      expect(query).toContain(`as similarity`);
      // 벡터 거리순 정렬
      expect(query).toMatch(/"documents"\."title_content_embedding" <=> '.*'::vector/);
    });

    test("as - alias (기본값: similarity)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .vectorSimilarity("documents.title_content_embedding", embeddingMock);
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(`as similarity`);
    });

    test("cosine (distinctOn + 기존 select 보존)", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .select({
          docId: "documents.id",
          docTitle: "documents.title",
          docContent: "documents.content",
        })
        .vectorSimilarity("documents.title_content_embedding", embeddingMock, {
          method: "cosine",
          distinctOn: "documents.content",
        });
      const query = Naite.get("puri:executed-query").first();

      // 서브쿼리로 감싸짐
      expect(query).toContain(`from (select`);
      expect(query).toContain(`as "distinct_vectors"`);
      // DISTINCT ON
      expect(query).toContain(`DISTINCT ON ("documents"."content")`);
      // 기존 subset 컬럼들이 보존되어야 함
      expect(query).toContain(`"documents"."id" as "docId"`);
      expect(query).toContain(`"documents"."title" as "docTitle"`);
      expect(query).toContain(`"documents"."content" as "docContent"`);
      // similarity
      expect(query).toContain(`as similarity`);
      // 바깥 ORDER BY
      expect(query).toContain(`order by "similarity" desc`);
    });
  });

  describe("H. FULLTEXT SEARCH (PGroonga)", () => {
    test("whereSearch - 단일 컬럼", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").whereSearch("documents.title", "검색어");
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain("documents.title &@~ pgroonga_condition('검색어')");
    });

    test("whereSearch - 복합 컬럼", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").whereSearch(["documents.title", "documents.content"], "검색어");
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "ARRAY[documents.title::text,documents.content::text] &@~ pgroonga_condition('검색어')",
      );
    });

    test("whereSearch - weights 옵션", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").whereSearch(["documents.title", "documents.content"], "검색어", {
        weights: [10, 1],
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "ARRAY[documents.title::text,documents.content::text] &@~ pgroonga_condition('검색어', weights => ARRAY[10,1])",
      );
    });

    test("score", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({ score: Puri.score() });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain('pgroonga_score(tableoid, ctid) AS "score"');
    });

    test("highlight - 단일 컬럼", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .select({ highlighted: Puri.highlight("documents.title", "검색어") });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain('pgroonga_highlight_html("documents"."title", ARRAY[\'검색어\'])');
    });

    test("highlight - 복합 컬럼", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        highlighted: Puri.highlight(["documents.title", "documents.content"], "검색어"),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        'pgroonga_highlight_html(ARRAY["documents"."title", "documents"."content"], ARRAY[\'검색어\'])',
      );
    });

    test("highlight - 검색어 배열", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        highlighted: Puri.highlight("documents.title", ["키워드1", "키워드2"]),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "pgroonga_highlight_html(\"documents\".\"title\", ARRAY['키워드1', '키워드2'])",
      );
    });
  });

  describe("I. FULLTEXT SEARCH (PostgreSQL tsvector)", () => {
    test("whereTsSearch - 기본", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").whereTsSearch("documents.title", "검색어");
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain("documents.title @@ websearch_to_tsquery('simple', '검색어')");
    });

    test("whereTsSearch - config 옵션 (문자열)", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").whereTsSearch("documents.title", "검색어", "simple");
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain("documents.title @@ websearch_to_tsquery('simple', '검색어')");
    });

    test("whereTsSearch - config 옵션 (객체)", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").whereTsSearch("documents.title", "검색어", {
        config: "simple",
        parser: "plainto_tsquery",
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain("documents.title @@ plainto_tsquery('simple', '검색어')");
    });

    test("tsHighlight - 기본", async () => {
      const db = UserModel.getPuri("r");
      await db
        .table("documents")
        .select({ highlighted: Puri.tsHighlight("documents.title", "검색어") });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        `ts_headline('simple', "documents"."title", websearch_to_tsquery('simple', '검색어'))`,
      );
    });

    test("tsHighlight - 옵션", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        highlighted: Puri.tsHighlight("documents.content", "검색어", {
          config: "simple",
          parser: "plainto_tsquery",
          startSel: "<mark>",
          stopSel: "</mark>",
          maxFragments: 3,
        }),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        `ts_headline('simple', "documents"."content", plainto_tsquery('simple', '검색어'), 'StartSel=<mark>, StopSel=</mark>, MaxFragments=3')`,
      );
    });

    test("tsRank - 기본", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        rank: Puri.tsRank(Puri.toTsVector("documents.title", "simple"), "검색어"),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "ts_rank(to_tsvector('simple', \"documents\".\"title\"), websearch_to_tsquery('simple', '검색어'))",
      );
    });

    test("tsRank - 옵션", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        rank: Puri.tsRank(Puri.toTsVector("documents.title"), "검색어", {
          config: "simple",
          weights: [0.1, 0.2, 0.4, 1.0],
        }),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "ts_rank(ARRAY[0.1, 0.2, 0.4, 1]::float4[], to_tsvector('simple', \"documents\".\"title\"), websearch_to_tsquery('simple', '검색어'))",
      );
    });

    test("tsRankCd - 기본", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        rank: Puri.tsRankCd(Puri.toTsVector("documents.title"), "검색어"),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "ts_rank_cd(to_tsvector('simple', \"documents\".\"title\"), websearch_to_tsquery('simple', '검색어'))",
      );
    });

    test("tsRankCd - 옵션", async () => {
      const db = UserModel.getPuri("r");
      await db.table("documents").select({
        rank: Puri.tsRankCd(Puri.toTsVector("documents.title"), "검색어", {
          config: "simple",
          parser: "phraseto_tsquery",
          normalization: 16,
        }),
      });
      const query = Naite.get("puri:executed-query").first();

      expect(query).toContain(
        "ts_rank_cd(to_tsvector('simple', \"documents\".\"title\"), phraseto_tsquery('simple', '검색어'), 16)",
      );
    });
  });

  describe("J. JSONB containment", () => {
    test("miomock generated object and array JSON columns build valid containment queries", () => {
      const db = UserModel.getPuri("r");
      const objectQuery = db
        .table("audit_events")
        .whereJsonSupersetOf("audit_events.payload_json", {
          source: "better-auth",
          context: {
            action: "user_signed_in",
          },
        })
        .rawQuery()
        .toSQL();
      const arrayQuery = db
        .table("sync_fixtures")
        .whereJsonSupersetOf("sync_fixtures.tags", ["jsonb", "query-builder"])
        .rawQuery()
        .toSQL();

      expect(objectQuery.sql).toBe(
        'select * from "audit_events" where "audit_events"."payload_json" @> ?',
      );
      expect(objectQuery.bindings).toEqual([
        JSON.stringify({
          source: "better-auth",
          context: {
            action: "user_signed_in",
          },
        }),
      ]);
      expect(arrayQuery.sql).toBe(
        'select * from "sync_fixtures" where "sync_fixtures"."tags" @> ?',
      );
      expect(arrayQuery.bindings).toEqual([JSON.stringify(["jsonb", "query-builder"])]);
    });

    test("generated JSON columns preserve grouped AND OR containment", () => {
      const db = UserModel.getPuri("r");
      const query = db
        .table("audit_events")
        .where("audit_events.source", "better-auth")
        .whereGroup((group) =>
          group
            .whereJsonSupersetOf("audit_events.payload_json", { action: "login" })
            .orWhereJsonSupersetOf("audit_events.payload_json", { action: "logout" }),
        )
        .rawQuery()
        .toSQL();

      expect(query.sql).toBe(
        'select * from "audit_events" where "audit_events"."source" = ? and ("audit_events"."payload_json" @> ? or "audit_events"."payload_json" @> ?)',
      );
      expect(query.bindings).toEqual([
        "better-auth",
        JSON.stringify({ action: "login" }),
        JSON.stringify({ action: "logout" }),
      ]);
    });
  });

  describe("K. FUZZY SEARCH (pg_trgm)", () => {
    test("whereFuzzy - 기본(<%)", () => {
      const db = UserModel.getPuri("r");
      const query = db.table("documents").whereFuzzy("documents.title", "검색어").toQuery();

      expect(query).toContain(`'검색어' <% "documents"."title"`);
    });

    test("whereFuzzy - % 연산자", () => {
      const db = UserModel.getPuri("r");
      const query = db
        .table("documents")
        .whereFuzzy("documents.title", "검색어", {
          operator: "%",
        })
        .toQuery();

      expect(query).toContain('"documents"."title" % \'검색어\'');
    });

    test("whereFuzzy - <<% 연산자", () => {
      const db = UserModel.getPuri("r");
      const query = db
        .table("documents")
        .whereFuzzy("documents.title", "검색어", {
          operator: "<<%",
        })
        .toQuery();

      expect(query).toContain(`'검색어' <<% "documents"."title"`);
    });

    test("whereFuzzy - 연산자 공백 정규화", () => {
      const db = UserModel.getPuri("r");
      const puri = db.table("documents");
      Reflect.apply(puri.whereFuzzy, puri, ["documents.title", "검색어", { operator: "  %  " }]);
      const query = puri.toQuery();

      expect(query).toContain('"documents"."title" % \'검색어\'');
    });

    test("whereFuzzy - 잘못된 연산자 거부", () => {
      const db = UserModel.getPuri("r");
      const puri = db.table("documents");
      const queryCountBefore = Naite.get("puri:executed-query").result().length;

      expect(() =>
        Reflect.apply(puri.whereFuzzy, puri, ["documents.title", "검색어", { operator: "||" }]),
      ).toThrowError("Invalid fuzzy operator: ||");
      expect(Naite.get("puri:executed-query").result()).toHaveLength(queryCountBefore);
    });

    test("whereFuzzy - single quote query escaping", () => {
      const db = UserModel.getPuri("r");
      const query = db.table("documents").whereFuzzy("documents.title", "l'amour").toQuery();
      expect(query).toContain("'l''amour' <% \"documents\".\"title\"");
    });

    test("whereFuzzy - SqlExpression 전체를 캐스팅", () => {
      const db = UserModel.getPuri("r");
      const query = db
        .table("documents")
        .whereFuzzy(Puri.rawString("?? || ??", ["documents.title", "documents.content"]), "검색어")
        .toQuery();

      expect(query).toContain('\'검색어\' <% "documents"."title" || "documents"."content"');
      expect(query).not.toContain("documents.title || documents.content::text");
    });

    test("wordSimilarity / similarity / strictWordSimilarity", () => {
      const db = UserModel.getPuri("r");
      const query = db
        .table("documents")
        .select({
          word: Puri.wordSimilarity("documents.title", "검색어"),
          whole: Puri.similarity("documents.title", "검색어"),
          strict: Puri.strictWordSimilarity("documents.title", "검색어"),
        })
        .toQuery();

      expect(query).toContain('word_similarity(\'검색어\', "documents"."title") AS "word"');
      expect(query).toContain('similarity("documents"."title", \'검색어\') AS "whole"');
      expect(query).toContain(
        'strict_word_similarity(\'검색어\', "documents"."title") AS "strict"',
      );
    });

    test("wordSimilarity / similarity / strictWordSimilarity - SqlExpression 전체를 캐스팅", () => {
      const db = UserModel.getPuri("r");
      const expression = Puri.rawString("documents.title || documents.content");

      const query = db
        .table("documents")
        .select({
          word: Puri.wordSimilarity(expression, "검색어"),
          whole: Puri.similarity(expression, "검색어"),
          strict: Puri.strictWordSimilarity(expression, "검색어"),
        })
        .toQuery();

      expect(query).toContain("word_similarity('검색어', documents.title || documents.content)");
      expect(query).toContain("similarity('검색어', documents.title || documents.content)");
      expect(query).toContain(
        "strict_word_similarity('검색어', documents.title || documents.content)",
      );
      expect(query).not.toContain(
        "word_similarity('검색어'::text, documents.title || documents.content::text)",
      );
      expect(query).not.toContain(
        "similarity(documents.title || documents.content::text, '검색어'::text)",
      );
      expect(query).not.toContain(
        "strict_word_similarity('검색어'::text, documents.title || documents.content::text)",
      );
    });
  });

  describe("L. ETC", () => {
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
