/* oxlint-disable @typescript-eslint/no-explicit-any */ // test.each의 expectedPath 함수에서 동적 경로 접근을 위해 any 타입 필요
import { describe, expect, test } from "vitest";

import { withProp, withProps } from "../../../../../modules/sonamu/dist/utils/type-utils";

// 타입 체크 헬퍼: TypeScript 컴파일러가 올바른 타입을 추론하는지 검증
function expectType<T>(value: T): void {
  expect(value).toBeDefined();
}

describe("type-utils", () => {
  describe("withProp - 기본 동작", () => {
    test("새로운 속성 추가", () => {
      // 기존 객체에 없던 속성을 추가하고, 런타임 값과 타입이 올바른지 검증
      const obj = { name: "John" };
      const result = withProp(obj, "age", 30);

      expect(result).toEqual({ name: "John", age: 30 });
      expectType(result);
    });

    test("기존 속성 덮어쓰기", () => {
      // 이미 존재하는 속성의 값을 변경하고 타입이 유지되는지 확인
      const obj = { name: "John", age: 25 };
      const result = withProp(obj, "age", 30);

      expect(result.age).toBe(30);
      expectType(result);
    });

    test("원본 객체 불변성", () => {
      // structuredClone을 사용하여 원본 객체가 변경되지 않는지 확인
      const obj = { name: "John", age: 25 };
      const result = withProp(obj, "age", 30);

      expect(obj.age).toBe(25); // 원본은 그대로
      expect(result.age).toBe(30); // 결과만 변경
      expect(result).not.toBe(obj); // 서로 다른 객체
    });
  });

  describe("withProp - 중첩 경로", () => {
    test.each([
      {
        name: "2단계 중첩",
        input: { user: { id: 1 } },
        path: "user.name" as const,
        value: "John",
        expectedPath: (r: any) => r.user.name,
      },
      {
        name: "3단계 이상 중첩",
        input: { user: { id: 1, profile: { name: "John" } } },
        path: "user.profile.address" as const,
        value: "Seoul",
        expectedPath: (r: any) => r.user.profile.address,
      },
    ])("$name", ({ input, path, value, expectedPath }) => {
      // 점(.)으로 구분된 중첩 경로를 통해 깊은 속성에 값을 설정
      const result = withProp(input, path, value);
      expect(expectedPath(result)).toBe(value);
    });

    test("존재하지 않는 경로 자동 생성", () => {
      // 중간 객체가 없을 때 자동으로 생성되는지 확인
      // { id: 1 } → { id: 1, user: { name: "John" } }
      const obj = { id: 1 };
      const result = withProp(obj, "user.name", "John");

      expect(result.user.name).toBe("John");
      expectType(result);
    });
  });

  describe("withProp - 배열 처리", () => {
    test("배열의 모든 요소에 속성 설정", () => {
      // 배열 경로를 사용하면 모든 요소에 동일한 속성이 추가됨
      const obj = { users: [{ name: "John" }, { name: "Jane" }] };
      const result = withProp(obj, "users.age", 30);

      expect(result.users.map((u) => u.age)).toEqual([30, 30]);
      expectType(result);
    });

    test("배열 내 객체의 중첩 속성", () => {
      // 배열 요소의 중첩된 속성에도 접근 가능
      // users.profile.verified → 모든 users의 profile.verified 설정
      const obj = {
        users: [
          { name: "John", profile: { level: 1 } },
          { name: "Jane", profile: { level: 2 } },
        ],
      };
      const result = withProp(obj, "users.profile.verified", true);

      expect(result.users.map((u) => u.profile.verified)).toEqual([true, true]);
      expect(result.users.map((u) => u.profile.level)).toEqual([1, 2]); // 기존 값 유지
    });

    test("중첩된 배열 (배열 안의 배열)", () => {
      // 2단계 배열 구조에서도 모든 요소에 속성 설정 가능
      // departments[].employees[].active → 모든 employees의 active 설정
      const obj = {
        departments: [
          { name: "Engineering", employees: [{ id: 1 }, { id: 2 }] },
          { name: "Marketing", employees: [{ id: 3 }, { id: 4 }] },
        ],
      };
      const result = withProp(obj, "departments.employees.active", true);

      const allActive = result.departments.flatMap((d) => d.employees.map((e) => e.active));
      expect(allActive).toEqual([true, true, true, true]);
    });

    test("빈 배열 처리", () => {
      // 빈 배열은 그대로 유지되며, 타입만 업데이트됨
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const obj = { users: [] as { name: string }[] };
      const result = withProp(obj, "users.age", 30);

      expect(result.users).toEqual([]);
      expectType(result);
    });
  });

  describe("withProps - 체이닝", () => {
    test("여러 속성 연속 설정", () => {
      // .set()을 체이닝하여 여러 속성을 한 번에 설정
      // 각 .set() 호출마다 타입이 자동으로 업데이트됨
      const obj = { name: "John" };
      const result = withProps(obj).set("age", 30).set("email", "john@example.com").value();

      expect(result).toEqual({ name: "John", age: 30, email: "john@example.com" });
      expectType(result);
    });

    test("실제 사용 패턴: Employee 모델", () => {
      // Employee 모델에서 실제로 사용하는 복잡한 데이터 구조
      // DB 쿼리 결과를 API 응답 전에 가공하는 enhancer 함수에서 사용
      const row = {
        id: 1,
        name: "John",
        user: {
          id: 100,
          employee: {
            id: 1,
            department: { id: 10, name: "Engineering", employee_count: 10 },
          },
        },
        department: {
          id: 10,
          name: "Engineering",
          employees: [
            {
              id: 1,
              projs: [
                { id: 1, name: "Project A", virtual_test: 5 },
                { id: 2, name: "Project B", virtual_test: 3 },
              ],
            },
            {
              id: 2,
              projs: [{ id: 3, name: "Project C", virtual_test: 7 }],
            },
          ],
        },
      };

      const result = withProps(row)
        .set("user.employee.department.employee_count", 0)
        .set("department.employees.projs.virtual_test", 0)
        .value();

      // 깊은 중첩 경로의 값이 변경되었는지 확인
      expect(result.user.employee.department.employee_count).toBe(0);

      // 배열 내 모든 projs의 virtual_test가 0으로 설정되었는지 확인
      const allVirtualTests = result.department.employees.flatMap((e) =>
        e.projs.map((p) => p.virtual_test),
      );
      expect(allVirtualTests).toEqual([0, 0, 0]);

      // 다른 속성들은 유지되어야 함
      expect(result.id).toBe(1);
      expect(result.department.employees[0]?.projs[0]?.name).toBe("Project A");

      // 원본 불변성: 원본 row는 변경되지 않음
      expect(row.user.employee.department.employee_count).toBe(10);
      expect(row.department.employees[0]?.projs[0]?.virtual_test).toBe(5);
    });

    test("배열과 체이닝 조합", () => {
      // 배열 경로와 중첩 경로를 체이닝으로 조합하여 사용
      const obj = {
        users: [
          { name: "John", posts: [{ title: "Post 1" }] },
          { name: "Jane", posts: [{ title: "Post 2" }] },
        ],
      };
      const result = withProps(obj)
        .set("users.active", true) // 모든 users에 active 추가
        .set("users.posts.published", false) // 모든 users의 모든 posts에 published 추가
        .value();

      expect(result.users.map((u) => u.active)).toEqual([true, true]);
      const allPublished = result.users.flatMap((u) => u.posts.map((p) => p.published));
      expect(allPublished).toEqual([false, false]);

      expectType(result);
    });
  });
});
