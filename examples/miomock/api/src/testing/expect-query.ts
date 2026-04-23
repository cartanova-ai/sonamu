import { Parser } from "node-sql-parser";
import { type AST, type Binary, type OrderBy } from "node-sql-parser";
import { Sonamu } from "sonamu";
import { assert, expect } from "vitest";

/**
 * SQL 쿼리에서 추출 가능한 부분
 */
export type QueryPart =
  | "type"
  | "table"
  | "columns"
  | "set"
  | "values"
  | "where"
  | "join"
  | "orderBy"
  | "pagination"
  | "groupBy"
  | "having";

const parser = new Parser();
// NOTE: node-sql-parser는 postgresql이라고 지정해야함.
const dbOption = () => ({
  database: ["pg", "pgnative"].includes(Sonamu.config.database.database ?? "pg")
    ? "postgresql"
    : undefined,
});

/**
 * SQL 쿼리 문자열을 AST(Abstract Syntax Tree)로 파싱
 *
 * @param query - 파싱할 SQL 쿼리 문자열
 * @returns 파싱된 AST 객체
 * @throws SQL 파싱 실패 시 에러
 */
function parseQuery(query: string): AST {
  try {
    const result = parser.astify(query, dbOption());
    const ast = Array.isArray(result) ? result[0] : result;

    assert(ast);
    return ast;
  } catch (e) {
    throw new Error(`Failed to parse SQL query: ${query}\n${e}`, { cause: e });
  }
}

/**
 * AST 표현식(Expression)을 SQL 문자열로 변환
 *
 * @param expr - WHERE, ON, HAVING 등에서 사용되는 조건 표현식
 * @returns SQL 문자열 또는 변환 실패 시 null
 */
function exprToString(expr: Binary | unknown): string | null {
  if (!expr) return null;
  try {
    return parser.exprToSQL(expr, dbOption());
  } catch {
    return null;
  }
}

/** TYPE - 쿼리 타입 추출: select, insert, update, delete */
function extractType(ast: AST): string {
  return ast.type;
}

/** FROM - 쿼리의 대상 테이블명 추출 */
function extractTable(ast: AST): string | null {
  const from = (ast as { from?: { table?: string }[] }).from;
  const table = (ast as { table?: { table?: string }[] }).table;
  const tables = from ?? table;
  if (!tables || tables.length === 0) return null;
  return tables[0]?.table ?? null;
}

/** COLUMNS - SELECT 절의 컬럼 목록 추출 (alias 포함) */
function extractColumns(ast: AST): string | null {
  const columns = (ast as { columns?: unknown }).columns;
  if (!columns) return null;
  if (columns === "*") return "*";

  if (Array.isArray(columns)) {
    const parts = columns.map((col: { expr?: unknown; as?: string | { value: string } }) => {
      const exprSql = parser.exprToSQL(col.expr, dbOption());
      const alias = typeof col.as === "string" ? col.as : col.as?.value;
      return alias ? `${exprSql} AS \`${alias}\`` : exprSql;
    });
    return parts.join(", ");
  }
  return null;
}

/** UPDATE - SET절 추출 */
function extractSet(ast: AST): string | null {
  const set = (ast as { set?: { column: unknown; value: unknown }[] }).set;
  if (!set || set.length === 0) return null;

  const parts = set.map((s) => {
    const columnSql = (s.column as { expr: { value: string } }).expr.value;
    const valueSql = parser.exprToSQL(s.value, dbOption());
    return `${columnSql} = ${valueSql}`;
  });
  return parts.join(", ");
}

/** WHERE - 조건절 추출 */
function extractWhere(ast: AST): string | null {
  const where = (ast as { where?: Binary }).where;
  return exprToString(where);
}

/** JOIN - 조인 절 추출 (테이블명/서브쿼리, ON 조건 포함) */
function extractJoin(ast: AST): string | null {
  const from = (
    ast as { from?: { join?: string; table?: string; expr?: unknown; as?: string; on?: Binary }[] }
  ).from;
  if (!from) return null;

  const joins = from.filter((f) => f.join);
  if (joins.length === 0) return null;

  const parts = joins.map((j) => {
    const joinType = j.join?.toUpperCase() ?? "JOIN";
    // 서브쿼리면 (subquery) AS alias, 아니면 테이블명
    const table = j.table ?? `(subquery) AS ${j.as}`;
    const onClause = j.on ? ` ON ${exprToString(j.on)}` : "";
    return `${joinType} ${table}${onClause}`;
  });
  return parts.join(" ");
}

/** ORDER BY - 정렬 조건 추출 */
function extractOrderBy(ast: AST): string | null {
  const orderBy = (ast as { orderby?: OrderBy[] }).orderby;
  if (!orderBy || orderBy.length === 0) return null;

  const parts = orderBy.map((o) => {
    const exprSql = parser.exprToSQL(o.expr, dbOption());
    return `${exprSql} ${o.type}`;
  });
  return parts.join(", ");
}

/** LIMIT/OFFSET - 페이징 추출 */
function extractPagination(ast: AST): string | null {
  const limit = (ast as { limit?: { value: { value: number }[] } }).limit;
  if (!limit) return null;

  const values = limit.value;
  if (values.length === 1) {
    return `LIMIT ${values[0]?.value}`;
  }
  if (values.length === 2) {
    return `LIMIT ${values[1]?.value} OFFSET ${values[0]?.value}`;
  }
  return null;
}

/** GROUP BY - 그룹핑 조건 추출 */
function extractGroupBy(ast: AST): string | null {
  const groupBy = (ast as { groupby?: { columns?: unknown[] } }).groupby;
  if (!groupBy?.columns || groupBy.columns.length === 0) return null;

  const parts = groupBy.columns.map((col) => parser.exprToSQL(col, dbOption()));
  return parts.join(", ");
}

/** HAVING - 집계 필터 조건 추출 */
function extractHaving(ast: AST): string | null {
  const having = (ast as { having?: Binary }).having;
  return exprToString(having);
}

/** VALUES - INSERT 절 추출 */
function extractValues(ast: AST): string | null {
  const values = (ast as { values?: { values: unknown[] } }).values;
  if (!values) return null;
  return values.values.map((v) => parser.exprToSQL(v, dbOption())).join(", ");
}

/**
 * QueryPart별 추출 함수 매핑
 * expectQuery() 함수에서 part 인자에 따른 추출 함수를 찾는 데 사용됩니다.
 */
const extractors: Record<QueryPart, (ast: AST) => string | null> = {
  type: extractType,
  table: extractTable,
  columns: extractColumns,
  where: extractWhere,
  join: extractJoin,
  orderBy: extractOrderBy,
  pagination: extractPagination,
  groupBy: extractGroupBy,
  having: extractHaving,
  set: extractSet,
  values: extractValues,
};

/**
 * SQL 쿼리 문자열을 검증하기 위한 expect 래퍼
 *
 * @param query - SQL 쿼리 문자열
 * @param part - 추출할 쿼리 부분 (생략 시 전체 쿼리 검증)
 * @returns Vitest expect 객체
 *
 * @example
 * expectQuery('SELECT * FROM users WHERE id = 1', 'where').toBe('`id` = 1')
 */
export function expectQuery(query: string, part?: QueryPart) {
  if (!part) return expect(query);

  const ast = parseQuery(query);
  const extractedSql = extractors[part](ast);
  return expect(extractedSql);
}
