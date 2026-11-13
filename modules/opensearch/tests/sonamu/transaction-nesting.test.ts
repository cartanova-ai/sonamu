import { BaseModelClass, DB, PuriTransactionWrapper, PuriWrapper, UpsertBuilder } from "sonamu";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SearchInvalidTransaction, SearchNotConfigured } from "../../src/errors";
import {
  createPostgresSynchronization,
  type MarkChangedResult,
  type PostgresSynchronization,
} from "../../src/postgres";
import {
  createSonamuSynchronization,
  resolveSonamuPrimary,
  type SonamuSearchSynchronization,
} from "../../src/sonamu";
import { useIntegrationHarness } from "../helpers/harness";
import { applyTransactional, configureSonamuDatabase } from "../helpers/sonamu-app";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  readDeliveries,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
} from "../helpers/test-targets";

/**
 * markChanged under Sonamu transactions, using only Sonamu's public exports.
 * - A nested @transactional reuses the outer transaction; it is not a separate rollback boundary.
 * - A manual nested puri.transaction() opens a savepoint; rolling it back discards the marks made inside it.
 */

const h = useIntegrationHarness({ opensearch: false });
const KEY = "messages";

let admin: { run: StatementRunner; close(): Promise<void> };
let target: PreparedTarget;
let postgresSync: PostgresSynchronization;
let search: SonamuSearchSynchronization;

/** Sonamu's decorator requires the "...ModelClass" class-name suffix. */
class ChatProbeModelClass extends BaseModelClass {
  /** Returns the PostgreSQL transaction ID so callers can compare nesting levels. */
  async createRoomAndMark(name: string, documentId: string): Promise<string> {
    const puri = this.getPuri("w");
    await h.sample.createRoom(name, puri.knex);
    await search.markChanged(KEY, [documentId]);
    const { rows } = await puri.knex.raw<{ rows: { txid: string }[] }>(
      "SELECT txid_current()::text AS txid",
    );
    return rows[0].txid;
  }

  async outer(inner: () => Promise<string>): Promise<{ outerTxid: string; innerResult: string }> {
    const outerTxid = await this.createRoomAndMark("outer", "outer");
    const innerResult = await inner();
    return { outerTxid, innerResult };
  }

  async inner(fail: boolean): Promise<string> {
    const txid = await this.createRoomAndMark("inner", "inner");
    if (fail) throw new Error("안쪽 실패");
    return txid;
  }

  async outerThenFail(): Promise<void> {
    await this.createRoomAndMark("outer", "outer");
    await this.inner(false);
    throw new Error("바깥 실패");
  }

  async outerWithManualSavepoint(failInside: boolean): Promise<void> {
    await this.createRoomAndMark("outer", "outer");
    await this.getPuri("w")
      .transaction(async (trx) => {
        await h.sample.createRoom("savepoint", trx.knex);
        await search.markChanged(KEY, ["savepoint"]);
        if (failInside) throw new Error("savepoint 실패");
      })
      .catch(() => undefined);
  }

  async swallowPrecondition(): Promise<void> {
    await h.sample.createRoom("swallowed", this.getPuri("w").knex);
    await search.markChanged("unknown-key", ["x"]).catch(() => undefined);
  }

  /** Schedules a mark that runs after the transaction callback has returned. */
  async scheduleDetachedMark(): Promise<{ late: Promise<MarkChangedResult> }> {
    await this.createRoomAndMark("detached", "detached");
    const late = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    }).then(() => search.markChanged(KEY, ["late"]));
    late.catch(() => {});
    return { late };
  }
}
for (const method of [
  "outer",
  "inner",
  "outerThenFail",
  "outerWithManualSavepoint",
  "swallowPrecondition",
  "scheduleDetachedMark",
]) {
  applyTransactional(ChatProbeModelClass.prototype, method);
}
const model = new ChatProbeModelClass();

