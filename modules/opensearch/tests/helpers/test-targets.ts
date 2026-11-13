import { randomUUID } from "node:crypto";

import { type Client as OpenSearchClient } from "@opensearch-project/opensearch";
import { type Knex } from "knex";
import { Client as PgClient, type QueryResult, type QueryResultRow } from "pg";

import { createSearchAdmin, installSearchSchema } from "../../src/admin";
import { createAdminStore } from "../../src/admin/admin-lease";
import { executeCreate, planCreate, type RemoteCreateContext } from "../../src/admin/remote-create";
import { createSearchClient, getSearchRequester } from "../../src/client/search-client";
import { type DefinedSearch } from "../../src/definition/define-search";
import { composeIndexMappings } from "../../src/definition/envelope";
import { buildPhysicalIndexName, buildWriteAliasName } from "../../src/definition/names";
import { createPostgresSynchronization } from "../../src/postgres";
import { TEST_READ_LIFETIMES } from "../../src/testing";
import { type IntegrationHarness } from "./harness";
import { type PgParam, type PgSession } from "./pg-sessions";
import { identifier, qualified, sql } from "./sql";

/**
 * Without spec.remote the admin statements run directly: the real admin API never creates a target without OpenSearch
 * and never stops halfway holding its lease, which race tests need. With remote the real admin code runs; it has
 * already released its lease, so PreparedTarget.leaseToken then matches no row. The statement texts mirror src/admin
 * with the test schema substituted.
 */
export type StatementRunner = <R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly PgParam[],
) => Promise<QueryResult<R>>;

export function sessionRunner(session: PgSession): StatementRunner {
  return (text, params = []) => session.run(text, params);
}

export function clientRunner(client: PgClient): StatementRunner {
  return (text, params = []) => client.query(text, [...params]);
}

export const TEST_ADMIN_TIMEOUTS = ["5s", "20s", "30s"] as const;
const SET_ADMIN_TIMEOUTS =
  "SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true),\n       set_config('idle_in_transaction_session_timeout', $3, true);";
const LEASE_MS = 120_000;

