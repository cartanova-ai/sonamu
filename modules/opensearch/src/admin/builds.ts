import { randomUUID } from "node:crypto";

import { type z } from "zod";

import { type DefinedSearch, type ProjectionReadContext } from "../definition/define-search";
import { composeIndexMappings } from "../definition/envelope";
import { buildPhysicalIndexName, buildWriteAliasName } from "../definition/names";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchError,
  SearchNotConfigured,
  SearchProjectionError,
  SearchTimeout,
} from "../errors";
import { runInPrimarySnapshot } from "../postgres/snapshot";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { requireStoreBinding } from "../postgres/store-binding";
import {
  type AdminOperation,
  type AdminStore,
  invalidAdminRow,
  parseOperationRequest,
  runAdminOperation,
  singleRow,
} from "./admin-lease";
import { type CreatePlan, executeCreate, type RemoteCreateContext } from "./remote-create";
import {
  type adminContextSchema,
  backfillOptionsSchema,
  boundaryRowSchema,
  buildIdArgumentSchema,
  type buildKindSchema,
  type buildPhaseSchema,
  buildRowSchema,
  cursorAdvanceRowSchema,
  openBuildLookupRowSchema,
  pageLockRowSchema,
  readHeadTargetRowSchema,
  rebuildInputSchema,
  type remoteCreateStateSchema,
  scanBoundarySchema,
  scanPageSchema,
} from "./rows";
import { readPlanState } from "./targets";

export type BuildPhase = z.infer<typeof buildPhaseSchema>;
export type BuildKind = z.infer<typeof buildKindSchema>;
type RemoteCreateState = z.infer<typeof remoteCreateStateSchema>;
export type BuildRow = z.infer<typeof buildRowSchema>;

export interface BuildTargetHandle {
  targetId: string;
  physicalIndex: string;
  writeAlias: string;
  fingerprint: string;
  captureEpoch: number;
  remoteCreateState: RemoteCreateState;
}

export interface BuildHandle {
  buildId: string;
  target: BuildTargetHandle;
  kind: BuildKind;
}

export interface RebuildInput {
  logicalKey: string;
  fingerprint: string;
}

// runBackfillPage acquires and releases the lease per call under the build's operation_id, so a concurrent call with
// the same operation_id replaces the earlier call's token and the earlier call writes nothing. Boundary capture and
// source scans run in a read-only REPEATABLE READ snapshot; each page then applies in one fenced transaction where
// lockBuildCursor locks the build and compares the cursor before any write, and no row from advanceScanCursor rolls
// everything back.

export interface BackfillProgress {
  buildId: string;
  phase: BuildPhase;
  /** Documents scanned by the whole build so far. */
  scanned: number;
  /** Intents this call inserted or raised. */
  enqueued: number;
  cursor?: string;
  done: boolean;
}

export interface BuildContext extends RemoteCreateContext {
  readonly cutover: { readonly maxPendingDocuments: number; readonly sampleSize: number };
}

interface BuildStatements {
  readonly findOpenBuild: SqlFragment;
  readonly readBuildWithTarget: SqlFragment;
  readonly readCurrentReadTarget: SqlFragment;
  readonly recordScanBoundary: SqlFragment;
  readonly lockBuildCursor: SqlFragment;
  readonly seedLedgerRows: SqlFragment;
  readonly enqueueBackfillIntents: SqlFragment;
  readonly advanceScanCursor: SqlFragment;
}

