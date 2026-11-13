import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { z } from "zod";

import { HASH_VERSION, sha256HexSchema } from "../definition/canonical-json";
import { buildPhysicalIndexName, buildWriteAliasName, isTargetId } from "../definition/names";
import {
  SearchAdminLeaseLost,
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchError,
} from "../errors";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { type AdminOperation, type AdminStore, invalidAdminRow, singleRow } from "./admin-lease";
import {
  adminLifetimesSchema,
  attemptRowSchema,
  buildIdRowSchema,
  failedRowSchema,
  generationRowSchema,
  insertedTargetRowSchema,
  liveTargetsRowSchema,
  pendingResumeTargetRowSchema,
  planStateRowSchema,
  reconciledRowSchema,
  registeredRowSchema,
  remoteCreateResultRowSchema,
  type remoteCreateStateSchema,
  retirementStateRowSchema,
  targetIdentityRowSchema,
  targetIntentRowSchema,
  writeTargetsRowSchema,
} from "./rows";

type RemoteCreateState = z.infer<typeof remoteCreateStateSchema>;
export type AdminLifetimes = z.infer<typeof adminLifetimesSchema>;

// The target intent is one READ COMMITTED transaction that takes the shared barrier before any other row:
// ensureIndexRow, barrier, ensureReadHead, ensureAdminControl, acquireLease, lockExistingTarget, insertTargetIntent.
// Their foreign keys need FOR KEY SHARE on the indexes row, which the held FOR SHARE already covers, so the control row
// is never held while waiting for the barrier. Every lockExistingTarget branch is decided before any remote command.
// Fenced writes fence database writes only, so a creator that lost its token undoes nothing remotely.

export interface TargetIntentInput {
  targetId: string;
  physicalIndex: string;
  writeAlias: string;
  fingerprint: string;
  hashVersion: string;
}

export type TargetIntentAction =
  | "recorded"
  | "create-pending"
  | "registration-pending"
  | "registered";

export interface TargetIntentResult {
  action: TargetIntentAction;
  captureEpoch: number;
  remoteCreateState: RemoteCreateState;
}

interface TargetStatements {
  readonly ensureIndexRow: SqlFragment;
  readonly ensureReadHead: SqlFragment;
  readonly ensureAdminControl: SqlFragment;
  readonly lockExistingTarget: SqlFragment;
  readonly insertTargetIntent: SqlFragment;
  readonly countOtherLiveTargets: SqlFragment;
  readonly readTargetById: SqlFragment;
  readonly readIndexPlanState: SqlFragment;
  readonly recordCreateAttempt: SqlFragment;
  readonly recordCreateResult: SqlFragment;
  readonly failCreatingTarget: SqlFragment;
  readonly recordReconciliation: SqlFragment;
  readonly countWriteTargets: SqlFragment;
  readonly activateTarget: SqlFragment;
  readonly bumpIndexGeneration: SqlFragment;
  readonly insertBuild: SqlFragment;
  readonly resumeIndexCapture: SqlFragment;
  readonly listPendingResumeTargets: SqlFragment;
  readonly readRetirementProgress: SqlFragment;
}

