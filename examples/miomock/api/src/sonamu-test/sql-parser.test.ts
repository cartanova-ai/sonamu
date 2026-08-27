import { type ColumnRef } from "node-sql-parser";
import { Parser } from "node-sql-parser";
import { describe, expect, test } from "vitest";

import {
  getJoinTables,
  getTableName,
  getTableNamesFromWhere,
} from "../../../../../modules/sonamu/dist/utils/sql-parser";

describe("sql-parser", () => {
  const parser = new Parser();

  describe("getTableName 테스트 (테이블명 추출)", () => {
    test("단순 테이블명 추출: users.id → 'users'", () => {
      const sql = "SELECT users.id FROM users";
      const ast = parser.astify(sql, { database: "MySQL" });

      if (Array.isArray(ast) || ast.type !== "select") {
        throw new Error("Invalid AST");
      }

      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const columnRef = ast.columns?.[0]?.expr as ColumnRef;
      const result = getTableName(columnRef);

      expect(result).toBe("users");
    });

    test("객체 형태 테이블명 처리", () => {
      // 객체 형태의 테이블명을 직접 생성
      const columnRef: ColumnRef = {
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        type: "column_ref",
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        table: {
          type: "default",
          value: "posts",
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- node-sql-parser의 ColumnRef.table 타입 정의가 불완전함 (실제로는 객체도 가능함)
        } as any,
        column: "title",
      };

      const result = getTableName(columnRef);

      expect(result).toBe("posts");
    });

    test("테이블명이 없는 경우: id → null", () => {
      const sql = "SELECT id FROM users";
      const ast = parser.astify(sql, { database: "MySQL" });

      if (Array.isArray(ast) || ast.type !== "select") {
        throw new Error("Invalid AST");
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      }

      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const columnRef = ast.columns?.[0]?.expr as ColumnRef;
      const result = getTableName(columnRef);

      expect(result).toBeNull();
    });
  });

  describe("getTableNamesFromWhere 테스트 (WHERE 조건에 사용된 테이블명 추출)", () => {
    test("단순 WHERE 조건 (단일 테이블)", () => {
      const sql = "SELECT * FROM users WHERE users.age > 20";
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getTableNamesFromWhere(ast);

      expect(result).toEqual(["users"]);
    });

    test("AND/OR로 연결된 복잡한 조건 (여러 테이블)", () => {
      const sql = `
        SELECT * FROM users 
        WHERE users.id = posts.user_id 
        AND posts.status = 'published'
      `;
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getTableNamesFromWhere(ast);

      expect(result).toContain("users");
      expect(result).toContain("posts");
      expect(result.length).toBe(2);
    });

    test("중첩된 binary expression", () => {
      const sql = `
        SELECT * FROM users 
        WHERE (users.age > 20 AND users.status = 'active') 
        OR (posts.created_at > '2024-01-01' AND comments.approved = true)
      `;
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getTableNamesFromWhere(ast);

      expect(result).toContain("users");
      expect(result).toContain("posts");
      expect(result).toContain("comments");
      expect(result.length).toBe(3);
    });

    test("WHERE 절이 없는 경우 (빈 배열 반환)", () => {
      const sql = "SELECT * FROM users";
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getTableNamesFromWhere(ast);

      expect(result).toEqual([]);
    });

    test("UPDATE 쿼리의 WHERE 절", () => {
      const sql = "UPDATE users SET status = 'active' WHERE users.age > 18";
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getTableNamesFromWhere(ast);

      expect(result).toEqual(["users"]);
    });

    test("DELETE 쿼리의 WHERE 절", () => {
      const sql =
        "DELETE FROM users WHERE users.status = 'inactive' AND users.last_login < '2023-01-01'";
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getTableNamesFromWhere(ast);

      expect(result).toEqual(["users"]);
    });
  });

  describe("getJoinTables 테스트 (JOIN 조건에 사용된 테이블명 추출)", () => {
    test("LEFT JOIN alias 추출", () => {
      const sql = `
        SELECT * FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
      `;
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getJoinTables(ast, ["LEFT JOIN"]);

      expect(result).toEqual(["p"]);
    });

    test("INNER JOIN alias 추출", () => {
      const sql = `
        SELECT * FROM users u
        INNER JOIN posts p ON u.id = p.user_id
      `;
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getJoinTables(ast, ["INNER JOIN"]);

      expect(result).toEqual(["p"]);
    });

    test("여러 JOIN 혼합 (LEFT + INNER)", () => {
      const sql = `
        SELECT * FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
        INNER JOIN comments c ON p.id = c.post_id
        LEFT JOIN likes l ON p.id = l.post_id
      `;
      const ast = parser.astify(sql, { database: "MySQL" });

      const leftJoins = getJoinTables(ast, ["LEFT JOIN"]);
      const innerJoins = getJoinTables(ast, ["INNER JOIN"]);

      expect(leftJoins).toContain("p");
      expect(leftJoins).toContain("l");
      expect(leftJoins.length).toBe(2);

      expect(innerJoins).toEqual(["c"]);
    });

    test("JOIN이 없는 경우 (빈 배열 반환)", () => {
      const sql = "SELECT * FROM users WHERE users.age > 20";
      const ast = parser.astify(sql, { database: "MySQL" });

      const result = getJoinTables(ast, ["LEFT JOIN"]);

      expect(result).toEqual([]);
    });

    test("특정 JOIN 타입만 필터링", () => {
      const sql = `
        SELECT * FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
        INNER JOIN comments c ON p.id = c.post_id
        RIGHT JOIN likes l ON p.id = l.post_id
      `;
      const ast = parser.astify(sql, { database: "MySQL" });

      // LEFT JOIN만 추출
      const leftOnly = getJoinTables(ast, ["LEFT JOIN"]);
      expect(leftOnly).toEqual(["p"]);

      // INNER JOIN만 추출
      const innerOnly = getJoinTables(ast, ["INNER JOIN"]);
      expect(innerOnly).toEqual(["c"]);

      // RIGHT JOIN만 추출
      const rightOnly = getJoinTables(ast, ["RIGHT JOIN"]);
      expect(rightOnly).toEqual(["l"]);

      // LEFT + INNER JOIN 추출
      const leftAndInner = getJoinTables(ast, ["LEFT JOIN", "INNER JOIN"]);
      expect(leftAndInner).toContain("p");
      expect(leftAndInner).toContain("c");
      expect(leftAndInner.length).toBe(2);
    });
  });
});
