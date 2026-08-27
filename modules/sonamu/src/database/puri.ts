/* oxlint-disable @typescript-eslint/no-explicit-any */ // Puri는 다양한 타입을 사용하고 있습니다.

import assert from "assert";

import chalk from "chalk";
import inflection from "inflection";
import { type Knex } from "knex";

import { EntityManager } from "../entity/entity-manager";
import { type TableSpec } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import {
  isFunctionValue,
  isNumberValue,
  isObjectValue,
  isStringValue,
} from "../utils/runtime-value";
import { type ClearStatements } from "./puri-subset.types";
import {
  type AvailableColumns,
  type ColumnKeys,
  type ComparisonOperator,
  type Expand,
  type ExtractColumnType,
  type FulltextColumns,
  type FuzzyOperator,
  type InsertData,
  type InsertResult,
  type JsonColumns,
  type JsonSupersetValue,
  type LeftJoinedMarker,
  type LeftJoinMarkerFor,
  type NumericColumns,
  type OnConflictAction,
  type ParseSelectObject,
  type ResultAvailableColumns,
  type SelectAllResult,
  type SelectObject,
  type SelectValue,
  type SingleTableValue,
  type SqlExpression,
  type TsHighlightOptions,
  type TsQueryConfig,
  type TsQueryOptions,
  type TsRankOptions,
  type VectorColumns,
  type WhereCondition,
  type WhereOperator,
} from "./puri.types";
import { FUZZY_OPERATORS } from "./puri.types";

type PuriOrderByDirection = "asc" | "desc";
type PuriOrderByNulls = "first" | "last";
type PuriOrderByExpression = SqlExpression<"number"> | SqlExpression<"string">;
type PuriOrderByItem<TColumn extends string> = {
  column: TColumn | PuriOrderByExpression;
  order?: PuriOrderByDirection;
  nulls?: PuriOrderByNulls;
};
type PuriOrderByEntry<TColumn extends string> =
  | TColumn
  | PuriOrderByExpression
  | PuriOrderByItem<TColumn>;
type PuriOrderByRuntimeItem = {
  column: string | PuriOrderByExpression;
  order?: PuriOrderByDirection;
  nulls?: PuriOrderByNulls;
};
type PuriOrderByRuntimeEntry = string | PuriOrderByExpression | PuriOrderByRuntimeItem;

type FromRegistration = {
  kind: "from";
  alias: string;
  table: string | null;
};

type JoinRegistration = {
  kind: "join";
  alias: string;
  table: string | null;
  joinType: "join" | "leftJoin";
  left: string | null;
  right: string | null;
  reusable: boolean;
};

type CorrelationRegistration = FromRegistration | JoinRegistration;

export function parseFuzzyOperator(operator?: string): FuzzyOperator {
  const normalized = operator?.trim() ?? "<%";
  const fuzzyOperator = FUZZY_OPERATORS.find((candidate) => candidate === normalized);

  if (!fuzzyOperator) {
    throw new Error(`Invalid fuzzy operator: ${operator ?? ""}`);
  }

  return fuzzyOperator;
}

function serializeJsonSupersetValue<Value>(value: Value): string {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError(
      "Puri JSONB containment value must be JSON-serializable; JSON.stringify returned undefined.",
    );
  }

  return serialized;
}

function serializeJsonColumnValue<Value>(
  tableSpec: TableSpec | null,
  column: string,
  value: Value,
): Value | string {
  if (!tableSpec?.jsonColumns.includes(column) || value === undefined || value === null) {
    return value;
  }

  return JSON.stringify(value);
}

function normalizeOrderByDirection(direction: PuriOrderByDirection = "asc"): PuriOrderByDirection {
  if (direction !== "asc" && direction !== "desc") {
    throw new Error(`Invalid order direction: ${direction}`);
  }

  return direction;
}

function normalizeOrderByNulls(nulls?: PuriOrderByNulls): PuriOrderByNulls | undefined {
  if (nulls === undefined) {
    return undefined;
  }

  if (nulls !== "first" && nulls !== "last") {
    throw new Error(`Invalid order nulls: ${nulls}`);
  }

  return nulls;
}

function formatNullsSuffix(nulls?: PuriOrderByNulls): string {
  if (!nulls) {
    return "";
  }

  return ` NULLS ${nulls.toUpperCase()}`;
}

function isOrderByEntries<Value>(
  value: Value,
): value is Value & readonly PuriOrderByRuntimeEntry[] {
  return Array.isArray(value);
}

function isSqlExpression<Value>(value: Value): value is Value & PuriOrderByExpression {
  return isObjectValue(value) && "_type" in value && value["_type"] === "sql_expression";
}

function isNestedSelectObject<TTables extends object>(
  value: SelectValue<TTables> | SelectObject<TTables>,
): value is SelectObject<TTables> {
  return isObjectValue(value) && !("_type" in value);
}

export class Puri<TSchema, TTables extends object, TResult> {
  private knexQuery: Knex.QueryBuilder;
  private tableSpec: TableSpec | null = null;
  private correlationRegistry = new Map<string, CorrelationRegistration>();

  // 생성자 시그니처들
  constructor(knex: Knex, tableName: string);
  constructor(knex: Knex, tableSource: Record<string, string | Puri<TSchema, any, any>>);
  constructor(
    public knex: Knex,
    tableNameOrSource: any,
  ) {
    if (isStringValue(tableNameOrSource)) {
      // Case: new Puri(knex, "users")
      this.knexQuery = this.knex(tableNameOrSource).from(tableNameOrSource);
      this.tableSpec = this.safeGetTableSpec(tableNameOrSource);
      this.correlationRegistry.set(tableNameOrSource, {
        kind: "from",
        alias: tableNameOrSource,
        table: tableNameOrSource,
      });
    } else if (isObjectValue(tableNameOrSource)) {
      const entries = Object.entries(tableNameOrSource);
      if (entries.length !== 1) {
        throw new Error("Table spec must have exactly one entry");
      }
      assert(entries[0]);
      const [alias, source] = entries[0];
      if (isStringValue(source)) {
        this.knexQuery = this.knex(source).from({ [alias]: source });
        this.tableSpec = this.safeGetTableSpec(source);
        this.correlationRegistry.set(alias, { kind: "from", alias, table: source });
      } else if (source instanceof Puri) {
        const subqueryBuilder = source.rawQuery();
        this.knexQuery = this.knex.from(subqueryBuilder.as(alias));
        this.correlationRegistry.set(alias, { kind: "from", alias, table: null });
      } else {
        throw new Error("Invalid table specification");
      }
    } else {
      throw new Error("Invalid table specification");
    }
  }

  safeGetTableSpec(tableName: string): TableSpec | null {
    try {
      return EntityManager.getTableSpec(tableName);
    } catch {
      return null;
    }
  }

