import { type Knex } from "knex";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type ChatMessageDocument,
  chatMessagesSearch,
} from "../../examples/search/chat-messages.definition";
import { type SearchAdmin } from "../../src/admin";
import { indexMetaSchema } from "../../src/admin/remote-schemas";
import { readSearchIndexMeta } from "../../src/definition/envelope";
import { SearchCursorExpired, SearchRebuildRequired, SearchStoreMismatch } from "../../src/errors";
import { createPostgresSynchronization, type SearchIndexer } from "../../src/postgres";
import { type SearchCandidates } from "../../src/query/search-queries";
import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import {
  backfillAndCutover,
  copyByTemplate,
  databaseUrl,
  drainUntilIdle,
  expectRemoteOperationsRefused,
  expectWorkerRefused,
  markNote,
  notesDefinition,
  openStore,
  prepareNotesSource,
  remoteAdminOperations,
  reserveDatabase,
  storeIdOf,
  targetRowsOf,
} from "../helpers/copied-database";
import { useIntegrationHarness } from "../helpers/harness";
import { aliasExists, indexExists } from "../helpers/opensearch-ops";
import {
  audit,
  LONG_LIFETIMES,
  rejectionOf,
  SIGNING_KEY,
  useReadPathFixture,
} from "../helpers/read-path-fixture";
import { identifier, qualified, sql, tokenList } from "../helpers/sql";

/**
 * The restore runbook is an order of existing operations: suspendCapture, resumeCaptureForRebuild, backfill, the
 * worker, cutover. The test restores a real earlier state: both schemas (tables and sequence values) are copied in one
 * repeatable read transaction, later changes are indexed, then both schemas are put back, as a pg_dump or PITR restore
 * would (ledger, intents, targets, read heads and sequences all go back) while the index stays ahead.
 *
 * The copied-database case attaches a real TEMPLATE copy to the same OpenSearch cluster.
 */

const h = useIntegrationHarness({ sampleDomain: true });
const rp = useReadPathFixture(h);
const KEY = chatMessagesSearch.key;
const DEFINITIONS = [chatMessagesSearch];

interface Snapshot {
  tables: { schema: string; table: string; copy: string }[];
  sequences: { name: string; lastValue: string; isCalled: boolean }[];
  copySchema: string;
}

async function takeSnapshot(): Promise<Snapshot> {
  const copySchema = `snap_${h.id}`;
  await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(copySchema)} CASCADE`);
  h.onCleanup(async () => {
    await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(copySchema)} CASCADE`);
  });
  return h.knex.transaction(
    async (trx) => {
      await trx.raw(sql`CREATE SCHEMA ${identifier(copySchema)}`);
      const { rows } = await trx.raw<{ rows: { schema: string; table: string }[] }>(
        "SELECT schemaname AS schema, tablename AS table FROM pg_tables WHERE schemaname IN (?, ?) ORDER BY 1, 2",
        [h.searchSchema, h.appSchema],
      );
      const tables = rows.map((row) => ({ ...row, copy: `${row.schema}__${row.table}` }));
      for (const table of tables) {
        await trx.raw(
          sql`CREATE TABLE ${qualified(copySchema, table.copy)} AS TABLE ${qualified(table.schema, table.table)}`,
        );
      }
      const sequenceRows = await trx.raw<{ rows: { schema: string; name: string }[] }>(
        "SELECT schemaname AS schema, sequencename AS name FROM pg_sequences WHERE schemaname IN (?, ?)",
        [h.searchSchema, h.appSchema],
      );
      const sequences: Snapshot["sequences"] = [];
      for (const sequence of sequenceRows.rows) {
        const token = qualified(sequence.schema, sequence.name);
        const state = await trx.raw<{ rows: { last_value: string; is_called: boolean }[] }>(
          sql`SELECT last_value, is_called FROM ${token}`,
        );
        sequences.push({
          name: token.toSql(),
          lastValue: state.rows[0].last_value,
          isCalled: state.rows[0].is_called,
        });
      }
      return { tables, sequences, copySchema };
    },
    { isolationLevel: "repeatable read" },
  );
}

