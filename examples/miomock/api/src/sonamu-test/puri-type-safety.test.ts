import { randomUUID } from "node:crypto";

import { type InsertResult, type JsonColumns, type JsonSupersetValue, Naite, Puri } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, beforeAll, describe, expect, expectTypeOf, vi } from "vitest";
import { z } from "zod";

import { type AuditEventBaseSchema, type ProjectBaseSchema } from "../application/sonamu.generated";
import { UserModel } from "../application/user/user.model";
import {
  cleanupTestRecords,
  getFixtureMaxIds,
  resetSequencesToFixture,
} from "../testing/test-helpers";

bootstrap(vi);

// fixture 데이터의 max ID
let fixtureMaxIds: Awaited<ReturnType<typeof getFixtureMaxIds>>;

beforeAll(async () => {
  // INSERT 테스트를 위해 sequence를 fixture max + 1로 리셋
  fixtureMaxIds = await getFixtureMaxIds();
  await resetSequencesToFixture(fixtureMaxIds);
});

describe("Puri Type Safety", () => {
  describe("A. 기본", () => {
    test("테이블 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 테이블
      db.table("users");
      db.table("employees");

      // @ts-expect-error - 존재하지 않는 테이블
      db.table("nonexistent_table");
    });

    test("컬럼 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 컬럼
      db.table("users").select({ id: "id" });
      db.table("users").where("id", "1");
      db.table("users").where("role", "admin");

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").select({ bad: "nonexistent" });

      // @ts-expect-error - 오타
      db.table("users").where("emal", "test@test.com");

      // @ts-expect-error - 존재하지 않는 테이블 prefix
      db.table("users").select({ id: "invalid_table.id" });
    });

    test("기본 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      //유효한 타입
      db.table("users").where("id", "1");

      // @ts-expect-error - string 컬럼에 number
      db.table("users").where("id", 123);

      // @ts-expect-error - string 컬럼에 number
      db.table("users").where("username", 123);
    });

    test("ENUM 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 enum 값
      db.table("users").where("role", "admin");
      db.table("users").where("role", "normal");

      // @ts-expect-error - role은 "admin" | "normal"인데 잘못된 값
      db.table("users").where("role", "invalid_role");
    });
  });

  describe("B. JOIN 타입 안전성", () => {
    test("JOIN 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // join 전: prefix 없이 사용 가능
      db.table("users").where("id", "1");

      // join 후: prefix 필요
      const joinQuery = db.table("employees").join("users", "employees.user_id", "users.id");
      joinQuery.where("employees.id", 1);
      joinQuery.where("users.id", "1");

      // @ts-expect-error - join 후에는 prefix 없이 사용 불가
      joinQuery.where("id", 1);

      // @ts-expect-error - departments는 join 안 했으므로 참조 불가
      db.table("users").where("departments.id", 1);

      // join 후 select에서 양쪽 테이블 컬럼 모두 접근 가능 여부 검증
      const innerJoinQuery = db.table("employees").join("users", "employees.user_id", "users.id");
      const result = await innerJoinQuery.select({
        empId: "employees.id",
        userId: "users.id",
        username: "users.username",
      });

      // @ts-expect-error - INNER JOIN된 NOT NULL 컬럼은 null 체크 불가
      innerJoinQuery.where("users.username", null);

      // @ts-expect-error - INNER JOIN된 NOT NULL 컬럼은 null 비교 불가
      innerJoinQuery.where("users.email", "=", null);

      // @ts-expect-error - INNER JOIN된 NOT NULL 컬럼은 null 비교 불가
      innerJoinQuery.where("users.id", "!=", null);

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem>().toHaveProperty("empId");
      expectTypeOf<ResultItem>().toHaveProperty("userId");
      expectTypeOf<ResultItem>().toHaveProperty("username");

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result[0]?.empId).toEqual(expect.any(Number));
      expect(result[0]?.userId).toEqual(expect.any(String));
      expect(result[0]?.username).toEqual(expect.any(String));

      // join 후 selectAll() 시 양쪽 테이블 컬럼 모두 포함 여부 검증
      const selectAllResult = await db
        .table("employees")
        .join("users", "employees.user_id", "users.id")
        .selectAll();

      type SelectAllResultItem = (typeof selectAllResult)[number];

      // employees 테이블 컬럼
      expectTypeOf<SelectAllResultItem>().toHaveProperty("user_id");
      expectTypeOf<SelectAllResultItem>().toHaveProperty("department_id");
      // users 테이블 컬럼
      expectTypeOf<SelectAllResultItem>().toHaveProperty("username");
      expectTypeOf<SelectAllResultItem>().toHaveProperty("email");

      // 런타임 검증
      expect(selectAllResult.length).toBeGreaterThanOrEqual(0);
      if (selectAllResult[0]) {
        expect(selectAllResult[0].user_id).toEqual(expect.any(String));
        expect(selectAllResult[0].department_id).toEqual(expect.any(Number));
        expect(selectAllResult[0].username).toEqual(expect.any(String));
        expect(selectAllResult[0]).toHaveProperty("username");
      }
    });

    test("LEFT JOIN 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // leftJoin 후 select
      const leftJoinQuery = db
        .table("employees")
        .leftJoin("departments", "employees.department_id", "departments.id");

      const result = await leftJoinQuery.select({
        empId: "employees.id",
        deptName: "departments.name",
      });

      // leftJoin 조건 컬럼 타입 검증
      db.table("employees").leftJoin("departments", "employees.department_id", "departments.id");
      db.table("employees").leftJoin("users", "employees.user_id", "users.id");

      // @ts-expect-error - employees 테이블에 존재하지 않는 컬럼으로 조인
      db.table("employees").leftJoin("users", "employees.nonexistent", "users.id");

      // @ts-expect-error - users 테이블에 존재하지 않는 컬럼으로 조인
      db.table("employees").leftJoin("users", "employees.user_id", "users.nonexistent");

      // @ts-expect-error - 양쪽 모두 존재하지 않는 컬럼
      db.table("employees").leftJoin("users", "employees.bad_col", "users.bad_col");

      // @ts-expect-error - 조인 대상 테이블이 아닌 다른 테이블 컬럼 참조
      db.table("employees").leftJoin("users", "departments.id", "users.id");

      leftJoinQuery.where("departments.name", null);
      leftJoinQuery.where("departments.name", "=", null);
      leftJoinQuery.where("departments.name", "!=", null);

      // 타입 검증
      type ResultItem = (typeof result)[number];
      // 왼쪽 테이블 컬럼 - non-nullable
      expectTypeOf<ResultItem["empId"]>().toEqualTypeOf<number>();
      // 오른쪽 테이블 컬럼 - nullable
      expectTypeOf<ResultItem["deptName"]>().toEqualTypeOf<string | null>();

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result[0]?.empId).toEqual(expect.any(Number));
      expect(result[0]?.deptName).toEqual(expect.any(String));
    });

    test("MULTIPLE JOIN 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // multi join 후 모든 테이블 컬럼 접근 가능 여부 검증
      const joinQuery = db
        .table("employees")
        .leftJoin("departments", "employees.department_id", "departments.id")
        .leftJoin("companies", "departments.company_id", "companies.id");

      const result = await joinQuery.select({
        empId: "employees.id",
        deptName: "departments.name",
        companyName: "companies.name",
      });

      // @ts-expect-error - join 안 한 테이블 참조 불가
      joinQuery.where("users.id", 1);

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem>().toHaveProperty("empId");
      expectTypeOf<ResultItem>().toHaveProperty("deptName");
      expectTypeOf<ResultItem>().toHaveProperty("companyName");

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result[0]?.empId).toEqual(expect.any(Number));
      expect(result[0]?.deptName).toEqual(expect.any(String));
      expect(result[0]?.companyName).toEqual(expect.any(String));

      // alias 사용 시 alias로만 컬럼 접근 가능 검증 (self join)
      const selfJoinQuery = db
        .table({ child: "departments" })
        .leftJoin({ parent: "departments" }, "child.parent_id", "parent.id");

      const selfJoinResult = await selfJoinQuery.select({
        childId: "child.id",
        childName: "child.name",
        parentId: "parent.id",
        parentName: "parent.name",
      });

      // @ts-expect-error - 원본 테이블명(departments)으로는 접근 불가
      selfJoinQuery.select({ id: "departments.id" });

      // @ts-expect-error - alias 없이 접근 불가
      selfJoinQuery.where("id", 1);

      // 타입 검증
      type SelfJoinResultItem = (typeof selfJoinResult)[number];
      expectTypeOf<SelfJoinResultItem>().toHaveProperty("childId");
      expectTypeOf<SelfJoinResultItem>().toHaveProperty("childName");
      expectTypeOf<SelfJoinResultItem>().toHaveProperty("parentId");
      expectTypeOf<SelfJoinResultItem>().toHaveProperty("parentName");

      // 런타임 검증
      expect(selfJoinResult.length).toBeGreaterThanOrEqual(0);
      // child 테이블 컬럼 (항상 값 있음)
      expect(selfJoinResult[0]?.childId).toEqual(expect.any(Number));
      expect(selfJoinResult[0]?.childName).toEqual(expect.any(String));
      // parent 테이블 컬럼 (LEFT JOIN이므로 null 가능)
      expect([null, expect.any(Number)]).toContainEqual(selfJoinResult[0]?.parentId);
    });

    test("SUBQUERY JOIN 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 서브쿼리: employees에서 department_id만 select
      const subquery = db
        .table("employees")
        .select({ department_id: "employees.department_id" })
        .groupBy("employees.department_id");

      // subquery join
      const subqueryJoinQuery = db
        .table("departments")
        .leftJoin({ emp_stats: subquery }, "departments.id", "emp_stats.department_id");

      const result = await subqueryJoinQuery.select({
        deptId: "departments.id",
        deptName: "departments.name",
        statsDeptId: "emp_stats.department_id",
      });

      // @ts-expect-error - 서브쿼리에서 select하지 않은 컬럼은 접근 불가
      subqueryJoinQuery.select({ salary: "emp_stats.salary" });

      // @ts-expect-error - 서브쿼리 원본 테이블(employees)로 직접 접근 불가
      subqueryJoinQuery.select({ empId: "employees.id" });

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem>().toHaveProperty("deptId");
      expectTypeOf<ResultItem>().toHaveProperty("deptName");
      expectTypeOf<ResultItem>().toHaveProperty("statsDeptId");

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result[0]?.deptId).toEqual(expect.any(Number));
      expect(result[0]?.deptName).toEqual(expect.any(String));
    });
  });

  describe("C. 결과 조회 메서드(SELECT, FIRST, PLUCK) 타입 안전성", () => {
    test("SELECT 타입 안전성", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({
        id: "id",
        username: "username",
        role: "role",
      });

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").select({ bad: "nonexistent" });

      // @ts-expect-error - 존재하지 않는 테이블 prefix
      db.table("users").select({ id: "invalid_table.id" });

      // @ts-expect-error - 컬럼명 오타
      db.table("users").select({ id: "idd" });

      // 타입 검증
      expectTypeOf(result).toBeArray();
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem>().toHaveProperty("id");
      expectTypeOf<ResultItem>().toHaveProperty("username");
      expectTypeOf<ResultItem>().toHaveProperty("role");

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result[0]?.id).toEqual(expect.any(String));
      expect(result[0]?.username).toEqual(expect.any(String));
      expect(result[0]?.role).toEqual(expect.any(String));
    });

    test("FIRST 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // first()는 배열이 아닌 단일 객체를 반환
      const result = await db.table("users").select({ id: "id" }).first();

      // 타입 검증: 배열이 아닌 단일 객체
      expectTypeOf(result).toEqualTypeOf<{ id: string }>();

      // 런타임 검증
      expect(result.id).toEqual(expect.any(String));

      // 여러 컬럼 select 후 first()
      const multiResult = await db
        .table("users")
        .select({
          id: "id",
          username: "username",
          role: "role",
        })
        .first();

      // 타입 검증: 각 필드 타입이 정확히 추론되는지
      expectTypeOf<typeof multiResult>().toEqualTypeOf<{
        id: string;
        username: string;
        role: "admin" | "normal";
      }>();

      // 런타임 검증
      expect(multiResult.id).toEqual(expect.any(String));
      expect(multiResult.username).toEqual(expect.any(String));
      expect(multiResult.role).toEqual(expect.any(String));
    });

    test("PLUCK 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // pluck - 단일 컬럼 값의 배열을 반환
      const idResult = await db.table("users").pluck("id");
      expectTypeOf(idResult).toEqualTypeOf<string[]>();

      // string 컬럼 pluck
      const usernameResult = await db.table("users").pluck("username");
      expectTypeOf(usernameResult).toEqualTypeOf<string[]>();

      // enum 컬럼 pluck
      const roleResult = await db.table("users").pluck("role");
      expectTypeOf(roleResult).toEqualTypeOf<("admin" | "normal")[]>();

      // nullable 컬럼 pluck
      const birthDateResult = await db.table("users").pluck("birth_date");
      expectTypeOf(birthDateResult).toEqualTypeOf<(Date | null)[]>();

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").pluck("nonexistent");

      // @ts-expect-error - 컬럼명 오타
      db.table("users").pluck("usernme");

      // 런타임 검증
      expect(Array.isArray(idResult)).toBe(true);
      expect(Array.isArray(usernameResult)).toBe(true);
      idResult[0] && expect(idResult[0]).toEqual(expect.any(String));
      usernameResult[0] && expect(usernameResult[0]).toEqual(expect.any(String));
    });
  });

  describe("D. WHERE 확장 타입 안전성", () => {
    test("whereIn / whereNotIn 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 whereIn 사용
      db.table("companies").whereIn("id", [1, 2, 3]);
      db.table("users").whereIn("role", ["admin", "normal"]);
      db.table("projects").whereIn("status", ["planning", "in_progress", "completed"]);

      // 유효한 whereNotIn 사용
      db.table("companies").whereNotIn("id", [1, 2]);
      db.table("users").whereNotIn("role", ["admin"]);

      // @ts-expect-error - number 컬럼에 string 포함한 배열
      db.table("companies").whereIn("id", [1, "2", "3"]);

      // @ts-expect-error - string 컬럼에 number 포함한 배열
      db.table("users").whereIn("username", [1, "2", "3"]);

      // @ts-expect-error - enum 컬럼에 잘못된 값 배열
      db.table("users").whereIn("role", ["admin", "invalid_role"]);

      // @ts-expect-error - whereNotIn에서도 동일한 타입 검증
      db.table("companies").whereNotIn("id", ["wrong", "type"]);

      // @ts-expect-error - enum 컬럼 whereNotIn에 잘못된 값
      db.table("projects").whereNotIn("status", ["planning", "wrong_status"]);
    });

    test("whereGroup / orWhereGroup 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 whereGroup / orWhereGroup 사용
      db.table("users")
        .whereGroup((g) => g.where("id", "1"))
        .orWhereGroup((g) => g.where("role", "admin"));

      db.table("users").whereGroup((g) => g.where("id", "1").where("role", "normal"));

      // 중첩 whereGroup 사용
      db.table("users").whereGroup((g) =>
        g
          .where("role", "admin")
          .whereGroup((nested) => nested.where("is_verified", true).orWhere("id", "1")),
      );

      // orWhere 체이닝
      db.table("companies").whereGroup((g) => g.where("id", 1).orWhere("id", 2).orWhere("id", 3));

      // @ts-expect-error - whereGroup 내부에서 존재하지 않는 컬럼
      db.table("users").whereGroup((g) => g.where("nonexistent", 1));

      // @ts-expect-error - whereGroup 내부에서 타입 불일치
      db.table("companies").whereGroup((g) => g.where("id", "문자열"));

      // @ts-expect-error - whereGroup 내부에서 enum 잘못된 값
      db.table("users").whereGroup((g) => g.where("role", "invalid_role"));

      // @ts-expect-error - orWhereGroup 내부에서 존재하지 않는 컬럼
      db.table("users").orWhereGroup((g) => g.where("bad_column", 1));

      // @ts-expect-error - orWhereGroup 내부에서 타입 불일치
      db.table("users").orWhereGroup((g) => g.where("username", 123));

      // @ts-expect-error - 중첩 whereGroup에서 타입 검증
      db.table("companies").whereGroup((g) => g.whereGroup((nested) => nested.where("id", "1")));

      // @ts-expect-error - 중첩 orWhereGroup에서도 존재하지 않는 컬럼
      db.table("users").whereGroup((g) => g.orWhereGroup((nested) => nested.where("bad_col", 1)));

      // JOIN 후 whereGroup에서 테이블 prefix 필요
      const joinQuery = db.table("employees").join("users", "employees.user_id", "users.id");

      joinQuery.whereGroup((g) => g.where("employees.id", 1).where("users.id", "1"));
      joinQuery.orWhereGroup((g) =>
        g.where("employees.salary", ">", "50000").orWhere("users.role", "admin"),
      );

      // @ts-expect-error - JOIN 후 prefix 없이 사용 불가
      joinQuery.whereGroup((g) => g.where("id", 1));

      // @ts-expect-error - JOIN 안 한 테이블 참조 불가
      joinQuery.whereGroup((g) => g.where("departments.id", 1));
    });

    test("JSONB containment type safety", async () => {
      const db = UserModel.getPuri("r");

      type AuditEventJsonColumns = JsonColumns<{
        events: AuditEventBaseSchema;
      }>;
      type ImageContainmentValue = JsonSupersetValue<ProjectBaseSchema["image_urls"]>;

      expectTypeOf<AuditEventJsonColumns>().toEqualTypeOf<"events.payload_json" | "payload_json">();
      const partialImage: ImageContainmentValue = [{ url: "https://example.com/image.png" }];
      expectTypeOf(partialImage).toExtend<ImageContainmentValue>();

      db.table("audit_events").whereJsonSupersetOf("payload_json", {
        source: "better-auth",
        nested: { enabled: true },
      });
      db.table("sync_fixtures").whereJsonSupersetOf("sync_fixtures.tags", ["jsonb"]);
      db.table("projects").whereJsonSupersetOf("image_urls", [
        {
          mime_type: "image/png",
        },
      ]);

      const aliasedQuery = db.table({ event: "audit_events" });
      aliasedQuery.whereJsonSupersetOf("event.payload_json", { category: "auth" });

      const joinedQuery = db
        .table({ event: "audit_events" })
        .join({ user: "users" }, "event.actor_user_id", "user.id");

      joinedQuery.whereJsonSupersetOf("event.payload_json", { actor: { id: "user-1" } });
      joinedQuery.whereGroup((group) =>
        group
          .whereJsonSupersetOf("event.payload_json", { action: "login" })
          .orWhereJsonSupersetOf("event.payload_json", { action: "logout" }),
      );

      const unknownValue = z.unknown().parse({ source: "better-auth" });

      const assertRejectedCalls = () => {
        // Compile-only rejection cases must not mutate or execute the runtime query.
        // @ts-expect-error an alias replaces the original table name.
        aliasedQuery.whereJsonSupersetOf("audit_events.payload_json", { category: "auth" });
        // @ts-expect-error joined queries require the JSON column alias prefix.
        joinedQuery.whereJsonSupersetOf("payload_json", { action: "login" });
        // @ts-expect-error a JSON column from a table that was not joined is unavailable.
        joinedQuery.whereJsonSupersetOf("sync_fixtures.tags", ["jsonb"]);
        // @ts-expect-error ordinary string columns are not JSON columns.
        db.table("audit_events").whereJsonSupersetOf("event_type", "user_created");
        // @ts-expect-error date columns are not JSON columns.
        db.table("audit_events").whereJsonSupersetOf("occurred_at", {});
        // @ts-expect-error vector columns are not JSON columns.
        db.table("documents").whereJsonSupersetOf("title_content_embedding", [0.1]);
        // @ts-expect-error JSON array element types are preserved.
        db.table("sync_fixtures").whereJsonSupersetOf("tags", [1]);
        // @ts-expect-error recursive partial object values preserve nested property types.
        db.table("projects").whereJsonSupersetOf("image_urls", [{ size: "large" }]);
        // @ts-expect-error nullable JSON columns still reject top-level null containment values.
        db.table("sync_fixtures").whereJsonSupersetOf("tags", null);
        // @ts-expect-error undefined cannot be serialized as JSONB.
        db.table("audit_events").whereJsonSupersetOf("payload_json", undefined);
        // @ts-expect-error unknown values must be narrowed before use.
        db.table("audit_events").whereJsonSupersetOf("payload_json", unknownValue);
        // @ts-expect-error top-level OR containment is intentionally unavailable.
        db.table("audit_events").orWhereJsonSupersetOf("payload_json", {
          source: "better-auth",
        });
      };

      expectTypeOf(assertRejectedCalls).toBeFunction();
    });

    test("LIKE 연산자 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 LIKE 사용
      db.table("users").where("username", "like", "%test%");
      db.table("users").where("email", "like", "%@gmail.com");
      db.table("users").where("bio", "like", "%소개%");

      // 유효한 NOT LIKE 사용
      db.table("users").where("username", "not like", "%admin%");
      db.table("users").where("email", "not like", "%spam%");

      // @ts-expect-error - LIKE 연산자 오타
      db.table("users").where("username", "lik", "%test%");

      // @ts-expect-error - LIKE 대문자 (소문자만 허용)
      db.table("users").where("username", "LIKE", "%test%");

      // @ts-expect-error - 존재하지 않는 컬럼에 like 사용
      db.table("users").where("nonexistent", "like", "%test%");

      // @ts-expect-error - 존재하지 않는 컬럼에 not like 사용
      db.table("users").where("bad_column", "not like", "%test%");

      // @ts-expect-error - number type 컬럼에 like 사용 시 string 패턴 불가
      db.table("companies").where("id", "like", "%1%");

      // @ts-expect-error - number type 컬럼에 not like 사용 시 string 패턴 불가
      db.table("employees").where("id", "not like", "%1%");

      // JOIN 후 LIKE 사용
      const joinQuery = db.table("employees").join("users", "employees.user_id", "users.id");

      joinQuery.where("users.username", "like", "%test%");
      joinQuery.where("users.email", "not like", "%spam%");

      // @ts-expect-error - JOIN 후 prefix 없이 like 사용 불가
      joinQuery.where("username", "like", "%test%");

      // @ts-expect-error - JOIN 안 한 테이블에 like 사용 불가
      joinQuery.where("departments.name", "like", "%dev%");

      // whereGroup 내부 where / orWhere에 LIKE / NOT LIKE 사용
      db.table("users").whereGroup((g) =>
        g.where("username", "like", "%admin%").orWhere("email", "like", "%@company.com"),
      );

      // Multiple join 후 LIKE 사용
      const multiJoinQuery = db
        .table("employees")
        .join("users", "employees.user_id", "users.id")
        .leftJoin("departments", "employees.department_id", "departments.id");

      multiJoinQuery.where("users.username", "like", "%manager%");
      multiJoinQuery.where("departments.name", "like", "%Engineering%");
    });
  });

  describe("E. 집계함수(Aggregate) 타입 안전성", () => {
    test("Puri.count() 타입 안전성", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({
        total: Puri.count(),
      });

      // 타입 검증
      type CountResultItem = (typeof result)[number];
      expectTypeOf<CountResultItem["total"]>().toEqualTypeOf<number>();

      // 런타임 검증
      expect(result[0]).toBeDefined();
      expect(result[0]?.total).toEqual(expect.any(Number));
    });

    test("Puri.max() / Puri.min() 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 숫자 컬럼에 max/min 사용
      const numResult = await db.table("employees").select({
        maxSalary: Puri.max("employees.salary"),
        minSalary: Puri.min("employees.salary"),
      });

      // 타입 검증: 숫자 컬럼의 max/min은 number 반환
      type NumResultItem = (typeof numResult)[number];
      expectTypeOf<NumResultItem["maxSalary"]>().toEqualTypeOf<number>();
      expectTypeOf<NumResultItem["minSalary"]>().toEqualTypeOf<number>();

      // 날짜 컬럼에 max/min 사용
      const dateResult = await db.table("users").select({
        latestLogin: Puri.max("users.last_login_at"),
        earliestLogin: Puri.min("users.last_login_at"),
      });

      // 타입 검증: 날짜 컬럼의 max/min 반환 타입
      type DateResultItem = (typeof dateResult)[number];
      expectTypeOf<DateResultItem["latestLogin"]>().toEqualTypeOf<number>();
      expectTypeOf<DateResultItem["earliestLogin"]>().toEqualTypeOf<number>();

      // 런타임 검증
      expect(numResult.length).toBeGreaterThanOrEqual(0);
      const maxSalary = numResult[0]?.maxSalary;
      const minSalary = numResult[0]?.minSalary;
      expect(maxSalary).toBe("95000.00");
      expect(minSalary).toBe("55000.00");
    });

    test("GROUP BY 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 단일 컬럼 groupBy
      db.table("employees")
        .select({
          department_id: "employees.department_id",
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id");

      // 유효한 다중 컬럼 groupBy
      db.table("projects")
        .select({
          status: "projects.status",
          count: Puri.count("projects.id"),
        })
        .groupBy("projects.status", "projects.created_at");

      // @ts-expect-error - 존재하지 않는 컬럼으로 groupBy
      db.table("employees").groupBy("employees.nonexistent");

      // @ts-expect-error - 다중 컬럼 중 하나가 존재하지 않는 경우
      db.table("projects").groupBy("status", "bad_column");

      // JOIN 후 groupBy
      const joinQuery = db
        .table("employees")
        .join("departments", "employees.department_id", "departments.id");

      joinQuery.groupBy("employees.department_id", "departments.name");

      joinQuery.groupBy("department_id");

      // @ts-expect-error - JOIN 안 한 테이블 컬럼으로 groupBy
      joinQuery.groupBy("users.id");

      const groupByResult = await db
        .table("employees")
        .select({
          department_id: "employees.department_id",
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id");

      // 타입 검증
      type GroupByResultItem = (typeof groupByResult)[number];
      expectTypeOf<GroupByResultItem["department_id"]>().toEqualTypeOf<number | null>();
      expectTypeOf<GroupByResultItem["count"]>().toEqualTypeOf<number>();

      // 런타임 검증
      expect(Array.isArray(groupByResult)).toBe(true);
      groupByResult[0] && expect(groupByResult[0].count).toEqual(expect.any(Number));
    });

    test("HAVING 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 공통 쿼리
      const query = db
        .table("employees")
        .select({
          department_id: "employees.department_id",
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id");

      // raw string 형태로 HAVING 사용
      query.having("COUNT(*) > 5");

      // 테이블 컬럼으로 HAVING 사용
      query.having("employees.department_id", ">", 3);

      // @ts-expect-error - SELECT에 없는 alias로 HAVING
      query.having("nonexistent_alias", ">", 5);

      // @ts-expect-error - 존재하지 않는 테이블 컬럼으로 HAVING
      query.having("employees.bad_column", ">", 5);

      const havingResult = await db
        .table("employees")
        .select({
          department_id: "employees.department_id",
          count: Puri.count("employees.id"),
        })
        .groupBy("employees.department_id")
        .having("COUNT(employees.id) > 5");

      // 타입 검증
      type HavingResultItem = (typeof havingResult)[number];
      expectTypeOf<HavingResultItem["department_id"]>().toEqualTypeOf<number | null>();
      expectTypeOf<HavingResultItem["count"]>().toEqualTypeOf<number>();

      // 런타임 검증
      expect(Array.isArray(havingResult)).toBe(true);
      havingResult[0] && expect(havingResult[0].count).toEqual(expect.any(Number));
      havingResult[0] && expect(havingResult[0].count).toBeGreaterThan(0);
    });
  });

  describe("F. 정렬 및 페이지네이션 타입 안전성", () => {
    test("ORDER BY 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 단일 orderBy
      db.table("users").orderBy("id", "asc");
      db.table("users").orderBy("username", "desc");
      db.table("users").orderBy("birth_date", "asc", "last");

      // 유효한 다중 orderBy 체이닝
      db.table("users").orderBy("role", "asc").orderBy("created_at", "desc");

      // SELECT alias로 orderBy
      db.table("users")
        .select({
          id: "id",
          name: "username",
        })
        .orderBy("name", "asc");

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").orderBy("nonexistent", "asc");

      // @ts-expect-error - asc/desc가 아닌 값
      expect(() => db.table("users").orderBy("id", "ascending")).toThrow(
        "Invalid order direction: ascending",
      );

      // @ts-expect-error - asc/desc가 아닌 값
      expect(() => db.table("users").orderBy("id", "DESC")).toThrow(
        "Invalid order direction: DESC",
      );

      // @ts-expect-error - nulls는 first/last만 허용
      expect(() => db.table("users").orderBy("birth_date", "asc", "middle")).toThrow(
        "Invalid order nulls: middle",
      );

      // JOIN 후 orderBy
      const joinQuery = db.table("employees").join("users", "employees.user_id", "users.id");

      joinQuery.orderBy("employees.id", "asc");
      joinQuery.orderBy("users.username", "desc");

      joinQuery.orderBy("id", "asc");

      // @ts-expect-error - JOIN 안 한 테이블 컬럼
      joinQuery.orderBy("departments.id", "asc");
    });

    test("LIMIT / OFFSET 타입 안전성", async () => {
      // console.log를 차단하기 위해 spyOn
      vi.spyOn(console, "log").mockImplementation((message: string) => {
        Naite.t("console:log", message);
      });

      const db = UserModel.getPuri("r");

      // 유효한 limit / offset 사용
      db.table("users").limit(10);
      db.table("users").offset(20);
      db.table("users").limit(10).offset(0);

      // 체이닝과 함께 사용
      db.table("users").select({ id: "id" }).orderBy("id", "asc").limit(5).offset(10);

      // @ts-expect-error - limit에 string 전달
      db.table("users").limit("10");

      // @ts-expect-error - offset에 string 전달
      db.table("users").offset("20");

      // limit/offset에 음수 전달 시 런타임 에러 발생
      // db.table("users").limit(-1);
      // db.table("users").offset(-1);

      // @ts-expect-error - limit에 undefined
      db.table("users").limit(undefined);
      expect(Naite.get("console:log").first()).toContain(
        "A valid integer must be provided to limit",
      ); // knex에서 컬러값을 사용하므로 toContain 사용

      // @ts-expect-error - offset에 null
      db.table("users").offset(null);
    });
  });

  describe("G. INSERT/UPDATE/DELETE 타입 안전성", () => {
    afterEach(async () => {
      // 테스트에서 생성한 users 레코드 cleanup (fixture max ID 이후)
      await cleanupTestRecords(fixtureMaxIds);
    });

    test("INSERT 타입 안전성 (WITHOUT RETURNING)", async () => {
      const db = UserModel.getPuri("w");

      const defaultUserData = {
        id: randomUUID(),
        email: "test@test.com",
        username: "testuser",
        password: "password123",
        role: "normal" as const,
        is_verified: false,
      };

      const result = await db.table("users").insert(defaultUserData);

      // 타입 검증
      expectTypeOf(result).toEqualTypeOf<InsertResult>();
    });

    test("INSERT 타입 안전성 (WITH RETURNING)", async () => {
      const db = UserModel.getPuri("w");

      const defaultUserData = {
        email: "test@test.com",
        username: "testuser",
        password: "password123",
        role: "normal" as const,
      };

      // 유효한 INSERT - default 컬럼
      db.table("users").insert(defaultUserData);

      // 유효한 INSERT - default + optional 컬럼
      db.table("users").insert({
        ...defaultUserData,
        role: "admin",
        birth_date: new Date("1990-01-01"),
        bio: "테스트 유저입니다.",
        id: randomUUID(),
      });

      // nullable 컬럼
      db.table("users").insert({ ...defaultUserData, id: randomUUID(), birth_date: null });

      // @ts-expect-error - 필수 컬럼 누락 시 에러
      db.table("users").insert({ ...defaultUserData, id: randomUUID(), email: undefined });

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").insert({
        ...defaultUserData,
        id: randomUUID(),
        nonexistent_column: "value",
      });

      // @ts-expect-error - 타입 불일치 (email에 number)
      db.table("users").insert({ ...defaultUserData, id: randomUUID(), email: 123 });

      // @ts-expect-error - enum 잘못된 값
      db.table("users").insert({ ...defaultUserData, id: randomUUID(), role: "invalid_role" });

      const insertedIds = await db
        .table("users")
        .insert({
          id: randomUUID(),
          email: `insert-test-${Date.now()}@test.com`,
          username: `inserttestuser${Date.now()}`,
          password: "password123",
          role: "normal" as const,
          is_verified: false,
        })
        .returning("id");

      // 타입 검증
      expectTypeOf(insertedIds).toEqualTypeOf<{ id: string }[]>();
      expectTypeOf(insertedIds[0]?.id).toEqualTypeOf<string | undefined>();

      // 런타임 검증
      expect(Array.isArray(insertedIds)).toBe(true);
      expect(insertedIds.length).toBe(1);
      expect(insertedIds[0]?.id).toEqual(expect.any(String));
    });

    test("UPDATE 타입 안전성 (WITHOUT RETURNING)", async () => {
      const db = UserModel.getPuri("w");

      const insertedId = await db
        .table("users")
        .insert({
          id: randomUUID(),
          email: `update-test-${Date.now()}@test.com`,
          username: `updatetestuser${Date.now()}`,
          password: "password123",
          role: "normal" as const,
          is_verified: false,
        })
        .returning("id");

      // enum 값 업데이트
      db.table("users").where("id", "1").update({ role: "admin" });

      // nullable 컬럼에 null 업데이트
      db.table("users").where("id", "1").update({ birth_date: null });

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").where("id", 1).update({ nonexistent_column: "value" });

      // @ts-expect-error - 타입 불일치 (email에 number)
      db.table("users").where("id", 1).update({ email: 123 });

      // @ts-expect-error - enum 잘못된 값
      db.table("users").where("id", 1).update({ role: "invalid_role" });

      // @ts-expect-error - NOT NULL 컬럼에 null 불가
      db.table("users").where("id", 1).update({ email: null });

      const updateCount = await db
        .table("users")
        .where("id", insertedId[0]?.id ?? "1")
        .update({ username: "updateduser", bio: "Updated bio" });

      // 타입 검증: affected rows 수 반환
      expectTypeOf(updateCount).toEqualTypeOf<number>();

      // 런타임 검증
      expect(updateCount).toEqual(expect.any(Number));
      expect(updateCount).toBeGreaterThanOrEqual(0);
    });

    test("UPDATE 타입 안전성 (WITH RETURNING)", async () => {
      const db = UserModel.getPuri("w");

      const insertedId = await db
        .table("users")
        .insert({
          id: randomUUID(),
          email: `update-test-${Date.now()}@test.com`,
          username: `updatetestuser${Date.now()}`,
          password: "password123",
          role: "normal" as const,
          is_verified: false,
        })
        .returning("id");

      const updateResult = await db
        .table("users")
        .where("id", insertedId[0]?.id ?? "1")
        .update({ username: "updateduser", bio: "Updated bio" })
        .returning(["username", "bio"]);

      // 타입 검증
      expectTypeOf(updateResult).toEqualTypeOf<{ username: string; bio: string | null }[]>();
      expectTypeOf(updateResult[0]?.username).toEqualTypeOf<string | undefined>();
      expectTypeOf(updateResult[0]?.bio).toEqualTypeOf<string | null | undefined>();

      // 런타임 검증
      expect(Array.isArray(updateResult)).toBe(true);
      expect(updateResult.length).toBeGreaterThanOrEqual(1);
      expect(updateResult[0]?.username).toBe("updateduser");
      expect(updateResult[0]?.bio).toBe("Updated bio");
    });

    test("DELETE 타입 안전성 (WITHOUT RETURNING)", async () => {
      const db = UserModel.getPuri("w");
      const deleteCount = await db.table("users").where({ id: "1" }).delete();

      // 타입 검증: affected rows 수 반환
      expectTypeOf(deleteCount).toEqualTypeOf<number>();
    });

    test("DELETE 타입 안전성 (WITH RETURNING)", async () => {
      const db = UserModel.getPuri("w");
      const result = await db.table("users").where({ id: "1" }).delete().returning("id");

      // 타입 검증: RETURNING 절에 사용된 컬럼 배열 반환
      expectTypeOf(result).toEqualTypeOf<{ id: string }[]>();
      expectTypeOf(result[0]?.id).toEqualTypeOf<string | undefined>();
    });

    test("INCREMENT / DECREMENT 타입 안전성", async () => {
      const db = UserModel.getPuri("w");

      // fixture에 존재하는 데이터 사용
      const userId = "1";
      const employeeId = 1;

      // 유효한 increment / decrement 사용
      db.table("employees").where("id", employeeId).increment("id", 1);
      db.table("employees").where("id", employeeId).decrement("id", 1);

      // @ts-expect-error - 존재하지 않는 컬럼 increment
      db.table("users").where("id", userId).increment("nonexistent", 1);
      // @ts-expect-error - 존재하지 않는 컬럼 decrement
      db.table("users").where("id", userId).decrement("bad_column", 1);

      // @ts-expect-error - 증감값에 string 전달 (increment)
      db.table("users").where("id", userId).increment("id", "1");
      // @ts-expect-error - 증감값에 string 전달 (decrement)
      db.table("users").where("id", userId).decrement("id", "5");

      // @ts-expect-error - 증감값에 undefined 전달
      db.table("users").where("id", userId).increment("id", undefined);

      // 숫자 타입 컬럼만 허용 함
      db.table("employees").where("id", employeeId).increment("department_id", 1);
      db.table("employees").where("id", employeeId).decrement("department_id", 1);

      // JOIN 후 increment / decrement
      const joinQuery = db.table("employees").join("users", "employees.user_id", "users.id");

      joinQuery.where("employees.id", employeeId).increment("employees.department_id", 1);
      joinQuery.where("users.id", userId).decrement("employees.department_id", 1);

      // @ts-expect-error - JOIN 후 prefix 없이 사용 불가
      joinQuery.where("employees.id", employeeId).increment("department_id", 1);

      // @ts-expect-error - JOIN 안 한 테이블 컬럼
      joinQuery.where("employees.id", employeeId).increment("departments.id", 1);

      // salary 컬럼으로 실제 increment/decrement 실행
      const incrementResult = await db
        .table("employees")
        .where("id", employeeId)
        .increment("department_id", 1);
      const decrementResult = await db
        .table("employees")
        .where("id", employeeId)
        .decrement("department_id", 1);

      // 타입 검증
      expectTypeOf(incrementResult).toEqualTypeOf<number>();
      expectTypeOf(decrementResult).toEqualTypeOf<number>();

      // 런타임 검증
      expect(incrementResult).toEqual(expect.any(Number));
      expect(decrementResult).toEqual(expect.any(Number));
    });
  });

  describe("I. NULL", () => {
    test("NULLABLE 타입 안전성", async () => {
      const db = UserModel.getPuri("r");

      // select 결과에서 NULLABLE 타입 추론
      const result = await db.table("users").select({
        birthDate: "birth_date",
      });

      // NULLABLE 컬럼에서 null 값 허용
      db.table("users").where("birth_date", null);
      db.table("employees").where("department_id", null);

      // @ts-expect-error - NOT NULL 컬럼에 null 불가
      db.table("users").where("id", null);

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem["birthDate"]>().toEqualTypeOf<Date | null>();

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      const birthDate = result[0]?.birthDate;
      expect(birthDate === null || birthDate instanceof Date).toBe(true);
    });
  });
});
