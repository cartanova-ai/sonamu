import knex, { type Knex } from "knex";
import { Sonamu, withDefaultStatementTimeout } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterEach, describe, expect, vi } from "vitest";

bootstrap(vi, { forTesting: false });

// 실제 PostgreSQL에서 세션 수준 statement_timeout이 적용되는지 확인한다.
// 쓰기 없이 SHOW / pg_sleep / SELECT 1만 실행한다.
describe("런타임 풀 기본 statement_timeout", () => {
  const instances: Knex[] = [];
  const createPool = (timeoutMs: number) => {
    const instance = knex({
      ...withDefaultStatementTimeout(Sonamu.dbConfig.test, timeoutMs),
      pool: { min: 0, max: 5, acquireTimeoutMillis: 10_000 },
    });
    instances.push(instance);
    return instance;
  };

  afterEach(async () => {
    await Promise.all(instances.splice(0).map((instance) => instance.destroy()));
  });

  test("접속 시 세션 수준 statement_timeout이 설정된다", async () => {
    const db = createPool(300);

    const result = await db.raw<{ rows: { statement_timeout: string }[] }>(
      "SHOW statement_timeout",
    );

    expect(result.rows[0]?.statement_timeout).toBe("300ms");
  });

  test("타임아웃을 넘는 쿼리는 취소된다(57014)", async () => {
    const db = createPool(300);

    await expect(db.raw("SELECT pg_sleep(3)")).rejects.toMatchObject({ code: "57014" });
  });

  test("느린 쿼리가 풀 전체를 점유해도 가벼운 쿼리는 타임아웃 직후 실행된다", async () => {
    const db = createPool(500);

    const slow = Array.from({ length: 5 }, () => db.raw("SELECT pg_sleep(5)").catch((e) => e));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const startedAt = performance.now();
    await db.raw("SELECT 1");
    const elapsed = performance.now() - startedAt;

    // 타임아웃이 없으면 느린 쿼리가 끝나는 약 5초 뒤에야 커넥션을 얻는다.
    expect(elapsed).toBeLessThan(2_000);
    for (const error of await Promise.all(slow)) {
      expect(error).toMatchObject({ code: "57014" });
    }
  });
});
