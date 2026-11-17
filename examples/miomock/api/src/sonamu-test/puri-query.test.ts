import { randomUUID } from "node:crypto";

import { Naite, parseFuzzyOperator, Puri, type SqlExpression } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";
import { z } from "zod";

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

type ConflictJsonValue = string[] | string | Record<string, string>;

async function expectConflictJsonValue(value: ConflictJsonValue) {
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

describe("Puri Query", () => {
  test("이름이 다른 담당자 관계는 원시 집계 표현식과 함께여도 id로 nullable 계약을 지킨다", async () => {
    type ManagerSchema = {
      roots: { id: number };
      staffs: { id: number; root_id: number; user_id: number };
      users: { id: number; name: string };
    };
    const knex = UserModel.getPuri("r").knex;
    const base = new Puri<ManagerSchema, { roots: ManagerSchema["roots"] }, ManagerSchema["roots"]>(
      knex,
      "roots",
    );
    base
      .rawQuery()
      .with("roots", knex.raw("SELECT * FROM (VALUES (1), (2)) AS fixture(id)"))
      .with("staffs", knex.raw("SELECT 10 AS id, 1 AS root_id, 100 AS user_id"))
      .with("users", knex.raw("SELECT 100 AS id, '담당자'::text AS name"));
    const selected = base
      .leftJoin("staffs", (join) => join.on("roots.id", "staffs.root_id"))
      .leftJoin("users", (join) => join.on("staffs.user_id", "users.id"))
      .select({
        id: "roots.id",
        manager: { id: "staffs.id", name: "users.name" },
        total: Puri.rawNumber("(SELECT COUNT(*)::integer FROM staffs)"),
      })
      .orderBy("roots.id");
    const rows = await selected;
    const schema = z.array(
      z.object({
        id: z.number(),
        manager: z.object({ id: z.number(), name: z.string() }).nullable(),
        total: z.number(),
      }),
    );
    expect(schema.parse(rows)).toEqual([
      { id: 1, manager: { id: 10, name: "담당자" }, total: 1 },
      { id: 2, manager: null, total: 1 },
    ]);
  });

  test("LEFT JOIN 그룹은 nullable 필드만 고르면 오류를 내고 id를 고르면 존재하는 행과 없는 행을 구분한다", async () => {
    type PresenceSchema = {
      roots: { id: number };
      details: {
        id: number;
        root_id: number;
        note: string | null;
        extra: string | null;
        detail: string | null;
      };
    };
    const knex = UserModel.getPuri("r").knex;
    const base = new Puri<
      PresenceSchema,
      { roots: PresenceSchema["roots"] },
      PresenceSchema["roots"]
    >(knex, "roots");
    base
      .rawQuery()
      .with("roots", knex.raw("SELECT * FROM (VALUES (1), (2)) AS fixture(id)"))
      .with(
        "details",
        knex.raw(
          "SELECT 7 AS id, 1 AS root_id, NULL::text AS note, NULL::text AS extra, NULL::text AS detail",
        ),
      );
    const joined = base
      .leftJoin({ detail: "details" }, (join) => join.on("roots.id", "detail.root_id"))
      .orderBy("roots.id");
    await expect(
      joined.clone().select({ id: "roots.id", detail: { note: "detail.note" } }),
    ).rejects.toThrow(/needs an "id" field because it reads LEFT JOIN "detail"/);

    const selected = joined.select({
      id: "roots.id",
      detail: { id: "detail.id", note: "detail.note", extra: "detail.extra" },
    });
    const onQuery = vi.fn();
    const onResponse = vi.fn();
    selected
      .rawQuery()
      .timeout(5000, { cancel: true })
      .on("query", onQuery)
      .on("query-response", onResponse);
    expect(await selected).toEqual([
      { id: 1, detail: { id: 7, note: null, extra: null } },
      { id: 2, detail: null },
    ]);
    expect(onQuery).toHaveBeenCalledOnce();
    expect(onQuery.mock.calls[0]?.[0]).toMatchObject({ timeout: 5000, cancelOnTimeout: true });
    expect(onResponse).toHaveBeenCalledOnce();
    expect(await selected.clone().first()).toEqual({
      id: 1,
      detail: { id: 7, note: null, extra: null },
    });
    expect(await selected.clone().where("roots.id", 2).first()).toEqual({ id: 2, detail: null });
    expect(await selected.rawQuery()).toEqual([
      { id: 1, detail__id: 7, detail__note: null, detail__extra: null },
      { id: 2, detail__id: null, detail__note: null, detail__extra: null },
    ]);

    const projection = selected
      .clone()
      .clear("select")
      .clear("order")
      .select({ detail: { id: "detail.id", note: "detail.note" } });
    expect(
      await projection.clone().groupBy("detail.id", "detail.note").orderBy("detail.id"),
    ).toEqual([{ detail: { id: 7, note: null } }, { detail: null }]);
    expect(await projection.clone().distinct().orderBy("detail.id")).toEqual([
      { detail: { id: 7, note: null } },
      { detail: null },
    ]);
    // raw 식만 든 그룹은 검사하지 않고 객체로 둡니다.
    const count = projection
      .clone()
      .clear("select")
      .select({ detail: { total: Puri.count("detail.root_id") } });
    expect(await count).toEqual([{ detail: { total: 1 } }]);
  });

  test("중첩 select는 실제 SQL 결과를 복원하고 수동 hydrate와 호환된다", async () => {
    const query = UserModel.getPuri("r")
      .table("users")
      .select({ user: { id: "users.id", name: "users.username" }, literal__id: "users.id" })
      .limit(1);
    const [raw] = await query.clone().rawQuery();
    expect(raw).toBeDefined();
    const rows = await query.clone();
    expect(rows).toEqual([
      {
        user: { id: raw.user__id, name: raw.user__name },
        literal__id: raw.literal__id,
      },
    ]);
    const first = await query.clone().first();
    expect(first).toEqual(rows[0]);
    const nestedOnly = await UserModel.getPuri("r")
      .table("users")
      .select({ user: { id: "users.id", name: "users.username" } })
      .limit(1);
    expect(UserModel.hydrate(nestedOnly)).toEqual(nestedOnly);
  });

  test("중첩 select의 매칭되지 않은 LEFT JOIN은 null로 반환한다", async () => {
    const row = await UserModel.getPuri("r")
      .table("users")
      .leftJoin({ employee: "employees" }, (join) => {
        join.on("users.id", "employee.user_id").andOnVal("employee.id", -1);
      })
      .select({
        id: "users.id",
        employee: { id: "employee.id", number: "employee.employee_number" },
      })
      .first();
    expect(row).toBeDefined();
    expect(row.employee).toBeNull();
  });

  describe("A. BASIC CRUD", () => {
    afterEach(async () => {
      await cleanupTestRecords(fixtureMaxIds);
    });

    test("select", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").select({ id: "users.id" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"select"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS "id""`);
    });

    test("select with alias", async () => {
      const db = UserModel.getPuri("r");
      await db.table("users").select({ userId: "users.id" });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "type").toMatchInlineSnapshot(`"select"`);
      expectQuery(query, "table").toMatchInlineSnapshot(`"users"`);
      expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS "userId""`);
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

    test("onConflict 객체 update - JSON으로 만든 sql_expression 모양 객체는 SQL이 아닌 값으로 저장한다", async () => {
      const db = UserModel.getPuri("w");
      const [inserted] = await db
        .table("sync_fixtures")
        .insert({ name: "충돌 전", status: "draft", tags: ["tag1"] })
        .returning("id");

      expect(inserted).toBeDefined();
      if (!inserted) {
        return;
      }

      // 클라이언트가 보낸 JSON을 검증 없이 넘긴 상황을 재현합니다.
      const forged = JSON.parse(
        '{"_type":"sql_expression","_return":"string","_sql":"\'[\\"injected\\"]\'::jsonb","_params":[]}',
      );

      const [updated] = await db
        .table("sync_fixtures")
        .insert({ id: inserted.id, name: "충돌 후", status: "active", tags: ["tag2"] })
        .onConflict("id", { update: { tags: forged } })
        .returning("*");

      expect(updated?.tags).not.toEqual(["injected"]);
      expect(updated?.tags).toEqual(forged);
    });

    test("onConflict 객체 update - Puri.rawString으로 만든 표현식은 SQL로 실행한다", async () => {
      const db = UserModel.getPuri("w");
      const [inserted] = await db
        .table("sync_fixtures")
        .insert({ name: "충돌 전", status: "draft", tags: ["tag1"] })
        .returning("id");

      expect(inserted).toBeDefined();
      if (!inserted) {
        return;
      }

      // 생성된 update 객체 타입은 SqlExpression을 받지 않으므로, 표현식을 허용하는 행 타입으로 Puri를 직접 만듭니다.
      type FormalConflictRow = {
        id: number;
        name: string | SqlExpression<"string">;
        status: string;
        tags: string;
      };
      type FormalConflictSchema = { sync_fixtures: FormalConflictRow };
      const fixtures = new Puri<FormalConflictSchema, FormalConflictSchema, FormalConflictRow>(
        db.knex,
        "sync_fixtures",
      );
      const [updated] = await fixtures
        .insert({ id: inserted.id, name: "충돌 후", status: "active", tags: '["tag2"]' })
        .onConflict("id", { update: { name: Puri.rawString("'정식 표현식'") } })
        .returning("*");

      expect(updated?.name).toBe("정식 표현식");
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
        '"SUM("employees"."salary") AS "totalSalary""',
      );
    });

    test("avg", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ avgSalary: Puri.avg("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"AVG("employees"."salary") AS "avgSalary""',
      );
    });

    test("max", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ maxSalary: Puri.max("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"MAX("employees"."salary") AS "maxSalary""',
      );
    });

    test("min", async () => {
      const db = UserModel.getPuri("r");
      await db.table("employees").select({ minSalary: Puri.min("employees.salary") });
      const query = Naite.get("puri:executed-query").first();

      expectQuery(query, "columns").toMatchInlineSnapshot(
        '"MIN("employees"."salary") AS "minSalary""',
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

    test("생성 JSONB 컬럼에서 텍스트를 조합하고 null 값의 키도 존재하는 것으로 조회한다", async () => {
      const db = UserModel.getPuri("w");
      const dedupeKey = randomUUID();
      const [inserted] = await db
        .table("audit_events")
        .insert({
          source: "sonamu-test",
          category: "security",
          event_type: "jsonb_api_test",
          event_key: dedupeKey,
          dedupe_key: dedupeKey,
          payload_json: {
            title: "최상위 제목",
            document: { title: "중첩 제목", description: null },
            nullable_key: null,
          },
          occurred_at: new Date(),
        })
        .returning("id");

      expect(inserted).toBeDefined();
      if (!inserted) {
        return;
      }

      const extractionQuery = db.table("audit_events").where("id", inserted.id);
      const nestedTitle = extractionQuery.jsonText("payload_json", "document", "title");
      const vectorSource = Puri.concatExpressions(
        Puri.coalesce(nestedTitle, "제목 없음"),
        "\n",
        Puri.coalesce(
          extractionQuery.jsonText("payload_json", "document", "description"),
          "설명 없음",
        ),
      );
      const [extracted] = await extractionQuery.select({
        topLevelTitle: extractionQuery.jsonText("payload_json", "title"),
        nestedTitle,
        missingText: Puri.coalesce(
          extractionQuery.jsonText("payload_json", "document", "missing"),
          "누락 없음",
        ),
        vectorSource,
      });

      expect(extracted).toEqual({
        topLevelTitle: "최상위 제목",
        nestedTitle: "중첩 제목",
        missingText: "누락 없음",
        vectorSource: "중첩 제목\n설명 없음",
      });

      const presentRows = await db
        .table("audit_events")
        .where("id", inserted.id)
        .whereJsonKeyExists("payload_json", "nullable_key")
        .select({ id: "id" });
      const missingRows = await db
        .table("audit_events")
        .where("id", inserted.id)
        .whereJsonKeyExists("payload_json", "missing_key")
        .select({ id: "id" });

      expect(presentRows).toEqual([{ id: inserted.id }]);
      expect(missingRows).toEqual([]);
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
      const operator = parseFuzzyOperator("  %  ");
      puri.whereFuzzy("documents.title", "검색어", { operator });
      const query = puri.toQuery();

      expect(operator).toBe("%");
      expect(query).toContain('"documents"."title" % \'검색어\'');
    });

    test("whereFuzzy - 잘못된 연산자 거부", () => {
      const queryCountBefore = Naite.get("puri:executed-query").result().length;

      expect(() => parseFuzzyOperator("||")).toThrowError("Invalid fuzzy operator: ||");
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

  describe("M. SqlExpression 판정", () => {
    // 클라이언트 JSON처럼 검증 없이 들어온 sql_expression 모양 객체입니다.
    const forgedExpression = (): SqlExpression<"string"> =>
      JSON.parse('{"_type":"sql_expression","_return":"string","_sql":"(SELECT 1)","_params":[]}');

    test("orderBy - 위조한 표현식은 거부한다", () => {
      const db = UserModel.getPuri("r");
      expect(() => {
        db.table("users").orderBy(forgedExpression());
      }).toThrow(TypeError);
      expect(() => {
        db.table("users").orderBy([forgedExpression()]);
      }).toThrow(TypeError);
      expect(() => {
        db.table("users").orderBy([{ column: forgedExpression(), order: "desc" }]);
      }).toThrow(TypeError);
    });

    test("select / appendSelect - 위조한 표현식은 거부한다", () => {
      const db = UserModel.getPuri("r");
      const leaked = forgedExpression();
      expect(() => {
        db.table("users").select({ leaked });
      }).toThrow(TypeError);
      expect(() => {
        db.table("users").select({ id: "users.id" }).appendSelect({ leaked });
      }).toThrow(TypeError);
    });

    test("whereTsSearch / whereFuzzy - 위조한 표현식은 거부한다", () => {
      // whereGroup 콜백은 쿼리를 컴파일할 때 실행되므로 toQuery()에서 거부되는지 확인합니다.
      const db = UserModel.getPuri("r");
      expect(() => {
        db.table("documents").whereTsSearch(forgedExpression(), "검색어");
      }).toThrow(TypeError);
      expect(() => {
        db.table("documents").whereFuzzy(forgedExpression(), "검색어");
      }).toThrow(TypeError);
      expect(() => {
        db.table("documents")
          .whereGroup((g) => g.whereTsSearch(forgedExpression(), "검색어"))
          .toQuery();
      }).toThrow(TypeError);
      expect(() => {
        db.table("documents")
          .whereGroup((g) => g.orWhereTsSearch(forgedExpression(), "검색어"))
          .toQuery();
      }).toThrow(TypeError);
      expect(() => {
        db.table("documents")
          .whereGroup((g) => g.whereFuzzy(forgedExpression(), "검색어"))
          .toQuery();
      }).toThrow(TypeError);
      expect(() => {
        db.table("documents")
          .whereGroup((g) => g.orWhereFuzzy(forgedExpression(), "검색어"))
          .toQuery();
      }).toThrow(TypeError);
    });

    test("표현식을 조합하는 헬퍼는 위조한 표현식을 정식 표현식으로 바꾸지 않는다", () => {
      expect(() => Puri.coalesce(forgedExpression(), "기본값")).toThrow(TypeError);
      expect(() => Puri.concatExpressions("a", forgedExpression())).toThrow(TypeError);
      expect(() => Puri.wordSimilarity(forgedExpression(), "검색어")).toThrow(TypeError);
      expect(() => Puri.similarity(forgedExpression(), "검색어")).toThrow(TypeError);
      expect(() => Puri.strictWordSimilarity(forgedExpression(), "검색어")).toThrow(TypeError);
    });

    test("정식 API로 만든 표현식은 orderBy와 select에서 그대로 SQL로 쓴다", () => {
      const db = UserModel.getPuri("r");
      const query = db
        .table("users")
        .select({ id: "users.id", score: Puri.rawNumber("users.id * ?", [2]) })
        .orderBy(Puri.rawNumber("users.id * ?", [3]), "desc")
        .toQuery();

      expect(query).toContain('users.id * 2 AS "score"');
      expect(query).toContain("order by users.id * 3 desc");
    });
  });
});
