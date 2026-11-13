import { type Knex } from "knex";
import { type z } from "zod";

import {
  getSearchRequester,
  type SearchClient,
  type SearchRequester,
} from "../client/search-client";
import { type DefinedSearch } from "../definition/define-search";
import { SearchAdminPreconditionFailed, SearchConfigurationError } from "../errors";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { type PostgresSynchronization } from "../postgres/synchronization";
import { WORKER_HEARTBEAT_EXPIRY_MS } from "../postgres/worker-heartbeat";
import { type ReadLifetimeLimits, type TargetState } from "../query/catalog";
import { type AdminStore, createAdminStore, invalidAdminRow, singleRow } from "./admin-lease";
import {
  type BackfillProgress,
  beginRebuild as beginRebuildWith,
  type BuildContext,
  type BuildHandle,
  buildNotFound,
  type RebuildInput,
  runBackfillPage as runBackfillPageWith,
} from "./builds";
import {
  type CaptureModeContext,
  resumeCaptureForRebuild as resumeCaptureForRebuildWith,
  retireTarget as retireTargetWith,
  suspendCapture as suspendCaptureWith,
} from "./capture-mode";
import {
  cutover as cutoverWith,
  type CutoverResult,
  cutoverStatementsFor,
  rollback as rollbackWith,
} from "./cutover";
import { adminFenceStoreFor } from "./fences";
import {
  changeReadLifetimes as changeReadLifetimesWith,
  type ReadLifetimeChange,
  type ReadLifetimes,
} from "./lifetimes";
import {
  type CreatePlan,
  executeCreate as executeCreateWith,
  leaseBoundRequester,
  planCreate as planCreateWith,
  type RemoteCreateContext,
  reconcileCreate as reconcileCreateWith,
} from "./remote-create";
import {
  type DocumentScope,
  remark as remarkWith,
  type RemarkReport,
  type RepairContext,
  retryQuarantined as retryQuarantinedWith,
  type RetryReport,
  type RetryScope,
} from "./repair";
import {
  type ResumeTargetContext,
  resumeTarget as resumeTargetWith,
  runTargetVerificationPage as runTargetVerificationPageWith,
  type VerificationProgress,
  type VerificationViolation,
} from "./resume-target";
import {
  buildIdArgumentSchema,
  type buildKindSchema,
  type buildPhaseSchema,
  indexStateRowSchema,
  inspectedBuildRowSchema,
  inspectedTargetRowSchema,
  inspectOptionsSchema,
  backlogRowSchema,
  logicalKeyArgumentSchema,
  openBuildRowSchema,
  type pauseReasonSchema,
  type remoteCreateStateSchema,
  searchAdminOptionsSchema,
  targetBacklogRowSchema,
  workerHeartbeatRowSchema,
} from "./rows";
import {
  adoptCopiedStore as adoptCopiedStoreWith,
  type AdoptCopiedStoreResult,
  confirmStoreOwnership as confirmStoreOwnershipWith,
  type ConfirmStoreOwnershipResult,
  type DetachedTarget,
} from "./store-ownership";

/** Audit context, stored verbatim in admin_operations; never put secrets in it. */
export interface AdminContext {
  operationId: string;
  actor: string;
  reason: string;
}
export interface BatchOptions {
  limit: number;
  signal?: AbortSignal;
}
export type RemoteCreateState = z.infer<typeof remoteCreateStateSchema>;
export type BuildPhase = z.infer<typeof buildPhaseSchema>;
export type BuildKind = z.infer<typeof buildKindSchema>;
export type PauseReason = z.infer<typeof pauseReasonSchema>;

export interface TargetHandle {
  targetId: string;
  physicalIndex: string;
  writeAlias: string;
  fingerprint: string;
  captureEpoch: number;
  remoteCreateState: RemoteCreateState;
}

/** Queue counts of one target; in bounded mode a count that reached limit is a lower bound and exact is false. */
export interface TargetLag {
  pending: number;
  quarantined: number;
  oldestPendingAgeMs: number | null;
  intents: number;
  leased: number;
  delayed: number;
  exact: boolean;
  limit: number | null;
}

export interface InspectOptions {
  /** "exact" counts the whole queue; avoid it for frequent monitoring. */
  counts?: "bounded" | "exact";
  /** Rows read per count in bounded mode (1–1,000,000). */
  countLimit?: number;
}

export const DEFAULT_INSPECT_COUNT_LIMIT = 10_000;

export interface BuildInspection {
  buildId: string;
  phase: BuildPhase;
  kind: BuildKind;
  captureEpoch: number;
  currentCaptureEpoch: number;
  scan: {
    boundary?: string;
    cursor?: string;
    completed: boolean;
    pages: number;
    documents: number;
  };
  newTarget: TargetLag;
  oldTarget?: TargetLag;
  /** PostgreSQL-checkable conditions only; remote checks and sample verification are not included. */
  eligibleForCutover: boolean;
  blockers: readonly string[];
}

