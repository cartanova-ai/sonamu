import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  type SearchAdmin,
} from "../../../src/admin";
import { confirmDeselection } from "../../../src/admin/cutover";
import { getSearchAdminInternals } from "../../../src/admin/search-admin";
import { createSearchClient, type SearchClient } from "../../../src/client/search-client";
import { createPostgresCatalogReader, createPostgresSynchronization } from "../../../src/postgres";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { qualified, sql } from "../../helpers/sql";
import { resetSearchSchema } from "../../helpers/test-targets";

/**
 * Cursor issue time and deselection confirmation. The issue time is transaction_timestamp() of the standalone
 * read-head lookup (its Parse time). A lookup that saw the old head started before the cutover committed, so its issue
 * time never exceeds deselect_confirmed_at, which is stamped after commit. It can be later than deselected_at, stamped
 * inside the cutover transaction, which is why the retirement grace period counts from the confirmation.
 * A test trigger parks the real cutover right before its final audit insert.
 */

const h = useIntegrationHarness({ sampleDomain: false });
const KEY = "messages";
// Must match the constant inside the test trigger function.
const GATE_KEY = 7_120_412;
const TIMEOUTS = {
  lockTimeoutMs: 15_000,
  statementTimeoutMs: 20_000,
  idleInTransactionTimeoutMs: 60_000,
  adminLeaseMs: 120_000,
};

const source = new Map<string, { body: string }>();
const documentSchema = z.object({ body: z.string() });
const V1 = createTestDefinition({ key: KEY, schema: documentSchema, documents: () => source });
const V2 = createTestDefinition({
  key: KEY,
  projectionVersion: "2",
  schema: documentSchema,
  documents: () => source,
});

let adminRole: TestRole;
let queryRole: TestRole;
let adminKnex: Knex;
let queryKnex: Knex;
let searchClient: SearchClient;
let admin: SearchAdmin;

function roleUrl(role: TestRole, application: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", `h:${h.id}:${application}`);
  return url.toString();
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  queryRole = await h.createRole("query");
  adminKnex = knexFactory({
    client: "pg",
    connection: roleUrl(adminRole, "admin"),
    pool: { min: 0, max: 4 },
  });
  queryKnex = knexFactory({
    client: "pg",
    connection: roleUrl(queryRole, "query"),
    pool: { min: 0, max: 2 },
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
  await queryKnex?.destroy();
});

beforeEach(async () => {
  source.clear();
  for (let i = 1; i <= 4; i += 1) source.set(`doc-${i}`, { body: `본문 ${i}` });
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], query: [queryRole.name] },
  });
  admin = createSearchAdmin({
    client: searchClient,
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [V1, V2],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: TIMEOUTS,
    // No worker runs here, so pending intents must not block the cutover.
    cutover: { maxPendingDocuments: 1_000_000, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
  });
});

const s = (name: string) => qualified(h.searchSchema, name);

function audit(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "cursor issue time" };
}

