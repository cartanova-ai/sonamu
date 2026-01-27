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
 * 필터 쿼리
 * 엔티티의 각 필드에 대한 필터 조건 정의
 */
export type FilterQuery<TEntity, TNumericKeys extends keyof TEntity = never> = {
  [K in keyof TEntity]?: K extends TNumericKeys
    ? ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"numeric">>
    : NonNullable<TEntity[K]> extends number
      ? ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"integer">>
      : NonNullable<TEntity[K]> extends string
        ? ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"string">>
        : NonNullable<TEntity[K]> extends Date
          ? ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"date">>
          : NonNullable<TEntity[K]> extends boolean
            ? ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"boolean">>
            : // Fallback: 비원시 타입은 null 체크만 허용
              ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"json">>;
};

/**
 * Sonamu 필터 적용 타입
 * Entity에서 제외할 필드와 numeric 필드를 받아서 최종 FilterQuery 타입을 생성
 */
export type ApplySonamuFilter<
  TEntity,
  TOmitKeys extends keyof TEntity = never,
  TNumericKeys extends Exclude<keyof TEntity, TOmitKeys> = never,
> = FilterQuery<Omit<TEntity, TOmitKeys>, TNumericKeys>;
