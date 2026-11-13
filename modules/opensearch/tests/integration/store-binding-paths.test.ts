import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import {
  type CopyStore,
  databaseUrl,
  dropDatabase,
  dumpDatabase,
  drainUntilIdle,
  expectRemoteOperationsRefused,
  expectWorkerRefused,
  markNote,
  NOTES_KEY,
  type NotesSource,
  notesDefinition,
  openStore,
  prepareNotesSource,
  remoteAdminOperations,
  restoreDatabase,
  storeIdOf,
} from "../helpers/copied-database";
import { useIntegrationHarness } from "../helpers/harness";
import { audit } from "../helpers/read-path-fixture";
import { identifier, sql } from "../helpers/sql";

/**
 * Restoring a dump into a dropped and recreated database of the same name changes the database OID, so the origin no
 * longer matches: a false positive that stops only remote work until confirmStoreOwnership.
 */

const h = useIntegrationHarness({ sampleDomain: false });

function operationsFor(store: CopyStore, source: NotesSource) {
  return remoteAdminOperations(store.admin, {
    targetId: source.served.targetId,
    fingerprint: notesDefinition().fingerprint,
    plan: source.plan,
    audit: () => audit("copy"),
  });
}

async function databaseOid(db: Knex): Promise<string> {
  const { rows } = await db.raw<{ rows: { oid: string }[] }>(
    "SELECT oid::text FROM pg_database WHERE datname = current_database()",
  );
  return rows[0]?.oid ?? "";
}

describe("저장소 결속: 같은 이름으로 다시 만든 데이터베이스", () => {
  it("같은 이름으로 지우고 다시 만들어 복원하면 원점 불일치(거짓 양성)가 되어 원격 작업만 멈추고, confirmStoreOwnership 뒤에 다시 열린다", async () => {
    const source = await prepareNotesSource(h, "p4src", () => audit("source"));
    const file = await dumpDatabase(h, source.name);
    const before = openStore(h, databaseUrl(h, source.name), source.docs);
    const storeId = await storeIdOf(before.knex);
    const oldOid = await databaseOid(before.knex);
    await before.close();
    await dropDatabase(h, source.name);
    await h.knex.raw(sql`CREATE DATABASE ${identifier(source.name)}`);
    await restoreDatabase(h, file, source.name);
    const restored = openStore(h, databaseUrl(h, source.name), source.docs);
    try {
      expect(await storeIdOf(restored.knex)).toBe(storeId);
      expect(await databaseOid(restored.knex)).not.toBe(oldOid);
      expect((await restored.admin.inspect(NOTES_KEY)).binding.originMatches).toBe(false);
      await restored.sync.initialize();
      expect(await markNote(restored, "a", "복원 뒤 a")).toBe("recorded");
      await expectRemoteOperationsRefused(
        restored,
        operationsFor(restored, source),
        "store-origin-changed",
      );
      expect(await markNote(restored, "b", "거부 중 b")).toBe("recorded");
      await expectWorkerRefused(restored, "store-origin-changed");

      const confirmed = await restored.admin.confirmStoreOwnership(
        { confirmSoleOwner: true },
        audit("restore"),
      );
      // Takes over the serving target's fence at an epoch above the one the original worker created.
      expect(confirmed.storeId).toBe(storeId);
      expect(confirmed.fencedTargets.map((fenced) => fenced.targetId)).toEqual([
        source.served.targetId,
      ]);
      expect((await restored.admin.inspect(NOTES_KEY)).binding).toMatchObject({
        storeId,
        originMatches: true,
      });
      // The worker reopens and indexes the marks queued while it refused.
      expect((await drainUntilIdle(restored.indexer)).indexed).toBe(2);
      // Remote work reopens: creating a new target sends requests and succeeds.
      restored.requests.splice(0);
      const rebuild = await restored.admin.beginRebuild(
        { logicalKey: NOTES_KEY, fingerprint: notesDefinition().fingerprint },
        audit("restore"),
      );
      expect(restored.requests.length).toBeGreaterThan(0);
      expect(rebuild.target.targetId).not.toBe(source.served.targetId);
    } finally {
      await restored.close();
    }
  });
});
