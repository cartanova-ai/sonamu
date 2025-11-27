/** biome-ignore-all lint/suspicious/noThenProperty: Puri는 thenable 인터페이스를 구현하고 있습니다. */
/** biome-ignore-all lint/suspicious/noExplicitAny: Puri는 다양한 타입을 사용하고 있습니다. */

import assert from "assert";
import chalk from "chalk";
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
  ParseSelectObject,
  ResultAvailableColumns,
  SelectObject,
  SingleTableValue,
  SqlExpression,
  WhereCondition,
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
        const subqueryBuilder = spec.raw();
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
      _sql: `COUNT(${column})`,
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

  // SELECT (overwrite)
  select<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect,
  ): Puri<TSchema, TTables, ParseSelectObject<TTables, TSelect>> {
    const selectClauses: (string | Knex.Raw)[] = [];

    for (const [alias, columnOrFunction] of Object.entries(selectObj)) {
      if (typeof columnOrFunction === "object" && columnOrFunction._type === "sql_expression") {
        // SQL 함수인 경우
        selectClauses.push(this.knex.raw(`${columnOrFunction._sql} as ${alias}`));
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

  // SELECT (select는 overwrite, appendSelect는 append)
  appendSelect<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect,
  ): Puri<TSchema, TTables, TResult & ParseSelectObject<TTables, TSelect>> {
    return this.select(selectObj) as any;
  }

  // SELECT *
  selectAll(): this {
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
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSubResult>, // 서브쿼리의 TResult
    TResult
  >;
  // LEFT JOIN: 테이블 + Alias
  leftJoin<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSchema[TJoinTable]>, // TTables 확장!
    TResult
  >;
  // LEFT JOIN: 테이블명
  leftJoin<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    left: AvailableColumns<TTables>,
    right: `${TJoinTable & string}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinTable, TSchema[TJoinTable]>, // 테이블명이 키
    TResult
  >;
  // LEFT JOIN: 서브쿼리 + Alias + 콜백
  leftJoin<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Puri<TSchema, any, TSubResult> },
    callback: (j: JoinClauseGroup<TTables, Record<TJoinAlias, TSubResult>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSubResult>, TResult>;
  // LEFT JOIN: 테이블 + Alias + 콜백
  leftJoin<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    callback: (j: JoinClauseGroup<TTables, Record<TJoinAlias, TSchema[TJoinTable]>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinAlias, TSchema[TJoinTable]>, TResult>;
  // LEFT JOIN: 테이블명 + 콜백
  leftJoin<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    callback: (j: JoinClauseGroup<TTables, Record<TJoinTable, TSchema[TJoinTable]>>) => void,
  ): Puri<TSchema, TTables & Record<TJoinTable, TSchema[TJoinTable]>, TResult>;
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
          this.knexQuery[joinType](spec.raw().as(alias), (joinClause) => {
            callback(new JoinClauseGroup(joinClause));
          });
        } else {
          // Simple
          const [left, right] = args;
          this.knexQuery[joinType](spec.raw().as(alias), left, right);
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
  // WHERE: 컬럼 - 사용: .where("u.id", 1)
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>,
  ): this;
  // WHERE: 컬럼 - 사용: .where("u.id", ">", 10)
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: ComparisonOperator | "like" | "not like",
    value: ExtractColumnType<TTables, TColumn & string>,
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

  // 기본 쿼리 메서드들
  limit(count: number): this {
    this.knexQuery.limit(count);
    return this;
  }

  offset(count: number): this {
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
      this.knexQuery.having(conditions[0]);
    } else if (conditions.length === 3) {
      // having("count", ">", 10)
      this.knexQuery.having(conditions[0], conditions[1], conditions[2]);
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
    return new ResolvedPuri(this.knexQuery);
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
    return new ResolvedPuri(this.knexQuery);
  }

  // INSERT
  insert(data: InsertData<SingleTableValue<TTables>>): ResolvedPuri<[number], never> {
    this.knexQuery.insert(data);
    return new ResolvedPuri(this.knexQuery);
  }

  // UPDATE
  update(data: WhereCondition<TTables>): ResolvedPuri<TResult, number> {
    this.knexQuery.update(data);
    return new ResolvedPuri(this.knexQuery);
  }

  // Increment
  increment<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: number,
  ): ResolvedPuri<number, never> {
    if (value <= 0) {
      throw new Error("Increment value must be greater than 0");
    }
    this.knexQuery.increment(column, value);
    return new ResolvedPuri(this.knexQuery);
  }
  // Decrement
  decrement<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: number,
  ): ResolvedPuri<number, never> {
    if (value <= 0) {
      throw new Error("Decrement value must be greater than 0");
    }
    this.knexQuery.decrement(column, value);
    return new ResolvedPuri(this.knexQuery);
  }

  // DELETE
  delete(): ResolvedPuri<number, never> {
    this.knexQuery.delete();
    return new ResolvedPuri(this.knexQuery);
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

  // Knex 쿼리 빌더 직접 접근
  raw(): Knex.QueryBuilder {
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
    operator: ComparisonOperator,
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
    operator: ComparisonOperator,
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

export class JoinClauseGroup<
  TLeft extends Record<string, any>,
  TRight extends Record<string, any>,
> {
  constructor(private callback: Knex.JoinClause) {}

  // ON(AND): 컬럼 = 컬럼
  on(left: AvailableColumns<TLeft>, right: AvailableColumns<TRight>): this;
  // ON(AND): 컬럼 (연산자) 컬럼
  on(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: AvailableColumns<TRight>,
  ): this;
  // ON(AND): 콜백
  on(callback: (nested: JoinClauseGroup<TLeft, TRight>) => void): this;
  // ON(AND) 구현
  on(...args: any[]): this {
    this.callback.on(...(args as [string, string]));
    return this;
  }

  // ON(OR): 컬럼 = 컬럼
  orOn(left: AvailableColumns<TLeft>, right: AvailableColumns<TRight>): this;
  // ON(OR): 컬럼 (연산자) 컬럼
  orOn(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: AvailableColumns<TRight>,
  ): this;
  // ON(OR): 콜백
  orOn(callback: (nested: JoinClauseGroup<TLeft, TRight>) => void): this;
  // ON(OR) 구현
  orOn(...args: any[]): this {
    this.callback.orOn(...(args as [string, string]));
    return this;
  }
}

/*
  TResolved: 쿼리 실행 후 반환될 결과 타입
  _TReturning: 추후 RETURNING 절에 사용될 타입
*/
export class ResolvedPuri<TResolved, _TReturning> {
  constructor(public knexQuery: Knex.QueryBuilder) {}

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
}
