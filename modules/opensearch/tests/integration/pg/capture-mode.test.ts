import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  type AdminContext,
  applySearchGrants,
  createSearchAdmin,
  type SearchAdmin,
} from "../../../src/admin";
import { createSearchClient } from "../../../src/client/search-client";
import { SearchAdminBusy, type SearchError, SearchUnavailable } from "../../../src/errors";
import {
  createPostgresCatalogReader,
  createPostgresSynchronization,
  type PostgresSynchronization,
} from "../../../src/postgres";
import { createDeliveryStore } from "../../../src/postgres/delivery-store";
import { createFakeOpenSearch, TEST_READ_LIFETIMES } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { identifier, qualified, sql } from "../../helpers/sql";
import {
  createTarget,
  openAdminClient,
  type PreparedTarget,
  readDeliveries,
  readLedger,
  resetSearchSchema,
  type StatementRunner,
  waitForLockWait,
} from "../../helpers/test-targets";

/**
 * Suspending capture. Admin code runs as the admin role, domain writes as the capture role and the delivery store as
 * the worker role. Targets are registered with the test helper and the admin handle gets a fake engine client, so no
 * engine is involved. Races use real sessions and proceed only after pg_stat_activity shows the lock wait.
 */

const h = useIntegrationHarness();
const KEY = "messages";

let adminRole: TestRole;
let captureRole: TestRole;
let workerRole: TestRole;
let queryRole: TestRole;
let fixture: { run: StatementRunner; close(): Promise<void> };
const pools: Knex[] = [];
let adminKnex: Knex;
let captureKnex: Knex;
let workerKnex: Knex;
let queryKnex: Knex;
let sync: PostgresSynchronization;

function rolePool(role: TestRole, application: string, max: number): Knex {
  const url = new URL(role.url);
  url.searchParams.set("application_name", `h:${h.id}:${application}`);
  const pool = knexFactory({ client: "pg", connection: url.toString(), pool: { min: 0, max } });
  pools.push(pool);
  return pool;
}