function catalog() {
  return createPostgresCatalogReader({
    getPrimaryDatabase: () => queryKnex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
}

async function backfill(buildId: string): Promise<void> {
  for (let step = 0; step < 50; step += 1) {
    if ((await admin.runBackfillPage(buildId, { limit: 10 })).done) return;
  }
  throw new Error("backfill이 끝나지 않았습니다.");
}

/** The first target serves reads and a second-version rebuild has finished its scan. */
async function rebuildReady(): Promise<{ oldTarget: string; buildId: string; newTarget: string }> {
  const first = await admin.beginRebuild({ logicalKey: KEY, fingerprint: V1.fingerprint }, audit());
  await backfill(first.buildId);
  await admin.cutover(first.buildId, audit());
  const second = await admin.beginRebuild(
    { logicalKey: KEY, fingerprint: V2.fingerprint },
    audit(),
  );
  await backfill(second.buildId);
  return {
    oldTarget: first.target.targetId,
    buildId: second.buildId,
    newTarget: second.target.targetId,
  };
}

type Stamps = { deselected_ms: string | null; confirmed_ms: string | null };
async function stamps(
  targetId: string,
): Promise<{ deselected: number | null; confirmed: number | null }> {
  const { rows } = await h.knex.raw<{ rows: Stamps[] }>(
    sql`SELECT (extract(epoch FROM deselected_at) * 1000)::bigint AS deselected_ms,
       (extract(epoch FROM deselect_confirmed_at) * 1000)::bigint AS confirmed_ms
FROM ${s("targets")} WHERE target_id = ?`,
    [targetId],
  );
  const toNumber = (value: string | null) => (value === null ? null : Number(value));
  return { deselected: toNumber(rows[0].deselected_ms), confirmed: toNumber(rows[0].confirmed_ms) };
}

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

/** Test trigger: the cutover's final audit insert waits on advisory lock 7120412. */
async function installCutoverGate(): Promise<void> {
  await h.knex.raw(
    sql`CREATE FUNCTION ${s("test_gate")}() RETURNS trigger LANGUAGE plpgsql AS $gate$
BEGIN
  PERFORM pg_advisory_xact_lock(7120412);
  RETURN NEW;
END
$gate$`,
  );
  await h.knex.raw(
    sql`CREATE TRIGGER cutover_gate BEFORE INSERT ON ${s("admin_operations")}
FOR EACH ROW WHEN (NEW.kind = 'cutover' AND NEW.outcome = 'succeeded') EXECUTE FUNCTION ${s("test_gate")}()`,
  );
}

describe("커서 발급 시각", () => {
  it("cutover 커밋 전에 시작한 조회의 커서 발급 시각은 확정 시각(deselect_confirmed_at)을 넘지 않는다", async () => {
    const ready = await rebuildReady();
    await installCutoverGate();
    const { sessions } = await h.openSessions(["gate"]);
    await sessions.gate.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);
    const pending = admin.cutover(ready.buildId, audit());
    pending.catch(() => {});
    // The cutover has done all its writes and is parked right before commit.
    await waitingPid("admin", sessions.gate.pid);

    const reader = catalog();
    const during = await reader.resolveReadHeads([KEY], { timeoutMs: 10_000 });
    expect(during.heads.get(KEY)?.target?.targetId).toBe(ready.oldTarget);

    await sessions.gate.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);
    await expect(pending).resolves.toMatchObject({
      readTargetId: ready.newTarget,
      previousTargetId: ready.oldTarget,
    });
    const { deselected, confirmed } = await stamps(ready.oldTarget);
    if (deselected === null || confirmed === null)
      throw new Error("해제 시각이나 확정 시각이 없습니다.");
    // A lookup that started after deselected_at still saw the old head, so the grace period must not start there.
    expect(during.cursorIssueMs).toBeGreaterThanOrEqual(deselected);
    // Its issue time is not after the confirmation, so its cursor expires within confirmation + max lifetime.
    expect(during.cursorIssueMs).toBeLessThanOrEqual(confirmed);

    const after = await reader.resolveReadHeads([KEY], { timeoutMs: 10_000 });
    expect(after.heads.get(KEY)?.target?.targetId).toBe(ready.newTarget);
    expect(after.cursorIssueMs).toBeGreaterThanOrEqual(confirmed);
  });

  // node-pg uses the extended protocol: a standalone statement's transaction starts at Parse and its snapshot is taken
  // at Bind. statement_timestamp() is the Execute time and can be later than the snapshot; transaction_timestamp() is
  // the Parse time and cannot. Making Parse wait on a table lock exposes the difference.
  it("커서 발급 시각은 읽기 헤드 조회의 스냅샷보다 늦지 않다: Parse가 잠금을 기다려도 발급 시각은 기다리기 전 시각이다", async () => {
    const ready = await rebuildReady();
    await admin.cutover(ready.buildId, audit());
    const { sessions } = await h.openSessions(["holder"]);
    await sessions.holder.run("BEGIN");
    await sessions.holder.run(sql`LOCK TABLE ${s("read_heads")} IN ACCESS EXCLUSIVE MODE`);
    // If the lookup sees this update, its snapshot was taken after this transaction committed.
    await sessions.holder.run(
      sql`UPDATE ${s("read_heads")} SET generation = generation + 10 WHERE namespace = $1 AND definition = $2`,
      [h.namespace, KEY],
    );
    const before = await sessions.holder.run<{ ms: string }>(
      "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms",
    );
    const pending = catalog().resolveReadHeads([KEY], { timeoutMs: 15_000 });
    pending.catch(() => {});
    // Parse takes AccessShareLock on read_heads and waits for the holder.
    await waitingPid("query", sessions.holder.pid);
    // Let database time pass during the wait; middle is earlier than the commit.
    const middle = await sessions.holder.run<{ ms: string }>(
      "SELECT pg_sleep(0.2), (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms",
    );
    await sessions.holder.run("COMMIT");
    const result = await pending;
    const head = result.heads.get(KEY);
    expect(head?.target?.targetId).toBe(ready.newTarget);
    // The snapshot sees the holder's commit: 2 from two cutovers, plus 10.
    expect(head?.readGeneration).toBe(12);
    // issue time <= middle < commit <= snapshot; statement_timestamp() would fail this check.
    expect(result.cursorIssueMs).toBeGreaterThanOrEqual(Number(before.rows[0].ms));
    expect(result.cursorIssueMs).toBeLessThan(Number(middle.rows[0].ms));
    // The database time is taken after the wait (the later value is the safe one for expiry); millisecond rounding
    // allows equality.
    expect(result.databaseNowMs).toBeGreaterThanOrEqual(Number(middle.rows[0].ms));
  });

  it("cutover 전에 고정한 대상은 cutover 뒤에도 같은 대상으로 조회되고 다른 인덱스로 옮겨가지 않는다", async () => {
    const ready = await rebuildReady();
    const reader = catalog();
    const issued = await reader.resolveReadHeads([KEY], { timeoutMs: 10_000 });
    const pinned = issued.heads.get(KEY)?.target;
    expect(pinned?.targetId).toBe(ready.oldTarget);
    await admin.cutover(ready.buildId, audit());

    // A continuation resolves the pinned old target; same epoch, no rebuild, usable during the grace period.
    const resolved = await reader.resolveTarget(ready.oldTarget, { timeoutMs: 10_000 });
    expect(resolved.rebuildRequired).toBe(false);
    expect(resolved.target).toMatchObject({
      targetId: ready.oldTarget,
      physicalIndex: pinned?.physicalIndex,
      state: "active",
    });
    expect(resolved.target?.captureEpoch).toBe(resolved.target?.currentCaptureEpoch);
    const fresh = await reader.resolveReadHeads([KEY], { timeoutMs: 10_000 });
    expect(fresh.heads.get(KEY)?.target?.targetId).toBe(ready.newTarget);
  });
});

