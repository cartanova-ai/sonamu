import type { ReactElement } from "react";

export type PaginationProps = {
  activePage?: number;
  totalPages?: number;
};

export type TableColumnWidth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export type ErrorObj = {
  content: string;
  pointing?: "above" | "below" | "left" | "right";
};

export type ControlledModalProps = {
  open: boolean;
  close: () => void;
};

export type SonamuCol<T> = {
  label: string;
  th?: ReactElement;
  tc: (row: T, index: number) => ReactElement;
  className?: string;
  collapsing?: boolean;
  width?: TableColumnWidth;
  hidden?: boolean;
  parentLabel?: string;
};

// Union 타입을 분배하여 각각에 Omit을 적용하는 유틸리티 타입
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Override<T, U> = Omit<T, keyof U> & U;

/**
 * Sonamu Filter 관련 타입 정의
 */

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