export interface InspectedTarget extends TargetHandle {
  state: TargetState;
  writeEnabled: boolean;
  deselectedAt: number | null;
  deselectConfirmedAt: number | null;
  pauseReason: PauseReason | null;
  remoteCreateStartedAt: number | null;
  verification: {
    startedAt: number | null;
    completedAt: number | null;
    checked: number;
    violations: number;
  };
  /** Always null: inspect does not read the remote side. */
  remote: { exists: boolean; aliasPresent: boolean; metaMatches: boolean } | null;
  /** As recorded by this database; when lost, nothing is sent until confirmStoreOwnership or adoptCopiedStore. */
  fence: {
    epoch: number;
    pending: boolean;
    renewedAgeMs: number | null;
    lost: boolean;
    lostDetail: {
      class: "behind" | "regressed" | "foreign";
      localEpoch: number;
      remoteEpoch: number;
    } | null;
  };
  /** null for retired, failed and detached targets. */
  backlog: TargetLag | null;
}

export interface IndexInspection {
  logicalKey: string;
  /** false when no target intent was ever recorded; then only binding and workers are meaningful. */
  registered: boolean;
  captureMode: "active" | "suspended";
  captureEpoch: number;
  generation: number;
  readHead: { targetId: string | null; generation: number; rebuildRequired: boolean };
  /** Recorded maxima in ms; the retirement grace is cursor + search + margin. */
  lifetimes: {
    maxSearchLifetimeMs: number;
    maxCursorLifetimeMs: number;
    maxPitKeepAliveMs: number;
    retirementSafetyMarginMs: number;
  } | null;
  targets: readonly InspectedTarget[];
  openBuild: BuildInspection | null;
  /** Heartbeats older than WORKER_HEARTBEAT_EXPIRY_MS (24 hours) are left out. */
  workers: readonly { workerId: string; fingerprints: readonly string[]; heartbeatAgeMs: number }[];
  /** Store-wide; any false value stops workers and remote admin operations with SearchStoreMismatch. */
  binding: {
    storeId: string;
    originRecorded: boolean;
    originMatches: boolean;
    instanceMatches: boolean;
  };
}

export type { BackfillProgress, BuildHandle, CreatePlan, CutoverResult, RebuildInput };
export type { AdoptCopiedStoreResult, ConfirmStoreOwnershipResult, DetachedTarget };
export type { ReadLifetimeChange, ReadLifetimes };
export type {
  DocumentScope,
  RemarkReport,
  RetryReport,
  RetryScope,
  VerificationProgress,
  VerificationViolation,
};

export interface SearchAdmin {
  /** Reads one logical key's PostgreSQL state without locks or a lease; an unregistered key gives registered: false. */
  inspect(logicalKey: string, options?: InspectOptions): Promise<IndexInspection>;
  /** Plans one versioned physical index without creating or recording anything. */
  planCreate(logicalKey: string, options?: PlanCreateOptions): Promise<CreatePlan>;
  /** Creates and registers the planned target; an attempt with an unknown result stays ambiguous until reconcileCreate. */
  executeCreate(plan: CreatePlan, audit: AdminContext): Promise<TargetHandle>;
  /** Resolves an in_flight or ambiguous create attempt; refused without confirmQuiescent, deletes nothing. */
  reconcileCreate(
    targetId: string,
    input: { confirmQuiescent: true },
    audit: AdminContext,
  ): Promise<TargetHandle>;
  /** Starts a rebuild, or returns the open build with the same fingerprint without writing. */
  beginRebuild(input: RebuildInput, audit: AdminContext): Promise<BuildHandle>;
  /** Runs one backfill step; call until done. */
  runBackfillPage(buildId: string, options: BatchOptions): Promise<BackfillProgress>;
  /** Reads one build's progress and cutover blockers without locking. */
  inspectBuild(buildId: string, options?: InspectOptions): Promise<BuildInspection>;
  /** Moves the read pointer to the build's new target; refuses with SearchAdminPreconditionFailed while any blocker remains. */
  cutover(buildId: string, audit: AdminContext): Promise<CutoverResult>;
  /** Points a serving build back to its old target; cutover can run again afterwards. */
  rollback(buildId: string, audit: AdminContext): Promise<CutoverResult>;
  /**
   * Retires a target after its read grace; refuses with a retryable SearchAdminPreconditionFailed while the grace is
   * pending, and the same call resumes after any failure.
   */
  retireTarget(targetId: string, audit: AdminContext): Promise<void>;
  /** Suspends capture: the read head becomes rebuild_required and every existing target and open build is invalidated. */
  suspendCapture(logicalKey: string, audit: AdminContext): Promise<void>;
  /** Turns capture back on with a new target; reads reopen only after the returned build is backfilled and cut over. */
  resumeCaptureForRebuild(logicalKey: string, audit: AdminContext): Promise<BuildHandle>;
  /** Compares one page of a paused target's indexed versions with the ledger. */
  runTargetVerificationPage(targetId: string, options: BatchOptions): Promise<VerificationProgress>;
  /** Turns a paused target active after verifying it; creates and repairs nothing. */
  resumeTarget(targetId: string, audit: AdminContext): Promise<TargetHandle>;
  /** Makes quarantined documents deliverable again with a fresh retry budget. */
  retryQuarantined(input: RetryScope, audit: AdminContext): Promise<RetryReport>;
  /** Marks documents again so they get new ledger revisions; pass next as after for the following page. */
  remark(input: DocumentScope, audit: AdminContext): Promise<RemarkReport>;
  /**
   * Declares this database a copy of another store and detaches every inherited target; processes initialized before
   * the adoption must restart.
   */
  adoptCopiedStore(
    input: { confirmCopy: true; instanceName?: string },
    audit: AdminContext,
  ): Promise<AdoptCopiedStoreResult>;
  /** Declares this database the recorded store itself after a legitimate origin change, keeping store_id and targets. */
  confirmStoreOwnership(
    input: { confirmSoleOwner: true; instanceName?: string },
    audit: AdminContext,
  ): Promise<ConfirmStoreOwnershipResult>;
  /** Changes the recorded read lifetime maxima; decreases that would shorten the retirement grace are refused. */
  changeReadLifetimes(
    logicalKey: string,
    lifetimes: ReadLifetimes,
    audit: AdminContext,
  ): Promise<ReadLifetimeChange>;
}

