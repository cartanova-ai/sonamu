/** biome-ignore-all lint/suspicious/noThenProperty: Puri는 thenable 인터페이스를 구현하고 있습니다. */
/** biome-ignore-all lint/suspicious/noExplicitAny: Puri는 다양한 타입을 사용하고 있습니다. */

import assert from "assert";
import chalk from "chalk";
import inflection from "inflection";
import type { Knex } from "knex";
import { Naite } from "../naite/naite";
import type {
  AvailableColumns,
  ColumnKeys,
  ComparisonOperator,
  Expand,
  ExtractColumnType,
  FulltextColumns,
  InsertData,
  InsertResult,
  LeftJoinedMarker,
  LeftJoinMarkerFor,
  NumericColumns,
  OnConflictAction,
  ParseSelectObject,
  ResultAvailableColumns,
  SelectAllResult,
  SelectObject,
  SingleTableValue,
  SqlExpression,
  TsHighlightOptions,
  TsQueryConfig,
  TsQueryOptions,
  TsRankOptions,
  VectorColumns,
  WhereCondition,
  WhereOperator,
} from "./puri.types";
import type { ClearStatements } from "./puri-subset.types";

export class Puri<TSchema, TTables extends Record<string, any>, TResult> {
  private knexQuery: Knex.QueryBuilder;

  // 생성자 시그니처들
  constructor(knex: Knex, tableName: string);
  constructor(knex: Knex, tableSpec: Record<string, string | Puri<TSchema, any, any>>);
  constructor(
    public knex: Knex,
    tableNameOrSpec: any,
  ) {
    if (typeof tableNameOrSpec === "string") {
      // Case: new Puri(knex, "users")
      this.knexQuery = this.knex(tableNameOrSpec).from(tableNameOrSpec);
    } else if (typeof tableNameOrSpec === "object") {
      const entries = Object.entries(tableNameOrSpec);
      if (entries.length !== 1) {
        throw new Error("Table spec must have exactly one entry");
      }
      assert(entries[0]);
      const [alias, spec] = entries[0];
      if (typeof spec === "string") {
        this.knexQuery = this.knex(spec).from({ [alias]: spec });
      } else if (spec instanceof Puri) {
        const subqueryBuilder = spec.rawQuery();
        this.knexQuery = this.knex.from(subqueryBuilder.as(alias));
      } else {
        throw new Error("Invalid table specification");
      }
    } else {
      throw new Error("Invalid table specification");
    }
  }

