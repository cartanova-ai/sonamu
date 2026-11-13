import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { type DrainReport } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import {
  recordingClient,
  TEST_LIMITS,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * A domain transaction re-marks the document after the bulk response and keeps its intent row locked. The
 * acknowledgement must still clear the lease, so the next revision is not delayed by the lease duration.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";
const LEASE_MS = TEST_LIMITS.leaseDurationMs;
/** Must stay far below the 30 s lease, otherwise expiry rather than release could explain the result. */
const BOUND_MS = 5_000;

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

async function leases(): Promise<(string | null)[]> {
  const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
    sql`SELECT lease_token::text FROM ${qualified(h.searchSchema, "delivery_runtime")} ORDER BY document_id`,
  );
  return rows.map((row) => row.lease_token);
}

async function holdWriter(setup: WorkerSetup, body: string): Promise<Knex.Transaction> {
  const trx = await setup.capture.transaction({ isolationLevel: "read committed" });
  await kit.upsert(trx, KEY, "a", body);
  expect(await setup.captureSync.markChanged(trx, KEY, ["a"])).toBe("recorded");
  return trx;
}

async function drainUntilIndexed(
  setup: WorkerSetup,
  drain: () => Promise<DrainReport>,
  revision: number,
): Promise<{ elapsedMs: number; reports: DrainReport[] }> {
  const started = performance.now();
  const reports: DrainReport[] = [];
  await waitFor(
    `리비전 ${revision} 색인`,
    async () => {
      reports.push(await drain());
      return (await kit.indexed(targetOf(setup), "a"))?.revision === revision;
    },
    BOUND_MS,
  );
  return { elapsedMs: performance.now() - started, reports };
}

describe("보낸 뒤 확인 전의 재표시", () => {
  it("확인은 임대를 풀고(released), writer가 커밋하면 다음 drain이 임대 만료를 기다리지 않고 새 리비전을 색인한다", async () => {
    let writer: Knex.Transaction | undefined;
    let armed = true;
    const setup = await kit.setUp({ keys: [KEY] });
    await kit.write(setup, KEY, ["a"], (trx) => kit.upsert(trx, KEY, "a", "v1"));
    const recorded = recordingClient(kit.nativeClient(), {
      after: async () => {
        if (!armed) return;
        armed = false;
        writer = await holdWriter(setup, "v2");
      },
    });
    const { indexer } = kit.indexer(setup, { client: recorded.client });
    const first = await indexer.drainOnce();
    expect(first).toMatchObject({ claimed: 1, indexed: 0, released: 1, skippedLocked: 0 });
    expect(await kit.indexed(targetOf(setup), "a")).toMatchObject({ revision: 1 });
    expect(await leases()).toEqual([null]);
    await writer?.commit();

    const { elapsedMs } = await drainUntilIndexed(setup, () => indexer.drainOnce(), 2);
    expect(elapsedMs).toBeLessThan(LEASE_MS / 6);
    expect(await kit.indexed(targetOf(setup), "a")).toMatchObject({
      revision: 2,
      doc: { body: "v2" },
    });
    expect(await kit.intents()).toEqual([]);
  });

  it("writer가 롤백하면 다음 drain은 같은 리비전을 다시 보내고, 엔진의 409가 검증된 중복이 되어 예산 없이 정리된다", async () => {
    let writer: Knex.Transaction | undefined;
    let armed = true;
    const setup = await kit.setUp({ keys: [KEY] });
    await kit.write(setup, KEY, ["a"], (trx) => kit.upsert(trx, KEY, "a", "v1"));
    const recorded = recordingClient(kit.nativeClient(), {
      after: async () => {
        if (!armed) return;
        armed = false;
        writer = await holdWriter(setup, "v2");
      },
    });
    const { indexer } = kit.indexer(setup, { client: recorded.client });
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, released: 1 });
    await writer?.rollback();

    const again = await indexer.drainOnce();
    expect(again).toMatchObject({ claimed: 1, superseded: 1, retried: 0, quarantined: 0 });
    expect(recorded.bulks.map((bulk) => bulk.versions)).toEqual([[1], [1]]);
    expect(await kit.intents()).toEqual([]);
    expect(await kit.runtimes()).toEqual([]);
  });
});
