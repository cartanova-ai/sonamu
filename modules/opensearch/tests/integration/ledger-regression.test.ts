import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type IndexerEvent } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { sendBulk } from "../helpers/opensearch-ops";
import { qualified, sql } from "../helpers/sql";
import {
  outcomeSum,
  recordingClient,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * When the indexed version is ahead of the ledger revision (the ledger went back, as after a restore), the worker
 * neither overwrites nor acknowledges: it releases without budget and pauses the target with revision_divergence.
 * A hash mismatch at an equal version quarantines only that document.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";
const WORKER_QUERY = {
  require_alias: "true",
  filter_path: "errors,items.*._id,items.*.status,items.*._version,items.*.error.type",
};

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

const targetRowSchema = z.object({
  state: z.string(),
  write_enabled: z.boolean(),
  pause_reason: z.unknown(),
  paused: z.boolean(),
});

async function targetRow(targetId: string) {
  const { rows } = await h.knex.raw(
    sql`SELECT state, write_enabled, pause_reason, paused_at IS NOT NULL AS paused FROM ${qualified(h.searchSchema, "targets")} WHERE target_id = ?`,
    [targetId],
  );
  return targetRowSchema.parse(z.array(z.unknown()).parse(rows)[0]);
}

/** Indexes x up to revision 3, then rolls ledger and source back to revision 1 as a restore would, and re-enqueues x. */
async function regressLedger(setup: WorkerSetup): Promise<void> {
  const { indexer } = kit.indexer(setup);
  for (const body of ["하나", "둘", "셋"]) {
    await kit.write(setup, KEY, ["x"], (trx) => kit.upsert(trx, KEY, "x", body));
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
  }
  expect(await kit.indexed(targetOf(setup), "x")).toMatchObject({
    version: 3,
    doc: { body: "셋" },
  });
  await h.knex.raw(
    sql`UPDATE ${qualified(h.searchSchema, "documents")} SET revision = 1 WHERE document_id = 'x'`,
  );
  await h.knex.raw(sql`UPDATE ${qualified(h.appSchema, "notes")} SET body = '하나' WHERE id = 'x'`);
  await h.knex.raw(
    sql`INSERT INTO ${qualified(h.searchSchema, "deliveries")} (target_id, document_id, desired_revision) VALUES (?, 'x', 1)`,
    [targetOf(setup).targetId],
  );
}

describe("원장 역행", () => {
  it("색인 버전이 현재 원장보다 높으면 대상을 일시 정지하고 ack하지 않는다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    await regressLedger(setup);
    await kit.write(setup, KEY, ["y"], (trx) => kit.upsert(trx, KEY, "y", "와이"));

    const events: IndexerEvent[] = [];
    const recorded = recordingClient(kit.nativeClient());
    const { indexer } = kit.indexer(setup, { client: recorded.client, events });
    const report = await indexer.drainOnce();
    // y in the same bulk is indexed; x is neither overwritten nor acknowledged and is released without budget.
    expect(report).toMatchObject({
      claimed: 2,
      indexed: 1,
      released: 1,
      superseded: 0,
      retried: 0,
      quarantined: 0,
    });
    expect(outcomeSum(report)).toBe(report.claimed);
    expect(events).toContainEqual({
      type: "target-paused",
      targetId: target.targetId,
      reason: "revision_divergence",
    });
    expect(await targetRow(target.targetId)).toEqual({
      state: "paused",
      write_enabled: true,
      paused: true,
      pause_reason: {
        class: "revision_divergence",
        documents: [{ id: "x", indexed: 3, ledger: 1 }],
      },
    });
    expect(await kit.indexed(target, "x")).toEqual({
      version: 3,
      revision: 3,
      deleted: false,
      doc: { body: "셋" },
    });
    expect(await kit.indexed(target, "y")).toMatchObject({ version: 1 });
    expect((await kit.intents()).map((row) => row.document_id)).toEqual(["x"]);
    expect(await kit.runtimes()).toEqual([
      expect.objectContaining({
        document_id: "x",
        lease_token: null,
        attempts: 0,
        retry_age_ms: 0,
        quarantined_revision: null,
        applied_revision: 0,
        last_error: { class: "revision_divergence", indexed: 3, ledger: 1 },
      }),
    ]);

    // Nothing more goes to the paused target, neither from drainOnce nor from the loop.
    await kit.write(setup, KEY, ["z"], (trx) => kit.upsert(trx, KEY, "z", "제트"));
    const bulksBefore = recorded.bulks.length;
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0 });
    const handle = indexer.start({ pollIntervalMs: 10 });
    const firstDrain = handle.status().lastDrainAt ?? 0;
    await waitFor("루프가 여러 번 drain", () => {
      const status = handle.status();
      return (status.lastDrainAt ?? 0) > firstDrain + 50;
    });
    expect(handle.status().pausedTargets).toEqual([target.targetId]);
    expect(handle.status().lastReport).toMatchObject({ claimed: 0 });
    await handle.stop({ deadlineMs: 5_000 });
    expect(recorded.bulks.length).toBe(bulksBefore);
    expect((await kit.intents()).map((row) => row.document_id)).toEqual(["x", "z"]);
    expect(await kit.indexed(target, "z")).toBeNull();
    expect(await kit.indexed(target, "x")).toMatchObject({ version: 3, doc: { body: "셋" } });
  });

  it("같은 버전의 해시 불일치는 그 문서만 격리한다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    // Other content already indexed at the same external version, same hash_version, different projection_hash.
    const seeded = await sendBulk(
      h.opensearch,
      target.writeAlias,
      [
        { index: { _id: "y", version: 1, version_type: "external" } },
        {
          sonamu_meta: {
            deleted: false,
            revision: 1,
            hash_version: "sonamu-c14n-v1",
            projection_hash: "0".repeat(64),
          },
          doc: { body: "다른 내용" },
        },
      ],
      WORKER_QUERY,
    );
    expect(seeded.items.map((item) => item.status)).toEqual([201]);
    await kit.write(setup, KEY, ["y", "z"], async (trx) => {
      await kit.upsert(trx, KEY, "y", "와이");
      await kit.upsert(trx, KEY, "z", "제트");
    });

    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events });
    const report = await indexer.drainOnce();
    expect(report).toMatchObject({ claimed: 2, indexed: 1, quarantined: 1, released: 0 });
    expect(events).toContainEqual({
      type: "hash-mismatch",
      targetId: target.targetId,
      documentId: "y",
      revision: 1,
    });
    expect(events.some((event) => event.type === "target-paused")).toBe(false);
    expect(await targetRow(target.targetId)).toMatchObject({ state: "active", pause_reason: null });
    expect(await kit.runtimes()).toEqual([
      expect.objectContaining({
        document_id: "y",
        quarantined_revision: 1,
        attempts: 0,
        last_error: { class: "hash_mismatch", revision: 1 },
      }),
    ]);
    // The target keeps running.
    await kit.write(setup, KEY, ["w"], (trx) => kit.upsert(trx, KEY, "w", "더블유"));
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
    expect(await kit.indexed(target, "w")).toMatchObject({ version: 1 });
  });
});
