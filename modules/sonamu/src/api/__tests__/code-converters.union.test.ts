import { describe, expect, it } from "vitest";
import { jit } from "zod-compiler/jit";

import { type ApiParam } from "../../types/types";
import { fastifyCaster } from "../caster";
import { getZodObjectFromApiParams } from "../code-converters";

// 감사 PoC(SON-634)의 probeUnion/probeLit 시그니처를 그대로 옮긴 파라미터 정의
const probeUnionParams: ApiParam[] = [
  {
    name: "order",
    type: {
      t: "union",
      types: [
        { t: "string-literal", value: "asc" },
        { t: "string-literal", value: "desc" },
        "null",
      ],
    },
    optional: false,
  },
  { name: "name", type: { t: "union", types: ["string", "undefined"] }, optional: false },
];

const probeLitParams: ApiParam[] = [
  { name: "flag", type: "true", optional: false },
  { name: "v", type: { t: "union", types: ["number", "string", "null"] }, optional: false },
];

async function createValidators(params: ApiParam[]) {
  // 명명 타입이 없는 파라미터이므로 빈 references를 명시합니다 (SON-633에서 references가 필수가 됨).
  const plain = fastifyCaster(getZodObjectFromApiParams(params, {}));
  const compiled = await jit(fastifyCaster(getZodObjectFromApiParams(params, {})), { eager: true });
  return [
    ["plain", plain],
    ["jit", compiled],
  ] as const;
}

describe("null·undefined·true·false가 섞인 union 파라미터 검증 (SON-634)", () => {
  it("'asc' | 'desc' | null 파라미터는 객체와 union 밖 문자열을 거부한다", async () => {
    for (const [mode, validator] of await createValidators(probeUnionParams)) {
      expect(validator.safeParse({ order: { x: 1 }, name: "a" }).success, mode).toBe(false);
      expect(
        validator.safeParse({
          order: { _type: "sql_expression", _sql: "1", _params: [] },
          name: "a",
        }).success,
        mode,
      ).toBe(false);
      expect(validator.safeParse({ order: "zzz-not-in-union", name: "a" }).success, mode).toBe(
        false,
      );
      expect(validator.safeParse({ order: "asc", name: "a" }).success, mode).toBe(true);
      expect(validator.safeParse({ order: null, name: "a" }).success, mode).toBe(true);
    }
  });

  it("string | undefined 파라미터는 문자열만 받고 키 누락을 허용한다", async () => {
    for (const [mode, validator] of await createValidators(probeUnionParams)) {
      expect(validator.safeParse({ order: "desc", name: ["a"] }).success, mode).toBe(false);
      expect(validator.safeParse({ order: "desc", name: 12345 }).success, mode).toBe(false);
      expect(validator.safeParse({ order: "desc", name: null }).success, mode).toBe(false);
      expect(validator.safeParse({ order: "desc" }).success, mode).toBe(true);
    }
  });

  it("true 리터럴 파라미터는 true만 받는다", async () => {
    for (const [mode, validator] of await createValidators(probeLitParams)) {
      expect(validator.safeParse({ flag: "anything", v: 1 }).success, mode).toBe(false);
      expect(validator.safeParse({ flag: false, v: 1 }).success, mode).toBe(false);
      expect(validator.safeParse({ flag: { x: 1 }, v: 1 }).success, mode).toBe(false);
      expect(validator.safeParse({ flag: true, v: 1 }).success, mode).toBe(true);
    }
  });

  it("number | string | null 파라미터는 배열과 객체를 거부한다", async () => {
    for (const [mode, validator] of await createValidators(probeLitParams)) {
      expect(validator.safeParse({ flag: true, v: [{ evil: true }] }).success, mode).toBe(false);
      expect(validator.safeParse({ flag: true, v: { evil: true } }).success, mode).toBe(false);
      expect(validator.safeParse({ flag: true, v: "1" }).success, mode).toBe(true);
      expect(validator.safeParse({ flag: true, v: null }).success, mode).toBe(true);
    }
  });

  it("GET 쿼리 문자열 'true'/'false'를 boolean 리터럴로 변환한다", async () => {
    const params: ApiParam[] = [
      { name: "on", type: "true", optional: false },
      { name: "off", type: "false", optional: true },
    ];
    for (const [mode, validator] of await createValidators(params)) {
      expect(validator.parse({ on: "true", off: "false" }), mode).toEqual({ on: true, off: false });
      expect(validator.safeParse({ on: "false" }).success, mode).toBe(false);
      expect(validator.safeParse({ on: "true", off: "true" }).success, mode).toBe(false);
    }
  });
});