export interface PlanCreateOptions {
  /** Selects the definition when the handle has several for the key. */
  fingerprint?: string;
}

/**
 * Operations a handle without a client can run; the rest refuse with search-client-not-configured. confirmStoreOwnership
 * is not listed: without a client it works only while no target is creating, active, paused or retiring.
 */
export const POSTGRES_ONLY_ADMIN_OPERATIONS = [
  "inspect",
  "inspectBuild",
  "runBackfillPage",
  "suspendCapture",
  "remark",
  "retryQuarantined",
  "adoptCopiedStore",
  "changeReadLifetimes",
] as const;

export interface SearchAdminOptions {
  /** Optional; without it only POSTGRES_ONLY_ADMIN_OPERATIONS work. The handle never closes it. */
  client?: SearchClient;
  synchronization: PostgresSynchronization;
  definitions: readonly DefinedSearch[];
  lifetimes: ReadLifetimeLimits & { retirementSafetyMarginMs: number };
  timeouts: {
    lockTimeoutMs: number;
    statementTimeoutMs: number;
    idleInTransactionTimeoutMs: number;
    adminLeaseMs: number;
  };
  cutover: { maxPendingDocuments: number; sampleSize: number };
  workerBounds: { leaseDurationMs: number; requestTimeoutMs: number };
}

interface InspectStatements {
  readonly readIndexState: SqlFragment;
  readonly listTargets: SqlFragment;
  readonly readOpenBuild: SqlFragment;
  readonly countTargetLag: SqlFragment;
  readonly readTargetBacklog: SqlFragment;
  readonly readTarget: SqlFragment;
  readonly listWorkers: SqlFragment;
  readonly readInspectedBuild: SqlFragment;
}

