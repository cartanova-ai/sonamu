import { uniq } from "lodash";
import { AST, Expr, ExpressionValue, Select } from "node-sql-parser";

// where 조건에 사용된 테이블명을 추출
export function getTableNamesFromWhere(ast: AST | AST[]): string[] {
  const extractTableNames = (where: Select["where"]): string[] => {
    if (where === null || !(where.type === "binary_expr" && "left" in where)) {
      return [];
    }

    const extractTableName = (expr: Expr | ExpressionValue): string[] => {
      if (
        expr.type === "column_ref" &&
        "table" in expr &&
        expr.table !== null
      ) {
        // table이 object로 들어오는 경우가 있음 { value: 'table_name'}
        return [
          typeof expr.table === "string"
            ? expr.table
            : (expr.table as { type: string; value: string }).value,
        ];
      } else if (expr.type === "binary_expr" && "left" in expr) {
        return extractTableNames(expr);
      }
      return [];
    };

    return [...extractTableName(where.left), ...extractTableName(where.right)];
  };

  return uniq(
    (Array.isArray(ast) ? ast : [ast]).flatMap((a) =>
      a.type === "select" ? extractTableNames(a.where) : []
    )
  );
}
