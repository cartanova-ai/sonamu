/** biome-ignore-all lint/suspicious/noExplicitAny: Zod 타입 접근 */
import type { z } from "zod";
import type { FilterPropType } from "../../../lib/types";
import { zodTypeToFilterPropTypeMap } from "./constants";
import type { FieldMeta, ZodWithDef } from "./types";

/**
 * ZodNullable, ZodOptional 등의 래퍼를 벗겨내고 내부 타입을 반환
 * nullable/optional 여부도 함께 반환
 */
export function unwrapZodType(zodType: z.ZodTypeAny): {
  innerType: z.ZodTypeAny;
  nullable: boolean;
} {
  let current = zodType as ZodWithDef;
  let nullable = false;

  while (current._def.type === "nullable" || current._def.type === "optional") {
    if (current._def.type === "nullable") {
      nullable = true;
    }
    current = current._def.innerType as ZodWithDef;
  }

  return { innerType: current, nullable };
}

/**
 * Zod 타입 이름을 FilterPropType으로 변환
 */
export function zodTypeNameToPropType(typeName: string): FilterPropType {
  return zodTypeToFilterPropTypeMap[typeName] ?? "string";
}

/**
 * Zod enum에서 options와 labels를 추출
 * SD 함수를 사용하여 enum.{EnumName}.{value} 형태로 라벨 조회
 */
export function extractEnumData(
  zodEnum: z.ZodTypeAny,
  SD: (key: string) => string,
): FieldMeta["enumData"] {
  // options 추출
  const options = (zodEnum as any).options
    ? (Array.from((zodEnum as any).options) as string[])
    : undefined;

  if (!options) {
    return undefined;
  }

  // labels 추출 (SD 함수 사용: enum.{EnumName}.{value})
  const enumDescription = (zodEnum as any)._def?.description || (zodEnum as any).description;
  const labels: Record<string, string> = {};

  if (enumDescription) {
    for (const option of options) {
      const dictKey = `enum.${enumDescription}.${option}`;
      labels[option] = SD(dictKey);
    }
  }

  return { options, labels };
}

/**
 * Zod 스키마에서 각 필드의 타입 정보를 추출하여 FieldMeta 형태로 변환
 */
export function extractFieldMetaFromSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  SD: (key: string) => string,
): Record<string, FieldMeta> {
  const shape = schema.shape;
  const fieldMeta: Record<string, FieldMeta> = {};

  for (const [fieldName, zodSchema] of Object.entries(shape)) {
    // virtual, textsearchable로 시작하는 필드는 제외
    if (fieldName.startsWith("virtual") || fieldName.startsWith("textsearchable")) {
      continue;
    }

    // nullable/optional 벗겨내기
    const { innerType, nullable } = unwrapZodType(zodSchema as z.ZodTypeAny);

    // 메타 SonamuPropType 체크 (numeric 등)
    const meta = (zodSchema as any).meta?.();
    const sonamuPropType = meta?.SonamuPropType;
    const isNumeric = sonamuPropType === "numeric";

    // propType 결정
    const innerWithDef = innerType as ZodWithDef;
    const propType: FilterPropType = isNumeric
      ? "numeric"
      : zodTypeNameToPropType(innerWithDef._def.type);

    // enum 타입인 경우 추가 정보 추출
    const enumData = propType === "enum" ? extractEnumData(innerType, SD) : undefined;

    fieldMeta[fieldName] = {
      propType,
      nullable,
      enumData,
    };
  }

  return fieldMeta;
}
