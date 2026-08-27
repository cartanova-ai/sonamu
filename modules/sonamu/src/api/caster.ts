import assert from "assert";

import { z } from "zod";
import { type $ZodType } from "zod/v4/core";

import { isObjectValue, isStringValue } from "../utils/runtime-value";

function isNumberType(zodType: $ZodType): zodType is z.ZodNumber {
  return zodType instanceof z.ZodNumber;
}

function isNullOrOptional(zodType: $ZodType): zodType is z.ZodNullable | z.ZodOptional {
  return zodType instanceof z.ZodNullable || zodType instanceof z.ZodOptional;
}

// optional, nullable 무관하게 ZodNumber 체크
function isZodNumberAnyway(zodType: $ZodType) {
  if (isNumberType(zodType)) {
    return true;
  }

  // ZodNullable 또는 ZodOptional일 때
  if (isNullOrOptional(zodType) && isNumberType(zodType.def.innerType)) {
    return true;
  }

  return false;
}

// ZodType을 이용해 raw를 Type Coercing
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 캐스팅에는 any가 필요함.
export function caster(zodType: $ZodType, raw: any): any {
  if (isZodNumberAnyway(zodType) && isStringValue(raw)) {
    // number
    return Number(raw);
  } else if (
    zodType instanceof z.ZodUnion &&
    zodType.options.some((opt) => isZodNumberAnyway(opt))
  ) {
    // zArrayable Number 케이스 처리
    if (Array.isArray(raw)) {
      const numType = zodType.options.find((opt) => isNumberType(opt));
      assert(numType !== undefined);
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 캐스팅에는 any가 필요함.
      return raw.map((elem: any) => caster(numType, elem));
    } else {
      return Number(raw);
    }
  } else if (zodType instanceof z.ZodBoolean && (raw === "true" || raw === "false")) {
    // boolean
    return raw === "true";
  } else if (raw !== null && Array.isArray(raw) && zodType instanceof z.ZodArray) {
    // array
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 캐스팅에는 any가 필요함.
    return raw.map((elem: any) => caster(zodType.element, elem));
  } else if (zodType instanceof z.ZodObject && isObjectValue(raw) && raw !== null) {
    // object
    return Object.fromEntries(
      Object.keys(raw).map((rawKey) => [rawKey, caster(zodType["shape"][rawKey], raw[rawKey])]),
    );
  } else if (zodType instanceof z.ZodOptional) {
    // optional
    return caster(zodType.def.innerType, raw);
  } else if (zodType instanceof z.ZodNullable) {
    // nullable
    return caster(zodType.def.innerType, raw);
  } else if (
    zodType instanceof z.ZodDate &&
    raw !== null &&
    raw !== undefined &&
    new Date(raw).toString() !== "Invalid Date"
  ) {
    // date
    return new Date(raw);
  } else {
    // 나머지는 처리 안함
    return raw;
  }
}

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 캐스팅에는 any가 필요함.
export function fastifyCaster(schema: z.ZodObject<any>) {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 캐스팅에는 any가 필요함.
  return z.preprocess((raw: any) => {
    return caster(schema, raw);
  }, schema);
}