function renderBuildStatements(schema: string): BuildStatements {
  const s = schemaIdentifier(schema);
  const builds = qualified(s, "builds");
  const targets = qualified(s, "targets");
  const readHeads = qualified(s, "read_heads");
  const documents = qualified(s, "documents");
  const deliveries = qualified(s, "deliveries");
  return {
    findOpenBuild: sql`SELECT b.build_id, b.kind, b.phase, b.new_target_id, t.fingerprint
FROM ${builds} b JOIN ${targets} t ON t.target_id = b.new_target_id
WHERE b.namespace = $1 AND b.definition = $2
  AND b.phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving');`,
    readBuildWithTarget: sql`SELECT b.build_id, b.definition, b.kind, b.phase, b.capture_epoch, b.new_target_id, b.old_target_id,
       b.expected_read_target_id, b.expected_read_generation, b.scan_boundary, b.scan_cursor,
       b.scan_pages, b.scan_documents, (b.scan_completed_at IS NOT NULL) AS scan_completed, b.operation_id,
       t.physical_index, t.write_alias, t.fingerprint, t.hash_version, t.capture_epoch AS target_capture_epoch,
       t.state AS target_state, t.write_enabled, t.remote_create_state
FROM ${builds} b JOIN ${targets} t ON t.target_id = b.new_target_id
WHERE b.build_id = $1 AND b.namespace = $2;`,
    readCurrentReadTarget: sql`SELECT target_id FROM ${readHeads} WHERE namespace = $1 AND definition = $2;`,
    recordScanBoundary: sql`UPDATE ${builds} b
SET scan_boundary = $2, phase = 'backfilling', updated_at = clock_timestamp()
WHERE b.build_id = $1 AND b.phase = 'created' AND b.capture_epoch = $3
RETURNING b.build_id;`,
    lockBuildCursor: sql`SELECT b.phase, b.capture_epoch, b.new_target_id,
       (b.scan_cursor IS NOT DISTINCT FROM $2::text) AS cursor_matches, t.state, t.write_enabled
FROM ${builds} b JOIN ${targets} t ON t.target_id = b.new_target_id
WHERE b.build_id = $1 FOR UPDATE OF b;`,
    // Locks in byte order whatever order the scanner returned.
    seedLedgerRows: sql`INSERT INTO ${documents} (namespace, definition, document_id, revision)
SELECT $1, $2, x.id, 1
FROM (SELECT DISTINCT unnest($3::text[]) COLLATE "C" AS id) x
ORDER BY x.id COLLATE "C"
ON CONFLICT (namespace, definition, document_id) DO NOTHING;`,
    enqueueBackfillIntents: sql`INSERT INTO ${deliveries} AS q (target_id, document_id, desired_revision)
SELECT $3, d.document_id, d.revision FROM ${documents} d
WHERE d.namespace = $1 AND d.definition = $2 AND d.document_id = ANY($4::text[])
ORDER BY d.document_id
ON CONFLICT (target_id, document_id) DO UPDATE
SET desired_revision = EXCLUDED.desired_revision, updated_at = clock_timestamp()
WHERE q.desired_revision < EXCLUDED.desired_revision;`,
    advanceScanCursor: sql`UPDATE ${builds}
SET scan_cursor = $3, scan_pages = scan_pages + 1, scan_documents = scan_documents + $4,
    scan_completed_at = CASE WHEN $3::text IS NULL THEN clock_timestamp() END,
    phase = CASE WHEN $3::text IS NULL THEN 'catching_up' ELSE phase END, updated_at = clock_timestamp()
WHERE build_id = $1 AND phase = 'backfilling' AND scan_cursor IS NOT DISTINCT FROM $2::text
RETURNING phase, scan_cursor;`,
  };
}

const statementCache = createSchemaStatementCache(renderBuildStatements);

export function buildStatementsFor(schema: string): BuildStatements {
  return statementCache.get(schema);
}

function invalidArgument(path: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "admin.invalidBuildArgument", params: { path } },
    { details: { reason: "invalid-build-argument", path } },
  );
}

export function buildNotFound(buildId: string): SearchNotConfigured {
  return new SearchNotConfigured(
    { key: "admin.buildNotFound", params: { buildId } },
    { details: { reason: "build-not-found", buildId } },
  );
}

function buildRefused(reason: string, state: string): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.buildRefused", params: { reason, state } },
    { details: { reason, state } },
  );
}

function backfillRefused(buildId: string, reason: string): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.backfillRefused", params: { buildId, reason } },
    { details: { reason, buildId } },
  );
}

function definitionNotRegistered(logicalKey: string): SearchNotConfigured {
  return new SearchNotConfigured(
    { key: "admin.definitionNotRegistered", params: { logicalKey } },
    { details: { reason: "definition-not-registered", logicalKey } },
  );
}

export function definitionFor(
  context: RemoteCreateContext,
  logicalKey: string,
  fingerprint: string,
): DefinedSearch {
  const definition = context.definitions.get(`${logicalKey}@${fingerprint}`);
  if (definition === undefined) throw definitionNotRegistered(logicalKey);
  return definition;
}

