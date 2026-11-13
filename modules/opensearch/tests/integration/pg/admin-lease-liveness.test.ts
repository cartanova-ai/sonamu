import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applySearchGrants, createSearchAdmin } from "../../../src/admin";
import {
  type AdminOperationRequest,
  type AdminStore,
  AdminOperation,
  createAdminStore,
  runAdminOperation,
} from "../../../src/admin/admin-lease";
import {
  SearchAdminBusy,
  SearchAdminLeaseLost,
  SearchAdminPreconditionFailed,
  SearchError,
} from "../../../src/errors";
import { createSearchClient } from "../../../src/index";
import { createPostgresSynchronization } from "../../../src/postgres";
import { createFakeOpenSearch } from "../../../src/testing";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { type PgSession } from "../../helpers/pg-sessions";
import { qualified, sql } from "../../helpers/sql";
import {
  clientRunner,
  createTarget,
  type PreparedTarget,
  resetSearchSchema,
  type StatementRunner,
} from "../../helpers/test-targets";

/**
 * Admin lease liveness and release. Admin statements run through the package code on an admin-role pool (not a
 * superuser). The domain marker's barrier lock and the exclusive-lock competitor are separate sessions; order is
 * confirmed through lock waits in pg_stat_activity.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const KEY = "messages";
const TIMEOUTS = {
  lockTimeoutMs: 2_000,
  statementTimeoutMs: 10_000,
  idleInTransactionTimeoutMs: 30_000,
  adminLeaseMs: 60_000,
};

let adminRole: TestRole;
let captureRole: TestRole;
let adminKnex: Knex;
let fixtureClient: PgClient;
let fixture: StatementRunner;

function roleUrl(role: TestRole, application: string): string {
  const url = new URL(role.url);
  // Keep the harness prefix so its cleanup can find leftover connections.
  url.searchParams.set("application_name", `h:${h.id}:${application}`);
  return url.toString();
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  captureRole = await h.createRole("capture");
  adminKnex = knexFactory({
    client: "pg",
    connection: roleUrl(adminRole, "admin"),
    pool: { min: 0, max: 4 },
  });
  fixtureClient = new PgClient({ connectionString: roleUrl(adminRole, "fixture") });
  fixtureClient.on("error", () => {});
  await fixtureClient.connect();
  fixture = clientRunner(fixtureClient);
});

afterAll(async () => {
  await fixtureClient?.end().catch(() => {});
  await adminKnex?.destroy();
});

function storeWith(overrides: Partial<typeof TIMEOUTS> = {}): AdminStore {
  return createAdminStore({
    getPrimaryDatabase: () => adminKnex,
    schema: h.searchSchema,
    namespace: h.namespace,
    timeouts: { ...TIMEOUTS, ...overrides },
  });
}

function request(operationId: string, kind = "test-op"): AdminOperationRequest {
  return { logicalKey: KEY, kind, operationId, actor: "tester", reason: "lease test" };
}

/** Fresh schema, grants and one registered target, created through the admin role. */
async function setUp(): Promise<PreparedTarget> {
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], capture: [captureRole.name] },
  });
  return createTarget(fixture, { schema: h.searchSchema, namespace: h.namespace, logicalKey: KEY });
}

type ControlRow = {
  operation_id: string | null;
  lease_token: string | null;
  expires_in_ms: string | null;
  expires_at_ms: string | null;
};

async function control(): Promise<ControlRow> {
  const { rows } = await h.knex.raw<{ rows: ControlRow[] }>(
    sql`SELECT operation_id, lease_token,
       (extract(epoch FROM lease_expires_at - clock_timestamp()) * 1000)::bigint AS expires_in_ms,
       (extract(epoch FROM lease_expires_at) * 1000)::bigint AS expires_at_ms
FROM ${qualified(h.searchSchema, "admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return rows[0];
}

type AuditRow = {
  operation_id: string;
  kind: string;
  outcome: string;
  detail: Record<string, string | number | boolean>;
};

async function audits(): Promise<AuditRow[]> {
  const { rows } = await h.knex.raw<{ rows: AuditRow[] }>(
    sql`SELECT operation_id, kind, outcome, detail FROM ${qualified(h.searchSchema, "admin_operations")}
WHERE namespace = ? AND definition = ? AND actor = 'tester' ORDER BY operation_seq`,
    [h.namespace, KEY],
  );
  return rows;
}

async function generation(): Promise<number> {
  const { rows } = await h.knex.raw<{ rows: { generation: string }[] }>(
    sql`SELECT generation FROM ${qualified(h.searchSchema, "indexes")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, KEY],
  );
  return Number(rows[0].generation);
}