beforeAll(async () => {
  configureSonamuDatabase(h);
  admin = await openAdminClient(h);
});
afterAll(async () => {
  await admin.close();
});
beforeEach(async () => {
  await resetSearchSchema(h);
  target = await createTarget(admin.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
  postgresSync = createPostgresSynchronization({
    getPrimaryDatabase: resolveSonamuPrimary,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await postgresSync.initialize();
  search = createSonamuSynchronization(postgresSync);
});

async function roomNames(): Promise<string[]> {
  const rows: { name: string }[] = await h.sample.from("rooms").select("name").orderBy("name");
  return rows.map((row) => row.name);
}

describe("중첩 @transactional과 수동 중첩", () => {
  it("중첩 @transactional은 바깥 트랜잭션을 재사용해 함께 커밋/롤백된다", async () => {
    // Commit together: the inner call runs in the same PostgreSQL transaction.
    const committed = await model.outer(() => model.inner(false));
    expect(committed.innerResult).toBe(committed.outerTxid);
    expect(await roomNames()).toEqual(["inner", "outer"]);
    expect(await readLedger(h)).toEqual({ inner: 1, outer: 1 });

    // Roll back together: an outer failure discards the inner marks too.
    await resetSearchSchema(h);
    await h.sample.from("rooms").delete();
    target = await createTarget(admin.run, {
      schema: h.searchSchema,
      namespace: h.namespace,
      logicalKey: KEY,
    });
    postgresSync = createPostgresSynchronization({
      getPrimaryDatabase: resolveSonamuPrimary,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await postgresSync.initialize();
    search = createSonamuSynchronization(postgresSync);
    await expect(model.outerThenFail()).rejects.toThrow("바깥 실패");
    expect(await roomNames()).toEqual([]);
    expect(await readLedger(h)).toEqual({});

    // Not a rollback boundary: an inner error caught by the outer call still commits the inner changes and marks.
    await model.outer(() => model.inner(true).catch(() => "caught"));
    expect(await roomNames()).toEqual(["inner", "outer"]);
    expect(await readLedger(h)).toEqual({ inner: 1, outer: 1 });
    expect(await readDeliveries(h)).toEqual({
      [`${target.targetId}/inner`]: 1,
      [`${target.targetId}/outer`]: 1,
    });
  });

  it("수동 중첩 transaction()은 savepoint만 롤백한다", async () => {
    await model.outerWithManualSavepoint(true);
    expect(await roomNames()).toEqual(["outer"]);
    expect(await readLedger(h)).toEqual({ outer: 1 });
    expect(await readDeliveries(h)).toEqual({ [`${target.targetId}/outer`]: 1 });

    // A successful savepoint commits with the outer transaction.
    await model.outerWithManualSavepoint(false);
    expect(await readLedger(h)).toEqual({ outer: 2, savepoint: 1 });
  });
});

describe("트랜잭션 없음과 실패 닫힘", () => {
  it("활성 w 트랜잭션이 없으면 markChanged가 실패하고 새 트랜잭션을 열지 않는다", async () => {
    const pool = DB.getDB("w");
    let statements = 0;
    // Ignore BEGIN/COMMIT of the transaction this test opens itself.
    const listener = (query: { sql: string }) => {
      if (!/^(BEGIN|COMMIT|ROLLBACK)/i.test(query.sql.trim())) statements += 1;
    };
    pool.on("query", listener);
    try {
      const outside = await search.markChanged(KEY, ["x"]).catch((error) => error);
      expect(outside).toBeInstanceOf(SearchInvalidTransaction);
      expect(outside).toMatchObject({ details: { reason: "no-active-transaction" } });

      // A scope on the r preset alone is not a w transaction.
      await pool.transaction(async (trx) => {
        const wrapper = new PuriTransactionWrapper(trx, new UpsertBuilder());
        await DB.runWithTransactionScope("r", wrapper, async () => {
          await expect(search.markChanged(KEY, ["x"])).rejects.toMatchObject({
            details: { reason: "no-active-transaction" },
          });
        });
      });

      const plain = new PuriWrapper(pool, new UpsertBuilder());
      // The types reject this, but a JavaScript caller can still pass it.
      // @ts-expect-error -- a PuriWrapper that is not a transaction
      await expect(search.markChangedIn(plain, KEY, ["x"])).rejects.toMatchObject({
        constructor: SearchInvalidTransaction,
        details: { reason: "not-a-transaction-wrapper" },
      });
    } finally {
      pool.off("query", listener);
    }
    // markChanged neither borrowed a connection nor opened a transaction.
    expect(statements).toBe(0);
    expect(await readLedger(h)).toEqual({});
  });

  it("트랜잭션 범위가 끝난 뒤 실행되는 표시는 끝난 트랜잭션을 쓰지 않고 거부된다", async () => {
    const { late } = await model.scheduleDetachedMark();
    await expect(late).rejects.toMatchObject({
      constructor: SearchInvalidTransaction,
      details: { reason: "no-active-transaction" },
    });
    expect(await readLedger(h)).toEqual({ detached: 1 });
  });

  it("@transactional 안에서 패키지 전제 조건 오류를 삼켜도 도메인 변경은 커밋되지 않는다", async () => {
    await expect(model.swallowPrecondition()).resolves.toBeUndefined();
    expect(await roomNames()).toEqual([]);
    // Not swallowed, the same error reaches the caller with its own type.
    await expect(
      DB.getDB("w").transaction(async (trx) =>
        search.markChangedIn(new PuriTransactionWrapper(trx, new UpsertBuilder()), "unknown-key", [
          "x",
        ]),
      ),
    ).rejects.toBeInstanceOf(SearchNotConfigured);
  });
});