export async function readBuild(store: AdminStore, buildId: string): Promise<BuildRow> {
  if (!buildIdArgumentSchema.safeParse(buildId).success) throw invalidArgument("buildId");
  const q = buildStatementsFor(store.schema);
  const row = await store.transaction(
    async (trx) =>
      singleRow(
        await store.execute(trx, statement(q.readBuildWithTarget, [buildId, store.namespace])),
        buildRowSchema,
        "readBuildWithTarget",
      ),
    { readOnly: true },
  );
  if (row === undefined) throw buildNotFound(buildId);
  return row;
}

function handleOf(row: BuildRow): BuildHandle {
  return {
    buildId: row.build_id,
    kind: row.kind,
    target: {
      targetId: row.new_target_id,
      physicalIndex: row.physical_index,
      writeAlias: row.write_alias,
      fingerprint: row.fingerprint,
      captureEpoch: row.target_capture_epoch,
      remoteCreateState: row.remote_create_state,
    },
  };
}

function progressOf(row: BuildRow, enqueued: number): BackfillProgress {
  const progress: BackfillProgress = {
    buildId: row.build_id,
    phase: row.phase,
    scanned: row.scan_documents,
    enqueued,
    done: row.scan_completed,
  };
  if (row.scan_cursor !== null) progress.cursor = row.scan_cursor;
  return progress;
}

async function readOpenBuild(store: AdminStore, logicalKey: string) {
  const q = buildStatementsFor(store.schema);
  const key = [store.namespace, logicalKey] as const;
  return store.transaction(
    async (trx) => {
      const open = singleRow(
        await store.execute(trx, statement(q.findOpenBuild, key)),
        openBuildLookupRowSchema,
        "findOpenBuild",
      );
      const head = singleRow(
        await store.execute(trx, statement(q.readCurrentReadTarget, key)),
        readHeadTargetRowSchema,
        "readCurrentReadTarget",
      );
      return { open, readTarget: head?.target_id ?? null };
    },
    { readOnly: true },
  );
}

export async function beginRebuild(
  context: BuildContext,
  input: RebuildInput,
  audit: z.input<typeof adminContextSchema>,
): Promise<BuildHandle> {
  const parsed = rebuildInputSchema.safeParse(input);
  if (!parsed.success) {
    throw invalidArgument(String(parsed.error.issues[0]?.path[0] ?? "input").slice(0, 40));
  }
  const { logicalKey, fingerprint } = parsed.data;
  parseOperationRequest({ logicalKey, kind: "begin-rebuild", ...audit });
  const definition = definitionFor(context, logicalKey, fingerprint);
  const { storeId } = await requireStoreBinding(context.binding);
  const { store } = context;
  const before = await readOpenBuild(store, logicalKey);
  if (before.open !== undefined) {
    if (before.open.fingerprint !== fingerprint) {
      throw buildRefused("open-build-exists", before.open.phase);
    }
    return handleOf(await readBuild(store, before.open.build_id));
  }
  const state = await readPlanState(store, logicalKey);
  const plan = planFor(context, definition, state.captureEpoch, storeId);
  const kind = before.readTarget === null ? "initial" : "rebuild";
  const handle = await executeCreate(context, plan, audit, {
    registration: { kind, oldTargetId: before.readTarget },
    checkedStoreId: storeId,
  });
  const after = await readOpenBuild(store, logicalKey);
  if (after.open === undefined || after.open.new_target_id !== handle.targetId) {
    throw buildRefused("open-build-missing", after.open?.phase ?? "none");
  }
  return handleOf(await readBuild(store, after.open.build_id));
}

function planFor(
  context: RemoteCreateContext,
  definition: DefinedSearch,
  captureEpoch: number,
  storeId: string,
): CreatePlan {
  const { namespace } = context.store;
  const targetId = randomUUID();
  const physicalIndex = buildPhysicalIndexName(namespace, definition.key, targetId);
  return {
    logicalKey: definition.key,
    namespace,
    fingerprint: definition.fingerprint,
    hashVersion: definition.hashVersion,
    targetId,
    physicalIndex,
    writeAlias: buildWriteAliasName(physicalIndex),
    body: {
      settings: definition.settings,
      mappings: composeIndexMappings({
        targetId,
        namespace,
        logicalKey: definition.key,
        fingerprint: definition.fingerprint,
        hashVersion: definition.hashVersion,
        mappings: definition.mappings,
        storeId,
      }),
    },
    missingPlugins: [],
    captureEpoch,
    warnings: [],
  };
}

