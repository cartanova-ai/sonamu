import {
  type AST,
  type ColumnRef,
  type Expr,
  type ExpressionValue,
  type From,
  type Join,
  type Select,
} from "node-sql-parser";
import { unique } from "radashi";

import { isObjectValue, isStringValue } from "./runtime-value";
import { nonNullable } from "./utils";

type ParserColumnRef = Omit<ColumnRef, "table"> & {
  table?: string | { type: string; value: string } | null;
};

export function getTableName(expr: ParserColumnRef) {
  const table = expr.table;
  if (isStringValue(table)) {
    return table;
  }
  return isObjectValue(table) && "value" in table && isStringValue(table.value)
    ? table.value
    : null;
}

// where 조건에 사용된 테이블명을 추출
export function getTableNamesFromWhere(ast: AST | AST[]): string[] {
  const extractTableNames = (where: Select["where"]): string[] => {
    if (where === null || !(where.type === "binary_expr" && "left" in where)) {
      return [];
    }

    const extractTableName = (expr: Expr | ExpressionValue): string[] => {
      if (expr.type === "column_ref") {
        // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
        const table = getTableName(expr as ColumnRef);
        return table ? [table] : [];
      } else if (expr.type === "binary_expr" && "left" in expr) {
        return extractTableNames(expr);
      }
      return [];
    };

    return [...extractTableName(where.left), ...extractTableName(where.right)];
  };

  return unique(
    (Array.isArray(ast) ? ast : [ast]).flatMap((a) =>
      a.type === "select" || a.type === "update" || a.type === "delete"
        ? extractTableNames(a.where)
        : [],
    ),
  );
}

/**
 * 주의: table명이 아닌 alias를 반환함
 */
export function getJoinTables(ast: AST | AST[], joinTypes: Join["join"][]): string[] {
  const extractJoinTables = (froms: From[]): string[] => {
    return froms
      .map((f) => ("join" in f && joinTypes.includes(f.join) ? f.as : null))
      .filter(nonNullable);
  };

  return unique(
    (Array.isArray(ast) ? ast : [ast]).flatMap((a) =>
      a.type === "select" && Array.isArray(a.from) ? extractJoinTables(a.from) : [],
    ),
  );
}
