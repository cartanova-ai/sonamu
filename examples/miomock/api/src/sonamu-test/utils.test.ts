import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  assertDefined,
  assertExists,
  assertNotNull,
  differenceWith,
  exhaustive,
  findApiRootPath,
  findAppRootPath,
  intersectionBy,
  nonNullable,
} from "../../../../../modules/sonamu/dist/utils/utils";

const handleStatus = (status: "pending" | "approved"): string => {
  switch (status) {
    case "pending":
      return "대기중";
    case "approved":
      return "승인됨";
    default:
      exhaustive(status);
      return "";
  }
};

describe("utils", () => {
  describe("nonNullable (타입 가드)", () => {
    test.each([
      { value: null, expected: false, description: "null을 입력하면 false 반환" },
      { value: undefined, expected: false, description: "undefined를 입력하면 false 반환" },
      {
        value: 0,
        expected: true,
        description: "0을 입력하면 true 반환 (falsy지만 null/undefined 아님)",
      },
      { value: "", expected: true, description: "빈 문자열을 입력하면 true 반환" },
      { value: false, expected: true, description: "false를 입력하면 true 반환" },
      { value: {}, expected: true, description: "빈 객체를 입력하면 true 반환" },
      { value: { key: "value" }, expected: true, description: "객체를 입력하면 true 반환" },
      { value: [], expected: true, description: "빈 배열을 입력하면 true 반환" },
      { value: [1, 2, 3], expected: true, description: "배열을 입력하면 true 반환" },
    ])("$description", ({ value, expected }) => {
      expect(nonNullable(value)).toBe(expected);
    });

    test("실제 사용 패턴: 환경 변수 체크", () => {
      const envVar: string | undefined = process.env.SOME_VAR;

      if (nonNullable(envVar)) {
        // 타입이 string으로 좁혀짐
        expect(envVar).toEqual(expect.any(String));
      }
    });
  });

  describe("findApiRootPath (경로 찾기)", () => {
    let originalEnv: NodeJS.ProcessEnv;

    // 각 테스트 전에 환경 변수 백업
    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    // 각 테스트 후에 환경 변수 복원
    afterEach(() => {
      process.env = originalEnv;
    });

    test("PNPM_SCRIPT_SRC_DIR 환경 변수가 있으면 그것을 반환", () => {
      // pnpm workspace에서 설정되는 환경 변수 (최우선)
      process.env.PNPM_SCRIPT_SRC_DIR = "/test/workspace/path";

      const result = findApiRootPath();

      expect(result).toBe("/test/workspace/path");
    });

    test("INIT_CWD 환경 변수가 있으면 그것을 반환", () => {
      // npm/yarn에서 설정되는 환경 변수 (2순위)
      delete process.env.PNPM_SCRIPT_SRC_DIR;
      process.env.INIT_CWD = "/test/init/path";

      const result = findApiRootPath();

      expect(result).toBe("/test/init/path");
    });

    test("PNPM_PACKAGE_NAME이 있으면 process.cwd() 반환", () => {
      // pnpm 환경에서 패키지 이름이 있으면 현재 작업 디렉토리 사용 (3순위)
      delete process.env.PNPM_SCRIPT_SRC_DIR;
      delete process.env.INIT_CWD;
      process.env.PNPM_PACKAGE_NAME = "test-package";

      const result = findApiRootPath();

      expect(result).toBe(process.cwd());
    });

    test("환경 변수가 없으면 파일 시스템에서 package.json 찾기", () => {
      // 모든 환경 변수가 없을 때 파일 시스템 탐색
      delete process.env.PNPM_SCRIPT_SRC_DIR;
      delete process.env.INIT_CWD;
      delete process.env.PNPM_PACKAGE_NAME;

      // 실제 프로젝트에서 실행되므로 package.json을 찾을 수 있어야 함
      const result = findApiRootPath();

      expect(result).toBeTruthy();
      expect(result).toEqual(expect.any(String));
    });
  });

  /**
   * findAppRootPath 테스트
   *
   * findApiRootPath의 상위 디렉토리를 반환합니다.
   * 예: API Root가 /Users/noa/project/api 이면
   *     App Root는 /Users/noa/project 를 반환
   */
  describe("findAppRootPath (앱 루트 경로)", () => {
    test("API 루트의 상위 디렉토리를 반환", async () => {
      const result = findAppRootPath();

      expect(result).toBeTruthy();
      expect(result).toEqual(expect.any(String));

      // API 루트보다 짧아야 함 (상위 디렉토리)
      const apiRoot = findApiRootPath();
      expect(result.length).toBeLessThan(apiRoot.length);
    });

    test("경로 구조 확인", async () => {
      const appRoot = findAppRootPath();
      const apiRoot = findApiRootPath();

      // API 루트는 App 루트로 시작해야 함 (하위 디렉토리이므로)
      expect(apiRoot.startsWith(appRoot)).toBe(true);
    });
  });

  /**
   * exhaustive 테스트
   *
   * TypeScript의 exhaustiveness checking을 위한 함수입니다.
   * switch/if 문에서 모든 케이스를 처리했는지 컴파일 타임에 확인합니다.
   * 실제로 호출되면 런타임 에러가 발생합니다.
   */
  describe("exhaustive (타입 체크)", () => {
    test("호출하면 에러 발생", () => {
      expect(() => {
        // never 타입이 아닌 값을 강제로 전달하여 런타임 에러 테스트
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        exhaustive("not-never" as never);
      }).toThrow("exhaustive");
    });

    test("switch 문에서 사용하는 패턴", () => {
      // 모든 케이스가 정상 동작하는지 확인
      expect(handleStatus("pending")).toBe("대기중");
      expect(handleStatus("approved")).toBe("승인됨");
    });
  });

  describe("assertExists (null/undefined 체크)", () => {
    test.each([
      { value: null, description: "null을 입력하면 에러" },
      { value: undefined, description: "undefined를 입력하면 에러" },
    ])("$description", ({ value }) => {
      expect(() => assertExists(value)).toThrow("Value must exist");
    });

    test.each([
      { value: "hello", expected: "hello" },
      { value: 0, expected: 0 },
      { value: false, expected: false },
    ])("값 $value는 그대로 반환", ({ value, expected }) => {
      expect(assertExists(value)).toBe(expected);
    });

    test("커스텀 에러 메시지", () => {
      // 두 번째 인자로 커스텀 에러 메시지 지정 가능
      expect(() => assertExists(null, "User not found")).toThrow("User not found");
    });

    test("타입 narrowing 확인", () => {
      const value: string | null | undefined = "test";
      const result = assertExists(value);

      // assertExists 통과 후 result는 string 타입으로 좁혀짐
      expect(result).toEqual(expect.any(String));
      expect(result.toUpperCase()).toBe("TEST");
    });
  });

  describe("assertNotNull (null 체크)", () => {
    test("null을 입력하면 에러 발생", () => {
      // null만 체크하여 에러
      expect(() => assertNotNull(null)).toThrow("Value must not be null");
    });

    test.each([
      { value: undefined, expected: undefined, description: "undefined는 통과" },
      { value: "hello", expected: "hello", description: "문자열은 반환" },
      { value: 0, expected: 0, description: "0은 반환" },
    ])("$description", ({ value, expected }) => {
      expect(assertNotNull(value)).toBe(expected);
    });

    test("커스텀 에러 메시지", () => {
      // 커스텀 에러 메시지 지정 가능
      expect(() => assertNotNull(null, "Result is null")).toThrow("Result is null");
    });
  });

  describe("assertDefined (undefined 체크)", () => {
    test("undefined를 입력하면 에러 발생", () => {
      // undefined만 체크하여 에러
      expect(() => assertDefined(undefined)).toThrow("Value must be defined");
    });

    test.each([
      { value: null, expected: null, description: "null은 통과" },
      { value: "hello", expected: "hello", description: "문자열은 반환" },
      { value: 0, expected: 0, description: "0은 반환" },
    ])("$description", ({ value, expected }) => {
      expect(assertDefined(value)).toBe(expected);
    });

    test("커스텀 에러 메시지", () => {
      // 커스텀 에러 메시지 지정 가능
      expect(() => assertDefined(undefined, "Config is undefined")).toThrow("Config is undefined");
    });
  });

  describe("intersectionBy (교집합)", () => {
    test("기본 교집합 추출", () => {
      const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const arr2 = [{ id: 2 }, { id: 3 }, { id: 4 }];

      // id 속성 기준으로 교집합 찾기
      const result = intersectionBy(arr1, arr2, (item) => item.id);

      expect(result).toHaveLength(2); // 2개의 공통 요소
      expect(result).toEqual([{ id: 2 }, { id: 3 }]); // arr1에서 가져옴
    });

    test("교집합이 없는 경우", () => {
      const arr1 = [{ id: 1 }, { id: 2 }];
      const arr2 = [{ id: 3 }, { id: 4 }];

      const result = intersectionBy(arr1, arr2, (item) => item.id);

      // 공통 요소가 없으면 빈 배열
      expect(result).toEqual([]);
    });

    test("빈 배열", () => {
      const result = intersectionBy([], [{ id: 1 }], (item) => item.id);

      // 첫 번째 배열이 비어있으면 빈 배열
      expect(result).toEqual([]);
    });

    test("문자열 속성으로 비교", () => {
      const arr1 = [{ name: "Alice" }, { name: "Bob" }];
      const arr2 = [{ name: "Bob" }, { name: "Charlie" }];

      // name 속성 기준으로 교집합 찾기
      const result = intersectionBy(arr1, arr2, (item) => item.name);

      expect(result).toEqual([{ name: "Bob" }]); // Bob만 공통
    });

    test("실제 사용 패턴: 스키마 컬럼 비교", () => {
      // 마이그레이션 시 DB 스키마와 엔티티 정의 비교
      const dbColumns = [
        { name: "id", type: "int" },
        { name: "name", type: "varchar" },
        { name: "age", type: "int" },
      ];
      const entityColumns = [
        { name: "name", type: "string" },
        { name: "age", type: "number" },
        { name: "email", type: "string" },
      ];

      // 동일한 이름의 컬럼 찾기 (name 기준)
      const sameColumns = intersectionBy(dbColumns, entityColumns, (col) => col.name);

      expect(sameColumns).toHaveLength(2); // name, age 2개
      expect(sameColumns.map((c) => c.name)).toEqual(["name", "age"]);
    });
  });

  describe("differenceWith (차집합)", () => {
    test("기본 차집합 추출", () => {
      const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const arr2 = [{ id: 2 }];

      // arr1에서 arr2에 있는 요소 제거
      const result = differenceWith(arr1, arr2, (a, b) => a.id === b.id);

      expect(result).toEqual([{ id: 1 }, { id: 3 }]); // id:2 제거됨
    });

    test("모두 제거되는 경우", () => {
      const arr1 = [{ id: 1 }, { id: 2 }];
      const arr2 = [{ id: 1 }, { id: 2 }];

      // 모든 요소가 arr2에 있으면 빈 배열
      const result = differenceWith(arr1, arr2, (a, b) => a.id === b.id);

      expect(result).toEqual([]);
    });

    test("아무것도 제거 안 되는 경우", () => {
      const arr1 = [{ id: 1 }, { id: 2 }];
      const arr2 = [{ id: 3 }, { id: 4 }];

      // arr2에 없는 요소만 남음
      const result = differenceWith(arr1, arr2, (a, b) => a.id === b.id);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]); // 모두 유지됨
    });

    test("빈 배열", () => {
      const result = differenceWith([], [{ id: 1 }], (a, b) => a.id === b.id);

      // 첫 번째 배열이 비어있으면 빈 배열
      expect(result).toEqual([]);
    });

    test("복잡한 비교 함수", () => {
      const arr1 = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ];
      const arr2 = [{ name: "Alice", age: 30 }];

      // name과 age 모두 일치해야 제거
      const result = differenceWith(arr1, arr2, (a, b) => a.name === b.name && a.age === b.age);

      expect(result).toEqual([{ name: "Bob", age: 25 }]); // Alice만 제거됨
    });

    test("실제 사용 패턴: 변경된 컬럼 찾기", () => {
      // 마이그레이션 시 변경된 컬럼 감지
      const dbColumns = [
        { name: "id", type: "int" },
        { name: "name", type: "varchar(50)" },
      ];
      const entityColumns = [
        { name: "id", type: "int" },
        { name: "name", type: "varchar(100)" }, // 타입 변경됨
      ];

      // 이름과 타입이 모두 같은 것만 제거 → 변경된 것만 남음
      const changedColumns = differenceWith(
        dbColumns,
        entityColumns,
        (a, b) => a.name === b.name && a.type === b.type,
      );

      expect(changedColumns).toHaveLength(1); // name 컬럼이 변경됨
      expect(changedColumns[0]?.name).toBe("name");
    });

    test("실제 사용 패턴: 체크섬 비교", () => {
      // 파일 변경 감지 (syncer에서 사용)
      const calculated = [
        { path: "file1.ts", checksum: "abc123" },
        { path: "file2.ts", checksum: "def456" },
        { path: "file3.ts", checksum: "ghi789" },
      ];
      const saved = [
        { path: "file1.ts", checksum: "abc123" },
        { path: "file2.ts", checksum: "different" }, // 변경됨
      ];

      // 경로와 체크섬이 모두 같은 것만 제거 → 변경/추가된 파일만 남음
      const changed = differenceWith(
        calculated,
        saved,
        (a, b) => a.path === b.path && a.checksum === b.checksum,
      );

      expect(changed).toHaveLength(2); // file2(변경), file3(신규)
      expect(changed.map((c) => c.path)).toEqual(["file2.ts", "file3.ts"]);
    });
  });
});
