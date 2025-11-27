import { Puri } from "sonamu";
import { describe, expect, expectTypeOf, vi } from "vitest";
import { UserModel } from "../application/user/user.model";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);
describe("Puri Type Safety", () => {
  describe("A. 존재하지 않는 컬럼/테이블", () => {
    test("유효하지 않은 컬럼은 타입 에러가 발생해야 함", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 컬럼
      db.table("users").select({ id: "id" });
      db.table("users").where("id", 1);
      db.table("users").where("role", "admin");

      // @ts-expect-error - 존재하지 않는 컬럼
      db.table("users").select({ bad: "nonexistent" });

      // @ts-expect-error - 오타
      db.table("users").where("emal", "test@test.com");

      // @ts-expect-error - 존재하지 않는 테이블 prefix
      db.table("users").select({ id: "invalid_table.id" });
    });

    test("from - 존재하지 않는 테이블은 타입 에러가 발생해야 함", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 테이블
      db.table("users");
      db.table("employees");

      // @ts-expect-error - 존재하지 않는 테이블
      db.table("nonexistent_table");
    });
  });

  describe("B. 타입 불일치", () => {
    test("number 컬럼에 string 값 where", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 타입
      db.table("users").where("id", 1);

      // @ts-expect-error - id는 number인데 string 전달
      db.table("users").where("id", "문자열");
    });

    test("string 컬럼에 number 값 where", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 타입
      db.table("users").where("username", "홍길동");

      // @ts-expect-error - username은 string인데 number 전달
      db.table("users").where("username", 123);
    });

    test("enum에 잘못된 값", async () => {
      const db = UserModel.getPuri("r");

      // 유효한 enum 값
      db.table("users").where("role", "admin");
      db.table("users").where("role", "normal");

      // @ts-expect-error - role은 "admin" | "normal"인데 잘못된 값
      db.table("users").where("role", "invalid_role");
    });
  });

  describe("C. JOIN 후 컬럼 경로 오류", () => {
    test("join 후에는 테이블 prefix 필요", async () => {
      const db = UserModel.getPuri("r");

      // join 전: prefix 없이 사용 가능
      db.table("users").where("id", 1);

      // join 후: prefix 필요
      const joined = db.table("employees").join("users", "employees.user_id", "users.id");
      joined.where("employees.id", 1);
      joined.where("users.id", 1);

      // @ts-expect-error - join 후에는 prefix 없이 사용 불가
      joined.where("id", 1);
    });

    test("join 안한 테이블 컬럼 참조", async () => {
      const db = UserModel.getPuri("r");

      // @ts-expect-error - departments는 join 안 했으므로 참조 불가
      db.table("users").where("departments.id", 1);
    });
  });

  describe("D. NULL 처리", () => {
    test("nullable 컬럼 타입 검증", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({
        birthDate: "birth_date",
      });

      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem["birthDate"]>().toEqualTypeOf<string | null>();
    });

    test("nullable 컬럼에 null 값으로 where 가능", async () => {
      const db = UserModel.getPuri("r");

      // nullable 컬럼에서 null 값 허용
      db.table("users").where("birth_date", null);
      db.table("employees").where("department_id", null);

      // @ts-expect-error - NOT NULL 컬럼에 null 불가
      db.table("users").where("id", null);
    });
  });

  describe("E. 타입 추론 검증", () => {
    test("select 후 TResult 타입 정확도", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({
        id: "id",
        username: "username",
        role: "role",
      });

      // 타입 검증
      expectTypeOf(result).toBeArray();

      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem>().toHaveProperty("id");
      expectTypeOf<ResultItem>().toHaveProperty("username");
      expectTypeOf<ResultItem>().toHaveProperty("role");

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result[0]) {
        expect(typeof result[0].id).toBe("number");
        expect(typeof result[0].username).toBe("string");
        expect(typeof result[0].role).toBe("string");
      }
    });

    test("SQL 함수 반환 타입 (count → number)", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({
        total: Puri.count(),
      });

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem["total"]>().toEqualTypeOf<number>();

      // 런타임 검증
      expect(result[0]).toBeDefined();
      expect(typeof result[0]?.total).toBe("number");
    });

    test("join 후 TTables 타입 확장", async () => {
      const db = UserModel.getPuri("r");
      const result = await db
        .table("employees")
        .join("users", "employees.user_id", "users.id")
        .select({
          empId: "employees.id",
          userId: "users.id",
          username: "users.username",
        });

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem>().toHaveProperty("empId");
      expectTypeOf<ResultItem>().toHaveProperty("userId");
      expectTypeOf<ResultItem>().toHaveProperty("username");

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result[0]) {
        expect(typeof result[0].empId).toBe("number");
        expect(typeof result[0].userId).toBe("number");
        expect(typeof result[0].username).toBe("string");
      }
    });

    test("alias 컬럼 타입 추론", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({
        myId: "id",
        myName: "username",
      });

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem["myId"]>().toEqualTypeOf<number>();
      expectTypeOf<ResultItem["myName"]>().toEqualTypeOf<string>();

      // 런타임 검증
      if (result[0]) {
        expect(typeof result[0].myId).toBe("number");
        expect(typeof result[0].myName).toBe("string");
      }
    });

    test("pluck 반환 타입 (배열)", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").pluck("id");

      // 타입 검증
      expectTypeOf(result).toEqualTypeOf<number[]>();

      // 런타임 검증
      expect(Array.isArray(result)).toBe(true);
      if (result[0]) {
        expect(typeof result[0]).toBe("number");
      }
    });
    test("first 반환 타입 (단일 객체)", async () => {
      const db = UserModel.getPuri("r");
      const result = await db.table("users").select({ id: "id" }).first();

      // 타입 검증
      expectTypeOf(result).toEqualTypeOf<{ id: number }>();

      // 런타임 검증
      expect(typeof result.id).toBe("number");
    });
  });

  describe("F. ETC", () => {
    test("LEFT JOIN 후 오른쪽 테이블 컬럼 타입", async () => {
      const db = UserModel.getPuri("r");
      const result = await db
        .table("employees")
        .leftJoin("departments", "employees.department_id", "departments.id")
        .select({
          empId: "employees.id",
          deptName: "departments.name",
        });

      // 타입 검증
      type ResultItem = (typeof result)[number];
      expectTypeOf<ResultItem["empId"]>().toEqualTypeOf<number>();
      // NOTE: 현재 Puri는 LEFT JOIN에서도 nullable 처리 안 함
      // 이상적으로는 string | null 이어야 하지만, 현재는 string
      expectTypeOf<ResultItem["deptName"]>().toEqualTypeOf<string>();

      // 런타임 검증
      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result[0]) {
        expect(typeof result[0].empId).toBe("number");
        expect(result[0].deptName === null || typeof result[0].deptName === "string").toBe(true);
      }
    });
  });
});
