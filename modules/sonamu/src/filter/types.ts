// Prop 타입별 허용 연산자
export const operatorsByPropType = {
  string: ["eq", "ne", "contains", "startsWith", "endsWith", "in", "notIn", "isNull", "isNotNull"],
  integer: ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn", "between", "isNull", "isNotNull"],
  numeric: ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn", "between", "isNull", "isNotNull"],
  boolean: ["eq", "ne", "isNull", "isNotNull"],
  date: ["eq", "ne", "before", "after", "between", "isNull", "isNotNull"],
  datetime: ["eq", "ne", "before", "after", "between", "isNull", "isNotNull"],
  enum: ["eq", "ne", "in", "notIn", "isNull", "isNotNull"],
  json: ["isNull", "isNotNull"],
} as const;

// Prop 타입별 기본 연산자
export const defaultOperatorByPropType = {
  string: "contains",
  integer: "eq",
  numeric: "eq",
  boolean: "eq",
  date: "eq",
  datetime: "eq",
  enum: "eq",
  json: "isNull",
} as const;

// operatorsByPropType에서 파생되는 타입들
export type FilterPropType = keyof typeof operatorsByPropType;
export type FilterOperator = (typeof operatorsByPropType)[keyof typeof operatorsByPropType][number];

// 특정 prop 타입에 허용되는 연산자 유니온
type OperatorForPropType<TPropType extends FilterPropType> =
  (typeof operatorsByPropType)[TPropType][number];

// 연산자별 기대 값 타입
type OperatorValue<T, K extends FilterOperator> = K extends "in" | "notIn"
  ? T[]
  : K extends "between"
    ? [T, T]
    : K extends "isNull" | "isNotNull"
      ? boolean
      : T;

// 특정 연산자 집합에 대한 필터 조건 타입
type ConditionForOperators<T, TOps extends FilterOperator> =
  | T
  | { [K in TOps]?: OperatorValue<T, K> };

/**
 * 필터 조건
 * 타입에 따라 사용 가능한 연산자가 제한
 */
export type FilterCondition<T> =
  // nullable 타입 처리: NonNullable로 벗긴 후 체크
  NonNullable<T> extends number
    ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"numeric">>
    : NonNullable<T> extends string
      ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"string">>
      : NonNullable<T> extends Date
        ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"date">>
        : NonNullable<T> extends boolean
          ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"boolean">>
          : // Fallback: 비원시 타입은 null 체크만 허용
            ConditionForOperators<NonNullable<T>, OperatorForPropType<"json">>;

/**
 * 필터 쿼리
 * 엔티티의 각 필드에 대한 필터 조건 정의
 *
 * @example
 * const query: FilterQuery<Project> = {
 *   status: "in_progress",              // 직접 값
 *   budget: { gt: 10000 },              // 연산자 사용
 *   name: { contains: "AI" }            // 문자열 검색
 * };
 */
export type FilterQuery<TEntity> = {
  [K in keyof TEntity]?: FilterCondition<TEntity[K]>;
};

type NullIfNullable<T> = null extends T ? null : never;

export type FilterNumericOverride<T, TNumericKeys extends keyof T = never> = Omit<T, TNumericKeys> & {
  [K in TNumericKeys]: number | NullIfNullable<T[K]>;
};

/**
 * 필터 메타데이터
 * Entity의 props를 분석하여 자동 생성됩니다.
 */
export interface FilterMetadata {
  /** 필드 이름 */
  field: string;

  /** 표시 레이블 */
  label: string;

  /** 필드 타입 */
  type: "string" | "number" | "boolean" | "date" | "datetime" | "enum" | "json";

  /** 사용 가능한 연산자 */
  operators: FilterOperator[];

  /** Enum 타입인 경우 가능한 값들 */
  enumValues?: string[];

  /** 기본 연산자 */
  defaultOperator: FilterOperator;
}

/**
 * Entity의 모든 필드에 대한 필터 메타데이터
 */
export type EntityFilterMetadata = Record<string, FilterMetadata>;