async function inSourceSnapshot<T>(
  context: BuildContext,
  logicalKey: string,
  signal: AbortSignal | undefined,
  work: (readContext: ProjectionReadContext) => Promise<T>,
): Promise<T> {
  const { store } = context;
  const { timeouts } = store;
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await runInPrimarySnapshot(
      store.primary(),
      {
        statementTimeoutMs: timeouts.statementTimeoutMs,
        lockTimeoutMs: timeouts.lockTimeoutMs,
        idleInTransactionTimeoutMs: timeouts.idleInTransactionTimeoutMs,
      },
      async (snapshot) => {
        let result: T;
        try {
          result = await work({
            trx: snapshot.trx,
            signal: controller.signal,
            deadlineAt: Date.now() + timeouts.statementTimeoutMs,
            namespace: store.namespace,
            logicalKey,
          });
        } catch (error) {
          if (error instanceof SearchError) throw error;
          throw new SearchProjectionError(
            { key: "admin.scanFailed", params: { logicalKey } },
            { details: { reason: "scan-failed", logicalKey } },
          );
        }
        const integrity = await snapshot.verify();
        if (!integrity.intact) {
          throw new SearchProjectionError(
            { key: "admin.scanFailed", params: { logicalKey } },
            { details: { reason: integrity.reason, logicalKey } },
          );
        }
        return result;
      },
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

function throwIfAborted(signal: AbortSignal | undefined, buildId: string): void {
  if (signal?.aborted === true) {
    throw new SearchTimeout(
      { key: "admin.aborted", params: { operation: "backfill-page" } },
      { details: { reason: "aborted", buildId } },
    );
  }
}

function invalidScanResult(logicalKey: string, field: string): SearchProjectionError {
  return new SearchProjectionError(
    { key: "admin.invalidScanResult", params: { logicalKey, field } },
    { details: { reason: "invalid-scan-result", logicalKey, field } },
  );
}

export async function runBackfillPage(
  context: BuildContext,
  buildId: string,
  options: { limit: number; signal?: AbortSignal },
): Promise<BackfillProgress> {
  const parsedOptions = backfillOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    throw invalidArgument(`options.${String(parsedOptions.error.issues[0]?.path[0] ?? "limit")}`);
  }
  const { limit, signal } = parsedOptions.data;
  const { store } = context;
  await requireStoreBinding(context.binding);
  const initial = await readBuild(store, buildId);
  const definition = definitionFor(context, initial.definition, initial.fingerprint);
  if (initial.phase !== "created" && initial.phase !== "backfilling") {
    return closedOrDone(initial);
  }
  const request = parseOperationRequest({
    logicalKey: initial.definition,
    kind: "backfill-page",
    operationId: initial.operation_id,
    actor: "system",
    reason: "backfill-page",
  });
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    // Decide from the state read after acquiring the lease.
    const build = await readBuild(store, buildId);
    if (build.phase === "created") {
      await captureBoundary(context, operation, build, definition, signal);
      return progressOf(await readBuild(store, buildId), 0);
    }
    if (build.phase !== "backfilling") return closedOrDone(build);
    if (build.scan_boundary === null) throw invalidAdminRow("readBuildWithTarget");
    const through = build.scan_boundary;
    const after = build.scan_cursor ?? undefined;
    const raw = await inSourceSnapshot(context, build.definition, signal, (readContext) =>
      definition.scanSourceIds(
        readContext,
        after === undefined ? { through, limit } : { after, through, limit },
      ),
    );
    const page = scanPageSchema.safeParse(raw);
    if (!page.success) {
      throw invalidScanResult(build.definition, String(page.error.issues[0]?.path[0] ?? "page"));
    }
    if (page.data.ids.length > limit) throw invalidScanResult(build.definition, "ids");
    // A page that does not advance the cursor would repeat forever.
    if (page.data.next !== undefined && page.data.next === after) {
      throw invalidScanResult(build.definition, "next");
    }
    await operation.heartbeat();
    throwIfAborted(signal, buildId);
    const applied = await applyBackfillPage(operation, {
      buildId,
      expectedCursor: build.scan_cursor,
      ids: page.data.ids,
      next: page.data.next ?? null,
    });
    return progressOf(await readBuild(store, buildId), applied.enqueued);
  });
}