function renderTargetStatements(schema: string): TargetStatements {
  const s = schemaIdentifier(schema);
  const store = qualified(s, "store");
  const indexes = qualified(s, "indexes");
  const readHeads = qualified(s, "read_heads");
  const controls = qualified(s, "admin_controls");
  const targets = qualified(s, "targets");
  const builds = qualified(s, "builds");
  return {
    ensureIndexRow: sql`INSERT INTO ${indexes} (namespace, definition, store_id)
SELECT $1, $2, store_id FROM ${store}
ON CONFLICT (namespace, definition) DO NOTHING;`,
    ensureReadHead: sql`INSERT INTO ${readHeads} (namespace, definition, max_search_lifetime_ms, max_cursor_lifetime_ms, max_pit_keep_alive_ms, retirement_safety_margin_ms)
VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (namespace, definition) DO NOTHING;`,
    ensureAdminControl: sql`INSERT INTO ${controls} (namespace, definition) VALUES ($1, $2) ON CONFLICT (namespace, definition) DO NOTHING;`,
    lockExistingTarget: sql`SELECT state, remote_create_state, capture_epoch, fingerprint, create_operation_id
FROM ${targets} WHERE target_id = $1 FOR UPDATE;`,
    insertTargetIntent: sql`INSERT INTO ${targets} (target_id, namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch, state, write_enabled, create_operation_id)
SELECT $1, $2, $3, $4, $5, $6, $7, i.capture_epoch, 'creating', false, $8
FROM ${indexes} i WHERE i.namespace = $2 AND i.definition = $3
ON CONFLICT (target_id) DO NOTHING
RETURNING target_id;`,
    countOtherLiveTargets: sql`SELECT count(*) AS live_targets FROM ${targets}
WHERE namespace = $1 AND definition = $2 AND target_id <> $3 AND state IN ('creating', 'active', 'paused');`,
    readTargetById: sql`SELECT namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch,
       state, remote_create_state
FROM ${targets} WHERE target_id = $1;`,
    readIndexPlanState: sql`SELECT i.capture_mode, i.capture_epoch,
       (SELECT count(*) FROM ${targets} t
        WHERE t.namespace = i.namespace AND t.definition = i.definition
          AND t.state IN ('creating', 'active', 'paused')) AS live_targets
FROM ${indexes} i WHERE i.namespace = $1 AND i.definition = $2;`,
    // Commits before the remote command; no row means another attempt exists, so nothing is sent.
    recordCreateAttempt: sql`UPDATE ${targets}
SET remote_create_state = 'in_flight', remote_create_token = $2::uuid, remote_create_attempts = remote_create_attempts + 1,
    remote_create_started_at = clock_timestamp(), remote_create_finished_at = NULL
WHERE target_id = $1 AND state = 'creating' AND remote_create_state = 'not_started'
RETURNING remote_create_attempts;`,
    recordCreateResult: sql`UPDATE ${targets}
SET remote_create_state = $3, remote_create_finished_at = clock_timestamp()
WHERE target_id = $1 AND state = 'creating' AND remote_create_state = 'in_flight' AND remote_create_token = $2::uuid
RETURNING remote_create_state;`,
    failCreatingTarget: sql`UPDATE ${targets}
SET state = 'failed', remote_create_state = $3, remote_create_finished_at = clock_timestamp()
WHERE target_id = $1 AND state = 'creating' AND remote_create_state IN ('in_flight', 'verified')
  AND ($2::uuid IS NULL OR remote_create_token = $2::uuid)
RETURNING state;`,
    recordReconciliation: sql`UPDATE ${targets}
SET remote_create_state = $2, remote_create_token = NULL, remote_create_finished_at = clock_timestamp(),
    state = CASE WHEN $2 = 'abandoned' THEN 'failed' ELSE state END
WHERE target_id = $1 AND state = 'creating' AND remote_create_state IN ('in_flight', 'ambiguous')
RETURNING state, remote_create_state;`,
    countWriteTargets: sql`SELECT count(*) AS write_targets FROM ${targets}
WHERE namespace = $1 AND definition = $2 AND write_enabled AND capture_epoch = $3;`,
    activateTarget: sql`UPDATE ${targets} SET state = 'active', write_enabled = true, registered_at = clock_timestamp()
WHERE target_id = $1 AND state = 'creating' AND remote_create_state = 'verified' AND capture_epoch = $2
RETURNING target_id;`,
    bumpIndexGeneration: sql`UPDATE ${indexes} SET generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2
RETURNING generation;`,
    // The only place a build is created.
    insertBuild: sql`INSERT INTO ${builds} (build_id, namespace, definition, kind, new_target_id, old_target_id, expected_read_target_id, expected_read_generation, capture_epoch, phase, operation_id)
SELECT $4, $1, $2, $5, $3, $6, h.target_id, h.generation, $7, 'created', $8
FROM ${readHeads} h WHERE h.namespace = $1 AND h.definition = $2
RETURNING build_id;`,
    resumeIndexCapture: sql`UPDATE ${indexes} SET capture_mode = 'active', generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND capture_mode = 'suspended'
RETURNING generation;`,
    listPendingResumeTargets: sql`SELECT t.target_id, t.physical_index, t.write_alias, t.fingerprint, t.hash_version, t.remote_create_state
FROM ${targets} t
JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
WHERE t.namespace = $1 AND t.definition = $2 AND t.state = 'creating' AND t.capture_epoch = i.capture_epoch
ORDER BY t.created_at, t.target_id;`,
    readRetirementProgress: sql`SELECT namespace, definition, physical_index, write_alias, fingerprint, hash_version, state, remote_create_state,
       (alias_removed_at IS NOT NULL) AS alias_removed, (index_deleted_at IS NOT NULL) AS index_deleted
FROM ${targets} WHERE target_id = $1;`,
  };
}