export function targetStatements(schema: string) {
  const s = (name: string) => qualified(schema, name);
  return {
    setAdminTimeouts: SET_ADMIN_TIMEOUTS,
    lockBarrierShared: sql`SELECT generation, capture_mode, capture_epoch FROM ${s("indexes")} WHERE namespace = $1 AND definition = $2 FOR SHARE;`,
    lockBarrierExclusive: sql`SELECT generation, capture_mode, capture_epoch FROM ${s("indexes")} WHERE namespace = $1 AND definition = $2 FOR UPDATE;`,
    acquireLease: sql`UPDATE ${s("admin_controls")} c
SET operation_id = $3, operation_kind = $4, actor = $5, lease_token = $6::uuid,
    lease_expires_at = clock_timestamp() + ($7::bigint * interval '1 millisecond'),
    acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp()
WHERE c.namespace = $1 AND c.definition = $2
  AND (c.lease_token IS NULL OR c.lease_expires_at <= clock_timestamp() OR c.operation_id = $3)
RETURNING c.lease_token;`,
    lockHeldLease: sql`SELECT lease_token FROM ${s("admin_controls")}
WHERE namespace = $1 AND definition = $2 AND lease_token = $3::uuid AND lease_expires_at > clock_timestamp()
FOR UPDATE;`,
    releaseLease: sql`UPDATE ${s("admin_controls")}
SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND lease_token = $3::uuid
RETURNING operation_id;`,
    ensureIndexRow: sql`INSERT INTO ${s("indexes")} (namespace, definition, store_id)
SELECT $1, $2, store_id FROM ${s("store")}
ON CONFLICT (namespace, definition) DO NOTHING;`,
    ensureReadHead: sql`INSERT INTO ${s("read_heads")} (namespace, definition, max_search_lifetime_ms, max_cursor_lifetime_ms, max_pit_keep_alive_ms, retirement_safety_margin_ms)
VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (namespace, definition) DO NOTHING;`,
    ensureAdminControl: sql`INSERT INTO ${s("admin_controls")} (namespace, definition) VALUES ($1, $2) ON CONFLICT (namespace, definition) DO NOTHING;`,
    lockExistingTarget: sql`SELECT state, remote_create_state, capture_epoch, fingerprint, create_operation_id
FROM ${s("targets")} WHERE target_id = $1 FOR UPDATE;`,
    insertTargetIntent: sql`INSERT INTO ${s("targets")} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch, state, write_enabled, create_operation_id)
SELECT $1, $2, $3, $4, $5, $6, $7, i.capture_epoch, 'creating', false, $8
FROM ${s("indexes")} i WHERE i.namespace = $2 AND i.definition = $3
ON CONFLICT (target_id) DO NOTHING
RETURNING target_id;`,
    recordCreateAttempt: sql`UPDATE ${s("targets")}
SET remote_create_state = 'in_flight', remote_create_token = $2::uuid, remote_create_attempts = remote_create_attempts + 1,
    remote_create_started_at = clock_timestamp(), remote_create_finished_at = NULL
WHERE target_id = $1 AND state = 'creating' AND remote_create_state = 'not_started'
RETURNING remote_create_attempts;`,
    recordCreateResult: sql`UPDATE ${s("targets")}
SET remote_create_state = $3, remote_create_finished_at = clock_timestamp()
WHERE target_id = $1 AND state = 'creating' AND remote_create_state = 'in_flight' AND remote_create_token = $2::uuid
RETURNING remote_create_state;`,
    countWriteTargets: sql`SELECT count(*) AS write_targets FROM ${s("targets")}
WHERE namespace = $1 AND definition = $2 AND write_enabled AND capture_epoch = $3;`,
    activateTarget: sql`UPDATE ${s("targets")} SET state = 'active', write_enabled = true, registered_at = clock_timestamp()
WHERE target_id = $1 AND state = 'creating' AND remote_create_state = 'verified' AND capture_epoch = $2
RETURNING target_id;`,
    bumpIndexGeneration: sql`UPDATE ${s("indexes")} SET generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2
RETURNING generation;`,
    insertBuild: sql`INSERT INTO ${s("builds")} (build_id, namespace, definition, kind, new_target_id, old_target_id, expected_read_target_id, expected_read_generation, capture_epoch, phase, operation_id)
SELECT $4, $1, $2, $5, $3, $6, h.target_id, h.generation, $7, 'created', $8
FROM ${s("read_heads")} h WHERE h.namespace = $1 AND h.definition = $2
RETURNING build_id;`,
  } as const;
}

export type TargetSpec = {
  schema: string;
  namespace: string;
  logicalKey: string;
  fingerprint?: string;
  remote?: { client: OpenSearchClient; definition: DefinedSearch; knex?: Knex };
  operationId?: string;
};

export type PreparedTarget = {
  readonly spec: TargetSpec;
  readonly targetId: string;
  readonly physicalIndex: string;
  readonly writeAlias: string;
  readonly operationId: string;
  readonly leaseToken: string;
};

const DEFAULT_FINGERPRINT = "a".repeat(64);

