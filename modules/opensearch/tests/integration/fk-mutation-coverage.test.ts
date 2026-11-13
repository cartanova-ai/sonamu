import { type Knex } from "knex";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type ChatMessageDocument,
  chatMessageDocumentSchema,
  chatMessagesSearch,
} from "../../examples/search/chat-messages.definition";
import { type SearchAdmin } from "../../src/admin";
import { defineSearch, type DocumentId } from "../../src/definition/define-search";
import { SearchConfigurationError, SearchTimeout, SearchUnavailable } from "../../src/errors";
import {
  createPostgresSynchronization,
  type PostgresSynchronization,
  type SearchIndexer,
} from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { audit, rejectionOf, useReadPathFixture } from "../helpers/read-path-fixture";
import { qualified, sql } from "../helpers/sql";
import { backendPid, waitForLockWait } from "../helpers/test-targets";
import { WRITER_ISOLATIONS, type WriterIsolation } from "../helpers/worker-fixture";

/**
 * Rows changed by the database itself (ON DELETE CASCADE, ON DELETE SET NULL) bypass model methods, so the index stays
 * stale unless the application marks them. The supported repairs are marking before the delete in the same
 * transaction and a later remark. The definition wraps the examples/ chat definition so tests can fail a projection
 * or interrupt a scan.
 */

const h = useIntegrationHarness({ sampleDomain: true });
const rp = useReadPathFixture(h);
const KEY = chatMessagesSearch.key;

const poisoned = new Set<string>();
let onScan: (() => void) | undefined;

const messages = defineSearch<ChatMessageDocument>({
  key: KEY,
  projectionVersion: "1",
  schema: chatMessageDocumentSchema,
  settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
  mappings: chatMessagesSearch.mappings,
  requiredPlugins: [],
  async materialize(context, ids) {
    if (ids.some((id) => poisoned.has(id))) throw new Error("시험용 projection 실패");
    return chatMessagesSearch.materialize(context, ids);
  },
  captureScanBoundary: (context) => chatMessagesSearch.captureScanBoundary(context),
  async scanSourceIds(context, page) {
    const result = await chatMessagesSearch.scanSourceIds(context, page);
    onScan?.();
    return result;
  },
});

const s = (name: string) => qualified(h.searchSchema, name);

interface Setup {
  admin: SearchAdmin;
  indexer: SearchIndexer;
  sync: PostgresSynchronization;
  targetId: string;
  physicalIndex: string;
  room: string;
  otherRoom: string;
  alice: string;
  bob: string;
  /** Message ids in room, ascending. */
  ids: string[];
}

