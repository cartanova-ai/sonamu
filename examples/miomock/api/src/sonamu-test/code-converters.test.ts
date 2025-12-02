import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
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
    });

    describe("Unknown fallback", () => {
      test("처리되지 않는 타입 → z.unknown()", () => {
        const zodType = getZodTypeFromApiParamType(
          { t: "indexed-access", object: "string", index: "number" } as ApiParamType,
          {},
        );

        // unknown은 모든 값 허용
        expectToPass(zodType, "anything");
        expectToPass(zodType, 123);
        expectToPass(zodType, { any: "value" });
      });
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
    describe("기본 API", () => {
      test("string 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: "string",
              optional: true,
            },
          ],
        });
        const zodObject = getZodObjectFromApi(testApi, {});
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("number 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: "number",
              optional: true,
            },
          ],
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("boolean 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: "boolean",
              optional: true,
            },
          ],
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("array 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "array",
                elementsType: "string",
              },
              optional: true,
            },
          ],
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });
    });

    describe("Generic 타입 파라미터", () => {
      test("Generic Number", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: "number",
            },
          ],
          parameters: [
            {
              name: "param",
              type: "number",
              optional: false,
            },
          ],
          returnType: {
            t: "array",
            elementsType: {
              t: "ref",
              id: "Promise",
              args: [{ t: "ref", id: "number[]" }],
            },
          },
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Generic Number의 배열, String의 배열", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: {
                t: "array",
                elementsType: "number",
              },
            },
            {
              t: "type-param",
              id: "U",
              constraint: {
                t: "array",
                elementsType: "string",
              },
            },
          ],
          parameters: [
            {
              name: "param",
              type: {
                t: "array",
                elementsType: "string",
              },
              optional: false,
            },
            {
              name: "param2",
              type: {
                t: "array",
                elementsType: "number",
              },
              optional: true,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [
              { t: "ref", id: "Promise", args: [{ t: "ref", id: "string[]" }] },
              { t: "ref", id: "Promise", args: [{ t: "ref", id: "number[]" }] },
            ],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Generic Object", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "param",
              type: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "object" }] }],
          },
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Generic Union", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: {
                t: "union",
                types: [
                  {
                    t: "string-literal",
                    value: "a",
                  },
                  {
                    t: "string-literal",
                    value: "b",
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "param",
              type: {
                t: "union",
                types: [
                  {
                    t: "string-literal",
                    value: "a",
                  },
                  {
                    t: "string-literal",
                    value: "b",
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "enum" }] }],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Generic Intersection", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: {
                t: "intersection",
                types: [
                  {
                    t: "string-literal",
                    value: "a",
                  },
                  {
                    t: "string-literal",
                    value: "b",
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "param",
              type: {
                t: "intersection",
                types: [
                  {
                    t: "string-literal",
                    value: "a",
                  },
                  {
                    t: "string-literal",
                    value: "b",
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "intersection" }] }],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Generic Tuple", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: {
                t: "tuple-type",
                elements: [
                  {
                    t: "string-literal",
                    value: "string",
                  },
                  {
                    t: "numeric-literal",
                    value: 1,
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "param",
              type: {
                t: "tuple-type",
                elements: [
                  {
                    t: "string-literal",
                    value: "string",
                  },
                  {
                    t: "numeric-literal",
                    value: 1,
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "tuple" }] }],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });
    });

    describe("Edge Cases", () => {
      test("파라미터가 없는 API", async () => {
        const testApi = createTestApi();
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("_로 시작하는 optional 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
              optional: true,
            },
          ],
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Context, RefKnex 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "context",
              type: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      // Pick<Omit<Object, "password">, "id" | "name"> 형태의 중첩
      test("중첩된 Pick/Omit 처리", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "nestedParam",
              type: {
                t: "ref",
                id: "Pick",
                args: [
                  {
                    t: "ref",
                    id: "Omit",
                    args: [
                      {
                        t: "object",
                        props: [
                          {
                            name: "id",
                            type: "number",
                            optional: false,
                          },
                          {
                            name: "name",
                            type: "string",
                            optional: false,
                          },
                          {
                            name: "password",
                            type: "string",
                            optional: false,
                          },
                          {
                            name: "email",
                            type: "string",
                            optional: false,
                          },
                        ],
                      },
                      {
                        t: "string-literal",
                        value: "password",
                      },
                    ],
                  },
                  {
                    t: "union",
                    types: [
                      {
                        t: "string-literal",
                        value: "id",
                      },
                      {
                        t: "string-literal",
                        value: "name",
                      },
                    ],
                  },
                ],
              },
              optional: false,
            },
          ],
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Partial 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
              optional: true,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [
              {
                t: "ref",
                id: "Promise",
                args: [
                  {
                    t: "ref",
                    id: "Partial",
                    args: [{ t: "ref", id: "object" }],
                  },
                  {
                    t: "string-literal",
                    value: "id",
                  },
                  {
                    t: "string-literal",
                    value: "name",
                  },
                  {
                    t: "string-literal",
                    value: "age",
                  },
                ],
              },
            ],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Omit 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [
              {
                t: "ref",
                id: "Promise",
                args: [{ t: "ref", id: "Omit", args: [{ t: "ref", id: "object" }] }],
              },
            ],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Pick 파라미터", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [
              {
                t: "ref",
                id: "Promise",
                args: [{ t: "ref", id: "Pick", args: [{ t: "ref", id: "object" }] }],
              },
            ],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("Date 타입 처리", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "ref",
                id: "Date",
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Date" }],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("nullable union 타입 (Type | null) 처리", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "union",
                types: [
                  {
                    t: "string-literal",
                    value: "string-literal",
                  },
                  {
                    t: "ref",
                    id: "null",
                  },
                ],
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "string" }] }],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });
    });

    describe("Reference 처리", () => {
      test("존재하지 않는 reference ID -> z.string() 폴백", async () => {
        const testApi = createTestApi({
          parameters: [
            {
              name: "param",
              type: {
                t: "ref",
                id: "not-exists",
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "string-literal" }] }],
          },
        });
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);
      });

      test("다중 reference 의존성", async () => {
        const references: Record<string, z.ZodObject> = {
          BaseEntity: z.object({
            id: z.number(),
          }),
          Timestamped: z.object({
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
          Audited: z.object({
            createdBy: z.string(),
            updatedBy: z.string(),
          }),
        };

        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "UserEntity",
              constraint: {
                t: "intersection",
                types: [
                  { t: "ref", id: "BaseEntity" }, // 첫 번째 reference
                  { t: "ref", id: "Timestamped" }, // 두 번째 reference
                  { t: "ref", id: "Audited" }, // 세 번째 reference
                  {
                    t: "object",
                    props: [
                      { name: "name", type: "string", optional: false },
                      { name: "email", type: "string", optional: false },
                    ],
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "user",
              type: { t: "ref", id: "UserEntity" },
              optional: false,
            },
            {
              name: "base",
              type: { t: "ref", id: "BaseEntity" },
              optional: false,
            },
          ],
        });
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(zodObject).toBeInstanceOf(z.ZodObject);

        // 검증: 기존 references가 유지됨
        expect(Object.keys(references)).toContain("BaseEntity");
        expect(Object.keys(references)).toContain("Timestamped");
        expect(Object.keys(references)).toContain("Audited");

        // 검증: UserEntity가 추가됨
        expect(Object.keys(references)).toContain("UserEntity");

        // 검증: user 파라미터는 intersection
        expect(zodObject.shape.user.def.type).toBe("intersection");

        // 검증: base 파라미터는 BaseEntity 참조 성공
        expect(zodObject.shape.base.def.type).toBe("object");
        expect(zodObject.shape.base.shape.id).toBeDefined();
        expect(zodObject.shape.base.shape.id.def.type).toBe("number");

        // 검증: UserEntity의 intersection이 모든 reference를 포함
        // (intersection의 left/right 구조를 재귀적으로 확인)
        const userEntityType = references.UserEntity as unknown as z.ZodObject;
        expect(userEntityType?.def.type).toBe("intersection");
      });

      test("다중 reference 의존성 (체인)", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "A",
              constraint: { t: "object", props: [{ name: "a", type: "string", optional: false }] },
            },
            {
              t: "type-param",
              id: "B",
              constraint: {
                t: "intersection",
                types: [
                  { t: "ref", id: "A" }, // A 참조
                  { t: "object", props: [{ name: "b", type: "string", optional: false }] },
                ],
              },
            },
            {
              t: "type-param",
              id: "C",
              constraint: {
                t: "intersection",
                types: [
                  { t: "ref", id: "B" }, // B 참조 (B는 A 참조)
                  { t: "object", props: [{ name: "c", type: "string", optional: false }] },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "paramC",
              type: { t: "ref", id: "C" }, // C는 B를, B는 A를 참조하는 체인
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        // 검증 1: A, B, C 모두 등록됨
        expect(Object.keys(references).sort()).toEqual(["A", "B", "C"]);

        // 검증 2: A는 object (base)
        expect(references.A?.def.type).toBe("object");
        expect(references.A?.shape.a).toBeDefined();
        expect(references.A?.shape.a.def.type).toBe("string");

        // 검증 3: B는 intersection (A & { b: string })
        expect(references.B?.def.type).toBe("intersection");
        const typeB = references.B as unknown as z.ZodIntersection<z.ZodType, z.ZodType>;
        expect(typeB.def.left.def.type).toBe("object"); // A 참조 성공
        expect(typeB.def.right.def.type).toBe("object"); // { b: string }

        // // B의 left는 A를 참조했으므로 'a' 필드가 있어야 함
        const typeLeft = typeB.def.left as unknown as z.ZodObject;
        expect(typeLeft.def.type).toBe("object");
        expect(typeLeft.shape.a).toBeDefined();
        expect(typeLeft.shape.a.def.type).toBe("string");

        // B의 right는 'b' 필드
        const typeRight = typeB.def.right as unknown as z.ZodObject;
        expect(typeRight.shape.b).toBeDefined();
        expect(typeRight.shape.b.def.type).toBe("string");

        // 검증 4: C는 intersection (B & { c: string })
        expect(references.C?.def.type).toBe("intersection");
        const typeC = references.C as unknown as z.ZodIntersection<z.ZodType, z.ZodType>;
        expect(typeC.def.left.def.type).toBe("intersection"); // B 참조 (B도 intersection)
        expect(typeC.def.right.def.type).toBe("object"); // { c: string }

        // C의 left는 B를 참조했으므로 B의 intersection 구조
        const typeLeftC = typeC.def.left as unknown as z.ZodIntersection<z.ZodType, z.ZodType>;
        expect(typeLeftC.def.left.def.type).toBe("object"); // A에서 온 'a'
        expect(typeLeftC.def.right.def.type).toBe("object"); // B에서 온 'b'

        // C의 right는 'c' 필드
        const typeRightC = typeC.def.right as unknown as z.ZodObject;
        expect(typeRightC.shape.c).toBeDefined();
        expect(typeRightC.shape.c.def.type).toBe("string");

        // 검증 5: paramC는 C를 참조
        expect(zodObject.shape.paramC.def.type).toBe("intersection");
      });
    });

    describe("순환참조 처리", () => {
      test("자기 자신을 참조하는 TypeParameter", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "SelfRef",
              constraint: { t: "ref", id: "SelfRef" }, // 자기 자신 참조
            },
          ],
          parameters: [
            {
              name: "param",
              type: { t: "ref", id: "SelfRef" }, // SelfRef 사용
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        expect(Object.keys(references)).toContain("SelfRef"); // SelfRef가 references에 등록됨
        expect(zodObject.shape.param).toBeDefined();
        expect(zodObject.shape.param.def.type).toBe("unknown"); // z.string() 폴백 확인
      });

      test("상호 참조하는 TypeParameters (A↔B)", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "A",
              constraint: { t: "ref", id: "B" }, // A → B
            },
            {
              t: "type-param",
              id: "B",
              constraint: { t: "ref", id: "A" }, // B → A
            },
          ],
          parameters: [
            {
              name: "paramA",
              type: { t: "ref", id: "A" },
              optional: false,
            },
            {
              name: "paramB",
              type: { t: "ref", id: "B" },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        expect(Object.keys(references)).toContain("A");
        expect(Object.keys(references)).toContain("B");

        // 둘 다 z.string() 폴백되었는지 확인
        expect(zodObject.shape.paramA.def.type).toBe("unknown");
        expect(zodObject.shape.paramB.def.type).toBe("unknown");

        // references도 string인지 확인
        expect(references.A?.def.type).toBe("unknown");
        expect(references.B?.def.type).toBe("unknown");
      });

      test("삼각 순환 (A→B→C→A) 처리", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "A",
              constraint: { t: "ref", id: "B" }, // A → B
            },
            {
              t: "type-param",
              id: "B",
              constraint: { t: "ref", id: "C" }, // B → C
            },
            {
              t: "type-param",
              id: "C",
              constraint: { t: "ref", id: "A" }, // C → A (순환)
            },
          ],
          parameters: [
            {
              name: "paramA",
              type: { t: "ref", id: "A" },
              optional: false,
            },
            {
              name: "paramB",
              type: { t: "ref", id: "B" },
              optional: false,
            },
            {
              name: "paramC",
              type: { t: "ref", id: "C" },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        // 검증: A, B, C 모두 등록됨
        expect(Object.keys(references).sort()).toEqual(["A", "B", "C"]);

        // 검증: 모두 string 타입으로 폴백
        expect(zodObject.shape.paramA.def.type).toBe("unknown");
        expect(zodObject.shape.paramB.def.type).toBe("unknown");
        expect(zodObject.shape.paramC.def.type).toBe("unknown");

        // 검증: references도 모두 string
        expect(references.A?.def.type).toBe("unknown");
        expect(references.B?.def.type).toBe("unknown");
        expect(references.C?.def.type).toBe("unknown");
      });

      test("재귀적 배열 구조 (Tree-like Array)", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "TreeNode",
              constraint: {
                t: "object",
                props: [
                  {
                    name: "value",
                    type: "string",
                    optional: false,
                  },
                  {
                    name: "children",
                    type: {
                      t: "array",
                      elementsType: { t: "ref", id: "TreeNode" }, // 자기 자신 배열
                    },
                    optional: false,
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "tree",
              type: { t: "ref", id: "TreeNode" },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        // 검증: TreeNode가 등록됨
        expect(Object.keys(references)).toContain("TreeNode");

        // 검증: tree 파라미터가 object 타입
        expect(zodObject.shape.tree.def.type).toBe("object");

        // 검증: tree에 value와 children 필드 존재
        const treeShape = zodObject.shape.tree.shape;
        expect(treeShape.value).toBeDefined();
        expect(treeShape.children).toBeDefined();

        // 검증: value는 string
        expect(treeShape.value.def.type).toBe("string");

        // 검증: children은 array
        expect(treeShape.children.def.type).toBe("array");

        // 검증: children의 element는 string (재귀 끊어짐)
        expect(treeShape.children.def.element.def.type).toBe("unknown");
      });

      test("재귀적 Union (JasonValue-like Union)", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "JsonValue",
              constraint: {
                t: "union",
                types: [
                  "string",
                  "number",
                  "boolean",
                  "null",
                  {
                    t: "array",
                    elementsType: { t: "ref", id: "JsonValue" }, // 재귀
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "json",
              type: { t: "ref", id: "JsonValue" },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        // 검증: JsonValue가 등록됨
        expect(Object.keys(references)).toContain("JsonValue");

        // 검증: json 파라미터가 union 타입
        expect(zodObject.shape.json.def.type).toBe("union");

        // 검증: union options 개수 확인 (5개)
        const unionOptions = zodObject.shape.json.def.options;
        expect(unionOptions.length).toBe(5);

        // 검증: union에 primitive 타입들 포함
        const optionTypes = unionOptions.map((opt: z.ZodType<unknown>) => opt.def.type);
        expect(optionTypes).toContain("string");
        expect(optionTypes).toContain("number");
        expect(optionTypes).toContain("boolean");
        expect(optionTypes).toContain("unknown");
        expect(optionTypes).toContain("array");

        // 검증: array의 element가 string (재귀 끊어짐)
        const arrayOption = unionOptions.find(
          (opt: z.ZodType<unknown>) => opt.def.type === "array",
        );
        expect(arrayOption?.def.element.def.type).toBe("unknown");
      });

      test("Pick/Omit + 순환", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "User",
              constraint: {
                t: "object",
                props: [
                  {
                    name: "id",
                    type: "number",
                    optional: false,
                  },
                  {
                    name: "name",
                    type: "string",
                    optional: false,
                  },
                  {
                    name: "email",
                    type: "string",
                    optional: false,
                  },
                  {
                    name: "friend",
                    type: {
                      t: "ref",
                      id: "Pick",
                      args: [
                        { t: "ref", id: "User" }, // 자기 자신 참조
                        {
                          t: "union",
                          types: [
                            { t: "string-literal", value: "id" },
                            { t: "string-literal", value: "name" },
                          ],
                        },
                      ],
                    },
                    optional: true,
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "user",
              type: { t: "ref", id: "User" },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        // 검증: User가 등록됨
        expect(Object.keys(references)).toContain("User");

        // 검증: user 파라미터가 object 타입
        expect(zodObject.shape.user.def.type).toBe("object");
        // 검증: friend의 innerType 확인 (순환 끊어져서 string으로 폴백 예상)
        // Pick의 대상인 User가 없어서 z.unknown()으로 폴백될 것
        expect(zodObject.shape.user.shape.friend.def.innerType.def.type).toBe("unknown");
      });

      test("Intersection + 순환", async () => {
        const testApi = createTestApi({
          typeParameters: [
            {
              t: "type-param",
              id: "Node",
              constraint: {
                t: "intersection",
                types: [
                  {
                    t: "object",
                    props: [
                      {
                        name: "value",
                        type: "string",
                        optional: false,
                      },
                    ],
                  },
                  {
                    t: "object",
                    props: [
                      {
                        name: "next",
                        type: { t: "ref", id: "Node" }, // 자기 자신 참조
                        optional: true,
                      },
                    ],
                  },
                ],
              },
            },
          ],
          parameters: [
            {
              name: "node",
              type: { t: "ref", id: "Node" },
              optional: false,
            },
          ],
        });

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);

        // 검증: Node가 등록됨
        expect(Object.keys(references)).toContain("Node");

        // 검증: node 파라미터가 intersection 타입
        expect(zodObject.shape.node.def.type).toBe("intersection");

        // 검증: intersection의 left와 right 확인
        const rightType = zodObject.shape.node.def.right;

        // 검증: next의 innerType은 unknown (순환 끊어짐)
        expect(rightType.shape.next.def.innerType.def.type).toBe("unknown");
      });
    });
  });

  ///
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
  // describe("apiParamTypeToTsType", () => {
  //   describe("Primitive 타입", () => {
  //     test("string", () => {
  //       const result = apiParamTypeToTsType("string", []);
  //       expect(result).toBe("string");
  //     });

  //     test("number", () => {
  //       const result = apiParamTypeToTsType("number", []);
  //       expect(result).toBe("number");
  //     });

  //     test("boolean", () => {
  //       const result = apiParamTypeToTsType("boolean", []);
  //       expect(result).toBe("boolean");
  //     });

  //     test("null", () => {
  //       const result = apiParamTypeToTsType("null", []);
  //       expect(result).toBe("null");
  //     });

  //     test("undefined", () => {
  //       const result = apiParamTypeToTsType("undefined", []);
  //       expect(result).toBe("undefined");
  //     });

  //     test("void", () => {
  //       const result = apiParamTypeToTsType("void", []);
  //       expect(result).toBe("void");
  //     });

  //     test("any", () => {
  //       const result = apiParamTypeToTsType("any", []);
  //       expect(result).toBe("any");
  //     });

  //     test("unknown", () => {
  //       const result = apiParamTypeToTsType("unknown", []);
  //       expect(result).toBe("unknown");
  //     });
  //   });

  //   describe("Literal 타입", () => {
  //     test("string-literal", () => {
  //       const result = apiParamTypeToTsType({ t: "string-literal", value: "test" }, []);
  //       expect(result).toBe('"test"');
  //     });

  //     test("numeric-literal", () => {
  //       const result = apiParamTypeToTsType({ t: "numeric-literal", value: 123 }, []);
  //       expect(result).toBe("123");
  //     });
  //   });

  //   describe("Object 타입", () => {
  //     test("object", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "object",
  //           props: [
  //             { name: "id", type: "number", optional: false },
  //             { name: "name", type: "string", optional: true },
  //           ],
  //         },
  //         [],
  //       );
  //       expect(result).toContain("{ ");
  //       expect(result).toContain("id: number");
  //       expect(result).toContain("name?: string");
  //       expect(result).toContain(" }");
  //     });
  //   });

  //   describe("Union/Intersection 타입", () => {
  //     test("union", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "union",
  //           types: ["string", "number"],
  //         },
  //         [],
  //       );
  //       expect(result).toBe("string | number");
  //     });

  //     test("intersection", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "intersection",
  //           types: ["string", "number"],
  //         },
  //         [],
  //       );
  //       expect(result).toBe("string & number");
  //     });
  //   });

  //   describe("Array 타입", () => {
  //     test("array", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "array",
  //           elementsType: "string",
  //         },
  //         [],
  //       );
  //       expect(result).toBe("string[]");
  //     });

  //     test("nested array", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "array",
  //           elementsType: {
  //             t: "array",
  //             elementsType: "number",
  //           },
  //         },
  //         [],
  //       );
  //       expect(result).toBe("number[][]");
  //     });
  //   });

  //   describe("Ref 타입", () => {
  //     test("ref without args", () => {
  //       const importKeys: string[] = [];
  //       const result = apiParamTypeToTsType({ t: "ref", id: "User" }, importKeys);
  //       expect(result).toBe("User");
  //       expect(importKeys).toContain("User");
  //     });

  //     test("ref with args", () => {
  //       const importKeys: string[] = [];
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "ref",
  //           id: "Promise",
  //           args: ["string"],
  //         },
  //         importKeys,
  //       );
  //       expect(result).toBe("Promise<string>");
  //       expect(importKeys).not.toContain("Promise"); // Promise는 import 불필요
  //     });

  //     test("ref - built-in types (no import)", () => {
  //       const importKeys: string[] = [];
  //       ["Pick", "Omit", "Promise", "Partial", "Date"].forEach((id) => {
  //         apiParamTypeToTsType({ t: "ref", id }, importKeys);
  //       });
  //       expect(importKeys.length).toBe(0); // 모두 import 불필요
  //     });

  //     test("ref - custom types (with import)", () => {
  //       const importKeys: string[] = [];
  //       apiParamTypeToTsType({ t: "ref", id: "CustomType" }, importKeys);
  //       expect(importKeys).toContain("CustomType");
  //     });
  //   });

  //   describe("IndexedAccess 타입", () => {
  //     test("indexed-access", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "indexed-access",
  //           object: { t: "ref", id: "User" },
  //           index: { t: "string-literal", value: "id" },
  //         },
  //         [],
  //       );
  //       expect(result).toBe('User["id"]');
  //     });
  //   });

  //   describe("TupleType", () => {
  //     test("tuple-type", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "tuple-type",
  //           elements: ["string", "number"],
  //         },
  //         [],
  //       );
  //       expect(result).toContain("[ ");
  //       expect(result).toContain("string");
  //       expect(result).toContain("number");
  //       expect(result).toContain(" ]");
  //     });
  //   });

  //   describe("TypeParam", () => {
  //     test("type-param without constraint", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "type-param",
  //           id: "T",
  //         },
  //         [],
  //       );
  //       expect(result).toBe("<T>");
  //     });

  //     test("type-param with constraint", () => {
  //       const result = apiParamTypeToTsType(
  //         {
  //           t: "type-param",
  //           id: "T",
  //           constraint: "string",
  //         },
  //         [],
  //       );
  //       expect(result).toBe("<T extends string>");
  //     });
  //   });

  //   describe("에러 케이스", () => {
  //     test("resolve 불가 타입", () => {
  //       const fakeParamType = { t: "unknown_type" } as unknown as ApiParamType;

  //       let errorMessage = "";
  //       try {
  //         apiParamTypeToTsType(fakeParamType, []);
  //       } catch (error) {
  //         errorMessage = (error as Error).message;
  //       }

  //       expect(errorMessage).toContain("resolve 불가 ApiParamType");
  //     });
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

// === Test Helpers ===
// safe parse zod object
// async function parseZodObject(zodObject: z.ZodObject): Promise<string> {
//   const result = await zodObject.safeParse({});
//   return result.success ? JSON.stringify(result) : "error";
// }