const statementCache = createSchemaStatementCache(renderTargetStatements);

function statementsFor(schema: string): TargetStatements {
  return statementCache.get(schema);
}

function invalidInput(field: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "admin.invalidTargetIntent", params: { field } },
    { details: { reason: "invalid-target-intent", field } },
  );
}

function validateInput(namespace: string, logicalKey: string, input: TargetIntentInput): void {
  if (!isTargetId(input.targetId)) throw invalidInput("targetId");
  let physicalIndex: string;
  try {
    physicalIndex = buildPhysicalIndexName(namespace, logicalKey, input.targetId);
  } catch {
    throw invalidInput("physicalIndex");
  }
  if (input.physicalIndex !== physicalIndex) throw invalidInput("physicalIndex");
  if (input.writeAlias !== buildWriteAliasName(physicalIndex)) throw invalidInput("writeAlias");
  if (!sha256HexSchema.safeParse(input.fingerprint).success) throw invalidInput("fingerprint");
  if (input.hashVersion !== HASH_VERSION) throw invalidInput("hashVersion");
}

function precondition(reason: string, state: string): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.targetIntentRefused", params: { reason, state } },
    { details: { reason, state } },
  );
}

function branch(row: z.infer<typeof targetIntentRowSchema>): TargetIntentAction {
  switch (row.state) {
    case "retiring":
    case "retired":
    case "failed":
    // A detached identity's remote objects may belong to the original store: neither recreate nor verify them.
    case "detached":
      throw precondition("target-identity-terminal", row.state);
    case "active":
    case "paused":
      return "registered";
    case "creating":
      break;
  }
  switch (row.remote_create_state) {
    case "not_started":
      return "create-pending";
    case "verified":
      return "registration-pending";
    case "in_flight":
    case "ambiguous":
      throw precondition("remote-create-unresolved", row.remote_create_state);
    case "abandoned":
      // The DDL pairs abandoned only with failed, but a hand-edited row is treated as terminal too.
      throw precondition("target-identity-terminal", row.remote_create_state);
  }
}

export interface TargetIntentGuards {
  requireActiveCapture?: boolean;
  requireSuspendedCapture?: boolean;
  exclusiveInitial?: boolean;
}

