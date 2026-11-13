import { randomUUID } from "node:crypto";

import knexFactory, { type Knex } from "knex";
import { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applySearchGrants } from "../../../src/admin";
import { createAdminStore, runAdminOperation } from "../../../src/admin/admin-lease";
import {
  recordTargetIntent,
  type TargetIntentInput,
  type TargetIntentResult,
} from "../../../src/admin/targets";
import { buildPhysicalIndexName, buildWriteAliasName } from "../../../src/definition/names";
import {
  SearchAdminBusy,
  SearchError,
  SearchNotConfigured,
  SearchNoWriteTarget,
} from "../../../src/errors";
import { createPostgresSynchronization } from "../../../src/postgres";
import { type TestRole, useIntegrationHarness } from "../../helpers/harness";
import { openPgSessions, type PgSession, type PgSessions } from "../../helpers/pg-sessions";
import { identifier, qualified, sql } from "../../helpers/sql";
import {
  clientRunner,
  closeOpenBuildsForTest,
  createTarget,
  prepareTarget,
  type PreparedTarget,
  readDeliveries,
  releaseLease,
  resetSearchSchema,
  runRegistrationBody,
  sessionRunner,
  type StatementRunner,
  TEST_ADMIN_TIMEOUTS,
  targetStatements,
} from "../../helpers/test-targets";

/**
 * Recording a target intent takes the barrier before any other row: index row, shared barrier, then the control row
 * and the target rows. Otherwise an intent holding the control row and waiting on the barrier (through the foreign key
 * check of its target insert) deadlocks with a registration holding the exclusive barrier and waiting on the control
 * row. Both arrival orders must finish without deadlock. A test-only statement trigger parks the intent right before
 * its target insert, only on connections with sonamu_test.gate = on.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const KEY = "messages";
const FRESH_KEY = "fresh";
// Must match the constant inside the test trigger function.
const GATE_KEY = 59_701;
const LIFETIMES = {
  maxSearchLifetimeMs: 30_000,
  maxCursorLifetimeMs: 600_000,
  maxPitKeepAliveMs: 300_000,
  retirementSafetyMarginMs: 60_000,
};
const TIMEOUTS = {
  lockTimeoutMs: 15_000,
  statementTimeoutMs: 30_000,
  idleInTransactionTimeoutMs: 60_000,
  adminLeaseMs: 120_000,
};
// An intent that has not locked any row yet holds no relation lock on these tables.
const LATER_TABLES = ["admin_controls", "read_heads", "targets", "builds"];

let adminRole: TestRole;
let captureRole: TestRole;
let fixtureClient: PgClient;
let fixture: StatementRunner;
let intentKnex: Knex;
let gatedKnex: Knex;
let captureKnex: Knex;
const knexes: Knex[] = [];

const application = (name: string) => `h:${h.id}:${name}`;

function roleUrl(role: TestRole, name: string): string {
  const url = new URL(role.url);
  url.searchParams.set("application_name", application(name));
  return url.toString();
}

type PoolCallback = (error: Error | null, connection: PgClient) => void;

/** Single-connection admin-role pool, so application_name identifies its backend. */
function singleConnectionKnex(role: TestRole, name: string, gated: boolean): Knex {
  const db = knexFactory({
    client: "pg",
    connection: roleUrl(role, name),
    pool: {
      min: 0,
      max: 1,
      afterCreate: (connection: PgClient, done: PoolCallback) => {
        if (!gated) {
          done(null, connection);
          return;
        }
        // Only this connection's statements are parked by the test trigger; package code never reads the setting.
        connection.query("SELECT set_config('sonamu_test.gate', 'on', false)").then(
          () => done(null, connection),
          (error: Error) => done(error, connection),
        );
      },
    },
  });
  knexes.push(db);
  return db;
}

beforeAll(async () => {
  adminRole = await h.createRole("admin");
  captureRole = await h.createRole("capture");
  intentKnex = singleConnectionKnex(adminRole, "intent", false);
  gatedKnex = singleConnectionKnex(adminRole, "gated", true);
  captureKnex = knexFactory({
    client: "pg",
    connection: roleUrl(captureRole, "capture"),
    pool: { min: 0, max: 4 },
  });
  knexes.push(captureKnex);
  fixtureClient = new PgClient({ connectionString: roleUrl(adminRole, "fixture") });
  fixtureClient.on("error", () => {});
  await fixtureClient.connect();
  fixture = clientRunner(fixtureClient);
});

afterAll(async () => {
  await fixtureClient?.end().catch(() => {});
  await Promise.allSettled(knexes.map((db) => db.destroy()));
});

