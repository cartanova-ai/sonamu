import SqlParser from "node-sql-parser";

import { isBooleanValue } from "../runtime-type";
import { isNumberValue, isObjectValue, isStringValue } from "../utils/runtime-value";

const INDEX_WHERE_SQL_PARSER = new SqlParser.Parser();

type SqlAstValue = null | undefined | boolean | number | string | SqlAstValue[] | SqlAstRecord;
interface SqlAstRecord {
  [key: string]: SqlAstValue;
}

function parseSqlAstValue<Value>(value: Value): SqlAstValue {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (isBooleanValue(value)) return value;
  if (isNumberValue(value)) return value;
  if (isStringValue(value)) return value;
  if (Array.isArray(value)) {
    return value.map(parseSqlAstValue);
  }
  if (isObjectValue(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, parseSqlAstValue(child)]),
    );
  }
  throw new Error("지원하지 않는 SQL AST 값입니다");
}

/**
 * Migration DDL 출력에 사용할 index predicate를 정리한다.
 * 원본 SQL 표현은 보존하고, 빈 문자열과 전체를 감싼 괄호만 제거한다.
 */
export function normalizeIndexWherePredicate(where: string | undefined): string | undefined {
  if (!where) {
    return undefined;
  }

  // 출력 경로에서는 사용자가 작성한 predicate를 최대한 그대로 유지한다.
  const trimmed = removeOuterSqlParentheses(where.trim());
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

/**
 * Index diff 비교에 사용할 predicate identity를 만든다.
 * PostgreSQL canonical 표현 차이는 AST 기반 정규화로 흡수한다.
 */
export function normalizeIndexWherePredicateForComparison(
  where: string | undefined,
): string | undefined {
  const normalized = normalizeIndexWherePredicate(where);
  if (!normalized) {
    return undefined;
  }

  // 파싱 가능한 predicate만 canonical form으로 바꾸고, 실패하면 기존 strict 비교를 유지한다.
  return normalizeIndexWherePredicateByAst(normalized) ?? normalized;
}

function removeOuterSqlParentheses(source: string): string {
  let trimmed = source.trim();

  // 전체 predicate를 감싼 괄호만 제거하고 내부 grouping은 건드리지 않는다.
  while (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    const closeIndex = findMatchingParenthesisInSql(trimmed, 0);
    if (closeIndex === trimmed.length - 1) {
      trimmed = trimmed.slice(1, -1).trim();
      continue;
    }

    break;
  }

  return trimmed;
}

function normalizeIndexWherePredicateByAst(where: string): string | undefined {
  try {
    // node-sql-parser는 raw predicate를 직접 파싱하지 않으므로 임시 SELECT WHERE로 감싼다.
    const parsed = parseSqlAstValue(
      INDEX_WHERE_SQL_PARSER.astify(
        `SELECT * FROM __sonamu_index_predicate_source WHERE ${where}`,
        { database: "postgresql" },
      ),
    );
    const statement = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!isSqlAstRecord(statement)) {
      return undefined;
    }

    return serializeIndexWhereAst(statement.where);
  } catch {
    return undefined;
  }
}

