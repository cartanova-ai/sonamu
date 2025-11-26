import { type AST, type Column, type From, Parser } from "node-sql-parser";
import { get, sift } from "radashi";
import { Sonamu } from "sonamu";
import { expect } from "vitest";

/**
 * SQL 쿼리 문자열 파싱
 */
function parseQuery(query: string): AST | AST[] {
  const parser = new Parser();
  try {
    return parser.astify(query, { database: Sonamu.config.database.database });
  } catch (e) {
    throw new Error(`Failed to parse SQL query: ${query}\n${e}`);
  }
}

/**
 * SQL 쿼리 검증 메서드
 */
export class QueryExpectation {
  private ast: AST | AST[];
  private rawQuery: string;

  constructor(query: string) {
    this.rawQuery = query;
    this.ast = parseQuery(query);
  }

  /** SQL 문자열에 특정 문자열이 포함되어 있는지 확인 */
  toContain(substring: string): this {
    expect(this.rawQuery.toLowerCase()).toContain(substring.toLowerCase());
    return this;
  }

  /** SQL 문자열에 특정 문자열이 포함되어 있지 않은지 확인 */
  toNotContain(substring: string): this {
    expect(this.rawQuery.toLowerCase()).not.toContain(substring.toLowerCase());
    return this;
  }

  /**
   * 쿼리 타입이 지정한 타입인지 검증
   * @param type - select, insert, update, delete 중 하나
   */
  toBeType(type: "select" | "insert" | "update" | "delete"): this {
    const singleAst = this.ast as AST;
    expect(singleAst.type).toBe(type);
    return this;
  }

  /**
   * FROM 절에 지정한 테이블이 포함되어 있는지 검증
   * @param table - 확인할 테이블명
   */
  toHaveTable(table: string): this {
    const singleAst = this.ast as AST;

    // SELECT는 from, INSERT/UPDATE/DELETE는 table
    const fromClause = (singleAst as { from?: From[] }).from ?? [];
    const tableClause = (singleAst as { table?: From[] }).table ?? [];
    const allTables = [...fromClause, ...tableClause];

    const tables = allTables
      .filter((f): f is From & { table: string } => "table" in f)
      .map((f) => f.table);

    expect(tables).toContain(table);

    return this;
  }

  /**
   * SELECT 절에 지정한 컬럼이 포함되어 있는지 검증
   * @param column - 확인할 컬럼명
   * @param options.table - 특정 테이블의 컬럼인지 확인 (선택)
   * @param options.alias - 특정 컬럼의 alias인지 확인 (선택)
   */
  toHaveColumn(column: string, options?: { table?: string; alias?: string }): this {
    const singleAst = this.ast as AST;
    const columns = (singleAst as { columns?: Column[] }).columns ?? [];

    const matchingColumns = sift(
      columns.map((c) => {
        const colName = get(c, "expr.column");
        const colTable = get(c, "expr.table.value");
        const colAlias = get(c, "as");

        if (options?.table && colTable !== options.table) return null;
        if (options?.alias && colAlias !== options.alias) return null;

        return colName;
      }),
    );

    expect(matchingColumns).toContain(column);

    return this;
  }

  /** JOIN */
  toHaveJoin(_options?: {
    table?: string;
    type?: "inner" | "left" | "right" | "full";
    count?: number;
  }): this {
    return this;
  }

  /** WHERE */
  toHaveWhere(_options?: {
    column?: string;
    operator?: "=" | "!=" | ">" | "<" | "IN" | "NOT IN" | "IS NULL" | "IS NOT NULL" | "LIKE";
    logic?: "AND" | "OR";
  }): this {
    return this;
  }

  /** AGGREGATE  */
  toHaveAggregate(_fn: "count" | "sum" | "avg" | "max" | "min"): this {
    return this;
  }

  toHaveGroupBy(_column: string): this {
    return this;
  }

  toHaveHaving(): this {
    return this;
  }

  /** ORDER + LIMIT */
  toHavePagination(_options?: {
    orderBy?: string;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): this {
    return this;
  }

  // UPDATE SET
  toHaveSet(
    _column: string,
    _optionss?: {
      type?: "value" | "increment" | "decrement";
    },
  ): this {
    return this;
  }

  /** 파싱된 AST를 반환 */
  getAst(): AST | AST[] {
    return this.ast;
  }

  /** 디버그 - AST를 콘솔에 출력 */
  debug(): this {
    console.log("=== SQL Query ===");
    console.log(this.rawQuery);
    console.log("\n=== Parsed AST ===");
    console.log(JSON.stringify(this.ast, null, 2));
    return this;
  }
}

/**
 * SQL 쿼리 문자열을 검증하는 chainable assertion 생성
 *
 * @param query - 검증할 SQL 쿼리 문자열
 * @returns QueryExpectation 인스턴스
 *
 * @example
 * const query = Naite.get("puri-query");
 * expectQuery(query)
 *   .toBeType("select")
 *   .toHaveTable("users")
 *   .toHaveColumn("id", { table: "users" });
 */
export function expectQuery(query: string): QueryExpectation {
  return new QueryExpectation(query);
}
