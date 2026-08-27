/* oxlint-disable no-template-curly-in-string */ // <이럴 때 아니면 any 언제 씁니까>

import { bootstrap } from "sonamu/test";
import { describe, test, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

import { expect } from "vitest";

import {
  propNodeToZodTypeDef,
  propToZodType,
  propToZodTypeDef,
  zodTypeToRenderingNode,
  zodTypeToTsTypeDef,
  zodTypeToZodCode,
} from "../../../../../modules/sonamu/dist/template/zod-converter";
import {
  type EntityProp,
  type EntityPropNode,
} from "../../../../../modules/sonamu/dist/types/types";
import {
  SonamuFileArraySchema,
  SonamuFileSchema,
} from "../../../../../modules/sonamu/dist/types/types";

function expectToPass<T extends z.ZodType>(zodType: T, validData: z.input<T>) {
  const result = zodType.safeParse(validData);
  expect(result.success).toBe(true);
}

function expectToFail<T extends z.ZodType>(zodType: T, invalidData: z.input<T>) {
  const result = zodType.safeParse(invalidData);
  expect(result.success).toBe(false);
}

describe("zod-converter", () => {
  describe("zodTypeToTsTypeDef", () => {
    describe("Primitive 타입", () => {
      // 목적: Zod의 기본 타입들이 올바른 TypeScript 타입 문자열로 변환되는지 검증
      test.each([
        // [타입명, Zod 타입 인스턴스, 기대하는 TypeScript 타입 문자열]
        ["string", z.string(), "string"],
        ["number", z.number(), "number"],
        ["boolean", z.boolean(), "boolean"],
        ["bigint", z.bigint(), "bigint"],
        ["date", z.date(), "Date"],
        ["null", z.null(), "null"],
        ["undefined", z.undefined(), "undefined"],
        ["any", z.any(), "any"],
        ["unknown", z.unknown(), "unknown"],
        ["never", z.never(), "never"],
      ])("%s 타입", (_name, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Nullable 타입", () => {
      // 목적: nullable 타입이 "타입 | null" 형태로 올바르게 변환되는지 검증
      test.each([
        // [타입명, Zod 타입 인스턴스, 기대하는 TypeScript 타입 문자열]
        ["nullable string", z.string().nullable(), "string | null"],
        ["nullable number", z.number().nullable(), "number | null"],
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Default 타입", () => {
      // 목적: default 값이 있는 타입이 내부 타입으로 올바르게 변환되는지 검증 (default 값은 무시됨)
      test.each([
        // [타입명, Zod default 타입, 기대하는 TypeScript 타입]
        ["default string", z.string().default("test"), "string"],
        ["default number", z.number().default(42), "number"],
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Record 타입", () => {
      // 목적: record 타입이 "{ [ key: KeyType ]: ValueType }" 형태로 올바르게 변환되는지 검증
      test.each([
        // [설명, Zod record 타입, 기대하는 TypeScript Record 타입]
        [
          "string key and number value",
          z.record(z.string(), z.number()),
          "{ [ key: string ]: number}",
        ],
        [
          "string key and string value",
          z.record(z.string(), z.string()),
          "{ [ key: string ]: string}",
        ],
      ])("record with %s", (_desc, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Literal 타입", () => {
      // 목적: literal 타입이 올바른 리터럴 문자열로 변환되는지 검증
      test.each([
        // [타입명, Zod literal 타입, 기대하는 TypeScript literal 타입]
        ["string literal", z.literal("active"), '"active"'],
        ["number literal", z.literal(42), "42"],
        ["null literal", z.literal(null), "null"],
        ["undefined literal", z.literal(undefined), "undefined"],
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Union 타입", () => {
      // 목적: union 타입이 "타입1 | 타입2 | ..." 형태의 TypeScript union 타입으로 올바르게 변환되는지 검증
      test("union of string and number", () => {
        const zodType = z.union([z.string(), z.number()]);
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe("string | number");
      });

      test("union of multiple types", () => {
        const zodType = z.union([z.string(), z.number(), z.boolean()]);
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe("string | number | boolean");
      });
    });

    describe("Enum 타입", () => {
      // 목적: enum 타입이 리터럴 union 형태("값1" | "값2" | ...)로 올바르게 변환되는지 검증
      test("enum with string values", () => {
        const zodType = z.enum(["active", "inactive", "pending"]);
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe('"active" | "inactive" | "pending"');
      });
    });

    describe("Array 타입", () => {
      // 목적: array 타입이 "ElementType[]" 형태로 올바르게 변환되는지 검증 (중첩 배열 포함)
      test.each([
        // [설명, Zod array 타입, 기대하는 TypeScript array 타입]
        ["array of strings", z.array(z.string()), "string[]"],
        ["array of numbers", z.array(z.number()), "number[]"],
        ["nested array", z.array(z.array(z.string())), "string[][]"],
      ])("%s", (_desc, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Object 타입", () => {
      // 목적: object 타입이 TypeScript 객체 타입 형태로 올바르게 변환되는지 검증
      test("simple object", () => {
        // 기대: 기본 객체가 { 필드명: 타입, ... } 형태로 변환
        const zodType = z.object({
          id: z.number(),
          name: z.string(),
        });
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toContain("{");
        expect(result).toContain("id: number,");
        expect(result).toContain("name: string,");
        expect(result).toContain("}");
      });

      test("object with optional field", () => {
        // 기대: optional 필드는 "필드명?: 타입" 형태로 변환
        const zodType = z.object({
          id: z.number(),
          name: z.string().optional(),
        });
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toContain("id: number,");
        expect(result).toContain("name?: string,");
      });

      test("nested object", () => {
        // 기대: 중첩 객체가 재귀적으로 변환
        const zodType = z.object({
          user: z.object({
            id: z.number(),
            name: z.string(),
          }),
        });
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toContain("user:");
        expect(result).toContain("id: number,");
        expect(result).toContain("name: string,");
      });
    });

    describe("Optional 타입", () => {
      // 목적: optional 타입이 "타입 | undefined" 형태로 올바르게 변환되는지 검증
      test.each([
        // [타입명, Zod optional 타입, 기대하는 TypeScript union 타입]
        ["optional string", z.string().optional(), "string | undefined"],
        ["optional number", z.number().optional(), "number | undefined"],
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("에러 케이스", () => {
      // 목적: 지원하지 않는 Zod 타입에 대해 적절한 에러를 발생시키는지 검증
      test("처리되지 않은 타입 → 에러", () => {
        // 기대: 처리되지 않은 타입에 대해 명확한 에러 메시지 발생
        const mockZodType = z.string();
        Object.defineProperty(mockZodType.def, "type", { value: "unsupported_type" });

        expect(() => zodTypeToTsTypeDef(mockZodType)).toThrow(
          "처리되지 않은 ZodType unsupported_type",
        );
      });
    });

    describe("Template Literal 타입", () => {
      // 목적: template literal 타입이 올바른 TypeScript 템플릿 리터럴 타입으로 변환되는지 검증
      test.each([
        // [설명, Zod template literal 타입, 기대하는 TypeScript 타입]
        ["simple string", z.templateLiteral(["Hello"]), "`Hello`"],
        [
          "with string type",
          z.templateLiteral(["Hello, ", z.string(), "!"]),
          "`Hello, ${string}!`",
        ],
        ["with number type", z.templateLiteral([z.number(), "px"]), "`${number}px`"],
        ["empty template", z.templateLiteral([]), "string"], // fallback to string
        [
          "multiple parts",
          z.templateLiteral(["https://", z.string(), ".com"]),
          "`https://${string}.com`",
        ],
      ])("%s", (_desc, zodType, expected) => {
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("File 타입", () => {
      // 목적: file 타입이 TypeScript File 타입으로 변환되는지 검증
      test("file type", () => {
        const zodType = z.file();
        const result = zodTypeToTsTypeDef(zodType);
        expect(result).toBe("File");
      });
    });
  });

  describe("zodTypeToZodCode", () => {
    describe("Primitive 타입", () => {
      // 목적: Zod 타입 인스턴스가 올바른 Zod 생성 코드 문자열로 변환되는지 검증
      test.each([
        // [타입명, Zod 타입 인스턴스, 기대하는 Zod 코드 문자열]
        ["string", z.string(), "z.string()"],
        ["number", z.number(), "z.number()"],
        ["boolean", z.boolean(), "z.boolean()"],
        ["bigint", z.bigint(), "z.bigint()"],
        ["date", z.date(), "z.date()"],
        ["null", z.null(), "z.null()"],
        ["undefined", z.undefined(), "z.undefined()"],
        ["any", z.any(), "z.any()"],
        ["unknown", z.unknown(), "z.unknown()"],
        ["never", z.never(), "z.never()"],
      ])("%s 타입", (_name, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Nullable 타입", () => {
      // 목적: nullable 타입이 ".nullable()" 메서드 체이닝 형태로 올바르게 변환되는지 검증
      test.each([
        // [타입명, Zod nullable 타입, 기대하는 Zod 코드]
        ["nullable string", z.string().nullable(), "z.string().nullable()"],
        ["nullable number", z.number().nullable(), "z.number().nullable()"],
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Default 타입", () => {
      // 목적: default 값이 있는 타입이 ".default(값)" 메서드 체이닝 형태로 올바르게 변환되는지 검증
      test("default string", () => {
        const zodType = z.string().default("test");
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.string().default(test)");
      });

      test("default number", () => {
        const zodType = z.number().default(42);
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.number().default(42)");
      });
    });

    describe("Union 타입", () => {
      // 목적: union 타입이 "z.union([타입1, 타입2, ...])" 형태로 올바르게 변환되는지 검증
      test("union of string and number", () => {
        const zodType = z.union([z.string(), z.number()]);
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.union([z.string(),z.number()])");
      });

      test("union of multiple types", () => {
        const zodType = z.union([z.string(), z.number(), z.boolean()]);
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.union([z.string(),z.number(),z.boolean()])");
      });
    });

    describe("Enum 타입", () => {
      // 목적: enum 타입이 "z.enum({ 키: 값, ... })" 형태로 올바르게 변환되는지 검증
      test("enum with string values", () => {
        const zodType = z.enum(["active", "inactive", "pending"]);
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("z.enum({");
        expect(result).toContain('active: "active"');
        expect(result).toContain('inactive: "inactive"');
        expect(result).toContain('pending: "pending"');
        expect(result).toContain("})");
      });
    });

    describe("Array 타입", () => {
      // 목적: array 타입이 "z.array(elementType)" 형태로 올바르게 변환되는지 검증 (중첩 배열 포함)
      test.each([
        // [설명, Zod array 타입, 기대하는 Zod 코드]
        ["array of strings", z.array(z.string()), "z.array(z.string())"],
        ["array of numbers", z.array(z.number()), "z.array(z.number())"],
        ["nested array", z.array(z.array(z.string())), "z.array(z.array(z.string()))"], // 중첩 배열도 재귀적으로 처리
      ])("%s", (_desc, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Object 타입", () => {
      // 목적: object 타입이 "z.object({ 필드: 타입, ... })" 형태로 올바르게 변환되는지 검증
      test("simple object", () => {
        // 기대: 기본 객체가 z.object 형태로 변환
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

      test("object with optional field", () => {
        // 기대: optional 필드는 ".optional()" 메서드 체이닝 포함
        const zodType = z.object({
          id: z.number(),
          name: z.string().optional(),
        });
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("id: z.number(),");
        expect(result).toContain("name: z.string().optional(),");
      });
    });

    describe("Intersection 타입", () => {
      // 목적: intersection 타입이 "z.intersection(타입1, 타입2)" 형태로 올바르게 변환되는지 검증
      test("intersection of two objects", () => {
        const zodType = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }));
        const result = zodTypeToZodCode(zodType);
        expect(result).toContain("z.intersection(");
        expect(result).toContain("z.object({");
        expect(result).toContain("a: z.string(),");
        expect(result).toContain("b: z.number(),");
      });
    });

    describe("에러 케이스", () => {
      // 목적: 지원하지 않는 Zod 타입에 대해 적절한 에러를 발생시키는지 검증
      test("처리되지 않은 타입 → 에러", () => {
        const mockZodType = z.string();
        Object.defineProperty(mockZodType.def, "type", { value: "unsupported_type" });

        expect(() => zodTypeToZodCode(mockZodType)).toThrow(
          "처리되지 않은 ZodType unsupported_type",
        );
      });
    });

    describe("Optional 타입", () => {
      // 목적: optional 타입이 ".optional()" 메서드 체이닝 형태로 올바르게 변환되는지 검증
      test.each([
        // [타입명, Zod optional 타입, 기대하는 Zod 코드]
        ["optional string", z.string().optional(), "z.string().optional()"],
        ["optional number", z.number().optional(), "z.number().optional()"],
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Record 타입", () => {
      // 목적: record 타입이 "z.record(keyType, valueType)" 형태로 올바르게 변환되는지 검증
      test.each([
        // [설명, Zod record 타입, 기대하는 Zod 코드]
        [
          "string key and number value",
          z.record(z.string(), z.number()),
          "z.record(z.string(), z.number())",
        ],
        [
          "string key and string value",
          z.record(z.string(), z.string()),
          "z.record(z.string(), z.string())",
        ],
      ])("record with %s", (_desc, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Literal 타입", () => {
      // 목적: literal 타입이 "z.literal(value)" 형태로 올바르게 변환되는지 검증
      test.each([
        // [타입명, Zod literal 타잴 인스턴스, 기대하는 Zod 코드]
        ["string literal", z.literal("active"), 'z.literal("active")'], // 문자열은 따옴표로 감싸짐
        ["number literal", z.literal(42), "z.literal(42)"], // 숫자는 그대로
        ["null literal", z.literal(null), "z.literal(null)"], // null은 그대로
        ["undefined literal", z.literal(undefined), "z.literal(undefined)"], // undefined는 그대로
      ])("%s", (_name, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("Template Literal 타입", () => {
      // 목적: template literal 타입이 올바른 Zod 코드로 변환되는지 검증
      test.each([
        // [설명, Zod template literal 타입, 기대하는 Zod 코드]
        ["simple string", z.templateLiteral(["Hello"]), 'z.templateLiteral(["Hello"])'],
        [
          "with string type",
          z.templateLiteral(["Hello, ", z.string(), "!"]),
          'z.templateLiteral(["Hello, ", z.string(), "!"])',
        ],
        [
          "with number",
          z.templateLiteral([z.number(), "px"]),
          'z.templateLiteral([z.number(), "px"])',
        ],
        ["empty template", z.templateLiteral([]), "z.templateLiteral([])"],
        [
          "multiple parts",
          z.templateLiteral(["https://", z.string(), ".com"]),
          'z.templateLiteral(["https://", z.string(), ".com"])',
        ],
      ])("%s", (_desc, zodType, expected) => {
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe(expected);
      });
    });

    describe("File 타입", () => {
      // 목적: file 타입이 올바른 Zod 코드로 변환되는지 검증
      test("file type", () => {
        const zodType = z.file();
        const result = zodTypeToZodCode(zodType);
        expect(result).toBe("z.file()");
      });
    });
  });

  describe("propToZodType", () => {
    // 목적: EntityProp을 Zod 타입 인스턴스로 변환하고, 실제 데이터 검증이 올바르게 작동하는지 확인
    describe("Integer 타입", () => {
      // 목적: integer 타입 prop이 z.int() Zod 타입으로 변환되고 정수만 허용하는지 검증
      test("integer single", async () => {
        const prop: EntityProp = {
          type: "integer",
          name: "age",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, 42);
        expectToPass(zodType, 0);
        expectToFail(zodType, 3.14);
        expectToFail(zodType, "42");
      });

      test("integer array", async () => {
        const prop: EntityProp = {
          type: "integer[]",
          name: "ages",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, [1, 2, 3]);
        expectToPass(zodType, []);
        expectToFail(zodType, [1.5, 2]);
        expectToFail(zodType, ["1", "2"]);
      });

      test("integer with nullable", async () => {
        const prop: EntityProp = {
          type: "integer",
          name: "age",
          nullable: true,
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, 42);
        expectToPass(zodType, null);
        expectToFail(zodType, "42");
      });
    });

    describe("BigInteger 타입", () => {
      // 목적: bigInteger 타입 prop이 z.bigint() Zod 타입으로 변환되고 BigInt만 허용하는지 검증
      test("bigInteger single", async () => {
        const prop: EntityProp = {
          type: "bigInteger",
          name: "bigNum",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, BigInt(123));
        expectToFail(zodType, 123);
        expectToFail(zodType, "123");
      });

      test("bigInteger array", async () => {
        const prop: EntityProp = {
          type: "bigInteger[]",
          name: "bigNums",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, [BigInt(1), BigInt(2)]);
        expectToPass(zodType, []);
        expectToFail(zodType, [1, 2]);
      });
    });

    describe("String 타입", () => {
      // 목적: string 타입 prop이 z.string() Zod 타입으로 변환되고, length 옵션이 max 제약으로 적용되는지 검증
      test("string single", async () => {
        const prop: EntityProp = {
          type: "string",
          name: "name",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "test");
        expectToPass(zodType, "");
        expectToFail(zodType, 123);
      });

      test("string with length", async () => {
        const prop: EntityProp = {
          type: "string",
          name: "name",
          length: 10,
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "short");
        expectToPass(zodType, "1234567890");
        expectToFail(zodType, "12345678901");
      });

      test("string array", async () => {
        const prop: EntityProp = {
          type: "string[]",
          name: "tags",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, ["a", "b", "c"]);
        expectToPass(zodType, []);
        expectToFail(zodType, [1, 2, 3]);
      });

      test("string array with length", async () => {
        const prop: EntityProp = {
          type: "string[]",
          name: "tags",
          length: 5,
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, ["abc", "de"]);
        expectToFail(zodType, ["abcdef"]);
      });

      test("string with zodFormat email", async () => {
        // 목적: zodFormat이 email인 경우 z.email() 타입으로 변환되어 이메일 형식만 허용하는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "email",
          zodFormat: "email",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "test@example.com");
        expectToPass(zodType, "user.name+tag@domain.co.kr");
        expectToFail(zodType, "invalid-email");
        expectToFail(zodType, "missing@domain");
      });

      test("string with zodFormat uuid", async () => {
        // 목적: zodFormat이 uuid인 경우 z.uuid() 타입으로 변환되어 UUID 형식만 허용하는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "token",
          zodFormat: "uuid",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "550e8400-e29b-41d4-a716-446655440000");
        expectToFail(zodType, "not-a-uuid");
        expectToFail(zodType, "550e8400-e29b-41d4-a716");
      });

      test("string with zodFormat url", async () => {
        // 목적: zodFormat이 url인 경우 z.url() 타입으로 변환되어 URL 형식만 허용하는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "website",
          zodFormat: "url",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "https://example.com");
        expectToPass(zodType, "http://localhost:3000/path?query=1");
        expectToPass(zodType, "mailto:noreply@zod.dev");
        expectToFail(zodType, "not-a-url");
        expectToFail(zodType, "example.com");
      });

      test("string with zodFormat email and length", async () => {
        // 목적: zodFormat과 length가 함께 사용되는 경우 둘 다 적용되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "email",
          zodFormat: "email",
          length: 30,
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "test@example.com");
        expectToFail(zodType, "invalid-email");
        expectToFail(zodType, "verylongemail.address.here@verylongdomain.example.com");
      });

      test("string with zodFormat email and nullable", async () => {
        // 목적: zodFormat과 nullable이 함께 사용되는 경우 둘 다 적용되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "email",
          zodFormat: "email",
          nullable: true,
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "test@example.com");
        expectToPass(zodType, null);
        expectToFail(zodType, "invalid-email");
      });

      test("string array with zodFormat email", async () => {
        // 목적: 배열 타입에 zodFormat이 적용되는 경우 각 요소에 format 검증이 적용되는지 확인
        const prop: EntityProp = {
          type: "string[]",
          name: "emails",
          zodFormat: "email",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, ["test@example.com", "user@domain.org"]);
        expectToPass(zodType, []);
        expectToFail(zodType, ["test@example.com", "invalid-email"]);
        expectToFail(zodType, ["not-an-email"]);
      });

      test("string with zodFormat isoDatetime", async () => {
        // 목적: ISO datetime format이 올바르게 적용되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "createdAt",
          zodFormat: "isoDatetime",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "2024-01-15T10:30:00Z");
        expectToPass(zodType, "2024-01-15T10:30:00.123Z");
        expectToFail(zodType, "2024-01-15");
        expectToFail(zodType, "not-a-datetime");
      });

      test("string with zodFormat ipv4", async () => {
        // 목적: IPv4 format이 올바르게 적용되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "ipAddress",
          zodFormat: "ipv4",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "192.168.1.1");
        expectToPass(zodType, "10.0.0.1");
        expectToFail(zodType, "256.1.1.1");
        expectToFail(zodType, "not-an-ip");
      });
    });

    describe("Number 타입", () => {
      // 목적: number 타입 prop이 z.number() Zod 타입으로 변환되고 정수/실수 모두 허용하는지 검증
      test("number single", async () => {
        const prop: EntityProp = {
          type: "number",
          name: "price",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, 3.14);
        expectToPass(zodType, 42);
        expectToFail(zodType, "3.14");
      });

      test("number array", async () => {
        const prop: EntityProp = {
          type: "number[]",
          name: "prices",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, [1.5, 2.5, 3.5]);
        expectToPass(zodType, []);
        expectToFail(zodType, ["1.5", "2.5"]);
      });
    });

    describe("Numeric 타입", () => {
      // 목적: numeric 타입 prop이 z.string() Zod 타입으로 변환되는지 검증 (정밀도 유지를 위해 문자열 사용)
      test("numeric single", async () => {
        const prop: EntityProp = {
          type: "numeric",
          name: "amount",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "123.45");
        expectToFail(zodType, 123.45);
      });

      test("numeric array", async () => {
        const prop: EntityProp = {
          type: "numeric[]",
          name: "amounts",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, ["123.45", "678.90"]);
        expectToFail(zodType, [123.45, 678.9]);
      });
    });

    describe("Boolean 타입", () => {
      // 목적: boolean 타입 prop이 z.boolean() Zod 타입으로 변환되고 true/false만 허용하는지 검증
      test("boolean single", async () => {
        const prop: EntityProp = {
          type: "boolean",
          name: "active",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, true);
        expectToPass(zodType, false);
        expectToFail(zodType, "true");
        expectToFail(zodType, 1);
      });

      test("boolean array", async () => {
        const prop: EntityProp = {
          type: "boolean[]",
          name: "flags",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, [true, false, true]);
        expectToPass(zodType, []);
        expectToFail(zodType, ["true", "false"]);
      });
    });

    describe("Date 타입", () => {
      // 목적: date 타입 prop이 z.date() Zod 타입으로 변환되고 Date 객체만 허용하는지 검증
      test("date single", async () => {
        const prop: EntityProp = {
          type: "date",
          name: "createdAt",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, new Date());
        expectToFail(zodType, "2024-01-01");
        expectToFail(zodType, 1234567890);
      });

      test("date array", async () => {
        const prop: EntityProp = {
          type: "date[]",
          name: "dates",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, [new Date(), new Date()]);
        expectToPass(zodType, []);
        expectToFail(zodType, ["2024-01-01", "2024-01-02"]);
      });
    });

    describe("UUID 타입", () => {
      // 목적: uuid 타입 prop이 z.uuid() Zod 타입으로 변환되고 UUID 형식만 허용하는지 검증
      test("uuid single", async () => {
        const prop: EntityProp = {
          type: "uuid",
          name: "id",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, "550e8400-e29b-41d4-a716-446655440000");
        expectToFail(zodType, "not-a-uuid");
        expectToFail(zodType, 123);
      });

      test("uuid array", async () => {
        const prop: EntityProp = {
          type: "uuid[]",
          name: "ids",
        };
        const zodType = await propToZodType(prop);

        expectToPass(zodType, [
          "550e8400-e29b-41d4-a716-446655440000",
          "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        ]);
        expectToPass(zodType, []);
        expectToFail(zodType, ["not-a-uuid"]);
      });
    });
  });

  describe("propToZodTypeDef", () => {
    describe("Integer 타입", () => {
      // 목적: integer 타입 prop이 올바른 Zod 코드로 변환되는지 검증 (single/array/nullable)
      test.each([
        // [설명, EntityProp, 기대하는 Zod 코드, 기대하는 importKeys]
        ["integer single", { type: "integer" as const, name: "age" }, "age: z.int(),", []],
        [
          "integer array",
          { type: "integer[]" as const, name: "ages" },
          "ages: z.int().array(),",
          [],
        ],
        [
          "integer with nullable",
          { type: "integer" as const, name: "age", nullable: true },
          "age: z.int().nullable(),",
          [],
        ],
      ])("%s", (_desc, prop, expectedCode, expectedImports) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
        expect(importKeys).toEqual(expectedImports);
      });
    });

    describe("BigInteger 타입", () => {
      // 목적: bigInteger 타입 prop이 올바른 Zod 코드로 변환되는지 검증 (single/array)
      test.each([
        // [설명, EntityProp, 기대하는 Zod 코드]
        [
          "bigInteger single",
          { type: "bigInteger" as const, name: "bigNum" },
          "bigNum: z.bigint(),",
        ],
        [
          "bigInteger array",
          { type: "bigInteger[]" as const, name: "bigNums" },
          "bigNums: z.bigint().array(),",
        ],
      ])("%s", (_desc, prop, expectedCode) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
      });
    });

    describe("Enum 타입", () => {
      // 목적: enum 타입 prop이 타입 ID를 참조하는 형태로 변환되고, import 키가 올바르게 수집되는지 검증
      test("enum single", () => {
        // 기대: "필드명: EnumType," 형태로 변환되고 importKeys에 EnumType 추가
        const prop: EntityProp = {
          type: "enum",
          name: "status",
          id: "UserStatus",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("status: UserStatus,");
        expect(importKeys).toEqual(["UserStatus"]);
      });

      test("enum array", () => {
        // 기대: "필드명: EnumType.array()," 형태로 변환
        const prop: EntityProp = {
          type: "enum[]",
          name: "statuses",
          id: "UserStatus",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("statuses: UserStatus.array(),");
        expect(importKeys).toEqual(["UserStatus"]);
      });
    });

    describe("String 타입", () => {
      // 목적: string 타입 prop이 "z.string()" 형태로 변환되고, length 옵션이 ".max()" 메서드로 적용되는지 검증
      test("string single", () => {
        const prop: EntityProp = {
          type: "string",
          name: "name",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("name: z.string(),");
      });

      test("string with length", () => {
        // 기대: length 옵션이 .max(길이) 메서드로 변환
        const prop: EntityProp = {
          type: "string",
          name: "name",
          length: 100,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("name: z.string().max(100),");
      });

      test("string array", () => {
        const prop: EntityProp = {
          type: "string[]",
          name: "tags",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("tags: z.string().array(),");
      });

      test("string array with length", () => {
        // 기대: 배열의 각 요소에 max 제약 적용
        const prop: EntityProp = {
          type: "string[]",
          name: "tags",
          length: 50,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("tags: z.string().max(50).array(),");
      });

      test("string with zodFormat email", () => {
        // 목적: zodFormat이 email인 경우 z.email() 코드로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "email",
          zodFormat: "email",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("email: z.email(),");
      });

      test("string with zodFormat uuid", () => {
        // 목적: zodFormat이 uuid인 경우 z.uuid() 코드로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "token",
          zodFormat: "uuid",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("token: z.uuid(),");
      });

      test("string with zodFormat url", () => {
        // 목적: zodFormat이 url인 경우 z.url() 코드로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "website",
          zodFormat: "url",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("website: z.url(),");
      });

      test("string with zodFormat email and length", () => {
        // 목적: zodFormat과 length가 함께 사용되는 경우 z.email().max(길이) 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "email",
          zodFormat: "email",
          length: 100,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("email: z.email().max(100),");
      });

      test("string with zodFormat email and nullable", () => {
        // 목적: zodFormat과 nullable이 함께 사용되는 경우 z.email().nullable() 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "email",
          zodFormat: "email",
          nullable: true,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("email: z.email().nullable(),");
      });

      test("string array with zodFormat email", () => {
        // 목적: 배열 타입에 zodFormat이 적용되는 경우 z.email().array() 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string[]",
          name: "emails",
          zodFormat: "email",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("emails: z.email().array(),");
      });

      test("string array with zodFormat email and length", () => {
        // 목적: 배열 타입에 zodFormat과 length가 함께 사용되는 경우 z.email().max(길이).array() 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string[]",
          name: "emails",
          zodFormat: "email",
          length: 100,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("emails: z.email().max(100).array(),");
      });

      test("string with zodFormat isoDatetime", () => {
        // 목적: ISO datetime format이 z.iso.datetime() 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "createdAt",
          zodFormat: "isoDatetime",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("createdAt: z.iso.datetime(),");
      });

      test("string with zodFormat hashSha256", () => {
        // 목적: hash format이 z.hash("sha256") 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "checksum",
          zodFormat: "hashSha256",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe('checksum: z.hash("sha256"),');
      });

      test("string with zodFormat ipv4", () => {
        // 목적: ipv4 format이 z.ipv4() 형태로 변환되는지 검증
        const prop: EntityProp = {
          type: "string",
          name: "ipAddress",
          zodFormat: "ipv4",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("ipAddress: z.ipv4(),");
      });
    });

    describe("Number 타입", () => {
      // 목적: number 타입 prop이 올바른 Zod 코드로 변환되는지 검증 (single/array)
      test.each([
        // [설명, EntityProp, 기대하는 Zod 코드]
        ["number single", { type: "number" as const, name: "price" }, "price: z.number(),"],
        [
          "number array",
          { type: "number[]" as const, name: "prices" },
          "prices: z.number().array(),",
        ],
      ])("%s", (_desc, prop, expectedCode) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
      });
    });

    describe("Numeric 타입", () => {
      // 목적: numeric 타입 prop이 string으로 변환되는지 검증 (정밀도 유지를 위해 문자열 사용)
      test.each([
        // [설명, EntityProp, 기대하는 Zod 코드]
        [
          "numeric single",
          { type: "numeric" as const, name: "amount" },
          'amount: z.string().meta({ SonamuPropType: "numeric" }),',
        ],
        [
          "numeric array",
          { type: "numeric[]" as const, name: "amounts" },
          'amounts: z.string().array().meta({ SonamuPropType: "numeric" }),',
        ],
      ])("%s", (_desc, prop, expectedCode) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
      });
    });

    describe("Date 타입", () => {
      // 목적: date 타입 prop이 올바른 Zod 코드로 변환되는지 검증 (single/array)
      test.each([
        // [설명, EntityProp, 기대하는 Zod 코드]
        ["date single", { type: "date" as const, name: "createdAt" }, "createdAt: z.date(),"],
        ["date array", { type: "date[]" as const, name: "dates" }, "dates: z.date().array(),"],
      ])("%s", (_desc, prop, expectedCode) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
      });
    });

    describe("Boolean 타입", () => {
      // 목적: boolean 타입 prop이 올바른 Zod 코드로 변환되는지 검증 (single/array)
      test.each([
        // [설명, EntityProp, 기대하는 Zod 코드]
        ["boolean single", { type: "boolean" as const, name: "active" }, "active: z.boolean(),"],
        [
          "boolean array",
          { type: "boolean[]" as const, name: "flags" },
          "flags: z.boolean().array(),",
        ],
      ])("%s", (_desc, prop, expectedCode) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
      });
    });

    describe("UUID 타입", () => {
      // 목적: uuid 타입 prop이 올바른 Zod 코드로 변환되는지 검증 (single/array)
      test.each([
        ["uuid single", { type: "uuid" as const, name: "id" }, "id: z.uuid(),"],
        ["uuid array", { type: "uuid[]" as const, name: "ids" }, "ids: z.uuid().array(),"],
      ])("%s", (_desc, prop, expectedCode) => {
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe(expectedCode);
      });
    });

    describe("JSON 타입", () => {
      // 목적: json 타입 prop이 타입 ID를 참조하는 형태로 변환되고, import 키가 올바르게 수집되는지 검증
      test("json prop", () => {
        const prop: EntityProp = {
          type: "json",
          name: "metadata",
          id: "UserMetadata",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("metadata: UserMetadata,");
        expect(importKeys).toEqual(["UserMetadata"]);
      });
    });

    describe("Virtual 타입", () => {
      // 목적: virtual 타입 prop이 타입 ID를 참조하는 형태로 변환되고, import 키가 올바르게 수집되는지 검증
      test("virtual prop", () => {
        const prop: EntityProp = {
          type: "virtual",
          name: "fullName",
          id: "FullNameType",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("fullName: FullNameType,");
        expect(importKeys).toEqual(["FullNameType"]);
      });
    });

    describe("Relation 타입", () => {
      // 목적: relation 타입 prop이 관계 타입에 따라 적절한 형태로 변환되는지 검증
      test("BelongsToOne relation", () => {
        // 기대: BelongsToOne은 "필드명_id: z.int()," 형태로 변환 (외래키 필드 생성)
        const prop: EntityProp = {
          type: "relation",
          name: "company",
          relationType: "BelongsToOne",
          with: "Company",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("company_id: z.int(),");
      });

      test("OneToOne relation with join column", () => {
        // 기대: hasJoinColumn이 true인 OneToOne은 "필드명_id: z.int()," 형태로 변환
        const prop: EntityProp = {
          type: "relation",
          name: "company",
          relationType: "OneToOne",
          with: "Company",
          hasJoinColumn: true,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("company_id: z.int(),");
      });

      test("OneToOne relation without join column", () => {
        // 기대: hasJoinColumn이 false인 OneToOne은 주석으로만 표시
        const prop: EntityProp = {
          type: "relation",
          name: "user",
          relationType: "OneToOne",
          with: "User",
          hasJoinColumn: false,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("// user: OneToOne User");
      });

      test("HasMany relation", () => {
        // 기대: HasMany는 주석으로만 표시 (역방향 관계)
        const prop: EntityProp = {
          type: "relation",
          name: "posts",
          relationType: "HasMany",
          with: "Post",
          joinColumn: "user_id",
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("// posts: HasMany Post");
      });
    });

    describe("FK 타입이 참조 엔티티 PK 타입에 따라 결정", () => {
      // 목적: 참조 엔티티의 PK 타입(integer/string/uuid)에 따라 FK Zod 타입이 달라지는지 검증
      // User 엔티티는 integer PK를 사용하므로 z.int()가 생성되어야 함
      test("BelongsToOne - integer PK 엔티티 참조시 z.int() 생성", () => {
        const prop: EntityProp = {
          type: "relation",
          name: "company",
          relationType: "BelongsToOne",
          with: "Company", // Company는 integer PK
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("company_id: z.int(),");
      });

      test("OneToOne with join column - integer PK 엔티티 참조시 z.int() 생성", () => {
        const prop: EntityProp = {
          type: "relation",
          name: "company",
          relationType: "OneToOne",
          with: "Company", // Company는 integer PK
          hasJoinColumn: true,
        };
        const importKeys: string[] = [];
        const result = propToZodTypeDef(prop, importKeys);

        expect(result).toBe("company_id: z.int(),");
      });

      // TODO: string/uuid PK 엔티티에 대한 테스트는 해당 엔티티가 실제로 존재해야 함
      // 현재 miomock에는 string/uuid PK 엔티티가 없으므로, 해당 엔티티 추가 후 테스트 확장 필요
    });
  });

  describe("propNodeToZodTypeDef", () => {
    // 목적: EntityPropNode (재귀 구조)를 Zod 코드로 변환하는 기능 검증
    describe("Plain 노드", () => {
      // 목적: plain 노드가 단순 prop으로 변환되는지 검증
      test("plain node with integer prop", () => {
        const propNode: EntityPropNode = {
          nodeType: "plain",
          prop: {
            type: "integer",
            name: "age",
          },
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toBe("age: z.int(),");
      });

      test("plain node with string prop", () => {
        const propNode: EntityPropNode = {
          nodeType: "plain",
          prop: {
            type: "string",
            name: "name",
          },
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toBe("name: z.string(),");
      });
    });

    describe("Array 노드", () => {
      // 목적: array 노드가 "z.array(z.object({ 자식들... }))" 형태로 변환되는지 검증
      test("array node with children", () => {
        // 기대: children이 객체 형태로 묶여서 배열의 요소 타입이 됨

        const propNode: EntityPropNode = {
          nodeType: "array",
          prop: {
            type: "json",
            name: "items",
            id: "ItemType",
          },
          children: [
            {
              nodeType: "plain",
              prop: {
                type: "integer",
                name: "id",
              },
            },
            {
              nodeType: "plain",
              prop: {
                type: "string",
                name: "name",
              },
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("items:");
        expect(result).toContain("z.array(z.object({");
        expect(result).toContain("id: z.int(),");
        expect(result).toContain("name: z.string(),");
        expect(result).toContain("}))");
      });

      test("array node without prop (root array)", () => {
        // 기대: prop이 없는 경우 필드명 없이 z.array만 생성 (루트 배열)
        const propNode: EntityPropNode = {
          nodeType: "array",
          children: [
            {
              nodeType: "plain",
              prop: {
                type: "integer",
                name: "value",
              },
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("z.array(z.object({");
        expect(result).toContain("value: z.int(),");
        expect(result).not.toContain("items:");
      });
    });

    describe("Object 노드", () => {
      // 목적: object 노드가 "z.object({ 자식들... })" 형태로 변환되는지 검증
      test("object node with children", () => {
        // 기대: children이 객체의 필드들로 변환됨

        const propNode: EntityPropNode = {
          nodeType: "object",
          prop: {
            type: "json",
            name: "address",
            id: "AddressType",
          },
          children: [
            {
              nodeType: "plain",
              prop: {
                type: "string",
                name: "street",
              },
            },
            {
              nodeType: "plain",
              prop: {
                type: "string",
                name: "city",
              },
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("address:");
        expect(result).toContain("z.object({");
        expect(result).toContain("street: z.string(),");
        expect(result).toContain("city: z.string(),");
        expect(result).toContain("})");
      });

      test("object node with nullable", () => {
        // 기대: nullable 옵션이 ".nullable()" 메서드로 적용됨

        const propNode: EntityPropNode = {
          nodeType: "object",
          prop: {
            type: "json",
            name: "metadata",
            id: "MetadataType",
            nullable: true,
          },
          children: [
            {
              nodeType: "plain",
              prop: {
                type: "string",
                name: "key",
              },
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("metadata:");
        expect(result).toContain("z.object({");
        expect(result).toContain("key: z.string(),");
        expect(result).toContain("}).nullable()");
      });

      test("object node without prop (root object)", () => {
        // 기대: prop이 없는 경우 필드명 없이 z.object만 생성 (루트 객체)

        const propNode: EntityPropNode = {
          nodeType: "object",
          children: [
            {
              nodeType: "plain",
              prop: {
                type: "integer",
                name: "id",
              },
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("z.object({");
        expect(result).toContain("id: z.int(),");
        expect(result).not.toContain("metadata:");
      });
    });

    describe("재귀 구조", () => {
      // 목적: 중첩된 노드 구조가 재귀적으로 올바르게 변환되는지 검증
      test("nested object in array", () => {
        // 기대: 배열 안의 객체가 재귀적으로 변환됨

        const propNode: EntityPropNode = {
          nodeType: "array",
          prop: {
            type: "json",
            name: "users",
            id: "UsersType",
          },
          children: [
            {
              nodeType: "object",
              prop: {
                type: "json",
                name: "profile",
                id: "ProfileType",
              },
              children: [
                {
                  nodeType: "plain",
                  prop: {
                    type: "string",
                    name: "bio",
                  },
                },
              ],
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("users:");
        expect(result).toContain("z.array(z.object({");
        expect(result).toContain("profile:");
        expect(result).toContain("z.object({");
        expect(result).toContain("bio: z.string(),");
      });

      test("nested array in object", () => {
        // 기대: 객체 안의 배열이 재귀적으로 변환됨

        const propNode: EntityPropNode = {
          nodeType: "object",
          prop: {
            type: "json",
            name: "data",
            id: "DataType",
          },
          children: [
            {
              nodeType: "array",
              prop: {
                type: "json",
                name: "tags",
                id: "TagsType",
              },
              children: [
                {
                  nodeType: "plain",
                  prop: {
                    type: "string",
                    name: "label",
                  },
                },
              ],
            },
          ],
        };
        const importKeys: string[] = [];
        const result = propNodeToZodTypeDef(propNode, importKeys);

        expect(result).toContain("data:");
        expect(result).toContain("z.object({");
        expect(result).toContain("tags:");
        expect(result).toContain("z.array(z.object({");
        expect(result).toContain("label: z.string(),");
      });
    });
  });

  describe("zodTypeToRenderingNode", () => {
    // 목적: Zod 타입을 UI 렌더링에 필요한 RenderingNode 구조로 변환하는 기능 검증
    describe("Object 타입", () => {
      // 목적: object 타입이 renderType "object"로 변환되고 children이 올바르게 생성되는지 검증
      test("simple object", () => {
        // 기대: 각 필드가 children 배열의 요소가 되고, label이 자동 생성됨

        const zodType = z.object({
          id: z.number(),
          name: z.string(),
        });
        const result = zodTypeToRenderingNode(zodType, "user");

        expect(result.name).toBe("user");
        expect(result.label).toBe("User");
        expect(result.renderType).toBe("object");
        expect(result.children).toHaveLength(2);
        expect(result.children?.[0]?.name).toBe("id");
        expect(result.children?.[1]?.name).toBe("name");
      });

      test("nested object", () => {
        const zodType = z.object({
          user: z.object({
            id: z.number(),
            name: z.string(),
          }),
        });
        const result = zodTypeToRenderingNode(zodType);

        expect(result.renderType).toBe("object");
        expect(result.children).toHaveLength(1);
        expect(result.children?.[0]?.name).toBe("user");
        expect(result.children?.[0]?.renderType).toBe("object");
      });
    });

    describe("Array 타입", () => {
      // 목적: array 타입이 renderType "array"로 변환되고 element가 올바르게 생성되는지 검증
      test("array of strings", () => {
        // 기대: 배열의 요소 타입이 element 필드에 저장됨

        const zodType = z.array(z.string());
        const result = zodTypeToRenderingNode(zodType, "tags");

        expect(result.name).toBe("tags");
        expect(result.renderType).toBe("array");
        expect(result.element).toBeDefined();
        expect(result.element?.renderType).toBe("string-plain");
      });

      test("array of numbers", () => {
        const zodType = z.array(z.number());
        const result = zodTypeToRenderingNode(zodType, "scores");

        expect(result.renderType).toBe("array");
        expect(result.element?.renderType).toBe("number-plain");
      });

      test("array of objects", () => {
        // 기대: 배열의 요소가 객체인 경우 element가 object renderType을 가짐

        const zodType = z.array(
          z.object({
            id: z.number(),
            name: z.string(),
          }),
        );
        const result = zodTypeToRenderingNode(zodType, "users");

        expect(result.renderType).toBe("array");
        expect(result.element?.renderType).toBe("object");
        expect(result.element?.children).toHaveLength(2);
      });
    });

    describe("Union 타입", () => {
      // 목적: union 타입이 첫 번째 옵션의 타입으로 변환되는지 검증 (UI 렌더링 단순화)
      test("union returns first option", () => {
        // 기대: union의 첫 번째 타입만 사용됨

        const zodType = z.union([z.string(), z.number()]);
        const result = zodTypeToRenderingNode(zodType, "value");

        expect(result.name).toBe("value");
        expect(result.renderType).toBe("string-plain");
      });
    });

    describe("Optional 타입", () => {
      // 목적: optional 타입이 optional 플래그와 함께 올바르게 변환되는지 검증
      test("optional string", () => {
        // 기대: optional 필드가 true로 설정되고 내부 타입이 추출됨

        const zodType = z.string().optional();
        const result = zodTypeToRenderingNode(zodType, "name");

        expect(result.name).toBe("name");
        expect(result.optional).toBe(true);
        expect(result.renderType).toBe("string-plain");
      });

      test("optional number", () => {
        const zodType = z.number().optional();
        const result = zodTypeToRenderingNode(zodType, "age");

        expect(result.optional).toBe(true);
        expect(result.renderType).toBe("number-plain");
      });
    });

    describe("Nullable 타입", () => {
      // 목적: nullable 타입이 nullable 플래그와 함께 올바르게 변환되는지 검증
      test("nullable string", () => {
        // 기대: nullable 필드가 true로 설정되고 내부 타입이 추출됨

        const zodType = z.string().nullable();
        const result = zodTypeToRenderingNode(zodType, "description");

        expect(result.name).toBe("description");
        expect(result.nullable).toBe(true);
        expect(result.renderType).toBe("string-plain");
      });

      test("nullable number", () => {
        const zodType = z.number().nullable();
        const result = zodTypeToRenderingNode(zodType, "score");

        expect(result.nullable).toBe(true);
        expect(result.renderType).toBe("number-plain");
      });
    });

    describe("Primitive 타입 - resolveRenderType", () => {
      // 목적: Zod 타입과 키 이름에 따라 적절한 UI 렌더링 타입이 결정되는지 검증
      // resolveRenderType 함수는 키 이름의 패턴(img, image, date, _id 등)을 분석하여 UI 렌더링 방식을 결정
      test.each([
        // [설명, Zod 타입, 키 이름, 기대하는 renderType]
        // Date 타입
        ["Date type", z.date(), "createdAt", "datetime"], // z.date() → "datetime"

        // String 타입 - 키 이름에 따라 다른 renderType
        [
          "String with SQLDateTimeString description",
          z.string().describe("SQLDateTimeString"),
          "timestamp",
          "string-datetime",
        ], // description이 "SQLDateTimeString" → datetime
        ["String ending with date", z.string(), "birthdate", "string-date"], // "date"로 끝남 → 날짜
        ["String plain", z.string(), "name", "string-plain"], // 일반 문자열

        // Number 타입 - 키 이름에 따라 다른 renderType
        ["Number with id key", z.number(), "id", "number-id"], // 키가 "id" → Primary Key
        ["Number ending with _id", z.number(), "user_id", "number-fk_id"], // "_id"로 끝남 → Foreign Key
        ["Number plain", z.number(), "age", "number-plain"], // 일반 숫자

        // SonamuFile 타입
        ["SonamuFile object", SonamuFileSchema.describe("SonamuFile"), "avatar", "json-sonamufile"], // SonamuFile 구조 → "json-sonamufile"
        [
          "SonamuFile array",
          SonamuFileArraySchema.describe("SonamuFile[]"),
          "images",
          "json-sonamufile-array",
        ], // SonamuFile[] 구조 → "json-sonamufile-array"

        // 기타 타입들
        ["Boolean type", z.boolean(), "active", "boolean"], // boolean → "boolean"
        ["Enum type", z.enum(["active", "inactive"]), "status", "enums"], // enum → "enums"
        ["Record type", z.record(z.string(), z.number()), "metadata", "record"], // record → "record"
        ["Any type", z.any(), "data", "string-plain"], // any → "string-plain" (fallback)
        ["Unknown type", z.unknown(), "data", "string-plain"], // unknown → "string-plain" (fallback)
        ["Literal type", z.literal("active"), "status", "string-plain"], // literal → "string-plain"
        [
          "Template literal type",
          z.templateLiteral(["Hello", z.string()]),
          "greeting",
          "string-plain",
        ], // template literal → "string-plain"
      ])("%s", (_desc, zodType, key, expectedRenderType) => {
        const result = zodTypeToRenderingNode(zodType, key);
        expect(result.renderType).toBe(expectedRenderType);
      });
    });
  });
});