function renderInspectStatements(schema: string): InspectStatements {
  const s = schemaIdentifier(schema);
  const indexes = qualified(s, "indexes");
  const readHeads = qualified(s, "read_heads");
  const targets = qualified(s, "targets");
  const builds = qualified(s, "builds");
  const deliveries = qualified(s, "deliveries");
  const runtime = qualified(s, "delivery_runtime");
  const heartbeats = qualified(s, "worker_heartbeats");
  return {
    readIndexState: sql`SELECT i.generation, i.capture_mode, i.capture_epoch,
       h.target_id AS read_target_id, h.generation AS read_generation, h.rebuild_required,
       h.max_search_lifetime_ms, h.max_cursor_lifetime_ms, h.max_pit_keep_alive_ms, h.retirement_safety_margin_ms,
       (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS database_now_ms
FROM ${indexes} i
LEFT JOIN ${readHeads} h ON h.namespace = i.namespace AND h.definition = i.definition
WHERE i.namespace = $1 AND i.definition = $2;`,
    listTargets: sql`SELECT target_id, physical_index, write_alias, fingerprint, capture_epoch, state, write_enabled,
       remote_create_state, pause_reason,
       (extract(epoch FROM deselected_at) * 1000)::bigint AS deselected_at_ms,
       (extract(epoch FROM deselect_confirmed_at) * 1000)::bigint AS deselect_confirmed_at_ms,
       (extract(epoch FROM remote_create_started_at) * 1000)::bigint AS remote_create_started_at_ms,
       (extract(epoch FROM verify_started_at) * 1000)::bigint AS verify_started_at_ms,
       (extract(epoch FROM verify_completed_at) * 1000)::bigint AS verify_completed_at_ms,
       verify_checked, verify_violations
FROM ${targets}
WHERE namespace = $1 AND definition = $2
ORDER BY created_at, target_id;`,
    readOpenBuild: sql`SELECT build_id, kind, phase, capture_epoch, new_target_id, old_target_id,
       expected_read_target_id, expected_read_generation, scan_boundary, scan_cursor,
       scan_pages, scan_documents, (scan_completed_at IS NOT NULL) AS scan_completed
FROM ${builds}
WHERE namespace = $1 AND definition = $2
  AND phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving');`,
    // inspect uses readTargetBacklog; this remains only as the reference value for tests.
    countTargetLag: sql`SELECT count(*) FILTER (WHERE r.quarantined_revision IS NULL OR r.quarantined_revision < d.desired_revision) AS pending,
       count(*) FILTER (WHERE r.quarantined_revision >= d.desired_revision) AS quarantined,
       min(d.enqueued_at) FILTER (WHERE r.quarantined_revision IS NULL OR r.quarantined_revision < d.desired_revision) AS oldest_pending_at
FROM ${deliveries} d
LEFT JOIN ${runtime} r
  ON r.target_id = d.target_id AND r.document_id = d.document_id AND r.intent_id = d.intent_id
WHERE d.target_id = $1;`,
    // A *_scanned equal to $2 marks a lower bound. The other side is probed per row with LATERAL … LIMIT 1 so the
    // planner cannot pick a hash join over the target's whole runtime.
    readTargetBacklog: sql`WITH intents AS MATERIALIZED (
  SELECT d.document_id, d.intent_id, d.desired_revision FROM ${deliveries} d WHERE d.target_id = $1 LIMIT $2::bigint
), pending AS (
  SELECT count(*) AS scanned,
         count(*) FILTER (WHERE r.quarantined_revision IS NULL OR r.quarantined_revision < i.desired_revision) AS pending
  FROM intents i
  LEFT JOIN LATERAL (SELECT r.quarantined_revision FROM ${runtime} r
                     WHERE r.target_id = $1 AND r.document_id = i.document_id AND r.intent_id = i.intent_id LIMIT 1) r ON true
), quarantined AS (
  SELECT count(*) AS scanned, count(*) FILTER (WHERE q.quarantined_revision >= d.desired_revision) AS quarantined
  FROM (SELECT r.document_id, r.intent_id, r.quarantined_revision FROM ${runtime} r
        WHERE r.target_id = $1 AND r.quarantined_revision IS NOT NULL LIMIT $2::bigint) q
  LEFT JOIN LATERAL (SELECT d.desired_revision FROM ${deliveries} d
                     WHERE d.target_id = $1 AND d.document_id = q.document_id AND d.intent_id = q.intent_id LIMIT 1) d ON true
), leased AS (
  SELECT count(*) AS leased FROM (SELECT 1 FROM ${runtime} r
        WHERE r.target_id = $1 AND r.lease_expires_at > statement_timestamp() LIMIT $2::bigint) l
), delayed AS (
  SELECT count(*) AS scanned,
         count(*) FILTER (WHERE x.lease_token IS NULL AND x.quarantined_revision IS NULL AND x.available_at > statement_timestamp()) AS delayed
  FROM (SELECT r.lease_token, r.quarantined_revision, r.available_at FROM ${runtime} r WHERE r.target_id = $1 LIMIT $2::bigint) x
), oldest AS (
  SELECT count(*) AS scanned,
         (extract(epoch FROM min(o.enqueued_at) FILTER (WHERE r.quarantined_revision IS NULL OR r.quarantined_revision < o.desired_revision)) * 1000)::bigint AS oldest_pending_ms
  FROM (SELECT d.document_id, d.intent_id, d.desired_revision, d.enqueued_at FROM ${deliveries} d
        WHERE d.target_id = $1 ORDER BY d.enqueued_at LIMIT $2::bigint) o
  LEFT JOIN LATERAL (SELECT r.quarantined_revision FROM ${runtime} r
                     WHERE r.target_id = $1 AND r.document_id = o.document_id AND r.intent_id = o.intent_id LIMIT 1) r ON true
)
SELECT p.scanned AS intents, p.pending, q.scanned AS quarantine_scanned, q.quarantined, l.leased,
       dl.scanned AS runtime_scanned, dl.delayed, o.scanned AS oldest_scanned, o.oldest_pending_ms
FROM pending p, quarantined q, leased l, delayed dl, oldest o;`,
    readTarget: sql`SELECT target_id, physical_index, write_alias, fingerprint, capture_epoch, state, write_enabled,
       remote_create_state, pause_reason,
       (extract(epoch FROM deselected_at) * 1000)::bigint AS deselected_at_ms,
       (extract(epoch FROM deselect_confirmed_at) * 1000)::bigint AS deselect_confirmed_at_ms,
       (extract(epoch FROM remote_create_started_at) * 1000)::bigint AS remote_create_started_at_ms,
       (extract(epoch FROM verify_started_at) * 1000)::bigint AS verify_started_at_ms,
       (extract(epoch FROM verify_completed_at) * 1000)::bigint AS verify_completed_at_ms,
       verify_checked, verify_violations
FROM ${targets}
WHERE target_id = ANY($1::uuid[]);`,
    listWorkers: sql`SELECT worker_id, capabilities,
       (extract(epoch FROM clock_timestamp() - heartbeat_at) * 1000)::bigint AS heartbeat_age_ms
FROM ${heartbeats}
WHERE namespace = $1 AND heartbeat_at >= clock_timestamp() - ($2::bigint * interval '1 millisecond')
ORDER BY worker_id;`,
    readInspectedBuild: sql`SELECT build_id, definition, kind, phase, capture_epoch, new_target_id, old_target_id,
       expected_read_target_id, expected_read_generation, scan_boundary, scan_cursor,
       scan_pages, scan_documents, (scan_completed_at IS NOT NULL) AS scan_completed
FROM ${builds}
WHERE build_id = $1 AND namespace = $2;`,
  };
}

