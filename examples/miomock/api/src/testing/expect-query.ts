import { Parser } from "node-sql-parser";
import { type AST } from "node-sql-parser";
import { Sonamu } from "sonamu";
import { expect } from "vitest";

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
const stringTag = "[object String]";

function isObjectValue<Value>(value: Value): value is Value & object {
  return value !== null && Object(value) === value;
}

function isStringValue<Value>(value: Value): value is Value & string {
  return Object.prototype.toString.call(value) === stringTag && Object(value) !== value;
}

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

    if (ast === undefined) {
      throw new Error("파싱 결과에 AST가 없습니다.");
    }
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
function exprToString<Expression>(expr: Expression): string | null {
  if (!expr) return null;
  try {
    return parser.exprToSQL(expr, dbOption());
  } catch {
    return null;
  }
}

function extractFirstTable<Value>(value: Value): string | null {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (isObjectValue(candidate) && "table" in candidate && isStringValue(candidate.table)) {
      return candidate.table;
    }
  }
  return null;
}

function extractAlias<Value>(value: Value): string | null {
  if (isStringValue(value)) return value;
  if (isObjectValue(value) && "value" in value && isStringValue(value.value)) {
    return value.value;
  }
  return null;
}

function extractColumn<Column>(column: Column): string | null {
  if (!isObjectValue(column) || !("expr" in column)) return null;

  const exprSql = parser.exprToSQL(column.expr, dbOption());
  const alias = "as" in column ? extractAlias(column.as) : null;
  return alias ? `${exprSql} AS \`${alias}\`` : exprSql;
}

function extractSetColumn<SetItem>(setItem: SetItem): string | null {
  if (!isObjectValue(setItem) || !("column" in setItem)) return null;
  if (isStringValue(setItem.column)) return setItem.column;
  if (!isObjectValue(setItem.column) || !("expr" in setItem.column)) return null;

  const expr = setItem.column.expr;
  if (!isObjectValue(expr) || !("value" in expr) || !isStringValue(expr.value)) return null;
  return expr.value;
}

/** TYPE - 쿼리 타입 추출: select, insert, update, delete */
function extractType(ast: AST): string {
  return ast.type;
}

/** FROM - 쿼리의 대상 테이블명 추출 */
function extractTable(ast: AST): string | null {
  switch (ast.type) {
    case "select":
      return extractFirstTable(ast.from);
    case "insert":
    case "replace":
    case "update":
      return extractFirstTable(ast.table);
    case "delete":
      return extractFirstTable(ast.from) ?? extractFirstTable(ast.table);
    default:
      return null;
  }
}

/** COLUMNS - SELECT 절의 컬럼 목록 추출 (alias 포함) */
function extractColumns(ast: AST): string | null {
  if (ast.type !== "select" || !ast.columns) return null;
  if (!Array.isArray(ast.columns)) return null;

  const parts: string[] = [];
  for (const column of ast.columns) {
    const part = extractColumn(column);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join(", ");
}

/** UPDATE - SET절 추출 */
function extractSet(ast: AST): string | null {
  if (ast.type !== "update" || ast.set.length === 0) return null;

  const parts: string[] = [];
  for (const setItem of ast.set) {
    const columnSql = extractSetColumn(setItem);
    if (columnSql === null) return null;

    const valueSql = parser.exprToSQL(setItem.value, dbOption());
    parts.push(`${columnSql} = ${valueSql}`);
  }
  return parts.join(", ");
}

/** WHERE - 조건절 추출 */
function extractWhere(ast: AST): string | null {
  if (!("where" in ast)) return null;
  return exprToString(ast.where);
}

/** JOIN - 조인 절 추출 (테이블명/서브쿼리, ON 조건 포함) */
function extractJoin(ast: AST): string | null {
  if (ast.type !== "select" || !Array.isArray(ast.from)) return null;

  const parts: string[] = [];
  for (const fromItem of ast.from) {
    if (!isObjectValue(fromItem) || !("join" in fromItem) || !isStringValue(fromItem.join)) {
      continue;
    }

    const joinType = fromItem.join.toUpperCase();
    const tableName = "table" in fromItem && isStringValue(fromItem.table) ? fromItem.table : null;
    const alias = "as" in fromItem ? extractAlias(fromItem.as) : null;
    // 서브쿼리면 별칭으로 표시하고, 아니면 실제 테이블명을 사용합니다.
    const table = tableName ?? `(subquery) AS ${alias}`;
    const on = "on" in fromItem ? fromItem.on : null;
    const onClause = on ? ` ON ${exprToString(on)}` : "";
    parts.push(`${joinType} ${table}${onClause}`);
  }
  return parts.length === 0 ? null : parts.join(" ");
}

/** ORDER BY - 정렬 조건 추출 */
function extractOrderBy(ast: AST): string | null {
  if (ast.type !== "select" || !ast.orderby || ast.orderby.length === 0) return null;

  const parts = ast.orderby.map((orderBy) => {
    const exprSql = parser.exprToSQL(orderBy.expr, dbOption());
    return `${exprSql} ${orderBy.type}`;
  });
  return parts.join(", ");
}

/** LIMIT/OFFSET - 페이징 추출 */
function extractPagination(ast: AST): string | null {
  if (ast.type !== "select" || !ast.limit) return null;

  const values = ast.limit.value;
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
  if (ast.type !== "select" || !ast.groupby?.columns || ast.groupby.columns.length === 0) {
    return null;
  }

  const parts = ast.groupby.columns.map((column) => parser.exprToSQL(column, dbOption()));
  return parts.join(", ");
}

/** HAVING - 집계 필터 조건 추출 */
function extractHaving(ast: AST): string | null {
  if (ast.type !== "select") return null;
  return exprToString(ast.having);
}

/** VALUES - INSERT 절 추출 */
function extractValues(ast: AST): string | null {
  if ((ast.type !== "insert" && ast.type !== "replace") || ast.values.type !== "values") {
    return null;
  }
  return ast.values.values.map((value) => parser.exprToSQL(value, dbOption())).join(", ");
}

/**
 * QueryPart별 추출 함수 매핑
 * expectQuery() 함수에서 part 인자에 따른 추출 함수를 찾는 데 사용됩니다.
 */
const extractors = {
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
} satisfies Record<QueryPart, (ast: AST) => string | null>;

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