const spec = (logicalKey = KEY) => ({
  schema: h.searchSchema,
  namespace: h.namespace,
  logicalKey,
});
const statements = () => targetStatements(h.searchSchema);

/** Fresh schema, grants, the test trigger and one registered target with its build closed. */
async function setUp(): Promise<PreparedTarget> {
  await resetSearchSchema(h);
  await applySearchGrants(h.knex, {
    schema: h.searchSchema,
    roles: { admin: [adminRole.name], capture: [captureRole.name] },
  });
  const s = identifier(h.searchSchema);
  await h.knex.raw(
    sql`CREATE FUNCTION ${s}.test_gate() RETURNS trigger LANGUAGE plpgsql AS $gate$
BEGIN
  IF current_setting('sonamu_test.gate', true) = 'on' THEN
    PERFORM pg_advisory_xact_lock(59701);
  END IF;
  RETURN NULL;
END
$gate$`,
  );
  await h.knex.raw(
    sql`CREATE TRIGGER test_gate_targets BEFORE INSERT ON ${qualified(h.searchSchema, "targets")}
FOR EACH STATEMENT EXECUTE FUNCTION ${s}.test_gate()`,
  );
  const first = await createTarget(fixture, spec());
  await closeOpenBuildsForTest(fixture, spec());
  return first;
}

function newIntent(logicalKey = KEY): TargetIntentInput {
  const targetId = randomUUID();
  const physicalIndex = buildPhysicalIndexName(h.namespace, logicalKey, targetId);
  return {
    targetId,
    physicalIndex,
    writeAlias: buildWriteAliasName(physicalIndex),
    fingerprint: "b".repeat(64),
    hashVersion: "sonamu-c14n-v1",
  };
}

function runIntent(
  db: Knex,
  operationId: string,
  input: TargetIntentInput,
  logicalKey = KEY,
): Promise<TargetIntentResult> {
  const store = createAdminStore({
    getPrimaryDatabase: () => db,
    schema: h.searchSchema,
    namespace: h.namespace,
    timeouts: TIMEOUTS,
  });
  const pending = runAdminOperation(
    store,
    { logicalKey, kind: "create", operationId, actor: "tester", reason: "lock order" },
    (operation) => recordTargetIntent(operation, input, LIFETIMES),
  );
  pending.catch(() => {});
  return pending;
}

type Activity = {
  pid: number;
  wait_event_type: string | null;
  wait_event: string | null;
  blocking: number[];
};