/** Puts both schemas back with FK triggers off, as restore tools do, sequences included. */
async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  await h.knex.transaction(async (trx) => {
    await trx.raw("SET LOCAL session_replication_role = replica");
    await trx.raw(
      sql`TRUNCATE ${tokenList(snapshot.tables.map((t) => qualified(t.schema, t.table)))}`,
    );
    for (const table of snapshot.tables) {
      await trx.raw(
        sql`INSERT INTO ${qualified(table.schema, table.table)} OVERRIDING SYSTEM VALUE SELECT * FROM ${qualified(snapshot.copySchema, table.copy)}`,
      );
    }
    for (const sequence of snapshot.sequences) {
      await trx.raw(sql`SELECT setval(?::regclass, ?::bigint, ?)`, [
        sequence.name,
        sequence.lastValue,
        sequence.isCalled,
      ]);
    }
  });
}

const hitSchema = z.looseObject({
  _id: z.string(),
  _version: z.number().optional(),
  _source: z
    .object({
      sonamu_meta: z.looseObject({ deleted: z.boolean() }),
      doc: z.looseObject({ body: z.string() }).optional(),
    })
    .optional(),
});

/** Every document of the index as id -> "version:state:body". */
async function indexState(physicalIndex: string): Promise<Record<string, string>> {
  await h.opensearch.indices.refresh({ index: physicalIndex });
  const response = await h.opensearch.search({
    index: physicalIndex,
    body: { query: { match_all: {} }, size: 1_000, version: true },
  });
  const hits = z.object({ hits: z.object({ hits: z.array(hitSchema) }) }).parse(response.body);
  return Object.fromEntries(
    hits.hits.hits
      .filter((hit) => hit._id !== FENCE_DOCUMENT_ID)
      .map((hit) => [
        hit._id,
        `${hit._version}:${hit._source?.sonamu_meta.deleted === true ? "deleted" : "present"}:${hit._source?.doc?.body ?? ""}`,
      ]),
  );
}

async function ledger(schema = h.searchSchema, db: Knex = h.knex): Promise<Record<string, number>> {
  const { rows } = await db.raw<{ rows: { document_id: string; revision: string }[] }>(
    sql`SELECT document_id, revision FROM ${qualified(schema, "documents")}`,
  );
  return Object.fromEntries(rows.map((row) => [row.document_id, Number(row.revision)]));
}

async function drainAll(
  indexer: SearchIndexer,
): Promise<{ indexed: number; quarantined: number; released: number }> {
  const total = { indexed: 0, quarantined: 0, released: 0 };
  for (let round = 0; round < 60; round += 1) {
    const report = await indexer.drainOnce();
    total.indexed += report.indexed;
    total.quarantined += report.quarantined;
    total.released += report.released;
    if (report.cooldownRemainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, report.cooldownRemainingMs));
      continue;
    }
    if (report.claimed === 0) return total;
  }
  throw new Error("drain이 끝나지 않았습니다.");
}

function queryHandle() {
  return rp.queries<ChatMessageDocument>({
    logicalKey: KEY,
    supportedFingerprints: [chatMessagesSearch.fingerprint],
    limits: {
      maxPageSize: 100,
      timeoutMs: LONG_LIFETIMES.maxSearchLifetimeMs,
      maxSearchLifetimeMs: LONG_LIFETIMES.maxSearchLifetimeMs,
      maxCursorLifetimeMs: LONG_LIFETIMES.maxCursorLifetimeMs,
      maxPitKeepAliveMs: LONG_LIFETIMES.maxPitKeepAliveMs,
    },
    cursor: { signingKeys: [SIGNING_KEY] },
    policy: { sourceIncludes: ["body"] },
  });
}

const ALL = { query: { match_all: {} }, _source: true, size: 100 } as const;
const PAGE = {
  query: { match_all: {} },
  _source: true,
  size: 2,
  sort: [{ "doc.updated_at": "asc" as const }],
};

function served(page: SearchCandidates<ChatMessageDocument>): Record<string, string> {
  return Object.fromEntries(page.hits.map((hit) => [hit.id, hit.source?.body ?? ""]));
}

