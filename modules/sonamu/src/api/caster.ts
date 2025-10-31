import assert from "assert";
import { z } from "zod";
import type { $ZodType } from "zod/v4/core";

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
export function caster(zodType: $ZodType, raw: any): any {
  if (isZodNumberAnyway(zodType) && typeof raw === "string") {
    // number
    return Number(raw);
  } else if (
    zodType instanceof z.ZodUnion &&
    zodType.options.some((opt) => isZodNumberAnyway(opt))
  ) {
    // zArrayable Number 케이스 처리
    if (Array.isArray(raw)) {
      const numType = zodType.options.find(opt => isNumberType(opt));
      assert(numType !== undefined);
      return raw.map((elem: any) => caster(numType, elem));
    } else {
      return Number(raw);
    }
  } else if (
    zodType instanceof z.ZodBoolean &&
    (raw === "true" || raw === "false")
  ) {
    // boolean
    return raw === "true";
  } else if (
    raw !== null &&
    Array.isArray(raw) &&
    zodType instanceof z.ZodArray
  ) {
    // array
    return raw.map((elem: any) => caster(zodType.element, elem));
  } else if (
    zodType instanceof z.ZodObject &&
    typeof raw === "object" &&
    raw !== null
  ) {
    // object
    return Object.keys(raw).reduce((r, rawKey) => {
      r[rawKey] = caster(zodType.shape[rawKey], raw[rawKey]);
      return r;
    }, {} as any);
  } else if (zodType instanceof z.ZodOptional) {
    // optional
    return caster(zodType.def.innerType, raw);
  } else if (zodType instanceof z.ZodNullable) {
    // nullable
    return caster(zodType.def.innerType, raw);
  } else if (
    zodType instanceof z.ZodDate &&
    new Date(raw).toString() !== "Invalid Date"
  ) {
    // date
    return new Date(raw);
  } else {
    // 나머지는 처리 안함
    return raw;
  }
}

export function fastifyCaster(schema: z.ZodObject<any>) {
  return z.preprocess((raw: any) => {
    return caster(schema, raw);
  }, schema);
}