export async function recordTargetIntent(
  operation: AdminOperation,
  input: TargetIntentInput,
  lifetimes: AdminLifetimes,
  guards: TargetIntentGuards = {},
): Promise<TargetIntentResult> {
  const { store, request } = operation;
  const { namespace } = store;
  const { logicalKey } = request;
  validateInput(namespace, logicalKey, input);
  const limits = adminLifetimesSchema.safeParse(lifetimes);
  if (!limits.success) throw invalidInput("lifetimes");
  const q = statementsFor(store.schema);
  const key = [namespace, logicalKey] as const;

  return store.transaction(async (trx: Knex.Transaction) => {
    await store.execute(trx, statement(q.ensureIndexRow, key));
    const barrier = await operation.lockBarrier(trx, "shared");
    await store.execute(
      trx,
      statement(q.ensureReadHead, [
        ...key,
        limits.data.maxSearchLifetimeMs,
        limits.data.maxCursorLifetimeMs,
        limits.data.maxPitKeepAliveMs,
        limits.data.retirementSafetyMarginMs,
      ]),
    );
    await store.execute(trx, statement(q.ensureAdminControl, key));
    await operation.acquireWithin(trx);

    const checkGuards = async (): Promise<void> => {
      if (guards.requireActiveCapture === true && barrier.capture_mode !== "active") {
        throw precondition("capture-suspended", barrier.capture_mode);
      }
      if (guards.requireSuspendedCapture === true && barrier.capture_mode !== "suspended") {
        throw precondition("capture-not-suspended", barrier.capture_mode);
      }
      if (guards.exclusiveInitial === true) {
        const live = singleRow(
          await store.execute(trx, statement(q.countOtherLiveTargets, [...key, input.targetId])),
          liveTargetsRowSchema,
          "countOtherLiveTargets",
        );
        if (live === undefined) throw invalidAdminRow("countOtherLiveTargets");
        if (live.live_targets > 0) throw precondition("index-has-live-target", "live");
      }
    };

    const existing = singleRow(
      await store.execute(trx, statement(q.lockExistingTarget, [input.targetId])),
      targetIntentRowSchema,
      "lockExistingTarget",
    );
    let result: TargetIntentResult;
    if (existing === undefined) {
      await checkGuards();
      const inserted = singleRow(
        await store.execute(
          trx,
          statement(q.insertTargetIntent, [
            input.targetId,
            ...key,
            input.physicalIndex,
            input.writeAlias,
            input.fingerprint,
            input.hashVersion,
            request.operationId,
          ]),
        ),
        insertedTargetRowSchema,
        "insertTargetIntent",
      );
      // lockExistingTarget saw no row but the insert conflicted: another transaction recorded the same ID. Do not
      // overwrite it.
      if (inserted === undefined) throw precondition("target-intent-conflict", "creating");
      result = {
        action: "recorded",
        captureEpoch: barrier.capture_epoch,
        remoteCreateState: "not_started",
      };
    } else {
      if (existing.fingerprint !== input.fingerprint) {
        throw precondition("target-identity-mismatch", existing.state);
      }
      const action = branch(existing);
      if (action !== "registered") await checkGuards();
      result = {
        action,
        captureEpoch: existing.capture_epoch,
        remoteCreateState: existing.remote_create_state,
      };
    }
    await operation.audit(trx, {
      outcome: "started",
      targetId: input.targetId,
      detail: { step: "target-intent", action: result.action },
    });
    return result;
  });
}

export type TargetIdentityRow = z.infer<typeof targetIdentityRowSchema>;

export interface PlanState {
  captureMode: "active" | "suspended";
  captureEpoch: number;
  liveTargets: number;
}

export async function readPlanState(store: AdminStore, logicalKey: string): Promise<PlanState> {
  const q = statementsFor(store.schema);
  return store.transaction(
    async (trx) => {
      const row = singleRow(
        await store.execute(trx, statement(q.readIndexPlanState, [store.namespace, logicalKey])),
        planStateRowSchema,
        "readIndexPlanState",
      );
      if (row === undefined) return { captureMode: "active", captureEpoch: 1, liveTargets: 0 };
      return {
        captureMode: row.capture_mode,
        captureEpoch: row.capture_epoch,
        liveTargets: row.live_targets,
      };
    },
    { readOnly: true },
  );
}

