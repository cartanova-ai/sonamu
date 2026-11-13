import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type IndexerEvent } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { sendBulk } from "../helpers/opensearch-ops";
import { qualified, sql } from "../helpers/sql";
import { outcomeSum, useWorkerFixture, waitFor, type WorkerSetup } from "../helpers/worker-fixture";

/**
 * A same-revision document indexed under another hash_version is a deployment condition, not poison: it is released
 * without budget on every attempt until a newer revision (or a rebuild) overwrites it.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const WORKER_QUERY = {
  require_alias: "true",
  filter_path: "errors,items.*._id,items.*.status,items.*._version,items.*.error.type",
};
const OLD_HASH_VERSION = "sonamu-c14n-v0";

function targetOf(setup: WorkerSetup, key: string) {
  const target = setup.targets.get(key);
  if (target === undefined) throw new Error(`대상 ${key}가 없습니다.`);
  return target;
}

const metaSchema = z.object({
  _version: z.number(),
  _source: z.object({ sonamu_meta: z.object({ hash_version: z.string(), revision: z.number() }) }),
});

async function indexedMeta(index: string, id: string) {
  const response = await h.opensearch.get({ index, id, realtime: true });
  const parsed = metaSchema.parse(response.body);
  return { version: parsed._version, ...parsed._source.sonamu_meta };
}

describe("정규화기 업그레이드", () => {
  it("hash_version이 다른 워커는 옛 대상을 claim하지 않는다", async () => {
    const setup = await kit.setUp({ keys: ["legacy", "current"] });
    const legacy = targetOf(setup, "legacy");
    const current = targetOf(setup, "current");
    await h.knex.raw(
      sql`UPDATE ${qualified(h.searchSchema, "targets")} SET hash_version = ? WHERE target_id = ?`,
      [OLD_HASH_VERSION, legacy.targetId],
    );
    for (const key of ["legacy", "current"]) {
      await kit.write(setup, key, ["a", "b"], async (trx) => {
        await kit.upsert(trx, key, "a", `${key} a`);
        await kit.upsert(trx, key, "b", `${key} b`);
      });
    }
    const { indexer } = kit.indexer(setup);
    const report = await indexer.drainOnce();
    expect(report).toMatchObject({
      claimed: 2,
      indexed: 2,
      unsupportedTargets: [legacy.targetId],
    });
    expect(outcomeSum(report)).toBe(report.claimed);
    // The unsupported target's deliveries are untouched: no lease, no runtime row, still active.
    expect((await kit.intents()).map((row) => [row.target_id, row.document_id])).toEqual([
      [legacy.targetId, "a"],
      [legacy.targetId, "b"],
    ]);
    expect(await kit.runtimes()).toEqual([]);
    const { rows } = await h.knex.raw<{ rows: { state: string; pause_reason: unknown }[] }>(
      sql`SELECT state, pause_reason FROM ${qualified(h.searchSchema, "targets")} WHERE target_id = ?`,
      [legacy.targetId],
    );
    expect(rows).toEqual([{ state: "active", pause_reason: null }]);
    expect(await kit.indexed(legacy, "a")).toBeNull();
    expect(await kit.indexed(current, "a")).toMatchObject({ version: 1 });
    expect(await indexer.drainOnce()).toMatchObject({
      claimed: 0,
      unsupportedTargets: [legacy.targetId],
    });
  });

  it("hash_version 불일치는 격리가 아니라 보류로 처리된다", async () => {
    const setup = await kit.setUp({ keys: ["notes"] });
    const target = targetOf(setup, "notes");
    // An older canonicalizer already indexed revision 1.
    const seeded = await sendBulk(
      h.opensearch,
      target.writeAlias,
      [
        { index: { _id: "y", version: 1, version_type: "external" } },
        {
          sonamu_meta: {
            deleted: false,
            revision: 1,
            hash_version: OLD_HASH_VERSION,
            projection_hash: "0".repeat(64),
          },
          doc: { body: "와이" },
        },
      ],
      WORKER_QUERY,
    );
    expect(seeded.items.map((item) => item.status)).toEqual([201]);
    await kit.write(setup, "notes", ["y"], (trx) => kit.upsert(trx, "notes", "y", "와이"));

    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events });
    // Each resend gets 409 with an equal version and another hash_version: released without budget.
    let attempts = 0;
    await waitFor("여러 번의 재시도", async () => {
      const report = await indexer.drainOnce();
      expect(report).toMatchObject({ quarantined: 0, retried: 0, superseded: 0, indexed: 0 });
      attempts += report.released;
      return attempts >= 4;
    });
    expect(
      events
        .filter((event) => event.type === "hash-version-mismatch")
        .map((event) => event.documentId),
    ).toEqual(["y", "y", "y", "y"]);
    expect(
      events.some((event) => event.type === "quarantined" || event.type === "hash-mismatch"),
    ).toBe(false);
    expect(await kit.runtimes()).toEqual([
      expect.objectContaining({
        document_id: "y",
        attempts: 0,
        retry_age_ms: 0,
        failure_revision: 0,
        quarantined_revision: null,
        applied_revision: 0,
        lease_token: null,
        last_error: { class: "hash_version_mismatch", revision: 1 },
      }),
    ]);
    expect((await kit.intents()).map((row) => row.document_id)).toEqual(["y"]);
    expect(await indexedMeta(target.physicalIndex, "y")).toEqual({
      version: 1,
      revision: 1,
      hash_version: OLD_HASH_VERSION,
    });

    // Re-marking the document indexes revision 2 with the current canonicalizer.
    await kit.write(setup, "notes", ["y"], (trx) => kit.upsert(trx, "notes", "y", "와이 2"));
    await waitFor("리비전 2 색인", async () => {
      await indexer.drainOnce();
      return (await kit.intents()).length === 0;
    });
    expect(await indexedMeta(target.physicalIndex, "y")).toEqual({
      version: 2,
      revision: 2,
      hash_version: "sonamu-c14n-v1",
    });
    expect(await kit.runtimes()).toEqual([]);
  });
});
