import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  type SearchAdmin,
} from "../../src/admin";
import { AdminOperation } from "../../src/admin/admin-lease";
import { applyBackfillPage } from "../../src/admin/builds";
import { getSearchAdminInternals } from "../../src/admin/search-admin";
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import {
  type DefinedSearch,
  defineSearch,
  type DocumentId,
  type Projection,
} from "../../src/definition/define-search";
import { SearchAdminPreconditionFailed, SearchError } from "../../src/errors";
import { createPostgresSynchronization, type PostgresSynchronization } from "../../src/postgres";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../src/testing";
import { type TestRole, useIntegrationHarness } from "../helpers/harness";
import { identifier, qualified, sql } from "../helpers/sql";
import { backendPid, readDeliveries, readLedger, resetSearchSchema } from "../helpers/test-targets";

/**
 * Domain writers (capture role) add, edit and delete documents on both sides of the backfill cursor before, during and
 * after each page while the admin role runs the real backfill. Property: every source row and every ledger document
 * ends with an intent on the new target at exactly the ledger revision. There is no worker, so nothing is applied.
 */

const h = useIntegrationHarness();
const KEY = "messages";
const LOCKS_KEY = "locks";
// Must equal the constant in the test trigger body below.
const GATE_KEY = 7_120_418;
const TIMEOUTS = {
  lockTimeoutMs: 15_000,
  statementTimeoutMs: 20_000,
  idleInTransactionTimeoutMs: 60_000,
  adminLeaseMs: 120_000,
};
const PAGE = 4;

type Isolation = "read committed" | "repeatable read";

/** Runs once between the scan snapshot and the page transaction. */
let afterScan: ((ids: readonly string[]) => Promise<void>) | undefined;

const bodySchema = z.object({ body: z.string() });

function messagesDefinition(version: string): DefinedSearch {
  const messages = () => qualified(h.appSchema, "messages");
  return defineSearch({
    key: KEY,
    projectionVersion: version,
    schema: bodySchema,
    settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    mappings: { properties: { body: { type: "text" } } },
    requiredPlugins: [],
    async materialize(context, ids) {
      const numeric = ids.filter((id) => /^\d{1,18}$/.test(id));
      const { rows } = await context.trx.raw<{ rows: { id: string; body: string }[] }>(
        sql`SELECT id::text AS id, body FROM ${messages()} WHERE id = ANY(?::bigint[])`,
        [numeric],
      );
      const found = new Map(rows.map((row) => [row.id, row.body]));
      return new Map(
        ids.map((id): [DocumentId, Projection<{ body: string }>] => {
          const body = found.get(id);
          return [
            id,
            body === undefined ? { state: "deleted" } : { state: "present", document: { body } },
          ];
        }),
      );
    },
    async captureScanBoundary(context) {
      const { rows } = await context.trx.raw<{ rows: { boundary: string }[] }>(
        sql`SELECT coalesce(max(id), 0)::text AS boundary FROM ${messages()}`,
      );
      return rows[0].boundary;
    },
    async scanSourceIds(context, page) {
      // Numeric order differs from document-id byte order ("10" < "9"), so the page must sort ids itself.
      const { rows } = await context.trx.raw<{ rows: { id: string }[] }>(
        sql`SELECT m.id::text AS id FROM ${messages()} m WHERE m.id > ?::bigint AND m.id <= ?::bigint ORDER BY m.id LIMIT ?`,
        [page.after ?? "0", page.through, page.limit],
      );
      const ids = rows.map((row) => row.id);
      const hook = afterScan;
      afterScan = undefined;
      await hook?.(ids);
      const last = ids.at(-1);
      return ids.length === page.limit && last !== undefined ? { ids, next: last } : { ids };
    },
  });
}

const V1 = messagesDefinition("1");
const V2 = messagesDefinition("2");
/** Scanner returns ids in reverse byte order, to reproduce the page/marker deadlock. */
const LOCKS = createTestDefinition({ key: LOCKS_KEY, schema: bodySchema });
const LOCKS_REVERSED: DefinedSearch = {
  ...LOCKS,
  async captureScanBoundary() {
    return "zz";
  },
  async scanSourceIds() {
    return { ids: ["lock-b", "lock-a"] };
  },
};

