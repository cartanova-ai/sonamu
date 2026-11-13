import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import {
  type CopyStore,
  databaseUrl,
  drainUntilIdle,
  markNote,
  type NotesSource,
  openStore,
  prepareNotesSource,
} from "../helpers/copied-database";
import { useIntegrationHarness } from "../helpers/harness";
import { audit } from "../helpers/read-path-fixture";
import { type PhysicalTwin, startPhysicalTwin } from "../helpers/twin-database";

/**
 * A pg_basebackup copy is byte-identical down to store_id, origin, targets and fence rows, so it passes the binding
 * check. When both sides write to the same remote target, whoever advances the fence first wins and the other sees
 * itself behind on its next check and stops sending to that target. The fence detects rather than gates, so writes
 * between an advance and its detection (at most one renewal interval) are not prevented.
 */

const h = useIntegrationHarness();

async function documentIds(physicalIndex: string): Promise<string[]> {
  await h.opensearch.indices.refresh({ index: physicalIndex });
  const response = await h.opensearch.search({
    index: physicalIndex,
    body: { query: { match_all: {} }, size: 100, _source: false, sort: [{ _id: "asc" }] },
  });
  return z
    .object({ hits: z.object({ hits: z.array(z.looseObject({ _id: z.string() })) }) })
    .parse(response.body)
    .hits.hits.map((hit) => hit._id)
    .filter((id) => id !== FENCE_DOCUMENT_ID);
}

async function fenceRow(store: CopyStore, targetId: string) {
  const { rows } = await store.knex.raw<{ rows: { epoch: number; lost: boolean }[] }>(
    "SELECT epoch::int AS epoch, lost_at IS NOT NULL AS lost FROM sonamu_search.target_fences WHERE target_id = ?",
    [targetId],
  );
  return rows[0];
}

/** Backdates renewed_at so this store's next drain renews (advances) the fence without waiting. */
async function makeRenewalDue(store: CopyStore): Promise<void> {
  await store.knex.raw(
    "UPDATE sonamu_search.target_fences SET renewed_at = renewed_at - interval '1 hour'",
  );
}

async function twinPair(label: string): Promise<{
  source: NotesSource;
  twin: PhysicalTwin;
  original: CopyStore;
  copy: CopyStore;
}> {
  const source = await prepareNotesSource(h, label, () => audit("twin"));
  const twin = await startPhysicalTwin(h);
  const original = openStore(h, databaseUrl(h, source.name), source.docs);
  const copy = openStore(h, twin.url(source.name), new Map(source.docs));
  await original.sync.initialize();
  await copy.sync.initialize();
  return { source, twin, original, copy };
}

describe("물리 복사본의 fence 탐지", () => {
  // A real pg_basebackup copy takes about 40 s; slow CI runners need more than the default 60 s.
  const TWIN_TEST_TIMEOUT_MS = 180_000;

  it(
    "복사본이 fence를 전진시키면 원본 워커는 다음 확인에서 behind로 그 대상을 잃고, 문서를 보내지 않고 예산도 쓰지 않는다",
    async () => {
      const { source, twin, original, copy } = await twinPair("tw1");
      try {
        const shared = await fenceRow(original, source.served.targetId);
        expect(shared?.epoch).toBeGreaterThanOrEqual(1);
        expect(await fenceRow(copy, source.served.targetId)).toEqual(shared);

        // The copy renews first and advances the remote fence; its own write is indexed.
        await makeRenewalDue(copy);
        expect(await markNote(copy, "c", "복사본 c")).toBe("recorded");
        expect((await drainUntilIdle(copy.indexer)).indexed).toBe(1);
        const advanced = await fenceRow(copy, source.served.targetId);
        expect(advanced?.epoch).toBe((shared?.epoch ?? 0) + 1);

        // The source worker, a new process that checks before its first send, sees the remote epoch ahead.
        expect(await markNote(original, "d", "원본 d")).toBe("recorded");
        const report = await original.indexer.drainOnce();
        expect(report).toMatchObject({ indexed: 0, quarantined: 0, retried: 0 });
        expect(original.events).toContainEqual({
          type: "target-fence-lost",
          targetId: source.served.targetId,
          class: "behind",
          localEpoch: shared?.epoch,
          remoteEpoch: advanced?.epoch,
        });
        expect(await fenceRow(original, source.served.targetId)).toMatchObject({ lost: true });
        // d was not sent and spent no budget.
        expect(await documentIds(source.served.physicalIndex)).toEqual(["a", "b", "c"]);
        const { rows } = await original.knex.raw<{ rows: { attempts: number }[] }>(
          "SELECT attempts FROM sonamu_search.delivery_runtime",
        );
        expect(rows.every((row) => row.attempts === 0)).toBe(true);
        // No hot retry: the next drain sends no bulk to that target either.
        const bulksBefore = original.requests.filter((r) => r.path.endsWith("/_bulk")).length;
        await original.indexer.drainOnce();
        expect(original.requests.filter((r) => r.path.endsWith("/_bulk")).length).toBe(bulksBefore);
        // inspect reports the target's fence as lost.
        const inspection = await original.admin.inspect("notes");
        expect(inspection.targets[0]?.fence).toMatchObject({ lost: true });
        process.stdout.write(`[twin] pg_basebackup + start: ${twin.startedInMs}ms\n`);
      } finally {
        await Promise.allSettled([original.close(), copy.close()]);
        await twin.stop();
      }
    },
    TWIN_TEST_TIMEOUT_MS,
  );

  it(
    "복사 뒤 원본이 전진하면 오래된 스냅샷(복사본)의 워커가 behind로 그 대상을 잃는다",
    async () => {
      const { source, twin, original, copy } = await twinPair("tw2");
      try {
        const shared = await fenceRow(original, source.served.targetId);
        await makeRenewalDue(original);
        expect(await markNote(original, "c", "원본 c")).toBe("recorded");
        expect((await drainUntilIdle(original.indexer)).indexed).toBe(1);

        expect(await markNote(copy, "d", "복사본 d")).toBe("recorded");
        expect((await copy.indexer.drainOnce()).indexed).toBe(0);
        expect(copy.events).toContainEqual(
          expect.objectContaining({
            type: "target-fence-lost",
            class: "behind",
            localEpoch: shared?.epoch,
          }),
        );
        expect(await documentIds(source.served.physicalIndex)).toEqual(["a", "b", "c"]);
        expect(await fenceRow(original, source.served.targetId)).toMatchObject({ lost: false });
      } finally {
        await Promise.allSettled([original.close(), copy.close()]);
        await twin.stop();
      }
    },
    TWIN_TEST_TIMEOUT_MS,
  );
});
