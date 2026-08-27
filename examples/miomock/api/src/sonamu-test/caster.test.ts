import { test } from "sonamu/test";
import { describe, expect } from "vitest";
import { z } from "zod";

import { caster, fastifyCaster } from "../../../../../modules/sonamu/dist/api/caster";

describe("caster", () => {
  describe("헬퍼 함수 테스트", () => {
    test("isNumberType: 기본 숫자 타입을 인식하여 문자열을 숫자로 변환", () => {
      const schema = z.number();
      const raw = "123";
      const result = caster(schema, raw);
      expect(result).toBe(123);
      expect(result).toEqual(expect.any(Number));
    });

    test("isNullOrOptional: nullable 타입을 인식하여 내부 타입 변환 수행", () => {
      const schema = z.number().nullable();
      const raw = "456"; // 문자열을 넣어서 변환이 일어나는지 확인
      const result = caster(schema, raw);
      expect(result).toBe(456); // nullable이지만 내부 number 타입으로 변환되어야 함
    });

    test("isNullOrOptional: optional 타입을 인식하여 내부 타입 변환 수행", () => {
      const schema = z.string().optional();
      const raw = "test";
      const result = caster(schema, raw);
      expect(result).toBe("test");
    });

    test("isZodNumberAnyway: optional로 감싸진 숫자 타입을 인식하여 문자열을 숫자로 변환", () => {
      const schema = z.number().optional();
      const raw = "789"; // 문자열을 넣어서 변환 확인
      const result = caster(schema, raw);
      expect(result).toBe(789);
    });

    test("isZodNumberAnyway: nullable로 감싸진 숫자 타입을 인식하여 문자열을 숫자로 변환", () => {
      const schema = z.number().nullable();
      const raw = "999";
      const result = caster(schema, raw);
      expect(result).toBe(999);
    });
  });

  describe("caster()", () => {
    describe("숫자 변환", () => {
      test("문자열 숫자를 number로 변환", () => {
        const schema = z.number();
        const raw = "123";
        const result = caster(schema, raw);
        expect(result).toEqual(123);
      });
      test("nullable number + 문자열 숫자 변환", () => {
        const schema = z.number().nullable();
        const raw = "123";
        const result = caster(schema, raw);
        expect(result).toEqual(123);
      });
      test("optional number + 문자열 숫자 변환", () => {
        const schema = z.number().optional();
        const raw = "123";
        const result = caster(schema, raw);
        expect(result).toEqual(123);
      });
      test("이미 숫자면 그대로 반환", () => {
        const schema = z.number();
        const raw = 123;
        const result = caster(schema, raw);
        expect(result).toEqual(123);
      });
    });

    describe("Union 타입 (zArrayable)", () => {
      test("Union에 숫자 포함 + 문자열 → 숫자 변환", () => {
        const schema = z.union([z.number(), z.string()]);
        const raw = "123";
        const result = caster(schema, raw);
        expect(result).toEqual(123);
      });

      test("Union에 숫자 포함 + 문자열 배열 → 각 요소 숫자 변환", () => {
        const schema = z.union([z.number(), z.array(z.number())]);
        const raw = ["123", "456", "789"];
        const result = caster(schema, raw);
        expect(result).toEqual([123, 456, 789]);
      });

      test("Union에 숫자 포함 + 배열 → 각 요소 숫자 변환", () => {
        const schema = z.union([z.number(), z.array(z.number())]);
        const raw = [123, 456];
        const result = caster(schema, raw);
        expect(result).toEqual([123, 456]);
      });

      test("Union에 숫자 포함 + 단일 숫자 문자열 → 숫자 변환", () => {
        const schema = z.union([z.number(), z.array(z.number())]);
        const raw = "42";
        const result = caster(schema, raw);
        expect(result).toBe(42);
      });
    });

    describe("Boolean 변환", () => {
      test("문자열 'true'를 boolean true로 변환", () => {
        const schema = z.boolean();
        const raw = "true";
        const result = caster(schema, raw);
        expect(result).toEqual(true);
      });
      test("문자열 'false'를 boolean false로 변환", () => {
        const schema = z.boolean();
        const raw = "false";
        const result = caster(schema, raw);
        expect(result).toEqual(false);
      });
      test("이미 boolean이면 그대로 반환", () => {
        const schema = z.boolean();
        const raw = true;
        const result = caster(schema, raw);
        expect(result).toEqual(true);
      });
    });

    describe("Array 변환", () => {
      test("숫자 배열: 문자열 배열을 숫자 배열로 변환", () => {
        const schema = z.array(z.number());
        const raw = ["123", "456", "789"]; // 문자열 배열
        const result = caster(schema, raw);
        expect(result).toEqual([123, 456, 789]); // 숫자 배열로 변환
      });

      test("객체 배열: 각 객체의 속성을 재귀적으로 변환", () => {
        const schema = z.array(
          z.object({
            id: z.number(),
            name: z.string(),
          }),
        );
        const raw = [
          { id: "1", name: "John" }, // id가 문자열
          { id: "2", name: "Jane" },
        ];
        const result = caster(schema, raw);
        expect(result).toEqual([
          { id: 1, name: "John" }, // id가 숫자로 변환
          { id: 2, name: "Jane" },
        ]);
      });

      test("중첩 배열: 문자열을 숫자로 재귀 변환", () => {
        const schema = z.array(z.array(z.number()));
        const raw = [
          ["1", "2", "3"], // 문자열 배열
          ["4", "5", "6"],
        ];
        const result = caster(schema, raw);
        expect(result).toEqual([
          [1, 2, 3], // 숫자 배열로 변환
          [4, 5, 6],
        ]);
      });

      test("빈 배열은 그대로 반환", () => {
        const schema = z.array(z.number());

        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 캐스팅에는 any가 필요함
        const raw: any[] = [];
        const result = caster(schema, raw);
        expect(result).toEqual([]);
      });

      test("null은 변환하지 않고 그대로 반환", () => {
        const schema = z.array(z.number());
        const raw = null;
        const result = caster(schema, raw);
        expect(result).toBeNull();
      });
    });

    describe("Object 변환", () => {
      test("객체의 각 속성을 재귀적으로 변환", () => {
        const schema = z.object({
          id: z.number(),
          name: z.string(),
          active: z.boolean(),
        });
        const raw = {
          id: "123", // 문자열
          name: "John",
          active: "true", // 문자열
        };
        const result = caster(schema, raw);
        expect(result).toEqual({
          id: 123, // 숫자로 변환
          name: "John",
          active: true, // boolean으로 변환
        });
      });

      test("중첩 객체의 속성을 재귀적으로 변환", () => {
        const schema = z.object({
          userId: z.number(),
          profile: z.object({
            age: z.number(),
            verified: z.boolean(),
          }),
        });
        const raw = {
          userId: "999",
          profile: {
            age: "25",
            verified: "false",
          },
        };
        const result = caster(schema, raw);
        expect(result).toEqual({
          userId: 999,
          profile: {
            age: 25,
            verified: false,
          },
        });
      });

      test("배열과 객체가 혼합된 복잡한 구조 변환", () => {
        const schema = z.object({
          items: z.array(
            z.object({
              id: z.number(),
              tags: z.array(z.string()),
            }),
          ),
        });
        const raw = {
          items: [
            { id: "1", tags: ["a", "b"] },
            { id: "2", tags: ["c", "d"] },
          ],
        };
        const result = caster(schema, raw);
        expect(result).toEqual({
          items: [
            { id: 1, tags: ["a", "b"] },
            { id: 2, tags: ["c", "d"] },
          ],
        });
      });
    });

    describe("Date 변환", () => {
      test("유효한 날짜 문자열을 Date로 변환", () => {
        const schema = z.date();
        const raw = "2025-01-01";
        const result = caster(schema, raw);
        expect(result).toEqual(new Date("2025-01-01"));
      });
      test("Invalid Date는 변환 안함", () => {
        const schema = z.date();
        const raw = "invalid date";
        const result = caster(schema, raw);
        expect(result).toEqual("invalid date");
      });
    });

    describe("Optional/Nullable 처리", () => {
      test("optional + null → null", () => {
        const schema = z.number().optional();
        const raw = null;
        const result = caster(schema, raw);
        expect(result).toEqual(null);
      });

      test("optional + 문자열 숫자 → 내부 타입으로 변환", () => {
        const schema = z.number().optional();
        const raw = "456"; // 문자열
        const result = caster(schema, raw);
        expect(result).toBe(456); // 숫자로 변환
      });

      test("nullable + null → null", () => {
        const schema = z.number().nullable();
        const raw = null;
        const result = caster(schema, raw);
        expect(result).toEqual(null);
      });

      test("nullable + 문자열 숫자 → 내부 타입으로 변환", () => {
        const schema = z.number().nullable();
        const raw = "789"; // 문자열
        const result = caster(schema, raw);
        expect(result).toBe(789); // 숫자로 변환
      });

      test("optional().nullable() 이중 래핑 처리", () => {
        const schema = z.number().optional().nullable();
        const raw = "123";
        const result = caster(schema, raw);
        expect(result).toBe(123);
      });

      test("optional + undefined → undefined", () => {
        const schema = z.number().optional();
        const raw = undefined;
        const result = caster(schema, raw);
        expect(result).toBeUndefined();
      });
    });

    describe("기본 케이스 (변환 안함)", () => {
      test("문자열은 그대로 반환", () => {
        const schema = z.string();
        const raw = "hello";
        const result = caster(schema, raw);
        expect(result).toEqual("hello");
      });
      test("이미 올바른 타입이면 그대로 반환", () => {
        const schema = z.string();
        const raw = "hello";
        const result = caster(schema, raw);
        expect(result).toEqual("hello");
      });
    });

    describe("그 외 발생 가능한 케이스 테스트", () => {
      test("빈 문자열을 숫자로 변환하면 0", () => {
        const schema = z.number();
        const raw = "";
        const result = caster(schema, raw);
        expect(Number(result)).toBe(0);
      });

      test("숫자로 변환할 수 없는 문자열은 NaN", () => {
        const schema = z.number();
        const raw = "abc";
        const result = caster(schema, raw);
        expect(Number.isNaN(result)).toBe(true);
      });

      test("boolean이 아닌 문자열은 변환하지 않음", () => {
        const schema = z.boolean();
        const raw = "yes"; // "true"나 "false"가 아님
        const result = caster(schema, raw);
        expect(result).toBe("yes"); // 그대로 반환
      });

      test("undefined는 그대로 반환", () => {
        const schema = z.string();
        const raw = undefined;
        const result = caster(schema, raw);
        expect(result).toBeUndefined();
      });

      test("깊게 중첩된 구조 변환", () => {
        const schema = z.object({
          level1: z.object({
            level2: z.object({
              level3: z.object({
                value: z.number(),
              }),
            }),
          }),
        });
        const raw = {
          level1: {
            level2: {
              level3: {
                value: "999",
              },
            },
          },
        };
        const result = caster(schema, raw);
        expect(result.level1.level2.level3.value).toBe(999);
      });

      test("배열 내 null 요소 처리", () => {
        const schema = z.array(z.number().nullable());
        const raw = ["1", null, "3"];
        const result = caster(schema, raw);
        expect(result).toEqual([1, null, 3]);
      });

      test("객체 내 undefined 속성 그대로 유지", () => {
        const schema = z.object({
          id: z.number(),
          name: z.string().optional(),
        });
        const raw = { id: "123", name: undefined };
        const result = caster(schema, raw);
        expect(result).toEqual({ id: 123, name: undefined });
      });

      test("Date 객체가 이미 Date면 그대로 반환", () => {
        const schema = z.date();
        const raw = new Date("2025-01-01");
        const result = caster(schema, raw);
        expect(result).toEqual(raw);
        expect(result instanceof Date).toBe(true);
      });

      test("숫자 0은 올바르게 변환", () => {
        const schema = z.number();
        const raw = "0";
        const result = caster(schema, raw);
        expect(result).toBe(0);
      });

      test("음수 문자열을 숫자로 변환", () => {
        const schema = z.number();
        const raw = "-123";
        const result = caster(schema, raw);
        expect(result).toBe(-123);
      });

      test("소수점 문자열을 숫자로 변환", () => {
        const schema = z.number();
        const raw = "123.456";
        const result = caster(schema, raw);
        expect(result).toBe(123.456);
      });
    });
  });

  describe("fastifyCaster", () => {
    test("z.preprocess를 통해 변환 후 검증 성공", () => {
      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const wrappedSchema = fastifyCaster(schema);

      const raw = { id: "123", name: "test" };
      const result = wrappedSchema.parse(raw);

      expect(result).toEqual({ id: 123, name: "test" });
    });

    test("변환 후 스키마 검증 실패 시 ZodError 발생", () => {
      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const wrappedSchema = fastifyCaster(schema);

      // "abc"는 NaN이 되어 z.number() 검증 실패
      const raw = { id: "abc", name: "test" };

      expect(() => wrappedSchema.parse(raw)).toThrow();
    });

    test("safeParse: 검증 실패 시 에러 객체 반환", () => {
      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const wrappedSchema = fastifyCaster(schema);

      const raw = { id: "abc", name: "test" };
      const result = wrappedSchema.safeParse(raw);

      expect(result.success).toBe(false);
    });

    test("safeParse: 검증 성공 시 data 반환", () => {
      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });
      const wrappedSchema = fastifyCaster(schema);

      const raw = { id: "123", name: "test" };
      const result = wrappedSchema.safeParse(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ id: 123, name: "test" });
      }
    });
  });
});
