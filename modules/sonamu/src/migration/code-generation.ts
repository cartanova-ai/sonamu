import equal from "fast-deep-equal";
import { type Knex } from "knex";
import { alphabetical, diff } from "radashi";

import { EntityManager } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import {
  type EntityProp,
  type GenMigrationCode,
  type MigrationColumn,
  type MigrationForeign,
  type MigrationIndex,
  type MigrationSet,
} from "../types/types";
import { isSearchTextProp } from "../types/types";
import { formatCode } from "../utils/formatter";
import { isStringValue } from "../utils/runtime-value";
import { differenceWith, intersectionBy } from "../utils/utils";
import {
  normalizeIndexWherePredicate,
  normalizeIndexWherePredicateForComparison,
} from "./index-where-predicate";
import { PostgreSQLSchemaReader } from "./postgresql-schema-reader";

/**
 * 컬럼 정의 결과 타입
 * - builder: Knex table builder 메서드로 실행할 구문 (table.xxx())
 * - raw: knex.raw()로 실행할 구문
 */
type ColumnDefinitionResult = {
  builder: string[];
  raw: string[];
};

type SearchTextHelperKind = "text-array" | "jsonb-array";

type SearchTextExpressionToken =
  | { type: "identifier"; value: string }
  | { type: "quotedIdentifier"; value: string }
  | { type: "string"; value: string }
  | { type: "symbol"; value: "(" | ")" | "," }
  | { type: "operator"; value: "||" | "::" };

type SearchTextExpressionNode =
  | { type: "identifier"; name: string; quoted: boolean }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "function"; name: string; args: SearchTextExpressionNode[] }
  | { type: "concat"; parts: SearchTextExpressionNode[] }
  | { type: "collate"; expr: SearchTextExpressionNode; collation: string; quoted: boolean }
  | { type: "cast"; expr: SearchTextExpressionNode; targetType: string };

const SEARCH_TEXT_HELPER_DEFINITIONS = {
  "text-array": `await knex.raw(\`CREATE OR REPLACE FUNCTION sonamu_text_array_agg(arr text[], ci boolean DEFAULT true)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(
    CASE WHEN ci THEN lower(value) ELSE value END,
    ' '
  )
  FROM unnest(arr) AS value
$$\`);`,
  "jsonb-array": `await knex.raw(\`CREATE OR REPLACE FUNCTION sonamu_jsonb_array_agg(arr jsonb, ci boolean DEFAULT true)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(
    CASE WHEN ci THEN lower(value) ELSE value END,
    ' '
  )
  FROM jsonb_array_elements_text(arr)
$$\`);`,
} satisfies Record<SearchTextHelperKind, string>;

class SearchTextExpressionParser {
  private index = 0;

  constructor(private readonly tokens: SearchTextExpressionToken[]) {}

  isAtEnd(): boolean {
    return this.index >= this.tokens.length;
  }

  parseExpression(): SearchTextExpressionNode {
    return this.parseConcat();
  }

  private parseConcat(): SearchTextExpressionNode {
    const parts = [this.parsePostfix()];

    while (this.matchOperator("||")) {
      parts.push(this.parsePostfix());
    }

    return parts.length === 1 ? parts[0] : { type: "concat", parts };
  }

  private parsePostfix(): SearchTextExpressionNode {
    let node = this.parsePrimary();

    while (true) {
      if (this.matchOperator("::")) {
        node = {
          type: "cast",
          expr: node,
          targetType: this.parseTypeName(),
        };
        continue;
      }

      if (this.matchIdentifier("collate")) {
        const token = this.consumeCollationToken();
        node = {
          type: "collate",
          expr: node,
          collation: token.value,
          quoted: token.type === "quotedIdentifier",
        };
        continue;
      }

      break;
    }

    return node;
  }

  private parsePrimary(): SearchTextExpressionNode {
    const token = this.consumeToken("표현식");

    if (token.type === "symbol" && token.value === "(") {
      const node = this.parseExpression();
      this.expectSymbol(")");
      return node;
    }

    if (token.type === "string") {
      return { type: "string", value: token.value };
    }

    if (token.type === "identifier" || token.type === "quotedIdentifier") {
      const lowerName = token.value.toLowerCase();
      if (token.type === "identifier" && (lowerName === "true" || lowerName === "false")) {
        return { type: "boolean", value: lowerName === "true" };
      }

      if (this.matchSymbol("(")) {
        if (token.type === "identifier" && lowerName === "trim" && this.isTrimBothFromForm()) {
          this.index += 2;
          const arg = this.parseExpression();
          this.expectSymbol(")");
          return { type: "function", name: "trim", args: [arg] };
        }

        const args = this.parseFunctionArgs();
        return {
          type: "function",
          name: token.value,
          args,
        };
      }

      return {
        type: "identifier",
        name: token.value,
        quoted: token.type === "quotedIdentifier",
      };
    }

    throw new Error(`지원되지 않는 searchText expression token: ${token.type}`);
  }

  private parseFunctionArgs(): SearchTextExpressionNode[] {
    if (this.matchSymbol(")")) {
      return [];
    }

    const args: SearchTextExpressionNode[] = [];
    do {
      args.push(this.parseExpression());
    } while (this.matchSymbol(","));

    this.expectSymbol(")");
    return args;
  }

  private parseTypeName(): string {
    const parts: string[] = [];

    while (true) {
      const token = this.peek();
      if (
        token?.type === "identifier" ||
        token?.type === "quotedIdentifier" ||
        (token?.type === "symbol" &&
          (token.value === "(" || token.value === ")" || token.value === ","))
      ) {
        if (token.type === "symbol") {
          break;
        }

        parts.push(token.value.toLowerCase());
        this.index += 1;
        continue;
      }

      break;
    }

    if (parts.length === 0) {
      throw new Error("타입 캐스팅 대상 타입을 찾을 수 없습니다.");
    }

    return parts.join(" ");
  }

  private consumeCollationToken(): Extract<
    SearchTextExpressionToken,
    { type: "identifier" | "quotedIdentifier" }
  > {
    const token = this.peek();
    if (token?.type !== "identifier" && token?.type !== "quotedIdentifier") {
      throw new Error("COLLATE 대상 식별자를 찾을 수 없습니다.");
    }
    this.index += 1;
    return token;
  }

  private isTrimBothFromForm(): boolean {
    const bothToken = this.peek();
    const fromToken = this.peek(1);

    return (
      bothToken?.type === "identifier" &&
      bothToken.value.toLowerCase() === "both" &&
      fromToken?.type === "identifier" &&
      fromToken.value.toLowerCase() === "from"
    );
  }

  private expectSymbol(value: "(" | ")" | ","): void {
    if (!this.matchSymbol(value)) {
      throw new Error(`"${value}" 토큰이 필요합니다.`);
    }
  }