  // Static SQL helper functions for SELECT
  static count(column: string = "*"): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `COUNT(??)::integer`,
      _params: [column],
    };
  }
  static sum(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `SUM(??)`,
      _params: [column],
    };
  }
  static avg(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `AVG(??)`,
      _params: [column],
    };
  }
  static max(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `MAX(??)`,
      _params: [column],
    };
  }
  static min(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `MIN(??)`,
      _params: [column],
    };
  }
  static concat(...args: string[]): SqlExpression<"string"> {
    return {
      _type: "sql_expression",
      _return: "string",
      _sql: `CONCAT(${args.map(() => "?").join(", ")})`,
      _params: args,
    };
  }
  static upper(column: string): SqlExpression<"string"> {
    return {
      _type: "sql_expression",
      _return: "string",
      _sql: "UPPER(??)",
      _params: [column],
    };
  }
  static lower(column: string): SqlExpression<"string"> {
    return {
      _type: "sql_expression",
      _return: "string",
      _sql: "LOWER(??)",
      _params: [column],
    };
  }

  static wordSimilarity(
    column: string | SqlExpression<"string">,
    query: string,
  ): SqlExpression<"number"> {
    if (isStringValue(column)) {
      return {
        _type: "sql_expression",
        _return: "number",
        _sql: "word_similarity(?, ??)",
        _params: [query, column],
      };
    }

    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `word_similarity(?, ${column["_sql"]})`,
      _params: [query, ...column["_params"]],
    };
  }

  static similarity(
    column: string | SqlExpression<"string">,
    query: string,
  ): SqlExpression<"number"> {
    if (isStringValue(column)) {
      return {
        _type: "sql_expression",
        _return: "number",
        _sql: "similarity(??, ?)",
        _params: [column, query],
      };
    }

    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `similarity(${column["_sql"]}, ?)`,
      _params: [...column["_params"], query],
    };
  }

  static strictWordSimilarity(
    column: string | SqlExpression<"string">,
    query: string,
  ): SqlExpression<"number"> {
    if (isStringValue(column)) {
      return {
        _type: "sql_expression",
        _return: "number",
        _sql: `strict_word_similarity(?, ??)`,
        _params: [query, column],
      };
    }

    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `strict_word_similarity(?, ${column["_sql"]})`,
      _params: [query, ...column["_params"]],
    };
  }

  // Raw functions for SELECT
  static rawString(sql: string, params: Knex.RawBinding[] = []): SqlExpression<"string"> {
    return { _type: "sql_expression", _return: "string", _sql: sql, _params: params };
  }

  static rawStringArray(sql: string, params: Knex.RawBinding[] = []): SqlExpression<"string[]"> {
    return { _type: "sql_expression", _return: "string[]", _sql: sql, _params: params };
  }

  static rawNumber(sql: string, params: Knex.RawBinding[] = []): SqlExpression<"number"> {
    return { _type: "sql_expression", _return: "number", _sql: sql, _params: params };
  }

  static rawBoolean(sql: string, params: Knex.RawBinding[] = []): SqlExpression<"boolean"> {
    return { _type: "sql_expression", _return: "boolean", _sql: sql, _params: params };
  }

  static rawDate(sql: string, params: Knex.RawBinding[] = []): SqlExpression<"date"> {
    return { _type: "sql_expression", _return: "date", _sql: sql, _params: params };
  }

  /**
   * FTS 검색어 하이라이팅
   *
   * @example
   * .select({
   *   title: Puri.highlight("posts.title", search),
   *   content: Puri.highlight("posts.content", search, {
   *     startSel: "<mark>",
   *     stopSel: "</mark>",
   *     maxFragments: 3,
   *   }),
   * })
   */
  static tsHighlight(
    column: string,
    query: string,
    _options?: TsHighlightOptions,
  ): SqlExpression<"string"> {
    const { parser = "websearch_to_tsquery", config = "simple", ...options } = _options ?? {};

    const hlOptionParts = Object.entries(options).map(([key, value]) => {
      return `${inflection.camelize(key)}=${value}`;
    });

    const hlOptions = hlOptionParts.length > 0 ? `, '${hlOptionParts.join(", ")}'` : "";

    return {
      _type: "sql_expression",
      _return: "string",
      _sql: `ts_headline(?, ??, ${parser}(?, ?)${hlOptions})`,
      _params: [config, column, config, query],
    };
  }

  // ts_rank
  static tsRank(
    column: string | SqlExpression<"tsvector">,
    query: string,
    options?: TsRankOptions,
  ): SqlExpression<"number"> {
    return Puri["_tsRank"]("ts_rank", column, query, options);
  }

  // ts_rank_cd
  static tsRankCd(
    column: string | SqlExpression<"tsvector">,
    query: string,
    options?: TsRankOptions,
  ): SqlExpression<"number"> {
    return Puri["_tsRank"]("ts_rank_cd", column, query, options);
  }

  static toTsVector(column: string, config: string = "simple"): SqlExpression<"tsvector"> {
    return {
      _type: "sql_expression",
      _return: "tsvector",
      _sql: `to_tsvector(?, ??)`,
      _params: [config, column],
    };
  }

  static _tsRank(
    type: "ts_rank" | "ts_rank_cd",
    column: string | SqlExpression<"tsvector">,
    query: string,
    options?: TsRankOptions,
  ): SqlExpression<"number"> {
    const {
      parser = "websearch_to_tsquery",
      config = "simple",
      normalization,
      weights,
    } = options ?? {};

    const params = [];
    let sqlTemplate = `${type}(`;

    if (weights) {
      sqlTemplate += `ARRAY[${weights.map(() => "?").join(", ")}]::float4[], `;
      params.push(...weights);
    }

    if (isStringValue(column)) {
      sqlTemplate += `??, ${parser}(?, ?)`;
      params.push(column, config, query);
    } else {
      sqlTemplate += `${column["_sql"]}, ${parser}(?, ?)`;
      params.push(...column["_params"], config, query);
    }

    if (normalization) {
      sqlTemplate += ", ?";
      params.push(normalization);
    }

    sqlTemplate += ")";

    return { _type: "sql_expression", _return: "number", _sql: sqlTemplate, _params: params };
  }

  /**
   * PGroonga FullText 인덱스 검색 점수
   *
   * @example
   * .select({
   *   score: Puri.score(),
   * })
   */
  static score(): SqlExpression<"number"> {
    return Puri.rawNumber("pgroonga_score(tableoid, ctid)");
  }

  /**
   * PGroonga FullText 인덱스 검색 하이라이팅
   *
   * @example
   * .select({
   *   title: Puri.highlight("posts.title", search),
   * })
   */
  static highlight(column: string, query: string | string[]): SqlExpression<"string">;
  static highlight(columns: string[], query: string | string[]): SqlExpression<"string[]">;

  static highlight(
    columnOrColumns: string | string[],
    query: string | string[],
  ): SqlExpression<"string"> | SqlExpression<"string[]"> {
    const queryArr = Array.isArray(query) ? query : [query];
    const queryClause = `ARRAY[${queryArr.map(() => "?").join(", ")}]`;

    // 단일 컬럼인 경우
    if (isStringValue(columnOrColumns)) {
      return Puri.rawString(`pgroonga_highlight_html(??, ${queryClause})`, [
        columnOrColumns,
        ...queryArr,
      ]);
    }

    // 컬럼 배열인 경우
    return Puri.rawStringArray(
      `pgroonga_highlight_html(ARRAY[${columnOrColumns.map(() => "??").join(", ")}], ${queryClause})`,
      [...columnOrColumns, ...queryArr],
    );
  }

  // SELECT (overwrite)
  select<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect,
  ): Puri<TSchema, TTables, ParseSelectObject<TTables, TSelect>> {
    // 중첩 객체를 flat하게 변환
    const flatSelect = this.flattenSelect(selectObj);

    const selectClauses: (string | Knex.Raw)[] = [];

    for (const [alias, columnOrFunction] of Object.entries(flatSelect)) {
      if (isSqlExpression(columnOrFunction)) {
        // SQL 함수인 경우
        selectClauses.push(
          this.knex.raw(`${columnOrFunction["_sql"]} AS "${alias}"`, columnOrFunction["_params"]),
        );
      } else {
        // 일반 컬럼인 경우
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        const columnPath = columnOrFunction as string;
        if (alias === columnPath) {
          // alias와 컬럼명이 같으면 alias 생략
          selectClauses.push(columnPath);
        } else {
          // alias 지정
          selectClauses.push(`${columnPath} AS ${alias}`);
        }
      }
    }

    this.knexQuery.select(selectClauses);
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this as any;
  }

  /**
   * 중첩 객체를 flat 객체로 변환
   * 예: { parent: { id: "parent.id", name: "parent.name" } }
   *   → { parent__id: "parent.id", parent__name: "parent.name" }
   */
  private *flattenSelectEntries(
    selectObj: SelectObject<TTables>,
    prefix = "",
  ): Generator<[string, SelectValue<TTables>], void> {
    for (const [key, value] of Object.entries(selectObj)) {
      const fullKey = prefix ? `${prefix}__${key}` : key;

      if (isNestedSelectObject(value)) {
        yield* this.flattenSelectEntries(value, fullKey);
      } else {
        yield [fullKey, value];
      }
    }
  }

  private flattenSelect(selectObj: SelectObject<TTables>, prefix = "") {
    return Object.fromEntries(this.flattenSelectEntries(selectObj, prefix));
  }

  // SELECT (select는 overwrite, appendSelect는 append)
  appendSelect<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect,
  ): Puri<TSchema, TTables, TResult & ParseSelectObject<TTables, TSelect>> {
    // 중첩 객체를 flat하게 변환
    const flatSelect = this.flattenSelect(selectObj);

    const selectClauses: (string | Knex.Raw)[] = [];

    for (const [alias, columnOrFunction] of Object.entries(flatSelect)) {
      if (isSqlExpression(columnOrFunction)) {
        selectClauses.push(
          this.knex.raw(`${columnOrFunction["_sql"]} AS ${alias}`, columnOrFunction["_params"]),
        );
      } else {
        // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
        const columnPath = columnOrFunction as string;
        if (alias === columnPath) {
          selectClauses.push(columnPath);
        } else {
          selectClauses.push(this.knex.ref(columnPath).as(alias));
        }
      }
    }

    this.knexQuery.select(selectClauses);
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this as any;
  }

  // SELECT *
  selectAll(): Puri<TSchema, TTables, SelectAllResult<TTables>> {
    this.knexQuery.select("*");
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this as any;
  }

  // DISTINCT
  distinct<TColumns extends AvailableColumns<TTables>>(...columns: TColumns[]): this;
  distinct(...columns: string[]): this {
    this.knexQuery.distinct(...columns);
    return this;
  }

  // CLEAR
  clear(statement: ClearStatements): this {
    this.knexQuery.clear(statement);
    if (statement === "join") {
      this.clearJoinRegistrations();
    }
    return this;
  }

  // knex에 없어서 직접 구현함
  clearJoin(alias: string): this {
    let removed = false;
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    (this.knexQuery as any)["_statements"] = (this.knexQuery as any)["_statements"].filter(
      (s: any) => {
        if ("joinType" in s) {
          const shouldRemove = this.getKnexJoinAlias(s.table) === alias;
          removed ||= shouldRemove;
          return !shouldRemove;
        } else {
          return true;
        }
      },
    );
    if (removed && this.correlationRegistry.get(alias)?.kind === "join") {
      this.correlationRegistry.delete(alias);
    }
    return this;
  }

  // JOIN: 서브쿼리 + Alias
  join<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Puri<TSchema, any, TSubResult> },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${ColumnKeys<TSubResult>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSubResult>, // 서브쿼리의 TResult
    TResult
  >;
  // JOIN: 테이블 + Alias
  join<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSchema[TJoinTable]>, // TTables 확장!
    TResult
  >;
  // JOIN: 테이블명
  join<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    left: AvailableColumns<TTables>,
    right: `${TJoinTable & string}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinTable, TSchema[TJoinTable]>, // 테이블명이 키
    TResult
  >;
  // JOIN: 서브쿼리 + Alias + 콜백
  join<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Puri<TSchema, any, TSubResult> },
    callback: (j: JoinClauseGroup<TTables, Record<TJoinAlias, TSubResult>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSubResult>, TResult>;
  // JOIN: 테이블 + Alias + 콜백
  join<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    callback: (j: JoinClauseGroup<TTables, Record<TJoinAlias, TSchema[TJoinTable]>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSchema[TJoinTable]>, TResult>;
  // JOIN: 테이블명 + 콜백
  join<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    callback: (j: JoinClauseGroup<TTables, Record<TJoinTable, TSchema[TJoinTable]>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinTable, TSchema[TJoinTable]>, TResult>;
  // JOIN 실제 구현
  join(tableNameOrSpec: any, ...args: any[]): any {
    return this["__commonJoin"]("join", tableNameOrSpec, ...args);
  }

  // ENSURE JOIN: 테이블 + Alias
  ensureJoin<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSchema[TJoinTable]>, TResult>;
  // ENSURE JOIN: 테이블명
  ensureJoin<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    left: AvailableColumns<TTables>,
    right: `${TJoinTable & string}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<TSchema, TTables & Record<TJoinTable, TSchema[TJoinTable]>, TResult>;
  ensureJoin(tableNameOrSpec: any, left: string, right: string): any {
    return this["__ensureJoin"]("join", tableNameOrSpec, left, right);
  }

  // LEFT JOIN: 서브쿼리 + Alias
  leftJoin<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Puri<TSchema, any, TSubResult> },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${ColumnKeys<TSubResult>}`,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSubResult & LeftJoinedMarker>, TResult>; // 서브쿼리의 TResult
  // LEFT JOIN: 테이블 + Alias
  // FK nullable 여부에 따라 자동으로 LeftJoinedMarker 결정
  leftJoin<
    TJoinTable extends keyof TSchema,
    TJoinAlias extends string,
    TLeft extends AvailableColumns<TTables>,
  >(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: TLeft,
    right: `${TJoinAlias}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSchema[TJoinTable] & LeftJoinMarkerFor<TTables, TLeft>>,
    TResult
  >;
  // LEFT JOIN: 테이블명
  leftJoin<TJoinTable extends keyof TSchema, TLeft extends AvailableColumns<TTables>>(
    tableName: TJoinTable,
    left: TLeft,
    right: `${TJoinTable & string}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinTable, TSchema[TJoinTable] & LeftJoinMarkerFor<TTables, TLeft>>,
    TResult
  >;
  // LEFT JOIN: 서브쿼리 + Alias + 콜백
  leftJoin<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Puri<TSchema, any, TSubResult> },
    callback: (j: JoinClauseGroup<TTables, Record<TJoinAlias, TSubResult>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSubResult & LeftJoinedMarker>, TResult>;
  // LEFT JOIN: 테이블 + Alias + 콜백
  leftJoin<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    callback: (j: JoinClauseGroup<TTables, Record<TJoinAlias, TSchema[TJoinTable]>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSchema[TJoinTable] & LeftJoinedMarker>, TResult>;
  // LEFT JOIN: 테이블명 + 콜백
  leftJoin<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    callback: (j: JoinClauseGroup<TTables, Record<TJoinTable, TSchema[TJoinTable]>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinTable, TSchema[TJoinTable] & LeftJoinedMarker>, TResult>;
  // LEFT JOIN 실제 구현
  leftJoin(tableNameOrSpec: any, ...args: any[]): any {
    return this["__commonJoin"]("leftJoin", tableNameOrSpec, ...args);
  }

  // ENSURE LEFT JOIN: 테이블 + Alias
  ensureLeftJoin<
    TJoinTable extends keyof TSchema,
    TJoinAlias extends string,
    TLeft extends AvailableColumns<TTables>,
  >(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: TLeft,
    right: `${TJoinAlias}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSchema[TJoinTable] & LeftJoinMarkerFor<TTables, TLeft>>,
    TResult
  >;
  // ENSURE LEFT JOIN: 테이블명
  ensureLeftJoin<TJoinTable extends keyof TSchema, TLeft extends AvailableColumns<TTables>>(
    tableName: TJoinTable,
    left: TLeft,
    right: `${TJoinTable & string}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinTable, TSchema[TJoinTable] & LeftJoinMarkerFor<TTables, TLeft>>,
    TResult
  >;
  ensureLeftJoin(tableNameOrSpec: any, left: string, right: string): any {
    return this["__ensureJoin"]("leftJoin", tableNameOrSpec, left, right);
  }

  __commonJoin(joinType: "join" | "leftJoin", tableNameOrSpec: any, ...args: any[]): this {
    const registration = this.createJoinRegistration(joinType, tableNameOrSpec, args);
    this.assertCorrelationAvailable(registration);

    if (isStringValue(tableNameOrSpec)) {
      // Case 1: join("posts", ...)
      const tableName = tableNameOrSpec;

      if (args.length === 1 && isFunctionValue(args[0])) {
        // join("posts", callback)
        const callback = args[0];
        this.knexQuery[joinType](tableName, (joinClause) => {
          callback(new JoinClauseGroup(joinClause));
        });
      } else {
        // join("posts", left, right)
        const [left, right] = args;
        this.knexQuery[joinType](tableName, left, right);
      }
    } else if (isObjectValue(tableNameOrSpec)) {
      // Case 2: join({ alias: "table" }, ...) or join({ alias: subquery }, ...)
      const entries = Object.entries(tableNameOrSpec);
      if (entries.length !== 1) {
        throw new Error("Table spec must have exactly one entry");
      }
      assert(entries[0]);
      const [[alias, spec]] = entries;

      if (isStringValue(spec)) {
        // 테이블: join({ p: "posts" }, ...)
        if (args.length === 1 && isFunctionValue(args[0])) {
          // Callback
          const callback = args[0];
          this.knexQuery[joinType]({ [alias]: spec }, (joinClause) => {
            callback(new JoinClauseGroup(joinClause));
          });
        } else {
          // Simple
          const [left, right] = args;
          this.knexQuery[joinType]({ [alias]: spec }, left, right);
        }
      } else if (spec instanceof Puri) {
        // 서브쿼리: join({ sq: subquery }, ...)
        if (args.length === 1 && isFunctionValue(args[0])) {
          // Callback
          const callback = args[0];
          this.knexQuery[joinType](spec.rawQuery().as(alias), (joinClause) => {
            callback(new JoinClauseGroup(joinClause));
          });
        } else {
          // Simple
          const [left, right] = args;
          this.knexQuery[joinType](spec.rawQuery().as(alias), left, right);
        }
      } else {
        throw new Error("Invalid table specification");
      }
    } else {
      throw new Error("Invalid arguments");
    }

    this.correlationRegistry.set(registration.alias, registration);
    return this;
  }

  private __ensureJoin(
    joinType: "join" | "leftJoin",
    tableNameOrSpec: string | Record<string, string>,
    left: string,
    right: string,
  ): this {
    const requested = this.createJoinRegistration(joinType, tableNameOrSpec, [left, right]);
    if (!requested.reusable) {
      throw new Error(
        `${joinType === "join" ? "ensureJoin" : "ensureLeftJoin"} only supports physical tables with simple column equality conditions.`,
      );
    }
    const existing = this.correlationRegistry.get(requested.alias);

    if (!existing) {
      return this["__commonJoin"](joinType, tableNameOrSpec, left, right);
    }

    if (this.isSameJoinRegistration(existing, requested)) {
      return this;
    }

    throw this.createJoinConflictError(existing, requested);
  }

  private createJoinRegistration(
    joinType: "join" | "leftJoin",
    tableNameOrSpec: any,
    args: any[],
  ): JoinRegistration {
    let alias: string;
    let table: string | null;

    if (isStringValue(tableNameOrSpec)) {
      alias = tableNameOrSpec;
      table = tableNameOrSpec;
    } else if (isObjectValue(tableNameOrSpec)) {
      const entries = Object.entries(tableNameOrSpec);
      if (entries.length !== 1) {
        throw new Error("Table spec must have exactly one entry");
      }
      assert(entries[0]);
      const [[joinAlias, spec]] = entries;
      alias = joinAlias;
      table = isStringValue(spec) ? spec : null;
    } else {
      throw new Error("Invalid arguments");
    }

    const [left, right] = args;
    const reusable =
      table !== null && args.length === 2 && isStringValue(left) && isStringValue(right);

    return {
      kind: "join",
      alias,
      table,
      joinType,
      left: reusable ? left : null,
      right: reusable ? right : null,
      reusable,
    };
  }

  private assertCorrelationAvailable(requested: JoinRegistration): void {
    const existing = this.correlationRegistry.get(requested.alias);
    if (existing) {
      if (this.isSameJoinRegistration(existing, requested)) {
        throw new Error(
          `Join alias "${requested.alias}" is already registered. Use ensureJoin() or ensureLeftJoin() to reuse an identical join.`,
        );
      }
      throw this.createJoinConflictError(existing, requested);
    }
  }

  private isSameJoinRegistration(
    existing: CorrelationRegistration,
    requested: JoinRegistration,
  ): existing is JoinRegistration {
    return (
      existing.kind === "join" &&
      existing.reusable &&
      requested.reusable &&
      existing.table === requested.table &&
      existing.joinType === requested.joinType &&
      existing.left === requested.left &&
      existing.right === requested.right
    );
  }

  private createJoinConflictError(
    existing: CorrelationRegistration,
    requested: JoinRegistration,
  ): Error {
    return new Error(
      [
        `Join alias "${requested.alias}" is already registered with a different definition.`,
        `Existing: ${this.formatCorrelationRegistration(existing)}`,
        `Requested: ${this.formatCorrelationRegistration(requested)}`,
      ].join("\n"),
    );
  }

  private formatCorrelationRegistration(registration: CorrelationRegistration): string {
    if (registration.kind === "from") {
      return `FROM ${registration.table ?? "subquery"} AS ${registration.alias}`;
    }

    const joinKeyword = registration.joinType === "join" ? "JOIN" : "LEFT JOIN";
    const source = registration.table ?? "opaque source";
    const condition = registration.reusable
      ? ` ON ${registration.left} = ${registration.right}`
      : " with opaque condition";
    return `${joinKeyword} ${source} AS ${registration.alias}${condition}`;
  }

  private clearJoinRegistrations(): void {
    for (const [alias, registration] of this.correlationRegistry) {
      if (registration.kind === "join") {
        this.correlationRegistry.delete(alias);
      }
    }
  }

  private getKnexJoinAlias<Value>(table: Value): string | null {
    if (isStringValue(table)) {
      return table;
    }
    if (isObjectValue(table) && table !== null) {
      if (
        "_single" in table &&
        isObjectValue(table["_single"]) &&
        table["_single"] !== null &&
        "as" in table["_single"] &&
        isStringValue(table["_single"].as)
      ) {
        return table["_single"].as;
      }
      return Object.keys(table)[0] ?? null;
    }
    return null;
  }

  // WHERE: 객체 - 사용: .where({ "u.id": 1, "u.status": "active" })
  where(conditions: WhereCondition<TTables>): this;
  // WHERE: 컬럼 - 사용: .where("u.id", 1), .where("u.id", null)
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  // WHERE: 컬럼 - 사용: .where("u.id", ">", 10), .where("u.id", "!=", null)
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: WhereOperator,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  // WHERE: SQL 표현식 - 사용: .where(puri.raw("CONCAT(u.name, u.email)"), "like", "%test%")
  where<TColumn extends Knex.Raw>(column: TColumn, operator: WhereOperator, value: any): this;
  // WHERE: 컬럼 - 사용: .where("u.id", "like", "%test%")
  where(...args: [columnOrConditions: any, operatorOrValue?: any, value?: any]): this {
    const [columnOrConditions, operatorOrValue, value] = args;
    if (isObjectValue(columnOrConditions)) {
      this.knexQuery.where(columnOrConditions);
    } else if (value === undefined) {
      if (operatorOrValue === null) {
        this.knexQuery.whereNull(columnOrConditions);
        return this;
      }
      this.knexQuery.where(columnOrConditions, operatorOrValue);
    } else if (value !== undefined) {
      if (value === null) {
        if (operatorOrValue === "!=") {
          this.knexQuery.whereNotNull(columnOrConditions);
          return this;
        } else if (operatorOrValue === "=") {
          this.knexQuery.whereNull(columnOrConditions);
          return this;
        }
      }
      this.knexQuery.where(columnOrConditions, operatorOrValue, value);
    } else {
      this.knexQuery.where(columnOrConditions);
    }
    return this;
  }

  // WHERE IN
  whereIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: (ExtractColumnType<TTables, TColumn & string> & Knex.Value)[],
  ): Puri<TSchema, TTables, TResult> {
    // Knex의 비어 있는 IN 배열 처리와 동일하게 항상 거짓인 조건을 생성합니다.
    if (values.length === 0) {
      this.knexQuery.whereRaw("1 = 0");
    } else {
      const placeholders = values.map(() => "?").join(", ");
      this.knexQuery.whereRaw(`?? in (${placeholders})`, [String(column), ...values]);
    }
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this as any;
  }

  // WHERE NOT IN
  whereNotIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: (ExtractColumnType<TTables, TColumn & string> & Knex.Value)[],
  ): Puri<TSchema, TTables, TResult> {
    // Knex의 비어 있는 NOT IN 배열 처리와 동일하게 항상 참인 조건을 생성합니다.
    if (values.length === 0) {
      this.knexQuery.whereRaw("1 = 1");
    } else {
      const placeholders = values.map(() => "?").join(", ");
      this.knexQuery.whereRaw(`?? not in (${placeholders})`, [String(column), ...values]);
    }
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this as any;
  }

  // WHERE JSONB SUPERSET (@>)
  whereJsonSupersetOf<TColumn extends JsonColumns<TTables>>(
    column: TColumn,
    value: JsonSupersetValue<ExtractColumnType<TTables, TColumn>>,
  ): this {
    this.knexQuery.whereJsonSupersetOf(column, serializeJsonSupersetValue(value));
    return this;
  }

  // WHERE MATCH
  whereMatch<TColumn extends FulltextColumns<TTables>>(column: TColumn, value: string): this {
    this.knexQuery.whereRaw(`MATCH (${String(column)}) AGAINST (?)`, [value]);
    return this;
  }

  /**
   * PGroonga FullText 인덱스 검색
   * - 사용할 PGroonga 인덱스와 동일한 컬럼 구성으로 검색해야 인덱스가 사용됩니다.
   *
   * 단일 컬럼 검색:
   * ```sql
   * WHERE name &@~ 'search'
   * ```
   *
   * 복합 컬럼 검색:
   * ```sql
   * WHERE ARRAY[name::text, description::text] &@~ 'search'
   * ```
   */
  whereSearch<TColumn extends AvailableColumns<TTables>>(
    column: TColumn | TColumn[],
    value: string,
    options?: {
      weights?: number[]; // 정수 배열
    },
  ): this {
    const { weights } = options ?? {};
    const columnExpr = Array.isArray(column)
      ? `ARRAY[${column.map((c) => `${c}::text`).join(",")}]`
      : column;
    const pgroongaCondition = `pgroonga_condition(?${weights?.length ? `, weights => ARRAY[${weights.join(",")}]` : ""})`;

    this.knexQuery.whereRaw(`${columnExpr} &@~ ${pgroongaCondition}`, [value]);

    return this;
  }

  // WHERE FULLTEXT
  whereTsSearch<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: TsQueryOptions | TsQueryConfig,
  ): this {
    const opts =
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      isStringValue(options) ? ({ config: options } as TsQueryOptions) : (options ?? {});

    const parser = opts.parser ?? "websearch_to_tsquery";
    const config = opts.config ?? "simple";
    const columnExpr =
      isSqlExpression(column) && column["_type"] === "sql_expression"
        ? column["_sql"]
        : String(column);

    this.knexQuery.whereRaw(`${columnExpr} @@ ${parser}(?, ?)`, [config, value]);
    return this;
  }

  whereFuzzy<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: {
      operator?: FuzzyOperator;
    },
  ): this {
    const operator = parseFuzzyOperator(options?.operator);

    if (operator === "%") {
      if (isSqlExpression(column)) {
        this.knexQuery.whereRaw(`${column["_sql"]} ${operator} ?`, [...column["_params"], value]);
      } else {
        this.knexQuery.whereRaw(`?? ${operator} ?`, [column, value]);
      }
      return this;
    }

    if (isSqlExpression(column)) {
      this.knexQuery.whereRaw(`? ${operator} ${column["_sql"]}`, [value, ...column["_params"]]);
    } else {
      this.knexQuery.whereRaw(`? ${operator} ??`, [value, column]);
    }
    return this;
  }

  // WHERE RAW
  whereRaw(sql: string, bindings?: readonly Knex.RawBinding[]): this {
    this.knexQuery.whereRaw(sql, bindings);
    return this;
  }

  // WHERE 괄호 그룹핑
  whereGroup(callback: (g: WhereGroup<TTables>) => void): this {
    this.knexQuery.where((builder) => {
      const group = new WhereGroup<TTables>(builder);
      callback(group);
    });
    return this;
  }
  orWhereGroup(callback: (g: WhereGroup<TTables>) => void): this {
    this.knexQuery.orWhere((builder) => {
      const group = new WhereGroup<TTables>(builder);
      callback(group);
    });
    return this;
  }

  // ORDER BY (SqlExpression으로도 할 수 있어야 함)
  orderBy<TColumn extends ResultAvailableColumns<TTables, TResult>>(
    column: TColumn | PuriOrderByExpression,
    direction?: PuriOrderByDirection,
    nulls?: PuriOrderByNulls,
  ): this;
  orderBy<TColumn extends ResultAvailableColumns<TTables, TResult>>(
    columns: readonly PuriOrderByEntry<TColumn>[],
  ): this;
  orderBy(
    columnOrColumns: string | PuriOrderByExpression | readonly PuriOrderByRuntimeEntry[],
    direction: PuriOrderByDirection = "asc",
    nulls?: PuriOrderByNulls,
  ): this {
    if (isOrderByEntries(columnOrColumns)) {
      for (const entry of columnOrColumns) {
        if (isStringValue(entry) || isSqlExpression(entry)) {
          this.applyOrderBy(entry);
        } else {
          this.applyOrderBy(entry.column, entry.order, entry.nulls);
        }
      }
      return this;
    }

    this.applyOrderBy(columnOrColumns, direction, nulls);
    return this;
  }

  private applyOrderBy(
    column: string | PuriOrderByExpression,
    direction?: PuriOrderByDirection,
    nulls?: PuriOrderByNulls,
  ): void {
    const normalizedDirection = normalizeOrderByDirection(direction);
    const normalizedNulls = normalizeOrderByNulls(nulls);

    if (isSqlExpression(column)) {
      this.knexQuery.orderByRaw(
        `${column["_sql"]} ${normalizedDirection}${formatNullsSuffix(normalizedNulls)}`,
        column["_params"],
      );
    } else {
      this.knexQuery.orderBy(column, normalizedDirection, normalizedNulls);
    }
  }

  forUpdate(): this {
    this.knexQuery.forUpdate();
    return this;
  }

  forShare(): this {
    this.knexQuery.forShare();
    return this;
  }

  /**
   * 벡터 유사도 검색 설정
   *
   * - SELECT에 similarity 컬럼 추가
   * - WHERE col IS NOT NULL 추가
   * - threshold가 있으면 WHERE 조건 추가
   * - 기존 ORDER BY를 clear하고 원시 연산자로 정렬 (HNSW 인덱스 최적화)
   *
   * @param column 벡터 컬럼 경로
   * @param embedding 쿼리 임베딩 벡터
   * @param options method, threshold, as 등 옵션
   *
   * @example
   * ```typescript
   * // cosine similarity (기본값)
   * qb.vectorSimilarity("columnName", queryVector, {
   *   method: "cosine",
   *   threshold: 0.5
   * });
   *
   * // L2 distance
   * qb.vectorSimilarity("columnName", queryVector, {
   *   method: "l2",
   *   threshold: 1.5  // 거리가 1.5 이하인 결과만
   * });
   *
   * // Inner product
   * qb.vectorSimilarity("columnName", queryVector, {
   *   method: "inner_product",
   *   threshold: 0.7
   * });
   * ```
   */
  vectorSimilarity(
    column: VectorColumns<TTables>,
    embedding: number[],
    options: {
      method?: "cosine" | "l2" | "inner_product";
      threshold?: number;
      distinctOn?: AvailableColumns<TTables>;
    } = {},
  ): Puri<TSchema, TTables, TResult & { similarity: number }> {
    const { method = "cosine", threshold, distinctOn } = options;

    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      embedding.some((v) => !Number.isFinite(v))
    ) {
      throw new Error("Invalid embedding vector: expected a non-empty array of finite numbers");
    }

    const vectorLiteral = JSON.stringify(embedding.map((v) => Number(v)));
    const operator = { cosine: "<=>", l2: "<->", inner_product: "<#>" }[method];

    // method별 연산자 및 similarity 계산식
    // - cosine: <=> (cosine distance, 0~2), similarity = 1 - distance
    // - l2: <-> (euclidean distance), similarity = distance (낮을수록 유사)
    // - inner_product: <#> (negative inner product), similarity = -distance (높을수록 유사)
    const similarityExpr =
      method === "cosine"
        ? this.knex.raw(`1 - (?? ${operator} ?::vector) as similarity`, [column, vectorLiteral])
        : method === "l2"
          ? this.knex.raw(`?? ${operator} ?::vector as similarity`, [column, vectorLiteral])
          : this.knex.raw(`-(?? ${operator} ?::vector) as similarity`, [column, vectorLiteral]);

    // WHERE NOT NULL
    this.knexQuery.whereNotNull(column);

    // 기존 ORDER BY clear
    this.knexQuery.clear("order");
    if (distinctOn) {
      // DISTINCT ON은 SELECT 절의 맨 앞에 와야 하므로, 기존 select(subset 필드들)를 보존 후 clear하고 다시 추가
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      const existingSubsetCols = (this.knexQuery as any)["_statements"]
        .filter((s: any) => s.grouping === "columns")
        .flatMap((s: any) => s.value);
      this.knexQuery.clear("select");
      this.knexQuery.select(this.knex.raw(`DISTINCT ON (??) ??`, [distinctOn, distinctOn]));
      existingSubsetCols.map((col: any) => this.knexQuery.select(col));
      this.knexQuery.select(similarityExpr);
      this.knexQuery.orderByRaw(`??, ?? ${operator} ?::vector`, [
        distinctOn,
        column,
        vectorLiteral,
      ]);

      this.knexQuery = this.knex
        .from(this.knexQuery.as("distinct_vectors"))
        .select("*")
        .orderBy("similarity", "desc");
    } else {
      this.knexQuery.select(similarityExpr);
      this.knexQuery.orderByRaw(`?? ${operator} ?::vector`, [column, vectorLiteral]);
    }

    // threshold
    if (isNumberValue(threshold)) {
      if (!Number.isFinite(threshold)) {
        throw new Error(`Invalid vectorSimilarity threshold: ${threshold}`);
      }

      if (distinctOn) {
        const thresholdOp = method === "l2" ? "<=" : ">=";
        this.knexQuery.where("similarity", thresholdOp, threshold);
      } else {
        const thresholdValue =
          method === "cosine" ? 1 - threshold : method === "inner_product" ? -threshold : threshold;
        this.knexQuery.whereRaw(`?? ${operator} ?::vector <= ?`, [
          column,
          vectorLiteral,
          thresholdValue,
        ]);
      }
    }

    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this as any;
  }

  // 기본 쿼리 메서드들
  limit(count: number): this {
    if (count < 0) {
      throw new Error("Invalid limit: must be >= 0");
    }
    this.knexQuery.limit(count);
    return this;
  }

  offset(count: number): this {
    if (count < 0) {
      throw new Error("Invalid offset: must be >= 0");
    }
    this.knexQuery.offset(count);
    return this;
  }

  // GROUP BY
  groupBy<TColumns extends ResultAvailableColumns<TTables, TResult>>(...columns: TColumns[]): this;
  groupBy(...columns: string[]): this {
    this.knexQuery.groupBy(...columns);
    return this;
  }

  // HAVING
  having(condition: string): this;
  having<TColumn extends ResultAvailableColumns<TTables, TResult>>(
    column: TColumn,
    operator: ComparisonOperator,
    value: any,
  ): this;
  // HAVING 구현
  having(...conditions: any[]): this {
    if (conditions.length === 1) {
      // having("COUNT(*) > 10")
      this.knexQuery.having(this.knex.raw(conditions[0]));
    } else if (conditions.length === 3) {
      // having("count", ">", 10)
      this.knexQuery.having(
        this.knex.raw(conditions[0]),
        conditions[1],
        this.knex.raw(conditions[2]),
      );
    } else {
      throw new Error("Invalid having arguments");
    }
    return this;
  }

  // 실행 메서드들 - thenable 구현
  then<TResult1 = Expand<TResult>[], TResult2 = never>(
    onfulfilled?: ((value: Expand<TResult>[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    Naite.t("puri:executed-query", this.toQuery());
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this.knexQuery.then(onfulfilled as any, onrejected);
  }
  catch<TResult2 = never>(
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult | TResult2> {
    return this.knexQuery.catch(onrejected);
  }
  finally(onfinally?: (() => void) | null): Promise<TResult> {
    return this.knexQuery.finally(onfinally);
  }

  // 하나만 쿼리
  first(): ResolvedPuri<Expand<TResult>, never> {
    this.knexQuery.first();
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }

  // 쿼리한 레코드에서 특정 컬럼만 추출한 배열 리턴
  pluck<TColumn extends keyof TResult | ResultAvailableColumns<TTables, TResult>>(
    column: TColumn,
  ): ResolvedPuri<
    TColumn extends keyof TResult
      ? TResult[TColumn][]
      : ExtractColumnType<TTables, TColumn & string>[],
    never
  > {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    this.knexQuery.pluck(column as string);
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }

  // INSERT : 단일 객체
  insert(
    data: InsertData<SingleTableValue<TTables>>,
  ): ResolvedPuri<InsertResult, SingleTableValue<TTables>>;
  // INSERT: 배열
  insert(
    data: InsertData<SingleTableValue<TTables>>[],
  ): ResolvedPuri<InsertResult, SingleTableValue<TTables>>;
  // INSERT 실제 구현
  insert(
    rawData: InsertData<SingleTableValue<TTables>> | InsertData<SingleTableValue<TTables>>[],
  ): ResolvedPuri<InsertResult, SingleTableValue<TTables>> {
    // JSON 컬럼 stringify 로직을 메서드로 분리하여 중복 제거
    const refinedData = this.refineJsonColumns(rawData);
    this.knexQuery.insert(refinedData);
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }

  // UPDATE
  update(rawData: WhereCondition<TTables>): ResolvedPuri<number, SingleTableValue<TTables>> {
    // JSON 컬럼 stringify 로직을 메서드로 분리하여 중복 제거
    const refinedData = this.refineJsonColumns(rawData);
    this.knexQuery.update(refinedData);
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }

  /**
   * JSON 컬럼에 대해 stringify 처리를 수행하는 내부 메서드입니다.
   * object 또는 object 배열을 받고, JSON 컬럼이 있으면 직렬화하여 반환합니다.
   * 직접 값을 변경하므로 side effect가 있습니다.
   */
  private refineJsonColumns<Row extends object>(data: Row | Row[]): typeof data {
    // tableSpec이나 jsonColumns 없는 경우 바로 반환
    if (!this.tableSpec || !this.tableSpec.jsonColumns.length) {
      return data;
    }

    // 등록된 TableSpec을 통해 JSON컬럼 목록을 가져와 JSON.stringify 처리
    const jsonColumns = this.tableSpec.jsonColumns;
    if (Array.isArray(data)) {
      for (const item of data) {
        for (const column of jsonColumns) {
          const value = Object.entries(item).find(([key]) => key === column)?.[1];
          if (value !== undefined && value !== null) {
            Object.assign(item, {
              [column]: serializeJsonColumnValue(this.tableSpec, column, value),
            });
          }
        }
      }
    } else {
      for (const column of jsonColumns) {
        const value = Object.entries(data).find(([key]) => key === column)?.[1];
        if (value !== undefined && value !== null) {
          Object.assign(data, {
            [column]: serializeJsonColumnValue(this.tableSpec, column, value),
          });
        }
      }
    }
    return data;
  }

  // Increment
  increment<TColumn extends NumericColumns<TTables>>(
    column: TColumn,
    value: number,
  ): ResolvedPuri<number, SingleTableValue<TTables>> {
    if (value <= 0) {
      throw new Error("Increment value must be greater than 0");
    }
    this.knexQuery.increment(column, value);
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }
  // Decrement
  decrement<TColumn extends NumericColumns<TTables>>(
    column: TColumn,
    value: number,
  ): ResolvedPuri<number, SingleTableValue<TTables>> {
    if (value <= 0) {
      throw new Error("Decrement value must be greater than 0");
    }
    this.knexQuery.decrement(column, value);
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }

  // DELETE
  delete(): ResolvedPuri<number, SingleTableValue<TTables>> {
    this.knexQuery.delete();
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }

  // 확인 쿼리 리턴
  toQuery(): string {
    return this.knexQuery.toQuery();
  }

  // 쿼리 디버깅 로그 출력
  debug(): this {
    console.log(`${chalk.cyan("[Puri Debug]")} ${chalk.yellow(this.toQuery())}`);
    return this;
  }

  clone(): Puri<TSchema, TTables, TResult> {
    // 'dual'은 더미 테이블이며, 바로 아래 줄에서 knexQuery가 덮어씌워집니다.
    const newPuri = new Puri<TSchema, TTables, TResult>(this.knex, "dual");
    newPuri.knexQuery = this.knexQuery.clone();
    newPuri.tableSpec = this.tableSpec;
    newPuri.correlationRegistry = new Map(this.correlationRegistry);
    return newPuri;
  }

  formatSQL(unformatted: string): string {
    // SQL 예약어 목록
    const keywords = [
      "SELECT",
      "FROM",
      "WHERE",
      "INSERT",
      "INTO",
      "VALUES",
      "UPDATE",
      "DELETE",
      "CREATE",
      "TABLE",
      "ALTER",
      "DROP",
      "JOIN",
      "ON",
      "INNER",
      "LEFT",
      "RIGHT",
      "FULL",
      "OUTER",
      "GROUP",
      "BY",
      "ORDER",
      "HAVING",
      "DISTINCT",
      "LIMIT",
      "OFFSET",
      "AS",
      "AND",
      "OR",
      "NOT",
      "IN",
      "LIKE",
      "IS",
      "NULL",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
      "UNION",
      "ALL",
      "EXISTS",
      "BETWEEN",
    ];

    let formatted = unformatted;

    // 예약어를 대문자로 변환
    keywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      formatted = formatted.replace(regex, keyword.toUpperCase());
    });

    // 주요 절 앞에 줄바꿈 추가
    const majorClauses = [
      "SELECT",
      "FROM",
      "WHERE",
      "GROUP BY",
      "ORDER BY",
      "HAVING",
      "LIMIT",
      "UNION",
    ];
    majorClauses.forEach((clause) => {
      const regex = new RegExp(`\\s+(${clause})\\s+`, "gi");
      formatted = formatted.replace(regex, `\n${clause.toUpperCase()} `);
    });

    // JOIN 절 처리
    formatted = formatted.replace(/\s+((?:INNER|LEFT|RIGHT|FULL OUTER)\s+)?JOIN\s+/gi, "\n$1JOIN ");

    // AND, OR 조건 처리
    formatted = formatted.replace(/\s+(AND|OR)\s+/gi, "\n  $1 ");

    // 괄호 처리 및 들여쓰기
    const lines = formatted.split("\n");
    const indentedLines = [];
    let indentLevel = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // 닫는 괄호가 있으면 들여쓰기 레벨 감소
      const closingParens = (trimmedLine.match(/\)/g) || []).length;
      const openingParens = (trimmedLine.match(/\(/g) || []).length;

      if (closingParens > 0 && openingParens === 0) {
        indentLevel = Math.max(0, indentLevel - closingParens);
      }

      // 현재 들여쓰기 적용
      const indent = "  ".repeat(indentLevel);
      indentedLines.push(indent + trimmedLine);

      // 여는 괄호가 있으면 들여쓰기 레벨 증가
      if (openingParens > closingParens) {
        indentLevel += openingParens - closingParens;
      }
    }

    return indentedLines.join("\n").trim();
  }

  raw(sql: string): Knex.Raw {
    return this.knex.raw(sql);
  }

  // Knex 쿼리 빌더 직접 접근
  rawQuery(): Knex.QueryBuilder {
    return this.knexQuery;
  }
}

export class WhereGroup<TTables extends object> {
  constructor(private builder: Knex.QueryBuilder) {}

  // where 메서드들
  where(conditions: WhereCondition<TTables>): this;
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: WhereOperator,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  where(...args: any[]): WhereGroup<TTables> {
    this.builder.where(args[0], ...args.slice(1));
    return this;
  }

  // whereIn / whereNotIn 메서드들
  whereIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: (ExtractColumnType<TTables, TColumn & string> & Knex.Value)[],
  ): this;
  whereIn(...args: any[]): WhereGroup<TTables> {
    this.builder.whereIn(args[0], args[1]);
    return this;
  }

  whereNotIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: (ExtractColumnType<TTables, TColumn & string> & Knex.Value)[],
  ): this;
  whereNotIn(...args: any[]): WhereGroup<TTables> {
    this.builder.whereNotIn(args[0], args[1]);
    return this;
  }

  // orWhere 메서드들
  orWhere(conditions: WhereCondition<TTables>): this;
  orWhere<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  orWhere<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: WhereOperator,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  orWhere(...args: any[]): WhereGroup<TTables> {
    this.builder.orWhere(args[0], ...args.slice(1));
    return this;
  }

  // orWhereIn / orWhereNotIn 메서드들
  orWhereIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: (ExtractColumnType<TTables, TColumn & string> & Knex.Value)[],
  ): this;
  orWhereIn(...args: any[]): WhereGroup<TTables> {
    this.builder.orWhereIn(args[0], args[1]);
    return this;
  }

  orWhereNotIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: (ExtractColumnType<TTables, TColumn & string> & Knex.Value)[],
  ): this;
  orWhereNotIn(...args: any[]): WhereGroup<TTables> {
    this.builder.orWhereNotIn(args[0], args[1]);
    return this;
  }

  // WHERE JSONB SUPERSET (@>)
  whereJsonSupersetOf<TColumn extends JsonColumns<TTables>>(
    column: TColumn,
    value: JsonSupersetValue<ExtractColumnType<TTables, TColumn>>,
  ): this {
    this.builder.whereJsonSupersetOf(column, serializeJsonSupersetValue(value));
    return this;
  }

  orWhereJsonSupersetOf<TColumn extends JsonColumns<TTables>>(
    column: TColumn,
    value: JsonSupersetValue<ExtractColumnType<TTables, TColumn>>,
  ): this {
    this.builder.orWhereJsonSupersetOf(column, serializeJsonSupersetValue(value));
    return this;
  }

  // WHERE MATCH
  whereMatch<TColumn extends FulltextColumns<TTables>>(column: TColumn, value: string): this;
  whereMatch(...args: any[]): this {
    this.builder.whereRaw(`MATCH (${String(args[0])}) AGAINST (?)`, [args[1]]);
    return this;
  }

  orWhereMatch<TColumn extends FulltextColumns<TTables>>(column: TColumn, value: string): this;
  orWhereMatch(...args: any[]): this {
    this.builder.orWhereRaw(`MATCH (${String(args[0])}) AGAINST (?)`, [args[1]]);
    return this;
  }

  // WHERE SEARCH
  whereSearch<TColumn extends AvailableColumns<TTables>>(
    column: TColumn | TColumn[],
    value: string,
    options?: {
      weights?: number[]; // 정수 배열
    },
  ): this;
  whereSearch(...args: any[]): this {
    const { weights } = args[2] ?? {};
    const columnExpr = Array.isArray(args[0])
      ? `ARRAY[${args[0].map((c) => `${c}::text`).join(",")}]`
      : args[0];
    const pgroongaCondition = `pgroonga_condition(?${weights?.length ? `, weights => ARRAY[${weights.join(",")}]` : ""})`;
    this.builder.whereRaw(`${columnExpr} &@~ ${pgroongaCondition}`, [args[1]]);

    return this;
  }

  orWhereSearch<TColumn extends AvailableColumns<TTables>>(
    column: TColumn | TColumn[],
    value: string,
    options?: {
      weights?: number[]; // 정수 배열
    },
  ): this;
  orWhereSearch(...args: any[]): this {
    const { weights } = args[2] ?? {};
    const columnExpr = Array.isArray(args[0])
      ? `ARRAY[${args[0].map((c) => `${c}::text`).join(",")}]`
      : args[0];
    const pgroongaCondition = `pgroonga_condition(?${weights?.length ? `, weights => ARRAY[${weights.join(",")}]` : ""})`;
    this.builder.orWhereRaw(`${columnExpr} &@~ ${pgroongaCondition}`, [args[1]]);

    return this;
  }

  // WHERE FULLTEXT
  whereTsSearch<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: TsQueryOptions | TsQueryConfig,
  ): this;
  whereTsSearch(...args: any[]): this {
    const opts =
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      isStringValue(args[2]) ? ({ config: args[2] } as TsQueryOptions) : (args[2] ?? {});

    const parser = opts.parser ?? "websearch_to_tsquery";
    const config = opts.config ?? "simple";
    const columnExpr = isSqlExpression(args[0]) ? args[0]["_sql"] : String(args[0]);

    this.builder.whereRaw(`${columnExpr} @@ ${parser}(?, ?)`, [config, args[1]]);
    return this;
  }

  orWhereTsSearch<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: TsQueryOptions | TsQueryConfig,
  ): this;
  orWhereTsSearch(...args: any[]): this {
    const opts =
      // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
      isStringValue(args[2]) ? ({ config: args[2] } as TsQueryOptions) : (args[2] ?? {});

    const parser = opts.parser ?? "websearch_to_tsquery";
    const config = opts.config ?? "simple";
    const columnExpr = isSqlExpression(args[0]) ? args[0]["_sql"] : String(args[0]);

    this.builder.orWhereRaw(`${columnExpr} @@ ${parser}(?, ?)`, [config, args[1]]);
    return this;
  }

  whereFuzzy<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: {
      operator?: FuzzyOperator;
    },
  ): this;
  whereFuzzy(...args: any[]): this {
    const operator = parseFuzzyOperator(args[2]?.operator);

    if (operator === "%") {
      if (isSqlExpression(args[0])) {
        this.builder.whereRaw(`${args[0]["_sql"]} ${operator} ?`, [...args[0]["_params"], args[1]]);
      } else {
        this.builder.whereRaw(`?? ${operator} ?`, [args[0], args[1]]);
      }
      return this;
    }

    if (isSqlExpression(args[0])) {
      this.builder.whereRaw(`? ${operator} ${args[0]["_sql"]}`, [args[1], ...args[0]["_params"]]);
    } else {
      this.builder.whereRaw(`? ${operator} ??`, [args[1], args[0]]);
    }
    return this;
  }

  orWhereFuzzy<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: {
      operator?: FuzzyOperator;
    },
  ): this;
  orWhereFuzzy(...args: any[]): this {
    const operator = parseFuzzyOperator(args[2]?.operator);

    if (operator === "%") {
      if (isSqlExpression(args[0])) {
        this.builder.orWhereRaw(`${args[0]["_sql"]} ${operator} ?`, [
          ...args[0]["_params"],
          args[1],
        ]);
      } else {
        this.builder.orWhereRaw(`?? ${operator} ?`, [args[0], args[1]]);
      }
      return this;
    }

    if (isSqlExpression(args[0])) {
      this.builder.orWhereRaw(`? ${operator} ${args[0]["_sql"]}`, [args[1], ...args[0]["_params"]]);
    } else {
      this.builder.orWhereRaw(`? ${operator} ??`, [args[1], args[0]]);
    }
    return this;
  }

  // 중첩 그룹
  whereGroup(callback: (g: WhereGroup<TTables>) => void): this;
  whereGroup(callback: (g: WhereGroup<TTables>) => void): WhereGroup<TTables> {
    this.builder.where((subBuilder) => {
      const subGroup = new WhereGroup<TTables>(subBuilder);
      callback(subGroup);
    });
    return this;
  }
  orWhereGroup(callback: (g: WhereGroup<TTables>) => void): this;
  orWhereGroup(callback: (g: WhereGroup<TTables>) => void): WhereGroup<TTables> {
    this.builder.orWhere((subBuilder) => {
      const subGroup = new WhereGroup<TTables>(subBuilder);
      callback(subGroup);
    });
    return this;
  }
}

// JOIN 절 그룹에는 Left와 Right에 대한 순서가 필요하지 않으므로, 모든 경우의 수를 계산해야함.
export class JoinClauseGroup<TLeft extends object, TRight extends object> {
  constructor(private callback: Knex.JoinClause) {}

  // ON(AND): 컬럼 = 컬럼
  on(left: AvailableColumns<TLeft>, right: AvailableColumns<TRight>): this;
  on(left: AvailableColumns<TRight>, right: AvailableColumns<TLeft>): this;
  // ON(AND): 컬럼 = 값
  on(
    left: AvailableColumns<TLeft>,
    right: ExtractColumnType<TLeft, AvailableColumns<TLeft> & string>,
  ): this;
  on(
    left: AvailableColumns<TRight>,
    right: ExtractColumnType<TRight, AvailableColumns<TRight> & string>,
  ): this;
  // ON(AND): 컬럼 (연산자) 컬럼
  on(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: AvailableColumns<TRight>,
  ): this;
  on(
    left: AvailableColumns<TRight>,
    operator: ComparisonOperator,
    right: AvailableColumns<TLeft>,
  ): this;
  // ON(AND): 컬럼 (연산자) 값
  on(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: ExtractColumnType<TLeft, AvailableColumns<TLeft> & string>,
  ): this;
  on(
    left: AvailableColumns<TRight>,
    operator: ComparisonOperator,
    right: ExtractColumnType<TRight, AvailableColumns<TRight> & string>,
  ): this;
  // ON(AND): 콜백
  on(callback: (nested: JoinClauseGroup<TLeft, TRight>) => void): this;
  on(callback: (nested: JoinClauseGroup<TRight, TLeft>) => void): this;
  // ON(AND) 구현
  on(...args: any[]): this {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    this.callback.on(...(args as [string, string]));
    return this;
  }

  // ON(OR): 컬럼 = 컬럼
  orOn(left: AvailableColumns<TLeft>, right: AvailableColumns<TRight>): this;
  orOn(left: AvailableColumns<TRight>, right: AvailableColumns<TLeft>): this;
  // ON(OR): 컬럼 = 값
  orOn(
    left: AvailableColumns<TLeft>,
    right: ExtractColumnType<TLeft, AvailableColumns<TLeft> & string>,
  ): this;
  orOn(
    left: AvailableColumns<TRight>,
    right: ExtractColumnType<TRight, AvailableColumns<TRight> & string>,
  ): this;
  // ON(OR): 컬럼 (연산자) 컬럼
  orOn(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: AvailableColumns<TRight>,
  ): this;
  orOn(
    left: AvailableColumns<TRight>,
    operator: ComparisonOperator,
    right: AvailableColumns<TLeft>,
  ): this;
  // ON(OR): 컬럼 (연산자) 값
  orOn(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: ExtractColumnType<TLeft, AvailableColumns<TLeft> & string>,
  ): this;
  orOn(
    left: AvailableColumns<TRight>,
    operator: ComparisonOperator,
    right: ExtractColumnType<TRight, AvailableColumns<TRight> & string>,
  ): this;
  // ON(OR): 콜백
  orOn(callback: (nested: JoinClauseGroup<TLeft, TRight>) => void): this;
  orOn(callback: (nested: JoinClauseGroup<TRight, TLeft>) => void): this;
  // ON(OR) 구현
  orOn(...args: any[]): this {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    this.callback.orOn(...(args as [string, string]));
    return this;
  }

  // ON VAL(AND): 컬럼 = 값 (값을 컬럼 참조가 아닌 파라미터로 바인딩)
  onVal(column: AvailableColumns<TLeft>, value: any): this;
  onVal(column: AvailableColumns<TRight>, value: any): this;
  onVal(column: AvailableColumns<TLeft>, operator: ComparisonOperator, value: any): this;
  onVal(column: AvailableColumns<TRight>, operator: ComparisonOperator, value: any): this;
  onVal(...args: any[]): this {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    (this.callback as any).onVal(...args);
    return this;
  }

  // AND ON VAL: onVal의 명시적 alias (Knex 호환)
  andOnVal(column: AvailableColumns<TLeft>, value: any): this;
  andOnVal(column: AvailableColumns<TRight>, value: any): this;
  andOnVal(column: AvailableColumns<TLeft>, operator: ComparisonOperator, value: any): this;
  andOnVal(column: AvailableColumns<TRight>, operator: ComparisonOperator, value: any): this;
  andOnVal(...args: any[]): this {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    (this.callback as any).andOnVal(...args);
    return this;
  }

  // OR ON VAL: OR 조건으로 값 바인딩
  orOnVal(column: AvailableColumns<TLeft>, value: any): this;
  orOnVal(column: AvailableColumns<TRight>, value: any): this;
  orOnVal(column: AvailableColumns<TLeft>, operator: ComparisonOperator, value: any): this;
  orOnVal(column: AvailableColumns<TRight>, operator: ComparisonOperator, value: any): this;
  orOnVal(...args: any[]): this {
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    (this.callback as any).orOnVal(...args);
    return this;
  }
}

/*
  TResolved: 쿼리 실행 후 반환될 결과 타입
  TReturning: RETURNING 절에 사용될 타입
*/
export class ResolvedPuri<TResolved, TReturning> implements Promise<TResolved> {
  constructor(
    public knexQuery: Knex.QueryBuilder,
    private knex: Knex,
    private tableSpec: TableSpec | null = null,
  ) {}

  [Symbol.toStringTag]: string = "Promise";

  toQuery(): string {
    return this.knexQuery.toQuery();
  }

  debug(): this {
    console.log(`${chalk.cyan("[Puri Debug]")} ${chalk.yellow(this.toQuery())}`);
    return this;
  }

  then<TResult1 = TResolved, TResult2 = never>(
    onfulfilled?: ((value: TResolved) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    Naite.t("puri:executed-query", this.toQuery());
    // SAFETY: 쿼리 빌더의 제네릭 계약과 선행 검증이 이 타입을 보장합니다.
    return this.knexQuery.then(onfulfilled as any, onrejected);
  }

  catch<TResult2 = never>(
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResolved | TResult2> {
    return this.knexQuery.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<TResolved> {
    return this.knexQuery.finally(onfinally);
  }

  // ON CONFLICT - 컬럼 기반
  onConflict<TTables extends Record<string, TReturning>>(
    columns: string | string[],
    action?: OnConflictAction<TTables>,
  ): this {
    const target = Array.isArray(columns) ? columns : [columns];

    if (!action || action === "nothing") {
      // DO NOTHING
      this.knexQuery.onConflict(target).ignore();
    } else {
      // DO UPDATE
      const { update } = action;

      // action.update 배열 형태 : ["name", "email"]
      if (Array.isArray(update)) {
        this.knexQuery.onConflict(target).merge(update);
      } else {
        // action.update 객체 형태: { name: "John", count: raw(...) }
        const mergeObj = {};

        for (const [key, value] of Object.entries(update)) {
          const mergedValue = isSqlExpression(value)
            ? this.knex.raw(value["_sql"])
            : serializeJsonColumnValue(this.tableSpec, key, value);
          Object.assign(mergeObj, { [key]: mergedValue });
        }

        this.knexQuery.onConflict(target).merge(mergeObj);
      }
    }

    return this;
  }

  // RETURNING: "*" - 전체 컬럼
  returning(column: "*"): ResolvedPuri<TReturning[], never>;
  // RETURNING: 단일 컬럼
  returning<TColumn extends ColumnKeys<TReturning>>(
    column: TColumn,
  ): ResolvedPuri<Pick<TReturning, TColumn>[], never>;
  // RETURNING: 복수 컬럼 (배열)
  returning<TColumn extends ColumnKeys<TReturning>>(
    columns: TColumn[],
  ): ResolvedPuri<Pick<TReturning, TColumn>[], never>;
  // RETURNING 구현
  returning(columnOrColumns: string | string[]): ResolvedPuri<any[], never> {
    this.knexQuery.returning(columnOrColumns);
    return new ResolvedPuri(this.knexQuery, this.knex, this.tableSpec);
  }
}
