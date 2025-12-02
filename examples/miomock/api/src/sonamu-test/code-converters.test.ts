import { describe, expect, vi } from "vitest";
import { z } from "zod";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);

import {
  apiParamTypeToTsType,
  getZodObjectFromApi,
  getZodObjectFromApiParams,
  getZodTypeFromApiParamType,
} from "../../../../../modules/sonamu/dist/api/code-converters";
import type {
  ApiDecoratorOptions,
  ExtendedApi,
} from "../../../../../modules/sonamu/dist/api/decorators";
import type { ApiParam, ApiParamType } from "../../../../../modules/sonamu/dist/types/types";

describe("code-converters", () => {
  const options: ApiDecoratorOptions = {
    httpMethod: "GET",
    description: "testApi",
    clients: [],
    contentType: "application/json",
  };

  function createTestApi(overrides: Partial<ExtendedApi> = {}): ExtendedApi {
    return {
      modelName: "PracticeModel",
      methodName: "testApi",
      path: "/practice/testApi",
      options: options,
      typeParameters: [],
      parameters: [],
      returnType: {
        t: "ref",
        id: "Promise",
        args: [{ t: "ref", id: "void" }],
      },
      ...overrides,
    };
  }

  function expectToPass(zodType: z.ZodType, validData: unknown) {
    const result = zodType.safeParse(validData);
    expect(result.success).toBe(true);
  }

  function expectToFail(zodType: z.ZodType, invalidData: unknown) {
    const result = zodType.safeParse(invalidData);
    expect(result.success).toBe(false);
  }

  describe("getZodTypeFromApiParamType", () => {
    describe("Primitive 타입", () => {
      test.each([
        ["string", "test", 123],
        ["number", 123, "test"],
        ["boolean", true, "true"],
      ])("%s 타입", (type, validValue, invalidValue) => {
        const zodType = getZodTypeFromApiParamType(type as ApiParamType, {});

        // 유효한 타입의 값
        expectToPass(zodType, validValue);
        // 타입 불일치 값
        expectToFail(zodType, invalidValue);
      });
    });

    describe("Literal 타입", () => {
      test("string-literal", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "string-literal", value: "active" }, {});

        // 리터럴 값과 일치
        expectToPass(zodType, "active");
        // 리터럴 값과 불일치
        expectToFail(zodType, "inactive");
      });

      test("numeric-literal", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "numeric-literal", value: 42 }, {});

        // 리터럴 값과 일치
        expectToPass(zodType, 42);
        // 리터럴 값과 불일치
        expectToFail(zodType, 43);
      });
    });

    describe("Object 타입", () => {
      test("object with props", async () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "object",
            props: [
              { name: "test", type: "string", optional: false },
              { name: "age", type: "number", optional: true },
            ],
          },
          {},
        );

        // 모든 필드 제공
        expectToPass(zodType, { test: "test", age: 1 });
        // 선택 필드(age) 생략
        expectToPass(zodType, { test: "test" });
        // test 누락
        expectToFail(zodType, { age: 1 });
        // test 타입 오류
        expectToFail(zodType, { test: 1 });
      });
    });

    describe("Array 타입", () => {
      test("array of primitives", () => {
        const zodType = getZodTypeFromApiParamType({ t: "array", elementsType: "string" }, {});

        // 문자열 배열
        expectToPass(zodType, ["a", "b"]);
        // 빈 배열
        expectToPass(zodType, []);
        // 숫자 배열 (타입 불일치)
        expectToFail(zodType, [1, 2]);
      });

      test("nested array", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "array",
            elementsType: { t: "array", elementsType: "number" },
          },
          {},
        );

        // 2차원 배열
        expectToPass(zodType, [
          [1, 2],
          [3, 4],
        ]);
        // 1차원 배열
        expectToFail(zodType, [1, 2]);
      });
    });

    describe("Union 타입", () => {
      test("일반 union", () => {
        const zodType = getZodTypeFromApiParamType({ t: "union", types: ["string", "number"] }, {});
        // 문자열 (union의 첫 번째 타입)
        expectToPass(zodType, "test");
        // 숫자 (union의 두 번째 타입)
        expectToPass(zodType, 123);
        // boolean (union에 없는 타입)
        expectToFail(zodType, true);
      });

      test("nullable union (string | null)", () => {
        const zodType = getZodTypeFromApiParamType({ t: "union", types: ["string", "null"] }, {});
        // 문자열
        expectToPass(zodType, "test");
        // null
        expectToPass(zodType, null);
        // 숫자 (허용되지 않음)
        expectToFail(zodType, 123);
      });

      test("nullable union (null | number)", () => {
        const zodType = getZodTypeFromApiParamType({ t: "union", types: ["null", "number"] }, {});
        // 숫자
        expectToPass(zodType, 123);
        // null
        expectToPass(zodType, null);
        // 문자열 (허용되지 않음)
        expectToFail(zodType, "test");
      });
    });
    describe("Intersection 타입", () => {
      test("intersection of objects", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "intersection",
            types: [
              {
                t: "object",
                props: [{ name: "a", type: "string", optional: false }],
              },
              {
                t: "object",
                props: [{ name: "b", type: "number", optional: false }],
              },
            ],
          },
          {},
        );
        // 모든 필드 제공
        expectToPass(zodType, { a: "test", b: 123 });
        // b 누락
        expectToFail(zodType, { a: "test" });
        // a 누락
        expectToFail(zodType, { b: 123 });
      });
    });
    describe("Tuple 타입", () => {
      test("tuple", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "tuple-type",
            elements: ["string", "number"],
          },
          {},
        );
        // 올바른 타입 순서
        expectToPass(zodType, ["test", 123]);
        // 순서 바뀜
        expectToFail(zodType, [123, "test"]);
        // 길이 부족
        expectToFail(zodType, ["test"]);
      });
    });

    describe("Ref 타입", () => {
      test("Date", () => {
        const zodType = getZodTypeFromApiParamType({ t: "ref", id: "Date" }, {});
        // Date 객체
        expectToPass(zodType, new Date());
        // 문자열 (Date 객체 아님)
        expectToFail(zodType, "2024-01-01");
      });

      test("Partial", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "ref",
            id: "Partial",
            args: [
              {
                t: "object",
                props: [
                  { name: "id", type: "number", optional: false },
                  { name: "name", type: "string", optional: false },
                ],
              },
            ],
          },
          {},
        );
        // 모든 필드 optional
        expectToPass(zodType, {});
        expectToPass(zodType, { id: 1 });
        expectToPass(zodType, { name: "test" });
        expectToPass(zodType, { id: 1, name: "test" });
      });

      test("Partial 에러 - 잘못된 인자 개수", () => {
        expect(() => {
          getZodTypeFromApiParamType(
            {
              t: "ref",
              id: "Partial",
              args: [], // args 0개
            },
            {},
          );
        }).toThrow("잘못된 Partial");
      });

      test("reference 조회", () => {
        const references = {
          User: z.object({ id: z.number() }),
        };
        const zodType = getZodTypeFromApiParamType({ t: "ref", id: "User" }, references);

        // 올바른 User 객체
        expectToPass(zodType, { id: 1 });
        // id 타입 오류
        expectToFail(zodType, { id: "1" });
      });

      test("undefined reference → unknown fallback", () => {
        const zodType = getZodTypeFromApiParamType({ t: "ref", id: "NonExistent" }, {});

        // unknown은 모든 값을 허용
        expectToPass(zodType, "anything");
        expectToPass(zodType, 123);
        expectToPass(zodType, { any: "object" });
      });
    });

    describe("Pick/Omit 유틸리티 처리", () => {
      test("Pick with union keys", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "ref",
            id: "Pick",
            args: [
              {
                t: "object",
                props: [
                  { name: "id", type: "number", optional: false },
                  { name: "name", type: "string", optional: false },
                  { name: "age", type: "number", optional: false },
                ],
              },
              {
                t: "union",
                types: [
                  { t: "string-literal", value: "id" },
                  { t: "string-literal", value: "name" },
                ],
              },
            ],
          },
          {},
        );
        // Pick된 필드만 제공
        expectToPass(zodType, { id: 1, name: "test" });
        // age는 제거됨
        expectToPass(zodType, { id: 1, name: "test", age: 30 });
        // failCase는 어떻게 생성할까?
      });

      test("Pick with single literal key", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "ref",
            id: "Pick",
            args: [
              {
                t: "object",
                props: [
                  { name: "id", type: "number", optional: false },
                  { name: "name", type: "string", optional: false },
                ],
              },
              { t: "string-literal", value: "id" },
            ],
          },
          {},
        );

        // Pick된 id 필드만
        expectToPass(zodType, { id: 1 });
        // name은 제거됨
        expectToPass(zodType, { id: 1, name: "test" });
      });

      test("Omit + multiple keys", async () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "ref",
            id: "Omit",
            args: [
              {
                t: "object",
                props: [
                  { name: "id", type: "number", optional: false },
                  { name: "name", type: "string", optional: false },
                  { name: "password", type: "string", optional: false },
                ],
              },
              {
                t: "union",
                types: [{ t: "string-literal", value: "password" }],
              },
            ],
          },
          {},
        );

        // Omit된 password 제외한 필드
        expectToPass(zodType, { id: 1, name: "test" });
        // password는 제거됨
        expectToPass(zodType, { id: 1, name: "test", password: "123456" });
        expectToPass(zodType, { id: 1, name: "test", password: 123456 });
        // name 타입 오류
        expectToFail(zodType, { id: 1, name: 111, password: 123456, age: 30 });
        // id 타입 오류
        expectToFail(zodType, { id: "hello", name: "test", password: 123456, age: 30 });
      });

      test("잘못된 인자 개수 에러 - Pick", () => {
        expect(() => {
          getZodTypeFromApiParamType(
            {
              t: "ref",
              id: "Pick",
              args: [{ t: "object", props: [] }], // args 1개만
            },
            {},
          );
        }).toThrow("잘못된 Pick");
      });

      test("잘못된 인자 개수 에러 - Omit", () => {
        expect(() => {
          getZodTypeFromApiParamType(
            {
              t: "ref",
              id: "Omit",
              args: [], // args 0개
            },
            {},
          );
        }).toThrow("잘못된 Omit");
      });
    });

    describe("순환참조 처리", () => {
      test("자기 자신 참조 → unknown fallback", () => {
        const zodType = getZodTypeFromApiParamType(
          {
            t: "type-param",
            id: "SelfRef",
            constraint: { t: "ref", id: "SelfRef" },
          },
          {},
        );

        // unknown fallback으로 처리되므로 모든 값 허용
        expectToPass(zodType, "anything");
        expectToPass(zodType, 123);
        expectToPass(zodType, { any: "value" });
      });

      test("상호 참조 (A↔B) → unknown fallback", () => {
        // A는 B를 참조, B는 A를 참조 (둘 다 references에 없음)
        const zodTypeA = getZodTypeFromApiParamType({ t: "ref", id: "B" }, {});
        const zodTypeB = getZodTypeFromApiParamType({ t: "ref", id: "A" }, {});

        // A와 B 모두 unknown으로 fallback
        expectToPass(zodTypeA, "anything");
        expectToPass(zodTypeB, 123);
        expectToPass(zodTypeB, { any: "object" });
      });

      test("Pick + 순환참조 → unknown fallback", () => {
        // User 타입이 Pick<User, "id" | "name">을 포함 (자기 자신 참조)
        const zodType = getZodTypeFromApiParamType(
          {
            t: "ref",
            id: "Pick",
            args: [
              { t: "ref", id: "User" }, // User는 references에 없음
              {
                t: "union",
                types: [
                  { t: "string-literal", value: "id" },
                  { t: "string-literal", value: "name" },
                ],
              },
            ],
          },
          {},
        );

        // Pick의 대상(User)이 없어서 unknown으로 fallback
        expectToPass(zodType, "anything");
        expectToPass(zodType, { any: "value" });
        expectToPass(zodType, [1, 2, 3]);
      });
    });

    test("처리되지 않는 타입 → z.unknown()", () => {
      const zodType = getZodTypeFromApiParamType(
        { t: "indexed-access", object: "string", index: "number" } as ApiParamType,
        {},
      );

      // 모두 unknown으로 fallback
      expectToPass(zodType, "anything");
      expectToPass(zodType, 123);
      expectToPass(zodType, { any: "value" });
    });

    test("상호 참조 (A↔B) → unknown fallback", () => {
      const references: Record<string, z.ZodObject> = {};

      // A는 B를 참조, B는 A를 참조
      const zodTypeA = getZodTypeFromApiParamType({ t: "ref", id: "B" }, references);
      references.A = zodTypeA as z.ZodObject;

      const zodTypeB = getZodTypeFromApiParamType({ t: "ref", id: "A" }, references);
      references.B = zodTypeB as z.ZodObject;

      // A와 B 모두 unknown으로 fallback
      expectToPass(zodTypeA, "anything");
      expectToPass(zodTypeB, 123);
      expectToPass(zodTypeA, { any: "value" });
      expectToPass(zodTypeB, { any: "value" });
    });

    test("Pick + 순환참조 → unknown fallback", () => {
      // User 타입이 Pick<User, "id" | "name">을 포함 (자기 자신 참조)
      const zodType = getZodTypeFromApiParamType(
        {
          t: "ref",
          id: "Pick",
          args: [
            { t: "ref", id: "User" }, // User는 아직 references에 없음
            {
              t: "union",
              types: [
                { t: "string-literal", value: "id" },
                { t: "string-literal", value: "name" },
              ],
            },
          ],
        },
        {},
      );

      // Pick의 대상(User)이 없어서 unknown으로 fallback
      expectToPass(zodType, "anything");
      expectToPass(zodType, { any: "value" });
    });
  });

  describe("getZodObjectFromApiParams", () => {
    test("빈 배열 → 빈 ZodObject", () => {
      const result = getZodObjectFromApiParams([]);
      // 빈 객체
      expectToPass(result, {});
    });

    test("optional 처리 - required 파라미터", () => {
      const apiParams: ApiParam[] = [{ name: "id", type: "number", optional: false }];
      const result = getZodObjectFromApiParams(apiParams);
      // id 제공
      expectToPass(result, { id: 123 });
      // id 누락 (required이므로 실패)
      expectToFail(result, {});
    });

    test("optional 처리 - optional 파라미터", () => {
      const apiParams: ApiParam[] = [{ name: "name", type: "string", optional: true }];
      const result = getZodObjectFromApiParams(apiParams);
      // 모든 필드 생략 가능
      expectToPass(result, {});
      // name 제공
      expectToPass(result, { name: "test" });
      // name 타입 오류
      expectToFail(result, { name: 123 });
    });

    test("여러 파라미터 묶기 (required + optional)", () => {
      const apiParams: ApiParam[] = [
        { name: "id", type: "number", optional: false },
        { name: "email", type: "string", optional: true },
      ];
      const result = getZodObjectFromApiParams(apiParams);
      // id 제공
      expectToPass(result, { id: 1 });
      // email 제공
      expectToPass(result, { id: 1, email: "test@example.com" });
      // email undefined 제공
      expectToPass(result, { id: 1, email: undefined });
      // id 누락 (required이므로 실패)
      expectToFail(result, {});
      // id 누락
      expectToFail(result, { email: "test@example.com" });
    });

    test("references 전달 확인", () => {
      const references = {
        User: z.object({ id: z.number() }),
      };
      const apiParams: ApiParam[] = [
        { name: "user", type: { t: "ref", id: "User" }, optional: false },
      ];
      const result = getZodObjectFromApiParams(apiParams, references);
      // user 제공
      expectToPass(result, { user: { id: 1 } });
      // user id 타입 오류
      expectToFail(result, { user: { id: "1" } });
      // user 누락
      expectToFail(result, {});
    });
  });

  describe("getZodObjectFromApi", () => {
    function expectApiToPass(api: ExtendedApi, validData: unknown, references = {}) {
      const zodObject = getZodObjectFromApi(api, references);
      expectToPass(zodObject, validData);
      return zodObject; // 추가 검증을 위해 반환
    }

    function expectApiToFail(api: ExtendedApi, invalidData: unknown, references = {}) {
      const zodObject = getZodObjectFromApi(api, references);
      expectToFail(zodObject, invalidData);
      return zodObject;
    }

    describe("typeParameters 처리", () => {
      test("constraint를 변환하여 references에 등록", async () => {
        const testApi = createTestApi({
          typeParameters: [
            { t: "type-param", id: "T", constraint: "number" },
            { t: "type-param", id: "U", constraint: "string" },
          ],
          parameters: [{ name: "id", type: "number", optional: false }],
        });
        const references: Record<string, z.ZodObject> = {};
        // 실제 파싱 검증
        expectApiToPass(testApi, { id: 123 }, references);
        // 타입 틀림 검증
        expectApiToFail(testApi, { id: "not-number" }, references);
        // 필수 파라미터 누락 검증
        expectApiToFail(testApi, {}, references);

        // references 등록 확인
        expect(Object.keys(references)).toEqual(["T", "U"]);
        expect(references.T?.def.type).toBe("number");
        expect(references.U?.def.type).toBe("string");
      });
    });

    describe("파라미터 필터링", () => {
      test("Context 파라미터 제외", async () => {
        const testApi = createTestApi({
          parameters: [
            { name: "ctx", type: { t: "ref", id: "Context" }, optional: false },
            { name: "id", type: "number", optional: false },
          ],
        });
        const zodObject = expectApiToPass(testApi, { id: 1 }); // 실제 파싱
        expect(Object.keys(zodObject.shape)).toEqual(["id"]); // ctx 제외 확인

        // z.object()는 기본적으로 추가 키를 허용하므로 ctx 있어도 통과
        expectApiToPass(testApi, { ctx: {}, id: 1 });
        // 누락 검증
        expectApiToFail(testApi, {});
        // 타입 틀림 검증
        expectApiToFail(testApi, { id: "string" });
      });

      test("RefKnex 파라미터 제외", async () => {
        const testApi = createTestApi({
          parameters: [
            { name: "knex", type: { t: "ref", id: "Knex" }, optional: false },
            { name: "name", type: "string", optional: false },
          ],
        });
        const zodObject = expectApiToPass(testApi, { name: "test" });
        expect(Object.keys(zodObject.shape)).toEqual(["name"]); // knex 제외됨

        // z.object()는 기본적으로 추가 키를 허용하므로 knex 있어도 통과
        expectApiToPass(testApi, { knex: {}, name: "test" });
        // 누락 검증
        expectApiToFail(testApi, {});
        // 타입 틀림 검증
        expectApiToFail(testApi, { name: 123 });
      });
      test("_로 시작하는 optional 파라미터 제외", async () => {
        const testApi = createTestApi({
          parameters: [
            { name: "id", type: "number", optional: false },
            { name: "_debug", type: "string", optional: true },
          ],
        });
        const zodObject = expectApiToPass(testApi, { id: 1 });
        expect(Object.keys(zodObject.shape)).toEqual(["id"]); // _debug 제외됨

        // z.object()는 기본적으로 추가 키를 허용하므로 _debug 있어도 통과
        expectApiToPass(testApi, { id: 1, _debug: "test" });
        // id 누락 검증
        expectApiToFail(testApi, {});
        // 타입 틀림 검증
        expectApiToFail(testApi, { id: "string" });
      });

      test("_로 시작해도 required면 포함", async () => {
        const testApi = createTestApi({
          parameters: [
            { name: "id", type: "number", optional: false },
            { name: "_internal", type: "string", optional: false },
          ],
        });
        const zodObject = expectApiToPass(testApi, { id: 1, _internal: "val" });
        expect(Object.keys(zodObject.shape)).toEqual(["id", "_internal"]); // _internal 포함됨

        // z.object()는 기본적으로 추가 키를 허용하므로 _internal 있어도 통과
        expectApiToPass(testApi, { id: 1, _internal: "val" });
        // _internal 누락 (required)
        expectApiToFail(testApi, { id: 1 });
        // 타입 틀림 검증
        expectApiToFail(testApi, { id: 1, _internal: 123 });
      });
    });
  });

  ///
  describe("apiParamTypeToTsType", () => {
    describe("Primitive 타입", () => {
      test.each([
        ["string", "string"],
        ["number", "number"],
        ["boolean", "boolean"],
        ["null", "null"],
        ["undefined", "undefined"],
        ["void", "void"],
        ["any", "any"],
        ["unknown", "unknown"],
      ])("%s → %s", (input, expected) => {
        const result = apiParamTypeToTsType(input as unknown as ApiParamType, []);
        expect(result).toBe(expected);
      });
    });

    describe("Literal 타입", () => {
      test.each([
        ["string-literal", { t: "string-literal", value: "test" }, '"test"'],
        ["numeric-literal", { t: "numeric-literal", value: 123 }, "123"],
      ])("%s", (_name, input, expected) => {
        const result = apiParamTypeToTsType(input as unknown as ApiParamType, []);
        expect(result).toBe(expected);
      });
    });

    describe("Object 타입", () => {
      test("object", () => {
        const result = apiParamTypeToTsType(
          {
            t: "object",
            props: [
              { name: "id", type: "number", optional: false },
              { name: "name", type: "string", optional: true },
            ],
          },
          [],
        );
        expect(result).toContain("{ ");
        expect(result).toContain("id: number");
        expect(result).toContain("name?: string");
        expect(result).toContain(" }");
      });
    });

    describe("Union/Intersection 타입", () => {
      test("union", () => {
        const result = apiParamTypeToTsType(
          {
            t: "union",
            types: ["string", "number"],
          },
          [],
        );
        expect(result).toBe("string | number");
      });

      test("intersection", () => {
        const result = apiParamTypeToTsType(
          {
            t: "intersection",
            types: ["string", "number"],
          },
          [],
        );
        expect(result).toBe("string & number");
      });
    });

    describe("Array 타입", () => {
      test("array", () => {
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: "string",
          },
          [],
        );
        expect(result).toBe("string[]");
      });

      test("nested array", () => {
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: {
              t: "array",
              elementsType: "number",
            },
          },
          [],
        );
        expect(result).toBe("number[][]");
      });
    });

    describe("Ref 타입 - importKeys 인젝션", () => {
      test("ref without args", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType({ t: "ref", id: "User" }, importKeys);
        expect(result).toBe("User");
        expect(importKeys).toContain("User");
      });

      test("ref with args", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType(
          {
            t: "ref",
            id: "Promise",
            args: ["string"],
          },
          importKeys,
        );
        expect(result).toBe("Promise<string>");
        expect(importKeys).not.toContain("Promise"); // Promise는 import 불필요
      });

      test("ref - built-in types (no import)", () => {
        const importKeys: string[] = [];
        ["Pick", "Omit", "Promise", "Partial", "Date"].forEach((id) => {
          apiParamTypeToTsType({ t: "ref", id }, importKeys);
        });
        expect(importKeys.length).toBe(0); // 모두 import 불필요
      });

      test("ref - custom types (with import)", () => {
        const importKeys: string[] = [];
        apiParamTypeToTsType({ t: "ref", id: "CustomType" }, importKeys);
        expect(importKeys).toContain("CustomType");
      });

      test("Promise with complex type", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType(
          {
            t: "ref",
            id: "Promise",
            args: [
              {
                t: "array",
                elementsType: { t: "ref", id: "User" },
              },
            ],
          },
          importKeys,
        );

        expect(result).toBe("Promise<User[]>");
        expect(importKeys).toContain("User"); // User는 custom 타입
        expect(importKeys).not.toContain("Promise"); // Promise는 built-in
      });

      test("중복 import - 같은 타입 여러 번", () => {
        const importKeys: string[] = [];

        apiParamTypeToTsType(
          {
            t: "intersection",
            types: [
              { t: "ref", id: "BaseEntity" },
              { t: "ref", id: "Timestamped" },
              { t: "ref", id: "BaseEntity" }, // 중복
            ],
          },
          importKeys,
        );

        // 현재 구현은 중복을 허용 (push만 함)
        expect(importKeys).toEqual(["BaseEntity", "Timestamped", "BaseEntity"]);

        // 중복 제거는 호출자가 해야 함 (Set 사용)
        expect(new Set(importKeys).size).toBe(2);
      });

      test("복잡한 중첩 - import 수집 확인", () => {
        const importKeys: string[] = [];

        // Object 안에 여러 ref 타입
        apiParamTypeToTsType(
          {
            t: "object",
            props: [
              {
                name: "user",
                type: { t: "ref", id: "UserSaveParams" },
                optional: false,
              },
              {
                name: "posts",
                type: {
                  t: "array",
                  elementsType: { t: "ref", id: "PostSaveParams" },
                },
                optional: true,
              },
              {
                name: "tags",
                type: {
                  t: "union",
                  types: [
                    { t: "ref", id: "TagA" },
                    { t: "ref", id: "TagB" },
                  ],
                },
                optional: true,
              },
            ],
          },
          importKeys,
        );

        // 모든 custom 타입이 수집되어야 함
        expect(importKeys).toContain("UserSaveParams");
        expect(importKeys).toContain("PostSaveParams");
        expect(importKeys).toContain("TagA");
        expect(importKeys).toContain("TagB");
        expect(importKeys.length).toBe(4);
      });
    });

    describe("IndexedAccess 타입", () => {
      test("indexed-access", () => {
        const result = apiParamTypeToTsType(
          {
            t: "indexed-access",
            object: { t: "ref", id: "User" },
            index: { t: "string-literal", value: "id" },
          },
          [],
        );
        expect(result).toBe('User["id"]');
      });
    });

    describe("TupleType", () => {
      test("tuple-type", () => {
        const result = apiParamTypeToTsType(
          {
            t: "tuple-type",
            elements: ["string", "number"],
          },
          [],
        );
        expect(result).toContain("[ ");
        expect(result).toContain("string");
        expect(result).toContain("number");
        expect(result).toContain(" ]");
      });
    });

    describe("TypeParam", () => {
      test("type-param without constraint", () => {
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
          },
          [],
        );
        expect(result).toBe("<T>");
      });

      test("type-param with constraint", () => {
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
            constraint: "string",
          },
          [],
        );
        expect(result).toBe("<T extends string>");
      });
    });

    describe("에러 케이스", () => {
      test("resolve 불가 타입", () => {
        const fakeParamType = { t: "unknown_type" } as unknown as ApiParamType;

        let errorMessage = "";
        try {
          apiParamTypeToTsType(fakeParamType, []);
        } catch (error) {
          errorMessage = (error as Error).message;
        }

        expect(errorMessage).toContain("resolve 불가 ApiParamType");
      });
    });
  });

  // describe("apiParamToTsCode", () => {
  //   test("빈 배열 → 빈 문자열", () => {
  //     const result = apiParamToTsCode([], []);
  //     expect(result).toBe("");
  //   });

  //   test("단일 required 파라미터", () => {
  //     const params: ApiParam[] = [{ name: "id", type: "number", optional: false }];
  //     const result = apiParamToTsCode(params, []);
  //     expect(result).toBe("id: number");
  //   });

  //   test("단일 optional 파라미터 (no default)", () => {
  //     const params: ApiParam[] = [{ name: "name", type: "string", optional: true }];
  //     const result = apiParamToTsCode(params, []);
  //     expect(result).toBe("name?: string");
  //   });

  //   test("optional with default", () => {
  //     const params: ApiParam[] = [
  //       { name: "limit", type: "number", optional: true, defaultDef: "10" },
  //     ];
  //     const result = apiParamToTsCode(params, []);
  //     expect(result).toBe("limit: number= 10");
  //   });

  //   test("required with default (edge case)", () => {
  //     const params: ApiParam[] = [
  //       { name: "page", type: "number", optional: false, defaultDef: "1" },
  //     ];
  //     const result = apiParamToTsCode(params, []);
  //     expect(result).toBe("page: number= 1");
  //   });

  //   test("다중 파라미터 (required + optional)", () => {
  //     const params: ApiParam[] = [
  //       { name: "id", type: "number", optional: false },
  //       { name: "name", type: "string", optional: true },
  //       { name: "limit", type: "number", optional: true, defaultDef: "10" },
  //     ];
  //     const result = apiParamToTsCode(params, []);
  //     expect(result).toBe("id: number, name?: string, limit: number= 10");
  //   });

  //   test("복잡한 타입 (object)", () => {
  //     const params: ApiParam[] = [
  //       {
  //         name: "data",
  //         type: {
  //           t: "object",
  //           props: [{ name: "id", type: "number", optional: false }],
  //         },
  //         optional: false,
  //       },
  //     ];
  //     const result = apiParamToTsCode(params, []);
  //     expect(result).toContain("data:");
  //     expect(result).toContain("{");
  //   });

  //   test("injectImportKeys 전달", () => {
  //     const importKeys: string[] = [];
  //     const params: ApiParam[] = [
  //       {
  //         name: "user",
  //         type: { t: "ref", id: "User" },
  //         optional: false,
  //       },
  //     ];
  //     apiParamToTsCode(params, importKeys);
  //     // apiParamTypeToTsType가 importKeys를 사용하므로 전달 확인
  //     expect(importKeys).toBeDefined();
  //   });
  // });

  // describe("apiParamToTsCodeAsObject", () => {
  //   test("빈 배열 → 빈 객체", () => {
  //     const result = apiParamToTsCodeAsObject([], []);
  //     expect(result).toBe("{  }");
  //   });

  //   test("단일 required 파라미터", () => {
  //     const params: ApiParam[] = [{ name: "id", type: "number", optional: false }];
  //     const result = apiParamToTsCodeAsObject(params, []);
  //     expect(result).toBe("{ id: number }");
  //   });

  //   test("단일 optional 파라미터", () => {
  //     const params: ApiParam[] = [{ name: "name", type: "string", optional: true }];
  //     const result = apiParamToTsCodeAsObject(params, []);
  //     expect(result).toBe("{ name?: string }");
  //   });

  //   test("optional with default", () => {
  //     const params: ApiParam[] = [
  //       { name: "limit", type: "number", optional: true, defaultDef: "10" },
  //     ];
  //     const result = apiParamToTsCodeAsObject(params, []);
  //     expect(result).toBe("{ limit?: number= 10 }");
  //   });

  //   test("다중 파라미터", () => {
  //     const params: ApiParam[] = [
  //       { name: "id", type: "number", optional: false },
  //       { name: "name", type: "string", optional: true },
  //       { name: "limit", type: "number", optional: true, defaultDef: "10" },
  //     ];
  //     const result = apiParamToTsCodeAsObject(params, []);
  //     expect(result).toBe("{ id: number, name?: string, limit?: number= 10 }");
  //   });

  //   test("apiParamToTsCode와 출력 형식 차이", () => {
  //     const params: ApiParam[] = [
  //       { name: "id", type: "number", optional: false },
  //       { name: "name", type: "string", optional: true },
  //     ];
  //     const resultNormal = apiParamToTsCode(params, []);
  //     const resultAsObject = apiParamToTsCodeAsObject(params, []);

  //     expect(resultNormal).toBe("id: number, name?: string");
  //     expect(resultAsObject).toBe("{ id: number, name?: string }");
  //     expect(resultAsObject).toContain("{");
  //     expect(resultAsObject).toContain("}");
  //   });

  //   test("injectImportKeys 전달", () => {
  //     const importKeys: string[] = [];
  //     const params: ApiParam[] = [
  //       {
  //         name: "user",
  //         type: { t: "ref", id: "User" },
  //         optional: false,
  //       },
  //     ];
  //     apiParamToTsCodeAsObject(params, importKeys);
  //     expect(importKeys).toBeDefined();
  //   });
  // });

  ///
  // describe.skip("propNodeToZodTypeDef", () => {
  //   test("plain 노드 (integer)", async () => {
  //     const propNode: EntityPropNode = {
  //       nodeType: "plain",
  //       prop: { name: "id", type: "integer" } as EntityProp,
  //     };
  //     const result = propNodeToZodTypeDef(propNode, []);
  //     expect(result).toContain("id:");
  //     expect(result).toContain("z.int()");
  //   });
  //   test("array (with prop)", async () => {
  //     const propNode: EntityPropNode = {
  //       nodeType: "array",
  //       prop: { name: "items" } as EntityProp,
  //       children: [],
  //     };
  //     const result = propNodeToZodTypeDef(propNode, []);
  //     expect(result).toMatch(/^items:/); // "items:"로 시작
  //     expect(result).toContain("z.array(z.object({");
  //     expect(result).toContain("})),");
  //   });
  //   test("array 노드 (without prop)", () => {
  //     const propNode: EntityPropNode = {
  //       nodeType: "array",
  //       prop: undefined,
  //       children: [],
  //     };
  //     const result = propNodeToZodTypeDef(propNode, []);
  //     expect(result).not.toMatch(/^\w+:/); // 시작 부분에 "name:" 없음
  //     expect(result).toContain("z.array(z.object({");
  //     expect(result).toContain("})),");
  //   });
  //   test("object 노드 with nullable", () => {
  //     const propNode: EntityPropNode = {
  //       nodeType: "object",
  //       prop: { name: "profile", nullable: true } as EntityProp,
  //       children: [],
  //     };
  //     const result = propNodeToZodTypeDef(propNode, []);
  //     const normalized = result.replace(/\s+/g, ""); // 모든 공백/줄바꿈 제거
  //     expect(normalized).toContain("profile:z.object({");
  //     expect(normalized).toContain("}).nullable(),");
  //   });
  //   test("object 노드 without nullable", () => {
  //     const propNode: EntityPropNode = {
  //       nodeType: "object",
  //       prop: { name: "user", nullable: false } as EntityProp,
  //       children: [],
  //     };
  //     const result = propNodeToZodTypeDef(propNode, []);
  //     const normalized = result.replace(/\s+/g, ""); // 모든 공백/줄바꿈 제거
  //     expect(normalized).toContain("user:z.object({");
  //     expect(normalized).not.toContain(".nullable()");
  //     expect(normalized).toContain("}),"); // nullable 없이 })로 끝남
  //   });
  //   test("중첩 구조 (object in array)", () => {
  //     const propNode: EntityPropNode = {
  //       nodeType: "array",
  //       prop: { name: "users" } as EntityProp,
  //       children: [
  //         {
  //           nodeType: "object",
  //           prop: { name: "profile" } as EntityProp,
  //           children: [],
  //         },
  //       ],
  //     };
  //     const result = propNodeToZodTypeDef(propNode, []);
  //     const normalized = result.replace(/\s+/g, ""); // 모든 공백/줄바꿈 제거
  //     expect(normalized).toContain("users:z.array(z.object({");
  //     expect(normalized).toContain("profile:z.object({");
  //   });
  //   test("injectImportKeys 전달", () => {
  //     const importKeys: string[] = [];
  //     const propNode: EntityPropNode = {
  //       nodeType: "plain",
  //       prop: { name: "status", type: "enum" } as EntityProp, // enum은 import 필요
  //     };
  //     propNodeToZodTypeDef(propNode, importKeys);
  //     expect(importKeys.length).toBeGreaterThan(0);
  //   });
  // });
  // describe.skip("propToZodTypeDef", () => {
  //   test("출력 형식 - 기본 (쉼표로 끝남)", () => {
  //     const prop = { name: "id", type: "integer" } as EntityProp;
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toMatch(/,$/); // 쉼표로 끝남
  //     expect(result).toContain("id:");
  //   });

  //   test("출력 형식 - unable to resolve", () => {
  //     const prop = { name: "unknown", relationType: "unknown" } as unknown as RelationProp;
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toBe("// unable to resolve");
  //   });

  //   test("출력 형식 - prop name 포함", () => {
  //     const prop = { name: "testField", type: "integer" } as unknown as EntityProp;
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toContain("testField:");
  //   });

  //   test("injectImportKeys - enum prop", () => {
  //     const importKeys: string[] = [];
  //     const prop: EntityProp = {
  //       name: "status",
  //       type: "enum",
  //       length: 50,
  //       id: "StatusEnum",
  //       nullable: false,
  //     };
  //     const result = propToZodTypeDef(prop, importKeys);

  //     // enum은 import가 필요하므로 importKeys에 추가됨
  //     expect(importKeys).toContain("StatusEnum");
  //     expect(importKeys.length).toBe(1);

  //     // 출력 형식 검증
  //     expect(result).toContain("status:");
  //     expect(result).toContain("StatusEnum");
  //     expect(result).toMatch(/,$/);
  //   });
  //   test("modifier - unsigned", () => {
  //     const prop: EntityProp = {
  //       name: "age",
  //       type: "integer",
  //       unsigned: true,
  //       nullable: false,
  //     };
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toContain(".nonnegative()");
  //   });

  //   test("modifier - nullable", () => {
  //     const prop: EntityProp = {
  //       name: "email",
  //       type: "string",
  //       length: 255,
  //       nullable: true,
  //     };
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toContain(".nullable()");
  //   });

  //   test("modifier - unsigned + nullable 조합", () => {
  //     const prop: EntityProp = {
  //       name: "count",
  //       type: "integer",
  //       unsigned: true,
  //       nullable: true,
  //     };
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toContain(".nonnegative()");
  //     expect(result).toContain(".nullable()");
  //   });

  //   test("relation prop - 주석 처리 (HasMany)", () => {
  //     const prop: HasManyRelationProp = {
  //       name: "posts",
  //       type: "relation",
  //       relationType: "HasMany",
  //       with: "Post",
  //       nullable: false,
  //       joinColumn: "post_id",
  //     };
  //     const result = propToZodTypeDef(prop, []);
  //     expect(result).toMatch(/^\/\//); // 주석으로 시작
  //     expect(result).toContain("posts:");
  //     expect(result).toContain("HasMany");
  //     expect(result).toContain("Post");
  //   });
  // });
  // describe.skip("zodTypeToZodCode", () => {
  //   describe("Primitive 타입", () => {
  //     test("string", () => {
  //       const zodType = z.string();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.string()");
  //     });

  //     test("number", () => {
  //       const zodType = z.number();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.number()");
  //     });

  //     test("bigint", () => {
  //       const zodType = z.bigint();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.bigint()");
  //     });

  //     test("boolean", () => {
  //       const zodType = z.boolean();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.boolean()");
  //     });

  //     test("date", () => {
  //       const zodType = z.date();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.date()");
  //     });
  //   });

  //   describe("Special 타입", () => {
  //     test("null", () => {
  //       const zodType = z.null();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.null()");
  //     });

  //     test("undefined", () => {
  //       const zodType = z.undefined();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.undefined()");
  //     });

  //     test("any", () => {
  //       const zodType = z.any();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.any()");
  //     });

  //     test("unknown", () => {
  //       const zodType = z.unknown();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.unknown()");
  //     });

  //     test("never", () => {
  //       const zodType = z.never();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.never()");
  //     });
  //   });

  //   describe("Modifier 타입", () => {
  //     test("nullable", () => {
  //       const zodType = z.string().nullable();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.string().nullable()");
  //     });

  //     test("optional", () => {
  //       const zodType = z.string().optional();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.string().optional()");
  //     });

  //     test("default", () => {
  //       const zodType = z.string().default("test");
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.string().default(test)");
  //     });
  //   });

  //   describe("Literal 타입", () => {
  //     test("string literal", () => {
  //       const zodType = z.literal("test");
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe('z.literal("test")');
  //     });

  //     test("number literal", () => {
  //       const zodType = z.literal(123);
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.literal(123)");
  //     });

  //     test("null literal", () => {
  //       const zodType = z.literal(null);
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.literal(null)");
  //     });
  //   });

  //   describe("Complex 타입", () => {
  //     test("array", () => {
  //       const zodType = z.array(z.string());
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.array(z.string())");
  //     });

  //     test("object", () => {
  //       const zodType = z.object({
  //         id: z.number(),
  //         name: z.string(),
  //       });
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toContain("z.object({");
  //       expect(result).toContain("id: z.number(),");
  //       expect(result).toContain("name: z.string(),");
  //       expect(result).toContain("})");
  //     });

  //     test("union", () => {
  //       const zodType = z.union([z.string(), z.number()]);
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.union([z.string(),z.number()])");
  //     });

  //     test("record", () => {
  //       const zodType = z.record(z.string(), z.number());
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.record(z.string(), z.number())");
  //     });

  //     test("intersection", () => {
  //       const zodType = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }));
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toContain("z.intersection(");
  //       expect(result).toContain("z.object({");
  //     });
  //   });

  //   describe("중첩 구조", () => {
  //     test("nested object", () => {
  //       const zodType = z.object({
  //         user: z.object({
  //           id: z.number(),
  //         }),
  //       });
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toContain("user: z.object({");
  //       expect(result).toContain("id: z.number(),");
  //     });

  //     test("array of objects", () => {
  //       const zodType = z.array(z.object({ id: z.number() }));
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toContain("z.array(z.object({");
  //     });

  //     test("nullable optional", () => {
  //       const zodType = z.string().nullable().optional();
  //       const result = zodTypeToZodCode(zodType);
  //       expect(result).toBe("z.string().nullable().optional()");
  //     });
  //   });

  //   describe("에러 케이스", () => {
  //     test("처리되지 않은 타입", () => {
  //       const fakeZodType = {
  //         def: {
  //           type: "nonexistent_type" as z.ZodType["def"]["type"],
  //         },
  //       } as unknown as z.ZodType<unknown>;

  //       try {
  //         zodTypeToZodCode(fakeZodType);
  //         // 에러가 안 나면 테스트 실패
  //         expect(true).toBe(false);
  //       } catch (error) {
  //         expect(error).toBeInstanceOf(Error);
  //       }
  //     });
  //   });
  // });

  ///
  // describe("getTextTypeLength", () => {
  //   test("text → 65535 (64KB - 1)", () => {
  //     const result = getTextTypeLength("text");
  //     expect(result).toBe(65535);
  //     expect(result).toBe(1024 * 64 - 1);
  //   });

  //   test("mediumtext → 16777215 (16MB - 1)", () => {
  //     const result = getTextTypeLength("mediumtext");
  //     expect(result).toBe(16777215);
  //     expect(result).toBe(1024 * 1024 * 16 - 1);
  //   });

  //   test("longtext → 4294967295 (4GB - 1)", () => {
  //     const result = getTextTypeLength("longtext");
  //     expect(result).toBe(4294967295);
  //     expect(result).toBe(1024 * 1024 * 1024 * 4 - 1);
  //   });
  // });
  // describe("unwrapPromiseOnce", () => {
  //   test("Promise 타입 → args[0] 반환", () => {
  //     const promiseType: ApiParamType = {
  //       t: "ref",
  //       id: "Promise",
  //       args: ["string"],
  //     };
  //     const result = unwrapPromiseOnce(promiseType);
  //     expect(result).toBe("string");
  //   });

  //   test("중첩 Promise → 한 번만 언래핑", () => {
  //     const nestedPromise: ApiParamType = {
  //       t: "ref",
  //       id: "Promise",
  //       args: [
  //         {
  //           t: "ref",
  //           id: "Promise",
  //           args: ["number"],
  //         },
  //       ],
  //     };
  //     const result = unwrapPromiseOnce(nestedPromise);
  //     expect(result).toEqual({
  //       t: "ref",
  //       id: "Promise",
  //       args: ["number"],
  //     });
  //   });

  //   test("Promise<object> → object 반환", () => {
  //     const promiseType: ApiParamType = {
  //       t: "ref",
  //       id: "Promise",
  //       args: [
  //         {
  //           t: "object",
  //           props: [{ name: "id", type: "number", optional: false }],
  //         },
  //       ],
  //     };
  //     const result = unwrapPromiseOnce(promiseType);
  //     expect(result).toEqual({
  //       t: "object",
  //       props: [{ name: "id", type: "number", optional: false }],
  //     });
  //   });

  //   test("non-Promise 타입 → 그대로 반환", () => {
  //     const stringType: ApiParamType = "string";
  //     const result = unwrapPromiseOnce(stringType);
  //     expect(result).toBe("string");
  //   });

  //   test("non-Promise ref → 그대로 반환", () => {
  //     const userType: ApiParamType = {
  //       t: "ref",
  //       id: "User",
  //     };
  //     const result = unwrapPromiseOnce(userType);
  //     expect(result).toEqual({
  //       t: "ref",
  //       id: "User",
  //     });
  //   });

  //   test("Promise without args → undefined 반환", () => {
  //     const promiseType: ApiParamType = {
  //       t: "ref",
  //       id: "Promise",
  //     };
  //     const result = unwrapPromiseOnce(promiseType);
  //     expect(result).toBeUndefined();
  //   });
  // });
});
