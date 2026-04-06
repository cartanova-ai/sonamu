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

import { nonNullable } from "./utils";

export function getTableName(expr: ColumnRef) {
  if ("table" in expr && expr.table !== null) {
    return typeof expr.table === "string"
      ? expr.table
      : (expr.table as { type: string; value: string }).value;
  }
  return null;
}

// where 조건에 사용된 테이블명을 추출
export function getTableNamesFromWhere(ast: AST | AST[]): string[] {
  const extractTableNames = (where: Select["where"]): string[] => {
    if (where === null || !(where.type === "binary_expr" && "left" in where)) {
      return [];
    }

    const extractTableName = (expr: Expr | ExpressionValue): string[] => {
      if (expr.type === "column_ref") {
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