describe("확정 시각", () => {
  it("커밋 뒤 확정 시각 기록이 실패해도 cutover는 성공하고, 확정 시각은 나중에 confirmDeselection이 찍는다", async () => {
    const ready = await rebuildReady();
    // Fails only the confirmation stamp: the same state as a process dying between commit and confirmation.
    await h.knex.raw(
      sql`CREATE FUNCTION ${s("test_fail")}() RETURNS trigger LANGUAGE plpgsql AS $fail$
BEGIN
  RAISE EXCEPTION 'test: confirmation failure';
END
$fail$`,
    );
    await h.knex.raw(
      sql`CREATE TRIGGER fail_confirm BEFORE UPDATE ON ${s("targets")}
FOR EACH ROW WHEN (OLD.deselect_confirmed_at IS NULL AND NEW.deselect_confirmed_at IS NOT NULL)
EXECUTE FUNCTION ${s("test_fail")}()`,
    );
    await expect(admin.cutover(ready.buildId, audit())).resolves.toMatchObject({
      readTargetId: ready.newTarget,
    });
    const committed = await stamps(ready.oldTarget);
    expect(committed.deselected).not.toBeNull();
    expect(committed.confirmed).toBeNull();

    await h.knex.raw(sql`DROP TRIGGER fail_confirm ON ${s("targets")}`);
    const { store } = getSearchAdminInternals(admin);
    const stamped = await confirmDeselection(store, ready.oldTarget);
    expect(stamped).toBeInstanceOf(Date);
    const confirmed = await stamps(ready.oldTarget);
    expect(confirmed.confirmed).not.toBeNull();
    expect(confirmed.confirmed ?? 0).toBeGreaterThanOrEqual(committed.deselected ?? 0);
    // Idempotent: an existing stamp is kept.
    expect(await confirmDeselection(store, ready.oldTarget)).toBeNull();
    expect((await stamps(ready.oldTarget)).confirmed).toBe(confirmed.confirmed);
  });
});