function clientNotConfigured(operation: string): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.clientNotConfigured", params: { operation } },
    { details: { reason: "search-client-not-configured", operation } },
  );
}

const missingClientRequester: SearchRequester = {
  send: () => Promise.reject(clientNotConfigured("remote-request")),
};

const inspectStatementCache = createSchemaStatementCache(renderInspectStatements);

export function inspectStatementsFor(schema: string): InspectStatements {
  return inspectStatementCache.get(schema);
}

function optionsError(path: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "admin.invalidOptions", params: { path } },
    { details: { reason: "invalid-admin-option", path } },
  );
}

type IndexRow = z.infer<typeof indexStateRowSchema>;
type TargetRow = z.infer<typeof inspectedTargetRowSchema>;
type BuildRow = z.infer<typeof openBuildRowSchema>;

function cutoverBlockers(
  index: IndexRow,
  build: BuildRow,
  newTarget: TargetRow | undefined,
  gate: z.infer<typeof backlogRowSchema>,
  maxPendingDocuments: number,
): string[] {
  const blockers: string[] = [];
  if (index.capture_mode !== "active") blockers.push("capture-suspended");
  if (build.phase !== "catching_up") blockers.push("phase-not-catching-up");
  if (!build.scan_completed) blockers.push("scan-incomplete");
  if (
    build.capture_epoch !== index.capture_epoch ||
    newTarget?.capture_epoch !== index.capture_epoch
  ) {
    blockers.push("capture-epoch-mismatch");
  }
  if (newTarget?.state !== "active" || !newTarget.write_enabled) {
    blockers.push("new-target-not-writable");
  }
  if (
    index.read_target_id !== build.expected_read_target_id ||
    index.read_generation !== build.expected_read_generation
  ) {
    blockers.push("read-head-moved");
  }
  if (gate.quarantined) blockers.push("quarantined-documents");
  if (gate.pending > maxPendingDocuments) blockers.push("pending-above-limit");
  return blockers;
}

function toInspectedTarget(row: TargetRow): InspectedTarget {
  return {
    targetId: row.target_id,
    physicalIndex: row.physical_index,
    writeAlias: row.write_alias,
    fingerprint: row.fingerprint,
    captureEpoch: row.capture_epoch,
    remoteCreateState: row.remote_create_state,
    state: row.state,
    writeEnabled: row.write_enabled,
    deselectedAt: row.deselected_at_ms,
    deselectConfirmedAt: row.deselect_confirmed_at_ms,
    pauseReason: row.pause_reason,
    remoteCreateStartedAt: row.remote_create_started_at_ms,
    verification: {
      startedAt: row.verify_started_at_ms,
      completedAt: row.verify_completed_at_ms,
      checked: row.verify_checked,
      violations: row.verify_violations,
    },
    remote: null,
    backlog: null,
    fence: { epoch: 0, pending: false, renewedAgeMs: null, lost: false, lostDetail: null },
  };
}

const BACKLOG_STATES: ReadonlySet<TargetState> = new Set([
  "creating",
  "active",
  "paused",
  "retiring",
]);

function parseInspectOptions(options: InspectOptions | undefined): number | null {
  const parsed = inspectOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const path = `options.${(parsed.error.issues[0]?.path ?? []).map(String).join(".")}`;
    throw new SearchConfigurationError(
      { key: "admin.invalidOptions", params: { path } },
      { details: { reason: "invalid-admin-option", path } },
    );
  }
  if (parsed.data?.counts === "exact") return null;
  return parsed.data?.countLimit ?? DEFAULT_INSPECT_COUNT_LIMIT;
}

export interface SearchAdminInternals {
  readonly store: AdminStore;
  readonly definitions: ReadonlyMap<string, DefinedSearch>;
  readonly lifetimes: SearchAdminOptions["lifetimes"];
}