function serializeIndexWhereAst(node: SqlAstValue): string {
  // PostgreSQL이 IN을 ANY(ARRAY[...])로 재작성하므로 membership은 먼저 특수 처리한다.
  const membership = serializeSqlMembershipPredicate(node);
  if (membership) {
    return membership;
  }

  if (!isSqlAstRecord(node)) {
    return JSON.stringify(node);
  }

  const type = getSqlAstString(node, "type");
  switch (type) {
    case "binary_expr": {
      const operator = normalizeSqlOperator(getSqlAstString(node, "operator"));
      const left = serializeIndexWhereAst(node.left);
      const right = serializeIndexWhereAst(node.right);
      if (operator === "AND" || operator === "OR") {
        // AND/OR는 순서가 diff 의미를 바꾸지 않으므로 stable identity로 정렬한다.
        return `(${[left, right].toSorted().join(` ${operator} `)})`;
      }
      return `(${left} ${operator} ${right})`;
    }
    case "unary_expr": {
      const operator = normalizeSqlOperator(getSqlAstString(node, "operator"));
      return `(${operator} ${serializeIndexWhereAst(node.expr)})`;
    }
    case "column_ref": {
      return serializeSqlColumnRef(node);
    }
    case "single_quote_string": {
      return `string:${JSON.stringify(getSqlAstString(node, "value"))}`;
    }
    case "number": {
      return `number:${String(node.value)}`;
    }
    case "bool": {
      return `bool:${String(node.value).toLowerCase()}`;
    }
    case "null": {
      return "null";
    }
    case "cast": {
      const targetType = getSqlCastTargetType(node);
      const expr = node.expr;
      if (targetType && isTextLikeSqlType(targetType) && isSqlStringLiteralLike(expr)) {
        return serializeIndexWhereAst(stripTextLikeSqlCast(expr));
      }
      return `cast(${serializeIndexWhereAst(expr)} as ${targetType ?? "unknown"})`;
    }
    case "function": {
      return `fn:${getSqlFunctionName(node)}(${serializeSqlExprList(node.args).join(",")})`;
    }
    case "array": {
      return `array:[${serializeSqlArrayElements(node).map(serializeIndexWhereAst).join(",")}]`;
    }
    case "expr_list": {
      return `list:[${serializeSqlExprList(node).map(serializeIndexWhereAst).join(",")}]`;
    }
    case "default": {
      return `ident:${normalizeSqlIdentifier(getSqlAstString(node, "value") ?? "")}`;
    }
    default: {
      return serializeUnknownSqlAstRecord(node);
    }
  }
}

function serializeSqlMembershipPredicate(node: SqlAstValue): string | undefined {
  if (!isSqlAstRecord(node) || getSqlAstString(node, "type") !== "binary_expr") {
    return undefined;
  }

  // IN (...)과 = ANY(ARRAY[...])를 동일한 unordered membership 표현으로 맞춘다.
  const operator = normalizeSqlOperator(getSqlAstString(node, "operator"));
  const left = serializeIndexWhereAst(stripTextLikeSqlCast(node.left));
  const values = (() => {
    if (operator === "IN") {
      return serializeSqlMembershipValues(serializeSqlExprList(node.right));
    }

    if (operator === "=") {
      return serializeSqlMembershipValues(getSqlAnyArrayElements(node.right));
    }

    return undefined;
  })();

  if (!values) {
    return undefined;
  }

  return `membership:${left}:in:[${values.join(",")}]`;
}

function serializeSqlMembershipValues(values: SqlAstValue[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  // membership 값의 순서와 중복은 의미가 없으므로 안정적인 identity로 정렬한다.
  const serialized = values.map((value) => serializeIndexWhereAst(stripTextLikeSqlCast(value)));
  return [...new Set(serialized)].toSorted();
}

function getSqlAnyArrayElements(node: SqlAstValue): SqlAstValue[] | undefined {
  if (!isSqlAstRecord(node) || getSqlAstString(node, "type") !== "function") {
    return undefined;
  }
  if (getSqlFunctionName(node) !== "any") {
    return undefined;
  }

  // ANY()의 첫 번째 인자만 PostgreSQL 배열 membership 대상으로 해석한다.
  const [arg] = serializeSqlExprList(node.args);
  if (!arg) {
    return undefined;
  }

  return serializeSqlArrayElements(stripTextLikeSqlCast(arg));
}

function serializeSqlArrayElements(node: SqlAstValue): SqlAstValue[] {
  if (!isSqlAstRecord(node)) {
    return [];
  }

  // parser 버전에 따라 배열 원소가 array.expr_list 또는 expr_list로 들어온다.
  if (getSqlAstString(node, "type") === "array") {
    return serializeSqlExprList(node.expr_list);
  }

  return serializeSqlExprList(node);
}

function serializeSqlExprList(node: SqlAstValue): SqlAstValue[] {
  if (!isSqlAstRecord(node)) {
    return [];
  }

  // expr_list는 실제 AST 노드 배열이고, 단일 표현식은 배열 하나로 감싸 통일한다.
  if (getSqlAstString(node, "type") === "expr_list" && Array.isArray(node.value)) {
    return node.value;
  }

  return [node];
}

function stripTextLikeSqlCast(node: SqlAstValue): SqlAstValue {
  if (!isSqlAstRecord(node) || getSqlAstString(node, "type") !== "cast") {
    return node;
  }

  // PostgreSQL은 varchar/text cast를 배열 또는 원소 쪽으로 옮길 수 있어 비교에서 제거한다.
  const targetType = getSqlCastTargetType(node);
  if (!targetType || !isTextLikeSqlType(targetType)) {
    return node;
  }

  return stripTextLikeSqlCast(node.expr);
}

function isSqlStringLiteralLike(node: SqlAstValue): boolean {
  // 문자열 literal에 붙은 text 계열 cast는 membership 비교에서 의미가 같다.
  const stripped = stripTextLikeSqlCast(node);
  return isSqlAstRecord(stripped) && getSqlAstString(stripped, "type") === "single_quote_string";
}

function getSqlCastTargetType(node: SqlAstRecord): string | undefined {
  if (!Array.isArray(node.target)) {
    return undefined;
  }

  // character varying처럼 여러 token으로 오는 타입명을 하나의 정규화 문자열로 합친다.
  const dataTypes = node.target
    .map((target) => (isSqlAstRecord(target) ? getSqlAstString(target, "dataType") : undefined))
    .filter((dataType): dataType is string => dataType !== undefined);

  if (dataTypes.length === 0) {
    return undefined;
  }

  return normalizeSqlDataType(dataTypes.join(" "));
}

function isTextLikeSqlType(type: string): boolean {
  // 배열 cast(text[])도 원소 membership 비교에서는 text 계열 cast로 취급한다.
  const normalized = normalizeSqlDataType(type).replace(/\[\]$/g, "");
  return normalized === "text" || normalized === "varchar";
}

function normalizeSqlDataType(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^character varying$/, "varchar");
}