/** Runs the marker's barrier lock in a session and keeps holding the FOR SHARE. */
async function holdMarkerBarrier(marker: PgSession): Promise<void> {
  await marker.run("BEGIN");
  await marker.run(
    sql`SELECT generation, store_id FROM ${qualified(h.searchSchema, "indexes")} WHERE namespace = $1 AND definition = $2 FOR SHARE`,
    [h.namespace, KEY],
  );
}

async function errorOf<T>(promise: Promise<T>): Promise<SearchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("SearchError로 거부되어야 했지만 성공했습니다.");
}

/** Fails if work does not finish in time; for calls that must not wait on a lock. */
async function within<T>(milliseconds: number, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${milliseconds}ms 안에 끝나지 않았습니다 (잠금 대기 의심).`)),
      milliseconds,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

describe("관리 임대", () => {
  it("임대 heartbeat는 장벽 행을 잠그지 않아 마커를 막지 않는다", async () => {
    await setUp();
    const { sessions } = await h.openSessions(["marker", "exclusive"]);
    const operation = new AdminOperation(storeWith(), request("op-heartbeat"));
    await operation.acquire();
    const before = Number((await control()).expires_at_ms);

    await holdMarkerBarrier(sessions.marker);
    expect(await sessions.marker.locks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation: `${h.searchSchema}.indexes`,
          mode: "RowShareLock",
          granted: true,
        }),
      ]),
    );
    // Queue an exclusive-barrier waiter: a heartbeat touching the barrier row would queue behind it and stall.
    await sessions.exclusive.run("BEGIN");
    const exclusive = await sessions.exclusive.block(
      sql`SELECT generation FROM ${qualified(h.searchSchema, "indexes")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
      { blockedBy: sessions.marker },
    );

    await within(5_000, operation.heartbeat());
    await exclusive.expectStillBlocked();
    expect(Number((await control()).expires_at_ms)).toBeGreaterThan(before);

    await sessions.marker.run("COMMIT");
    await exclusive.expectSuccess();
    await sessions.exclusive.run("ROLLBACK");
    expect(await operation.release()).toBe(true);
  });

  it("등록(배타 장벽)은 마커가 쥔 동안 lock_timeout 안에 SearchAdminBusy로 실패하고, 나중에 다시 하면 성공한다", async () => {
    await setUp();
    const { sessions } = await h.openSessions(["marker"]);
    const store = storeWith({ lockTimeoutMs: 300 });
    await runAdminOperation(store, request("op-register"), async (operation) => {
      await operation.acquire();
      await holdMarkerBarrier(sessions.marker);
      let bodyRuns = 0;
      const busy = await errorOf(
        operation.fenced("exclusive", async () => {
          bodyRuns += 1;
        }),
      );
      expect(busy).toBeInstanceOf(SearchAdminBusy);
      expect(busy).toMatchObject({
        code: "SEARCH_ADMIN_BUSY",
        retryable: true,
        details: { sqlstate: "55P03", reason: "lock-timeout" },
      });
      expect(bodyRuns).toBe(0);

      await sessions.marker.run("COMMIT");
      // A lock timeout does not lose the lease; retrying under the same lease succeeds.
      const before = await generation();
      await operation.fenced(
        "exclusive",
        async (trx) => {
          bodyRuns += 1;
          await trx.raw(
            sql`UPDATE ${qualified(h.searchSchema, "indexes")} SET generation = generation + 1 WHERE namespace = ? AND definition = ?`,
            [h.namespace, KEY],
          );
        },
        () => ({ outcome: "succeeded" }),
      );
      expect(bodyRuns).toBe(1);
      expect(await generation()).toBe(before + 1);
    });
    expect((await audits()).map((row) => row.outcome)).toEqual(["succeeded"]);
  });

  it("임대는 한 번에 한 작업만 쥐고, 다른 작업은 SearchAdminBusy를 받는다", async () => {
    await setUp();
    const store = storeWith();
    const first = new AdminOperation(store, request("op-first"));
    await first.acquire();
    const second = new AdminOperation(store, request("op-second"));
    const busy = await errorOf(second.acquire());
    expect(busy).toBeInstanceOf(SearchAdminBusy);
    expect(busy).toMatchObject({
      retryable: true,
      details: { reason: "lease-held", logicalKey: KEY, holderKind: "test-op" },
    });
    expect(await control()).toMatchObject({ operation_id: "op-first", lease_token: first.token });
    // Releasing without holding the lease must not clear someone else's.
    expect(await second.release()).toBe(false);
    expect((await control()).lease_token).toBe(first.token);
    expect(await first.release()).toBe(true);
  });

  it("임대가 교체된 작업은 다음 문장에서 SearchAdminLeaseLost로 막히고 아무것도 쓰지 않는다", async () => {
    await setUp();
    const store = storeWith();
    const stale = new AdminOperation(store, request("op-same"));
    await stale.acquire();
    // A second call with the same operation_id re-enters and replaces the token.
    const replacement = new AdminOperation(store, request("op-same"));
    await replacement.acquire();
    expect((await control()).lease_token).toBe(replacement.token);

    const before = { generation: await generation(), audits: await audits() };
    let bodyRuns = 0;
    for (const barrier of ["shared", "exclusive"] as const) {
      const lost = await errorOf(
        stale.fenced(
          barrier,
          async (trx) => {
            bodyRuns += 1;
            await trx.raw(
              sql`UPDATE ${qualified(h.searchSchema, "indexes")} SET generation = generation + 1 WHERE namespace = ? AND definition = ?`,
              [h.namespace, KEY],
            );
          },
          () => ({ outcome: "succeeded" }),
        ),
      );
      expect(lost).toBeInstanceOf(SearchAdminLeaseLost);
      expect(lost).toMatchObject({
        code: "SEARCH_ADMIN_LEASE_LOST",
        details: { reason: "lease-replaced-or-expired" },
      });
    }
    const heartbeat = await errorOf(stale.heartbeat());
    expect(heartbeat).toBeInstanceOf(SearchAdminLeaseLost);
    expect(bodyRuns).toBe(0);
    expect(await generation()).toBe(before.generation);
    expect(await audits()).toEqual(before.audits);

    expect(await stale.release()).toBe(false);
    expect(await control()).toMatchObject({
      operation_id: "op-same",
      lease_token: replacement.token,
    });
    expect(await replacement.release()).toBe(true);
    expect((await control()).lease_token).toBeNull();
  });

  it("작업이 끝나면 성공이든 실패든 임대를 반납해 다른 작업이 만료를 기다리지 않는다", async () => {
    await setUp();
    const store = storeWith();

    await runAdminOperation(store, request("op-ok"), async (operation) => {
      await operation.acquire();
      await operation.fenced(
        "shared",
        async () => undefined,
        () => ({ outcome: "succeeded" }),
      );
    });
    expect((await control()).lease_token).toBeNull();

    const failure = new SearchAdminPreconditionFailed(
      { key: "error.adminPreconditionFailed" },
      { details: { reason: "test-failure" } },
    );
    const thrown = await errorOf(
      runAdminOperation(store, request("op-fail"), async (operation) => {
        await operation.acquire();
        expect((await control()).lease_token).toBe(operation.token);
        throw failure;
      }),
    );
    expect(thrown).toBe(failure);
    expect((await control()).lease_token).toBeNull();

    // A failure inside a SQL step (an exclusive-barrier lock timeout) also releases.
    const { sessions } = await h.openSessions(["marker"]);
    await holdMarkerBarrier(sessions.marker);
    const busy = await errorOf(
      runAdminOperation(storeWith({ lockTimeoutMs: 200 }), request("op-timeout"), async (op) => {
        await op.acquire();
        await op.fenced("exclusive", async () => undefined);
      }),
    );
    expect(busy).toBeInstanceOf(SearchAdminBusy);
    await sessions.marker.run("COMMIT");
    expect((await control()).lease_token).toBeNull();

    await runAdminOperation(store, request("op-next"), async (operation) => {
      await operation.acquire();
    });
    expect(await audits()).toEqual([
      { operation_id: "op-ok", kind: "test-op", outcome: "succeeded", detail: {} },
      {
        operation_id: "op-fail",
        kind: "test-op",
        outcome: "failed",
        detail: {
          code: "SEARCH_ADMIN_PRECONDITION_FAILED",
          retryable: false,
          reason: "test-failure",
        },
      },
      {
        operation_id: "op-timeout",
        kind: "test-op",
        outcome: "failed",
        detail: {
          code: "SEARCH_ADMIN_BUSY",
          retryable: true,
          reason: "lock-timeout",
          sqlstate: "55P03",
        },
      },
    ]);
  });

  it("fenced 트랜잭션 도중 죽은 작업의 임대는 만료 전에는 넘어가지 않고 만료 뒤에 넘어간다", async () => {
    await setUp();
    const leaseMs = 1_500;
    const store = storeWith({ adminLeaseMs: leaseMs });
    const crashed = new AdminOperation(store, request("op-crashed"));
    await crashed.acquire();

    // The backend dies inside the fenced transaction, holding the control row; the release never runs.
    const killed = await errorOf(
      crashed.fenced("shared", async (trx) => {
        const { rows } = await trx.raw<{ rows: { pid: number }[] }>(
          "SELECT pg_backend_pid() AS pid",
        );
        await h.knex.raw("SELECT pg_terminate_backend(?)", [rows[0].pid]);
        await trx.raw("SELECT 1");
      }),
    );
    expect(killed.retryable).toBe(true);
    expect(await control()).toMatchObject({
      operation_id: "op-crashed",
      lease_token: crashed.token,
    });

    // Before expiry another operation is busy; confirm by database time that the lease had not yet expired.
    const early = new AdminOperation(store, request("op-early"));
    const busy = await errorOf(early.acquire());
    expect(busy).toBeInstanceOf(SearchAdminBusy);
    expect(Number((await control()).expires_in_ms)).toBeGreaterThan(0);

    const deadline = Date.now() + leaseMs * 10;
    while (Number((await control()).expires_in_ms) > 0) {
      if (Date.now() > deadline) throw new Error("임대가 만료되지 않았습니다.");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // The owner of an expired but unreplaced lease is fenced too.
    expect(await errorOf(crashed.fenced("shared", async () => undefined))).toBeInstanceOf(
      SearchAdminLeaseLost,
    );
    const late = new AdminOperation(store, request("op-late"));
    await late.acquire();
    expect(await control()).toMatchObject({ operation_id: "op-late", lease_token: late.token });
    expect(await late.release()).toBe(true);
  });

  it("제어 행이 없는 logical key의 임대 획득은 SearchNotConfigured이다", async () => {
    await setUp();
    const operation = new AdminOperation(storeWith(), {
      ...request(`op-${randomUUID()}`),
      logicalKey: "unknown-key",
    });
    const error = await errorOf(operation.acquire());
    expect(error).toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
      details: { reason: "logical-key-not-registered", logicalKey: "unknown-key" },
    });
  });

  it("inspect는 admin 역할로 잠금 없이 인덱스, 대상, 열린 빌드, 차단 코드를 읽는다", async () => {
    const target = await setUp();
    const admin = createSearchAdmin({
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
      lifetimes: {
        maxSearchLifetimeMs: 30_000,
        maxCursorLifetimeMs: 600_000,
        maxPitKeepAliveMs: 300_000,
        retirementSafetyMarginMs: 60_000,
      },
      timeouts: TIMEOUTS,
      cutover: { maxPendingDocuments: 0, sampleSize: 10 },
      workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 10_000 },
    });

    // inspect does not wait for an admin transaction holding the exclusive barrier and the read head.
    const { sessions } = await h.openSessions(["locker"]);
    await sessions.locker.run("BEGIN");
    await sessions.locker.run(
      sql`SELECT generation FROM ${qualified(h.searchSchema, "indexes")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
    );
    await sessions.locker.run(
      sql`SELECT target_id FROM ${qualified(h.searchSchema, "read_heads")} WHERE namespace = $1 AND definition = $2 FOR UPDATE`,
      [h.namespace, KEY],
    );
    const inspection = await within(5_000, admin.inspect(KEY));
    await sessions.locker.run("ROLLBACK");

    expect(inspection).toMatchObject({
      logicalKey: KEY,
      captureMode: "active",
      captureEpoch: 1,
      generation: 2,
      readHead: { targetId: null, generation: 0, rebuildRequired: false },
      workers: [],
    });
    expect(inspection.targets).toEqual([
      {
        targetId: target.targetId,
        physicalIndex: target.physicalIndex,
        writeAlias: target.writeAlias,
        fingerprint: "a".repeat(64),
        captureEpoch: 1,
        remoteCreateState: "verified",
        state: "active",
        writeEnabled: true,
        deselectedAt: null,
        deselectConfirmedAt: null,
        pauseReason: null,
        remoteCreateStartedAt: expect.any(Number),
        verification: { startedAt: null, completedAt: null, checked: 0, violations: 0 },
        remote: null,
        // No worker has sent to this target yet, so it has no fence row.
        fence: { epoch: 0, pending: false, renewedAgeMs: null, lost: false, lostDetail: null },
        // An empty target's counts are exact even in bounded mode.
        backlog: {
          pending: 0,
          quarantined: 0,
          oldestPendingAgeMs: null,
          intents: 0,
          leased: 0,
          delayed: 0,
          exact: true,
          limit: 10_000,
        },
      },
    ]);
    expect(inspection.openBuild).toMatchObject({
      kind: "initial",
      phase: "created",
      captureEpoch: 1,
      currentCaptureEpoch: 1,
      scan: { completed: false, pages: 0, documents: 0 },
      newTarget: { pending: 0, quarantined: 0, oldestPendingAgeMs: null },
      eligibleForCutover: false,
      blockers: ["phase-not-catching-up", "scan-incomplete"],
    });
    expect(inspection.openBuild?.oldTarget).toBeUndefined();
  });
});
