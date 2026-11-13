import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { type ClaimedDelivery } from "../../../src/postgres/delivery-store";
import {
  DELIVERY_KEY,
  type DeliveryFixture,
  LONG_LEASE_MS,
  useDeliveryFixture,
} from "../../helpers/delivery-fixture";
import { useIntegrationHarness } from "../../helpers/harness";
import { sql } from "../../helpers/sql";
import { backendPid, waitForLockWait } from "../../helpers/test-targets";

/**
 * Acknowledge, failure classification and release against a domain writer that holds the same document's intent row.
 * A worker that cannot lock the intent settles through the runtime row alone, so the lease is freed at once and the
 * newer revision is claimable as soon as the writer commits. Worker connections use a 200ms lock_timeout so any wait
 * fails fast. The writer already holds its row before the worker acts, so its isolation level does not change the
 * worker's path; REPEATABLE READ is the stricter writer.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const fixture = useDeliveryFixture(h);
const { workerPool, poolPid, setUp, mark, table, intents, runtimes } = fixture;
const KEY = DELIVERY_KEY;
type Fixture = DeliveryFixture;

async function openWriter(f: Fixture): Promise<Knex.Transaction> {
  const trx = await f.capture.transaction({ isolationLevel: "repeatable read" });
  await trx.raw(sql`SELECT count(*) FROM ${table("store")}`);
  return trx;
}

async function strictWorker(): Promise<Knex> {
  const worker = workerPool();
  await worker.raw("SET lock_timeout = '200ms'");
  return worker;
}

async function claimAll(f: Fixture, worker: Knex | Knex.Transaction) {
  const token = randomUUID();
  const claimed = await f.store.claim(worker, {
    targetIds: [f.target.targetId],
    limit: 10,
    leaseToken: token,
    leaseMs: LONG_LEASE_MS,
  });
  return { token, claimed };
}

const byDocument = (rows: readonly ClaimedDelivery[], id: string): ClaimedDelivery => {
  const row = rows.find((candidate) => candidate.documentId === id);
  if (row === undefined) throw new Error(`문서 ${id}가 없습니다.`);
  return row;
};

const ack = (claimed: readonly ClaimedDelivery[], revision = 1) =>
  claimed.map((row) => ({ ...row, materializedRevision: revision }));

async function leaseState(): Promise<
  { document_id: string; lease_token: string | null; applied_revision: number }[]
> {
  return (await runtimes()).map(({ document_id, lease_token, applied_revision }) => ({
    document_id,
    lease_token,
    applied_revision,
  }));
}

describe("writer와 확인", () => {
  it("보낸 뒤 writer가 같은 문서를 표시하고 잡고 있어도 확인이 임대를 바로 풀고, 커밋 즉시 새 리비전을 claim한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = await strictWorker();
    const { token, claimed } = await claimAll(f, worker);
    const writer = await openWriter(f);
    try {
      expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
      expect(
        (await f.store.acknowledge(worker, { leaseToken: token, items: ack(claimed) })).map(
          (row) => row.outcome,
        ),
      ).toEqual(["released"]);
      // The applied revision is not recorded: if the writer rolls back, revision 1 must be sent again.
      expect(await leaseState()).toEqual([
        { document_id: "a", lease_token: null, applied_revision: 0 },
      ]);
      expect((await claimAll(f, worker)).claimed).toEqual([]);
    } catch (error) {
      await writer.rollback();
      throw error;
    }
    await writer.commit();
    const next = await claimAll(f, worker);
    expect(next.claimed.map((row) => [row.documentId, row.claimedRevision])).toEqual([["a", 2]]);
    const { rows } = await h.knex.raw<{ rows: { attempts: number; retry_age_ms: string }[] }>(
      sql`SELECT attempts, retry_age_ms FROM ${table("delivery_runtime")}`,
    );
    expect(rows).toEqual([{ attempts: 0, retry_age_ms: "0" }]);
  });

  it("writer가 롤백하면 적용 리비전이 기록되지 않았으므로 같은 리비전을 다시 claim한다 (재전송은 엔진에서 검증된 중복)", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = await strictWorker();
    const { token, claimed } = await claimAll(f, worker);
    const writer = await openWriter(f);
    expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
    expect(
      (await f.store.acknowledge(worker, { leaseToken: token, items: ack(claimed) })).map(
        (row) => row.outcome,
      ),
    ).toEqual(["released"]);
    await writer.rollback();
    const again = await claimAll(f, worker);
    expect(again.claimed.map((row) => [row.documentId, row.claimedRevision])).toEqual([["a", 1]]);
    expect(
      (
        await f.store.acknowledge(worker, { leaseToken: again.token, items: ack(again.claimed) })
      ).map((row) => row.outcome),
    ).toEqual(["deleted"]);
    expect({ intents: await intents(), runtimes: await runtimes() }).toEqual({
      intents: [],
      runtimes: [],
    });
  });

  for (const writerFirst of ["a", "b"] as const) {
    it(`교착 없음: writer가 ${writerFirst}를 잡은 채 다른 문서를 원하고, 워커의 열린 트랜잭션이 그 문서의 intent를 잡아도 워커는 기다리지 않는다`, async () => {
      const f = await setUp();
      await mark(f, ["a", "b"]);
      const worker = await strictWorker();
      const workerPid = await poolPid(worker);
      const { token, claimed } = await claimAll(f, worker);
      const other = writerFirst === "a" ? "b" : "a";
      const writer = await openWriter(f);
      const writerPid = await backendPid(writer);
      expect(await f.sync.markChanged(writer, KEY, [writerFirst])).toBe("recorded");

      const trx = await worker.transaction();
      const outcomes = await f.store.acknowledge(trx, { leaseToken: token, items: ack(claimed) });
      expect(Object.fromEntries(outcomes.map((row) => [row.documentId, row.outcome]))).toEqual({
        [writerFirst]: "released",
        [other]: "deleted",
      });

      const marking = f.sync.markChanged(writer, KEY, [other]);
      marking.catch(() => {});
      await waitForLockWait(h.knex, writerPid, workerPid);
      expect(
        await f.store.release(trx, {
          leaseToken: token,
          items: [
            {
              ...byDocument(claimed, writerFirst),
              revision: 1,
              delayMs: 0,
              error: { class: "transient" },
            },
          ],
        }),
      ).toEqual([]);
      await trx.commit();
      await expect(marking).resolves.toBe("recorded");
      await writer.commit();

      const next = await claimAll(f, worker);
      expect(next.claimed.map((row) => [row.documentId, row.claimedRevision]).toSorted()).toEqual([
        ["a", 2],
        ["b", 2],
      ]);
    });
  }
});

describe("writer와 실패 집계, 반납", () => {
  it("실패 집계는 writer가 intent를 잡고 있어도 기다리지 않고 정확히 한 번 세며, 임대를 풀어 커밋 즉시 새 리비전을 claim하게 한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = await strictWorker();
    const { token, claimed } = await claimAll(f, worker);
    const writer = await openWriter(f);
    try {
      expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
      const item = {
        ...byDocument(claimed, "a"),
        materializedRevision: 1,
        mode: "retry" as const,
        delayMs: 600_000,
        error: { class: "transient_item" },
      };
      const input = {
        leaseToken: token,
        items: [item],
        maxRetryAttempts: 5,
        maxRetryAgeMs: 3_600_000,
      };
      expect(await f.store.classifyFailures(worker, input)).toEqual([
        expect.objectContaining({ outcome: "retry_scheduled", attempts: 1 }),
      ]);
      expect(await f.store.classifyFailures(worker, input)).toEqual([]);
    } catch (error) {
      await writer.rollback();
      throw error;
    }
    await writer.commit();
    const { rows } = await h.knex.raw<{
      rows: { attempts: number; failure_revision: string; lease_token: string | null }[];
    }>(sql`SELECT attempts, failure_revision, lease_token FROM ${table("delivery_runtime")}`);
    expect(rows).toEqual([{ attempts: 1, failure_revision: "1", lease_token: null }]);
    // The ten-minute delay on revision 1 does not hold back revision 2.
    expect((await claimAll(f, worker)).claimed.map((row) => row.claimedRevision)).toEqual([2]);
  });

  it("반납은 writer가 intent를 잡고 있어도 기다리지 않고 임대를 푼다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = await strictWorker();
    const { token, claimed } = await claimAll(f, worker);
    const writer = await openWriter(f);
    try {
      expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
      expect(
        await f.store.release(worker, {
          leaseToken: token,
          items: [
            { ...byDocument(claimed, "a"), revision: 1, delayMs: 0, error: { class: "transient" } },
          ],
        }),
      ).toHaveLength(1);
      expect(await leaseState()).toEqual([
        { document_id: "a", lease_token: null, applied_revision: 0 },
      ]);
    } catch (error) {
      await writer.rollback();
      throw error;
    }
    await writer.commit();
    expect((await claimAll(f, worker)).claimed.map((row) => row.claimedRevision)).toEqual([2]);
  });
});

describe("오래 잡힌 잠금", () => {
  it("writer가 intent를 임대보다 오래 잡고 있어도 heartbeat는 매번 기다리지 않고 임대를 연장해, 그동안 다른 워커가 claim하지 못한다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = await strictWorker();
    const other = await strictWorker();
    const LEASE_MS = 600;
    const token = randomUUID();
    const claimed = await f.store.claim(worker, {
      targetIds: [f.target.targetId],
      limit: 10,
      leaseToken: token,
      leaseMs: LEASE_MS,
    });
    expect(claimed).toHaveLength(1);
    const writer = await openWriter(f);
    try {
      expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
      const started = Date.now();
      // Renew every quarter lease for more than three lease lengths.
      while (Date.now() - started < 3 * LEASE_MS) {
        const beat = await f.store.heartbeat(worker, {
          leaseToken: token,
          deliveries: claimed,
          leaseMs: LEASE_MS,
        });
        expect(beat.map((row) => row.documentId)).toEqual(["a"]);
        expect(await runtimes()).toEqual([
          expect.objectContaining({ document_id: "a", lease_token: token, live: true }),
        ]);
        expect((await claimAll(f, other)).claimed).toEqual([]);
        await new Promise((resolve) => setTimeout(resolve, LEASE_MS / 4));
      }
    } catch (error) {
      await writer.rollback();
      throw error;
    }
    await writer.commit();
    expect(await intents()).toEqual([
      expect.objectContaining({ document_id: "a", desired_revision: 2 }),
    ]);
    expect(
      (await f.store.acknowledge(worker, { leaseToken: token, items: ack(claimed) })).map(
        (row) => row.outcome,
      ),
    ).toEqual(["advanced"]);
  });
});