let adminRole: TestRole;
let captureRole: TestRole;
let adminKnex: Knex;
let captureKnex: Knex;
let searchClient: SearchClient;
let admin: SearchAdmin;
let sync: PostgresSynchronization;
let roomId: string;

function roleUrl(role: TestRole, application: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", `h:${h.id}:${application}`);
  return url.toString();
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  captureRole = await h.createRole("capture");
  const app = identifier(h.appSchema);
  const roles = [identifier(adminRole.name), identifier(captureRole.name)];
  await h.knex.raw(sql`GRANT USAGE ON SCHEMA ${app} TO ${roles[0]}, ${roles[1]}`);
  await h.knex.raw(sql`GRANT SELECT ON ALL TABLES IN SCHEMA ${app} TO ${roles[0]}`);
  await h.knex.raw(
    sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${app} TO ${roles[1]}`,
  );
  await h.knex.raw(sql`GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${app} TO ${roles[1]}`);
  adminKnex = knexFactory({
    client: "pg",
    connection: roleUrl(adminRole, "admin"),
    pool: { min: 0, max: 4 },
  });
  captureKnex = knexFactory({
    client: "pg",
    connection: roleUrl(captureRole, "capture"),
    pool: { min: 0, max: 6 },
  });
  searchClient = createSearchClient({
    createClient: () => h.opensearch,
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
});

afterAll(async () => {
  await searchClient?.close();
  await adminKnex?.destroy();
  await captureKnex?.destroy();
});

beforeEach(async () => {
  afterScan = undefined;
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], capture: [captureRole.name] },
  });
  admin = createSearchAdmin({
    client: searchClient,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [V1, V2, LOCKS_REVERSED],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: TIMEOUTS,
    // No worker runs, so pending intents must not block the first cutover.
    cutover: { maxPendingDocuments: 1_000_000, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
  sync = createPostgresSynchronization({
    getPrimaryDatabase: () => captureKnex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
  roomId = (await h.sample.createRoom("backfill")).id;
});

function audit(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "backfill race" };
}

const s = (name: string) => qualified(h.searchSchema, name);

/** Retries the whole transaction on 40001, as an application would; returns the number of attempts. */
async function write(
  isolation: Isolation,
  work: (trx: Knex.Transaction) => Promise<string[]>,
): Promise<number> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await captureKnex.transaction(
        async (trx) => {
          const ids = await work(trx);
          if (ids.length > 0) await sync.markChanged(trx, KEY, ids);
        },
        { isolationLevel: isolation },
      );
      return attempt;
    } catch (error) {
      if (!(error instanceof Error) || !isSerializationFailure(error)) throw error;
    }
  }
  throw new Error("직렬화 실패가 계속됐습니다.");
}

const pgCodeSchema = z.object({ code: z.literal("40001") });
function isSerializationFailure(error: Error): boolean {
  if (error instanceof SearchError) return error.details?.sqlstate === "40001";
  return pgCodeSchema.safeParse(error).success;
}

const insert = async (trx: Knex.Transaction, body: string) =>
  (await h.sample.sendMessage({ roomId, authorId: null, body }, trx)).id;
const edit = async (trx: Knex.Transaction, id: string) =>
  (await h.sample.editMessage(id, `수정 ${randomUUID()}`, trx)).id;
const remove = async (trx: Knex.Transaction, id: string) => {
  expect(await h.sample.deleteMessage(id, trx)).toBe(true);
  return id;
};

async function liveIds(): Promise<string[]> {
  const rows = await h.sample.from("messages").orderBy("id").select<{ id: string }[]>("id");
  return rows.map((row) => row.id);
}

/** Waits until the backend with this application_name is waiting on a lock held by blocker. */
async function waitingPid(application: string, blocker: number): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await h.knex.raw<{ rows: { pid: number; blocking: number[] }[] }>(
      "SELECT pid, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE application_name = ? AND wait_event_type = 'Lock'",
      [`h:${h.id}:${application}`],
    );
    const found = rows.find((row) => row.blocking.includes(blocker));
    if (found !== undefined) return found.pid;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(
    `${application} 백엔드가 PID ${blocker} 때문에 기다리는 것이 관찰되지 않았습니다.`,
  );
}

async function buildCursor(buildId: string): Promise<{ cursor: string | null; phase: string }> {
  const { rows } = await h.knex.raw<{ rows: { cursor: string | null; phase: string }[] }>(
    sql`SELECT scan_cursor AS cursor, phase FROM ${s("builds")} WHERE build_id = ?`,
    [buildId],
  );
  return rows[0];
}

async function expectEveryDocumentReachesTarget(targetId: string): Promise<void> {
  const ledger = await readLedger(h);
  const deliveries = await readDeliveries(h);
  const forTarget = Object.fromEntries(
    Object.entries(deliveries)
      .filter(([key]) => key.startsWith(`${targetId}/`))
      .map(([key, revision]) => [key.slice(targetId.length + 1), revision]),
  );
  for (const id of await liveIds()) expect(ledger[id], `원장에 없는 원본 ${id}`).toBeDefined();
  const messageLedger = Object.fromEntries(
    Object.entries(ledger).filter(([id]) => /^\d+$/.test(id)),
  );
  expect(forTarget).toEqual(messageLedger);
}

describe("backfill과 동시 writer", () => {
  // An initial page seeds the ledger rows while a rebuild page finds them, so a repeatable read writer can conflict
  // on different rows per mode; a read committed writer takes the same path in both and runs once.
  const variants = [
    ["rebuild", "read committed"],
    ["initial", "repeatable read"],
    ["rebuild", "repeatable read"],
  ] as const;
  for (const [mode, isolation] of variants) {
    it(`커서 뒤에 새로 들어온 ID도 새 대상에 도달한다 (${mode}, ${isolation})`, async () => {
      for (let i = 1; i <= 14; i += 1)
        await h.sample.sendMessage({ roomId, authorId: null, body: `seed ${i}` });
      let buildId: string;
      let targetId: string;
      if (mode === "rebuild") {
        const first = await admin.beginRebuild(
          { logicalKey: KEY, fingerprint: V1.fingerprint },
          audit(),
        );
        while (!(await admin.runBackfillPage(first.buildId, { limit: 100 })).done);
        await admin.cutover(first.buildId, audit());
        const build = await admin.beginRebuild(
          { logicalKey: KEY, fingerprint: V2.fingerprint },
          audit(),
        );
        expect(build.kind).toBe("rebuild");
        ({ buildId } = build);
        targetId = build.target.targetId;
      } else {
        const build = await admin.beginRebuild(
          { logicalKey: KEY, fingerprint: V1.fingerprint },
          audit(),
        );
        expect(build.kind).toBe("initial");
        ({ buildId } = build);
        targetId = build.target.targetId;
      }
      let ids = await liveIds();

      // Before the scan boundary is captured: these fall inside the boundary.
      await write(isolation, async (trx) => [
        await edit(trx, ids[0]),
        await remove(trx, ids[1]),
        await insert(trx, "before boundary"),
      ]);
      expect((await admin.runBackfillPage(buildId, { limit: PAGE })).phase).toBe("backfilling");
      // After the boundary: new ids beyond it reach the target only through the marker.
      ids = await liveIds();
      await write(isolation, async (trx) => [
        await insert(trx, "after boundary"),
        await edit(trx, ids[9]),
      ]);

      // Between the scan snapshot and the page transaction: change ids in the page, ahead of it, and new ones.
      afterScan = async (page) => {
        const ahead = (await liveIds()).filter((id) => Number(id) > Number(page.at(-1)));
        await write(isolation, async (trx) => [
          await edit(trx, page[0]),
          await remove(trx, page[1]),
          await edit(trx, ahead[0]),
          await insert(trx, "during page 1"),
        ]);
      };
      await admin.runBackfillPage(buildId, { limit: PAGE });
      expect(afterScan).toBeUndefined();

      // Between pages: ids already scanned and ids still ahead.
      let cursor = (await buildCursor(buildId)).cursor;
      ids = await liveIds();
      const behind = ids.filter((id) => Number(id) <= Number(cursor));
      const ahead = ids.filter((id) => Number(id) > Number(cursor));
      await write(isolation, async (trx) => [
        await edit(trx, behind[0]),
        await remove(trx, ahead[2]),
        await insert(trx, "between pages"),
      ]);

      // An uncommitted writer holding a document of the next page makes the page wait for its lock.
      const held = await captureKnex.transaction({ isolationLevel: isolation });
      const heldPid = await backendPid(held);
      const target = await edit(held, ahead[0]);
      await sync.markChanged(held, KEY, [target]);
      const page2 = admin.runBackfillPage(buildId, { limit: PAGE });
      page2.catch(() => {});
      await waitingPid("admin", heldPid);
      await held.commit();
      await page2;

      // A repeatable read writer whose snapshot predates the page commit gets 40001 when it marks a document the
      // page just enqueued, and succeeds on a whole-transaction retry. A read committed writer succeeds at once.
      cursor = (await buildCursor(buildId)).cursor;
      const stale = await captureKnex.transaction({ isolationLevel: isolation });
      await h.sample.count("messages", stale);
      let scanned: readonly string[] = [];
      afterScan = async (page) => {
        scanned = page;
      };
      const enqueuedBefore = await readDeliveries(h);
      await admin.runBackfillPage(buildId, { limit: PAGE });
      // A document this page enqueued for the first time, so its intent row postdates the writer's snapshot.
      const victim = scanned.find((id) => enqueuedBefore[`${targetId}/${id}`] === undefined);
      if (victim === undefined) throw new Error("이 페이지가 새로 예약한 문서가 없습니다.");
      let staleOutcome: "conflict" | "recorded";
      try {
        await edit(stale, victim);
        await sync.markChanged(stale, KEY, [victim]);
        await stale.commit();
        staleOutcome = "recorded";
      } catch (error) {
        await stale.rollback().catch(() => {});
        if (!(error instanceof Error) || !isSerializationFailure(error)) throw error;
        staleOutcome = "conflict";
      }
      if (isolation === "repeatable read") {
        expect(staleOutcome).toBe("conflict");
        expect(await write(isolation, async (trx) => [await edit(trx, victim)])).toBe(1);
      } else {
        expect(staleOutcome).toBe("recorded");
      }

      for (let step = 0; step < 20; step += 1) {
        if ((await admin.runBackfillPage(buildId, { limit: PAGE })).done) break;
      }
      expect(await buildCursor(buildId)).toEqual({ cursor: null, phase: "catching_up" });
      ids = await liveIds();
      await write(isolation, async (trx) => [
        await edit(trx, ids[0]),
        await remove(trx, ids.at(-1) ?? ""),
        await insert(trx, "after scan"),
      ]);
      await expect(admin.runBackfillPage(buildId, { limit: PAGE })).resolves.toMatchObject({
        done: true,
        enqueued: 0,
      });

      await expectEveryDocumentReachesTarget(targetId);
      const inspection = await admin.inspectBuild(buildId);
      expect(inspection.scan.completed).toBe(true);
      expect(inspection.blockers).toEqual([]);
    });
  }
});

describe("페이지 순서와 커서 CAS", () => {
  it("스캐너가 역순으로 돌려준 페이지와 마커가 겹쳐도 교착하지 않는다", async () => {
    const build = await admin.beginRebuild(
      { logicalKey: LOCKS_KEY, fingerprint: LOCKS_REVERSED.fingerprint },
      audit(),
    );
    await admin.runBackfillPage(build.buildId, { limit: PAGE });
    // Test trigger that stops the marker after it inserted lock-a and before lock-b.
    await h.knex.raw(
      sql`CREATE FUNCTION ${s("test_gate")}() RETURNS trigger LANGUAGE plpgsql AS $gate$
BEGIN
  PERFORM pg_advisory_xact_lock(7120418);
  RETURN NEW;
END
$gate$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER gate_lock_b BEFORE INSERT ON ${s("documents")}
FOR EACH ROW WHEN (NEW.document_id = 'lock-b') EXECUTE FUNCTION ${s("test_gate")}()`,
    );
    const { sessions } = await h.openSessions(["gate"]);
    await sessions.gate.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);

    const marker = await captureKnex.transaction();
    const markerPid = await backendPid(marker);
    const marking = sync.markChanged(marker, LOCKS_KEY, ["lock-a", "lock-b"]);
    marking.catch(() => {});
    await waitingPid("capture", sessions.gate.pid);
    // The page locks in byte order, so it waits on the marker's lock-a instead of holding lock-b and waiting for lock-a.
    const page = admin.runBackfillPage(build.buildId, { limit: PAGE });
    page.catch(() => {});
    await waitingPid("admin", markerPid);
    await sessions.gate.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);
    await expect(marking).resolves.toBe("recorded");
    await marker.commit();
    await expect(page).resolves.toMatchObject({ phase: "catching_up", done: true });

    const ledger = await readLedger(h);
    expect(ledger).toEqual({ "lock-a": 1, "lock-b": 1 });
    expect(await readDeliveries(h)).toEqual({
      [`${build.target.targetId}/lock-a`]: 1,
      [`${build.target.targetId}/lock-b`]: 1,
    });
  });

  it("같은 페이지를 두 번 실행해도 커서 CAS로 한 번만 반영되고, 낡은 커서의 페이지는 원장과 intent에 아무것도 쓰지 않는다", async () => {
    for (let i = 1; i <= 6; i += 1)
      await h.sample.sendMessage({ roomId, authorId: null, body: `seed ${i}` });
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await admin.runBackfillPage(build.buildId, { limit: PAGE });
    const { store } = getSearchAdminInternals(admin);
    const operation = new AdminOperation(store, {
      logicalKey: KEY,
      kind: "backfill-page",
      operationId: `op-${randomUUID()}`,
      actor: "tester",
      reason: "cursor compare-and-set",
    });
    await operation.acquire();
    try {
      const page = { buildId: build.buildId, expectedCursor: null, ids: ["2", "1"], next: "2" };
      await expect(applyBackfillPage(operation, page)).resolves.toEqual({
        applied: true,
        enqueued: 2,
      });
      const snapshot = async () =>
        h.knex.raw<{ rows: unknown[] }>(
          sql`SELECT 'd' AS kind, document_id, revision::text AS value, updated_at FROM ${s("documents")}
UNION ALL SELECT 'q', document_id, desired_revision::text || '/' || intent_id::text, updated_at FROM ${s("deliveries")}
ORDER BY 1, 2`,
        );
      const before = (await snapshot()).rows;
      // The cursor is already "2", so the repeat stops at the cursor check and writes nothing.
      await expect(applyBackfillPage(operation, page)).resolves.toEqual({
        applied: false,
        enqueued: 0,
      });
      await expect(
        applyBackfillPage(operation, { ...page, ids: ["5", "6"], next: "6" }),
      ).resolves.toEqual({ applied: false, enqueued: 0 });
      expect((await snapshot()).rows).toEqual(before);
      expect(Object.keys(await readLedger(h))).toEqual(["1", "2"]);
      expect(await buildCursor(build.buildId)).toEqual({ cursor: "2", phase: "backfilling" });
    } finally {
      await operation.release();
    }
  });

  it("커서 CAS가 0행이면 페이지 전체가 롤백되어 아무것도 쓰지 않는다", async () => {
    for (let i = 1; i <= 6; i += 1)
      await h.sample.sendMessage({ roomId, authorId: null, body: `seed ${i}` });
    const build = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await admin.runBackfillPage(build.buildId, { limit: PAGE });
    // Skips only the update that advances the page count, so the initial cursor check passes and the final cursor
    // update matches no row.
    await h.knex.raw(
      sql`CREATE FUNCTION ${s("test_skip")}() RETURNS trigger LANGUAGE plpgsql AS $skip$
BEGIN
  RETURN NULL;
END
$skip$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER skip_cursor BEFORE UPDATE ON ${s("builds")}
FOR EACH ROW WHEN (NEW.scan_pages > OLD.scan_pages) EXECUTE FUNCTION ${s("test_skip")}()`,
    );
    const error = await admin.runBackfillPage(build.buildId, { limit: PAGE }).then(
      () => undefined,
      (thrown: SearchError) => thrown,
    );
    expect(error).toBeInstanceOf(SearchAdminPreconditionFailed);
    if (error instanceof SearchAdminPreconditionFailed) {
      expect(error.details?.reason).toBe("scan-cursor-cas-failed");
    }
    expect(await readLedger(h)).toEqual({});
    expect(await readDeliveries(h)).toEqual({});
    expect(await buildCursor(build.buildId)).toEqual({ cursor: null, phase: "backfilling" });
  });
});