beforeAll(async () => {
  fixture = await openAdminClient(h);
  adminRole = await h.createRole("admin");
  captureRole = await h.createRole("capture");
  workerRole = await h.createRole("worker");
  queryRole = await h.createRole("query");
  adminKnex = rolePool(adminRole, "admin", 4);
  captureKnex = rolePool(captureRole, "capture", 4);
  workerKnex = rolePool(workerRole, "worker", 2);
  queryKnex = rolePool(queryRole, "query", 2);
  await h.knex.raw(
    sql`CREATE TABLE ${qualified(h.appSchema, "notes")} (id text PRIMARY KEY, body text NOT NULL)`,
  );
  await h.knex.raw(
    sql`GRANT USAGE ON SCHEMA ${identifier(h.appSchema)} TO ${identifier(captureRole.name)}`,
  );
  await h.knex.raw(
    sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ${qualified(h.appSchema, "notes")} TO ${identifier(captureRole.name)}`,
  );
});

afterAll(async () => {
  await Promise.allSettled(pools.map((pool) => pool.destroy()));
  await fixture?.close();
});

const s = (name: string) => qualified(h.searchSchema, name);

function audit(): AdminContext {
  return { operationId: `op-${randomUUID()}`, actor: "tester", reason: "capture-mode" };
}

function adminWith(lockTimeoutMs = 15_000): SearchAdmin {
  return createSearchAdmin({
    client: createSearchClient({
      createClient: () => createFakeOpenSearch().client,
      ownsClient: true,
      requestTimeoutMs: 1_000,
    }),
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: () => adminKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    }),
    definitions: [],
    lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
    timeouts: {
      lockTimeoutMs,
      statementTimeoutMs: 20_000,
      idleInTransactionTimeoutMs: 60_000,
      adminLeaseMs: 120_000,
    },
    cutover: { maxPendingDocuments: 1_000, sampleSize: 0 },
    workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 10_000 },
  });
}

let admin: SearchAdmin;
let target: PreparedTarget;

beforeEach(async () => {
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: {
      admin: [adminRole.name],
      capture: [captureRole.name],
      worker: [workerRole.name],
      query: [queryRole.name],
    },
  });
  target = await createTarget(fixture.run, {
    schema: h.searchSchema,
    namespace: h.namespace,
    logicalKey: KEY,
  });
  sync = createPostgresSynchronization({
    getPrimaryDatabase: () => captureKnex,
    schema: h.searchSchema,
    namespace: h.namespace,
  });
  await sync.initialize();
  admin = adminWith();
});

/** Test double for a cutover: points the read head at the target. */
async function selectHead(targetId: string): Promise<void> {
  await fixture.run(
    sql`UPDATE ${s("read_heads")} SET target_id = $3, generation = generation + 1, rebuild_required = false
WHERE namespace = $1 AND definition = $2`,
    [h.namespace, KEY, targetId],
  );
  await fixture.run(
    sql`UPDATE ${s("targets")} SET selected_at = clock_timestamp() WHERE target_id = $1`,
    [targetId],
  );
}

type IndexState = {
  capture_mode: string;
  capture_epoch: number;
  generation: string;
  read_generation: string;
  rebuild_required: boolean;
  read_target_id: string | null;
};
async function indexState(): Promise<IndexState> {
  const { rows } = await h.knex.raw<{ rows: IndexState[] }>(
    sql`SELECT i.capture_mode, i.capture_epoch, i.generation, h.generation AS read_generation, h.rebuild_required,
       h.target_id::text AS read_target_id
FROM ${s("indexes")} i JOIN ${s("read_heads")} h USING (namespace, definition)
WHERE i.namespace = ? AND i.definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0];
}

type TargetState = {
  state: string;
  write_enabled: boolean;
  deselected: boolean;
  confirmed_after_deselect: boolean | null;
};
async function targetState(targetId: string): Promise<TargetState> {
  const { rows } = await h.knex.raw<{ rows: TargetState[] }>(
    sql`SELECT state, write_enabled, deselected_at IS NOT NULL AS deselected,
       deselect_confirmed_at >= deselected_at AS confirmed_after_deselect
FROM ${s("targets")} WHERE target_id = ?`,
    [targetId],
  );
  return rows[0];
}

async function buildPhases(): Promise<{ phase: string; failure: { code: string } | null }[]> {
  const { rows } = await h.knex.raw<{
    rows: { phase: string; failure: { code: string } | null }[];
  }>(sql`SELECT phase, failure FROM ${s("builds")} ORDER BY created_at`);
  return rows;
}

async function leaseToken(): Promise<string | null> {
  const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
    sql`SELECT lease_token::text AS lease_token FROM ${s("admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0]?.lease_token ?? null;
}

type AuditDetail = Record<string, string | number | boolean | null>;
async function audits(): Promise<{ kind: string; outcome: string; detail: AuditDetail }[]> {
  const { rows } = await h.knex.raw<{
    rows: { kind: string; outcome: string; detail: AuditDetail }[];
  }>(sql`SELECT kind, outcome, detail FROM ${s("admin_operations")} ORDER BY operation_seq`);
  return rows;
}

async function notes(): Promise<string[]> {
  const { rows } = await h.knex.raw<{ rows: { id: string }[] }>(
    sql`SELECT id FROM ${qualified(h.appSchema, "notes")} ORDER BY id`,
  );
  return rows.map((row) => row.id);
}

async function insertNote(trx: Knex.Transaction, id: string): Promise<void> {
  await trx.raw(sql`INSERT INTO ${qualified(h.appSchema, "notes")} (id, body) VALUES (?, ?)`, [
    id,
    `본문 ${id}`,
  ]);
}

async function backendPid(trx: Knex.Transaction): Promise<number> {
  const { rows } = await trx.raw<{ rows: { pid: number }[] }>("SELECT pg_backend_pid() AS pid");
  return rows[0].pid;
}

/** Finds the admin-pool backend that waits on blocker. */
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

async function errorOf(pending: Promise<unknown>): Promise<SearchError> {
  return pending.then(
    () => {
      throw new Error("실패해야 할 호출이 성공했습니다.");
    },
    (error: SearchError) => error,
  );
}

describe("중단은 한 커밋에서 일어난다", () => {
  it("캡처 모드, epoch, generation, 읽기 헤드 준비 상태, 쓰기 대상, 열린 빌드를 한 커밋에서 바꾸고 확정 시각을 찍는다", async () => {
    await selectHead(target.targetId);
    const before = await indexState();
    expect(before).toMatchObject({
      capture_mode: "active",
      capture_epoch: 1,
      rebuild_required: false,
    });
    expect((await buildPhases()).map((row) => row.phase)).toEqual(["created"]);

    await admin.suspendCapture(KEY, audit());

    const after = await indexState();
    expect(after).toMatchObject({
      capture_mode: "suspended",
      capture_epoch: 2,
      rebuild_required: true,
      read_target_id: target.targetId,
    });
    expect(Number(after.generation)).toBe(Number(before.generation) + 1);
    expect(Number(after.read_generation)).toBe(Number(before.read_generation) + 1);
    // The serving target stays active with writes off, and the deselection is confirmed after commit.
    expect(await targetState(target.targetId)).toEqual({
      state: "active",
      write_enabled: false,
      deselected: true,
      confirmed_after_deselect: true,
    });
    expect(await buildPhases()).toEqual([
      { phase: "failed", failure: { code: "capture_epoch_invalidated" } },
    ]);
    expect(await leaseToken()).toBeNull();
    expect(await audits()).toContainEqual(
      expect.objectContaining({
        kind: "suspend",
        outcome: "succeeded",
        detail: expect.objectContaining({ captureEpoch: 2, disabledTargets: 1, failedBuilds: 1 }),
      }),
    );
    const inspection = await admin.inspect(KEY);
    expect(inspection).toMatchObject({
      captureMode: "suspended",
      captureEpoch: 2,
      readHead: { targetId: target.targetId, rebuildRequired: true },
    });
    const reader = createPostgresCatalogReader({
      getPrimaryDatabase: () => queryKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    const heads = await reader.resolveReadHeads([KEY], { timeoutMs: 5_000 });
    expect(heads.heads.get(KEY)).toMatchObject({
      rebuildRequired: true,
      target: { targetId: target.targetId, captureEpoch: 1, currentCaptureEpoch: 2 },
    });
  });

  it("중단 트랜잭션의 한 문장이 잠금 대기 끝에 실패하면 아무것도 바뀌지 않는다", async () => {
    await selectHead(target.targetId);
    const before = await indexState();
    const shortAdmin = adminWith(1_000);
    const { sessions } = await h.openSessions(["holder"]);
    await sessions.holder.run("BEGIN");
    // Holding the build row makes the suspend wait after its earlier statements have already run.
    await sessions.holder.run(sql`SELECT 1 FROM ${s("builds")} FOR UPDATE`);
    const pending = shortAdmin.suspendCapture(KEY, audit());
    pending.catch(() => {});
    await waitingAdminPid(sessions.holder.pid);
    const error = await errorOf(pending);
    await sessions.holder.run("ROLLBACK");
    expect(error).toBeInstanceOf(SearchAdminBusy);
    expect(error.details?.sqlstate).toBe("55P03");
    expect(await indexState()).toEqual(before);
    expect(await targetState(target.targetId)).toMatchObject({
      write_enabled: true,
      deselected: false,
    });
    expect((await buildPhases()).map((row) => row.phase)).toEqual(["created"]);
    expect(await leaseToken()).toBeNull();
  });
});

describe("동시 도메인 쓰기", () => {
  it("중단보다 먼저 장벽을 잡은 마커는 중단을 기다리게 하고, 옛 epoch의 대상에 온전히 기록된다", async () => {
    const trx = await captureKnex.transaction();
    try {
      await insertNote(trx, "before");
      expect(await sync.markChanged(trx, KEY, ["before"])).toBe("recorded");
      const writerPid = await backendPid(trx);
      const pending = admin.suspendCapture(KEY, audit());
      pending.catch(() => {});
      const adminPid = await waitingAdminPid(writerPid);
      await waitForLockWait(h.knex, adminPid, writerPid);
      expect((await indexState()).capture_mode).toBe("active");
      await trx.commit();
      await pending;
    } finally {
      if (!trx.isCompleted()) await trx.rollback();
    }
    expect(await indexState()).toMatchObject({ capture_mode: "suspended", capture_epoch: 2 });
    expect(await notes()).toEqual(["before"]);
    expect(await readLedger(h)).toEqual({ before: 1 });
    expect(await readDeliveries(h)).toEqual({ [`${target.targetId}/before`]: 1 });
  });
});

describe("중단 전에 스냅샷을 잡은 쓰기", () => {
  it("REPEATABLE READ: 중단 전 스냅샷의 마커는 40001로 실패해 도메인 쓰기도 커밋되지 않고, 다시 하면 suspended다", async () => {
    const trx = await captureKnex.transaction({ isolationLevel: "repeatable read" });
    let error: SearchError | undefined;
    try {
      // The snapshot is taken before the suspend.
      await trx.raw(sql`SELECT count(*) FROM ${qualified(h.appSchema, "notes")}`);
      await admin.suspendCapture(KEY, audit());
      await insertNote(trx, "stale");
      error = await errorOf(sync.markChanged(trx, KEY, ["stale"]));
    } finally {
      await trx.rollback().catch(() => {});
    }
    expect(error).toBeInstanceOf(SearchUnavailable);
    expect(error?.details?.sqlstate).toBe("40001");
    expect(error?.retryable).toBe(true);
    expect(await notes()).toEqual([]);
    expect(await readLedger(h)).toEqual({});
    await captureKnex.transaction(
      async (retry) => {
        await insertNote(retry, "stale");
        expect(await sync.markChanged(retry, KEY, ["stale"])).toBe("suspended");
      },
      { isolationLevel: "repeatable read" },
    );
    expect(await notes()).toEqual(["stale"]);
    expect(await readDeliveries(h)).toEqual({});
  });

  it("READ COMMITTED: 중단 전에 시작했지만 장벽을 나중에 잡은 마커는 중단을 보고 suspended를 돌려주고, 원장과 intent는 그대로이며 도메인 쓰기는 커밋된다", async () => {
    const trx = await captureKnex.transaction({ isolationLevel: "read committed" });
    try {
      await insertNote(trx, "late");
      await admin.suspendCapture(KEY, audit());
      expect(await sync.markChanged(trx, KEY, ["late"])).toBe("suspended");
      await trx.commit();
    } finally {
      if (!trx.isCompleted()) await trx.rollback();
    }
    expect(await notes()).toEqual(["late"]);
    expect(await readLedger(h)).toEqual({});
    expect(await readDeliveries(h)).toEqual({});
  });
});

describe("no-op 분기와 임대", () => {
  it("이미 중단된 인덱스를 다시 중단해도 generation이 바뀌지 않는다", async () => {
    await admin.suspendCapture(KEY, audit());
    const first = await indexState();
    // The no-op branch leaves another operation's lease alone.
    const otherToken = randomUUID();
    await fixture.run(
      sql`UPDATE ${s("admin_controls")} SET operation_id = 'op-other', operation_kind = 'other', actor = 'x',
  lease_token = $3::uuid, lease_expires_at = clock_timestamp() + interval '2 minutes'
WHERE namespace = $1 AND definition = $2`,
      [h.namespace, KEY, otherToken],
    );
    await admin.suspendCapture(KEY, audit());
    expect(await indexState()).toEqual(first);
    expect(await leaseToken()).toBe(otherToken);
    const rows = (await audits()).filter((row) => row.kind === "suspend");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      outcome: "succeeded",
      detail: { noop: true, captureEpoch: 2 },
    });
  });

  it("중단은 진행 중인 다른 관리 작업의 임대를 빼앗고, 그 작업의 fenced 기록은 아무것도 쓰지 못한다", async () => {
    const otherToken = randomUUID();
    await fixture.run(
      sql`UPDATE ${s("admin_controls")} SET operation_id = 'op-other', operation_kind = 'other', actor = 'x',
  lease_token = $3::uuid, lease_expires_at = clock_timestamp() + interval '2 minutes'
WHERE namespace = $1 AND definition = $2`,
      [h.namespace, KEY, otherToken],
    );
    await admin.suspendCapture(KEY, audit());
    // The preempted lease is released after commit.
    expect(await leaseToken()).toBeNull();
    // The fence check of the preempted operation finds no row.
    const { rows } = await h.knex.raw<{ rows: unknown[] }>(
      sql`SELECT lease_token FROM ${s("admin_controls")}
WHERE namespace = ? AND definition = ? AND lease_token = ?::uuid AND lease_expires_at > clock_timestamp()
FOR UPDATE`,
      [h.namespace, KEY, otherToken],
    );
    expect(rows).toEqual([]);
  });

  it("다른 작업이 fenced 트랜잭션 안에서 제어 행을 쥐고 있으면 중단은 그 커밋을 기다린 뒤 임대를 빼앗는다", async () => {
    const otherToken = randomUUID();
    await fixture.run(
      sql`UPDATE ${s("admin_controls")} SET operation_id = 'op-other', operation_kind = 'other', actor = 'x',
  lease_token = $3::uuid, lease_expires_at = clock_timestamp() + interval '2 minutes'
WHERE namespace = $1 AND definition = $2`,
      [h.namespace, KEY, otherToken],
    );
    const { sessions } = await h.openSessions(["other"]);
    await sessions.other.run("BEGIN");
    await sessions.other.run(
      sql`SELECT generation FROM ${s("indexes")} WHERE namespace = $1 AND definition = $2 FOR SHARE`,
      [h.namespace, KEY],
    );
    const pending = admin.suspendCapture(KEY, audit());
    pending.catch(() => {});
    // The exclusive barrier waits for the fenced transaction that holds the shared barrier.
    await waitingAdminPid(sessions.other.pid);
    await sessions.other.run("COMMIT");
    await pending;
    expect((await indexState()).capture_mode).toBe("suspended");
    expect(await leaseToken()).toBeNull();
  });
});

describe("worker 역할의 delivery 저장소", () => {
  it("중단 뒤 옛 epoch의 intent는 캐시된 대상 목록으로도 claim되지 않고, 중단 전의 임대는 heartbeat로 연장되지 않는다", async () => {
    await captureKnex.transaction(async (trx) => {
      await insertNote(trx, "a");
      await insertNote(trx, "b");
      expect(await sync.markChanged(trx, KEY, ["a", "b"])).toBe("recorded");
    });
    const store = createDeliveryStore({ schema: h.searchSchema });
    const cached = await store.listClaimableTargets(workerKnex, h.namespace);
    expect(cached.map((row) => row.targetId)).toEqual([target.targetId]);
    const token = randomUUID();
    const claimed = await store.claim(workerKnex, {
      targetIds: [target.targetId],
      limit: 1,
      leaseToken: token,
      leaseMs: 120_000,
    });
    expect(claimed.map((row) => row.documentId)).toEqual(["a"]);

    await admin.suspendCapture(KEY, audit());

    expect(await store.listClaimableTargets(workerKnex, h.namespace)).toEqual([]);
    expect(
      await store.claim(workerKnex, {
        targetIds: cached.map((row) => row.targetId),
        limit: 10,
        leaseToken: randomUUID(),
        leaseMs: 120_000,
      }),
    ).toEqual([]);
    expect(
      await store.heartbeat(workerKnex, {
        leaseToken: token,
        deliveries: claimed,
        leaseMs: 120_000,
      }),
    ).toEqual([]);
    expect(await store.checkTargetEligibility(workerKnex, target.targetId)).toMatchObject({
      eligible: false,
      reason: "write-disabled",
      target: { captureEpoch: 1, currentCaptureEpoch: 2, captureMode: "suspended" },
    });
    // Intents stay on the old target until retirement cleans them up.
    expect(Object.keys(await readDeliveries(h)).toSorted()).toEqual([
      `${target.targetId}/a`,
      `${target.targetId}/b`,
    ]);
  });
});
