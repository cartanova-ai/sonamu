import { z } from "zod";
import { type $ZodType } from "zod/v4/core";

type CoercibleValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | CoercibleValue[]
  | CoercibleRecord;

type CoercibleRecord = {
  [key: string]: CoercibleValue;
};

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
  const stringValue = z.string().safeParse(raw);

  if (isZodNumberAnyway(zodType) && stringValue.success) {
    // number
    return Number(stringValue.data);
  } else if (
    zodType instanceof z.ZodUnion &&
    zodType.options.some((opt) => isZodNumberAnyway(opt))
  ) {
    // zArrayable Number 케이스 처리
    if (Array.isArray(raw)) {
      const numType = zodType.options.find((opt) => isNumberType(opt));
      // 브라우저 환경이므로 Node.js의 assert 대신 Error throw 사용
      if (!numType) {
        throw new Error("Expected to find a number type in union");
      }
      return raw.map((elem: any) => caster(numType, elem));
    } else {
      return Number(raw);
    }
  } else if (zodType instanceof z.ZodBoolean && (raw === "true" || raw === "false")) {
    // boolean
    return raw === "true";
  } else if (raw !== null && Array.isArray(raw) && zodType instanceof z.ZodArray) {
    // array
    return raw.map((elem: any) => caster(zodType.element, elem));
  } else if (zodType instanceof z.ZodObject && isObjectRecord(raw)) {
    // object
    const fields = zodType.def["shape"];
    const result: CoercibleRecord = {};
    for (const [rawKey, rawValue] of Object.entries(raw)) {
      result[rawKey] = caster(fields[rawKey], rawValue);
    }
    return result;
  } else if (zodType instanceof z.ZodOptional) {
    // optional
    return caster(zodType.def.innerType, raw);
  } else if (zodType instanceof z.ZodNullable) {
    // nullable
    return caster(zodType.def.innerType, raw);
  } else if (
    zodType instanceof z.ZodDate &&
    stringValue.success &&
    new Date(stringValue.data).toString() !== "Invalid Date"
  ) {
    // date
    return new Date(stringValue.data);
  } else {
    // 나머지는 처리 안함
    return raw;
  }
}

function isObjectRecord(value: any): value is CoercibleRecord {
  return (
    value !== null &&
    !Array.isArray(value) &&
    z.record(z.string(), z.any()).safeParse(value).success
  );
}

export function fastifyCaster(schema: z.ZodObject<any>) {
  return z.preprocess((raw: any) => {
    return caster(schema, raw);
  }, schema);
}