describe("원본 복원 runbook", () => {
  it("복원 뒤 색인이 앞서 있어도 suspend → resume → backfill → cutover가 복원된 내용으로 새 대상을 만들고, 그동안 옛 대상을 서빙하지 않으며 커서를 무효로 한다", async () => {
    await rp.reset();
    const alice = (await h.sample.createUser("alice")).id;
    const room = (await h.sample.createRoom("일반")).id;
    const ids: string[] = [];
    for (let i = 1; i <= 4; i += 1) {
      ids.push(
        (await h.sample.sendMessage({ roomId: room, authorId: alice, body: `원본 ${i}` })).id,
      );
    }
    const admin: SearchAdmin = rp.admin(DEFINITIONS);
    const indexer = rp.indexer(DEFINITIONS);
    const first = await rp.serve(admin, DEFINITIONS, chatMessagesSearch);
    const oldIndex = first.target.physicalIndex;
    const sync = createPostgresSynchronization({
      getPrimaryDatabase: () => rp.captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await sync.initialize();
    const write = <T>(markIds: string[], mutate: (trx: Knex.Transaction) => Promise<T>) =>
      rp.captureKnex.transaction(async (trx) => {
        await mutate(trx);
        return sync.markChanged(trx, KEY, markIds);
      });

    const snapshot = await takeSnapshot();
    const restoredLedger = await ledger();
    const [m1, m2] = ids;

    // After the restore point: an edit, a delete and a new message, all marked and indexed.
    await write([m1], (trx) => h.sample.editMessage(m1, "복원 뒤 수정", trx));
    await write([m2], (trx) => h.sample.deleteMessage(m2, trx));
    const later = await h.sample.sendMessage(
      { roomId: room, authorId: alice, body: "복원 뒤 새 글" },
      rp.captureKnex,
    );
    await write([later.id], async () => {});
    expect((await drainAll(indexer)).indexed).toBe(3);
    const q = queryHandle();
    const paged = await q.queries.search({ body: PAGE, paginate: {} });
    const cursor = paged.nextCursor ?? "";
    expect(cursor).not.toBe("");

    // Restore: source, ledger, intents, targets and sequences go back; the index stays ahead.
    await restoreSnapshot(snapshot);
    expect(await ledger()).toEqual(restoredLedger);
    expect((await h.sample.findMessage(m1))?.body).toBe("원본 1");
    expect(await h.sample.findMessage(m2)).not.toBeNull();
    expect(await h.sample.findMessage(later.id)).toBeNull();

    // Nothing notices: the target stays active and search keeps serving stale content.
    await rp.refresh();
    const inspection = await admin.inspect(KEY);
    expect(inspection.targets.map((target) => [target.targetId, target.state])).toEqual([
      [first.target.targetId, "active"],
    ]);
    expect(served(await q.queries.search({ body: ALL }))).toEqual({
      [m1]: "복원 뒤 수정",
      [ids[2]]: "원본 3",
      [ids[3]]: "원본 4",
      [later.id]: "복원 뒤 새 글",
    });
    // The rolled-back sequence hands a new message the same id: ledger revision 1 against an indexed version 1 with
    // another body. The worker cannot see a restore and quarantines that one document as a hash mismatch.
    const reused = await h.sample.sendMessage(
      { roomId: room, authorId: alice, body: "복원 뒤 다시 쓴 글" },
      rp.captureKnex,
    );
    expect(reused.id).toBe(later.id);
    await write([reused.id], async () => {});
    expect(await drainAll(indexer)).toMatchObject({ indexed: 0, quarantined: 1 });
    expect((await admin.inspect(KEY)).targets[0]?.state).toBe("active");
    const frozenOld = await indexState(oldIndex);

    // Suspend: from now on the old target is not served and old cursors are unusable.
    await admin.suspendCapture(KEY, audit("restore"));
    expect(await rejectionOf(q.queries.search({ body: ALL }))).toBeInstanceOf(
      SearchRebuildRequired,
    );
    expect(await rejectionOf(q.queries.search({ body: PAGE, cursor }))).toBeInstanceOf(
      SearchRebuildRequired,
    );
    expect(await write([m1], async () => {})).toBe("suspended");

    // A new target at a new epoch, backfilled from the restored source, then the worker and cutover.
    const build = await admin.resumeCaptureForRebuild(KEY, audit("restore"));
    expect(build.kind).toBe("resume");
    expect(await rejectionOf(q.queries.search({ body: ALL }))).toBeInstanceOf(
      SearchRebuildRequired,
    );
    await rp.backfill(admin, build.buildId);
    await rp.drain(indexer);
    await rp.refresh();
    expect((await admin.inspectBuild(build.buildId)).eligibleForCutover).toBe(true);
    const result = await admin.cutover(build.buildId, audit("restore"));
    expect(result.readTargetId).toBe(build.target.targetId);
    expect(build.target.physicalIndex).not.toBe(oldIndex);

    // Every document is indexed with its restored content (and later writes) at its ledger revision.
    const currentLedger = await ledger();
    const expected: Record<string, string> = {};
    for (const message of await h.sample
      .from("messages")
      .orderBy("id")
      .select<{ id: string; body: string }[]>("id", "body")) {
      expected[message.id] = `${currentLedger[message.id]}:present:${message.body}`;
    }
    expect(expected[m1]).toBe("1:present:원본 1");
    expect(expected[m2]).toBe("1:present:원본 2");
    expect(expected[reused.id]).toBe("1:present:복원 뒤 다시 쓴 글");
    expect(await indexState(build.target.physicalIndex)).toEqual(expected);
    expect(served(await q.queries.search({ body: ALL }))).toEqual(
      Object.fromEntries(
        Object.entries(expected).map(([id, value]) => [id, value.split(":").slice(2).join(":")]),
      ),
    );
    // Nothing was written to the old target after the suspend.
    expect(await indexState(oldIndex)).toEqual(frozenOld);
    const expired = await rejectionOf(q.queries.search({ body: PAGE, cursor }));
    expect(expired).toBeInstanceOf(SearchCursorExpired);
    expect(expired.details?.reason).toBe("capture-epoch-invalidated");
  });
});

async function waitForConfirmedGrace(db: Knex, targetId: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await db.raw<{ rows: { elapsed: boolean | null }[] }>(
      "SELECT clock_timestamp() >= deselect_confirmed_at + interval '600 milliseconds' AS elapsed FROM sonamu_search.targets WHERE target_id = ?",
      [targetId],
    );
    if (rows[0]?.elapsed === true) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("읽기 유예가 지나지 않았습니다.");
}

describe("같은 OpenSearch 클러스터에 붙은 복사된 데이터베이스", () => {
  it("TEMPLATE 복사본은 채택 전에는 원격 작업을 하나도 하지 못하고, 손으로 바꾼 store_id로도 원본의 alias를 지우지 못하며, 채택 뒤에도 원본의 대상을 건드리지 못한다", async () => {
    const source = await prepareNotesSource(h, "osrc", () => audit("copy"));
    const copy = reserveDatabase(h, "ocopy");
    await copyByTemplate(h, source.name, copy);
    const original = openStore(h, databaseUrl(h, source.name), source.docs);
    const sourceStoreId = await storeIdOf(original.knex);
    await original.sync.initialize();
    const copyDocs = new Map([...source.docs].map(([id, doc]) => [id, { ...doc }]));
    const replica = openStore(h, databaseUrl(h, copy), copyDocs, {
      expectedStoreId: sourceStoreId,
    });
    let sourceIndexBefore = await indexState(source.served.physicalIndex);
    try {
      // Same store_id and target rows: initialize with the source's expected store_id passes and capture continues.
      expect(await storeIdOf(replica.knex)).toBe(sourceStoreId);
      expect(await targetRowsOf(replica.knex)).toEqual(await targetRowsOf(original.knex));
      await expect(replica.sync.initialize()).resolves.toEqual({ storeId: sourceStoreId });
      expect(await markNote(replica, "a", "복사본이 쓴 a")).toBe("recorded");
      const mapping = await h.opensearch.indices.getMapping({ index: source.served.physicalIndex });
      expect(
        readSearchIndexMeta(
          indexMetaSchema.parse(mapping.body)[source.served.physicalIndex]?.mappings,
        )?.store_id,
      ).toBe(sourceStoreId);

      // The origin differs, so every remote admin operation is refused before any request.
      const operations = remoteAdminOperations(replica.admin, {
        targetId: source.served.targetId,
        fingerprint: notesDefinition().fingerprint,
        plan: source.plan,
        audit: () => audit("copy"),
      });
      await expectRemoteOperationsRefused(replica, operations, "store-origin-changed");
      // The copy's worker sends nothing to the source's index either.
      await expectWorkerRefused(replica, "store-origin-changed");
      expect(await markNote(original, "b", "원본이 쓴 b")).toBe("recorded");
      expect((await drainUntilIdle(original.indexer)).indexed).toBe(1);
      // From here on only the source's writes change the source index.
      sourceIndexBefore = await indexState(source.served.physicalIndex);
      expect(sourceIndexBefore.b).toBe("2:present:원본이 쓴 b");

      // Rotating store_id by hand and wrongly calling confirmStoreOwnership still cannot retire the source target:
      // its index _meta.store_id differs, so retirement refuses before removing the alias.
      await replica.knex.raw("UPDATE sonamu_search.store SET store_id = gen_random_uuid()");
      await replica.knex.raw(
        "UPDATE sonamu_search.indexes SET store_id = (SELECT store_id FROM sonamu_search.store)",
      );
      const rotated = openStore(h, databaseUrl(h, copy), copyDocs);
      try {
        await rotated.admin.confirmStoreOwnership({ confirmSoleOwner: true }, audit("copy"));
        await rotated.admin.suspendCapture("notes", audit("copy"));
        const resumed = await rotated.admin.resumeCaptureForRebuild("notes", audit("copy"));
        expect(resumed.target.physicalIndex).not.toBe(source.served.physicalIndex);
        await backfillAndCutover(h, rotated, resumed.buildId, audit("copy"));
        await waitForConfirmedGrace(rotated.knex, source.served.targetId);
        rotated.requests.splice(0);
        const refused = await rejectionOf(
          rotated.admin.retireTarget(source.served.targetId, audit("copy")),
        );
        expect(refused).toBeInstanceOf(SearchStoreMismatch);
        expect(refused.details?.reason).toBe("remote-store-mismatch");
        // The fence check passes because the copied fence row equals the source's; the _meta check refuses.
        expect(rotated.requests.map((request) => request.method)).toEqual(["POST", "GET"]);
        expect(await aliasExists(h.opensearch, source.served.writeAlias)).toBe(true);
        expect(await indexExists(h.opensearch, source.served.physicalIndex)).toBe(true);
      } finally {
        await rotated.close();
      }

      // Adoption detaches every inherited target, including those created after the rotation; none can be retired.
      const adopter = openStore(h, databaseUrl(h, copy), copyDocs);
      try {
        const adopted = await adopter.admin.adoptCopiedStore({ confirmCopy: true }, audit("copy"));
        expect(adopted.detachedTargets.map((target) => target.targetId)).toContain(
          source.served.targetId,
        );
        adopter.requests.splice(0);
        const detached = await rejectionOf(
          adopter.admin.retireTarget(source.served.targetId, audit("copy")),
        );
        expect(detached.details?.reason).toBe("target-detached");
        expect(adopter.requests).toEqual([]);
      } finally {
        await adopter.close();
      }

      // The source keeps its alias, index, documents, read head and binding.
      expect(await aliasExists(h.opensearch, source.served.writeAlias)).toBe(true);
      expect(await indexState(source.served.physicalIndex)).toEqual(sourceIndexBefore);
      const { rows } = await original.knex.raw<{ rows: { target_id: string }[] }>(
        "SELECT target_id::text FROM sonamu_search.read_heads WHERE definition = 'notes'",
      );
      expect(rows[0]?.target_id).toBe(source.served.targetId);
      expect((await original.admin.inspect("notes")).binding.originMatches).toBe(true);
    } finally {
      await replica.close();
      await original.close();
    }
  });
});
