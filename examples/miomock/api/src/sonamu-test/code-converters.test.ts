import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

import {
  apiParamToTsCode,
  apiParamToTsCodeAsObject,
  apiParamTypeToTsType,
  getZodObjectFromApi,
  getZodObjectFromApiParams,
  getZodTypeFromApiParamType,
  unwrapPromiseOnce,
} from "../../../../../modules/sonamu/dist/api/code-converters";
import {
  type ApiDecoratorOptions,
  type ExtendedApi,
} from "../../../../../modules/sonamu/dist/api/decorators";
import { type ApiParam, type ApiParamType } from "../../../../../modules/sonamu/dist/types/types";

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
    options,
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

function expectToPass<T>(zodType: z.ZodType, validData: T) {
  const result = zodType.safeParse(validData);
  expect(result.success).toBe(true);
}

function expectToFail<T>(zodType: z.ZodType, invalidData: T) {
  const result = zodType.safeParse(invalidData);
  expect(result.success).toBe(false);
}

describe("code-converters", () => {
  describe("getZodTypeFromApiParamType", () => {
    describe("Primitive 타입", () => {
      const primitiveCases: [ApiParamType, unknown, unknown][] = [
        ["string", "test", 123],
        ["number", 123, "test"],
        ["boolean", true, "true"],
      ];

      test.each(primitiveCases)("%s 타입", (type, validValue, invalidValue) => {
        const zodType = getZodTypeFromApiParamType(type, {});

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

      test("array의 elements가 object인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: {
              t: "object",
              props: [
                { name: "id", type: "number", optional: false },
                { name: "name", type: "string", optional: false },
              ],
            },
          },
          [],
        );
        expect(result).toContain("{ id: number");
        expect(result).toContain("name: string");
        expect(result).toContain("}[]");
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

      test("tuple의 elements가 object인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "tuple-type",
            elements: [
              "string",
              { t: "array", elementsType: "number" },
              { t: "object", props: [{ name: "id", type: "number", optional: false }] },
            ],
          },
          [],
        );
        expect(result).toContain("string");
        expect(result).toContain("number[]");
        expect(result).toContain("{ id: number }");
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
        { t: "indexed-access", object: "string", index: "number" },
        {},
      );

      // 모두 unknown으로 fallback
      expectToPass(zodType, "anything");
      expectToPass(zodType, 123);
      expectToPass(zodType, { any: "value" });
    });

    test("상호 참조 (A↔B) → unknown fallback", () => {
      const references: Record<string, z.ZodType> = {};

      // A는 B를 참조, B는 A를 참조
      const zodTypeA = getZodTypeFromApiParamType({ t: "ref", id: "B" }, references);
      references.A = zodTypeA;

      const zodTypeB = getZodTypeFromApiParamType({ t: "ref", id: "A" }, references);
      references.B = zodTypeB;

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
    function expectApiToPass<T>(api: ExtendedApi, validData: T, references = {}) {
      const zodObject = getZodObjectFromApi(api, references);
      expectToPass(zodObject, validData);
      return zodObject; // 추가 검증을 위해 반환
    }

    function expectApiToFail<T>(api: ExtendedApi, invalidData: T, references = {}) {
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
        expect(zodObject.keyof().options).toEqual(["id"]); // ctx 제외 확인

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
        expect(zodObject.keyof().options).toEqual(["name"]); // knex 제외됨

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
        expect(zodObject.keyof().options).toEqual(["id"]); // _debug 제외됨

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
        expect(zodObject.keyof().options).toEqual(["id", "_internal"]); // _internal 포함됨

        // z.object()는 기본적으로 추가 키를 허용하므로 _internal 있어도 통과
        expectApiToPass(testApi, { id: 1, _internal: "val" });
        // _internal 누락 (required)
        expectApiToFail(testApi, { id: 1 });
        // 타입 틀림 검증
        expectApiToFail(testApi, { id: 1, _internal: 123 });
      });
    });
  });

  describe("apiParamTypeToTsType", () => {
    describe("Primitive 타입", () => {
      const primitiveCases: Array<[ApiParamType, string]> = [
        // [ 입력값, 기대값 ] 형식으로 테스트 케이스 정의
        ["string", "string"],
        ["number", "number"],
        ["boolean", "boolean"],
        ["true", "true"],
        ["false", "false"],
        ["null", "null"],
        ["undefined", "undefined"],
        ["void", "void"],
        ["any", "any"],
        ["unknown", "unknown"],
      ];
      test.each(primitiveCases)("%s → %s", (input, expected) => {
        const result = apiParamTypeToTsType(input, []);
        expect(result).toBe(expected);
      });
    });

    describe("Literal 타입", () => {
      const literalCases: [string, ApiParamType, string][] = [
        // [ 입력값, {입력 객체}, 기대값 ]
        ["string-literal", { t: "string-literal", value: "test" }, '"test"'],
        ["numeric-literal", { t: "numeric-literal", value: 123 }, "123"],
      ];

      test.each(literalCases)("%s", (_name, input, expected) => {
        const result = apiParamTypeToTsType(input, []);
        expect(result).toBe(expected);
      });
    });

    describe("Object 타입", () => {
      test("object 타입", () => {
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
        // optional 확인
        expect(result).toContain("name?: string");
        expect(result).toContain(" }");
      });

      test("object 안에 object가 있는 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "object",
            props: [
              { name: "id", type: "number", optional: false },
              {
                name: "profile",
                type: {
                  t: "object",
                  props: [
                    { name: "nickname", type: "string", optional: false },
                    { name: "avatar", type: "string", optional: true },
                  ],
                },
                optional: false,
              },
            ],
          },
          [],
        );
        expect(result).toContain("profile:");
        expect(result).toContain("nickname: string");
        // optional 확인
        expect(result).toContain("avatar?: string");
      });
    });

    describe("Union/Intersection 타입 - elements가 object, array 등인 경우", () => {
      test("union 타입", () => {
        const result = apiParamTypeToTsType(
          {
            t: "union",
            types: ["string", "number"],
          },
          [],
        );
        expect(result).toBe("string | number");
      });

      test("union 타입의 elements가 object인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "union",
            types: [
              "string",
              { t: "array", elementsType: "number" },
              { t: "object", props: [{ name: "id", type: "number", optional: false }] },
            ],
          },
          [],
        );
        expect(result).toContain("string");
        expect(result).toContain("number[]");
        expect(result).toContain("{ id: number }");
        expect(result).toContain(" | ");
      });

      test("intersection 타입", () => {
        const result = apiParamTypeToTsType(
          {
            t: "intersection",
            types: ["string", "number"],
          },
          [],
        );
        expect(result).toBe("string & number");
      });

      test("intersection 타입의 elements가 object인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "intersection",
            types: [
              { t: "object", props: [{ name: "id", type: "number", optional: false }] },
              { t: "object", props: [{ name: "name", type: "string", optional: false }] },
            ],
          },
          [],
        );
        expect(result).toContain("{ id: number }");
        expect(result).toContain("{ name: string }");
        expect(result).toContain(" & ");
      });
    });

    describe("Array 타입", () => {
      test("array 타입", () => {
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: "string",
          },
          [],
        );
        expect(result).toBe("string[]");
      });

      test("array 타입의 elements가 array인 경우", () => {
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

      test("array 타입의 elements가 intersection인 경우 - 괄호 필요", () => {
        // (A & B)[] 형태 - intersection이 배열 요소일 때 괄호 필요
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: {
              t: "intersection",
              types: [
                { t: "ref", id: "UserSubsetMapping" },
                { t: "object", props: [{ name: "similarity", type: "number", optional: false }] },
              ],
            },
          },
          [],
        );
        // 괄호가 있어야 (A & B)[]로 파싱됨
        // 괄호가 없으면 A & B[]로 파싱되어 A & (B[])가 됨
        expect(result).toBe("(UserSubsetMapping & { similarity: number })[]");
      });

      test("array 타입의 elements가 union인 경우 - 괄호 필요", () => {
        // (A | B)[] 형태 - union이 배열 요소일 때 괄호 필요
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: {
              t: "union",
              types: ["string", "number"],
            },
          },
          [],
        );
        // 괄호가 있어야 (string | number)[]로 파싱됨
        // 괄호가 없으면 string | number[]로 파싱되어 string | (number[])가 됨
        expect(result).toBe("(string | number)[]");
      });

      test("복잡한 케이스: 배열 안 intersection 안 ref with args", () => {
        // 실제 발생한 버그 케이스: (QAPairSubsetMapping[T] & { similarity: number })[]
        const result = apiParamTypeToTsType(
          {
            t: "array",
            elementsType: {
              t: "intersection",
              types: [
                {
                  t: "indexed-access",
                  object: { t: "ref", id: "QAPairSubsetMapping" },
                  index: { t: "ref", id: "T" },
                },
                { t: "object", props: [{ name: "similarity", type: "number", optional: false }] },
              ],
            },
          },
          [],
        );
        expect(result).toBe("(QAPairSubsetMapping[T] & { similarity: number })[]");
      });
    });

    describe("Ref 타입", () => {
      test("ref 타입 (args가 없는 경우)", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType({ t: "ref", id: "User" }, importKeys);
        expect(result).toBe("User");
        expect(importKeys).toContain("User");
      });

      test("ref 타입 (args가 있는 경우)", () => {
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

      test("ref 타입 (TS built-in types)", () => {
        const importKeys: string[] = [];
        ["Pick", "Omit", "Promise", "Partial", "Date"].forEach((id) => {
          apiParamTypeToTsType({ t: "ref", id }, importKeys);
        });
        expect(importKeys.length).toBe(0); // 모두 import 불필요
      });

      test("TS built-in 타입의 args에서 custom 타입 import 수집 - Pick", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType(
          {
            t: "ref",
            id: "Pick",
            args: [
              { t: "ref", id: "User" },
              { t: "string-literal", value: "id" },
            ],
          },
          importKeys,
        );

        expect(result).toBe('Pick<User,"id">');
        expect(importKeys).toContain("User"); // User는 import 해야 함
        expect(importKeys).not.toContain("Pick"); // Pick은 TS built-in
        expect(importKeys.length).toBe(1);
      });

      test("TS built-in 타입의 args에서 custom 타입 import 수집 - Omit", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType(
          {
            t: "ref",
            id: "Omit",
            args: [
              { t: "ref", id: "UserSaveParams" },
              { t: "string-literal", value: "password" },
            ],
          },
          importKeys,
        );

        expect(result).toBe('Omit<UserSaveParams,"password">');
        expect(importKeys).toContain("UserSaveParams");
        expect(importKeys).not.toContain("Omit");
      });

      test("ref 타입 (custom types)", () => {
        const importKeys: string[] = [];
        apiParamTypeToTsType(
          {
            t: "ref",
            id: "CustomType",
          },
          importKeys,
        );
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
        expect(importKeys).not.toContain("Promise"); // Promise는 TS built-in
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

      test("tuple의 elements가 object인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "tuple-type",
            elements: [
              "string",
              { t: "array", elementsType: "number" },
              { t: "object", props: [{ name: "id", type: "number", optional: false }] },
            ],
          },
          [],
        );
        expect(result).toContain("string");
        expect(result).toContain("number[]");
        expect(result).toContain("{ id: number }");
      });
    });

    describe("TypeParam", () => {
      test("type-param의 constraint가 없는 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
          },
          [],
        );
        expect(result).toBe("T");
      });

      test("type-param의 constraint가 string인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
            constraint: "string",
          },
          [],
        );
        expect(result).toBe("T extends string");
      });

      test("type-param의 constraint가 union/object인 경우", () => {
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
            constraint: {
              t: "object",
              props: [
                { name: "id", type: "number", optional: false },
                { name: "name", type: "string", optional: false },
              ],
            },
          },
          [],
        );
        expect(result).toContain("T extends {");
        expect(result).toContain("id: number");
        expect(result).toContain("name: string");
      });

      test("type-param의 constraint가 ref인 경우 - importKeys 수집", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
            constraint: { t: "ref", id: "BaseEntity" },
          },
          importKeys,
        );
        expect(result).toBe("T extends BaseEntity");
        expect(importKeys).toContain("BaseEntity");
      });

      test("type-param의 constraint가 ref[] 배열인 경우 - importKeys 수집", () => {
        const importKeys: string[] = [];
        const result = apiParamTypeToTsType(
          {
            t: "type-param",
            id: "T",
            constraint: {
              t: "array",
              elementsType: { t: "ref", id: "PracticeModel" },
            },
          },
          importKeys,
        );
        expect(result).toBe("T extends PracticeModel[]");
        expect(importKeys).toContain("PracticeModel");
      });
    });

    describe("에러 케이스", () => {
      test("resolve 불가 타입", () => {
        const fakeParamType = { t: "unknown_type" };

        let errorMessage = "";
        try {
          apiParamTypeToTsType(fakeParamType, []);
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }

        expect(errorMessage).toContain("resolve 불가 ApiParamType");
      });
    });
  });

  describe("apiParamToTsCode", () => {
    // injectImportKeys가 있을 경우는 apiParamTypeToTsType 테스트에서 확인하실 수 있습니다.
    test("빈 배열 → 빈 문자열", () => {
      const result = apiParamToTsCode([], []);
      expect(result).toBe("");
    });

    test("단일 required 파라미터", () => {
      const result = apiParamToTsCode([{ name: "id", type: "number", optional: false }], []);
      expect(result).toBe("id: number");
    });

    test("단일 optional 파라미터 (defaultDef 없음) → ?", () => {
      const result = apiParamToTsCode([{ name: "name", type: "string", optional: true }], []);
      expect(result).toBe("name?: string");
    });

    test("단일 optional 파라미터 (defaultDef 있음) → ? 없음", () => {
      const result = apiParamToTsCode(
        [{ name: "page", type: "number", optional: true, defaultDef: "1" }],
        [],
      );
      expect(result).toBe("page: number= 1");
    });

    test("required 파라미터 (defaultDef 있음)", () => {
      const result = apiParamToTsCode(
        [{ name: "limit", type: "number", optional: false, defaultDef: "10" }],
        [],
      );
      expect(result).toBe("limit: number= 10");
    });

    test("여러 파라미터 연결", () => {
      const result = apiParamToTsCode(
        [
          { name: "id", type: "number", optional: false },
          { name: "name", type: "string", optional: true },
          { name: "page", type: "number", optional: true, defaultDef: "1" },
        ],
        [],
      );
      expect(result).toBe("id: number, name?: string, page: number= 1");
    });
  });

  describe("apiParamToTsCodeAsObject", () => {
    test("빈 배열 → 빈 객체", () => {
      const result = apiParamToTsCodeAsObject([], []);
      expect(result).toBe("{  }");
    });

    test("단일 required 파라미터", () => {
      const result = apiParamToTsCodeAsObject(
        [{ name: "id", type: "number", optional: false }],
        [],
      );
      expect(result).toBe("{ id: number }");
    });

    test("단일 optional 파라미터", () => {
      const result = apiParamToTsCodeAsObject(
        [{ name: "name", type: "string", optional: true }],
        [],
      );
      expect(result).toBe("{ name?: string }");
    });

    test("optional + defaultDef → ?도 붙고 = 도 붙음", () => {
      const result = apiParamToTsCodeAsObject(
        [{ name: "page", type: "number", optional: true, defaultDef: "1" }],
        [],
      );
      expect(result).toBe("{ page?: number= 1 }");
    });

    test("required + defaultDef", () => {
      const result = apiParamToTsCodeAsObject(
        [{ name: "limit", type: "number", optional: false, defaultDef: "10" }],
        [],
      );
      expect(result).toBe("{ limit: number= 10 }");
    });

    test("여러 파라미터 연결", () => {
      const result = apiParamToTsCodeAsObject(
        [
          { name: "id", type: "number", optional: false },
          { name: "name", type: "string", optional: true },
        ],
        [],
      );
      expect(result).toBe("{ id: number, name?: string }");
    });
  });

  describe("unwrapPromiseOnce", () => {
    test("Promise 타입 → 내부 타입 추출", () => {
      const promiseType: ApiParamType = {
        t: "ref",
        id: "Promise",
        args: ["string"],
      };
      const result = unwrapPromiseOnce(promiseType);
      expect(result).toBe("string");
    });

    test("Promise가 아닌 타입 → 그대로 반환", () => {
      const plainType: ApiParamType = "number";
      const result = unwrapPromiseOnce(plainType);
      expect(result).toBe("number");
    });
  });
});
