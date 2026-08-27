import { type Entity } from "../entity/entity";
import { isEnumProp } from "../types/types";
import { isObjectValue, isStringValue } from "../utils/runtime-value";
import { operatorsByPropType } from "./types";
import { type FilterOperator, type FilterQuery } from "./types";

type DynamicFilterValue = string | number | boolean | Date | null | DynamicFilterValue[];
type DynamicFilterEntity = { [field: string]: DynamicFilterValue };
type ConvertedFilterValue<Value> = Value | number | boolean | null | ConvertedFilterValue<Value>[];

// ============================================================
// Query Normalization
// URL 쿼리 스트링으로 전달된 문자열을 적절한 타입으로 변환
// ============================================================

/**
 * Fastify가 파싱한 sonamuFilter 객체를 정규화
 * 문자열 값을 적절한 타입(숫자, 불린)으로 변환
 *
 * @example
 * // URL: ?sonamuFilter[status]=hidden&sonamuFilter[budget][gt]=10000
 * // Fastify 파싱 결과:
 * const rawFilter = { status: "hidden", budget: { gt: "10000" } };
 *
 * // 정규화:
 * const normalized = normalizeFilterQuery(rawFilter);
 * // → { status: "hidden", budget: { gt: 10000 } }
 *
 * @param rawFilter Fastify가 파싱한 원본 sonamuFilter 객체
 * @returns 타입이 변환된 FilterQuery 객체
 */
export function normalizeFilterQuery<TEntity = DynamicFilterEntity, Value = never>(
  rawFilter: Value,
): FilterQuery<TEntity> {
  if (!rawFilter || !isObjectValue(rawFilter)) {
    return {};
  }

  const normalized: FilterQuery<TEntity> = {};

  for (const [field, condition] of Object.entries(rawFilter)) {
    if (condition === undefined || condition === null) continue;

    // 직접 값 (eq와 동일)
    if (!isObjectValue(condition) || Array.isArray(condition)) {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      normalized[field as keyof TEntity] = convertType(
        condition,
      ) as FilterQuery<TEntity>[keyof TEntity];
      continue;
    }

    // 연산자 객체
    const operators = {};
    for (const [operator, value] of Object.entries(condition)) {
      Object.assign(operators, { [operator]: convertType(value) });
    }
    // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
    normalized[field as keyof TEntity] = operators as FilterQuery<TEntity>[keyof TEntity];
  }

  return normalized;
}

/**
 * 값을 적절한 타입으로 변환
 * 문자열 → 숫자, 불린, NULL 등
 *
 * @example
 * convertType("123") → 123
 * convertType("true") → true
 * convertType("hello") → "hello"
 * convertType(["1", "2", "3"]) → [1, 2, 3]
 */
function convertType<Value>(value: Value): ConvertedFilterValue<Value> {
  // 배열
  if (Array.isArray(value)) {
    return value.map(convertType);
  }

  // 이미 변환된 타입
  if (!isStringValue(value)) {
    return value;
  }

  // 숫자
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  // 불린
  if (value === "true") return true;
  if (value === "false") return false;

  // NULL
  if (value === "null") return null;

  // 문자열 그대로
  return value;
}

// ============================================================
// Validation (검증)
// 메타데이터 기반으로 필터 쿼리의 유효성 검증
// ============================================================

/**
 * sonamuFilter를 Entity 기반으로 검증
 *
 * 필터링 불가능한 필드, 지원하지 않는 연산자, 잘못된 enum 값 등을 체크
 *
 * @param filters 검증할 필터 쿼리
 * @param entity Entity 객체
 * @throws {Error} 검증 실패 시 상세한 에러 메시지와 함께 예외 발생
 *
 * @example
 * validateSonamuFilters({ status: "active", id: { gte: 1 } }, ProjectEntity);
 */
export function validateSonamuFilters<TEntity = DynamicFilterEntity>(
  filters: FilterQuery<TEntity> | undefined,
  entity: Entity,
): void {
  if (!filters) return;

  // 필터 가능한 필드들을 Map으로 만들어서 빠른 조회
  const filterableProps = new Map(entity.getFilterableProps().map((prop) => [prop.name, prop]));

  for (const [field, condition] of Object.entries(filters)) {
    if (condition === undefined || condition === null) continue;

    // 1. 필드가 필터링 가능한지 검증
    const prop = filterableProps.get(field);
    if (!prop) {
      const availableFields = Array.from(filterableProps.keys()).join(", ");
      throw new Error(
        `필드 '${field}'는 필터링할 수 없습니다. (필터 가능한 필드: ${availableFields})`,
      );
    }

    // 해당 prop 타입에 허용되는 연산자 목록
    // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
    const allowedOperators = (operatorsByPropType[
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      prop.type as keyof typeof operatorsByPropType
    ] ?? ["eq"]) as readonly FilterOperator[];

    // 직접 값인 경우 (eq와 동일)
    if (!isObjectValue(condition) || Array.isArray(condition)) {
      // enum 타입이면 값 검증
      if (isEnumProp(prop)) {
        const enumValues = getEnumValues(entity, prop.id);
        if (enumValues) {
          validateEnumValue(field, condition, enumValues);
        }
      }
      continue;
    }

    // 2. 연산자 객체인 경우
    for (const [operator, value] of Object.entries(condition)) {
      // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
      const op = operator as FilterOperator;

      // 연산자가 해당 타입에서 지원되는지 검증
      if (!allowedOperators.includes(op)) {
        throw new Error(
          `필드 '${field}'(타입: ${prop.type})는 '${operator}' 연산자를 지원하지 않습니다.` +
            `(지원되는 연산자: ${allowedOperators.join(", ")})`,
        );
      }

      if (op === "isNull" || op === "isNotNull") {
        continue;
      }

      if ((op === "in" || op === "notIn") && !Array.isArray(value)) {
        throw new Error(`필드 '${field}'의 '${operator}' 연산자는 배열 값을 요구합니다.`);
      }

      if (op === "between") {
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error(`필드 '${field}'의 'between' 연산자는 길이 2의 배열 값을 요구합니다.`);
        }
      }

      // enum 타입이면 값 검증
      if (isEnumProp(prop)) {
        const enumValues = getEnumValues(entity, prop.id);
        if (enumValues) {
          if (op === "in" || op === "notIn") {
            if (Array.isArray(value)) {
              for (const v of value) {
                validateEnumValue(field, v, enumValues);
              }
            }
          } else {
            validateEnumValue(field, value, enumValues);
          }
        }
      }
    }
  }
}

/**
 * Enum 값 검증 helper
 */
function validateEnumValue<Value>(field: string, value: Value, enumValues: string[]): void {
  if (value === null || value === undefined) {
    return;
  }
  if (!enumValues.includes(String(value))) {
    throw new Error(
      `필드 '${field}'의 값 '${value}'는 유효하지 않습니다. (허용되는 값: ${enumValues.join(", ")})`,
    );
  }
}

/**
 * Enum 값 목록 추출 helper
 */
export function getEnumValues(entity: Entity, enumId: string): string[] | undefined {
  const enumDef = entity.enumLabels?.[enumId];
  if (!enumDef) return undefined;

  return Object.keys(enumDef);
}
