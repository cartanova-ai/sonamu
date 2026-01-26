import type { EntityFilterMetadata, FilterOperator, FilterQuery } from "./types";

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
export function normalizeFilterQuery<TEntity = Record<string, unknown>>(
  rawFilter: unknown,
): FilterQuery<TEntity> {
  if (!rawFilter || typeof rawFilter !== "object") {
    return {};
  }

  const normalized: FilterQuery<TEntity> = {};

  for (const [field, condition] of Object.entries(rawFilter)) {
    if (condition === undefined || condition === null) continue;

    // 직접 값 (eq와 동일)
    if (typeof condition !== "object" || Array.isArray(condition)) {
      normalized[field as keyof TEntity] = convertType(
        condition,
      ) as FilterQuery<TEntity>[keyof TEntity];
      continue;
    }

    // 연산자 객체
    const operators: Record<string, unknown> = {};
    for (const [operator, value] of Object.entries(condition)) {
      operators[operator] = convertType(value);
    }
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
function convertType(value: unknown): unknown {
  // 배열
  if (Array.isArray(value)) {
    return value.map(convertType);
  }

  // 이미 변환된 타입
  if (typeof value !== "string") {
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
 * sonamuFilter를 메타데이터 기반으로 검증
 *
 * 필터링 불가능한 필드, 지원하지 않는 연산자, 잘못된 enum 값 등을 체크
 *
 * @param filters 검증할 필터 쿼리
 * @param metadata Entity의 필터 메타데이터
 * @throws {Error} 검증 실패 시 상세한 에러 메시지와 함께 예외 발생
 *
 * @example
 * const metadata = entity.getFilterMetadata();
 * validateSonamuFilters({ status: "active", id: { gte: 1 } }, metadata);
 */
export function validateSonamuFilters<TEntity = Record<string, unknown>>(
  filters: FilterQuery<TEntity> | undefined,
  metadata: EntityFilterMetadata,
): void {
  if (!filters) return;

  for (const [field, condition] of Object.entries(filters)) {
    if (condition === undefined || condition === null) continue;

    // 1. 필드가 필터링 가능한지 검증
    const fieldMeta = metadata[field];
    if (!fieldMeta) {
      const availableFields = Object.keys(metadata).join(", ");
      throw new Error(
        `필드 '${field}'는 필터링할 수 없습니다. (필터 가능한 필드: ${availableFields})`,
      );
    }

    // 직접 값인 경우 (eq와 동일)
    if (typeof condition !== "object" || Array.isArray(condition)) {
      // enum 타입이면 값 검증
      if (fieldMeta.type === "enum" && fieldMeta.enumValues) {
        validateEnumValue(field, condition, fieldMeta.enumValues);
      }
      continue;
    }

    // 2. 연산자 객체인 경우
    for (const [operator, value] of Object.entries(condition)) {
      const op = operator as FilterOperator;

      // 연산자가 해당 타입에서 지원되는지 검증
      if (!fieldMeta.operators.includes(op)) {
        throw new Error(
          `필드 '${field}'(타입: ${fieldMeta.type})는 '${operator}' 연산자를 지원하지 않습니다. (지원되는 연산자: ${fieldMeta.operators.join(", ")})`,
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
      if (fieldMeta.type === "enum" && fieldMeta.enumValues) {
        if (op === "in" || op === "notIn") {
          if (Array.isArray(value)) {
            for (const v of value) {
              validateEnumValue(field, v, fieldMeta.enumValues);
            }
          }
        } else {
          validateEnumValue(field, value, fieldMeta.enumValues);
        }
      }
    }
  }
}

/**
 * Enum value validation helper
 */
function validateEnumValue(field: string, value: unknown, enumValues: string[]): void {
  if (value === null || value === undefined) {
    return;
  }
  if (!enumValues.includes(String(value))) {
    throw new Error(
      `필드 '${field}'의 값 '${value}'는 유효하지 않습니다. (허용되는 값: ${enumValues.join(", ")})`,
    );
  }
}
