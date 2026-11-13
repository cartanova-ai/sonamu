import { describe, expect, it } from "vitest";

import { type DrainReport, type SearchIndexer } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import {
  outcomeSum,
  type RuntimeRow,
  useWorkerFixture,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Body and revision always come from the same snapshot: when another writer commits an edit and its mark after the
 * ledger read but before the source read, this drain sends the old body at the old revision and the next drain the
 * new body at the new revision.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

function targetOf(setup: WorkerSetup, key = KEY) {
  const target = setup.targets.get(key);
  if (target === undefined) throw new Error(`대상 ${key}가 없습니다.`);
  return target;
}

async function drainPastCooldown(indexer: SearchIndexer): Promise<DrainReport> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const report = await indexer.drainOnce();
    if (report.cooldownRemainingMs === 0) return report;
    await new Promise((resolve) => setTimeout(resolve, report.cooldownRemainingMs + 5));
  }
  throw new Error("cooldown이 끝나지 않았습니다.");
}

describe("스냅샷 일관성", () => {
  it("materialize 도중 커밋된 수정이 있어도 옛 본문에 새 리비전이 찍히지 않는다", async () => {
    let current: WorkerSetup | undefined;
    let interleaved = false;
    const setup = await kit.setUp({
      hooks: {
        [KEY]: {
          // Inside the snapshot, after the ledger read and before the source read.
          beforeRead: async () => {
            if (current === undefined || interleaved) return;
            interleaved = true;
            await kit.write(current, KEY, ["m1", "m2"], async (trx) => {
              await kit.upsert(trx, KEY, "m1", "새 본문 1");
              await kit.remove(trx, KEY, "m2");
            });
          },
        },
      },
    });
    current = setup;
    const target = targetOf(setup);
    await kit.write(setup, KEY, ["m1", "m2"], async (trx) => {
      await kit.upsert(trx, KEY, "m1", "옛 본문 1");
      await kit.upsert(trx, KEY, "m2", "옛 본문 2");
    });
    const { indexer } = kit.indexer(setup);

    const first = await indexer.drainOnce();
    expect(interleaved).toBe(true);
    expect(first).toMatchObject({ claimed: 2, indexed: 2 });
    expect(outcomeSum(first)).toBe(first.claimed);
    expect(await kit.ledger(KEY)).toEqual({ m1: 2, m2: 2 });
    expect(await kit.indexed(target, "m1")).toEqual({
      version: 1,
      revision: 1,
      deleted: false,
      doc: { body: "옛 본문 1" },
    });
    expect(await kit.indexed(target, "m2")).toMatchObject({
      version: 1,
      revision: 1,
      deleted: false,
      doc: { body: "옛 본문 2" },
    });
    // The acknowledgement applies revision 1 only; revision 2 stays pending.
    expect(
      (await kit.runtimes()).map((row) => [row.document_id, row.applied_revision, row.lease_token]),
    ).toEqual([
      ["m1", 1, null],
      ["m2", 1, null],
    ]);

    const second = await indexer.drainOnce();
    expect(second).toMatchObject({ claimed: 2, indexed: 2 });
    expect(await kit.indexed(target, "m1")).toEqual({
      version: 2,
      revision: 2,
      deleted: false,
      doc: { body: "새 본문 1" },
    });
    expect(await kit.indexed(target, "m2")).toEqual({
      version: 2,
      revision: 2,
      deleted: true,
      doc: undefined,
    });
    expect(await kit.intents()).toEqual([]);
    expect(await kit.runtimes()).toEqual([]);
  });
});

describe("혼자 느린 projection의 증거 규칙", () => {
  const SLOW_LIMITS = {
    projectionTimeoutMs: 400,
    maxRetryAttempts: 2,
    retryBaseDelayMs: 20,
    retryMaxDelayMs: 150,
  } as const;

  it("건강한 대상은 계속 색인되고, 늘 느린 문서는 첫 시도에 반납되고 이후 집계되어 결국 격리되며, 다른 문서는 예산을 잃지 않는다", async () => {
    const setup = await kit.setUp({ keys: ["fast", "slow"] });
    const fast = targetOf(setup, "fast");
    const slow = targetOf(setup, "slow");
    await kit.write(setup, "slow", ["s"], (trx) =>
      kit.upsert(trx, "slow", "s", "느림", undefined, true),
    );
    const { indexer } = kit.indexer(setup, { limits: SLOW_LIMITS });

    const observed: Pick<RuntimeRow, "attempts" | "quarantined_revision" | "last_error">[] = [];
    let quarantined = false;
    for (let round = 0; round < 30 && !quarantined; round += 1) {
      const id = `f${round}`;
      await kit.write(setup, "fast", [id], (trx) => kit.upsert(trx, "fast", id, `빠름 ${round}`));
      const report = await drainPastCooldown(indexer);
      expect(outcomeSum(report)).toBe(report.claimed);
      // A timeout on another target does not stop the drain for the healthy one.
      await expect(kit.indexed(fast, id)).resolves.toMatchObject({
        version: 1,
        doc: { body: `빠름 ${round}` },
      });
      const row = (await kit.runtimes()).find((candidate) => candidate.target_id === slow.targetId);
      if (row !== undefined && row.lease_token === null) {
        const last = observed.at(-1);
        if (
          last === undefined ||
          last.attempts !== row.attempts ||
          last.quarantined_revision !== row.quarantined_revision
        ) {
          observed.push({
            attempts: row.attempts,
            quarantined_revision: row.quarantined_revision,
            last_error: row.last_error,
          });
        }
        quarantined = row.quarantined_revision !== null;
      }
    }
    expect(quarantined).toBe(true);
    // First attempt: a timeout without evidence is released without budget.
    expect(observed[0]).toMatchObject({
      attempts: 0,
      quarantined_revision: null,
      last_error: { class: "materialize_released", code: "projection_timeout", evidence: "none" },
    });
    // Later attempts: other projections on the same primary finished meanwhile, so the timeout counts against the
    // document and quarantines it at the limit of 2.
    expect(observed.slice(1).map((entry) => [entry.attempts, entry.quarantined_revision])).toEqual([
      [1, null],
      [2, 1],
    ]);
    expect(observed.at(-1)?.last_error).toMatchObject({
      class: "projection_error",
      code: "projection_timeout",
      exhausted: true,
    });
    expect((await kit.runtimes()).filter((row) => row.target_id === fast.targetId)).toEqual([]);
    expect((await kit.intents()).map((row) => [row.target_id, row.document_id])).toEqual([
      [slow.targetId, "s"],
    ]);
  });
});