export async function readTargetIdentity(
  store: AdminStore,
  targetId: string,
): Promise<TargetIdentityRow | undefined> {
  const q = statementsFor(store.schema);
  return store.transaction(
    async (trx) =>
      singleRow(
        await store.execute(trx, statement(q.readTargetById, [targetId])),
        targetIdentityRowSchema,
        "readTargetById",
      ),
    { readOnly: true },
  );
}

function tokenLost(logicalKey: string, targetId: string, statementId: string) {
  return new SearchAdminLeaseLost(
    { key: "admin.leaseLost", params: { logicalKey } },
    {
      details: {
        reason: "remote-create-token-lost",
        logicalKey,
        targetId,
        statement: statementId,
      },
    },
  );
}

export async function beginRemoteCreate(
  operation: AdminOperation,
  targetId: string,
  attemptToken: string,
): Promise<number> {
  const { store } = operation;
  const q = statementsFor(store.schema);
  return operation.fenced(
    "shared",
    async (trx) => {
      const row = singleRow(
        await store.execute(trx, statement(q.recordCreateAttempt, [targetId, attemptToken])),
        attemptRowSchema,
        "recordCreateAttempt",
      );
      if (row === undefined) throw precondition("remote-create-unresolved", "in_flight");
      return row.remote_create_attempts;
    },
    (attempt) => ({
      outcome: "started",
      targetId,
      detail: { step: "remote-create-attempt", attempt },
    }),
  );
}

export async function finishRemoteCreate(
  operation: AdminOperation,
  targetId: string,
  attemptToken: string,
  result: "verified" | "not_started" | "ambiguous",
  detail: Readonly<Record<string, string | number | boolean | null>> = {},
): Promise<void> {
  const { store } = operation;
  const q = statementsFor(store.schema);
  await operation.fenced(
    "shared",
    async (trx) => {
      const row = singleRow(
        await store.execute(trx, statement(q.recordCreateResult, [targetId, attemptToken, result])),
        remoteCreateResultRowSchema,
        "recordCreateResult",
      );
      if (row === undefined)
        throw tokenLost(operation.request.logicalKey, targetId, "recordCreateResult");
    },
    () => ({
      outcome: "started",
      targetId,
      detail: { ...detail, step: "remote-create-result", result },
    }),
  );
}

export async function abandonRemoteCreate(
  operation: AdminOperation,
  targetId: string,
  attemptToken: string,
  detail: Readonly<Record<string, string | number | boolean | null>> = {},
): Promise<void> {
  const { store } = operation;
  const q = statementsFor(store.schema);
  await operation.fenced(
    "shared",
    async (trx) => {
      const row = singleRow(
        await store.execute(
          trx,
          statement(q.failCreatingTarget, [targetId, attemptToken, "abandoned"]),
        ),
        failedRowSchema,
        "failCreatingTarget",
      );
      if (row === undefined)
        throw tokenLost(operation.request.logicalKey, targetId, "failCreatingTarget");
    },
    () => ({
      outcome: "started",
      targetId,
      detail: { ...detail, step: "remote-create-result", result: "abandoned" },
    }),
  );
}

export async function reconcileRemoteCreate(
  operation: AdminOperation,
  targetId: string,
  result: "verified" | "abandoned",
  detail: Readonly<Record<string, string | number | boolean | null>> = {},
): Promise<z.infer<typeof reconciledRowSchema>> {
  const { store } = operation;
  const q = statementsFor(store.schema);
  return operation.fenced(
    "shared",
    async (trx) => {
      const row = singleRow(
        await store.execute(trx, statement(q.recordReconciliation, [targetId, result])),
        reconciledRowSchema,
        "recordReconciliation",
      );
      if (row === undefined) throw precondition("remote-create-not-unresolved", "resolved");
      return row;
    },
    (row) => ({
      outcome: "succeeded",
      targetId,
      detail: { ...detail, step: "reconcile-create", result: row.remote_create_state },
    }),
  );
}

