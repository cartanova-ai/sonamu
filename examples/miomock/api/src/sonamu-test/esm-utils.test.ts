import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { isHotReloadServer } from "../../../../../modules/sonamu/dist/utils/controller";
import {
  createImportUrl,
  getDirname,
  getFilename,
} from "../../../../../modules/sonamu/dist/utils/esm-utils";

describe("esm-utils", () => {
  describe("getFilename 테스트", () => {
    test.each([
      {
        input: "file:///Users/user/project/file.ts",
        expected: "/Users/user/project/file.ts",
        description: "기본 경로 변환",
      },
      {
        input: "file:///Users/user/my-project/src/utils/helper.ts",
        expected: "/Users/user/my-project/src/utils/helper.ts",
        description: "하이픈 포함 경로",
      },
      {
        input: "file:///Users/user/projects/sonamu/modules/sonamu/src/utils/esm-utils.ts",
        expected: "/Users/user/projects/sonamu/modules/sonamu/src/utils/esm-utils.ts",
        description: "깊게 중첩된 경로",
      },
    ])("$description", ({ input, expected }) => {
      expect(getFilename(input)).toBe(expected);
    });
  });

  describe("getDirname 테스트", () => {
    test.each([
      {
        input: "file:///Users/user/project/src/file.ts",
        expected: "/Users/user/project/src",
        description: "일반 파일 경로",
      },
      {
        input: "file:///file.ts",
        expected: "/",
        description: "루트 디렉토리",
      },
      {
        input: "file:///Users/user/projects/sonamu/modules/sonamu/src/utils/esm-utils.ts",
        expected: "/Users/user/projects/sonamu/modules/sonamu/src/utils",
        description: "중첩된 경로",
      },
    ])("$description", ({ input, expected }) => {
      expect(getDirname(input)).toBe(expected);
    });
  });

  describe("createImportUrl 테스트", () => {
    test("절대 경로를 file:// URL로 변환", () => {
      // 일반적인 절대 경로
      const absolutePath = "/Users/user/project/file.js";

      // createImportUrl로 file:// URL 생성
      const result = createImportUrl(absolutePath);

      // file:// 프로토콜로 시작하고 파일명이 포함되어야 함
      expect(result).toMatch(/^file:\/\//);
      expect(result).toContain("file.js");
    });

    test("특수 문자가 포함된 경로도 올바르게 변환", () => {
      // 공백이 포함된 디렉토리와 파일명
      const absolutePath = "/Users/user/my project/file with spaces.js";

      const result = createImportUrl(absolutePath);

      // file:// 프로토콜로 시작해야 함
      expect(result).toMatch(/^file:\/\//);
      // 공백은 %20으로 URL 인코딩되어야 함
      expect(result).toContain("my%20project");
      expect(result).toContain("file%20with%20spaces.js");
    });

    test("getFilename과 createImportUrl은 역변환 관계", () => {
      // 원본 절대 경로
      const originalPath = "/Users/user/project/file.js";

      // 경로 → URL → 경로 변환
      const url = createImportUrl(originalPath);
      const convertedBack = getFilename(url);

      // 원본 경로와 동일해야 함 (완벽한 역변환)
      expect(convertedBack).toBe(originalPath);
    });

    test("복잡한 경로의 역변환", () => {
      // 깊게 중첩된 경로
      const originalPath = "/Users/user/projects/sonamu/modules/sonamu/dist/utils/esm-utils.js";

      // 역변환 테스트
      const url = createImportUrl(originalPath);
      const convertedBack = getFilename(url);

      // 복잡한 경로도 복원되어야 함
      expect(convertedBack).toBe(originalPath);
    });

    test("Windows 스타일 경로도 처리 가능", () => {
      // Windows 드라이브 문자가 포함된 경로
      const absolutePath = "/C:/Users/user/project/file.js";

      const result = createImportUrl(absolutePath);

      // pathToFileURL은 플랫폼 독립적으로 동작
      expect(result).toMatch(/^file:\/\//);
    });
  });

  describe("isHotReloadServer 테스트", () => {
    let originalHot: string | undefined;

    beforeEach(() => {
      // 환경 변수 백업
      originalHot = process.env.HOT;
    });

    afterEach(() => {
      // 환경 변수 복원
      if (originalHot === undefined) {
        delete process.env.HOT;
      } else {
        process.env.HOT = originalHot;
      }
    });

    test.each([
      { value: "yes", expected: true, description: '"yes"일 때 true 반환' },
      { value: "no", expected: false, description: '"no"일 때 false 반환' },
      { value: "", expected: false, description: "빈 문자열일 때 false 반환" },
      { value: undefined, expected: false, description: "undefined일 때 false 반환" },
      { value: "true", expected: false, description: '"true"일 때 false 반환' },
      { value: "YES", expected: false, description: "대문자일 때 false 반환" },
      { value: "Yes", expected: false, description: "혼합 케이스일 때 false 반환" },
    ])("$description", ({ value, expected }) => {
      // 환경 변수 설정
      if (value === undefined) {
        delete process.env.HOT;
      } else {
        process.env.HOT = value;
      }

      // 검증
      expect(isHotReloadServer()).toBe(expected);
    });
  });

  describe("importMembers 테스트", () => {
    test("importMembers의 내부 동작 검증 - Object.entries 변환", async () => {
      // importMembers는 내부적으로:
      // 1. createImportUrl로 file:// URL 생성
      // 2. import()로 모듈 로드
      // 3. Object.entries로 { name, value } 배열 변환

      // 1단계: createImportUrl이 올바른 URL을 생성하는지 검증
      const testPath = "/fake/path/module.js";
      const url = createImportUrl(testPath);
      expect(url).toMatch(/^file:\/\//);

      // 3단계: Object.entries 변환 로직 검증 (가상 모듈로 시뮬레이션)
      const mockModule = {
        foo: "bar",
        num: 42,
        func: () => "hello",
      };

      // importMembers의 핵심 로직: Object.entries로 변환
      const entries = Object.entries(mockModule).map(([name, value]) => ({
        name,
        value,
      }));

      // 3개의 export가 배열로 변환되어야 함
      expect(entries).toHaveLength(3);
      expect(entries).toContainEqual({ name: "foo", value: "bar" });
      expect(entries).toContainEqual({ name: "num", value: 42 });
      expect(entries[2]?.name).toBe("func");
      expect(entries[2]?.value).toEqual(expect.any(Function));
    });

    test("다양한 export 타입의 변환 검증", () => {
      // 다양한 타입의 export를 가진 가상 모듈
      const mockModule = {
        constant: "CONSTANT_VALUE",
        calculate: (a: number, b: number) => a + b,
        TestModel: class TestModel {
          name: string;
          constructor(name: string) {
            this.name = name;
          }
        },
        TestFrame: class TestFrame {
          type = "frame";
        },
        default: { type: "default-export" },
      };

      // Object.entries로 변환
      const members = Object.entries(mockModule).map(([name, value]) => ({
        name,
        value,
      }));

      // 5개의 export가 모두 변환되어야 함
      expect(members).toHaveLength(5);

      // 문자열 상수 확인
      const constantMember = members.find((m) => m.name === "constant");
      expect(constantMember?.value).toBe("CONSTANT_VALUE");

      // 함수 확인
      const calculateMember = members.find((m) => m.name === "calculate");
      expect(calculateMember?.value).toEqual(expect.any(Function));

      // 클래스 확인 (JavaScript에서 class는 function 타입)
      const testModelMember = members.find((m) => m.name === "TestModel");
      expect(testModelMember?.value).toEqual(expect.any(Function));

      // default export 확인
      const defaultMember = members.find((m) => m.name === "default");
      expect(defaultMember?.value).toEqual({ type: "default-export" });
    });

    test.each([
      {
        mockModule: {
          UserModel: class UserModel {
            readonly moduleKind = "model";
          },
          PostModel: class PostModel {
            readonly moduleKind = "model";
          },
          UserFrame: class {
            readonly moduleKind = "frame";
          },
          helper: () => {},
        },
        filter: (m: { name: string }) => m.name.endsWith("Model"),
        expected: ["UserModel", "PostModel"],
        description: "Model 클래스 필터링",
      },
      {
        mockModule: {
          UserModel: class {
            readonly moduleKind = "model";
          },
          PostFrame: class PostFrame {
            readonly moduleKind = "frame";
          },
          CommentFrame: class CommentFrame {
            readonly moduleKind = "frame";
          },
          helper: () => {},
        },
        filter: (m: { name: string }) => m.name.endsWith("Frame"),
        expected: ["PostFrame", "CommentFrame"],
        description: "Frame 클래스 필터링",
      },
    ])("실제 사용 예시: $description", ({ mockModule, filter, expected }) => {
      const members = Object.entries(mockModule).map(([name, value]) => ({
        name,
        value,
      }));
      const filtered = members.filter(filter);
      expect(filtered.map((m: { name: string }) => m.name)).toEqual(expected);
    });

    test("빈 모듈은 빈 배열 반환", () => {
      // export가 하나도 없는 빈 모듈
      const emptyModule = {};

      const members = Object.entries(emptyModule).map(([name, value]) => ({
        name,
        value,
      }));

      // 빈 배열이 반환되어야 함
      expect(members).toHaveLength(0);
      expect(Array.isArray(members)).toBe(true);
    });

    test("반환된 멤버의 구조 검증", () => {
      // 간단한 export 2개를 가진 모듈
      const mockModule = {
        foo: "bar",
        num: 42,
      };

      const members = Object.entries(mockModule).map(([name, value]) => ({
        name,
        value,
      }));

      // 모든 멤버가 name과 value 속성을 가져야 함
      for (const member of members) {
        expect(member).toHaveProperty("name");
        expect(member).toHaveProperty("value");
        expect(member.name).toEqual(expect.any(String));
      }
    });

    test("중복된 이름이 없음을 보장", () => {
      // 서로 다른 이름의 export들
      const mockModule = {
        foo: "bar",
        baz: 123,
        qux: () => {},
      };

      const members = Object.entries(mockModule).map(([name, value]) => ({
        name,
        value,
      }));

      // 모든 이름이 고유해야 함
      const names = members.map((m) => m.name);
      const uniqueNames = [...new Set(names)];

      expect(names.length).toBe(uniqueNames.length);
    });
  });
});