function serializeSqlColumnRef(node: SqlAstRecord): string {
  const table = serializeSqlIdentifierNode(node.table);
  const column = serializeSqlIdentifierNode(node.column);
  return `column:${table ? `${table}.` : ""}${column}`;
}

function serializeSqlIdentifierNode(node: SqlAstValue): string {
  if (isStringValue(node)) {
    return normalizeSqlIdentifier(node);
  }

  // quoted identifier와 function name의 AST shape 차이를 같은 identifier 문자열로 흡수한다.
  if (isSqlAstRecord(node)) {
    if (isStringValue(node.value)) {
      return normalizeSqlIdentifier(node.value);
    }

    if (isSqlAstRecord(node.expr) && isStringValue(node.expr.value)) {
      return normalizeSqlIdentifier(node.expr.value);
    }
  }

  return "";
}

function getSqlFunctionName(node: SqlAstRecord): string {
  const name = node.name;
  if (isStringValue(name)) {
    return normalizeSqlIdentifier(name);
  }

  // ANY처럼 name.name 배열로 오는 function AST를 schema-qualified 이름까지 지원한다.
  if (isSqlAstRecord(name)) {
    if (Array.isArray(name.name)) {
      return name.name.map(serializeSqlIdentifierNode).join(".");
    }

    const nameParts = serializeSqlExprList(name);
    if (nameParts.length > 0) {
      return nameParts.map(serializeSqlIdentifierNode).join(".");
    }
  }

  return "";
}

function normalizeSqlIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function normalizeSqlOperator(operator: string | undefined): string {
  return (operator ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function serializeUnknownSqlAstRecord(node: SqlAstRecord): string {
  // 아직 명시적으로 다루지 않는 AST 노드는 key 정렬로 최소한 안정적인 비교값을 만든다.
  const entries = Object.entries(node)
    .filter(([key]) => key !== "parentheses")
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${serializeIndexWhereAst(value)}`);

  return `record:{${entries.join(",")}}`;
}

function isSqlAstRecord(value: SqlAstValue): value is SqlAstRecord {
  return isObjectValue(value) && value !== null && !Array.isArray(value);
}

function getSqlAstString(node: SqlAstRecord, key: string): string | undefined {
  const value = node[key];
  return isStringValue(value) ? value : undefined;
}

function findMatchingParenthesisInSql(source: string, openIndex: number): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  // SQL 문자열과 quoted identifier 내부 괄호는 grouping 괄호로 세지 않는다.
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && nextChar === "'") {
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      if (inDoubleQuote && nextChar === '"') {
        index += 1;
        continue;
      }
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}
