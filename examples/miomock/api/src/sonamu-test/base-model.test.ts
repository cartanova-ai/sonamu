import { BaseModelClass } from "sonamu";
import { describe, expect, test } from "vitest";

describe("BaseModel", () => {
  const baseModel = new BaseModelClass();

  describe("omitInternalFields", () => {
    test("단일 필드 제거", () => {
      const row = { id: 1, name: "test", secret: "hidden" };
      const result = baseModel.omitInternalFields(row, ["secret"]);

      expect(result).toEqual({ id: 1, name: "test" });
      // 원본은 변경되지 않음
      expect(row).toEqual({ id: 1, name: "test", secret: "hidden" });
    });

    test("여러 필드 제거", () => {
      const row = { id: 1, name: "test", secret1: "a", secret2: "b" };
      const result = baseModel.omitInternalFields(row, ["secret1", "secret2"]);

      expect(result).toEqual({ id: 1, name: "test" });
    });

    test("중첩 필드 제거 (user.email)", () => {
      const row = {
        id: 1,
        user: { id: 10, name: "john", email: "john@test.com" },
      };
      const result = baseModel.omitInternalFields(row, ["user.email"]);

      expect(result).toEqual({
        id: 1,
        user: { id: 10, name: "john" },
      });
    });

    test("배열 내 필드 제거 (employees.salary)", () => {
      const row = {
        id: 1,
        employees: [
          { id: 1, name: "Alice", salary: 50000 },
          { id: 2, name: "Bob", salary: 60000 },
        ],
      };
      const result = baseModel.omitInternalFields(row, ["employees.salary"]);

      expect(result).toEqual({
        id: 1,
        employees: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      });
    });

    test("깊은 중첩 배열 필드 제거 (projects.employees.salary)", () => {
      const row = {
        id: 1,
        projects: [
          {
            id: 100,
            name: "Project A",
            employees: [
              { id: 1, name: "Alice", salary: 50000 },
              { id: 2, name: "Bob", salary: 60000 },
            ],
          },
          {
            id: 101,
            name: "Project B",
            employees: [{ id: 3, name: "Charlie", salary: 70000 }],
          },
        ],
      };
      const result = baseModel.omitInternalFields(row, ["projects.employees.salary"]);

      expect(result).toEqual({
        id: 1,
        projects: [
          {
            id: 100,
            name: "Project A",
            employees: [
              { id: 1, name: "Alice" },
              { id: 2, name: "Bob" },
            ],
          },
          {
            id: 101,
            name: "Project B",
            employees: [{ id: 3, name: "Charlie" }],
          },
        ],
      });
    });

    test("빈 배열에서 필드 제거 시도", () => {
      const row = { id: 1, employees: [] };
      const result = baseModel.omitInternalFields(row, ["employees.salary"]);

      expect(result).toEqual({ id: 1, employees: [] });
    });

    test("null 값이 있는 중첩 필드", () => {
      const row = { id: 1, user: null };
      const result = baseModel.omitInternalFields(row, ["user.email"]);

      expect(result).toEqual({ id: 1, user: null });
    });

    test("복합 케이스: 단일 + 중첩 + 배열 필드 동시 제거", () => {
      const row = {
        id: 1,
        secret: "hidden",
        user: { id: 10, password: "hash123" },
        employees: [
          { id: 1, name: "Alice", salary: 50000 },
          { id: 2, name: "Bob", salary: 60000 },
        ],
      };
      const result = baseModel.omitInternalFields(row, [
        "secret",
        "user.password",
        "employees.salary",
      ]);

      expect(result).toEqual({
        id: 1,
        user: { id: 10 },
        employees: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      });
    });

    test("배열 내 일부 요소가 null인 경우", () => {
      const row = {
        id: 1,
        items: [{ id: 1, secret: "a" }, null, { id: 2, secret: "b" }],
      };
      const result = baseModel.omitInternalFields(row, ["items.secret"]);

      expect(result).toEqual({
        id: 1,
        items: [{ id: 1 }, null, { id: 2 }],
      });
    });
  });
});