export interface RegistrationInput {
  targetId: string;
  kind: "initial" | "rebuild";
  oldTargetId: string | null;
}

export interface RegistrationResult {
  buildId: string;
  generation: number;
  captureEpoch: number;
}

type RegistrationOutcome =
  | ({ kind: "registered" } & RegistrationResult)
  | { kind: "epoch-invalidated" };

function registrationRefused(reason: string, state: string): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.registrationRefused", params: { reason, state } },
    { details: { reason, state } },
  );
}

// insertBuild hit builds_one_open_idx (a build is already open).
const openBuildViolationSchema = z.looseObject({
  sqlstate: z.literal("23505"),
  constraint: z.literal("builds_one_open_idx"),
});

export async function registerTarget(
  operation: AdminOperation,
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const { store } = operation;
  const q = statementsFor(store.schema);
  const key = [store.namespace, operation.request.logicalKey] as const;
  const buildId = randomUUID();
  let outcome: RegistrationOutcome;
  try {
    outcome = await operation.fenced(
      "exclusive",
      async (trx, barrier): Promise<RegistrationOutcome> => {
        if (barrier.capture_mode !== "active") {
          throw registrationRefused("capture-suspended", barrier.capture_mode);
        }
        const epoch = barrier.capture_epoch;
        const writers = singleRow(
          await store.execute(trx, statement(q.countWriteTargets, [...key, epoch])),
          writeTargetsRowSchema,
          "countWriteTargets",
        );
        if (writers === undefined) throw invalidAdminRow("countWriteTargets");
        if (writers.write_targets >= 2) throw registrationRefused("write-target-limit", "active");
        const registered = singleRow(
          await store.execute(trx, statement(q.activateTarget, [input.targetId, epoch])),
          registeredRowSchema,
          "activateTarget",
        );
        if (registered === undefined) {
          const row = singleRow(
            await store.execute(trx, statement(q.lockExistingTarget, [input.targetId])),
            targetIntentRowSchema,
            "lockExistingTarget",
          );
          if (
            row?.state === "creating" &&
            row.remote_create_state === "verified" &&
            row.capture_epoch !== epoch
          ) {
            const failed = singleRow(
              await store.execute(
                trx,
                statement(q.failCreatingTarget, [input.targetId, null, "verified"]),
              ),
              failedRowSchema,
              "failCreatingTarget",
            );
            if (failed === undefined) throw invalidAdminRow("failCreatingTarget");
            return { kind: "epoch-invalidated" };
          }
          throw registrationRefused("target-not-registrable", row?.state ?? "missing");
        }
        const generation = singleRow(
          await store.execute(trx, statement(q.bumpIndexGeneration, key)),
          generationRowSchema,
          "bumpIndexGeneration",
        );
        if (generation === undefined) throw invalidAdminRow("bumpIndexGeneration");
        const build = singleRow(
          await store.execute(
            trx,
            statement(q.insertBuild, [
              ...key,
              input.targetId,
              buildId,
              input.kind,
              input.oldTargetId,
              epoch,
              operation.request.operationId,
            ]),
          ),
          buildIdRowSchema,
          "insertBuild",
        );
        if (build === undefined) throw invalidAdminRow("insertBuild");
        return {
          kind: "registered",
          buildId: build.build_id,
          generation: generation.generation,
          captureEpoch: epoch,
        };
      },
      (result) =>
        result.kind === "registered"
          ? {
              outcome: "succeeded",
              targetId: input.targetId,
              buildId: result.buildId,
              detail: { step: "registration", kind: input.kind, generation: result.generation },
            }
          : {
              outcome: "started",
              targetId: input.targetId,
              detail: { step: "registration", result: "target-epoch-invalidated" },
            },
    );
  } catch (error) {
    if (
      error instanceof SearchError &&
      openBuildViolationSchema.safeParse(error.details ?? {}).success
    ) {
      throw registrationRefused("open-build-exists", "open");
    }
    throw error;
  }
  if (outcome.kind === "epoch-invalidated") {
    throw registrationRefused("target-epoch-invalidated", "failed");
  }
  return outcome;
}

