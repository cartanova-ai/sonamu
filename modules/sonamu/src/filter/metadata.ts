import type { Entity } from "..";
import type { FilterMetadata, FilterOperator } from "./types";
import { defaultOperatorByPropType, operatorsByPropType } from "./types";

/**
 * Entity prop 타입을 필터 타입으로 매핑
 */
export function mapPropTypeToFilterType(propType: string): FilterMetadata["type"] {
  const typeMap: Record<string, FilterMetadata["type"]> = {
    string: "string",
    integer: "number",
    numeric: "number",
    boolean: "boolean",
    date: "date",
    datetime: "datetime",
    enum: "enum",
    json: "json",
  };

  return typeMap[propType] || "string";
}

/**
 * 타입별 사용 가능한 연산자를 반환
 */
export function getOperatorsForType(propType: string): FilterOperator[] {
  return [
    ...(operatorsByPropType[propType as keyof typeof operatorsByPropType] ?? ["eq"]),
  ] as FilterOperator[];
}

/**
 * 기본 연산자를 반환
 */
export function getDefaultOperator(propType: string): FilterOperator {
  return defaultOperatorByPropType[propType as keyof typeof defaultOperatorByPropType] ?? "eq";
}

/**
 * Enum 값 목록을 추출
 */
export function getEnumValues(entity: Entity, enumId: string): string[] | undefined {
  const enumDef = entity.enumLabels?.[enumId];
  if (!enumDef) return undefined;

  return Object.keys(enumDef);
}
