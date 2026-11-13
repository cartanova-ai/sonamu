import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { SearchUnavailable } from "../../../src/errors";
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
 * Worker housekeeping must never fail a REPEATABLE READ domain writer with 40001. Housekeeping only changes
 * delivery_runtime (pausing changes targets), and only locks or deletes intent rows, so the row version the writer's
 * snapshot saw is never updated. A deleted intent gets a new incarnation from the marker. READ COMMITTED writers cannot
 * hit 40001 at all, so only REPEATABLE READ is exercised.
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

type Housekeeping = {
  /** Runs before the writer takes its snapshot. */
  before(
    f: Fixture,
    worker: Knex,
  ): Promise<{ token: string; claimed: ClaimedDelivery | undefined }>;
  /** Runs after the writer's snapshot; returns the number of rows it changed. */
  after(
    f: Fixture,
    worker: Knex,
    state: { token: string; claimed: ClaimedDelivery | undefined },
  ): Promise<number>;
  deletesIntent: boolean;
  /** Ledger revision after the writer commits. */
  revision: number;
};

const claimOn = (f: Fixture, worker: Knex, token: string, leaseMs = LONG_LEASE_MS) =>
  f.store.claim(worker, { targetIds: [f.target.targetId], limit: 10, leaseToken: token, leaseMs });

async function claimFirst(f: Fixture, worker: Knex, leaseMs = LONG_LEASE_MS) {
  const token = randomUUID();
  const [claimed] = await claimOn(f, worker, token, leaseMs);
  return { token, claimed };
}

const keyOf = ({ targetId, documentId, intentId }: ClaimedDelivery) => ({
  targetId,
  documentId,
  intentId,
});

const HOUSEKEEPING = {
  claim: {
    before: async () => ({ token: randomUUID(), claimed: undefined }),
    after: async (f, worker, { token }) => (await claimOn(f, worker, token)).length,
    deletesIntent: false,
    revision: 2,
  },
  heartbeat: {
    before: (f, worker) => claimFirst(f, worker),
    after: async (f, worker, { token, claimed }) =>
      (
        await f.store.heartbeat(worker, {
          leaseToken: token,
          deliveries: claimed === undefined ? [] : [claimed],
          leaseMs: LONG_LEASE_MS,
        })
      ).length,
    deletesIntent: false,
    revision: 2,
  },
  "부분 확인(전진)": {
    before: async (f, worker) => {
      const state = await claimFirst(f, worker);
      await mark(f, ["a"]);
      return state;
    },
    after: async (f, worker, { token, claimed }) => {
      const result = await f.store.acknowledge(worker, {
        leaseToken: token,
        items: claimed === undefined ? [] : [{ ...claimed, materializedRevision: 1 }],
      });
      expect(result.map((row) => row.outcome)).toEqual(["advanced"]);
      return result.length;
    },
    deletesIntent: false,
    revision: 3,
  },
  "확인(삭제)": {
    before: (f, worker) => claimFirst(f, worker),
    after: async (f, worker, { token, claimed }) => {
      const result = await f.store.acknowledge(worker, {
        leaseToken: token,
        items: claimed === undefined ? [] : [{ ...claimed, materializedRevision: 1 }],
      });
      expect(result.map((row) => row.outcome)).toEqual(["deleted"]);
      return result.length;
    },
    deletesIntent: true,
    revision: 2,
  },
  반납: {
    before: (f, worker) => claimFirst(f, worker),
    after: async (f, worker, { token, claimed }) =>
      (
        await f.store.release(worker, {
          leaseToken: token,
          items:
            claimed === undefined
              ? []
              : [{ ...keyOf(claimed), revision: 1, delayMs: 500, error: { class: "transient" } }],
        })
      ).length,
    deletesIntent: false,
    revision: 2,
  },
  "실패 집계": {
    before: (f, worker) => claimFirst(f, worker),
    after: async (f, worker, { token, claimed }) => {
      const result = await f.store.classifyFailures(worker, {
        leaseToken: token,
        items:
          claimed === undefined
            ? []
            : [
                {
                  ...keyOf(claimed),
                  materializedRevision: 1,
                  mode: "retry",
                  delayMs: 500,
                  error: { class: "transient_item" },
                },
              ],
        maxRetryAttempts: 5,
        maxRetryAgeMs: 3_600_000,
      });
      expect(result.map((row) => row.outcome)).toEqual(["retry_scheduled"]);
      return result.length;
    },
    deletesIntent: false,
    revision: 2,
  },
  "대상 일시 정지": {
    before: async () => ({ token: randomUUID(), claimed: undefined }),
    after: async (f, worker) =>
      (await f.store.pauseTarget(worker, {
        targetId: f.target.targetId,
        reason: { class: "write_alias_missing" },
      }))
        ? 1
        : 0,
    deletesIntent: false,
    revision: 2,
  },
} satisfies Record<string, Housekeeping>;

