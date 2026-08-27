import { DB, EntityManager } from "sonamu";
import { bootstrap, DataExplorer, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);

const getExplorer = () => {
  const db = DB.testTransaction || DB.getDB("w");
  return new DataExplorer(db, EntityManager);
};

describe("DataExplorer", () => {
  describe("explore()", () => {
    test("sample 전략으로 균등 샘플링", async () => {
      const explorer = getExplorer();
      const users = await explorer.explore("User", {
        strategy: "sample",
        limit: 5,
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users.length).toBeLessThanOrEqual(5);
      expect(users[0]).toHaveProperty("id");
    });

    test("recent 전략으로 최근 데이터 조회", async () => {
      const explorer = getExplorer();
      const users = await explorer.explore("User", {
        strategy: "recent",
        limit: 3,
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users.length).toBeLessThanOrEqual(3);

      if (users.length >= 2) {
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        const first = new Date(users[0]?.created_at as string).getTime();
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        const second = new Date(users[1]?.created_at as string).getTime();
        expect(first).toBeGreaterThanOrEqual(second);
      }
    });

    test("random 전략으로 랜덤 샘플링", async () => {
      const explorer = getExplorer();
      const users = await explorer.explore("User", {
        strategy: "random",
        limit: 5,
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users.length).toBeLessThanOrEqual(5);
    });

    test("ids 전략으로 특정 ID 조회", async () => {
      const explorer = getExplorer();
      const allUsers = await explorer.explore("User", {
        strategy: "sample",
        limit: 3,
      });
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.

      if (allUsers.length > 0) {
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        const targetIds = allUsers.map((u) => u.id as number);

        const users = await explorer.explore("User", {
          strategy: "ids",
          ids: targetIds,
        });
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.

        expect(users.length).toBe(targetIds.length);
        users.forEach((user) => {
          // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
          expect(targetIds).toContain(user.id as number);
        });
      }
    });

    test("query 전략으로 조건부 조회", async () => {
      const explorer = getExplorer();
      const users = await explorer.explore("User", {
        strategy: "query",
        where: { role: "normal" },
        orderBy: "id:asc",
        limit: 5,
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users.length).toBeLessThanOrEqual(5);

      users.forEach((user) => {
        expect(user.role).toBe("normal");
      });

      if (users.length >= 2) {
        for (let i = 1; i < users.length; i++) {
          expect(Number(users[i]?.id)).toBeGreaterThanOrEqual(Number(users[i - 1]?.id));
        }
      }
    });
  });

  describe("exploreRelation()", () => {
    test(
      "Relation prop의 참조 데이터 조회",
      async () => {
        const explorer = getExplorer();
        const departments = await explorer.exploreRelation("Employee", "department", {
          limit: 5,
        });

        expect(departments.length).toBeGreaterThan(0);
        expect(departments.length).toBeLessThanOrEqual(5);
        expect(departments[0]).toHaveProperty("id");
      },
      { timeout: 10000 },
    );

    test("존재하지 않는 relation prop은 에러", async () => {
      const explorer = getExplorer();
      await expect(explorer.exploreRelation("User", "non_existent_relation")).rejects.toThrow(
        "Relation property not found",
      );
    });

    test("일반 prop을 relation으로 조회하면 에러", async () => {
      const explorer = getExplorer();
      await expect(explorer.exploreRelation("User", "email")).rejects.toThrow(
        "Relation property not found",
      );
    });
  });
});
