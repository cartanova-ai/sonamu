/* oxlint-disable @typescript-eslint/no-explicit-any */ // caster 함수에는 any가 필요함
import { z } from "zod";

// optional, nullable 무관하게 ZodNumber 체크
function isZodNumberAnyway(zodType: any): boolean {
  if (zodType instanceof z.ZodNumber) {
    return true;
  }
  if (zodType instanceof z.ZodNullable || zodType instanceof z.ZodOptional) {
    return isZodNumberAnyway(zodType.unwrap());
  }
  return false;
}

const stringValue = z.string();
const objectValue = z.record(z.string(), z.unknown());
const zodTypeValue = z.custom<z.ZodType>((value) => value instanceof z.ZodType);
const zodFieldsValue = z.record(z.string(), zodTypeValue);

export function getZodObjectFields(zodObject: z.ZodObject): Record<string, z.ZodType> {
  const fieldsEntry = Object.entries(zodObject.def).find(([property]) => property === "shape");
  return zodFieldsValue.parse(fieldsEntry?.[1]);
}

// ZodType을 이용해 입력값을 타입에 맞게 변환합니다.
function coerceInput(zodType: any, raw: any): any {
  if (isZodNumberAnyway(zodType) && stringValue.safeParse(raw).success) {
    return Number(raw);
  }

  if (zodType instanceof z.ZodUnion) {
    if (zodType.options.some((option: any) => isZodNumberAnyway(option))) {
      if (Array.isArray(raw)) {
        const numberType = zodType.options.find((option: any) => isZodNumberAnyway(option));
        if (numberType === undefined) {
          throw new Error("Expected to find a number type in union");
        }
        return raw.map((element) => coerceInput(numberType, element));
      }
      return Number(raw);
    }
  } else if (zodType instanceof z.ZodBoolean && (raw === "true" || raw === "false")) {
    return raw === "true";
  } else if (zodType instanceof z.ZodArray && Array.isArray(raw)) {
    return raw.map((element) => coerceInput(zodType.element, element));
  } else if (zodType instanceof z.ZodObject) {
    const parsedObject = objectValue.safeParse(raw);
    if (parsedObject.success) {
      const fields = getZodObjectFields(zodType);
      return Object.fromEntries(
        Object.entries(parsedObject.data).map(([key, value]) => {
          const fieldType = fields[key];
          return [key, fieldType === undefined ? value : coerceInput(fieldType, value)];
        }),
      );
    }
  } else if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodNullable) {
    return coerceInput(zodType.unwrap(), raw);
  }

  return raw;
}

export function caster<T extends z.ZodType<any>>(zodType: T, raw: any): z.infer<T>;
export function caster(zodType: any, raw: any): any {
  return coerceInput(zodType, raw);
}

export function fastifyCaster<T extends Record<string, z.ZodType>>(schema: z.ZodObject<T>) {
  return z.preprocess((raw) => coerceInput(schema, raw), schema);
}
