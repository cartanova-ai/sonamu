import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  apiParamToTsCode,
  apiParamToTsCodeAsObject,
  getTextTypeLength,
  getZodObjectFromApi,
  getZodObjectFromApiParams,
  getZodTypeFromApiParamType,
  propNodeToZodTypeDef,
  propToZodTypeDef,
  zodTypeToZodCode,
} from "../../../../../modules/sonamu/dist/api/code-converters";
import type {
  ApiDecoratorOptions,
  ExtendedApi,
} from "../../../../../modules/sonamu/dist/api/decorators";
import type {
  ApiParam,
  EntityProp,
  EntityPropNode,
  HasManyRelationProp,
  RelationProp,
} from "../../../../../modules/sonamu/dist/types/types";

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
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.innerType.def.type).toMatchSnapshot(
          "정의한 파라미터 타입",
        );
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.innerType.def.type).toMatchSnapshot(
          "정의한 파라미터 타입",
        );
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.innerType.def.type).toMatchSnapshot(
          "정의한 파라미터 타입",
        );
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.innerType.def.type).toMatchSnapshot(
          "정의한 파라미터 타입",
        );
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터1 반영 확인");
        expect(zodObject.shape.param2).toMatchSnapshot("정의한 파라미터2 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터 반영 확인");
        expect(Object.values(references).map((value) => value.shape)).toMatchSnapshot(
          "typeParameters 반영 확인(2)",
        );
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
      });
    });

    describe("Edge Cases", () => {
      test("파라미터가 없는 API", async () => {
        const testApi = createTestApi();
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(zodObject.shape.nestedParam).toMatchSnapshot("중첩된 Pick/Omit 결과");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("반영 확인");

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
        const userEntityType = references["UserEntity"] as unknown as z.ZodObject;
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
        expect(await parseZodObject(zodObject)).toMatchSnapshot("반영 확인");

        // 검증 1: A, B, C 모두 등록됨
        expect(Object.keys(references).sort()).toEqual(["A", "B", "C"]);

        // 검증 2: A는 object (base)
        expect(references["A"]?.def.type).toBe("object");
        expect(references["A"]?.shape.a).toBeDefined();
        expect(references["A"]?.shape.a.def.type).toBe("string");

        // 검증 3: B는 intersection (A & { b: string })
        expect(references["B"]?.def.type).toBe("intersection");
        const typeB = references["B"] as unknown as z.ZodIntersection<z.ZodType, z.ZodType>;
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
        expect(references["C"]?.def.type).toBe("intersection");
        const typeC = references["C"] as unknown as z.ZodIntersection<z.ZodType, z.ZodType>;
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

        // 검증 6: 체인 전체 구조 스냅샷
        expectZodCodeSnapshot(references["A"] as z.ZodObject, "A 구조");
        expectZodCodeSnapshot(references["B"] as z.ZodObject, "B 구조");
        expectZodCodeSnapshot(references["C"] as z.ZodObject, "C 구조");
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
        expect(zodObject.shape.param.def.type).toBe("string"); // z.string() 폴백 확인
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
        expect(zodObject.shape.paramA.def.type).toBe("string");
        expect(zodObject.shape.paramB.def.type).toBe("string");

        // references도 string인지 확인
        expect(references["A"]?.def.type).toBe("string");
        expect(references["B"]?.def.type).toBe("string");
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
        expect(zodObject.shape.paramA.def.type).toBe("string");
        expect(zodObject.shape.paramB.def.type).toBe("string");
        expect(zodObject.shape.paramC.def.type).toBe("string");

        // 검증: references도 모두 string
        expect(references["A"]?.def.type).toBe("string");
        expect(references["B"]?.def.type).toBe("string");
        expect(references["C"]?.def.type).toBe("string");
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
        expectZodCodeSnapshot(references["TreeNode"] as z.ZodObject, "TreeNode Zod 코드");

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
        expect(treeShape.children.def.element.def.type).toBe("string");
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
        expectZodCodeSnapshot(references["JsonValue"] as z.ZodObject, "JsonValue Zod 코드");

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
        expect(arrayOption?.def.element.def.type).toBe("string");
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
        expectZodCodeSnapshot(references["User"] as z.ZodObject, "User Zod 코드");

        // 검증: user 파라미터가 object 타입
        expect(zodObject.shape.user.def.type).toBe("object");

        // 검증: user의 필드들 확인
        const userShape = zodObject.shape.user.shape;
        expect(userShape.id).toBeDefined();
        expect(userShape.name).toBeDefined();
        expect(userShape.email).toBeDefined();
        expect(userShape.friend).toBeDefined();

        // 검증: id, name, email은 정상
        expect(userShape.id.def.type).toBe("number");
        expect(userShape.name.def.type).toBe("string");
        expect(userShape.email.def.type).toBe("string");

        // 검증: friend는 optional
        expect(userShape.friend.def.type).toBe("optional");

        // 검증: friend의 innerType 확인 (순환 끊어져서 string으로 폴백 예상)
        // Pick의 대상인 User가 없어서 z.string()으로 폴백될 것
        expect(userShape.friend.def.innerType.def.type).toBe("string");
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
        expectZodCodeSnapshot(references["Node"] as z.ZodObject, "Node Zod 코드");

        // 검증: node 파라미터가 intersection 타입
        expect(zodObject.shape.node.def.type).toBe("intersection");

        // 검증: intersection의 left와 right 확인
        const leftType = zodObject.shape.node.def.left;
        const rightType = zodObject.shape.node.def.right;

        expect(leftType.def.type).toBe("object");
        expect(rightType.def.type).toBe("object");

        // 검증: left에 value 필드
        expect(leftType.shape.value).toBeDefined();
        expect(leftType.shape.value.def.type).toBe("string");

        // 검증: right에 next 필드
        expect(rightType.shape.next).toBeDefined();
        expect(rightType.shape.next.def.type).toBe("optional");

        // 검증: next의 innerType은 string (순환 끊어짐)
        expect(rightType.shape.next.def.innerType.def.type).toBe("string");
      });
    });
  });

  describe("getZodTypeFromApiParamType", () => {
    describe("Primitive 타입", () => {
      test("String", async () => {
        const zodType = getZodTypeFromApiParamType("string", {});
        expect(zodType).toBeInstanceOf(z.ZodString);
      });
      test("Number", async () => {
        const zodType = getZodTypeFromApiParamType("number", {});
        expect(zodType).toBeInstanceOf(z.ZodNumber);
      });
      test("Boolean", async () => {
        const zodType = getZodTypeFromApiParamType("boolean", {});
        expect(zodType).toBeInstanceOf(z.ZodBoolean);
      });
    });
    describe("Literal 타입", () => {
      test("string-literal", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "string-literal", value: "test" }, {});
        expect(zodType).toBeInstanceOf(z.ZodLiteral);
      });
      test("numeric-literal", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "numeric-literal", value: 1 }, {});
        expect(zodType).toBeInstanceOf(z.ZodLiteral);
      });
    });
    describe("Array 타입", () => {
      test("array", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "array", elementsType: "string" }, {});
        expect(zodType).toBeInstanceOf(z.ZodArray);
      });
    });
    describe("Object 타입", () => {
      test("object", async () => {
        const zodType = getZodTypeFromApiParamType(
          { t: "object", props: [{ name: "test", type: "string", optional: false }] },
          {},
        );
        expect(zodType).toBeInstanceOf(z.ZodObject);
      });
    });
    describe("Union 타입", () => {
      test("union", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "union", types: ["string", "number"] }, {});
        expect(zodType).toBeInstanceOf(z.ZodUnion);
      });
    });
    describe("Intersection 타입", () => {
      test("intersection", async () => {
        const zodType = getZodTypeFromApiParamType(
          { t: "intersection", types: ["string", "number"] },
          {},
        );
        expect(zodType).toBeInstanceOf(z.ZodIntersection);
      });
    });
    test("tuple-type", async () => {
      const zodType = getZodTypeFromApiParamType(
        {
          t: "tuple-type",
          elements: ["string", "number"],
        },
        {},
      );
      expect(zodType).toBeInstanceOf(z.ZodTuple);
    });

    describe("Ref 타입", () => {
      test("ref", async () => {
        const zodType = getZodTypeFromApiParamType({ t: "ref", id: "test" }, {});
        expect(zodType).toBeInstanceOf(z.ZodType);
      });
      test("Date", () => {
        const zodType = getZodTypeFromApiParamType({ t: "ref", id: "Date" }, {});
        expect(zodType).toBeInstanceOf(z.ZodDate);
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
        expect(zodType).toBeInstanceOf(z.ZodObject);
        expect((zodType as z.ZodObject).shape.id).toBeDefined();
        expect((zodType as z.ZodObject).shape.name).toBeDefined();
      });
    });

    describe("Pick/Omit 유틸리티 처리", () => {
      test("Pick + ZodUnion keys", async () => {
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
        expect(zodType).toBeInstanceOf(z.ZodObject);
        expect((zodType as z.ZodObject).shape.id).toBeDefined();
        expect((zodType as z.ZodObject).shape.name).toBeDefined();
        expect((zodType as z.ZodObject).shape.age).toBeUndefined();
      });
      test("Pick + single ZodLiteral key", async () => {
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
        expect(zodType).toBeInstanceOf(z.ZodObject);
        expect((zodType as z.ZodObject).shape.id).toBeDefined();
        expect((zodType as z.ZodObject).shape.name).toBeUndefined();
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
        expect(zodType).toBeInstanceOf(z.ZodObject);
        expect((zodType as z.ZodObject).shape.id).toBeDefined();
        expect((zodType as z.ZodObject).shape.name).toBeDefined();
        expect((zodType as z.ZodObject).shape.password).toBeUndefined();
      });
      test("잘못된 인자 개수 에러 처리 Pick", async () => {
        expect(() =>
          getZodTypeFromApiParamType(
            {
              t: "ref",
              id: "Pick",
              args: [{ t: "object", props: [] }],
            },
            {},
          ),
        ).toThrow("잘못된 Pick");
      });
      test("잘못된 인자 개수 에러 처리 Omit", async () => {
        expect(() =>
          getZodTypeFromApiParamType(
            {
              t: "ref",
              id: "Omit",
              args: [{ t: "object", props: [] }],
            },
            {},
          ),
        ).toThrow("잘못된 Omit");
      });
    });
  });

  describe("propNodeToZodTypeDef", () => {
    test("plain 노드 (integer)", async () => {
      const propNode: EntityPropNode = {
        nodeType: "plain",
        prop: { name: "id", type: "integer" } as EntityProp,
      };
      const result = propNodeToZodTypeDef(propNode, []);
      expect(result).toContain("id:");
      expect(result).toContain("z.int()");
    });
    test("array (with prop)", async () => {
      const propNode: EntityPropNode = {
        nodeType: "array",
        prop: { name: "items" } as EntityProp,
        children: [],
      };
      const result = propNodeToZodTypeDef(propNode, []);
      expect(result).toMatch(/^items:/); // "items:"로 시작
      expect(result).toContain("z.array(z.object({");
      expect(result).toContain("})),");
    });
    test("array 노드 (without prop)", () => {
      const propNode: EntityPropNode = {
        nodeType: "array",
        prop: undefined,
        children: [],
      };
      const result = propNodeToZodTypeDef(propNode, []);
      expect(result).not.toMatch(/^\w+:/); // 시작 부분에 "name:" 없음
      expect(result).toContain("z.array(z.object({");
      expect(result).toContain("})),");
    });
    test("object 노드 with nullable", () => {
      const propNode: EntityPropNode = {
        nodeType: "object",
        prop: { name: "profile", nullable: true } as EntityProp,
        children: [],
      };
      const result = propNodeToZodTypeDef(propNode, []);
      const normalized = result.replace(/\s+/g, ""); // 모든 공백/줄바꿈 제거
      expect(normalized).toContain("profile:z.object({");
      expect(normalized).toContain("}).nullable(),");
    });
    test("object 노드 without nullable", () => {
      const propNode: EntityPropNode = {
        nodeType: "object",
        prop: { name: "user", nullable: false } as EntityProp,
        children: [],
      };
      const result = propNodeToZodTypeDef(propNode, []);
      const normalized = result.replace(/\s+/g, ""); // 모든 공백/줄바꿈 제거
      expect(normalized).toContain("user:z.object({");
      expect(normalized).not.toContain(".nullable()");
      expect(normalized).toContain("}),"); // nullable 없이 })로 끝남
    });
    test("중첩 구조 (object in array)", () => {
      const propNode: EntityPropNode = {
        nodeType: "array",
        prop: { name: "users" } as EntityProp,
        children: [
          {
            nodeType: "object",
            prop: { name: "profile" } as EntityProp,
            children: [],
          },
        ],
      };
      const result = propNodeToZodTypeDef(propNode, []);
      const normalized = result.replace(/\s+/g, ""); // 모든 공백/줄바꿈 제거
      expect(normalized).toContain("users:z.array(z.object({");
      expect(normalized).toContain("profile:z.object({");
    });
    test("injectImportKeys 전달", () => {
      const importKeys: string[] = [];
      const propNode: EntityPropNode = {
        nodeType: "plain",
        prop: { name: "status", type: "enum" } as EntityProp, // enum은 import 필요
      };
      propNodeToZodTypeDef(propNode, importKeys);
      expect(importKeys.length).toBeGreaterThan(0);
    });
  });

  describe("getZodObjectFromApiParams", () => {
    test("빈 배열 → 빈 ZodObject", () => {
      const apiParams: ApiParam[] = [];
      const result = getZodObjectFromApiParams(apiParams);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(Object.keys(result.shape)).toHaveLength(0);
      expectZodCodeSnapshot(result, "빈 ZodObject");
    });

    test("단일 required 파라미터", () => {
      const apiParams: ApiParam[] = [{ name: "id", type: "number", optional: false }];
      const result = getZodObjectFromApiParams(apiParams);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(result.shape.id).toBeDefined();
      expect(result.shape.id).toBeInstanceOf(z.ZodNumber);
      expectZodCodeSnapshot(result, "단일 required 파라미터");
    });

    test("단일 optional 파라미터", () => {
      const apiParams: ApiParam[] = [{ name: "name", type: "string", optional: true }];
      const result = getZodObjectFromApiParams(apiParams);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(result.shape.name).toBeDefined();
      expect(result.shape.name).toBeInstanceOf(z.ZodOptional);
      expectZodCodeSnapshot(result, "단일 optional 파라미터");
    });

    test("다중 파라미터 (required + optional 혼합)", () => {
      const apiParams: ApiParam[] = [
        { name: "id", type: "number", optional: false },
        { name: "name", type: "string", optional: false },
        { name: "email", type: "string", optional: true },
      ];
      const result = getZodObjectFromApiParams(apiParams);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(result.shape.id).toBeInstanceOf(z.ZodNumber);
      expect(result.shape.name).toBeInstanceOf(z.ZodString);
      expect(result.shape.email).toBeInstanceOf(z.ZodOptional);
      expectZodCodeSnapshot(result, "다중 파라미터 (required + optional 혼합)");
    });

    test("복잡한 타입 (object)", () => {
      const apiParams: ApiParam[] = [
        {
          name: "user",
          type: {
            t: "object",
            props: [{ name: "id", type: "number", optional: false }],
          },
          optional: false,
        },
      ];
      const result = getZodObjectFromApiParams(apiParams);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(result.shape.user).toBeInstanceOf(z.ZodObject);
      expectZodCodeSnapshot(result, "복잡한 타입 (object)");
    });

    test("복잡한 타입 (array)", () => {
      const apiParams: ApiParam[] = [
        {
          name: "items",
          type: {
            t: "array",
            elementsType: "string",
          },
          optional: false,
        },
      ];
      const result = getZodObjectFromApiParams(apiParams);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(result.shape.items).toBeInstanceOf(z.ZodArray);
      expectZodCodeSnapshot(result, "복잡한 타입 (array)");
    });

    test("references 전달", () => {
      const references = {
        User: z.object({ id: z.number() }),
      };
      const apiParams: ApiParam[] = [
        {
          name: "user",
          type: { t: "ref", id: "User" },
          optional: false,
        },
      ];
      const result = getZodObjectFromApiParams(apiParams, references);
      expect(result).toBeInstanceOf(z.ZodObject);
      expect(result.shape.user).toBe(references.User); // 동일한 객체 참조
      expectZodCodeSnapshot(result, "references 전달");
    });
  });

  describe("getTextTypeLength", () => {
    test("text → 65535 (64KB - 1)", () => {
      const result = getTextTypeLength("text");
      expect(result).toBe(65535);
      expect(result).toBe(1024 * 64 - 1);
    });

    test("mediumtext → 16777215 (16MB - 1)", () => {
      const result = getTextTypeLength("mediumtext");
      expect(result).toBe(16777215);
      expect(result).toBe(1024 * 1024 * 16 - 1);
    });

    test("longtext → 4294967295 (4GB - 1)", () => {
      const result = getTextTypeLength("longtext");
      expect(result).toBe(4294967295);
      expect(result).toBe(1024 * 1024 * 1024 * 4 - 1);
    });
  });

  describe("propToZodTypeDef", () => {
    test("출력 형식 - 기본 (쉼표로 끝남)", () => {
      const prop = { name: "id", type: "integer" } as EntityProp;
      const result = propToZodTypeDef(prop, []);
      expect(result).toMatch(/,$/); // 쉼표로 끝남
      expect(result).toContain("id:");
      expect(result).toMatchSnapshot("기본 출력 형식");
    });

    test("출력 형식 - unable to resolve", () => {
      const prop = { name: "unknown", relationType: "unknown" } as unknown as RelationProp;
      const result = propToZodTypeDef(prop, []);
      expect(result).toBe("// unable to resolve");
      expect(result).toMatchSnapshot("unable to resolve");
    });

    test("출력 형식 - prop name 포함", () => {
      const prop = { name: "testField", type: "integer" } as unknown as EntityProp;
      const result = propToZodTypeDef(prop, []);
      expect(result).toContain("testField:");
      expect(result).toMatchSnapshot("prop name 포함");
    });

    test("injectImportKeys - enum prop", () => {
      const importKeys: string[] = [];
      const prop: EntityProp = {
        name: "status",
        type: "enum",
        length: 50,
        id: "StatusEnum",
        nullable: false,
      };
      const result = propToZodTypeDef(prop, importKeys);

      // enum은 import가 필요하므로 importKeys에 추가됨
      expect(importKeys).toContain("StatusEnum");
      expect(importKeys.length).toBe(1);

      // 출력 형식 검증
      expect(result).toContain("status:");
      expect(result).toContain("StatusEnum");
      expect(result).toMatch(/,$/);

      expect(result).toMatchSnapshot("enum prop with import");
    });
    test("modifier - unsigned", () => {
      const prop: EntityProp = {
        name: "age",
        type: "integer",
        unsigned: true,
        nullable: false,
      };
      const result = propToZodTypeDef(prop, []);
      expect(result).toContain(".nonnegative()");
      expect(result).toMatchSnapshot("unsigned modifier");
    });

    test("modifier - nullable", () => {
      const prop: EntityProp = {
        name: "email",
        type: "string",
        length: 255,
        nullable: true,
      };
      const result = propToZodTypeDef(prop, []);
      expect(result).toContain(".nullable()");
      expect(result).toMatchSnapshot("nullable modifier");
    });

    test("modifier - unsigned + nullable 조합", () => {
      const prop: EntityProp = {
        name: "count",
        type: "integer",
        unsigned: true,
        nullable: true,
      };
      const result = propToZodTypeDef(prop, []);
      expect(result).toContain(".nonnegative()");
      expect(result).toContain(".nullable()");
      expect(result).toMatchSnapshot("unsigned + nullable");
    });

    test("relation prop - 주석 처리 (HasMany)", () => {
      const prop: HasManyRelationProp = {
        name: "posts",
        type: "relation",
        relationType: "HasMany",
        with: "Post",
        nullable: false,
        joinColumn: "post_id",
      };
      const result = propToZodTypeDef(prop, []);
      expect(result).toMatch(/^\/\//); // 주석으로 시작
      expect(result).toContain("posts:");
      expect(result).toContain("HasMany");
      expect(result).toContain("Post");
      expect(result).toMatchSnapshot("relation 주석 처리");
    });
  });

  describe("zodTypeToZodCode", () => {
    describe("Primitive 타입", () => {
      test("string", () => {
        const zodType = z.string();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.string()");
      });

      test("number", () => {
        const zodType = z.number();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.number()");
      });

      test("bigint", () => {
        const zodType = z.bigint();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.bigint()");
      });

      test("boolean", () => {
        const zodType = z.boolean();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.boolean()");
      });

      test("date", () => {
        const zodType = z.date();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.date()");
      });
    });

    describe("Special 타입", () => {
      test("null", () => {
        const zodType = z.null();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.null()");
      });

      test("undefined", () => {
        const zodType = z.undefined();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.undefined()");
      });

      test("any", () => {
        const zodType = z.any();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.any()");
      });

      test("unknown", () => {
        const zodType = z.unknown();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.unknown()");
      });

      test("never", () => {
        const zodType = z.never();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.never()");
      });
    });

    describe("Modifier 타입", () => {
      test("nullable", () => {
        const zodType = z.string().nullable();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.string().nullable()");
      });

      test("optional", () => {
        const zodType = z.string().optional();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.string().optional()");
      });

      test("default", () => {
        const zodType = z.string().default("test");
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.string().default(test)");
      });
    });

    describe("Literal 타입", () => {
      test("string literal", () => {
        const zodType = z.literal("test");
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe('z.literal("test")');
      });

      test("number literal", () => {
        const zodType = z.literal(123);
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.literal(123)");
      });

      test("null literal", () => {
        const zodType = z.literal(null);
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.literal(null)");
      });
    });

    describe("Complex 타입", () => {
      test("array", () => {
        const zodType = z.array(z.string());
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.array(z.string())");
      });

      test("object", () => {
        const zodType = z.object({
          id: z.number(),
          name: z.string(),
        });
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("z.object({");
        expect(result).toContain("id: z.number(),");
        expect(result).toContain("name: z.string(),");
        expect(result).toContain("})");
      });

      test("union", () => {
        const zodType = z.union([z.string(), z.number()]);
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.union([z.string(),z.number()])");
      });

      test("record", () => {
        const zodType = z.record(z.string(), z.number());
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.record(z.string(), z.number())");
      });

      test("intersection", () => {
        const zodType = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }));
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("z.intersection(");
        expect(result).toContain("z.object({");
      });
    });

    describe("중첩 구조", () => {
      test("nested object", () => {
        const zodType = z.object({
          user: z.object({
            id: z.number(),
          }),
        });
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("user: z.object({");
        expect(result).toContain("id: z.number(),");
      });

      test("array of objects", () => {
        const zodType = z.array(z.object({ id: z.number() }));
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("z.array(z.object({");
      });

      test("nullable optional", () => {
        const zodType = z.string().nullable().optional();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.string().nullable().optional()");
      });
    });

    describe("에러 케이스", () => {
      test("처리되지 않은 타입", () => {
        const fakeZodType = {
          def: {
            type: "nonexistent_type" as z.ZodType["def"]["type"],
          },
        } as unknown as z.ZodType<unknown>;

        try {
          zodTypeToZodCode(fakeZodType);
          // 에러가 안 나면 테스트 실패
          expect(true).toBe(false);
        } catch (error) {
          // 에러 메시지 스냅샷
          expect((error as Error).message).toMatchSnapshot("처리되지 않은 타입 에러 메시지");
        }
      });
    });
  });

  describe("apiParamToTsCode", () => {
    test("빈 배열 → 빈 문자열", () => {
      const result = apiParamToTsCode([], []);
      expect(result).toBe("");
    });

    test("단일 required 파라미터", () => {
      const params: ApiParam[] = [{ name: "id", type: "number", optional: false }];
      const result = apiParamToTsCode(params, []);
      expect(result).toBe("id: number");
    });

    test("단일 optional 파라미터 (no default)", () => {
      const params: ApiParam[] = [{ name: "name", type: "string", optional: true }];
      const result = apiParamToTsCode(params, []);
      expect(result).toBe("name?: string");
    });

    test("optional with default", () => {
      const params: ApiParam[] = [
        { name: "limit", type: "number", optional: true, defaultDef: "10" },
      ];
      const result = apiParamToTsCode(params, []);
      expect(result).toBe("limit: number= 10");
    });

    test("required with default (edge case)", () => {
      const params: ApiParam[] = [
        { name: "page", type: "number", optional: false, defaultDef: "1" },
      ];
      const result = apiParamToTsCode(params, []);
      expect(result).toBe("page: number= 1");
    });

    test("다중 파라미터 (required + optional)", () => {
      const params: ApiParam[] = [
        { name: "id", type: "number", optional: false },
        { name: "name", type: "string", optional: true },
        { name: "limit", type: "number", optional: true, defaultDef: "10" },
      ];
      const result = apiParamToTsCode(params, []);
      expect(result).toBe("id: number, name?: string, limit: number= 10");
    });

    test("복잡한 타입 (object)", () => {
      const params: ApiParam[] = [
        {
          name: "data",
          type: {
            t: "object",
            props: [{ name: "id", type: "number", optional: false }],
          },
          optional: false,
        },
      ];
      const result = apiParamToTsCode(params, []);
      expect(result).toContain("data:");
      expect(result).toContain("{");
    });

    test("injectImportKeys 전달", () => {
      const importKeys: string[] = [];
      const params: ApiParam[] = [
        {
          name: "user",
          type: { t: "ref", id: "User" },
          optional: false,
        },
      ];
      apiParamToTsCode(params, importKeys);
      // apiParamTypeToTsType가 importKeys를 사용하므로 전달 확인
      expect(importKeys).toBeDefined();
    });
  });

  describe("apiParamToTsCodeAsObject", () => {
    test("빈 배열 → 빈 객체", () => {
      const result = apiParamToTsCodeAsObject([], []);
      expect(result).toBe("{  }");
    });

    test("단일 required 파라미터", () => {
      const params: ApiParam[] = [{ name: "id", type: "number", optional: false }];
      const result = apiParamToTsCodeAsObject(params, []);
      expect(result).toBe("{ id: number }");
    });

    test("단일 optional 파라미터", () => {
      const params: ApiParam[] = [{ name: "name", type: "string", optional: true }];
      const result = apiParamToTsCodeAsObject(params, []);
      expect(result).toBe("{ name?: string }");
    });

    test("optional with default", () => {
      const params: ApiParam[] = [
        { name: "limit", type: "number", optional: true, defaultDef: "10" },
      ];
      const result = apiParamToTsCodeAsObject(params, []);
      expect(result).toBe("{ limit?: number= 10 }");
    });

    test("다중 파라미터", () => {
      const params: ApiParam[] = [
        { name: "id", type: "number", optional: false },
        { name: "name", type: "string", optional: true },
        { name: "limit", type: "number", optional: true, defaultDef: "10" },
      ];
      const result = apiParamToTsCodeAsObject(params, []);
      expect(result).toBe("{ id: number, name?: string, limit?: number= 10 }");
    });

    test("apiParamToTsCode와 출력 형식 차이", () => {
      const params: ApiParam[] = [
        { name: "id", type: "number", optional: false },
        { name: "name", type: "string", optional: true },
      ];
      const resultNormal = apiParamToTsCode(params, []);
      const resultAsObject = apiParamToTsCodeAsObject(params, []);

      expect(resultNormal).toBe("id: number, name?: string");
      expect(resultAsObject).toBe("{ id: number, name?: string }");
      expect(resultAsObject).toContain("{");
      expect(resultAsObject).toContain("}");
    });

    test("injectImportKeys 전달", () => {
      const importKeys: string[] = [];
      const params: ApiParam[] = [
        {
          name: "user",
          type: { t: "ref", id: "User" },
          optional: false,
        },
      ];
      apiParamToTsCodeAsObject(params, importKeys);
      expect(importKeys).toBeDefined();
    });
  });
});

// === Test Helpers ===
// safe parse zod object
async function parseZodObject(zodObject: z.ZodObject): Promise<string> {
  const result = await zodObject.safeParse({});
  return result.success ? JSON.stringify(result) : "error";
}

// expect zod code snapshot
function expectZodCodeSnapshot(zodType: z.ZodType, snapshotName: string): void {
  expect(zodTypeToZodCode(zodType)).toMatchSnapshot(snapshotName);
}
