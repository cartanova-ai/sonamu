import { z } from "zod";

// optional, nullable 무관하게 ZodNumber 체크
function isZodNumberAnyway(zodType: z.ZodType<any>) {
  if (zodType instanceof z.ZodNumber) {
    return true;
  } else if (
    zodType instanceof z.ZodNullable &&
    zodType._def.innerType instanceof z.ZodNumber
  ) {
    return true;
  } else if (
    zodType instanceof z.ZodOptional &&
    zodType._def.innerType instanceof z.ZodNumber
  ) {
    return true;
  } else if (
    zodType instanceof z.ZodOptional &&
    zodType._def.innerType instanceof z.ZodOptional &&
    (zodType._def.innerType as any)._def.innerType instanceof z.ZodNumber
  ) {
    return true;
  }

  return false;
}

// ZodType을 이용해 raw를 Type Coercing
export function caster(zodType: z.ZodType<any>, raw: any): any {
  if (isZodNumberAnyway(zodType) && typeof raw === "string") {
    // number
    return Number(raw);
  } else if (zodType instanceof z.ZodUnion) {
    const options = zodType.options as z.ZodType<any>[];
    if (options.some((opt) => isZodNumberAnyway(opt))) {
      // zArrayable Number 케이스 처리
      if (Array.isArray(raw)) {
        const numType = options.find((opt) => opt instanceof z.ZodNumber);
        return raw.map((elem: any) => caster(numType!, elem));
      } else {
        return Number(raw);
      }
    }
  } else if (
    zodType instanceof z.ZodBoolean &&
    (raw === "true" || raw === "false")
  ) {
    // boolean
    return raw === "true";
  } else if (zodType instanceof z.ZodArray) {
    // array
    return raw.map((elem: any) =>
      caster(zodType.element as z.ZodType<any>, elem)
    );
  } else if (zodType instanceof z.ZodObject && typeof raw === "object") {
    // object
    return Object.keys(raw).reduce((r, rawKey) => {
      r[rawKey] = caster(zodType.shape[rawKey], raw[rawKey]);
      return r;
    }, {} as any);
  } else if (zodType instanceof z.ZodOptional) {
    return caster(zodType._def.innerType as z.ZodType<any>, raw);
  }

  // 나머지는 처리 안함
  return raw;
}

export function fastifyCaster(schema: z.ZodObject<any>) {
  return z.preprocess((raw: any) => {
    return caster(schema, raw);
  }, schema);
}