  // Static SQL helper functions for SELECT
  static count(column: string = "*"): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `COUNT(${column})::integer`,
    };
  }
  static sum(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `SUM(${column})`,
    };
  }
  static avg(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `AVG(${column})`,
    };
  }
  static max(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `MAX(${column})`,
    };
  }
  static min(column: string): SqlExpression<"number"> {
    return {
      _type: "sql_expression",
      _return: "number",
      _sql: `MIN(${column})`,
    };
  }
  static concat(...args: string[]): SqlExpression<"string"> {
    return {
      _type: "sql_expression",
      _return: "string",
      _sql: `CONCAT(${args.join(", ")})`,
    };
  }
  static upper(column: string): SqlExpression<"string"> {
    return {
      _type: "sql_expression",
      _return: "string",
      _sql: `UPPER(${column})`,
    };
  }
  static lower(column: string): SqlExpression<"string"> {
    return {
      _type: "sql_expression",
      _return: "string",
      _sql: `LOWER(${column})`,
    };
  }

  // Raw functions for SELECT
  static rawString(sql: string): SqlExpression<"string"> {
    return { _type: "sql_expression", _return: "string", _sql: sql };
  }
  static rawNumber(sql: string): SqlExpression<"number"> {
    return { _type: "sql_expression", _return: "number", _sql: sql };
  }
  static rawBoolean(sql: string): SqlExpression<"boolean"> {
    return { _type: "sql_expression", _return: "boolean", _sql: sql };
  }
  static rawDate(sql: string): SqlExpression<"date"> {
    return { _type: "sql_expression", _return: "date", _sql: sql };
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

    // TODO: rawBinding 메서드 만들어서 XSS 방지
    return Puri.rawString(
      `ts_headline('${config}', ${column}, ${parser}('${config}', '${query}')${hlOptions})`,
    );
  }

  // ts_rank
  static tsRank(column: string, query: string, options?: TsRankOptions): SqlExpression<"number"> {
    return Puri._tsRank("ts_rank", column, query, options);
  }

  // ts_rank_cd
  static tsRankCd(column: string, query: string, options?: TsRankOptions): SqlExpression<"number"> {
    return Puri._tsRank("ts_rank_cd", column, query, options);
  }

  static _tsRank(
    type: "ts_rank" | "ts_rank_cd",
    column: string,
    query: string,
    options?: TsRankOptions,
  ): SqlExpression<"number"> {
    const {
      parser = "websearch_to_tsquery",
      config = "simple",
      normalization,
      weights,
    } = options ?? {};

    const weightClause = weights ? `ARRAY[${weights.join(", ")}], ` : "";
    const normalizationClause = normalization ? `, ${normalization}` : "";

    return Puri.rawNumber(
      `${type}(${weightClause}${column}, ${parser}('${config}', '${query}')${normalizationClause})`,
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
      if (typeof columnOrFunction === "object" && columnOrFunction._type === "sql_expression") {
        // SQL 함수인 경우
        selectClauses.push(this.knex.raw(`${columnOrFunction._sql} as "${alias}"`));
      } else {
        // 일반 컬럼인 경우
        const columnPath = columnOrFunction as string;
        if (alias === columnPath) {
          // alias와 컬럼명이 같으면 alias 생략
          selectClauses.push(columnPath);
        } else {
          // alias 지정
          selectClauses.push(`${columnPath} as ${alias}`);
        }
      }
    }

    this.knexQuery.select(selectClauses);
    return this as any;
  }

  /**
   * 중첩 객체를 flat 객체로 변환
   * 예: { parent: { id: "parent.id", name: "parent.name" } }
   *   → { parent__id: "parent.id", parent__name: "parent.name" }
   */
  private flattenSelect(selectObj: Record<string, any>, prefix = ""): Record<string, any> {
    const flatSelect: Record<string, any> = {};

    for (const [key, value] of Object.entries(selectObj)) {
      const fullKey = prefix ? `${prefix}__${key}` : key;

      if (typeof value === "object" && value !== null && !("_type" in value)) {
        // 중첩 객체인 경우 - 재귀 처리
        const nested = this.flattenSelect(value, fullKey);
        Object.assign(flatSelect, nested);
      } else {
        // 일반 값인 경우 (컬럼 경로 또는 SqlExpression)
        flatSelect[fullKey] = value;
      }
    }

    return flatSelect;
  }

  // SELECT (select는 overwrite, appendSelect는 append)
  appendSelect<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect,
  ): Puri<TSchema, TTables, TResult & ParseSelectObject<TTables, TSelect>> {
    // 중첩 객체를 flat하게 변환
    const flatSelect = this.flattenSelect(selectObj);

    const selectClauses: (string | Knex.Raw)[] = [];

    for (const [alias, columnOrFunction] of Object.entries(flatSelect)) {
      if (typeof columnOrFunction === "object" && columnOrFunction._type === "sql_expression") {
        selectClauses.push(this.knex.raw(`${columnOrFunction._sql} as ${alias}`));
      } else {
        const columnPath = columnOrFunction as string;
        if (alias === columnPath) {
          selectClauses.push(columnPath);
        } else {
          selectClauses.push(`${columnPath} as ${alias}`);
        }
      }
    }

    this.knexQuery.select(selectClauses);
    return this as any;
  }

  // SELECT *
  selectAll(): Puri<TSchema, TTables, SelectAllResult<TTables>> {
    this.knexQuery.select("*");
    return this as any;
  }

  // CLEAR
  clear(statement: ClearStatements): this {
    this.knexQuery.clear(statement);
    return this;
  }

  // knex에 없어서 직접 구현함
  clearJoin(alias: string): this {
    (this.knexQuery as any)._statements = (this.knexQuery as any)._statements.filter((s: any) => {
      if ("joinType" in s) {
        const [_alias, _table] = Object.entries(s.table)[0];
        return _alias !== alias;
      } else {
        return true;
      }
    });
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
    return this.__commonJoin("join", tableNameOrSpec, ...args);
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
    return this.__commonJoin("leftJoin", tableNameOrSpec, ...args);
  }

  __commonJoin(joinType: "join" | "leftJoin", tableNameOrSpec: any, ...args: any[]): this {
    if (typeof tableNameOrSpec === "string") {
      // Case 1: join("posts", ...)
      const tableName = tableNameOrSpec;

      if (args.length === 1 && typeof args[0] === "function") {
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
    } else if (typeof tableNameOrSpec === "object") {
      // Case 2: join({ alias: "table" }, ...) or join({ alias: subquery }, ...)
      const entries = Object.entries(tableNameOrSpec);
      if (entries.length !== 1) {
        throw new Error("Table spec must have exactly one entry");
      }
      assert(entries[0]);
      const [[alias, spec]] = entries;

      if (typeof spec === "string") {
        // 테이블: join({ p: "posts" }, ...)
        if (args.length === 1 && typeof args[0] === "function") {
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
        if (args.length === 1 && typeof args[0] === "function") {
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

    return this;
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
    operator: ComparisonOperator | "like" | "not like",
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  // WHERE: SQL 표현식 - 사용: .where(puri.raw("CONCAT(u.name, u.email)"), "like", "%test%")
  where<TColumn extends Knex.Raw>(
    column: TColumn,
    operator: ComparisonOperator | "like" | "not like",
    value: any,
  ): this;
  // WHERE: 컬럼 - 사용: .where("u.id", "like", "%test%")
  where(...args: [columnOrConditions: any, operatorOrValue?: any, value?: any]): this {
    const [columnOrConditions, operatorOrValue, value] = args;
    if (typeof columnOrConditions === "object") {
      this.knexQuery.where(columnOrConditions);
    } else if (typeof value === "undefined") {
      if (operatorOrValue === null) {
        this.knexQuery.whereNull(columnOrConditions);
        return this;
      }
      this.knexQuery.where(columnOrConditions, operatorOrValue);
    } else if (typeof value !== "undefined") {
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
    values: ExtractColumnType<TTables, TColumn & string>[],
  ): Puri<TSchema, TTables, TResult> {
    this.knexQuery.whereIn(column, values);
    return this as any;
  }

  // WHERE NOT IN
  whereNotIn<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    values: ExtractColumnType<TTables, TColumn & string>[],
  ): Puri<TSchema, TTables, TResult> {
    this.knexQuery.whereNotIn(column, values);
    return this as any;
  }

  // WHERE MATCH
  whereMatch<TColumn extends FulltextColumns<TTables>>(column: TColumn, value: string): this {
    this.knexQuery.whereRaw(`MATCH (${String(column)}) AGAINST (?)`, [value]);
    return this;
  }

  // WHERE FULLTEXT
  whereTsSearch<TColumn extends AvailableColumns<TTables> | SqlExpression<"string">>(
    column: TColumn,
    value: string,
    options?: TsQueryOptions | TsQueryConfig,
  ): this {
    const opts =
      typeof options === "string" ? ({ config: options } as TsQueryOptions) : (options ?? {});

    const parser = opts.parser ?? "websearch_to_tsquery";
    const config = opts.config ?? "simple";
    const columnExpr =
      typeof column === "object" && column._type === "sql_expression"
        ? column._sql
        : String(column);

    this.knexQuery.whereRaw(`${columnExpr} @@ ${parser}(?, ?)`, [config, value]);
    return this;
  }

  // WHERE RAW
  whereRaw(sql: string, bindings?: readonly unknown[]): this {
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

  // ORDER BY
  orderBy<TColumn extends ResultAvailableColumns<TTables, TResult>>(
    column: TColumn,
    direction: "asc" | "desc",
  ): this;
  orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
    this.knexQuery.orderBy(column, direction);
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
  vectorSimilarity<TAs extends string>(
    column: VectorColumns<TTables>,
    embedding: number[],
    options: {
      method?: "cosine" | "l2" | "inner_product";
      threshold?: number;
      as?: TAs;
    } = {},
  ): Puri<TSchema, TTables, TResult & Record<TAs, number>> {
    const { method = "cosine", threshold, as = "similarity" as TAs } = options;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(as)) {
      throw new Error(`Invalid vectorSimilarity alias: ${as}`);
    }
    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      embedding.some((v) => !Number.isFinite(v))
    ) {
      throw new Error("Invalid embedding vector: expected a non-empty array of finite numbers");
    }
    const vectorLiteral = JSON.stringify(embedding.map((v) => Number(v)));

    // method별 연산자 및 similarity 계산식
    // - cosine: <=> (cosine distance, 0~2), similarity = 1 - distance
    // - l2: <-> (euclidean distance), similarity = distance (낮을수록 유사)
    // - inner_product: <#> (negative inner product), similarity = -distance (높을수록 유사)
    const operatorMap = {
      cosine: "<=>",
      l2: "<->",
      inner_product: "<#>",
    } as const;
    const operator = operatorMap[method];

    // SELECT에 similarity 추가
    if (method === "cosine") {
      // cosine: similarity = 1 - cosine_distance (0~1, 높을수록 유사)
      this.knexQuery.select(
        this.knex.raw(`1 - (?? <=> ?::vector) as ??`, [column, vectorLiteral, as]),
      );
    } else if (method === "l2") {
      // l2: distance 그대로 반환 (낮을수록 유사)
      this.knexQuery.select(this.knex.raw(`?? <-> ?::vector as ??`, [column, vectorLiteral, as]));
    } else {
      // inner_product: pgvector는 음수 반환하므로 부호 반전 (높을수록 유사)
      this.knexQuery.select(
        this.knex.raw(`-(?? <#> ?::vector) as ??`, [column, vectorLiteral, as]),
      );
    }

    // WHERE col IS NOT NULL
    this.knexQuery.whereNotNull(column);

    // threshold가 있으면 WHERE 추가
    if (typeof threshold === "number") {
      if (!Number.isFinite(threshold)) {
        throw new Error(`Invalid vectorSimilarity threshold: ${threshold}`);
      }

      if (method === "cosine") {
        // similarity >= threshold  <=>  cosine_distance <= (1 - threshold)
        this.knexQuery.whereRaw(`?? ${operator} ?::vector <= ?`, [
          column,
          vectorLiteral,
          1 - threshold,
        ]);
      } else if (method === "l2") {
        // distance <= threshold (거리가 threshold 이하)
        this.knexQuery.whereRaw(`?? ${operator} ?::vector <= ?`, [
          column,
          vectorLiteral,
          threshold,
        ]);
      } else {
        // inner_product: -distance >= threshold  <=>  distance <= -threshold
        this.knexQuery.whereRaw(`?? ${operator} ?::vector <= ?`, [
          column,
          vectorLiteral,
          -threshold,
        ]);
      }
    }

    // 기존 ORDER BY clear 후 원시 연산자로 정렬 (HNSW 인덱스 최적화)
    // 모든 method에서 ASC: 거리/음수값이 작을수록 유사
    this.knexQuery.clear("order");
    this.knexQuery.orderByRaw(`?? ${operator} ?::vector`, [column, vectorLiteral]);

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
    this.knexQuery.groupBy(...(columns as string[]));
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
    return new ResolvedPuri(this.knexQuery, this.knex);
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
    this.knexQuery.pluck(column as string);
    return new ResolvedPuri(this.knexQuery, this.knex);
  }

  // INSERT
  insert(
    data: InsertData<SingleTableValue<TTables>>,
  ): ResolvedPuri<InsertResult, SingleTableValue<TTables>> {
    this.knexQuery.insert(data);
    return new ResolvedPuri(this.knexQuery, this.knex);
  }

  // UPDATE
  update(data: WhereCondition<TTables>): ResolvedPuri<number, SingleTableValue<TTables>> {
    this.knexQuery.update(data);
    return new ResolvedPuri(this.knexQuery, this.knex);
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
    return new ResolvedPuri(this.knexQuery, this.knex);
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
    return new ResolvedPuri(this.knexQuery, this.knex);
  }

  // DELETE
  delete(): ResolvedPuri<number, SingleTableValue<TTables>> {
    this.knexQuery.delete();
    return new ResolvedPuri(this.knexQuery, this.knex);
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

export class WhereGroup<TTables extends Record<string, any>> {
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
export class JoinClauseGroup<
  TLeft extends Record<string, any>,
  TRight extends Record<string, any>,
> {
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
    this.callback.orOn(...(args as [string, string]));
    return this;
  }
}

/*
  TResolved: 쿼리 실행 후 반환될 결과 타입
  TReturning: RETURNING 절에 사용될 타입
*/
export class ResolvedPuri<TResolved, TReturning> {
  constructor(
    public knexQuery: Knex.QueryBuilder,
    private knex: Knex,
  ) {}

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
        const mergeObj: Record<string, any> = {};

        for (const [key, value] of Object.entries(update)) {
          if (
            value &&
            typeof value === "object" &&
            "_type" in value &&
            value._type === "sql_expression"
          ) {
            // SqlExpression → knex.raw()로 변환
            mergeObj[key] = this.knex.raw((value as SqlExpression<any>)._sql);
          } else {
            // 일반 값
            mergeObj[key] = value;
          }
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
    return new ResolvedPuri(this.knexQuery, this.knex);
  }
}