async function inTransaction(run: StatementRunner, work: () => Promise<void>): Promise<void> {
  await run("BEGIN");
  try {
    await run(SET_ADMIN_TIMEOUTS, [...TEST_ADMIN_TIMEOUTS]);
    await work();
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
}

function expectOneRow(result: QueryResult, step: string): void {
  if (result.rowCount !== 1) {
    throw new Error(
      `테스트 대상 등록: ${step}가 1행을 돌려줘야 했지만 ${result.rowCount}행이었습니다.`,
    );
  }
}

export async function prepareTarget(
  run: StatementRunner,
  spec: TargetSpec,
): Promise<PreparedTarget> {
  const q = targetStatements(spec.schema);
  const { namespace, logicalKey } = spec;
  const targetId = randomUUID();
  const physicalIndex = buildPhysicalIndexName(namespace, logicalKey, targetId);
  const writeAlias = buildWriteAliasName(physicalIndex);
  const operationId = spec.operationId ?? `op-create-${targetId}`;
  const leaseToken = randomUUID();
  const attemptToken = randomUUID();
  const fingerprint =
    spec.remote?.definition.fingerprint ?? spec.fingerprint ?? DEFAULT_FINGERPRINT;

  await inTransaction(run, async () => {
    await run(q.ensureIndexRow, [namespace, logicalKey]);
    await run(q.lockBarrierShared, [namespace, logicalKey]);
    await run(q.ensureReadHead, [namespace, logicalKey, 30_000, 600_000, 300_000, 60_000]);
    await run(q.ensureAdminControl, [namespace, logicalKey]);
    expectOneRow(
      await run(q.acquireLease, [
        namespace,
        logicalKey,
        operationId,
        "create",
        "test",
        leaseToken,
        LEASE_MS,
      ]),
      "acquireLease",
    );
    await run(q.lockExistingTarget, [targetId]);
    expectOneRow(
      await run(q.insertTargetIntent, [
        targetId,
        namespace,
        logicalKey,
        physicalIndex,
        writeAlias,
        fingerprint,
        "sonamu-c14n-v1",
        operationId,
      ]),
      "insertTargetIntent",
    );
  });
  await inTransaction(run, async () => {
    await run(q.lockBarrierShared, [namespace, logicalKey]);
    expectOneRow(await run(q.lockHeldLease, [namespace, logicalKey, leaseToken]), "lockHeldLease");
    expectOneRow(await run(q.recordCreateAttempt, [targetId, attemptToken]), "recordCreateAttempt");
  });
  if (spec.remote !== undefined) {
    const { client, definition } = spec.remote;
    await client.indices.create({
      index: physicalIndex,
      body: {
        settings: definition.settings,
        aliases: { [writeAlias]: { is_write_index: true } },
        mappings: composeIndexMappings({
          targetId,
          namespace,
          logicalKey,
          fingerprint: definition.fingerprint,
          hashVersion: definition.hashVersion,
          mappings: definition.mappings,
        }),
      },
    });
  }
  await inTransaction(run, async () => {
    await run(q.lockBarrierShared, [namespace, logicalKey]);
    expectOneRow(await run(q.lockHeldLease, [namespace, logicalKey, leaseToken]), "lockHeldLease");
    expectOneRow(
      await run(q.recordCreateResult, [targetId, attemptToken, "verified"]),
      "recordCreateResult",
    );
  });
  return { spec, targetId, physicalIndex, writeAlias, operationId, leaseToken };
}

export type RegistrationOptions = {
  kind?: "initial" | "rebuild";
  oldTargetId?: string | null;
};

// The caller has run BEGIN, the timeouts and the exclusive barrier; race tests interleave between that and COMMIT.
export async function runRegistrationBody(
  run: StatementRunner,
  prepared: PreparedTarget,
  epoch: number,
  options: RegistrationOptions = {},
): Promise<void> {
  const q = targetStatements(prepared.spec.schema);
  const { namespace, logicalKey } = prepared.spec;
  expectOneRow(
    await run(q.lockHeldLease, [namespace, logicalKey, prepared.leaseToken]),
    "lockHeldLease",
  );
  const writeTargets = await run<{ write_targets: string }>(q.countWriteTargets, [
    namespace,
    logicalKey,
    epoch,
  ]);
  if (Number(writeTargets.rows[0]?.write_targets) >= 2) {
    throw new Error("테스트 대상 등록: 현재 epoch의 쓰기 대상이 이미 둘입니다.");
  }
  expectOneRow(await run(q.activateTarget, [prepared.targetId, epoch]), "activateTarget");
  expectOneRow(await run(q.bumpIndexGeneration, [namespace, logicalKey]), "bumpIndexGeneration");
  expectOneRow(
    await run(q.insertBuild, [
      namespace,
      logicalKey,
      prepared.targetId,
      randomUUID(),
      options.kind ?? "initial",
      options.oldTargetId ?? null,
      epoch,
      prepared.operationId,
    ]),
    "insertBuild",
  );
}

export async function registerTarget(
  run: StatementRunner,
  prepared: PreparedTarget,
  options: RegistrationOptions = {},
): Promise<void> {
  const q = targetStatements(prepared.spec.schema);
  const { namespace, logicalKey } = prepared.spec;
  await inTransaction(run, async () => {
    const locked = await run<{ capture_epoch: number }>(q.lockBarrierExclusive, [
      namespace,
      logicalKey,
    ]);
    await runRegistrationBody(run, prepared, locked.rows[0].capture_epoch, options);
  });
  await releaseLease(run, prepared);
}

export async function releaseLease(run: StatementRunner, prepared: PreparedTarget): Promise<void> {
  const q = targetStatements(prepared.spec.schema);
  await run(q.releaseLease, [
    prepared.spec.namespace,
    prepared.spec.logicalKey,
    prepared.leaseToken,
  ]);
}

export async function closeOpenBuildsForTest(
  run: StatementRunner,
  spec: TargetSpec,
): Promise<void> {
  await run(
    sql`UPDATE ${qualified(spec.schema, "builds")} SET phase = 'retired', closed_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving')`,
    [spec.namespace, spec.logicalKey],
  );
}

const ADMIN_TIMEOUTS = {
  lockTimeoutMs: 5_000,
  // With a 120 s lease one remote request may take (120 s - 4 × 20 s) / 3 ≈ 13.3 s (leasedRemoteRequestTimeoutMs).
  statementTimeoutMs: 20_000,
  idleInTransactionTimeoutMs: 30_000,
  adminLeaseMs: LEASE_MS,
};
const ADMIN_LIFETIMES = { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 };

async function createTargetWithAdmin(
  spec: TargetSpec,
  remote: NonNullable<TargetSpec["remote"]>,
  options: RegistrationOptions,
): Promise<PreparedTarget> {
  const { knex, client, definition } = remote;
  if (knex === undefined) {
    throw new Error("테스트 대상 등록: 실제 관리 경로에는 remote.knex(관리 primary)가 필요합니다.");
  }
  if (definition.key !== spec.logicalKey) {
    throw new Error("테스트 대상 등록: spec.logicalKey와 definition.key가 다릅니다.");
  }
  const searchClient = createSearchClient({
    createClient: () => client,
    ownsClient: false,
    requestTimeoutMs: 30_000,
  });
  try {
    const kind = options.kind ?? "initial";
    let plan;
    let handle;
    if (kind === "initial" && (options.oldTargetId ?? null) === null) {
      const admin = createSearchAdmin({
        client: searchClient,
        synchronization: createPostgresSynchronization({
          getPrimaryDatabase: () => knex,
          schema: spec.schema,
          namespace: spec.namespace,
        }),
        definitions: [definition],
        lifetimes: ADMIN_LIFETIMES,
        timeouts: ADMIN_TIMEOUTS,
        cutover: { maxPendingDocuments: 0, sampleSize: 0 },
        workerBounds: { leaseDurationMs: 30_000, requestTimeoutMs: 30_000 },
      });
      plan = await admin.planCreate(spec.logicalKey);
      const operationId = spec.operationId ?? `op-create-${plan.targetId}`;
      handle = await admin.executeCreate(plan, { operationId, actor: "test", reason: "test" });
    } else {
      const context: RemoteCreateContext = {
        store: createAdminStore({
          getPrimaryDatabase: () => knex,
          schema: spec.schema,
          namespace: spec.namespace,
          timeouts: ADMIN_TIMEOUTS,
        }),
        requester: getSearchRequester(searchClient),
        definitions: new Map([[`${definition.key}@${definition.fingerprint}`, definition]]),
        lifetimes: ADMIN_LIFETIMES,
        binding: createPostgresSynchronization({
          getPrimaryDatabase: () => knex,
          schema: spec.schema,
          namespace: spec.namespace,
        }),
      };
      plan = await planCreate(context, spec.logicalKey);
      const operationId = spec.operationId ?? `op-create-${plan.targetId}`;
      handle = await executeCreate(
        context,
        plan,
        { operationId, actor: "test", reason: "test" },
        { registration: { kind, oldTargetId: options.oldTargetId ?? null } },
      );
    }
    return {
      spec,
      targetId: handle.targetId,
      physicalIndex: handle.physicalIndex,
      writeAlias: handle.writeAlias,
      operationId: spec.operationId ?? `op-create-${plan.targetId}`,
      leaseToken: randomUUID(),
    };
  } finally {
    await searchClient.close();
  }
}

export async function createTarget(
  run: StatementRunner,
  spec: TargetSpec,
  options: RegistrationOptions = {},
): Promise<PreparedTarget> {
  if (spec.remote !== undefined) return createTargetWithAdmin(spec, spec.remote, options);
  const prepared = await prepareTarget(run, spec);
  await registerTarget(run, prepared, options);
  return prepared;
}

export async function openAdminClient(
  h: IntegrationHarness,
  name = "targets",
): Promise<{ run: StatementRunner; close(): Promise<void> }> {
  const client = new PgClient({ connectionString: h.connectionString(name) });
  client.on("error", () => {});
  await client.connect();
  return { run: clientRunner(client), close: () => client.end() };
}

export async function resetSearchSchema(h: IntegrationHarness): Promise<string> {
  await h.knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(h.searchSchema)} CASCADE`);
  const report = await installSearchSchema(h.knex, { schema: h.searchSchema });
  return report.storeId;
}

export async function readLedger(h: IntegrationHarness): Promise<Record<string, number>> {
  const { rows } = await h.knex.raw<{ rows: { document_id: string; revision: string }[] }>(
    sql`SELECT document_id, revision FROM ${qualified(h.searchSchema, "documents")} ORDER BY document_id COLLATE "C"`,
  );
  return Object.fromEntries(rows.map((row) => [row.document_id, Number(row.revision)]));
}

export async function readDeliveries(h: IntegrationHarness): Promise<Record<string, number>> {
  const { rows } = await h.knex.raw<{
    rows: { target_id: string; document_id: string; desired_revision: string }[];
  }>(
    sql`SELECT target_id, document_id, desired_revision FROM ${qualified(h.searchSchema, "deliveries")} ORDER BY 1, 2`,
  );
  return Object.fromEntries(
    rows.map((row) => [`${row.target_id}/${row.document_id}`, Number(row.desired_revision)]),
  );
}

export async function backendPid(trx: Knex.Transaction): Promise<number> {
  const { rows } = await trx.raw<{ rows: { pid: number }[] }>("SELECT pg_backend_pid() AS pid");
  return rows[0].pid;
}

export async function waitForLockWait(
  observer: Knex,
  pid: number,
  blockerPid?: number,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    const { rows } = await observer.raw<{
      rows: { wait_event_type: string | null; blocking: number[] }[];
    }>(
      "SELECT wait_event_type, pg_blocking_pids(pid) AS blocking FROM pg_stat_activity WHERE pid = ?",
      [pid],
    );
    last = rows[0];
    if (
      rows[0]?.wait_event_type === "Lock" &&
      (blockerPid === undefined || rows[0].blocking.includes(blockerPid))
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(
    `PID ${pid}의 잠금 대기가 ${timeoutMs}ms 안에 관찰되지 않았습니다: ${JSON.stringify(last)}`,
  );
}
