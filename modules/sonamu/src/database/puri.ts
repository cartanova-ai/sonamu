import { Knex } from "knex";
import {
  SqlFunction,
  SelectObject,
  ParseSelectObject,
  WhereCondition,
  ComparisonOperator,
  AvailableColumns,
  ExtractColumnType,
  Expand,
} from "./puri.types";
import chalk from "chalk";

// 메인 Puri 클래스
export class Puri<
  TSchema,
  TTable extends keyof TSchema | string,
  TResult = TTable extends keyof TSchema ? TSchema[TTable] : unknown,
  TJoined = {},
> {
  private knexQuery: Knex.QueryBuilder;

  // 생성자 시그니처들
  constructor(
    knex: Knex,
    tableName: TTable extends keyof TSchema ? TTable : unknown
  );
  constructor(
    knex: Knex,
    subquery: Puri<TSchema, any, TResult, any>,
    alias: TTable extends string ? TTable : never
  );
  constructor(
    private knex: Knex,
    tableNameOrSubquery: any,
    alias?: TTable extends string ? TTable : never
  ) {
    if (typeof tableNameOrSubquery === "string") {
      // 일반 테이블로 시작
      this.knexQuery = knex(tableNameOrSubquery).from(tableNameOrSubquery);
    } else {
      // 서브쿼리로 시작
      this.knexQuery = knex.from(tableNameOrSubquery.raw().as(alias));
    }
  }

  // Static SQL helper functions
  static count(column: string = "*"): SqlFunction<"number"> {
    return {
      _type: "sql_function",
      _return: "number",
      _sql: `COUNT(${column})`,
    };
  }

  static sum(column: string): SqlFunction<"number"> {
    return { _type: "sql_function", _return: "number", _sql: `SUM(${column})` };
  }

  static avg(column: string): SqlFunction<"number"> {
    return { _type: "sql_function", _return: "number", _sql: `AVG(${column})` };
  }

  static max(column: string): SqlFunction<"number"> {
    return { _type: "sql_function", _return: "number", _sql: `MAX(${column})` };
  }

  static min(column: string): SqlFunction<"number"> {
    return { _type: "sql_function", _return: "number", _sql: `MIN(${column})` };
  }

  static concat(...args: string[]): SqlFunction<"string"> {
    return {
      _type: "sql_function",
      _return: "string",
      _sql: `CONCAT(${args.join(", ")})`,
    };
  }

  static upper(column: string): SqlFunction<"string"> {
    return {
      _type: "sql_function",
      _return: "string",
      _sql: `UPPER(${column})`,
    };
  }

  static lower(column: string): SqlFunction<"string"> {
    return {
      _type: "sql_function",
      _return: "string",
      _sql: `LOWER(${column})`,
    };
  }

  // Raw functions
  static rawString(sql: string): SqlFunction<"string"> {
    return { _type: "sql_function", _return: "string", _sql: sql };
  }

  static rawNumber(sql: string): SqlFunction<"number"> {
    return { _type: "sql_function", _return: "number", _sql: sql };
  }

  static rawBoolean(sql: string): SqlFunction<"boolean"> {
    return { _type: "sql_function", _return: "boolean", _sql: sql };
  }

  static rawDate(sql: string): SqlFunction<"date"> {
    return { _type: "sql_function", _return: "date", _sql: sql };
  }

  // Alias 기반 Select
  select<TSelect extends SelectObject<TSchema, TTable, TResult, TJoined>>(
    selectObj: TSelect
  ): Puri<
    TSchema,
    TTable,
    TResult & ParseSelectObject<TSchema, TTable, TSelect, TResult, TJoined>,
    TJoined
  > {
    const selectClauses: (string | Knex.Raw)[] = [];

    for (const [alias, columnOrFunction] of Object.entries(selectObj)) {
      if (
        typeof columnOrFunction === "object" &&
        columnOrFunction._type === "sql_function"
      ) {
        // SQL 함수인 경우
        selectClauses.push(
          this.knex.raw(`${columnOrFunction._sql} as ${alias}`)
        );
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

  // 전체 선택 (편의 메서드)
  selectAll(): Puri<
    TSchema,
    TTable,
    TTable extends keyof TSchema
      ? TSchema[TTable] & TJoined
      : TResult & TJoined,
    TJoined
  > {
    this.knexQuery.select("*");
    return this as any;
  }

  // Where 조건 (조인된 테이블 컬럼도 지원)
  where(
    conditions: WhereCondition<TSchema, TTable, TResult, TJoined>
  ): Puri<TSchema, TTable, TResult, TJoined>;
  where<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    value: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >
  ): Puri<TSchema, TTable, TResult, TJoined>;
  where<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    operator: ComparisonOperator | "like",
    value: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >
  ): Puri<TSchema, TTable, TResult, TJoined>;
  where(
    columnOrConditions: any,
    operatorOrValue?: any,
    value?: any
  ): Puri<TSchema, TTable, TResult, TJoined> {
    if (typeof columnOrConditions === "object") {
      this.knexQuery.where(columnOrConditions);
    } else if (arguments.length === 2) {
      if (operatorOrValue === null) {
        this.knexQuery.whereNull(columnOrConditions);
        return this;
      }
      this.knexQuery.where(columnOrConditions, operatorOrValue);
    } else if (arguments.length === 3) {
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

  // WhereIn (조인된 테이블 컬럼도 지원)
  whereIn<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    values: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >[]
  ): Puri<TSchema, TTable, TResult, TJoined>;
  whereIn(
    column: string,
    values: any[]
  ): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.whereIn(column, values);
    return this;
  }

  // WhereGroup (괄호 그룹핑 지원)
  whereGroup(
    callback: (
      group: WhereGroup<TSchema, TTable, TResult, TJoined>
    ) => WhereGroup<TSchema, TTable, TResult, TJoined>
  ): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.where((builder) => {
      const group = new WhereGroup<TSchema, TTable, TResult, TJoined>(builder);
      callback(group);
    });
    return this;
  }

  orWhereGroup(
    callback: (
      group: WhereGroup<TSchema, TTable, TResult, TJoined>
    ) => WhereGroup<TSchema, TTable, TResult, TJoined>
  ): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.orWhere((builder) => {
      const group = new WhereGroup<TSchema, TTable, TResult, TJoined>(builder);
      callback(group);
    });
    return this;
  }

  // Join
  join<TJoinTable extends keyof TSchema>(
    table: TJoinTable,
    left: string,
    right: string
  ): Puri<
    TSchema,
    TTable,
    TResult,
    TJoined & Record<TJoinTable, TSchema[TJoinTable]>
  >;
  join<TJoinTable extends keyof TSchema>(
    table: TJoinTable,
    joinCallback: (
      joinClause: JoinClauseGroup<TSchema, TTable, TJoined>
    ) => void
  ): Puri<
    TSchema,
    TTable,
    TResult,
    TJoined & Record<TJoinTable, TSchema[TJoinTable]>
  >;
  join<TSubResult, TAlias extends string>(
    subquery: Puri<TSchema, any, TSubResult, any>,
    alias: TAlias,
    left: string,
    right: string
  ): Puri<TSchema, TTable, TResult, TJoined & Record<TAlias, TSubResult>>;
  join(
    table: string,
    left: string,
    right: string
  ): Puri<TSchema, TTable, TResult, TJoined>;
  join(
    tableOrSubquery: string | keyof TSchema | Puri<TSchema, any, any, any>,
    ...args: any[]
  ): Puri<TSchema, TTable, TResult, any> {
    if (tableOrSubquery instanceof Puri) {
      // 서브쿼리 조인: join(subquery, alias, left, right)
      const [alias, left, right] = args;
      this.knexQuery.join(tableOrSubquery.raw().as(alias), left, right);
    } else if (
      args.length === 2 &&
      typeof args[0] === "string" &&
      typeof args[1] === "string"
    ) {
      const [left, right] = args;
      this.knexQuery.join(tableOrSubquery as string, left, right);
    } else if (args.length === 1 && typeof args[0] === "function") {
      const joinCallback = args[0];
      this.knexQuery.join(tableOrSubquery as string, (joinClause) => {
        joinCallback(new JoinClauseGroup(joinClause));
      });
    } else {
      throw new Error("Invalid arguments");
    }
    return this as any;
  }

  leftJoin<TJoinTable extends keyof TSchema>(
    table: TJoinTable,
    left: string,
    right: string
  ): Puri<
    TSchema,
    TTable,
    TResult,
    TJoined & Record<TJoinTable, Partial<TSchema[TJoinTable]>>
  >;
  leftJoin<TSubResult, TAlias extends string>(
    subquery: Puri<TSchema, any, TSubResult, any>,
    alias: TAlias,
    left: string,
    right: string
  ): Puri<
    TSchema,
    TTable,
    TResult,
    TJoined & Record<TAlias, Partial<TSubResult>>
  >;
  leftJoin(
    table: string,
    left: string,
    right: string
  ): Puri<TSchema, TTable, TResult, TJoined>;
  leftJoin(
    tableOrSubquery: string | keyof TSchema | Puri<TSchema, any, any, any>,
    ...args: any[]
  ): Puri<TSchema, TTable, TResult, any> {
    if (tableOrSubquery instanceof Puri) {
      // 서브쿼리 조인: leftJoin(subquery, alias, left, right)
      const [alias, left, right] = args;
      this.knexQuery.leftJoin(tableOrSubquery.raw().as(alias), left, right);
    } else {
      const [left, right] = args;
      this.knexQuery.leftJoin(tableOrSubquery as string, left, right);
    }
    return this as any;
  }

  // OrderBy
  orderBy<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    direction: "asc" | "desc"
  ): Puri<TSchema, TTable, TResult, TJoined>;
  orderBy(
    column: string,
    direction: "asc" | "desc" = "asc"
  ): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.orderBy(column, direction);
    return this;
  }

  // 기본 쿼리 메서드들
  limit(count: number): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.limit(count);
    return this;
  }

  offset(count: number): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.offset(count);
    return this;
  }

  // Group by (조인된 테이블 컬럼도 지원)
  groupBy<TColumns extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    ...columns: TColumns[]
  ): Puri<TSchema, TTable, TResult, TJoined>;
  groupBy(...columns: string[]): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.groupBy(...(columns as string[]));
    return this;
  }

  having(condition: string): Puri<TSchema, TTable, TResult, TJoined>;
  having(
    condition: string,
    operator: ComparisonOperator,
    value: any
  ): Puri<TSchema, TTable, TResult, TJoined>;
  having(...conditions: string[]): Puri<TSchema, TTable, TResult, TJoined> {
    this.knexQuery.having(...(conditions as [string, string, string]));
    return this;
  }
  // 실행 메서드들 - thenable 구현
  then<TResult1, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Expand<TResult>[]
        ) => Expand<TResult1> | PromiseLike<Expand<TResult1>>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<Expand<TResult1> | TResult2> {
    return this.knexQuery.then(onfulfilled as any, onrejected);
  }

  catch<TResult2 = never>(
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<Expand<TResult> | TResult2> {
    return this.knexQuery.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Expand<TResult>> {
    return this.knexQuery.finally(onfinally);
  }

  // 안전한 실행 메서드들
  async first(): Promise<Expand<TResult> | undefined> {
    return this.knexQuery.first() as Promise<Expand<TResult> | undefined>;
  }

  async firstOrFail(): Promise<TResult> {
    const result = await this.knexQuery.first();
    if (!result) {
      throw new Error("No results found");
    }
    return result as TResult;
  }

  async at(index: number): Promise<Expand<TResult> | undefined> {
    const results = await this;
    return results[index] as Expand<TResult> | undefined;
  }

  async assertAt(index: number): Promise<Expand<TResult>> {
    const results = await this;
    const result = results[index];
    if (result === undefined) {
      throw new Error(`No result found at index ${index}`);
    }
    return result;
  }

  // Insert/Update/Delete
  async insert(
    data: TTable extends keyof TSchema ? TSchema[TTable] : unknown
  ): Promise<number[]> {
    return this.knexQuery.insert(data);
  }

  async update(
    data: Partial<TTable extends keyof TSchema ? TSchema[TTable] : unknown>
  ): Promise<number> {
    return this.knexQuery.update(data);
  }

  async delete(): Promise<number> {
    return this.knexQuery.delete();
  }

  toQuery(): string {
    return this.knexQuery.toQuery();
  }

  debug(): Puri<TSchema, TTable, TResult, TJoined> {
    console.log(
      `${chalk.cyan("[Puri Debug]")} ${chalk.yellow(this.formatSQL(this.toQuery()))}`
    );
    return this;
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
    formatted = formatted.replace(
      /\s+((?:INNER|LEFT|RIGHT|FULL OUTER)\s+)?JOIN\s+/gi,
      "\n$1JOIN "
    );

    // AND, OR 조건 처리
    formatted = formatted.replace(/\s+(AND|OR)\s+/gi, "\n  $1 ");

    // 괄호 처리 및 들여쓰기
    const lines = formatted.split("\n");
    const indentedLines = [];
    let indentLevel = 0;

    for (let line of lines) {
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

  raw(): Knex.QueryBuilder {
    return this.knexQuery;
  }
}

// 11. Database 클래스
class WhereGroup<
  TSchema,
  TTable extends keyof TSchema | string,
  TResult = any,
  TJoined = {},
> {
  constructor(private builder: Knex.QueryBuilder) {}

  where(
    conditions: WhereCondition<TSchema, TTable, TResult, TJoined>
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  where<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    value: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  where<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    operator: ComparisonOperator | "like",
    value: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  where(raw: string): WhereGroup<TSchema, TTable, TResult, TJoined>;
  where(...args: any[]): WhereGroup<TSchema, TTable, TResult, TJoined> {
    this.builder.where(args[0], ...args.slice(1));
    return this;
  }

  orWhere(
    conditions: WhereCondition<TSchema, TTable, TResult, TJoined>
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  orWhere<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    value: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  orWhere<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    operator: ComparisonOperator | "like",
    value: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  orWhere(raw: string): WhereGroup<TSchema, TTable, TResult, TJoined>;
  orWhere(...args: any[]): WhereGroup<TSchema, TTable, TResult, TJoined> {
    this.builder.orWhere(args[0], ...args.slice(1));
    return this;
  }

  whereIn<TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>>(
    column: TColumn,
    values: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >[]
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  whereIn(
    column: string,
    values: any[]
  ): WhereGroup<TSchema, TTable, TResult, TJoined> {
    this.builder.whereIn(column, values);
    return this;
  }

  orWhereIn<
    TColumn extends AvailableColumns<TSchema, TTable, TResult, TJoined>,
  >(
    column: TColumn,
    values: ExtractColumnType<
      TSchema,
      TTable,
      TColumn & string,
      TResult,
      TJoined
    >[]
  ): WhereGroup<TSchema, TTable, TResult, TJoined>;
  orWhereIn(
    column: string,
    values: any[]
  ): WhereGroup<TSchema, TTable, TResult, TJoined> {
    this.builder.orWhereIn(column, values);
    return this;
  }

  // 중첩 그룹 지원
  whereGroup(
    callback: (
      group: WhereGroup<TSchema, TTable, TResult, TJoined>
    ) => WhereGroup<TSchema, TTable, TResult, TJoined>
  ): WhereGroup<TSchema, TTable, TResult, TJoined> {
    this.builder.where((subBuilder) => {
      const subGroup = new WhereGroup<TSchema, TTable, TResult, TJoined>(
        subBuilder
      );
      callback(subGroup);
    });
    return this;
  }

  orWhereGroup(
    callback: (
      group: WhereGroup<TSchema, TTable, TResult, TJoined>
    ) => WhereGroup<TSchema, TTable, TResult, TJoined>
  ): WhereGroup<TSchema, TTable, TResult, TJoined> {
    this.builder.orWhere((subBuilder) => {
      const subGroup = new WhereGroup<TSchema, TTable, TResult, TJoined>(
        subBuilder
      );
      callback(subGroup);
    });
    return this;
  }
}

export class JoinClauseGroup<
  TSchema,
  TTable extends keyof TSchema | string,
  TJoined = {},
> {
  constructor(private callback: Knex.JoinClause) {}

  on(
    callback: (joinClause: JoinClauseGroup<TSchema, TTable, TJoined>) => void
  ): JoinClauseGroup<TSchema, TTable, TJoined>;
  on(column: string, value: any): JoinClauseGroup<TSchema, TTable, TJoined>;
  on(...args: any[]): JoinClauseGroup<TSchema, TTable, TJoined> {
    this.callback.on(...(args as [string, string]));
    return this;
  }

  orOn(
    callback: (joinClause: JoinClauseGroup<TSchema, TTable, TJoined>) => void
  ): JoinClauseGroup<TSchema, TTable, TJoined>;
  orOn(column: string, value: any): JoinClauseGroup<TSchema, TTable, TJoined>;
  orOn(...args: any[]): JoinClauseGroup<TSchema, TTable, TJoined> {
    this.callback.orOn(...(args as [string, string]));
    return this;
  }
}