async function setUp(count = 5): Promise<Setup> {
  await rp.reset();
  poisoned.clear();
  onScan = undefined;
  const alice = (await h.sample.createUser("alice")).id;
  const bob = (await h.sample.createUser("bob")).id;
  const room = (await h.sample.createRoom("일반")).id;
  const otherRoom = (await h.sample.createRoom("잡담")).id;
  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const author = i % 2 === 0 ? bob : alice;
    ids.push(
      (await h.sample.sendMessage({ roomId: room, authorId: author, body: `메시지 ${i}` })).id,
    );
  }
  await h.sample.sendMessage({ roomId: otherRoom, authorId: alice, body: "다른 방" });
  const admin = rp.admin([messages]);
  const indexer = rp.indexer([messages]);
  const build = await rp.serve(admin, [messages], messages);
  const sync = createPostgresSynchronization({
    getPrimaryDatabase: () => rp.captureKnex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
  return {
    admin,
    indexer,
    sync,
    targetId: build.target.targetId,
    physicalIndex: build.target.physicalIndex,
    room,
    otherRoom,
    alice,
    bob,
    ids,
  };
}

async function write(
  setup: Setup,
  ids: readonly string[],
  mutate: (trx: Knex.Transaction) => Promise<void>,
  isolation: WriterIsolation = "read committed",
): Promise<void> {
  await rp.captureKnex.transaction(
    async (trx) => {
      await mutate(trx);
      expect(await setup.sync.markChanged(trx, KEY, ids)).toBe("recorded");
    },
    { isolationLevel: isolation },
  );
}

const indexedSchema = z.looseObject({
  found: z.boolean(),
  _version: z.number().optional(),
  _source: z
    .object({
      sonamu_meta: z.looseObject({ deleted: z.boolean(), revision: z.number() }),
      doc: z.looseObject({ body: z.string(), author_id: z.string().nullable() }).optional(),
    })
    .optional(),
});

interface Indexed {
  version: number;
  deleted: boolean;
  body: string | null;
  author: string | null;
}

async function indexed(physicalIndex: string, id: DocumentId): Promise<Indexed | null> {
  const response = await h.opensearch.get(
    { index: physicalIndex, id, realtime: true },
    { ignore: [404] },
  );
  const parsed = indexedSchema.parse(response.body);
  if (!parsed.found || parsed._source === undefined) return null;
  return {
    version: parsed._version ?? 0,
    deleted: parsed._source.sonamu_meta.deleted,
    body: parsed._source.doc?.body ?? null,
    author: parsed._source.doc?.author_id ?? null,
  };
}

async function ledger(): Promise<Record<string, number>> {
  const { rows } = await h.knex.raw<{ rows: { document_id: string; revision: string }[] }>(
    sql`SELECT document_id, revision FROM ${s("documents")} ORDER BY document_id COLLATE "C"`,
  );
  return Object.fromEntries(rows.map((row) => [row.document_id, Number(row.revision)]));
}

async function intents(targetId: string): Promise<Record<string, number>> {
  const { rows } = await h.knex.raw<{ rows: { document_id: string; desired_revision: string }[] }>(
    sql`SELECT document_id, desired_revision FROM ${s("deliveries")} WHERE target_id = ? ORDER BY document_id COLLATE "C"`,
    [targetId],
  );
  return Object.fromEntries(rows.map((row) => [row.document_id, Number(row.desired_revision)]));
}

/** Unlike rp.drain, tolerates quarantines and returns their count. */
async function drainAll(indexer: SearchIndexer): Promise<{ indexed: number; quarantined: number }> {
  let total = { indexed: 0, quarantined: 0 };
  for (let round = 0; round < 60; round += 1) {
    const report = await indexer.drainOnce();
    expect(report.leaseLost).toBe(0);
    total = {
      indexed: total.indexed + report.indexed,
      quarantined: total.quarantined + report.quarantined,
    };
    if (report.cooldownRemainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, report.cooldownRemainingMs));
      continue;
    }
    if (report.claimed === 0) return total;
  }
  throw new Error("drain이 끝나지 않았습니다.");
}