/** Creates the administrative handle; opens no connection, timer or schema access. */
export function createSearchAdmin(options: SearchAdminOptions): SearchAdmin {
  const parsed = searchAdminOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw optionsError(
      (parsed.error.issues[0]?.path ?? []).map(String).join(".").slice(0, 120) || "options",
    );
  }
  const requester =
    options.client === undefined ? missingClientRequester : getSearchRequester(options.client);
  const hasClient = options.client !== undefined;
  const remote = <T>(operation: string, run: () => Promise<T>): Promise<T> =>
    hasClient ? run() : Promise.reject(clientNotConfigured(operation));
  const definitions = new Map<string, DefinedSearch>();
  for (const definition of options.definitions) {
    const id = `${definition.key}@${definition.fingerprint}`;
    if (definitions.has(id)) {
      throw new SearchConfigurationError(
        { key: "admin.duplicateDefinition", params: { logicalKey: definition.key } },
        { details: { reason: "duplicate-definition", logicalKey: definition.key } },
      );
    }
    definitions.set(id, definition);
  }
  const synchronization = options.synchronization;
  const store = createAdminStore({
    getPrimaryDatabase: () => synchronization.options.getPrimaryDatabase(),
    schema: synchronization.schema,
    namespace: synchronization.namespace,
    timeouts: parsed.data.timeouts,
  });
  const statements = inspectStatementsFor(store.schema);
  const maxPendingDocuments = parsed.data.cutover.maxPendingDocuments;
  const { namespace } = store;

  const readLag = async (
    trx: Knex.Transaction,
    targetId: string,
    nowMs: number,
    limit: number | null,
  ): Promise<TargetLag> => {
    const row = singleRow(
      await store.execute(trx, statement(statements.readTargetBacklog, [targetId, limit])),
      targetBacklogRowSchema,
      "readTargetBacklog",
    );
    if (row === undefined) throw invalidAdminRow("readTargetBacklog");
    const capped = (scanned: number) => limit !== null && scanned >= limit;
    const oldestKnown = row.oldest_pending_ms !== null || !capped(row.oldest_scanned);
    return {
      pending: row.pending,
      quarantined: row.quarantined,
      oldestPendingAgeMs:
        row.oldest_pending_ms === null ? null : Math.max(0, nowMs - row.oldest_pending_ms),
      intents: row.intents,
      leased: row.leased,
      delayed: row.delayed,
      exact:
        oldestKnown &&
        !capped(row.intents) &&
        !capped(row.quarantine_scanned) &&
        !capped(row.leased) &&
        !capped(row.runtime_scanned),
      limit,
    };
  };

  const readGate = async (trx: Knex.Transaction, targetId: string) => {
    const row = singleRow(
      await store.execute(
        trx,
        statement(cutoverStatementsFor(store.schema).readCutoverBacklog, [
          targetId,
          maxPendingDocuments,
        ]),
      ),
      backlogRowSchema,
      "readCutoverBacklog",
    );
    if (row === undefined) throw invalidAdminRow("readCutoverBacklog");
    return row;
  };

  const describeBuild = async (
    trx: Knex.Transaction,
    index: IndexRow,
    build: BuildRow,
    targetRows: readonly TargetRow[],
    limit: number | null,
  ): Promise<BuildInspection> => {
    const nowMs = index.database_now_ms;
    const newLag = await readLag(trx, build.new_target_id, nowMs, limit);
    const oldLag =
      build.old_target_id === null
        ? undefined
        : await readLag(trx, build.old_target_id, nowMs, limit);
    const blockers = cutoverBlockers(
      index,
      build,
      targetRows.find((row) => row.target_id === build.new_target_id),
      await readGate(trx, build.new_target_id),
      maxPendingDocuments,
    );
    const scan: BuildInspection["scan"] = {
      completed: build.scan_completed,
      pages: build.scan_pages,
      documents: build.scan_documents,
    };
    if (build.scan_boundary !== null) scan.boundary = build.scan_boundary;
    if (build.scan_cursor !== null) scan.cursor = build.scan_cursor;
    const described: BuildInspection = {
      buildId: build.build_id,
      phase: build.phase,
      kind: build.kind,
      captureEpoch: build.capture_epoch,
      currentCaptureEpoch: index.capture_epoch,
      scan,
      newTarget: newLag,
      eligibleForCutover: blockers.length === 0,
      blockers,
    };
    if (oldLag !== undefined) described.oldTarget = oldLag;
    return described;
  };

  const inspectBuild = async (
    buildId: string,
    inspectOptions?: InspectOptions,
  ): Promise<BuildInspection> => {
    const limit = parseInspectOptions(inspectOptions);
    if (!buildIdArgumentSchema.safeParse(buildId).success) {
      throw new SearchConfigurationError(
        { key: "admin.invalidBuildArgument", params: { path: "buildId" } },
        { details: { reason: "invalid-build-argument", path: "buildId" } },
      );
    }
    return store.transaction(
      async (trx) => {
        const build = singleRow(
          await store.execute(trx, statement(statements.readInspectedBuild, [buildId, namespace])),
          inspectedBuildRowSchema,
          "readInspectedBuild",
        );
        if (build === undefined) throw buildNotFound(buildId);
        const params = [namespace, build.definition] as const;
        const index = singleRow(
          await store.execute(trx, statement(statements.readIndexState, params)),
          indexStateRowSchema,
          "readIndexState",
        );
        if (index === undefined) throw invalidAdminRow("readIndexState");
        const ids = [build.new_target_id, build.old_target_id].filter(
          (id): id is string => id !== null,
        );
        const targetRows = (
          await store.execute(trx, statement(statements.readTarget, [ids]))
        ).rows.map((raw) => {
          const row = inspectedTargetRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("readTarget");
          return row.data;
        });
        return describeBuild(trx, index, build, targetRows, limit);
      },
      { readOnly: true },
    );
  };

  const readWorkers = async (
    trx: Knex.Transaction,
    logicalKey: string,
  ): Promise<IndexInspection["workers"]> => {
    const workerResult = await store.execute(
      trx,
      statement(statements.listWorkers, [namespace, WORKER_HEARTBEAT_EXPIRY_MS]),
    );
    const prefix = `${logicalKey}@`;
    return workerResult.rows.flatMap((raw) => {
      const row = workerHeartbeatRowSchema.safeParse(raw);
      if (!row.success) throw invalidAdminRow("listWorkers");
      const fingerprints = row.data.capabilities
        .filter((capability) => capability.startsWith(prefix))
        .map((capability) => capability.slice(prefix.length));
      return fingerprints.length === 0
        ? []
        : [
            {
              workerId: row.data.worker_id,
              fingerprints,
              heartbeatAgeMs: Math.max(0, row.data.heartbeat_age_ms),
            },
          ];
    });
  };

  const inspect = async (
    logicalKey: string,
    inspectOptions?: InspectOptions,
  ): Promise<IndexInspection> => {
    const limit = parseInspectOptions(inspectOptions);
    const key = logicalKeyArgumentSchema.safeParse(logicalKey);
    if (!key.success) {
      throw new SearchConfigurationError(
        { key: "names.invalidLogicalKey", params: { name: String(logicalKey).slice(0, 80) } },
        { details: { reason: "invalid-logical-key" } },
      );
    }
    const params = [namespace, key.data] as const;
    // A binding mismatch is reported, not refused.
    const binding = await synchronization.checkBinding();
    return store.transaction(
      async (trx) => {
        const index = singleRow(
          await store.execute(trx, statement(statements.readIndexState, params)),
          indexStateRowSchema,
          "readIndexState",
        );
        const workers = await readWorkers(trx, key.data);
        const bindingReport = {
          storeId: binding.storeId,
          originRecorded: binding.originRecorded,
          originMatches: binding.originMatches,
          instanceMatches: binding.instanceMatches,
        };
        if (index === undefined) {
          return {
            logicalKey: key.data,
            registered: false,
            captureMode: "active",
            captureEpoch: 1,
            generation: 0,
            readHead: { targetId: null, generation: 0, rebuildRequired: false },
            lifetimes: null,
            targets: [],
            openBuild: null,
            workers,
            binding: bindingReport,
          } satisfies IndexInspection;
        }
        const targetResult = await store.execute(trx, statement(statements.listTargets, params));
        const targetRows = targetResult.rows.map((raw) => {
          const row = inspectedTargetRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("listTargets");
          return row.data;
        });
        const build = singleRow(
          await store.execute(trx, statement(statements.readOpenBuild, params)),
          openBuildRowSchema,
          "readOpenBuild",
        );
        const openBuild =
          build === undefined ? null : await describeBuild(trx, index, build, targetRows, limit);
        const fenceRows = new Map(
          (
            await adminFenceStoreFor(store.schema).inspect(
              trx,
              targetRows.map((row) => row.target_id),
            )
          ).map((row) => [row.targetId, row]),
        );
        const targets: InspectedTarget[] = [];
        for (const row of targetRows) {
          const target = toInspectedTarget(row);
          const fence = fenceRows.get(row.target_id);
          if (fence !== undefined) {
            target.fence = {
              epoch: fence.epoch,
              pending: fence.pending,
              renewedAgeMs:
                fence.renewedAt === null
                  ? null
                  : Math.max(0, index.database_now_ms - fence.renewedAt.getTime()),
              lost: fence.lost,
              lostDetail:
                fence.lostDetail === null
                  ? null
                  : {
                      class: fence.lostDetail.class,
                      localEpoch: fence.lostDetail.local_epoch,
                      remoteEpoch: fence.lostDetail.remote_epoch,
                    },
            };
          }
          if (BACKLOG_STATES.has(row.state)) {
            target.backlog = await readLag(trx, row.target_id, index.database_now_ms, limit);
          }
          targets.push(target);
        }
        return {
          logicalKey: key.data,
          registered: true,
          captureMode: index.capture_mode,
          captureEpoch: index.capture_epoch,
          generation: index.generation,
          readHead: {
            targetId: index.read_target_id,
            generation: index.read_generation ?? 0,
            rebuildRequired: index.rebuild_required ?? false,
          },
          lifetimes:
            index.max_search_lifetime_ms === null ||
            index.max_cursor_lifetime_ms === null ||
            index.max_pit_keep_alive_ms === null ||
            index.retirement_safety_margin_ms === null
              ? null
              : {
                  maxSearchLifetimeMs: index.max_search_lifetime_ms,
                  maxCursorLifetimeMs: index.max_cursor_lifetime_ms,
                  maxPitKeepAliveMs: index.max_pit_keep_alive_ms,
                  retirementSafetyMarginMs: index.retirement_safety_margin_ms,
                },
          targets,
          openBuild,
          workers,
          binding: {
            storeId: binding.storeId,
            originRecorded: binding.originRecorded,
            originMatches: binding.originMatches,
            instanceMatches: binding.instanceMatches,
          },
        } satisfies IndexInspection;
      },
      { readOnly: true },
    );
  };

  const remoteContext: RemoteCreateContext = {
    store,
    requester,
    definitions,
    lifetimes: parsed.data.lifetimes,
    binding: synchronization,
  };
  const buildContext: BuildContext = { ...remoteContext, cutover: parsed.data.cutover };
  const captureContext: CaptureModeContext = {
    ...buildContext,
    workerBounds: parsed.data.workerBounds,
  };
  const repairContext: RepairContext = { ...remoteContext, synchronization };
  const resumeContext: ResumeTargetContext = {
    ...remoteContext,
    workerBounds: parsed.data.workerBounds,
  };
  const admin: SearchAdmin = {
    inspect,
    planCreate: (logicalKey, planOptions) => planCreateWith(remoteContext, logicalKey, planOptions),
    executeCreate: (plan, audit) =>
      remote("executeCreate", () => executeCreateWith(remoteContext, plan, audit)),
    reconcileCreate: (targetId, input, audit) =>
      remote("reconcileCreate", () => reconcileCreateWith(remoteContext, targetId, input, audit)),
    beginRebuild: (input, audit) =>
      remote("beginRebuild", () => beginRebuildWith(buildContext, input, audit)),
    runBackfillPage: (buildId, batch) => runBackfillPageWith(buildContext, buildId, batch),
    inspectBuild,
    cutover: (buildId, audit) => remote("cutover", () => cutoverWith(buildContext, buildId, audit)),
    rollback: (buildId, audit) =>
      remote("rollback", () => rollbackWith(buildContext, buildId, audit)),
    retireTarget: (targetId, audit) =>
      remote("retireTarget", () => retireTargetWith(captureContext, targetId, audit)),
    suspendCapture: (logicalKey, audit) => suspendCaptureWith(captureContext, logicalKey, audit),
    resumeCaptureForRebuild: (logicalKey, audit) =>
      remote("resumeCaptureForRebuild", () =>
        resumeCaptureForRebuildWith(captureContext, logicalKey, audit),
      ),
    runTargetVerificationPage: (targetId, batch) =>
      remote("runTargetVerificationPage", () =>
        runTargetVerificationPageWith(resumeContext, targetId, batch),
      ),
    resumeTarget: (targetId, audit) =>
      remote("resumeTarget", () => resumeTargetWith(resumeContext, targetId, audit)),
    retryQuarantined: (input, audit) => retryQuarantinedWith(repairContext, input, audit),
    remark: (input, audit) => remarkWith(repairContext, input, audit),
    adoptCopiedStore: (input, audit) =>
      adoptCopiedStoreWith({ store, instanceName: synchronization.instanceName }, input, audit),
    confirmStoreOwnership: (input, audit) =>
      confirmStoreOwnershipWith(
        {
          store,
          instanceName: synchronization.instanceName,
          requester: hasClient ? leaseBoundRequester(remoteContext) : undefined,
        },
        input,
        audit,
      ),
    changeReadLifetimes: (logicalKey, lifetimes, audit) =>
      changeReadLifetimesWith(remoteContext, logicalKey, lifetimes, audit),
  };
  internals.set(admin, { store, definitions, lifetimes: parsed.data.lifetimes });
  return Object.freeze(admin);
}

const internals = new WeakMap<SearchAdmin, SearchAdminInternals>();

export function getSearchAdminInternals(admin: SearchAdmin): SearchAdminInternals {
  const found = internals.get(admin);
  if (found === undefined) {
    throw new SearchConfigurationError(
      { key: "admin.foreignHandle" },
      { details: { reason: "foreign-admin-handle" } },
    );
  }
  return found;
}