function closedOrDone(build: BuildRow): BackfillProgress {
  if (build.phase === "failed" || build.phase === "retired") {
    throw backfillRefused(build.build_id, "build-closed");
  }
  return progressOf(build, 0);
}

async function captureBoundary(
  context: BuildContext,
  operation: AdminOperation,
  build: BuildRow,
  definition: DefinedSearch,
  signal: AbortSignal | undefined,
): Promise<void> {
  const raw = await inSourceSnapshot(context, build.definition, signal, (readContext) =>
    definition.captureScanBoundary(readContext),
  );
  const boundary = scanBoundarySchema.safeParse(raw);
  if (!boundary.success) throw invalidScanResult(build.definition, "boundary");
  await operation.heartbeat();
  throwIfAborted(signal, build.build_id);
  const q = buildStatementsFor(operation.store.schema);
  await operation.fenced("shared", async (trx, barrier) => {
    if (barrier.capture_mode !== "active") {
      throw backfillRefused(build.build_id, "capture-suspended");
    }
    const row = singleRow(
      await operation.store.execute(
        trx,
        statement(q.recordScanBoundary, [build.build_id, boundary.data, barrier.capture_epoch]),
      ),
      boundaryRowSchema,
      "recordScanBoundary",
    );
    if (row === undefined) throw backfillRefused(build.build_id, "boundary-refused");
  });
}

export interface BackfillPageInput {
  buildId: string;
  expectedCursor: string | null;
  ids: readonly string[];
  next: string | null;
}

export async function applyBackfillPage(
  operation: AdminOperation,
  input: BackfillPageInput,
): Promise<{ applied: boolean; enqueued: number }> {
  const { store } = operation;
  const q = buildStatementsFor(store.schema);
  const key = [store.namespace, operation.request.logicalKey] as const;
  const ids = [...input.ids];
  const pageSize = new Set(ids).size;
  // Thrown only to roll back on a cursor mismatch; recognised below and never returned to the caller.
  const cursorMoved = backfillRefused(input.buildId, "cursor-moved");
  try {
    const enqueued = await operation.fenced("shared", async (trx, barrier) => {
      if (barrier.capture_mode !== "active") {
        throw backfillRefused(input.buildId, "capture-suspended");
      }
      const locked = singleRow(
        await store.execute(
          trx,
          statement(q.lockBuildCursor, [input.buildId, input.expectedCursor]),
        ),
        pageLockRowSchema,
        "lockBuildCursor",
      );
      if (locked === undefined) throw buildNotFound(input.buildId);
      if (!locked.cursor_matches) throw cursorMoved;
      if (locked.phase !== "backfilling") {
        if (locked.phase === "catching_up" || locked.phase === "serving") throw cursorMoved;
        throw backfillRefused(input.buildId, "build-closed");
      }
      if (locked.capture_epoch !== barrier.capture_epoch) {
        throw backfillRefused(input.buildId, "build-epoch-invalidated");
      }
      if (!locked.write_enabled || (locked.state !== "active" && locked.state !== "paused")) {
        throw backfillRefused(input.buildId, "target-not-writable");
      }
      await store.execute(trx, statement(q.seedLedgerRows, [...key, ids]));
      const intents = await store.execute(
        trx,
        statement(q.enqueueBackfillIntents, [...key, locked.new_target_id, ids]),
      );
      const advanced = singleRow(
        await store.execute(
          trx,
          statement(q.advanceScanCursor, [
            input.buildId,
            input.expectedCursor,
            input.next,
            pageSize,
          ]),
        ),
        cursorAdvanceRowSchema,
        "advanceScanCursor",
      );
      if (advanced === undefined) throw backfillRefused(input.buildId, "scan-cursor-cas-failed");
      return intents.rowCount;
    });
    return { applied: true, enqueued };
  } catch (error) {
    if (error === cursorMoved) return { applied: false, enqueued: 0 };
    throw error;
  }
}