async function leaseToken(): Promise<string | null> {
  const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
    sql`SELECT lease_token::text AS lease_token FROM ${s("admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0]?.lease_token ?? null;
}

/** Finds the admin backend waiting on a lock held by blocker. */
async function waitingAdminPid(blocker: number): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await h.knex.raw<{ rows: { pid: number; blocking: number[] }[] }>(
      "SELECT pid, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE application_name = ? AND wait_event_type = 'Lock'",
      [`h:${h.id}:admin`],
    );
    const found = rows.find((row) => row.blocking.includes(blocker));
    if (found !== undefined) return found.pid;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`관리 백엔드가 PID ${blocker} 때문에 기다리는 것이 관찰되지 않았습니다.`);
}

describe("FK 변경 범위: 데이터베이스가 직접 바꾼 행", () => {
  it("표시를 빠뜨린 CASCADE 삭제는 색인을 낡게 두고, 원장 스캔 remark로 tombstone이 된다", async () => {
    const setup = await setUp();
    await rp.captureKnex.transaction(async (trx) => {
      expect(await h.sample.deleteRoom(setup.room, trx)).toBe(true);
    });
    expect(await drainAll(setup.indexer)).toEqual({ indexed: 0, quarantined: 0 });
    for (const id of setup.ids) {
      expect(await indexed(setup.physicalIndex, id)).toMatchObject({ version: 1, deleted: false });
    }
    // A source scan cannot find rows that no longer exist.
    const bySource = await setup.admin.remark(
      { logicalKey: KEY, scan: "source", limit: 100 },
      audit("source"),
    );
    expect(bySource.marked).toBe(1);
    await drainAll(setup.indexer);
    expect(await indexed(setup.physicalIndex, setup.ids[0])).toMatchObject({ deleted: false });
    // The ledger survives a hard delete, so a ledger scan finds them.
    const byLedger = await setup.admin.remark(
      { logicalKey: KEY, scan: "ledger", limit: 100 },
      audit("ledger"),
    );
    expect(byLedger).toEqual({ marked: setup.ids.length + 1, result: "recorded" });
    await drainAll(setup.indexer);
    for (const id of setup.ids) {
      expect(await indexed(setup.physicalIndex, id)).toMatchObject({ version: 2, deleted: true });
    }
  });
});

describe("remark: 범위, 경계, 취소", () => {
  it("ID remark는 그 문서만 새 리비전으로 예약하고, 그 리비전이 OpenSearch에서 이긴다", async () => {
    const setup = await setUp();
    const target = setup.ids[2];
    await h.knex.raw(
      sql`UPDATE ${qualified(h.appSchema, "messages")} SET body = '고친 본문' WHERE id = ?`,
      [target],
    );
    const before = await ledger();
    const report = await setup.admin.remark({ logicalKey: KEY, ids: [target] }, audit());
    expect(report).toEqual({ marked: 1, result: "recorded" });
    expect(await ledger()).toEqual({ ...before, [target]: before[target] + 1 });
    expect(await intents(setup.targetId)).toEqual({ [target]: before[target] + 1 });
    await drainAll(setup.indexer);
    expect(await indexed(setup.physicalIndex, target)).toEqual({
      version: before[target] + 1,
      deleted: false,
      body: "고친 본문",
      author: setup.alice,
    });
    const { rows } = await h.knex.raw<{ rows: { kind: string; outcome: string }[] }>(
      sql`SELECT kind, outcome FROM ${s("admin_operations")} WHERE kind = 'remark'`,
    );
    expect(rows).toEqual([{ kind: "remark", outcome: "succeeded" }]);
    expect(await leaseToken()).toBeNull();
  });

  it("source 스캔 페이지는 limit만큼 표시하고 next로 이어지며, through를 넘지 않는다", async () => {
    const setup = await setUp(5);
    const first = await setup.admin.remark({ logicalKey: KEY, scan: "source", limit: 2 }, audit());
    expect(first).toEqual({ marked: 2, result: "recorded", next: setup.ids[1] });
    expect(Object.keys(await intents(setup.targetId)).toSorted()).toEqual(
      setup.ids.slice(0, 2).toSorted(),
    );
    const second = await setup.admin.remark(
      { logicalKey: KEY, scan: "source", after: first.next, through: setup.ids[2], limit: 2 },
      audit(),
    );
    expect(second).toEqual({ marked: 1, result: "recorded" });
    expect(Object.keys(await intents(setup.targetId)).toSorted()).toEqual(
      setup.ids.slice(0, 3).toSorted(),
    );
    await drainAll(setup.indexer);
    for (const id of setup.ids.slice(0, 3)) {
      expect((await indexed(setup.physicalIndex, id))?.version).toBe(2);
    }
    for (const id of setup.ids.slice(3)) {
      expect((await indexed(setup.physicalIndex, id))?.version).toBe(1);
    }
  });

  it("원장 스캔은 through 상한을 지켜, 스캔 중에 생긴 문서가 있어도 끝난다", async () => {
    const setup = await setUp(4);
    const all = Object.keys(await ledger());
    // The ledger is in byte order; mark a new document that sorts after the bound.
    const through = all.at(-1) ?? "";
    let added = "";
    for (;;) {
      const message = await h.sample.sendMessage({
        roomId: setup.room,
        authorId: setup.alice,
        body: "새 글",
      });
      await write(setup, [message.id], async () => {});
      if (Buffer.compare(Buffer.from(message.id), Buffer.from(through)) > 0) {
        added = message.id;
        break;
      }
    }
    await drainAll(setup.indexer);
    const before = await ledger();
    const seen: string[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const report = await setup.admin.remark(
        after === undefined
          ? { logicalKey: KEY, scan: "ledger", through, limit: 2 }
          : { logicalKey: KEY, scan: "ledger", after, through, limit: 2 },
        audit(),
      );
      expect(report.result).toBe("recorded");
      const changed = Object.entries(await ledger()).filter(
        ([id, revision]) => revision > (before[id] ?? 0) && !seen.includes(id),
      );
      seen.push(...changed.map(([id]) => id));
      if (report.next === undefined) break;
      after = report.next;
    }
    expect(seen.toSorted()).toEqual(all.toSorted());
    expect(seen).not.toContain(added);
    expect((await ledger())[added]).toBe(before[added]);
  });

  it("범위가 너무 크거나 비면 아무것도 쓰지 않고 거부한다", async () => {
    const setup = await setUp(1);
    const before = await ledger();
    for (const input of [
      { logicalKey: KEY, scan: "ledger" as const, limit: 10_001 },
      { logicalKey: KEY, scan: "ledger" as const, limit: 0 },
      { logicalKey: KEY, ids: [] },
    ]) {
      const error = await rejectionOf(setup.admin.remark(input, audit()));
      expect(error).toBeInstanceOf(SearchConfigurationError);
      expect(error.details?.reason).toBe("invalid-repair-argument");
    }
    expect(await ledger()).toEqual(before);
  });

  it("취소하면 쓰기 전에 멈추고 임대를 반납한다 (시작 전, 스캔 직후)", async () => {
    const setup = await setUp(3);
    const before = await ledger();
    const early = new AbortController();
    early.abort();
    const first = await rejectionOf(
      setup.admin.remark(
        { logicalKey: KEY, scan: "source", limit: 10, signal: early.signal },
        audit(),
      ),
    );
    expect(first).toBeInstanceOf(SearchTimeout);
    expect(first.details?.reason).toBe("aborted");
    const late = new AbortController();
    onScan = () => late.abort();
    const second = await rejectionOf(
      setup.admin.remark(
        { logicalKey: KEY, scan: "source", limit: 10, signal: late.signal },
        audit(),
      ),
    );
    expect(second).toBeInstanceOf(SearchTimeout);
    expect(await ledger()).toEqual(before);
    expect(await intents(setup.targetId)).toEqual({});
    expect(await leaseToken()).toBeNull();
  });
});

describe("remark와 같은 문서를 표시하는 도메인 쓰기", () => {
  it("쓰기가 원장 행을 잡고 있으면 remark가 기다렸다가 그 위에 리비전을 더한다", async () => {
    const setup = await setUp(2);
    const id = setup.ids[0];
    const base = (await ledger())[id];
    const writer = await rp.captureKnex.transaction({ isolationLevel: "read committed" });
    try {
      await h.sample.editMessage(id, "쓰기가 먼저", writer);
      expect(await setup.sync.markChanged(writer, KEY, [id])).toBe("recorded");
      const writerPid = await backendPid(writer);
      const pending = setup.admin.remark({ logicalKey: KEY, ids: [id] }, audit());
      pending.catch(() => {});
      await waitingAdminPid(writerPid);
      await writer.commit();
      await expect(pending).resolves.toEqual({ marked: 1, result: "recorded" });
    } finally {
      if (!writer.isCompleted()) await writer.rollback();
    }
    expect((await ledger())[id]).toBe(base + 2);
    await drainAll(setup.indexer);
    expect(await indexed(setup.physicalIndex, id)).toMatchObject({
      version: base + 2,
      body: "쓰기가 먼저",
    });
  });

  // A repeatable read writer takes a distinct branch here: it fails with 40001 and retries.
  it.each(WRITER_ISOLATIONS)(
    "remark가 원장 행을 잡고 있으면 %s 쓰기가 기다리고, 새 리비전은 잃지 않으며 교착하지 않는다",
    async (isolation) => {
      const setup = await setUp(2);
      const id = setup.ids[0];
      // With the undrained intent row held by another session, remark stops after locking the ledger row.
      await write(setup, [id], (trx) => h.sample.editMessage(id, "기준", trx).then(() => {}));
      const base = (await ledger())[id];
      const { sessions } = await h.openSessions(["holder"]);
      await sessions.holder.run("BEGIN");
      await sessions.holder.run(
        sql`SELECT 1 FROM ${s("deliveries")} WHERE target_id = $1 AND document_id = $2 FOR UPDATE`,
        [setup.targetId, id],
      );
      const pending = setup.admin.remark({ logicalKey: KEY, ids: [id] }, audit());
      pending.catch(() => {});
      const adminPid = await waitingAdminPid(sessions.holder.pid);
      const writer = await rp.captureKnex.transaction({ isolationLevel: isolation });
      let attempt: Promise<string>;
      try {
        // The writer's snapshot is taken here, before remark commits.
        await h.sample.editMessage(id, "쓰기가 나중", writer);
        const writerPid = await backendPid(writer);
        attempt = setup.sync.markChanged(writer, KEY, [id]);
        attempt.catch(() => {});
        await waitForLockWait(h.knex, writerPid, adminPid);
        await sessions.holder.run("ROLLBACK");
        await expect(pending).resolves.toEqual({ marked: 1, result: "recorded" });
        if (isolation === "read committed") {
          await expect(attempt).resolves.toBe("recorded");
          await writer.commit();
        } else {
          // A revision committed after the snapshot gives 40001, not a deadlock (40P01).
          const error = await rejectionOf(attempt);
          expect(error).toBeInstanceOf(SearchUnavailable);
          expect(error.retryable).toBe(true);
          expect(error.details?.sqlstate).toBe("40001");
          await writer.rollback();
          await write(
            setup,
            [id],
            (trx) => h.sample.editMessage(id, "쓰기가 나중", trx).then(() => {}),
            isolation,
          );
        }
      } finally {
        if (!writer.isCompleted()) await writer.rollback();
      }
      expect((await ledger())[id]).toBe(base + 2);
      await drainAll(setup.indexer);
      expect(await indexed(setup.physicalIndex, id)).toMatchObject({
        version: base + 2,
        body: "쓰기가 나중",
      });
    },
  );
});

describe("retryQuarantined", () => {
  interface RuntimeRow {
    document_id: string;
    intent_id: string;
    applied_revision: number;
    attempts: number;
    retry_age_ms: number;
    failure_revision: number;
    quarantined_revision: number | null;
    available_revision: number;
    lease_token: string | null;
    last_error: unknown;
  }
  async function runtimes(targetId: string): Promise<RuntimeRow[]> {
    const { rows } = await h.knex.raw<{ rows: RuntimeRow[] }>(
      sql`SELECT document_id, intent_id::text, applied_revision::int, attempts, retry_age_ms::int, failure_revision::int,
       quarantined_revision::int, available_revision::int, lease_token::text, last_error
FROM ${s("delivery_runtime")} WHERE target_id = ? ORDER BY document_id COLLATE "C"`,
      [targetId],
    );
    return rows;
  }
  async function intentRows(targetId: string) {
    const { rows } = await h.knex.raw<{ rows: unknown[] }>(
      sql`SELECT document_id, intent_id::text, desired_revision::int, enqueued_at FROM ${s("deliveries")} WHERE target_id = ? ORDER BY document_id COLLATE "C"`,
      [targetId],
    );
    return rows;
  }

  /** Quarantines p and q through failing projections and leaves ok pending. */
  async function quarantine(setup: Setup) {
    const [p, q, ok] = setup.ids;
    poisoned.add(p);
    poisoned.add(q);
    await write(setup, [p, q], async (trx) => {
      await h.sample.editMessage(p, "격리될 p", trx);
      await h.sample.editMessage(q, "격리될 q", trx);
    });
    expect((await drainAll(setup.indexer)).quarantined).toBe(2);
    // A runtime row of an unquarantined document that already has an applied revision.
    await write(setup, [ok], (trx) => h.sample.editMessage(ok, "대기", trx).then(() => {}));
    return { p, q, ok };
  }

  it("격리를 풀고 예산을 새로 줄 뿐 intent, 원장, 다른 문서는 바꾸지 않는다", async () => {
    const setup = await setUp(3);
    const { p, q, ok } = await quarantine(setup);
    const runtimeBefore = await runtimes(setup.targetId);
    expect(
      runtimeBefore
        .filter((row) => row.quarantined_revision !== null)
        .map((row) => row.document_id)
        .toSorted(),
    ).toEqual([p, q].toSorted());
    const intentsBefore = await intentRows(setup.targetId);
    const ledgerBefore = await ledger();
    poisoned.clear();
    // Quarantined documents are not resent on their own once the cause is gone.
    const idle = await setup.indexer.drainOnce();
    expect(idle).toMatchObject({ claimed: 1, indexed: 1 });
    expect(await indexed(setup.physicalIndex, ok)).toMatchObject({ body: "대기" });
    const runtimeIdle = await runtimes(setup.targetId);

    const report = await setup.admin.retryQuarantined(
      { targetId: setup.targetId, limit: 10 },
      audit(),
    );
    expect(report).toEqual({ released: 2 });
    expect(await intentRows(setup.targetId)).toEqual(
      intentsBefore.filter(
        (row) => z.looseObject({ document_id: z.string() }).parse(row).document_id !== ok,
      ),
    );
    expect(await ledger()).toEqual(ledgerBefore);
    const after = await runtimes(setup.targetId);
    for (const row of after) {
      const old = runtimeIdle.find(
        (candidate) =>
          candidate.document_id === row.document_id && candidate.intent_id === row.intent_id,
      );
      if (row.document_id === p || row.document_id === q) {
        expect(row).toEqual({
          ...old,
          attempts: 0,
          retry_age_ms: 0,
          failure_revision: 0,
          quarantined_revision: null,
          available_revision: 0,
          last_error: null,
        });
      } else {
        expect(row).toEqual(old);
      }
    }
    expect(await drainAll(setup.indexer)).toEqual({ indexed: 2, quarantined: 0 });
    expect(await indexed(setup.physicalIndex, p)).toMatchObject({
      version: ledgerBefore[p],
      body: "격리될 p",
    });
    expect(await indexed(setup.physicalIndex, q)).toMatchObject({
      version: ledgerBefore[q],
      body: "격리될 q",
    });
  });

  it("documentIds와 limit으로 범위를 좁힌다", async () => {
    const setup = await setUp(3);
    const { p, q } = await quarantine(setup);
    poisoned.clear();
    expect(
      await setup.admin.retryQuarantined(
        { targetId: setup.targetId, limit: 10, documentIds: [q] },
        audit(),
      ),
    ).toEqual({ released: 1 });
    const quarantined = (await runtimes(setup.targetId))
      .filter((row) => row.quarantined_revision !== null)
      .map((row) => row.document_id);
    expect(quarantined).toEqual([p]);
    expect(
      await setup.admin.retryQuarantined({ targetId: setup.targetId, limit: 1 }, audit()),
    ).toEqual({ released: 1 });
    expect(
      await setup.admin.retryQuarantined({ targetId: setup.targetId, limit: 1 }, audit()),
    ).toEqual({ released: 0 });
    const error = await rejectionOf(
      setup.admin.retryQuarantined({ targetId: setup.targetId, limit: 10_001 }, audit()),
    );
    expect(error).toBeInstanceOf(SearchConfigurationError);
  });
});