async function waitForBackend(
  name: string,
  predicate: (activity: Activity) => boolean,
  timeoutMs = 15_000,
): Promise<Activity> {
  const deadline = Date.now() + timeoutMs;
  let last: Activity | undefined;
  while (Date.now() < deadline) {
    const { rows } = await h.knex.raw<{ rows: Activity[] }>(
      "SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE application_name = ? AND state = 'active'",
      [application(name)],
    );
    last = rows[0];
    if (last !== undefined && predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`${name} 백엔드가 기대한 상태가 되지 않았습니다: ${JSON.stringify(last)}`);
}

/** Tables (without schema) on which pid holds a relation lock. */
async function lockedRelations(pid: number): Promise<string[]> {
  const { rows } = await h.knex.raw<{ rows: { relation: string }[] }>(
    "SELECT DISTINCT c.relname AS relation FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace WHERE l.pid = ? AND l.locktype = 'relation' AND n.nspname = ? ORDER BY 1",
    [pid, h.searchSchema],
  );
  return rows.map((row) => row.relation);
}

async function blockingPids(pid: number): Promise<number[]> {
  const { rows } = await h.knex.raw<{ rows: { blocking: number[] }[] }>(
    "SELECT pg_blocking_pids(?) AS blocking",
    [pid],
  );
  return rows[0].blocking;
}

type TargetRow = { state: string; remote_create_state: string; write_enabled: boolean };

async function targetRow(targetId: string): Promise<TargetRow | undefined> {
  const { rows } = await h.knex.raw<{ rows: TargetRow[] }>(
    sql`SELECT state, remote_create_state, write_enabled FROM ${qualified(h.searchSchema, "targets")} WHERE target_id = ?`,
    [targetId],
  );
  return rows[0];
}

async function leaseToken(logicalKey = KEY): Promise<string | null | undefined> {
  const { rows } = await h.knex.raw<{ rows: { lease_token: string | null }[] }>(
    sql`SELECT lease_token FROM ${qualified(h.searchSchema, "admin_controls")} WHERE namespace = ? AND definition = ?`,
    [h.namespace, logicalKey],
  );
  return rows[0]?.lease_token;
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

async function withRegistrar<T>(work: (registrar: PgSession) => Promise<T>): Promise<T> {
  const group: PgSessions<"registrar"> = await openPgSessions(
    roleUrl(adminRole, "registrar"),
    ["registrar"],
    { applicationNamePrefix: application("pgs") },
  );
  try {
    return await work(group.sessions.registrar);
  } finally {
    await group.close();
  }
}

async function beginRegistration(registrar: PgSession): Promise<void> {
  await registrar.run("BEGIN");
  await registrar.run(statements().setAdminTimeouts, [...TEST_ADMIN_TIMEOUTS]);
}

describe("대상 의도와 등록의 잠금 순서", () => {
  for (const sameOperation of [true, false]) {
    it(`등록이 먼저 장벽을 쥐면 의도는 아무것도 쥐지 않은 채 공유 장벽에서 기다리고 교착 없이 끝난다 (${sameOperation ? "같은 작업" : "다른 작업"})`, async () => {
      const first = await setUp();
      const second = await prepareTarget(fixture, spec());
      const input = newIntent();
      await withRegistrar(async (registrar) => {
        await beginRegistration(registrar);
        const barrier = await registrar.run<{ capture_epoch: number }>(
          statements().lockBarrierExclusive,
          [h.namespace, KEY],
        );
        const pending = runIntent(
          intentKnex,
          sameOperation ? second.operationId : "op-other",
          input,
        );
        const waiting = await waitForBackend(
          "intent",
          (activity) =>
            activity.wait_event_type === "Lock" && activity.blocking.includes(registrar.pid),
        );
        // While waiting at the barrier the intent holds none of the later tables.
        const relations = await lockedRelations(waiting.pid);
        expect(relations).toContain("indexes");
        expect(relations.filter((relation) => LATER_TABLES.includes(relation))).toEqual([]);

        // The rest of the registration never waits (run forbids lock waits).
        await runRegistrationBody(sessionRunner(registrar), second, barrier.rows[0].capture_epoch, {
          kind: "rebuild",
          oldTargetId: first.targetId,
        });
        await registrar.run("COMMIT");

        if (sameOperation) {
          // The same operation_id re-enters the lease and continues.
          await expect(pending).resolves.toEqual({
            action: "recorded",
            captureEpoch: 1,
            remoteCreateState: "not_started",
          });
        } else {
          // The registration still holds the lease, so another operation ends with SearchAdminBusy, not a deadlock.
          const busy = await errorOf(pending);
          expect(busy).toBeInstanceOf(SearchAdminBusy);
          expect(busy).toMatchObject({ retryable: true, details: { reason: "lease-held" } });
          expect(await targetRow(input.targetId)).toBeUndefined();
          await releaseLease(fixture, second);
          await expect(runIntent(intentKnex, "op-other", input)).resolves.toMatchObject({
            action: "recorded",
          });
        }
      });
      expect(await targetRow(second.targetId)).toMatchObject({ state: "active" });
      expect(await targetRow(input.targetId)).toEqual({
        state: "creating",
        remote_create_state: "not_started",
        write_enabled: false,
      });
      expect(await leaseToken()).toBeNull();
    });
  }

  it("의도가 먼저 장벽과 제어 행을 쥐면 등록은 배타 장벽에서 기다리고, 의도가 커밋된 뒤 교체된 임대로 fence된다", async () => {
    await setUp();
    const second = await prepareTarget(fixture, spec());
    const input = newIntent();
    const { sessions } = await h.openSessions(["gate"]);
    await sessions.gate.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);

    await withRegistrar(async (registrar) => {
      // The intent re-enters with the same operation_id, replaces the registration's token and parks before its target insert.
      const pending = runIntent(gatedKnex, second.operationId, input);
      const gated = await waitForBackend(
        "gated",
        (activity) => activity.wait_event_type === "Lock" && activity.wait_event === "advisory",
      );
      expect(await lockedRelations(gated.pid)).toEqual(
        expect.arrayContaining(["admin_controls", "indexes", "read_heads", "targets"]),
      );

      await beginRegistration(registrar);
      const exclusive = await registrar.block(statements().lockBarrierExclusive, [
        h.namespace,
        KEY,
      ]);
      expect(await blockingPids(registrar.pid)).toContain(gated.pid);

      // The target insert's foreign key check (KEY SHARE) is covered by the FOR SHARE already held, so it does not
      // queue behind the waiting exclusive barrier.
      await sessions.gate.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);
      await expect(within(10_000, pending)).resolves.toMatchObject({ action: "recorded" });

      await exclusive.expectSuccess();
      const fence = await registrar.run(statements().lockHeldLease, [
        h.namespace,
        KEY,
        second.leaseToken,
      ]);
      expect(fence.rowCount).toBe(0);
      await registrar.run("ROLLBACK");
    });
    expect(await targetRow(second.targetId)).toMatchObject({
      state: "creating",
      remote_create_state: "verified",
    });
    expect(await targetRow(input.targetId)).toMatchObject({ state: "creating" });
    expect(await leaseToken()).toBeNull();
  });
});

