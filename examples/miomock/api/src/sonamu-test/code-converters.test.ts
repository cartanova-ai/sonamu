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

describe("getZodObjectFromApi", () => {
  const options: ApiDecoratorOptions = {
    httpMethod: "GET",
    description: "testApi",
    clients: [],
    contentType: "application/json",
  };

  test("기본 API", async () => {
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
    expect(zodObject.shape.param.def.innerType.def.type).toMatchSnapshot("정의한 파라미터 타입");
    expect(zodObject.shape.param.def.type).toMatchSnapshot("타입파라미터 타입 체크");
  });

  test("typeParameters가 Generic Number인 API", async () => {
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

  test("typeParameters가 Generic Number의 배열, String의 배열인 API", async () => {
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

  test("typeParameters가 Generic Object인 API", async () => {
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

  test("typeParameters가 Generic Union인 API", async () => {
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

  test("typeParameters가 Generic Intersection인 API", async () => {
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

  test("typeParameters가 Generic Tuple인 API", async () => {
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
describe("getZodTypeFromApiParamType", () => {
  const options: ApiDecoratorOptions = {
    httpMethod: "GET",
    description: "testApi",
    clients: [],
    contentType: "application/json",
  };
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

async function parseZodObject(zodObject: z.ZodObject): Promise<string> {
  const result = await zodObject.safeParse({});
  return result.success ? JSON.stringify(result) : "error";
}