  private matchSymbol(value: "(" | ")" | ","): boolean {
    const token = this.peek();
    if (token?.type === "symbol" && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchOperator(value: "||" | "::"): boolean {
    const token = this.peek();
    if (token?.type === "operator" && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchIdentifier(value: string): boolean {
    const token = this.peek();
    if (token?.type === "identifier" && token.value.toLowerCase() === value.toLowerCase()) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private consumeToken(context: string): SearchTextExpressionToken {
    const token = this.peek();
    if (!token) {
      throw new Error(`${context} 토큰이 필요합니다.`);
    }
    this.index += 1;
    return token;
  }

  private peek(offset = 0): SearchTextExpressionToken | undefined {
    return this.tokens[this.index + offset];
  }
}

function getIndexColumnOpclass(column: MigrationIndex["columns"][number]): string | undefined {
  return column.opclass ?? column.vectorOps;
}

function tokenizeSearchTextExpression(expression: string): SearchTextExpressionToken[] {
  const tokens: SearchTextExpressionToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (char === undefined) {
      break;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (expression.startsWith("||", index)) {
      tokens.push({ type: "operator", value: "||" });
      index += 2;
      continue;
    }

    if (expression.startsWith("::", index)) {
      tokens.push({ type: "operator", value: "::" });
      index += 2;
      continue;
    }

    if (char === "(" || char === ")" || char === ",") {
      tokens.push({ type: "symbol", value: char });
      index += 1;
      continue;
    }

    if (char === "'") {
      let value = "";
      index += 1;

      while (index < expression.length) {
        const current = expression[index];
        if (current === "'") {
          if (expression[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }

          index += 1;
          break;
        }

        if (current === undefined) {
          break;
        }

        value += current;
        index += 1;
      }

      tokens.push({ type: "string", value });
      continue;
    }

    if (char === '"') {
      let value = "";
      index += 1;

      while (index < expression.length) {
        const current = expression[index];
        if (current === '"') {
          if (expression[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }

          index += 1;
          break;
        }

        if (current === undefined) {
          break;
        }

        value += current;
        index += 1;
      }

      tokens.push({ type: "quotedIdentifier", value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let value = char;
      index += 1;

      while (index < expression.length) {
        const current = expression[index];
        if (current !== undefined && /[A-Za-z0-9_$]/.test(current)) {
          value += current;
          index += 1;
          continue;
        }
        break;
      }

      tokens.push({ type: "identifier", value });
      continue;
    }

    throw new Error(`지원되지 않는 searchText expression 문자: ${char}`);
  }

  return tokens;
}

function canonicalizeSearchTextGeneratedExpression(expression: string): string {
  try {
    const parser = new SearchTextExpressionParser(tokenizeSearchTextExpression(expression));
    const parsedExpression = parser.parseExpression();

    if (!parser.isAtEnd()) {
      throw new Error("searchText expression 파싱이 끝나지 않았습니다.");
    }

    return renderSearchTextExpression(normalizeSearchTextExpressionNode(parsedExpression));
  } catch {
    return normalizeSearchTextExpressionFallback(expression);
  }
}

function normalizeSearchTextExpressionNode(
  node: SearchTextExpressionNode,
): SearchTextExpressionNode {
  switch (node.type) {
    case "identifier":
      return {
        ...node,
        name: node.quoted ? node.name : node.name.toLowerCase(),
      };
    case "string":
    case "boolean":
      return node;
    case "concat": {
      const parts = node.parts.flatMap((part) => {
        const normalizedPart = normalizeSearchTextExpressionNode(part);
        return normalizedPart.type === "concat" ? normalizedPart.parts : [normalizedPart];
      });
      return { type: "concat", parts };
    }
    case "collate":
      return {
        type: "collate",
        expr: normalizeSearchTextExpressionNode(node.expr),
        collation: node.collation.toUpperCase() === "C" ? "C" : node.collation,
        quoted: node.quoted || node.collation.toUpperCase() === "C",
      };
    case "cast": {
      const normalizedExpr = normalizeSearchTextExpressionNode(node.expr);
      const targetType = node.targetType.replace(/\s+/g, " ").trim().toLowerCase();
      if (targetType === "text" || targetType === "character varying" || targetType === "varchar") {
        return normalizedExpr;
      }
      return {
        type: "cast",
        expr: normalizedExpr,
        targetType,
      };
    }
    case "function": {
      const name = node.name.toLowerCase();
      let args = node.args.map((arg) => normalizeSearchTextExpressionNode(arg));

      if ((name === "trim" || name === "btrim") && args.length === 1) {
        return {
          type: "function",
          name: "trim",
          args,
        };
      }

      if (
        (name === "sonamu_text_array_agg" || name === "sonamu_jsonb_array_agg") &&
        args.length === 2 &&
        args[1]?.type === "boolean" &&
        args[1].value
      ) {
        args = [args[0]];
      }

      return {
        type: "function",
        name,
        args,
      };
    }
  }
}

function renderSearchTextExpression(node: SearchTextExpressionNode, parentPrecedence = 0): string {
  const precedence = getSearchTextExpressionPrecedence(node);
  const rendered = (() => {
    switch (node.type) {
      case "identifier":
        return node.quoted ? `"${node.name.replaceAll('"', '""')}"` : node.name;
      case "string":
        return `'${node.value.replaceAll("'", "''")}'`;
      case "boolean":
        return node.value ? "true" : "false";
      case "function":
        return `${node.name}(${node.args
          .map((arg) => renderSearchTextExpression(arg))
          .join(", ")})`;
      case "concat":
        return node.parts.map((part) => renderSearchTextExpression(part, precedence)).join(" || ");
      case "collate": {
        const collation = node.quoted
          ? `"${node.collation.replaceAll('"', '""')}"`
          : node.collation;
        return `${renderSearchTextExpression(node.expr, precedence)} COLLATE ${collation}`;
      }
      case "cast":
        return `${renderSearchTextExpression(node.expr, precedence)}::${node.targetType}`;
    }
  })();

  if (precedence < parentPrecedence) {
    return `(${rendered})`;
  }

  return rendered;
}

function getSearchTextExpressionPrecedence(node: SearchTextExpressionNode): number {
  switch (node.type) {
    case "concat":
      return 1;
    case "collate":
    case "cast":
      return 2;
    default:
      return 3;
  }
}

function normalizeSearchTextExpressionFallback(expression: string): string {
  return expression
    .replace(/\s+/g, " ")
    .replace(/\bTRIM\s*\(\s*BOTH\s+FROM\s+/gi, "trim(")
    .replace(/::(?:text|character varying|varchar)\b/gi, "")
    .replace(/,\s*true\b/gi, "")
    .trim();
}

function visitSearchTextExpressionNode(
  node: SearchTextExpressionNode,
  visitor: (node: SearchTextExpressionNode) => void,
): void {
  visitor(node);

  switch (node.type) {
    case "concat":
      node.parts.forEach((part) => {
        visitSearchTextExpressionNode(part, visitor);
      });
      return;
    case "collate":
    case "cast":
      visitSearchTextExpressionNode(node.expr, visitor);
      return;
    case "function":
      node.args.forEach((arg) => {
        visitSearchTextExpressionNode(arg, visitor);
      });
      return;
    case "identifier":
    case "string":
    case "boolean":
      return;
  }
}

function getSearchTextHelperKindsFromExpression(expression: string): Set<SearchTextHelperKind> {
  const helperKinds = new Set<SearchTextHelperKind>();
  const addHelperKindFromName = (name: string) => {
    const normalizedName = name.toLowerCase();
    if (normalizedName === "sonamu_text_array_agg") {
      helperKinds.add("text-array");
    } else if (normalizedName === "sonamu_jsonb_array_agg") {
      helperKinds.add("jsonb-array");
    }
  };

  try {
    const parser = new SearchTextExpressionParser(tokenizeSearchTextExpression(expression));
    const parsedExpression = parser.parseExpression();

    if (!parser.isAtEnd()) {
      throw new Error("searchText helper expression 파싱이 끝나지 않았습니다.");
    }

    visitSearchTextExpressionNode(parsedExpression, (node) => {
      if (node.type === "function") {
        addHelperKindFromName(node.name);
      }
    });
  } catch {
    if (/\bsonamu_text_array_agg\s*\(/i.test(expression)) {
      helperKinds.add("text-array");
    }
    if (/\bsonamu_jsonb_array_agg\s*\(/i.test(expression)) {
      helperKinds.add("jsonb-array");
    }
  }

  return helperKinds;
}

function resolveSearchTextColumns(table: string, columns: MigrationColumn[]): MigrationColumn[] {
  const entity = (() => {
    try {
      return EntityManager.getByTable(table);
    } catch {
      return null;
    }
  })();

  if (!entity) {
    return columns;
  }

  const propsByName = new Map(entity.props.map((prop) => [prop.name, prop]));

  return columns.map((column) => {
    const prop = propsByName.get(column.name);
    if (!prop || !isSearchTextProp(prop)) {
      return column;
    }

    return {
      ...column,
      generated: {
        type: "STORED",
        expression: buildSearchTextGeneratedExpression(prop, propsByName),
      },
    };
  });
}

function buildSearchTextGeneratedExpression(
  prop: Extract<EntityProp, { type: "searchText" }>,
  propsByName: Map<string, EntityProp>,
): string {
  const tokens = prop.sourceColumns.map((source) => {
    const sourceProp = propsByName.get(source.name);
    if (!sourceProp) {
      throw new Error(`searchText source column "${source.name}"을(를) 찾을 수 없습니다.`);
    }

    if (sourceProp.type === "string") {
      return source.caseInsensitive
        ? `lower(COALESCE(${source.name}, ''))`
        : `COALESCE(${source.name}, '')`;
    }

    if (sourceProp.type === "string[]") {
      return source.caseInsensitive
        ? `COALESCE(sonamu_text_array_agg(${source.name}), '')`
        : `COALESCE(sonamu_text_array_agg(${source.name}, false), '')`;
    }

    if (sourceProp.type === "json") {
      return source.caseInsensitive
        ? `COALESCE(sonamu_jsonb_array_agg(${source.name}), '')`
        : `COALESCE(sonamu_jsonb_array_agg(${source.name}, false), '')`;
    }

    throw new Error(
      `searchText source column "${source.name}"의 타입 "${sourceProp.type}"은(는) 지원되지 않습니다.`,
    );
  });

  return `trim(${tokens.join(` || ' ' || `)})`;
}

function getSearchTextHelperDefinitions(table: string, columns: MigrationColumn[]): string[] {
  const helperKinds = new Set<SearchTextHelperKind>();

  columns.forEach((column) => {
    if (!column.generated) {
      return;
    }

    getSearchTextHelperKindsFromExpression(column.generated.expression).forEach((kind) => {
      helperKinds.add(kind);
    });
  });

  if (helperKinds.size > 0) {
    return (["text-array", "jsonb-array"] as const)
      .filter((kind) => helperKinds.has(kind))
      .map((kind) => SEARCH_TEXT_HELPER_DEFINITIONS[kind]);
  }

  const entity = (() => {
    try {
      return EntityManager.getByTable(table);
    } catch {
      return null;
    }
  })();

  if (!entity) {
    return [];
  }
  const propsByName = new Map(entity.props.map((prop) => [prop.name, prop]));

  columns.forEach((column) => {
    const prop = propsByName.get(column.name);
    if (!prop || !isSearchTextProp(prop)) {
      return;
    }

    prop.sourceColumns.forEach((source) => {
      const sourceProp = propsByName.get(source.name);
      if (sourceProp?.type === "string[]") {
        helperKinds.add("text-array");
      } else if (sourceProp?.type === "json") {
        helperKinds.add("jsonb-array");
      }
    });
  });

  return (["text-array", "jsonb-array"] as const)
    .filter((kind) => helperKinds.has(kind))
    .map((kind) => SEARCH_TEXT_HELPER_DEFINITIONS[kind]);
}

function getSearchTextColumnNames(table: string): Set<string> {
  const entity = (() => {
    try {
      return EntityManager.getByTable(table);
    } catch {
      return null;
    }
  })();

  if (!entity) {
    return new Set();
  }

  return new Set(entity.props.filter(isSearchTextProp).map((prop) => prop.name));
}

/**
 * 테이블 생성하는 케이스 - 컬럼/인덱스 생성
 */
async function generateCreateCode_ColumnAndIndexes(
  table: string,
  columns: MigrationColumn[],
  indexes: MigrationIndex[],
): Promise<GenMigrationCode> {
  const resolvedColumns = resolveSearchTextColumns(table, columns);
  const columnDefs = genColumnDefinitions(table, resolvedColumns);
  const helperDefinitions = getSearchTextHelperDefinitions(table, resolvedColumns);

  // 컬럼, 인덱스 처리
  const lines: string[] = [
    'import type { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    ...helperDefinitions,
    `await knex.schema.createTable("${table}", (table) => {`,
    ...columnDefs.builder,
    "});",
    // raw 구문 (Generated Column 등)
    ...columnDefs.raw,
    // index는 knex.raw로 처리하므로 createTable 밖에서 실행
    ...indexes.map((index) => genIndexDefinition(index, table)),
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    ` return knex.schema.dropTable("${table}");`,
    "}",
  ];
  return {
    table,
    type: "normal",
    title: `create__${table}`,
    formatted: await formatCode(lines.join("\n"), `src/migration/${table}.ts`),
  };
}

/**
 * MigrationColumn[] 읽어서 컬럼 정의하는 구문 생성
 * @returns builder: table builder 메서드, raw: knex.raw() 구문
 */
function genColumnDefinitions(table: string, columns: MigrationColumn[]): ColumnDefinitionResult {
  const result: ColumnDefinitionResult = {
    builder: [],
    raw: [],
  };

  for (const column of columns) {
    // Generated Column은 raw로 처리
    if (column.generated) {
      result.raw.push(genGeneratedColumnDefinition(table, column));
      continue;
    }

    // 일반 컬럼은 builder로 처리
    result.builder.push(genNormalColumnDefinition(column));
  }

  return result;
}

/**
 * Generated Column 정의 생성 (ALTER TABLE ADD COLUMN 사용)
 */
function genGeneratedColumnDefinition(table: string, column: MigrationColumn): string {
  if (!column.generated) {
    throw new Error("Generated column definition required");
  }
  const pgType = getPgTypeForColumn(column);
  const storageType = column.generated.type === "VIRTUAL" ? " VIRTUAL" : " STORED";
  const nullableClause = column.nullable ? "" : " NOT NULL";
  return `await knex.raw(\`ALTER TABLE "${table}" ADD COLUMN "${column.name}" ${pgType} GENERATED ALWAYS AS (${column.generated.expression})${storageType}${nullableClause}\`);`;
}

/**
 * 일반 컬럼 정의 생성 (table.xxx() 체인)
 */
function genNormalColumnDefinition(column: MigrationColumn): string {
  const chains: string[] = [];

  if (column.name === "id") {
    // PK 타입에 따른 분기 처리
    if (column.type === "string") {
      // string PK: length가 있으면 varchar, 없으면 text
      if (column.length !== undefined) {
        return `table.string('id', ${column.length}).primary().notNullable();`;
      }
      return `table.text('id').primary().notNullable();`;
    }
    if (column.type === "uuid") {
      return `table.uuid('id').primary().notNullable();`;
    }
    // 기존 integer PK (기본값)
    return `table.increments().primary();`;
  }

  // 배열 타입 처리
  if (column.type.endsWith("[]")) {
    const elementType = column.type.slice(0, -2); // "integer[]" -> "integer"
    const pgType = getPgArrayType(column, elementType);
    chains.push(`specificType('${column.name}', '${pgType}')`);
  } else if (column.type === "vector") {
    // Knex는 vector 타입을 직접 지원하지 않으므로 specificType 사용
    chains.push(`specificType('${column.name}', 'vector(${column.dimensions})')`);
  } else if (column.type === "numberOrNumeric") {
    // number
    if (column.numberType === "real") {
      chains.push(`float('${column.name}')`);
    } else if (column.numberType === "double precision") {
      chains.push(`double('${column.name}')`);
    } else if ((column.numberType ?? "numeric") === "numeric") {
      chains.push(`decimal('${column.name}', ${column.precision}, ${column.scale})`);
    }
  } else if (column.type === "string") {
    // string
    if (column.length !== undefined) {
      chains.push(`string('${column.name}', ${column.length})`);
    } else {
      chains.push(`text('${column.name}')`);
    }
  } else if (column.type === "date") {
    // date
    chains.push(
      `timestamp('${column.name}', { useTz: true, precision: ${column.precision ?? 3} })`,
    );
  } else if (column.type === "json") {
    // json
    chains.push(`jsonb('${column.name}')`);
  } else {
    // type, length
    chains.push(`${column.type}('${column.name}'${column.length ? `, ${column.length}` : ""})`);
  }

  // nullable
  chains.push(column.nullable ? "nullable()" : "notNullable()");

  // defaultTo
  if (column.defaultTo !== undefined) {
    if (isStringValue(column.defaultTo) && column.defaultTo.startsWith(`"`)) {
      chains.push(`defaultTo(${column.defaultTo})`);
    } else if (column.type === "json" && isStringValue(column.defaultTo)) {
      chains.push(`defaultTo(knex.raw("${column.defaultTo.replaceAll('"', "'")}::jsonb"))`);
    } else {
      chains.push(`defaultTo(knex.raw('${column.defaultTo}'))`);
    }
  }

  return `table.${chains.join(".")};`;
}

/**
 * MigrationColumn의 타입을 PostgreSQL 타입 문자열로 변환
 */
function getPgTypeForColumn(column: MigrationColumn): string {
  if (column.type.endsWith("[]")) {
    const elementType = column.type.slice(0, -2);
    return getPgArrayType(column, elementType);
  }

  switch (column.type) {
    case "string":
      return column.length !== undefined ? `varchar(${column.length})` : "text";
    case "bigInteger":
      return "bigint";
    case "numberOrNumeric":
      if (column.numberType === "real") return "real";
      if (column.numberType === "double precision") return "double precision";
      return `numeric(${column.precision}, ${column.scale})`;
    case "date":
      return "timestamptz";
    case "json":
      return "jsonb";
    case "vector":
      return `vector(${column.dimensions})`;
    default:
      return column.type;
  }
}

function getPgArrayType(column: MigrationColumn, elementType: string): string {
  if (elementType === "numberOrNumeric") {
    if (column.numberType === "real") return "real[]";
    if (column.numberType === "double precision") return "double precision[]";
    return `numeric(${column.precision}, ${column.scale})[]`;
  }
  if (elementType === "string") {
    return column.length ? `varchar(${column.length})[]` : "text[]";
  }
  if (elementType === "date") return "timestamptz[]";
  if (elementType === "integer") return "integer[]";
  if (elementType === "bigInteger") return "bigint[]";
  if (elementType === "boolean") return "boolean[]";
  if (elementType === "uuid") return "uuid[]";
  if (elementType === "enum") return "text[]";
  if (elementType === "vector") return `vector(${column.dimensions})[]`;

  throw new Error(`Unknown array element type: ${elementType}`);
}

/**
 * 개별 인덱스 정의 생성
 */
function genIndexDefinition(index: MigrationIndex, table: string): string {
  if (index.type === "hnsw" || index.type === "ivfflat") {
    return genVectorIndexDefinition(index, table);
  }

  if (index.using === "pgroonga") {
    return genPgroongaIndexDefinition(index, table);
  }

  const methodMap = {
    index: "INDEX",
    unique: "UNIQUE INDEX",
  };

  const nullsNotDistinctClause =
    index.type === "unique" && index.nullsNotDistinct !== undefined
      ? ` NULLS ${index.nullsNotDistinct ? "NOT DISTINCT" : "DISTINCT"}`
      : "";

  const usingClause = index.using === undefined ? "" : `USING ${index.using}`;
  const whereClause = getIndexWhereClause(index);

  return `await knex.raw(
  \`CREATE ${methodMap[index.type]} ${index.name} ON ${table} ${usingClause}(${index.columns
    .map((col) => {
      const opclassClause = (() => {
        const opclass = getIndexColumnOpclass(col);
        return opclass ? ` ${opclass}` : "";
      })();

      // 정렬 옵션은 btree만 사용 가능
      if (index.using !== "btree" && index.using !== undefined) {
        return `${col.name}${opclassClause}`;
      }

      const sortOrderClause = col.sortOrder === undefined ? "" : ` ${col.sortOrder}`;
      const nullsFirstClause =
        col.nullsFirst === undefined ? "" : ` NULLS ${col.nullsFirst ? "FIRST" : "LAST"}`;
      return `${col.name}${opclassClause}${sortOrderClause}${nullsFirstClause}`;
    })
    .join(", ")})${nullsNotDistinctClause}${whereClause};\`
  );`;
}

function genPgroongaIndexDefinition(index: MigrationIndex, table: string) {
  const entity = EntityManager.getByTable(table);
  const whereClause = getIndexWhereClause(index);

  // 복합 인덱스인 경우 ARRAY 사용
  const columnClause = (() => {
    if (index.columns.length === 1) {
      const column = entity.propsDict[index.columns[0].name];
      const option = getPgroongaColumnOption(column);
      return `${index.columns[0].name}${option ? ` ${option}` : ""}`;
    }

    return `(ARRAY[${index.columns.map((col) => `${col.name}::text`).join(",")}])`;
  })();

  return `await knex.raw(
  \`CREATE INDEX ${index.name} ON ${table} USING pgroonga (${columnClause}) WITH (tokenizer='TokenMecab')${whereClause};\`
  )`;
}

/**
 * PGroonga 컬럼 옵션 추출
 *
 * FullText 오퍼레이터를 지원하는 경우 우선 설정, 나머지는 디폴트 이용
 * @link https://pgroonga.github.io/reference
 */
function getPgroongaColumnOption(column: EntityProp) {
  if (column.type === "string" && column.length !== undefined) {
    return "pgroonga_varchar_full_text_search_ops_v2";
  } else if (column.type === "json") {
    return "pgroonga_jsonb_full_text_search_ops_v2";
  }
  return null;
}

/**
 * @description
 * - HNSW (Hierarchical Navigable Small World): 느린 빌드, 빠른 검색 속도, 높은 메모리 및 정확도
 * - IVFFlat (Inverted File with Flat Compression): 빠른 빌드, 중간 검색 속도, 낮은 메모리
 *
 * @example
 * // HNSW 인덱스 (권장 - 빠른 검색, 높은 정확도)
 * CREATE INDEX idx_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
 *
 * // IVFFlat 인덱스 (대용량 데이터, 비용 중요 시)
 * CREATE INDEX idx_embedding ON items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
 */
function genVectorIndexDefinition(index: MigrationIndex, table: string): string {
  const column = index.columns[0];
  const vectorOps = getIndexColumnOpclass(column) ?? "vector_cosine_ops";
  const whereClause = getIndexWhereClause(index);

  // HNSW (Hierarchical Navigable Small World) - 권장: 빠른 검색, 높은 정확도
  if (index.type === "hnsw") {
    const m = index.m ?? 16;
    const efConstruction = index.efConstruction ?? 64;
    return `await knex.raw(\`CREATE INDEX ${index.name} ON ${table} USING hnsw (${column.name} ${vectorOps}) WITH (m = ${m}, ef_construction = ${efConstruction})${whereClause}\`);`;
  }

  // IVFFlat (Inverted File with Flat Compression) - 대용량, 비용 중요 시
  if (index.type === "ivfflat") {
    const lists = index.lists ?? 100;
    return `await knex.raw(\`CREATE INDEX ${index.name} ON ${table} USING ivfflat (${column.name} ${vectorOps}) WITH (lists = ${lists})${whereClause}\`);`;
  }

  throw new Error(`Unknown raw SQL index type: ${index.type}`);
}

function getIndexWhereClause(index: MigrationIndex): string {
  const where = normalizeIndexWherePredicate(index.where);
  return where ? ` WHERE ${where}` : "";
}

/**
 * 테이블 생성하는 케이스 - FK 생성
 */
async function generateCreateCode_Foreign(
  table: string,
  foreigns: MigrationForeign[],
): Promise<GenMigrationCode[]> {
  if (foreigns.length === 0) {
    return [];
  }

  const { up, down } = genForeignDefinitions(table, foreigns);
  if (up.length === 0 && down.length === 0) {
    // foreigns가 있는데 생성된 코드가 없는 경우는 비정상적인 상황이지만,
    // 마이그레이션 생성을 중단시키지 않고 빈 배열을 반환합니다.
    return [];
  }

  const lines: string[] = [
    'import type { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    "// create fk",
    ...up,
    "});",
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    "// drop fk",
    ...down,
    "});",
    "}",
  ];

  const foreignKeysString = foreigns.map((foreign) => foreign.columns.join("_")).join("_");
  return [
    {
      table,
      type: "foreign",
      title: `foreign__${table}__${foreignKeysString}`,
      formatted: await formatCode(lines.join("\n"), `src/migration/${table}.ts`),
    },
  ];
}

/**
 * MigrationForeign[] 읽어서 외부키 constraint 정의하는 구문 생성
 */
function genForeignDefinitions(
  table: string,
  foreigns: MigrationForeign[],
): { up: string[]; down: string[] } {
  return foreigns.reduce(
    (r, foreign) => {
      const columnsStringQuote = foreign.columns
        .map((col) => `'${col.replace(`${table}.`, "")}'`)
        .join(",");
      r.up.push(
        `table.foreign('${foreign.columns.join(",")}')
            .references('${foreign.to}')
            .onUpdate('${foreign.onUpdate}')
            .onDelete('${foreign.onDelete}')`,
      );
      r.down.push(`table.dropForeign([${columnsStringQuote}])`);
      return r;
    },
    {
      up: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      down: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
    },
  );
}

/**
 * 테이블 변경 케이스 - 컬럼/인덱스 변경
 */
async function generateAlterCode_ColumnAndIndexes(
  table: string,
  entityColumns: MigrationColumn[],
  entityIndexes: MigrationIndex[],
  dbColumns: MigrationColumn[],
  dbIndexes: MigrationIndex[],
  dbForeigns: MigrationForeign[],
  compareDB?: Knex,
): Promise<GenMigrationCode[]> {
  const resolvedEntityColumns = resolveSearchTextColumns(table, entityColumns);
  const searchTextColumnNames = getSearchTextColumnNames(table);
  /*
    세부 비교 후 다른점 찾아서 코드 생성

    1. 컬럼갯수 다름: MD에 있으나, DB에 없다면 추가
    2. 컬럼갯수 다름: MD에 없으나, DB에 있다면 삭제
    3. 그외 컬럼(컬럼 갯수가 동일하거나, 다른 경우 동일한 컬럼끼리) => alter
    4. 다른거 다 동일하고 index만 변경되는 경우

    ** 컬럼명을 변경하는 경우는 따로 핸들링하지 않음
    => drop/add 형태의 마이그레이션 코드가 생성되는데, 수동으로 rename 코드로 수정하여 처리
  */

  // PK(id) 컬럼 타입 변경 감지 및 처리
  const entityIdCol = resolvedEntityColumns.find((col) => col.name === "id");
  const dbIdCol = dbColumns.find((col) => col.name === "id");

  if (entityIdCol && dbIdCol && compareDB) {
    const isPkTypeChanged =
      entityIdCol.type !== dbIdCol.type || entityIdCol.length !== dbIdCol.length;

    if (isPkTypeChanged) {
      return generatePkTypeChangeMigration(
        table,
        entityIdCol,
        dbIdCol,
        resolvedEntityColumns,
        entityIndexes,
        dbColumns,
        dbIndexes,
        dbForeigns,
        compareDB,
      );
    }
  }

  // 각 컬럼 이름 기준으로 add, drop, alter 여부 확인
  const alterColumnsTo = getAlterColumnsTo(resolvedEntityColumns, dbColumns, searchTextColumnNames);

  // 추출된 컬럼들을 기준으로 각각 라인 생성
  const alterColumnLinesTo = getAlterColumnLinesTo(
    alterColumnsTo,
    resolvedEntityColumns,
    table,
    dbForeigns,
  );

  // 인덱스의 add, drop 여부 확인
  const alterIndexesTo = getAlterIndexesTo(entityIndexes, dbIndexes);
  const recreatedSearchTextColumnNames = new Set(
    alterColumnsTo.alter
      .filter((dbColumn) => {
        const entityColumn = resolvedEntityColumns.find((col) => col.name === dbColumn.name);
        return (
          searchTextColumnNames.has(dbColumn.name) &&
          dbColumn.generated !== undefined &&
          entityColumn?.generated !== undefined
        );
      })
      .map((column) => column.name),
  );
  const recreatedSearchTextDbIndexes = dbIndexes.filter(
    (index) =>
      index.columns.some(({ name }) => recreatedSearchTextColumnNames.has(name)) &&
      !alterIndexesTo.drop.some((dropIndex) => dropIndex.name === index.name),
  );
  const recreatedSearchTextEntityIndexes = entityIndexes.filter(
    (index) =>
      index.columns.some(({ name }) => recreatedSearchTextColumnNames.has(name)) &&
      !alterIndexesTo.add.some((addIndex) => addIndex.name === index.name),
  );
  const implicitlyDroppedDbIndexes = alterIndexesTo.drop.filter((index) =>
    index.columns.every(({ name }) => alterColumnsTo.drop.some((column) => column.name === name)),
  );

  // 인덱스가 삭제되는 경우, 컬럼과 같이 삭제된 케이스에는 drop에서 제외해야함!
  const indexNeedsToDrop = alterIndexesTo.drop.filter(
    (index) => !implicitlyDroppedDbIndexes.some((droppedIndex) => droppedIndex.name === index.name),
  );

  // 빈 코드 생성 방지
  const hasUpChanges =
    alterColumnLinesTo.add.up.builder.length > 0 ||
    alterColumnLinesTo.add.up.raw.length > 0 ||
    alterColumnLinesTo.drop.up.builder.length > 0 ||
    alterColumnLinesTo.alter.up.builder.length > 0 ||
    alterColumnLinesTo.alter.up.raw.length > 0 ||
    alterIndexesTo.add.length > 0 ||
    indexNeedsToDrop.length > 0 ||
    recreatedSearchTextDbIndexes.length > 0;
  if (!hasUpChanges) {
    // 변경사항이 없으면 빈 배열 반환
    return [];
  }
  Naite.t("migrator:generateAlterCode_ColumnAndIndexes:debug", {
    "alterColumnsTo.add.length": alterColumnsTo.add.length,
    "alterColumnsTo.drop.length": alterColumnsTo.drop.length,
    "alterColumnsTo.alter.length": alterColumnsTo.alter.length,
    "alterIndexesTo.add.length": alterIndexesTo.add.length,
    "alterIndexesTo.drop.length": alterIndexesTo.drop.length,
    "indexNeedsToDrop.length": indexNeedsToDrop.length,
  });
  // Naite.t("migrator:generateAlterCode_ColumnAndIndexes:alterColumnsTo", alterColumnsTo);

  // TODO: 인덱스명 변경된 경우 처리

  // table builder 메서드로 실행할 코드 (drop → add → alter 순서)
  const upBuilderLines = [
    ...(alterColumnLinesTo.drop.up.builder.length > 0 ? alterColumnLinesTo.drop.up.builder : []),
    ...(alterColumnLinesTo.add.up.builder.length > 0 ? alterColumnLinesTo.add.up.builder : []),
    ...recreatedSearchTextDbIndexes.map(genIndexDropDefinition),
    ...(alterColumnLinesTo.alter.up.builder.length > 0 ? alterColumnLinesTo.alter.up.builder : []),
    ...indexNeedsToDrop.map(genIndexDropDefinition),
  ];

  // knex.raw()로 실행할 코드
  const upRawLines = [
    ...(alterColumnLinesTo.add.up.raw.length > 0 ? alterColumnLinesTo.add.up.raw : []),
    ...(alterColumnLinesTo.alter.up.raw.length > 0 ? alterColumnLinesTo.alter.up.raw : []),
    ...recreatedSearchTextEntityIndexes.map((index) => genIndexDefinition(index, table)),
    ...alterIndexesTo.add.map((index) => genIndexDefinition(index, table)),
  ];

  // down은 up의 역순 (add.down = drop rollback, drop.down = add rollback)
  const downBuilderLines = [
    ...(alterColumnLinesTo.add.down.builder.length > 0 ? alterColumnLinesTo.add.down.builder : []),
    ...recreatedSearchTextEntityIndexes.map(genIndexDropDefinition),
    ...(alterColumnLinesTo.alter.down.builder.length > 0
      ? alterColumnLinesTo.alter.down.builder
      : []),
    ...(alterColumnLinesTo.drop.down.builder.length > 0
      ? alterColumnLinesTo.drop.down.builder
      : []),
    ...alterIndexesTo.add
      .filter(
        (index) =>
          !index.columns.every((indexCol) =>
            alterColumnsTo.add.map((col) => col.name).includes(indexCol.name),
          ),
      )
      .map(genIndexDropDefinition),
  ];

  const downRawLines = [
    ...(alterColumnLinesTo.drop.down.raw.length > 0 ? alterColumnLinesTo.drop.down.raw : []),
    ...(alterColumnLinesTo.alter.down.raw.length > 0 ? alterColumnLinesTo.alter.down.raw : []),
    ...recreatedSearchTextDbIndexes.map((index) => genIndexDefinition(index, table)),
    ...implicitlyDroppedDbIndexes.map((index) => genIndexDefinition(index, table)),
    ...indexNeedsToDrop.map((index) => genIndexDefinition(index, table)),
  ];

  const lines: string[] = [
    'import type { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    ...(upBuilderLines.length > 0
      ? [`await knex.schema.alterTable("${table}", (table) => {`, ...upBuilderLines, "});"]
      : []),
    ...upRawLines,
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    ...(downBuilderLines.length > 0
      ? [`await knex.schema.alterTable("${table}", (table) => {`, ...downBuilderLines, "});"]
      : []),
    ...downRawLines,
    "}",
  ];

  const formatted = await formatCode(lines.join("\n"), `src/migration/${table}.ts`);
  const title = [
    "alter",
    table,
    ...(["add", "drop", "alter"] as const)
      .map((action) => {
        const len = alterColumnsTo[action].length;
        if (len > 0) {
          return action + len;
        }
        return null;
      })
      .filter((part) => part !== null),
  ].join("_");

  return [
    {
      table,
      title,
      formatted,
      type: "normal",
    },
  ];
}

/**
 * 컬럼 비교를 위해 Generated Column의 expression을 제외한 객체를 생성
 */
function normalizeColumnForComparison(
  col: MigrationColumn,
  searchTextColumnNames: Set<string>,
): MigrationColumn {
  if (!col.generated) {
    return col;
  }

  if (!searchTextColumnNames.has(col.name)) {
    return {
      ...col,
      generated: undefined,
    };
  }

  return {
    ...col,
    generated: {
      ...col.generated,
      expression: canonicalizeSearchTextGeneratedExpression(col.generated.expression),
    },
  };
}

/**
 * 각 컬럼 이름 기준으로 add, drop, alter 여부 확인
 */
function getAlterColumnsTo(
  entityColumns: MigrationColumn[],
  dbColumns: MigrationColumn[],
  searchTextColumnNames: Set<string>,
) {
  const columnsTo = {
    add: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationColumn[],
    drop: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationColumn[],
    alter:
      /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationColumn[],
  };

  // 컬럼명 기준 비교
  const extraColumns = {
    db: diff(dbColumns, entityColumns, (col) => [col.name, col.generated?.type].join("///")),
    entity: diff(entityColumns, dbColumns, (col) => [col.name, col.generated?.type].join("///")),
  };
  if (extraColumns.entity.length > 0) {
    columnsTo.add = columnsTo.add.concat(extraColumns.entity);
  }
  if (extraColumns.db.length > 0) {
    columnsTo.drop = columnsTo.drop.concat(extraColumns.db);
  }

  // 동일 컬럼명의 세부 필드 비교
  const sameDbColumns = intersectionBy(dbColumns, entityColumns, (col) => col.name);
  const sameMdColumns = intersectionBy(entityColumns, dbColumns, (col) => col.name);
  columnsTo.alter = differenceWith(sameDbColumns, sameMdColumns, (a, b) =>
    equal(
      normalizeColumnForComparison(a, searchTextColumnNames),
      normalizeColumnForComparison(b, searchTextColumnNames),
    ),
  );

  return columnsTo;
}

/**
 * 추출된 컬럼들을 기준으로 각각 라인 생성
 */
function getAlterColumnLinesTo(
  columnsTo: ReturnType<typeof getAlterColumnsTo>,
  entityColumns: MigrationColumn[],
  table: string,
  dbForeigns: MigrationForeign[],
) {
  const searchTextColumnNames = getSearchTextColumnNames(table);
  const linesTo = {
    add: {
      up: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
      down: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
    },
    drop: {
      up: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
      down: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
    },
    alter: {
      up: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
      down: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
    },
  };

  // add columns
  const addColumnDefs = genColumnDefinitions(table, columnsTo.add);
  linesTo.add.up = {
    builder: addColumnDefs.builder.length > 0 ? ["// add", ...addColumnDefs.builder] : [],
    raw:
      addColumnDefs.raw.length > 0
        ? [
            ...getSearchTextHelperDefinitions(table, columnsTo.add),
            "// add (generated)",
            ...addColumnDefs.raw,
          ]
        : [],
  };
  linesTo.add.down = {
    builder:
      columnsTo.add.length > 0
        ? [
            "// rollback - add",
            `table.dropColumns(${columnsTo.add.map((col) => `'${col.name}'`).join(", ")})`,
          ]
        : [],
    raw: [],
  };

  // drop할 컬럼에 걸린 FK 찾기
  const dropColumnNames = columnsTo.drop.map((col) => col.name);
  const fkToDropBeforeColumn = dbForeigns.filter((fk) =>
    fk.columns.some((col) => dropColumnNames.includes(col)),
  );

  const dropFkLines = fkToDropBeforeColumn.map((fk) => {
    const columnsStringQuote = fk.columns.map((col) => `'${col}'`).join(",");
    return `table.dropForeign([${columnsStringQuote}])`;
  });

  const restoreFkLines = genForeignDefinitions(table, fkToDropBeforeColumn).up;

  // drop의 rollback시에는 generated column도 복원해야 함
  const dropColumnDefs = genColumnDefinitions(table, columnsTo.drop);
  linesTo.drop = {
    up: {
      builder: [
        ...(dropFkLines.length > 0
          ? ["// drop foreign keys on columns to be dropped", ...dropFkLines]
          : []),
        ...(columnsTo.drop.length > 0
          ? [
              "// drop columns",
              `table.dropColumns(${columnsTo.drop.map((col) => `'${col.name}'`).join(", ")})`,
            ]
          : []),
      ],
      raw: [],
    },
    down: {
      builder: [
        ...(dropColumnDefs.builder.length > 0
          ? ["// rollback - drop columns", ...dropColumnDefs.builder]
          : []),
        ...(restoreFkLines.length > 0 ? ["// restore foreign keys", ...restoreFkLines] : []),
      ],
      raw:
        dropColumnDefs.raw.length > 0
          ? [
              ...getSearchTextHelperDefinitions(table, columnsTo.drop),
              "// rollback - drop columns (generated)",
              ...dropColumnDefs.raw,
            ]
          : [],
    },
  };

  // alter columns (Generated Column은 ALTER 불가하므로 drop 후 재생성)
  linesTo.alter = columnsTo.alter.reduce(
    (r, dbColumn) => {
      const entityColumn = entityColumns.find((col) => col.name === dbColumn.name);
      if (entityColumn === undefined) {
        return r;
      }

      if (
        searchTextColumnNames.has(dbColumn.name) &&
        dbColumn.generated !== undefined &&
        entityColumn.generated !== undefined
      ) {
        r.up.builder = [
          ...r.up.builder,
          "// alter generated column",
          `table.dropColumns('${dbColumn.name}')`,
        ];
        r.up.raw = [
          ...r.up.raw,
          ...getSearchTextHelperDefinitions(table, [entityColumn]),
          "// alter generated column",
          genGeneratedColumnDefinition(table, entityColumn),
        ];
        r.down.builder = [
          ...r.down.builder,
          "// rollback - alter generated column",
          `table.dropColumns('${dbColumn.name}')`,
        ];
        r.down.raw = [
          ...r.down.raw,
          ...getSearchTextHelperDefinitions(table, [dbColumn]),
          "// rollback - alter generated column",
          genGeneratedColumnDefinition(table, dbColumn),
        ];
        return r;
      }

      // 컬럼 변경사항
      const columnDiffUp = diff(
        genColumnDefinitions(table, [entityColumn]).builder,
        genColumnDefinitions(table, [dbColumn]).builder,
      );
      const columnDiffDown = diff(
        genColumnDefinitions(table, [dbColumn]).builder,
        genColumnDefinitions(table, [entityColumn]).builder,
      );
      if (columnDiffUp.length > 0) {
        r.up.builder = [
          ...r.up.builder,
          "// alter column",
          ...columnDiffUp.map((l) => `${l.replace(";", "")}.alter();`),
        ];
        r.down.builder = [
          ...r.down.builder,
          "// rollback - alter column",
          ...columnDiffDown.map((l) => `${l.replace(";", "")}.alter();`),
        ];
      }

      return r;
    },
    {
      up: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
      down: {
        builder:
          /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
        raw: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as string[],
      },
    },
  );

  return linesTo;
}

// 인덱스 고유 식별자 생성 (name을 제외한 모든 필드를 문자열로 변환하여 조합)
function migrationIndexIdentity(index: MigrationIndex): string {
  const keys = Object.keys(index)
    .filter((key) => key !== "name")
    .toSorted();

  return keys
    .map((key) => {
      if (key === "name") return undefined;
      if (key === "columns") {
        return /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ (
          index[key] as MigrationIndex["columns"]
        ).map((col) =>
          Object.keys(col)
            .toSorted()
            .map(
              (columnKey) =>
                `${columnKey}=${col[/* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ columnKey as keyof typeof col]}`,
            )
            .join("//"),
        );
      }
      return `${key}=${index[/* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ key as keyof MigrationIndex]}`;
    })
    .join("//");
}

/**
 * 인덱스의 add, drop 여부 확인
 */
export function getAlterIndexesTo(entityIndexes: MigrationIndex[], dbIndexes: MigrationIndex[]) {
  // 인덱스 비교
  const indexesTo = {
    add: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationIndex[],
    drop: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationIndex[],
  };

  const normalizedEntityIndexes = entityIndexes.map(setMigrationIndexDefaults);
  const normalizedDbIndexes = dbIndexes.map(setMigrationIndexDefaults);
  // 비교에는 정규화된 predicate를 쓰되, 실제 migration 출력은 원본 SQL을 보존한다.
  const comparisonEntityIndexes = entityIndexes.map(setMigrationIndexComparisonDefaults);
  const comparisonDbIndexes = dbIndexes.map(setMigrationIndexComparisonDefaults);
  const extraIndexes = {
    db: diff(comparisonDbIndexes, comparisonEntityIndexes, migrationIndexIdentity),
    entity: diff(comparisonEntityIndexes, comparisonDbIndexes, migrationIndexIdentity),
  };
  if (extraIndexes.entity.length > 0) {
    const addIdentities = new Set(extraIndexes.entity.map(migrationIndexIdentity));
    indexesTo.add = indexesTo.add.concat(
      normalizedEntityIndexes.filter((_, index) =>
        addIdentities.has(migrationIndexIdentity(comparisonEntityIndexes[index])),
      ),
    );
  }
  if (extraIndexes.db.length > 0) {
    const dropIdentities = new Set(extraIndexes.db.map(migrationIndexIdentity));
    indexesTo.drop = indexesTo.drop.concat(
      normalizedDbIndexes.filter((_, index) =>
        dropIdentities.has(migrationIndexIdentity(comparisonDbIndexes[index])),
      ),
    );
  }

  return indexesTo;
}

/**
 * 인덱스 삭제 정의 생성
 */
function genIndexDropDefinition(index: MigrationIndex) {
  return `table.dropIndex([${index.columns
    .map((column) => `'${column.name}'`)
    .join(",")}], '${index.name}')`;
}

/**
 * DB 조회 결과와 비교하기 위한 인덱스 기본값 설정
 */
export function setMigrationIndexDefaults(index: MigrationIndex): MigrationIndex {
  return setMigrationIndexDefaultsBase(index, false);
}

function setMigrationIndexComparisonDefaults(index: MigrationIndex): MigrationIndex {
  // DB canonical SQL과 entity SQL의 표현 차이를 diff identity에서만 흡수한다.
  return setMigrationIndexDefaultsBase(index, true);
}

function setMigrationIndexDefaultsBase(
  index: MigrationIndex,
  normalizeWhereForComparison: boolean,
): MigrationIndex {
  const isVectorIndex = index.type === "hnsw" || index.type === "ivfflat";
  const supportsOrdering = !isVectorIndex && (!index.using || index.using === "btree");
  const normalizedUsing = isVectorIndex ? index.using : (index.using ?? "btree");
  const normalizedWhere = normalizeWhereForComparison
    ? normalizeIndexWherePredicateForComparison(index.where)
    : normalizeIndexWherePredicate(index.where);

  const columns = index.columns.map((col) => {
    const column: MigrationIndex["columns"][number] = { name: col.name };
    const opclass = getIndexColumnOpclass(col);
    if (opclass) column.opclass = opclass;
    if (supportsOrdering) {
      column.sortOrder = col.sortOrder ?? "ASC";
      column.nullsFirst = col.nullsFirst ?? col.sortOrder === "DESC";
    }
    return column;
  });
  const normalizedIndex: MigrationIndex = {
    ...index,
    columns,
    nullsNotDistinct: index.nullsNotDistinct ?? false,
  };
  if (normalizedUsing) normalizedIndex.using = normalizedUsing;
  if (normalizedWhere) normalizedIndex.where = normalizedWhere;
  return normalizedIndex;
}

function migrationForeignKey(migrationForeign: MigrationForeign): string {
  return [migrationForeign.columns.join("-"), migrationForeign.to].join("///");
}

/**
 * 테이블 변경 케이스 - Foreign Key 변경
 */
async function generateAlterCode_Foreigns(
  table: string,
  entityForeigns: MigrationForeign[],
  dbForeigns: MigrationForeign[],
  droppingColumns: MigrationColumn[] = [],
): Promise<GenMigrationCode[]> {
  // console.log({ entityForeigns, dbForeigns });

  // 삭제될 컬럼명 목록
  const droppingColumnNames = droppingColumns.map((col) => col.name);

  const fkTo = entityForeigns.reduce(
    (result, entityF) => {
      const matchingDbF = dbForeigns.find(
        (dbF) => migrationForeignKey(entityF) === migrationForeignKey(dbF),
      );
      if (!matchingDbF) {
        result.add.push(entityF);
        return result;
      }

      if (!equal(entityF, matchingDbF)) {
        result.alterSrc.push(matchingDbF);
        result.alterDst.push(entityF);
        return result;
      }
      return result;
    },
    {
      add: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationForeign[],
      drop: /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationForeign[],
      alterSrc:
        /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationForeign[],
      alterDst:
        /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ [] as MigrationForeign[],
    },
  );

  // dbForeigns에는 있지만 entityForeigns에는 없는 경우 (삭제된 FK)
  // 단, 삭제될 컬럼의 FK는 제외 (generateAlterCode_ColumnAndIndexes에서 처리)
  dbForeigns.forEach((dbF) => {
    const matchingEntityF = entityForeigns.find(
      (entityF) => migrationForeignKey(entityF) === migrationForeignKey(dbF),
    );
    if (!matchingEntityF) {
      // 이 FK의 컬럼이 삭제될 컬럼 목록에 있는지 확인
      const isColumnDropping = dbF.columns.some((col) => droppingColumnNames.includes(col));
      // 컬럼이 삭제되지 않는 경우에만 FK drop 목록에 추가
      if (!isColumnDropping) {
        fkTo.drop.push(dbF);
      }
    }
  });

  const linesTo = {
    add: genForeignDefinitions(table, fkTo.add),
    drop: genForeignDefinitions(table, fkTo.drop),
    alterSrc: genForeignDefinitions(table, fkTo.alterSrc),
    alterDst: genForeignDefinitions(table, fkTo.alterDst),
  };

  // drop fk columns인 경우(생성될 코드 없는 경우) 패스
  const hasLines = Object.values(linesTo).some((l) => l.up.length > 0 || l.down.length > 0);
  if (!hasLines) {
    return [];
  }

  if (
    linesTo.add.up.length === 0 &&
    linesTo.drop.up.length === 0 &&
    linesTo.alterSrc.up.length === 0 &&
    linesTo.alterDst.up.length === 0
  ) {
    Naite.t("migrator:generateAlterCode_Foreigns:fkChangeCodeGenerationError", {
      table,
      entityForeigns,
      dbForeigns,
    });
    throw new Error("FK 변경 코드 생성 오류");
  }

  const lines: string[] = [
    'import type { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    ...linesTo.drop.down,
    ...linesTo.add.up,
    ...linesTo.alterSrc.down,
    ...linesTo.alterDst.up,
    "})",
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    `return knex.schema.alterTable("${table}", (table) => {`,
    ...linesTo.add.down,
    ...linesTo.alterDst.down,
    ...linesTo.alterSrc.up,
    ...linesTo.drop.up,
    "})",
    "}",
  ];

  const formatted = await formatCode(lines.join("\n"), `src/migration/${table}.ts`);
  const title = ["alter", table, "foreigns"].join("_");

  return [
    {
      table,
      title,
      formatted,
      type: "normal",
    },
  ];
}

/**
 * 주어진 EntitySet을 기반으로 테이블 CREATE 마이그레이션 코드를 생성합니다.
 * @param entitySet
 * @returns CREATE 마이그레이션 코드
 */
export async function generateCreateCode(entitySet: MigrationSet): Promise<GenMigrationCode[]> {
  return [
    await generateCreateCode_ColumnAndIndexes(
      entitySet.table,
      entitySet.columns,
      entitySet.indexes,
    ),
    ...(await generateCreateCode_Foreign(entitySet.table, entitySet.foreigns)),
  ];
}

function replaceColumnDefaultTo(column: MigrationColumn) {
  // FIXME: 일단 MySQL 상황에서 발생했던 이슈의 workaround 이므로 Pg에서 재확인 후 대응 추가
  return column;
}

function replaceNoActionOnMySQL(foreign: MigrationForeign) {
  // MySQL에서 RESTRICT와 NO ACTION은 동일함
  const { onDelete, onUpdate } = foreign;
  return {
    ...foreign,
    onUpdate: onUpdate === "RESTRICT" ? "NO ACTION" : onUpdate,
    onDelete: onDelete === "RESTRICT" ? "NO ACTION" : onDelete,
  };
}

/**
 * 주어진 entitySet을 목표로, dbSet을 현 상황으로 하여 테이블 ALTER 마이그레이션 코드를 생성합니다.
 * @param entitySet 현 상황의 MigrationSet
 * @param dbSet 목표 상황의 MigrationSet
 * @param compareDB PK 타입 변경 시 역참조 FK를 조회하기 위한 Knex 인스턴스 (선택)
 * @returns ALTER 마이그레이션 코드
 */
export async function generateAlterCode(
  entitySet: MigrationSet,
  dbSet: MigrationSet,
  compareDB?: Knex,
): Promise<GenMigrationCode[]> {
  const entityColumns = alphabetical(entitySet.columns, (a) => a.name).map(replaceColumnDefaultTo);
  const dbColumns = alphabetical(dbSet.columns, (a) => a.name).map(replaceColumnDefaultTo);

  /* 디버깅용 코드, 특정 컬럼에서 불일치 발생할 때 확인
        const entityColumn = entitySet.columns.find(
          (col) => col.name === "price_krw"
        );
        const dbColumn = dbSet.columns.find(
          (col) => col.name === "price_krw"
        );
        console.debug({ entityColumn, dbColumn });
         */

  const entityIndexes = alphabetical(entitySet.indexes, (a) =>
    [a.type, ...a.columns.map((c) => c.name)].join("-"),
  );
  const dbIndexes = alphabetical(dbSet.indexes, (a) =>
    [a.type, ...a.columns.map((c) => c.name)].join("-"),
  );

  const entityForeigns = alphabetical(entitySet.foreigns, (a) =>
    [a.to, ...a.columns].join("-"),
  ).map((f) => replaceNoActionOnMySQL(f));
  const dbForeigns = alphabetical(dbSet.foreigns, (a) => [a.to, ...a.columns].join("-")).map((f) =>
    replaceNoActionOnMySQL(f),
  );

  // 삭제될 컬럼 목록 계산
  const droppingColumns = diff(dbColumns, entityColumns, (col) => col.name);

  const alterCodes: (GenMigrationCode | GenMigrationCode[] | null)[] = [];

  // 1. columnsAndIndexes 처리
  const searchTextColumnNames = getSearchTextColumnNames(entitySet.table);
  const isEqualColumns = equal(
    entityColumns.map((column) => normalizeColumnForComparison(column, searchTextColumnNames)),
    dbColumns.map((column) => normalizeColumnForComparison(column, searchTextColumnNames)),
  );
  const isEqualIndexes = equal(
    entityIndexes.map(setMigrationIndexDefaults),
    dbIndexes.map(setMigrationIndexDefaults),
  );
  if (!isEqualColumns || !isEqualIndexes) {
    alterCodes.push(
      await generateAlterCode_ColumnAndIndexes(
        entitySet.table,
        entityColumns,
        entityIndexes,
        dbColumns,
        dbIndexes,
        dbSet.foreigns,
        compareDB,
      ),
    );
  }

  // 2. foreigns 처리 (삭제될 컬럼 정보 전달)
  if (!equal(entityForeigns, dbForeigns)) {
    alterCodes.push(
      await generateAlterCode_Foreigns(
        entitySet.table,
        entityForeigns,
        dbForeigns,
        droppingColumns,
      ),
    );
  }

  if (alterCodes.every((alterCode) => alterCode === null)) {
    return [];
  }

  return alterCodes.filter((alterCode) => alterCode !== null).flat();
}

/**
 * PK 타입 변경 시 역참조 FK 제약조건을 처리하는 마이그레이션 코드를 생성합니다.
 *
 * PK 타입 변경 시 순서:
 * 1. FK 제약조건 삭제 (역참조 테이블들)
 * 2. 자기 참조 FK 삭제 (있는 경우)
 * 3. PK 제약조건 삭제
 * 4. PK 컬럼 타입 변경
 * 5. FK 컬럼 타입 변경 (역참조 테이블들)
 * 6. PK 제약조건 복구
 * 7. 자기 참조 FK 복구
 * 8. FK 제약조건 복구
 */
async function generatePkTypeChangeMigration(
  table: string,
  entityIdCol: MigrationColumn,
  dbIdCol: MigrationColumn,
  _entityColumns: MigrationColumn[],
  _entityIndexes: MigrationIndex[],
  _dbColumns: MigrationColumn[],
  _dbIndexes: MigrationIndex[],
  _dbForeigns: MigrationForeign[],
  compareDB: Knex,
): Promise<GenMigrationCode[]> {
  // 역참조 FK 조회 (이 테이블의 PK를 참조하는 다른 테이블의 FK들)
  const referencingFKs = await PostgreSQLSchemaReader.getReferencingForeignKeys(compareDB, table);

  // 자기 참조 FK 분리 (예: Department.parent_id → Department.id)
  const selfReferencingFKs = referencingFKs.filter((fk) => fk.tableName === table);
  const externalReferencingFKs = referencingFKs.filter((fk) => fk.tableName !== table);

  // PK 제약조건 이름 조회
  const pkConstraintName = `${table}_pkey`;

  // 새 PK 타입에 맞는 PostgreSQL 타입 문자열
  const newPkPgType = getPkPgType(entityIdCol);
  const oldPkPgType = getPkPgType(dbIdCol);

  // UP 코드 생성
  const upLines: string[] = [];

  // 1. 외부 테이블의 FK 제약조건 삭제
  for (const fk of externalReferencingFKs) {
    upLines.push(`  // ${fk.tableName}.${fk.columnName} FK 제약조건 삭제`);
    upLines.push(
      `  await knex.raw('ALTER TABLE "${fk.tableName}" DROP CONSTRAINT "${fk.constraintName}"');`,
    );
  }

  // 2. 자기 참조 FK 삭제
  for (const fk of selfReferencingFKs) {
    upLines.push(`  // 자기 참조 FK 삭제: ${fk.columnName}`);
    upLines.push(
      `  await knex.raw('ALTER TABLE "${table}" DROP CONSTRAINT "${fk.constraintName}"');`,
    );
  }

  // 3. PK 제약조건 삭제
  upLines.push(`  // PK 제약조건 삭제`);
  upLines.push(`  await knex.raw('ALTER TABLE "${table}" DROP CONSTRAINT "${pkConstraintName}"');`);

  // 4. PK 컬럼 타입 변경
  upLines.push(`  // PK 컬럼 타입 변경`);
  upLines.push(
    `  await knex.raw('ALTER TABLE "${table}" ALTER COLUMN "id" TYPE ${newPkPgType} USING "id"::${newPkPgType}');`,
  );

  // 5. FK 컬럼 타입 변경 (역참조 테이블들) - 자기 참조 포함
  for (const fk of referencingFKs) {
    upLines.push(`  // ${fk.tableName}.${fk.columnName} 컬럼 타입 변경`);
    upLines.push(
      `  await knex.raw('ALTER TABLE "${fk.tableName}" ALTER COLUMN "${fk.columnName}" TYPE ${newPkPgType} USING "${fk.columnName}"::${newPkPgType}');`,
    );
  }

  // 6. PK 제약조건 복구
  upLines.push(`  // PK 제약조건 복구`);
  upLines.push(
    `  await knex.raw('ALTER TABLE "${table}" ADD CONSTRAINT "${pkConstraintName}" PRIMARY KEY ("id")');`,
  );

  // 7. 자기 참조 FK 복구
  for (const fk of selfReferencingFKs) {
    upLines.push(`  // 자기 참조 FK 복구: ${fk.columnName}`);
    upLines.push(
      `  await knex.raw('ALTER TABLE "${table}" ADD CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.columnName}") REFERENCES "${table}"("id") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}');`,
    );
  }

  // 8. 외부 테이블의 FK 제약조건 복구
  for (const fk of externalReferencingFKs) {
    upLines.push(`  // ${fk.tableName}.${fk.columnName} FK 제약조건 복구`);
    upLines.push(
      `  await knex.raw('ALTER TABLE "${fk.tableName}" ADD CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.columnName}") REFERENCES "${table}"("id") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}');`,
    );
  }

  // DOWN 코드 생성 (역순)
  const downLines: string[] = [];

  // 1. 외부 테이블의 FK 제약조건 삭제
  for (const fk of externalReferencingFKs) {
    downLines.push(`  // ${fk.tableName}.${fk.columnName} FK 제약조건 삭제`);
    downLines.push(
      `  await knex.raw('ALTER TABLE "${fk.tableName}" DROP CONSTRAINT "${fk.constraintName}"');`,
    );
  }

  // 2. 자기 참조 FK 삭제
  for (const fk of selfReferencingFKs) {
    downLines.push(`  // 자기 참조 FK 삭제: ${fk.columnName}`);
    downLines.push(
      `  await knex.raw('ALTER TABLE "${table}" DROP CONSTRAINT "${fk.constraintName}"');`,
    );
  }

  // 3. PK 제약조건 삭제
  downLines.push(`  // PK 제약조건 삭제`);
  downLines.push(
    `  await knex.raw('ALTER TABLE "${table}" DROP CONSTRAINT "${pkConstraintName}"');`,
  );

  // 4. PK 컬럼 타입 원복
  downLines.push(`  // PK 컬럼 타입 원복`);
  downLines.push(
    `  await knex.raw('ALTER TABLE "${table}" ALTER COLUMN "id" TYPE ${oldPkPgType} USING "id"::${oldPkPgType}');`,
  );

  // 5. FK 컬럼 타입 원복 (역참조 테이블들)
  for (const fk of referencingFKs) {
    downLines.push(`  // ${fk.tableName}.${fk.columnName} 컬럼 타입 원복`);
    downLines.push(
      `  await knex.raw('ALTER TABLE "${fk.tableName}" ALTER COLUMN "${fk.columnName}" TYPE ${oldPkPgType} USING "${fk.columnName}"::${oldPkPgType}');`,
    );
  }

  // 6. PK 제약조건 복구
  downLines.push(`  // PK 제약조건 복구`);
  downLines.push(
    `  await knex.raw('ALTER TABLE "${table}" ADD CONSTRAINT "${pkConstraintName}" PRIMARY KEY ("id")');`,
  );

  // 7. 자기 참조 FK 복구
  for (const fk of selfReferencingFKs) {
    downLines.push(`  // 자기 참조 FK 복구: ${fk.columnName}`);
    downLines.push(
      `  await knex.raw('ALTER TABLE "${table}" ADD CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.columnName}") REFERENCES "${table}"("id") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}');`,
    );
  }

  // 8. 외부 테이블의 FK 제약조건 복구
  for (const fk of externalReferencingFKs) {
    downLines.push(`  // ${fk.tableName}.${fk.columnName} FK 제약조건 복구`);
    downLines.push(
      `  await knex.raw('ALTER TABLE "${fk.tableName}" ADD CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.columnName}") REFERENCES "${table}"("id") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}');`,
    );
  }

  const lines: string[] = [
    'import type { Knex } from "knex";',
    "",
    "export async function up(knex: Knex): Promise<void> {",
    ...upLines,
    "}",
    "",
    "export async function down(knex: Knex): Promise<void> {",
    ...downLines,
    "}",
  ];

  const formatted = await formatCode(lines.join("\n"), `src/migration/${table}.ts`);

  return [
    {
      table,
      title: `alter_${table}_pk_type`,
      formatted,
      type: "normal",
    },
  ];
}

/**
 * PK 컬럼의 PostgreSQL 타입 문자열을 반환합니다.
 */
function getPkPgType(col: MigrationColumn): string {
  if (col.type === "string") {
    return col.length !== undefined ? `varchar(${col.length})` : "text";
  }
  if (col.type === "uuid") {
    return "uuid";
  }
  // integer의 경우 serial/integer 구분이 필요하지만,
  // 타입 변경 시에는 integer로 처리합니다.
  return "integer";
}
