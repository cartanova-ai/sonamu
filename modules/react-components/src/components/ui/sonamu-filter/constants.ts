import { type FilterOperator, type FilterPropType } from "../../../lib/types";

/**
 * Operator UI 라벨
 */
export const operatorLabels = {
  eq: "=",
  ne: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  startsWith: "starts with",
  endsWith: "ends with",
  in: "in",
  notIn: "not in",
  between: "between",
  before: "before",
  after: "after",
  isNull: "null",
  isNotNull: "not null",
} satisfies Record<FilterOperator, string>;

/**
 * Zod 타입 이름 정의
 */
export const zodTypeToFilterPropTypeMap = {
  string: "string",
  number: "integer",
  boolean: "boolean",
  date: "datetime",
  enum: "enum",
  array: "json",
  object: "json",
} satisfies Record<string, FilterPropType>;
