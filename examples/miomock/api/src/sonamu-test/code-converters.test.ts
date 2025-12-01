import { describe, expect, test } from "vitest";
import type { z } from "zod";
import {
  getZodObjectFromApi,
  getZodTypeFromApiParamType,
} from "../../../../../modules/sonamu/dist/api/code-converters";
import type {
  ApiDecoratorOptions,
  ExtendedApi,
} from "../../../../../modules/sonamu/dist/api/decorators";
import type { ApiParamType } from "../../../../../modules/sonamu/dist/types/types";

describe("code-converters", () => {
  const options: ApiDecoratorOptions = {
    httpMethod: "GET",
    description: "testApi",
    clients: [],
    contentType: "application/json",
  };

  describe("getZodObjectFromApi", () => {
    describe("기본 API", () => {
      test("string 파라미터", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
          parameters: [
            {
              name: "param",
              type: "string",
              optional: true,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
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
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
          parameters: [
            {
              name: "param",
              type: "number",
              optional: true,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
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
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
          parameters: [
            {
              name: "param",
              type: "boolean",
              optional: true,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
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
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
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
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
      });

      test("Generic Number의 배열, String의 배열", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터1 반영 확인");
        expect(zodObject.shape.param2).toMatchSnapshot("정의한 파라미터2 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
      });

      test("Generic Object", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
      });

      test("Generic Union", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(zodObject.shape.param).toMatchSnapshot("정의한 파라미터 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
      });

      test("Generic Intersection", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
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
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
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
        const testApi: ExtendedApi = {
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
        };

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
      });

      test("_로 시작하는 optional 파라미터", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
            args: [{ t: "ref", id: "void" }],
          },
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");

        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
      });

      test("Context, RefKnex 파라미터", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };

        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
      });

      // Pick<Omit<Object, "password">, "id" | "name"> 형태의 중첩
      test("중첩된 Pick/Omit 처리", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(zodObject.shape.nestedParam).toMatchSnapshot("중첩된 Pick/Omit 결과");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
      });

      test("Partial 파라미터", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      });

      test("Omit 파라미터", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      });

      test("Pick 파라미터", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      });

      test("Date 타입 처리", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      });

      test("nullable union 타입 (Type | null) 처리", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      });
    });

    describe("Reference 처리", () => {
      test("존재하지 않는 reference ID -> z.string() 폴백", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [],
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodObject = getZodObjectFromApi(testApi, references);
        expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
        expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
        expect(zodObject.shape.param.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      });

      // TODO: 순환 참조 케이스 처리
      // test("순환 참조 케이스", async () => {
      //   const testApi: ExtendedApi = {
      //     modelName: "PracticeModel",
      //     methodName: "testApi",
      //     path: "/practice/testApi",
      //     options: options,
      //     typeParameters: [],
      //     parameters: [],
      //     returnType: {
      //       t: "ref",
      //       id: "Promise",
      //       args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "Promise" }] }],
      //     },
      //   };
      //   const references: Record<string, z.ZodObject> = {};
      //   const zodObject = getZodObjectFromApi(testApi, references);
      //   expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
      //   expect(Object.keys(references)).toMatchSnapshot("typeParameters 반영 확인");
      //   expect(zodObject.shape.returnType.def.type).toMatchSnapshot("정의한 파라미터 타입 체크");
      // });

      // TODO: 다중 reference 의존성 처리
      // test("다중 reference 의존성", async () => {
      //   const testApi: ExtendedApi = {
      //     modelName: "PracticeModel",
      //     methodName: "testApi",
      //     path: "/practice/testApi",
      //     options: options,
      //     typeParameters: [],
      //     parameters: [],
      //     returnType: {
      //       t: "ref",
      //       id: "Promise",
      //       args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "Promise" }] }],
      //     },
      //   };
      //   const references: Record<string, z.ZodObject> = {
      //     A: z.object({
      //       id: z.string(),
      //     }),
      //     B: z.object({
      //       id: z.string(),
      //     }),
      //   };
      //   const zodObject = getZodObjectFromApi(testApi, references);
      //   expect(await parseZodObject(zodObject)).toMatchSnapshot("parameters 반영 확인");
      // });
    });
  });

  describe("getZodTypeFromApiParamType", () => {
    describe("주요 primitive 타입 처리", () => {
      test("타입 파라미터가 Generic String인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: "string",
            },
          ],
          parameters: [
            {
              name: "param",
              type: "string",
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type).toMatchSnapshot("타입 확인");
      });

      test("타입 파라미터가 Generic Number인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "void" }],
          },
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type).toMatchSnapshot("타입 확인");
      });

      test("타입 파라미터가 Generic Array인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
          typeParameters: [
            {
              t: "type-param",
              id: "T",
              constraint: {
                t: "array",
                elementsType: "number",
              },
            },
          ],
          parameters: [
            {
              name: "param",
              type: {
                t: "array",
                elementsType: "number",
              },
              optional: false,
            },
          ],
          returnType: {
            t: "ref",
            id: "Promise",
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "void" }] }],
          },
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type).toMatchSnapshot("타입 확인");
      });

      test("타입 파라미터가 Generic Object인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type.toString()).toMatchSnapshot("타입 확인");
      });

      test("타입 파라미터가 Generic Union인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: {
            httpMethod: "POST",
            description: "testApi",
            clients: ["axios", "swr"],
            contentType: "application/json",
          },
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
            args: [{ t: "ref", id: "Promise", args: [{ t: "ref", id: "union" }] }],
          },
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type).toMatchSnapshot("타입 확인");
      });

      test("타입 파라미터가 Generic Intersection인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type).toMatchSnapshot("타입 확인");
      });

      test("타입 파라미터가 Generic Tuple인 경우", async () => {
        const testApi: ExtendedApi = {
          modelName: "PracticeModel",
          methodName: "testApi",
          path: "/practice/testApi",
          options: options,
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
        };
        const references: Record<string, z.ZodObject> = {};
        const zodType = getZodTypeFromApiParamType(
          testApi.parameters[0]?.type as unknown as ApiParamType,
          references,
        );
        expect(zodType).toBeDefined();
        expect(zodType.type).toMatchSnapshot("타입 확인");
        expect(zodType).toMatchSnapshot("요소 확인");
      });
    });

    describe("Pick/Omit 유틸리티 처리", () => {
      test("Pick + ZodUnion keys", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("Pick + single ZodLiteral key", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("Omit + multiple keys", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("잘못된 인자 개수 에러 처리", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
    });
    describe("Partial 유틸리티 처리", () => {
      test("Partial + nested object", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("잘못된 인자 에러 처리", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
    });
    describe("복합 케이스 처리", () => {
      test("다중 intersection", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("nested union in array", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("tuple + optional elements", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
      test("record types", async () => {
        // const testApi: ExtendedApi = {
        //   modelName: "PracticeModel",
        //   methodName: "testApi",
        //   path: "/practice/testApi",
        //   options: options,
        // };
      });
    });
  });
});

async function parseZodObject(zodObject: z.ZodObject): Promise<string> {
  const result = await zodObject.safeParse({});
  return result.success ? JSON.stringify(result) : "error";
}