export type PendingResumeTarget = z.infer<typeof pendingResumeTargetRowSchema>;

export async function readPendingResumeTargets(
  store: AdminStore,
  logicalKey: string,
): Promise<PendingResumeTarget[]> {
  const q = statementsFor(store.schema);
  return store.transaction(
    async (trx) =>
      (
        await store.execute(
          trx,
          statement(q.listPendingResumeTargets, [store.namespace, logicalKey]),
        )
      ).rows.map((raw) => {
        const row = pendingResumeTargetRowSchema.safeParse(raw);
        if (!row.success) throw invalidAdminRow("listPendingResumeTargets");
        return row.data;
      }),
    { readOnly: true },
  );
}

export type RetirementStateRow = z.infer<typeof retirementStateRowSchema>;

export async function readRetirementState(
  store: AdminStore,
  targetId: string,
): Promise<RetirementStateRow | undefined> {
  const q = statementsFor(store.schema);
  return store.transaction(
    async (trx) =>
      singleRow(
        await store.execute(trx, statement(q.readRetirementProgress, [targetId])),
        retirementStateRowSchema,
        "readRetirementProgress",
      ),
    { readOnly: true },
  );
}

export async function registerResume(
  operation: AdminOperation,
  targetId: string,
): Promise<RegistrationResult> {
  const { store } = operation;
  const q = statementsFor(store.schema);
  const key = [store.namespace, operation.request.logicalKey] as const;
  const buildId = randomUUID();
  try {
    return await operation.fenced(
      "exclusive",
      async (trx, barrier): Promise<RegistrationResult> => {
        if (barrier.capture_mode !== "suspended") {
          throw registrationRefused("capture-not-suspended", barrier.capture_mode);
        }
        const epoch = barrier.capture_epoch;
        const writers = singleRow(
          await store.execute(trx, statement(q.countWriteTargets, [...key, epoch])),
          writeTargetsRowSchema,
          "countWriteTargets",
        );
        if (writers === undefined) throw invalidAdminRow("countWriteTargets");
        if (writers.write_targets >= 2) throw registrationRefused("write-target-limit", "active");
        const registered = singleRow(
          await store.execute(trx, statement(q.activateTarget, [targetId, epoch])),
          registeredRowSchema,
          "activateTarget",
        );
        // The epoch cannot change while suspended, so no row means the identity is in another state.
        if (registered === undefined)
          throw registrationRefused("target-not-registrable", "creating");
        const resumed = singleRow(
          await store.execute(trx, statement(q.resumeIndexCapture, key)),
          generationRowSchema,
          "resumeIndexCapture",
        );
        if (resumed === undefined) throw invalidAdminRow("resumeIndexCapture");
        const build = singleRow(
          await store.execute(
            trx,
            statement(q.insertBuild, [
              ...key,
              targetId,
              buildId,
              "resume",
              null,
              epoch,
              operation.request.operationId,
            ]),
          ),
          buildIdRowSchema,
          "insertBuild",
        );
        if (build === undefined) throw invalidAdminRow("insertBuild");
        return { buildId: build.build_id, generation: resumed.generation, captureEpoch: epoch };
      },
      (result) => ({
        outcome: "succeeded",
        targetId,
        buildId: result.buildId,
        detail: { step: "resume-registration", generation: result.generation },
      }),
    );
  } catch (error) {
    if (
      error instanceof SearchError &&
      openBuildViolationSchema.safeParse(error.details ?? {}).success
    ) {
      throw registrationRefused("open-build-exists", "open");
    }
    throw error;
  }
}