describe("REPEATABLE READ writer와 워커 정리 작업", () => {
  it.each(Object.entries(HOUSEKEEPING))(
    "워커의 %s 뒤에도 같은 문서를 표시한 도메인 트랜잭션은 40001 없이 커밋된다",
    async (_kind, step) => {
      const f = await setUp();
      await mark(f, ["a"]);
      const worker = workerPool();
      const state = await step.before(f, worker);
      const writer = await openWriter(f);
      try {
        const before = await intents();
        expect(await step.after(f, worker, state)).toBe(1);
        if (!step.deletesIntent) expect(await intents()).toEqual(before);
        expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
      } catch (error) {
        await writer.rollback();
        throw error;
      }
      await writer.commit();
      expect(
        await f.store.readLedger(worker, {
          namespace: h.namespace,
          definition: KEY,
          documentIds: ["a"],
        }),
      ).toEqual([{ documentId: "a", revision: step.revision }]);
      expect(await intents()).toEqual([
        expect.objectContaining({ document_id: "a", desired_revision: step.revision }),
      ]);
    },
  );

  it("대조: 워커가 intent 행을 갱신하는 잘못된 변형은 REPEATABLE READ writer를 40001로 실패시킨다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const writer = await openWriter(f);
    // The worker role's only intent column privilege (updated_at) stands in for housekeeping that writes intent rows.
    await worker.raw(
      sql`UPDATE ${table("deliveries")} SET updated_at = clock_timestamp() WHERE target_id = ? AND document_id = 'a'`,
      [f.target.targetId],
    );
    const outcome = await f.sync.markChanged(writer, KEY, ["a"]).catch((caught: Error) => caught);
    expect(outcome).toBeInstanceOf(SearchUnavailable);
    expect(outcome).toMatchObject({ retryable: true, details: { sqlstate: "40001" } });
    await writer.rollback();
  });

  it("writer가 intent를 잡은 동안의 부분 확인은 intent 잠금을 기다리지 않고 커밋된 새 리비전으로 전진하며, writer는 40001 없이 커밋된다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    // Waiting on the writer's intent lock would fail with 55P03 instead of hanging.
    await worker.raw("SET lock_timeout = '1s'");
    const { token, claimed } = await claimFirst(f, worker);
    await mark(f, ["a"]);
    const writer = await openWriter(f);
    try {
      expect(await f.sync.markChanged(writer, KEY, ["a"])).toBe("recorded");
      const before = await intents();
      expect(
        (
          await f.store.acknowledge(worker, {
            leaseToken: token,
            items: [{ ...claimed, materializedRevision: 1 }],
          })
        ).map((row) => row.outcome),
      ).toEqual(["advanced"]);
      expect(await intents()).toEqual(before);
      expect(await runtimes()).toEqual([
        expect.objectContaining({ intent_id: claimed.intentId, lease_token: null }),
      ]);
    } catch (error) {
      await writer.rollback();
      throw error;
    }
    await writer.commit();
    const next = await claimOn(f, workerPool(), randomUUID());
    expect(next.map((row) => [row.documentId, row.claimedRevision])).toEqual([["a", 3]]);
  });

  it("확인 삭제를 기다린 REPEATABLE READ 마커는 새 incarnation을 만든다", async () => {
    const f = await setUp();
    await mark(f, ["a"]);
    const worker = workerPool();
    const workerPid = await poolPid(worker);
    const { token, claimed } = await claimFirst(f, worker);
    const writer = await openWriter(f);
    const writerPid = await backendPid(writer);

    const ack = await worker.transaction();
    expect(
      (
        await f.store.acknowledge(ack, {
          leaseToken: token,
          items: [{ ...claimed, materializedRevision: 1 }],
        })
      ).map((row) => row.outcome),
    ).toEqual(["deleted"]);
    const marking = f.sync.markChanged(writer, KEY, ["a"]);
    marking.catch(() => {});
    await waitForLockWait(h.knex, writerPid, workerPid);
    await ack.commit();
    await expect(marking).resolves.toBe("recorded");
    await writer.commit();

    const now = await intents();
    expect(now).toEqual([expect.objectContaining({ document_id: "a", desired_revision: 2 })]);
    expect(now[0].intent_id).not.toBe(claimed.intentId);
    expect(await runtimes()).toEqual([]);
  });
});