// The marker's isolation matters only for the stale-snapshot path, so REPEATABLE READ is the case to prove.
describe("도메인 markChanged와 대상 의도", () => {
  const isolation = "repeatable read";
  it("REPEATABLE READ: 장벽을 쥔 마커와 의도는 서로 기다리지 않고, 의도만으로는 마커의 대상 목록이 바뀌지 않는다", async () => {
    const first = await setUp();
    const sync = createPostgresSynchronization({
      getPrimaryDatabase: () => captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await sync.initialize();

    // The intent completes while the marker holds its FOR SHARE.
    const trx = await captureKnex.transaction({ isolationLevel: isolation });
    await expect(sync.markChanged(trx, KEY, ["a"])).resolves.toBe("recorded");
    await expect(within(10_000, runIntent(intentKnex, "op-a", newIntent()))).resolves.toMatchObject(
      {
        action: "recorded",
      },
    );
    // An intent does not bump generation, so the stale snapshot still commits without 40001.
    await expect(sync.markChanged(trx, KEY, ["b"])).resolves.toBe("recorded");
    await trx.commit();

    // The marker does not wait for an intent parked while holding the barrier and the control row.
    const { sessions } = await h.openSessions(["gate"]);
    await sessions.gate.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);
    const pending = runIntent(gatedKnex, "op-c", newIntent());
    await waitForBackend("gated", (activity) => activity.wait_event === "advisory");
    await within(
      10_000,
      captureKnex.transaction(
        async (domain) => {
          await expect(sync.markChanged(domain, KEY, ["c"])).resolves.toBe("recorded");
        },
        { isolationLevel: isolation },
      ),
    );
    await sessions.gate.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);
    await expect(within(10_000, pending)).resolves.toMatchObject({ action: "recorded" });

    // A creating target is not a write target, so deliveries go to the registered target only.
    expect(await readDeliveries(h)).toEqual({
      [`${first.targetId}/a`]: 1,
      [`${first.targetId}/b`]: 1,
      [`${first.targetId}/c`]: 1,
    });
  });

  it("REPEATABLE READ: 새 logical key의 의도가 진행 중이거나 대상 없이 커밋돼도 마커는 실패 닫힘으로 끝난다", async () => {
    await setUp();
    const sync = createPostgresSynchronization({
      getPrimaryDatabase: () => captureKnex,
      schema: h.searchSchema,
      namespace: h.namespace,
    });
    await sync.initialize();
    const { sessions } = await h.openSessions(["gate"]);
    await sessions.gate.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);
    // The intent inserts the new index row and parks holding the barrier and the control row, uncommitted.
    const pending = runIntent(gatedKnex, "op-fresh", newIntent(FRESH_KEY), FRESH_KEY);
    await waitForBackend("gated", (activity) => activity.wait_event === "advisory");

    const uncommitted = await errorOf(
      within(
        10_000,
        captureKnex.transaction(
          async (domain) => {
            await sync.markChanged(domain, FRESH_KEY, ["x"]);
          },
          { isolationLevel: isolation },
        ),
      ),
    );
    expect(uncommitted).toBeInstanceOf(SearchNotConfigured);

    await sessions.gate.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);
    await expect(within(10_000, pending)).resolves.toMatchObject({ action: "recorded" });

    // Only the intent committed: capture is active but there is no write target.
    const noTarget = await errorOf(
      captureKnex.transaction(
        async (domain) => {
          await sync.markChanged(domain, FRESH_KEY, ["x"]);
        },
        { isolationLevel: isolation },
      ),
    );
    expect(noTarget).toBeInstanceOf(SearchNoWriteTarget);
    const { rows } = await h.knex.raw<{ rows: { count: string }[] }>(
      sql`SELECT count(*) AS count FROM ${qualified(h.searchSchema, "documents")} WHERE definition = ?`,
      [FRESH_KEY],
    );
    expect(Number(rows[0].count)).toBe(0);
    expect(await leaseToken(FRESH_KEY)).toBeNull();
  });
});
