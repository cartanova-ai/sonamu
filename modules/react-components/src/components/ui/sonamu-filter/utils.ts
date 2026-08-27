import { isObject, isString } from "radashi";
import { z } from "zod";

import { type FilterPropType } from "../../../lib/types";
import { zodTypeToFilterPropTypeMap } from "./constants";
import { type FieldMeta, type FilterFieldMetadata } from "./types";

type UnwrappedZodType = {
  innerType: z.core.$ZodType;
  nullable: boolean;
};

type EnumLike = z.core.$ZodType & {
  options: readonly string[];
};

function isEnumLike(zodType: z.core.$ZodType): zodType is EnumLike {
  return "options" in zodType && Array.isArray(zodType.options);
}

function getZodType(zodType: z.core.$ZodType): string {
  if ("def" in zodType && isObject(zodType.def) && "type" in zodType.def) {
    const typeName = zodType.def.type;
    if (isString(typeName)) return typeName;
  }
  return "unknown";
}

/**
 * ZodNullable, ZodOptional 등의 래퍼를 벗겨내고 내부 타입을 반환
 * nullable/optional 여부도 함께 반환
 */
export function unwrapZodType(zodType: z.ZodTypeAny): UnwrappedZodType {
  let current: z.core.$ZodType = zodType;
  let nullable = false;

  while (current instanceof z.ZodNullable || current instanceof z.ZodOptional) {
    if (current instanceof z.ZodNullable) {
      nullable = true;
    }
    current = current.def.innerType;
  }

  return { innerType: current, nullable };
}

/**
 * Zod 타입 이름을 FilterPropType으로 변환
 */
export function zodTypeNameToPropType(typeName: string): FilterPropType {
  switch (typeName) {
    case "number":
      return zodTypeToFilterPropTypeMap.number;
    case "boolean":
      return zodTypeToFilterPropTypeMap.boolean;
    case "date":
      return zodTypeToFilterPropTypeMap.date;
    case "enum":
      return zodTypeToFilterPropTypeMap.enum;
    case "array":
      return zodTypeToFilterPropTypeMap.array;
    case "object":
      return zodTypeToFilterPropTypeMap.object;
    default:
      return zodTypeToFilterPropTypeMap.string;
  }
}

/**
 * Zod enum에서 options와 labels를 추출
 * SD 함수를 사용하여 enum.{EnumName}.{value} 형태로 라벨 조회
 */
export function extractEnumData(
  zodEnum: z.core.$ZodType,
  SD: (key: string) => string,
): FieldMeta["enumData"] {
  // options 추출
  if (!isEnumLike(zodEnum)) {
    return undefined;
  }
  const options = Array.from(zodEnum.options);

  // labels 추출 (SD 함수 사용: enum.{EnumName}.{value})
  const enumDescription = z.globalRegistry.get(zodEnum)?.description;
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
  schema: z.ZodObject,
  SD: (key: string) => string,
): FilterFieldMetadata {
  const fieldDefinitions = schema["shape"];
  const fieldMeta: FilterFieldMetadata = {};

  for (const [fieldName, zodSchema] of Object.entries(fieldDefinitions)) {
    // virtual, textsearchable로 시작하는 필드는 제외
    if (fieldName.startsWith("virtual") || fieldName.startsWith("textsearchable")) {
      continue;
    }

    // nullable/optional 벗겨내기
    const { innerType, nullable } = unwrapZodType(zodSchema);

    // 메타 SonamuPropType 체크 (numeric 등)
    const metadata = zodSchema.meta();
    const sonamuPropType = metadata?.SonamuPropType;
    const isNumeric = sonamuPropType === "numeric";

    // propType 결정
    const propType: FilterPropType = isNumeric
      ? "numeric"
      : zodTypeNameToPropType(getZodType(innerType));

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
