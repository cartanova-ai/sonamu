import type { Knex } from "knex";
import type {
  AvailableColumns,
  SelectObject,
  ParseSelectObject,
  WhereCondition,
  ComparisonOperator,
  ExtractColumnType,
  SqlExpression,
} from "./nuri.types";
import chalk from "chalk";
import assert from "assert";

export class Nuri<TSchema, TTables extends Record<string, any>, TResult> {
  private knexQuery: Knex.QueryBuilder;

  // 생성자 오버로드
  constructor(knex: Knex, tableName: string);
  constructor(
    knex: Knex,
    tableSpec: Record<string, string | Nuri<TSchema, any, any>>
  );
  constructor(
    private knex: Knex,
    tableNameOrSpec: any
  ) {
    if (typeof tableNameOrSpec === "string") {
      // Case: new Nuri(knex, "users")
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
      } else if (spec instanceof Nuri) {
        const subqueryBuilder = spec.raw();
        this.knexQuery = this.knex.from(subqueryBuilder.as(alias));
      } else {
        throw new Error("Invalid table specification");
      }
    } else {
      throw new Error("Invalid table specification");
    }
  }

  // Static SQL helper functions
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

  // Raw functions
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

  // JOIN: 서브쿼리 (ALIAS)
  join<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Nuri<TSchema, any, TSubResult> },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${keyof TSubResult & string}`
  ): Nuri<
    TSchema,
    TTables & Record<TJoinAlias, TSubResult>, // 서브쿼리의 TResult
    TResult
  >;
  // JOIN: 테이블 (ALIAS)
  join<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${keyof TSchema[TJoinTable] & string}`
  ): Nuri<
    TSchema,
    TTables & Record<TJoinAlias, TSchema[TJoinTable]>, // TTables 확장!
    TResult
  >;
  // JOIN: 테이블 (테이블명)
  join<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    left: AvailableColumns<TTables>,
    right: `${TJoinTable & string}.${keyof TSchema[TJoinTable] & string}`
  ): Nuri<
    TSchema,
    TTables & Record<TJoinTable, TSchema[TJoinTable]>, // 테이블명이 키
    TResult
  >;
  // JOIN: 서브쿼리 (콜백)
  join<TJoinAlias extends string, TSubResult>(
    tableSpec: { [K in TJoinAlias]: Nuri<TSchema, any, TSubResult> },
    callback: (j: JoinClause<TTables, Record<TJoinAlias, TSubResult>>) => void
  ): Nuri<TSchema, TTables & Record<TJoinAlias, TSubResult>, TResult>;
  // JOIN: 테이블 (콜백)
  join<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    callback: (
      j: JoinClause<TTables, Record<TJoinAlias, TSchema[TJoinTable]>>
    ) => void
  ): Nuri<TSchema, TTables & Record<TJoinAlias, TSchema[TJoinTable]>, TResult>;
  // JOIN: 테이블 (테이블명)
  join<TJoinTable extends keyof TSchema>(
    tableName: TJoinTable,
    callback: (
      j: JoinClause<TTables, Record<TJoinTable, TSchema[TJoinTable]>>
    ) => void
  ): Nuri<TSchema, TTables & Record<TJoinTable, TSchema[TJoinTable]>, TResult>;
  // JOIN 실제 구현
  join(..._args: any[]): Nuri<TSchema, TTables, TResult> {
    // TODO: Implement join
    return this as any;
  }

  // Select 메서드
  select<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect
  ): Nuri<TSchema, TTables, ParseSelectObject<TTables, TSelect>> {
    const selectClauses: string[] = [];

    for (const [alias, columnPath] of Object.entries(selectObj)) {
      if (alias === columnPath) {
        // alias와 컬럼 경로가 같으면 alias 생략
        selectClauses.push(columnPath);
      } else {
        // alias 지정
        selectClauses.push(`${columnPath} as ${alias}`);
      }
    }

    this.knexQuery.select(selectClauses);
    return this as any;
  }

  where(conditions: WhereCondition<TTables>): Nuri<TSchema, TTables, TResult>;
  // 사용: .where({ "u.id": 1, "u.status": "active" })
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>
  ): Nuri<TSchema, TTables, TResult>;
  // 사용: .where("u.id", 1)
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: ComparisonOperator,
    value: ExtractColumnType<TTables, TColumn & string>
  ): Nuri<TSchema, TTables, TResult>;
  // 사용: .where("u.id", ">", 10)
  where(
    columnOrConditions: any,
    operatorOrValue?: any,
    value?: any
  ): Nuri<TSchema, TTables, TResult> {
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

  // 쿼리 확인용
  toQuery(): string {
    return this.knexQuery.toQuery();
  }

  debug(): this {
    console.log(
      `${chalk.cyan("[Nuri Debug]")} ${chalk.yellow(this.toQuery())}`
    );
    return this;
  }

  // Knex 쿼리 빌더 직접 접근
  raw(): Knex.QueryBuilder {
    return this.knexQuery;
  }

  // Thenable 구현 - Promise처럼 동작
  then<TResult1 = TResult[], TResult2 = never>(
    onfulfilled?:
      | ((value: TResult[]) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.knexQuery.then(onfulfilled as any, onrejected);
  }

  catch<TResult2 = never>(
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult[] | TResult2> {
    return this.knexQuery.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<TResult[]> {
    return this.knexQuery.finally(onfinally);
  }
}

export class NuriWrapper<TSchema> {
  constructor(private knex: Knex) {}

  from<TTable extends keyof TSchema>(
    tableName: TTable
  ): Nuri<TSchema, Record<TTable, TSchema[TTable]>, TSchema[TTable]>;
  from<TTable extends keyof TSchema, TAlias extends string>(spec: {
    [K in TAlias]: TTable;
  }): Nuri<TSchema, Record<TAlias, TSchema[TTable]>, TSchema[TTable]>;
  from<TAlias extends string, TSubResult>(spec: {
    [K in TAlias]: Nuri<TSchema, any, TSubResult>;
  }): Nuri<TSchema, Record<TAlias, TSubResult>, TSubResult>;
  from(spec: any): any {
    return new Nuri(this.knex, spec);
  }
}

export class JoinClause<
  TLeft extends Record<string, any>,
  TRight extends Record<string, any>,
> {
  constructor(private builder: Knex.QueryBuilder) {}

  // on 오버로드들
  on(left: AvailableColumns<TLeft>, right: AvailableColumns<TRight>): this;
  on(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: AvailableColumns<TRight>
  ): this;
  on(callback: (nested: JoinClause<TLeft, TRight>) => void): this;
  on(..._args: any[]): this {
    // TODO: Implement on
    return this;
  }

  // orOn 오버로드들
  orOn(left: AvailableColumns<TLeft>, right: AvailableColumns<TRight>): this;
  orOn(
    left: AvailableColumns<TLeft>,
    operator: ComparisonOperator,
    right: AvailableColumns<TRight>
  ): this;
  orOn(callback: (nested: JoinClause<TLeft, TRight>) => void): this;
  orOn(..._args: any[]): this {
    // TODO: Implement orOn
    return this;
  }
}

export class WhereGroup<TTables extends Record<string, any>> {
  constructor(private builder: Knex.QueryBuilder) {}

  // where 메서드들
  where(conditions: WhereCondition<TTables>): this;
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>
  ): this;
  where<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: ComparisonOperator,
    value: ExtractColumnType<TTables, TColumn & string>
  ): this;
  where(...args: any[]): WhereGroup<TTables> {
    this.builder.where(args[0], ...args.slice(1));
    return this;
  }

  // orWhere 메서드들
  orWhere(conditions: WhereCondition<TTables>): this;
  orWhere<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    value: ExtractColumnType<TTables, TColumn & string>
  ): this;
  orWhere<TColumn extends AvailableColumns<TTables>>(
    column: TColumn,
    operator: ComparisonOperator,
    value: ExtractColumnType<TTables, TColumn & string>
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
  orWhereGroup(
    callback: (g: WhereGroup<TTables>) => void
  ): WhereGroup<TTables> {
    this.builder.orWhere((subBuilder) => {
      const subGroup = new WhereGroup<TTables>(subBuilder);
      callback(subGroup);
    });
    return this;
  }
}
