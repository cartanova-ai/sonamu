import { describe, expect, test } from "vitest";
import { z } from "zod";

import { humanizeZodError } from "../../../../../modules/sonamu/dist/utils/zod-error";

describe("zod-error", () => {
  describe("humanizeZodError", () => {
    test.each([
      {
        description: "string 타입 불일치",
        schema: z.object({ name: z.string() }),
        input: { name: 123 },
        expectedPath: ["name"],
        expectedMessageContains: "string",
      },
      {
        description: "number 타입 불일치",
        schema: z.object({ age: z.number() }),
        input: { age: "not a number" },
        expectedPath: ["age"],
        expectedMessageContains: "number",
      },
      {
        description: "email validation 실패",
        schema: z.object({ email: z.string().email() }),
        input: { email: "invalid-email" },
        expectedPath: ["email"],
        expectedMessageContains: "email",
      },
      {
        description: "필수 필드 누락",
        schema: z.object({ required: z.string() }),
        input: {},
        expectedPath: ["required"],
        expectedMessageContains: "undefined",
      },
      {
        description: "중첩된 객체 에러",
        schema: z.object({
          user: z.object({
            profile: z.object({
              email: z.string().email(),
            }),
          }),
        }),
        input: { user: { profile: { email: "invalid" } } },
        expectedPath: ["user", "profile", "email"],
        expectedMessageContains: "email",
      },
      {
        description: "배열 인덱스를 [n] 형태로 변환",
        schema: z.object({
          items: z.array(z.object({ name: z.string() })),
        }),
        input: { items: [{ name: "valid" }, { name: 123 }] },
        expectedPath: ["items", "[1]", "name"],
        expectedMessageContains: "string",
      },
      {
        description: "깊은 배열 중첩",
        schema: z.object({
          users: z.array(
            z.object({
              addresses: z.array(z.object({ city: z.string() })),
            }),
          ),
        }),
        input: {
          users: [
            { addresses: [{ city: "Seoul" }] },
            { addresses: [{ city: "Busan" }, { city: 123 }] },
          ],
        },
        expectedPath: ["users", "[1]", "addresses", "[1]", "city"],
        expectedMessageContains: "string",
      },
    ])("$description", ({ schema, input, expectedPath, expectedMessageContains }) => {
      const result = schema.safeParse(input);

      expect(result.success).toBe(false);

      if (!result.success) {
        const humanized = humanizeZodError(result.error);

        expect(humanized.length).toBeGreaterThan(0);
        expect(humanized[0]?.path).toEqual(expectedPath);
        expect(humanized[0]?.message).toContain(expectedMessageContains);
      }
    });

    test("여러 validation 에러를 모두 변환한다", () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0).max(120),
        name: z.string().min(2),
      });

      const result = schema.safeParse({
        email: "not-an-email",
        age: -5,
        name: "a",
      });

      if (!result.success) {
        const humanized = humanizeZodError(result.error);

        expect(humanized.length).toBe(3);
        expect(
          humanized.every(
            (err) => Array.isArray(err.path) && z.string().safeParse(err.message).success,
          ),
        ).toBe(true);

        // 각 필드별 에러 확인
        expect(humanized.some((err) => err.path[0] === "email")).toBe(true);
        expect(humanized.some((err) => err.path[0] === "age")).toBe(true);
        expect(humanized.some((err) => err.path[0] === "name")).toBe(true);
      }
    });

    test("Symbol 타입 경로를 처리한다", () => {
      const schema = z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), value: z.string() }),
        z.object({ type: z.literal("b"), value: z.number() }),
      ]);

      const result = schema.safeParse({ type: "c", value: "test" });

      if (!result.success) {
        const humanized = humanizeZodError(result.error);

        // 모든 경로 요소가 문자열로 변환되어야 함
        expect(humanized.every((err) => z.array(z.string()).safeParse(err.path).success)).toBe(
          true,
        );
      }
    });
  });
});
