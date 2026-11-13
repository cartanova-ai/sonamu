import { type Knex } from "knex";
import { z } from "zod";

import { describeResponseFailure, toSearchError } from "../client/error-normalization";
import { type SearchHttpResponse, type SearchRequester } from "../client/search-client";
import { type JsonObject } from "../definition/canonical-json";
import { RESERVED_FENCE_DOCUMENT_ID as FENCE_DOCUMENT_ID } from "../definition/names";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  type SearchError,
  type SearchErrorDetail,
  SearchNotConfigured,
  SearchTimeout,
  SearchUnavailable,
} from "../errors";
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
import { verifyFence } from "./fences";
import {
  leaseBoundRequester,
  type RemoteCreateContext,
  type RemoteIdentity,
  verifyRegistered,
} from "./remote-create";
import {
  type adminContextSchema,
  ledgerRevisionRowSchema,
  resumedTargetRowSchema,
  targetIdArgumentSchema,
  verificationOptionsSchema,
  verifyAdvancedRowSchema,
  verifyQuiescedRowSchema,
  verifyStartedRowSchema,
  verifyTargetRowSchema,
} from "./rows";
import { type TargetHandle } from "./search-admin";

type AdminAudit = z.input<typeof adminContextSchema>;
type DetailRecord = Record<string, SearchErrorDetail>;
type VerifyTargetRow = z.infer<typeof verifyTargetRowSchema>;

// Resume turns paused → active only after, in order: state and epoch (fenced), remote identity (_meta and write alias,
// outside the transaction, nothing created), and for revision_divergence a complete clean scan started after the pause
// and after quiescence; resumePausedTarget rechecks the same conditions atomically. The scan is sound because a paused
// target is not claimed, pre-pause sends end within the quiescence bound, and ledger revisions only rise. It is one pass
// over a PIT in _shard_doc order; max_seq_no read before the refresh and again after the last page catches writes the
// PIT cannot see, and a difference restarts the scan. Divergence is not repaired: after a real ledger regression only
// the restore runbook (suspend → resume → rebuild) helps.

export interface ResumeTargetContext extends RemoteCreateContext {
  readonly workerBounds: { readonly leaseDurationMs: number; readonly requestTimeoutMs: number };
}

export interface VerificationViolation {
  id: string;
  indexed: number;
  ledger: number | null;
}

export interface VerificationProgress {
  targetId: string;
  checked: number;
  violations: number;
  /** For progress display only; not passed to the next call. */
  cursor?: string;
  /** A revision_divergence target can resume only when done with zero violations. */
  done: boolean;
  sample: readonly VerificationViolation[];
}

const VIOLATION_SAMPLES = 20;

// A longer gap between calls lets the PIT expire and restarts the scan.
export const VERIFICATION_PIT_KEEP_ALIVE_MS = 10 * 60_000;

const scanStateSchema = z.strictObject({
  v: z.literal(2),
  pit: z.string().min(1).max(8192),
  after: z.tuple([z.number().int()]).nullable(),
  seq: z.record(z.string().regex(/^\d{1,5}$/), z.number().int()),
});
type ScanState = z.infer<typeof scanStateSchema>;

function readScanState(cursor: string | null): ScanState | undefined {
  if (cursor === null) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(cursor);
  } catch {
    return undefined;
  }
  const parsed = scanStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

interface ResumeStatements {
  readonly readVerifyTarget: SqlFragment;
  readonly checkVerificationQuiesced: SqlFragment;
  readonly startVerificationScan: SqlFragment;
  readonly advanceVerificationScan: SqlFragment;
  readonly resumePausedTarget: SqlFragment;
  readonly readLedgerRevisions: SqlFragment;
}

function renderResumeStatements(schema: string): ResumeStatements {
  const s = schemaIdentifier(schema);
  const targets = qualified(s, "targets");
  const runtime = qualified(s, "delivery_runtime");
  const documents = qualified(s, "documents");
  return {
    readVerifyTarget: sql`SELECT namespace, definition, physical_index, write_alias, fingerprint, hash_version, capture_epoch,
       state, write_enabled, remote_create_state, pause_reason, verify_cursor,
       (verify_started_at IS NOT NULL AND paused_at IS NOT NULL AND verify_started_at >= paused_at) AS verify_current,
       (verify_completed_at IS NOT NULL) AS verify_completed, verify_checked, verify_violations
FROM ${targets} WHERE target_id = $1;`,
    // $2 = leaseDurationMs + requestTimeoutMs. statement_timestamp() is fixed per statement, so it bounds the partial
    // expiry index scan; a lease alive at statement start counts as alive.
    checkVerificationQuiesced: sql`SELECT t.state, t.pause_reason,
       statement_timestamp() >= t.paused_at + ($2::bigint * interval '1 millisecond')
       AND NOT EXISTS (SELECT 1 FROM ${runtime} r
                       WHERE r.target_id = t.target_id AND r.lease_expires_at > statement_timestamp()) AS quiesced
FROM ${targets} t WHERE t.target_id = $1;`,
    startVerificationScan: sql`UPDATE ${targets}
SET verify_cursor = $2::text, verify_started_at = clock_timestamp(), verify_completed_at = NULL, verify_checked = 0, verify_violations = 0
WHERE target_id = $1 AND state = 'paused'
RETURNING verify_started_at;`,
    advanceVerificationScan: sql`UPDATE ${targets}
SET verify_cursor = $3, verify_checked = verify_checked + $4, verify_violations = verify_violations + $5,
    verify_completed_at = CASE WHEN $3::text IS NULL THEN clock_timestamp() END
WHERE target_id = $1 AND state = 'paused' AND verify_started_at IS NOT NULL AND verify_completed_at IS NULL
  AND verify_cursor IS NOT DISTINCT FROM $2::text
RETURNING verify_checked, verify_violations, verify_completed_at;`,
    resumePausedTarget: sql`UPDATE ${targets}
SET state = 'active', pause_reason = NULL, paused_at = NULL, resumed_at = clock_timestamp()
WHERE target_id = $1 AND state = 'paused' AND write_enabled AND capture_epoch = $2
  AND remote_create_state = 'verified'
  AND pause_reason ->> 'class' = $3
  AND ($3 = 'write_alias_missing'
       OR (verify_completed_at IS NOT NULL AND verify_violations = 0 AND verify_started_at >= paused_at))
RETURNING target_id;`,
    readLedgerRevisions: sql`SELECT document_id, revision FROM ${documents}
WHERE namespace = $1 AND definition = $2 AND document_id = ANY($3::text[]);`,
  };
}

const statementCache = createSchemaStatementCache(renderResumeStatements);

export function resumeStatementsFor(schema: string): ResumeStatements {
  return statementCache.get(schema);
}

export const verificationSearchResponseSchema = z.looseObject({
  timed_out: z.literal(false),
  _shards: z.looseObject({ failed: z.literal(0) }),
  pit_id: z.string().min(1).max(8192).optional(),
  hits: z.looseObject({
    hits: z.array(
      z.looseObject({
        _id: z.string().min(1),
        _version: z.number().int(),
        sort: z.tuple([z.number().int()]),
        _source: z
          .looseObject({
            sonamu_meta: z.looseObject({ revision: z.number().int() }).optional(),
          })
          .optional(),
      }),
    ),
  }),
});

const pitCreatedSchema = z.looseObject({ pit_id: z.string().min(1).max(8192) });

const shardSeqStatsSchema = z.looseObject({
  indices: z.record(
    z.string(),
    z.looseObject({
      shards: z.record(
        z.string().regex(/^\d{1,5}$/),
        z.array(
          z.looseObject({
            routing: z.looseObject({ primary: z.boolean() }),
            seq_no: z.looseObject({ max_seq_no: z.number().int() }),
          }),
        ),
      ),
    }),
  ),
});

function invalidTargetId(targetId: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "names.invalidTargetId", params: { name: String(targetId).slice(0, 80) } },
    { details: { reason: "invalid-target-id" } },
  );
}

function targetNotFound(targetId: string): SearchNotConfigured {
  return new SearchNotConfigured(
    { key: "admin.targetNotFound", params: { targetId } },
    { details: { reason: "target-not-found", targetId } },
  );
}

function verificationRefused(
  targetId: string,
  reason: string,
  options: { retryable?: boolean; extra?: DetailRecord } = {},
): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.verificationRefused", params: { targetId, reason } },
    { retryable: options.retryable ?? false, details: { ...options.extra, reason, targetId } },
  );
}

function resumeRefused(
  targetId: string,
  reason: string,
  extra: DetailRecord = {},
): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.resumeTargetRefused", params: { targetId, reason } },
    { details: { ...extra, reason, targetId } },
  );
}

function invalidRemoteResponse(operation: string): SearchUnavailable {
  return new SearchUnavailable(
    { key: "admin.invalidRemoteResponse", params: { operation } },
    { retryable: false, details: { reason: "invalid-remote-response", operation } },
  );
}

function engineError(response: SearchHttpResponse): SearchError {
  return toSearchError(describeResponseFailure(response.status, response.body));
}

function throwIfAborted(signal: AbortSignal | undefined, targetId: string): void {
  if (signal?.aborted === true) {
    throw new SearchTimeout(
      { key: "admin.aborted", params: { operation: "verify-page" } },
      { details: { reason: "aborted", targetId } },
    );
  }
}

async function readVerifyTarget(
  store: AdminStore,
  targetId: string,
): Promise<VerifyTargetRow | undefined> {
  const q = resumeStatementsFor(store.schema);
  return store.transaction(
    async (trx) =>
      singleRow(
        await store.execute(trx, statement(q.readVerifyTarget, [targetId])),
        verifyTargetRowSchema,
        "readVerifyTarget",
      ),
    { readOnly: true },
  );
}

function identityOf(targetId: string, row: VerifyTargetRow, storeId: string): RemoteIdentity {
  return {
    targetId,
    physicalIndex: row.physical_index,
    writeAlias: row.write_alias,
    namespace: row.namespace,
    logicalKey: row.definition,
    fingerprint: row.fingerprint,
    hashVersion: row.hash_version,
    storeId,
  };
}

function progressOf(
  targetId: string,
  row: { checked: number; violations: number; cursor: string | null; done: boolean },
  sample: readonly VerificationViolation[],
): VerificationProgress {
  const progress: VerificationProgress = {
    targetId,
    checked: row.checked,
    violations: row.violations,
    done: row.done,
    sample,
  };
  if (row.cursor !== null) progress.cursor = row.cursor;
  return progress;
}

async function readShardSeqNos(
  requester: SearchRequester,
  physicalIndex: string,
): Promise<Record<string, number>> {
  const response = await requester.send({
    method: "GET",
    path: `/${encodeURIComponent(physicalIndex)}/_stats/docs`,
    querystring: {
      level: "shards",
      filter_path: "indices.*.shards.*.routing.primary,indices.*.shards.*.seq_no.max_seq_no",
    },
  });
  if (response.status !== 200) throw engineError(response);
  const parsed = shardSeqStatsSchema.safeParse(response.body);
  if (!parsed.success) throw invalidRemoteResponse("verify-stats");
  const index = parsed.data.indices[physicalIndex];
  if (index === undefined) throw invalidRemoteResponse("verify-stats");
  const seq: Record<string, number> = {};
  for (const [shard, copies] of Object.entries(index.shards)) {
    const primary = copies.find((copy) => copy.routing.primary);
    if (primary === undefined) throw invalidRemoteResponse("verify-stats");
    seq[shard] = primary.seq_no.max_seq_no;
  }
  if (Object.keys(seq).length === 0) throw invalidRemoteResponse("verify-stats");
  return seq;
}

function sameSeqNos(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
) {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

async function closePit(requester: SearchRequester, pit: string): Promise<void> {
  await requester
    .send({ method: "DELETE", path: "/_search/point_in_time", body: { pit_id: [pit] } })
    .catch(() => undefined);
}

async function writeScanStart(
  operation: AdminOperation,
  targetId: string,
  state: string | null,
  step: string,
): Promise<void> {
  const { store } = operation;
  const q = resumeStatementsFor(store.schema);
  await operation.fenced(
    "shared",
    async (trx: Knex.Transaction) => {
      const started = singleRow(
        await store.execute(trx, statement(q.startVerificationScan, [targetId, state])),
        verifyStartedRowSchema,
        "startVerificationScan",
      );
      if (started === undefined) throw verificationRefused(targetId, "target-not-paused");
    },
    () => ({ outcome: "started", targetId, detail: { step } }),
  );
}

async function startScan(
  context: ResumeTargetContext,
  operation: AdminOperation,
  requester: SearchRequester,
  targetId: string,
  row: VerifyTargetRow,
): Promise<ScanState> {
  const { store } = context;
  const q = resumeStatementsFor(store.schema);
  const boundMs = context.workerBounds.leaseDurationMs + context.workerBounds.requestTimeoutMs;
  const quiet = await store.transaction(
    async (trx) =>
      singleRow(
        await store.execute(trx, statement(q.checkVerificationQuiesced, [targetId, boundMs])),
        verifyQuiescedRowSchema,
        "checkVerificationQuiesced",
      ),
    { readOnly: true },
  );
  if (quiet === undefined) throw targetNotFound(targetId);
  if (quiet.state !== "paused") {
    throw verificationRefused(targetId, "target-not-paused", { extra: { state: quiet.state } });
  }
  if (quiet.quiesced !== true) {
    throw verificationRefused(targetId, "verification-not-quiesced", {
      retryable: true,
      extra: { boundMs },
    });
  }
  const previous = readScanState(row.verify_cursor);
  if (previous !== undefined) await closePit(requester, previous.pit);
  await operation.heartbeat();
  // seq0 is read before the refresh, so any later write shows up in the final comparison.
  const seq = await readShardSeqNos(requester, row.physical_index);
  // One refresh after quiescence makes every acknowledged write visible to the PIT.
  const refreshed = await requester.send({
    method: "POST",
    path: `/${encodeURIComponent(row.physical_index)}/_refresh`,
  });
  if (refreshed.status < 200 || refreshed.status >= 300) throw engineError(refreshed);
  const opened = await requester.send({
    method: "POST",
    path: `/${encodeURIComponent(row.physical_index)}/_search/point_in_time`,
    querystring: { keep_alive: `${VERIFICATION_PIT_KEEP_ALIVE_MS}ms` },
  });
  if (opened.status !== 200) throw engineError(opened);
  const pit = pitCreatedSchema.safeParse(opened.body);
  if (!pit.success) throw invalidRemoteResponse("verify-pit");
  const state: ScanState = { v: 2, pit: pit.data.pit_id, after: null, seq };
  try {
    await writeScanStart(operation, targetId, JSON.stringify(state), "verify-start");
  } catch (error) {
    await closePit(requester, state.pit);
    throw error;
  }
  return state;
}

interface ScannedPage {
  hits: { id: string; version: number; metaRevision: number | null; sort: [number] }[];
  pit: string;
}

async function searchPage(
  requester: SearchRequester,
  state: ScanState,
  limit: number,
): Promise<ScannedPage | "expired"> {
  const body: JsonObject = {
    size: limit,
    // The fence document has no ledger row.
    query: { bool: { must_not: [{ ids: { values: [FENCE_DOCUMENT_ID] } }] } },
    sort: [{ _shard_doc: "asc" }],
    pit: { id: state.pit, keep_alive: `${VERIFICATION_PIT_KEEP_ALIVE_MS}ms` },
    _source: ["sonamu_meta.revision"],
    version: true,
    track_total_hits: false,
  };
  if (state.after !== null) body.search_after = [state.after[0]];
  // A PIT search puts no index in the path (the engine refuses that with 400).
  const response = await requester.send({ method: "POST", path: "/_search", body });
  if (response.status === 404) return "expired";
  if (response.status !== 200) throw engineError(response);
  const parsed = verificationSearchResponseSchema.safeParse(response.body);
  if (!parsed.success) throw invalidRemoteResponse("verify-search");
  const hits = parsed.data.hits.hits.map((hit) => ({
    id: hit._id,
    version: hit._version,
    metaRevision: hit._source?.sonamu_meta?.revision ?? null,
    sort: hit.sort,
  }));
  if (hits.length > limit) throw invalidRemoteResponse("verify-search");
  // Sort order is not trusted: anything but strictly ascending could see a document twice or skip one.
  let previous = state.after === null ? null : state.after[0];
  for (const hit of hits) {
    if (previous !== null && hit.sort[0] <= previous) throw invalidRemoteResponse("verify-search");
    previous = hit.sort[0];
  }
  return { hits, pit: parsed.data.pit_id ?? state.pit };
}

// Read after the search: revisions only rise, so a late read errs in the safe direction.
async function readLedger(
  store: AdminStore,
  logicalKey: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const q = resumeStatementsFor(store.schema);
  const rows = await store.transaction(
    async (trx) =>
      (
        await store.execute(
          trx,
          statement(q.readLedgerRevisions, [store.namespace, logicalKey, [...ids]]),
        )
      ).rows,
    { readOnly: true },
  );
  return new Map(
    rows.map((raw) => {
      const row = ledgerRevisionRowSchema.safeParse(raw);
      if (!row.success) throw invalidAdminRow("readLedgerRevisions");
      return [row.data.document_id, row.data.revision] as const;
    }),
  );
}

export async function runTargetVerificationPage(
  context: ResumeTargetContext,
  targetId: string,
  options: { limit: number; signal?: AbortSignal },
): Promise<VerificationProgress> {
  if (!targetIdArgumentSchema.safeParse(targetId).success) throw invalidTargetId(targetId);
  const parsedOptions = verificationOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    const path = `options.${String(parsedOptions.error.issues[0]?.path[0] ?? "limit")}`;
    throw new SearchConfigurationError(
      { key: "admin.invalidRepairArgument", params: { path } },
      { details: { reason: "invalid-repair-argument", path } },
    );
  }
  const { limit, signal } = parsedOptions.data;
  const { store } = context;
  await requireStoreBinding(context.binding);
  const before = await readVerifyTarget(store, targetId);
  if (before === undefined || before.namespace !== store.namespace) throw targetNotFound(targetId);
  const request = parseOperationRequest({
    logicalKey: before.definition,
    kind: "verify-page",
    operationId: `verify:${targetId}`,
    actor: "system",
    reason: "verify-page",
  });
  const leased = leaseBoundRequester(context);
  throwIfAborted(signal, targetId);
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    let row = await readVerifyTarget(store, targetId);
    if (row === undefined) throw targetNotFound(targetId);
    if (row.state !== "paused") {
      throw verificationRefused(targetId, "target-not-paused", { extra: { state: row.state } });
    }
    if (row.verify_current && row.verify_completed && row.verify_violations === 0) {
      return progressOf(
        targetId,
        { checked: row.verify_checked, violations: 0, cursor: null, done: true },
        [],
      );
    }
    let state = readScanState(row.verify_cursor);
    if (!row.verify_current || row.verify_completed || state === undefined) {
      state = await startScan(context, operation, leased, targetId, row);
      row = await readVerifyTarget(store, targetId);
      if (row === undefined) throw targetNotFound(targetId);
    }
    throwIfAborted(signal, targetId);
    let cursor = row.verify_cursor;
    await operation.heartbeat();
    let page = await searchPage(leased, state, limit);
    if (page === "expired") {
      state = await startScan(context, operation, leased, targetId, row);
      cursor = JSON.stringify(state);
      page = await searchPage(leased, state, limit);
      if (page === "expired") throw invalidRemoteResponse("verify-pit");
    }
    const scanned = page;
    const ledger = await readLedger(
      store,
      row.definition,
      scanned.hits.map((hit) => hit.id),
    );
    const violations: VerificationViolation[] = [];
    for (const hit of scanned.hits) {
      const revision = ledger.get(hit.id);
      if (revision === undefined || hit.version > revision || hit.metaRevision !== hit.version) {
        violations.push({ id: hit.id, indexed: hit.version, ledger: revision ?? null });
      }
    }
    const last = scanned.hits.at(-1);
    const finished = scanned.hits.length < limit || last === undefined;
    await operation.heartbeat();
    throwIfAborted(signal, targetId);
    if (finished) {
      const seq = await readShardSeqNos(leased, row.physical_index);
      if (!sameSeqNos(seq, state.seq)) {
        await closePit(leased, scanned.pit);
        await writeScanStart(operation, targetId, null, "verify-raced");
        throw verificationRefused(targetId, "verification-raced-writes", { retryable: true });
      }
    }
    const next =
      finished || last === undefined
        ? null
        : JSON.stringify({ ...state, pit: scanned.pit, after: last.sort } satisfies ScanState);
    const q = resumeStatementsFor(store.schema);
    const advanced = await operation.fenced(
      "shared",
      async (trx: Knex.Transaction) => {
        const result = singleRow(
          await store.execute(
            trx,
            statement(q.advanceVerificationScan, [
              targetId,
              cursor,
              next,
              scanned.hits.length,
              violations.length,
            ]),
          ),
          verifyAdvancedRowSchema,
          "advanceVerificationScan",
        );
        if (result === undefined) throw verificationRefused(targetId, "verification-state-changed");
        return result;
      },
      (result) => ({
        outcome: result.verify_completed_at === null ? "started" : "succeeded",
        targetId,
        detail: {
          step: "verify-page",
          checked: scanned.hits.length,
          violations: violations.length,
          done: result.verify_completed_at !== null,
        },
      }),
    );
    if (advanced.verify_completed_at !== null) await closePit(leased, scanned.pit);
    return progressOf(
      targetId,
      {
        checked: advanced.verify_checked,
        violations: advanced.verify_violations,
        cursor: finished ? null : (last?.id ?? null),
        done: advanced.verify_completed_at !== null,
      },
      violations.slice(0, VIOLATION_SAMPLES),
    );
  });
}

export async function resumeTarget(
  context: ResumeTargetContext,
  targetId: string,
  audit: AdminAudit,
): Promise<TargetHandle> {
  if (!targetIdArgumentSchema.safeParse(targetId).success) throw invalidTargetId(targetId);
  const { store } = context;
  const { storeId } = await requireStoreBinding(context.binding);
  const before = await readVerifyTarget(store, targetId);
  if (before === undefined || before.namespace !== store.namespace) throw targetNotFound(targetId);
  const request = parseOperationRequest({
    logicalKey: before.definition,
    kind: "resume-target",
    ...audit,
  });
  const leased = leaseBoundRequester(context);
  const q = resumeStatementsFor(store.schema);
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    const row = await operation.fenced("shared", async (trx: Knex.Transaction, barrier) => {
      const current = singleRow(
        await store.execute(trx, statement(q.readVerifyTarget, [targetId])),
        verifyTargetRowSchema,
        "readVerifyTarget",
      );
      if (current === undefined) throw targetNotFound(targetId);
      if (current.state !== "paused") {
        throw resumeRefused(targetId, "target-not-paused", { state: current.state });
      }
      if (
        barrier.capture_mode !== "active" ||
        !current.write_enabled ||
        current.capture_epoch !== barrier.capture_epoch ||
        current.remote_create_state !== "verified"
      ) {
        throw resumeRefused(targetId, "target-epoch-invalid", {
          captureMode: barrier.capture_mode,
          captureEpoch: current.capture_epoch,
          currentCaptureEpoch: barrier.capture_epoch,
          writeEnabled: current.write_enabled,
        });
      }
      return current;
    });
    if (row.pause_reason === null) throw invalidAdminRow("readVerifyTarget");
    const pauseClass = row.pause_reason.class;
    await operation.heartbeat();
    await verifyRegistered(leased, identityOf(targetId, row, storeId));
    await verifyFence(store, leased, { targetId, physicalIndex: row.physical_index });
    if (pauseClass === "revision_divergence") {
      if (!row.verify_current) {
        throw resumeRefused(
          targetId,
          row.verify_completed ? "verification-stale" : "verification-incomplete",
        );
      }
      if (!row.verify_completed) throw resumeRefused(targetId, "verification-incomplete");
      if (row.verify_violations > 0) {
        throw resumeRefused(targetId, "verification-violations", {
          violations: row.verify_violations,
        });
      }
    }
    await operation.heartbeat();
    await operation.fenced(
      "shared",
      async (trx: Knex.Transaction, barrier) => {
        if (barrier.capture_mode !== "active") {
          throw resumeRefused(targetId, "target-epoch-invalid", { captureMode: "suspended" });
        }
        const resumed = singleRow(
          await store.execute(
            trx,
            statement(q.resumePausedTarget, [targetId, barrier.capture_epoch, pauseClass]),
          ),
          resumedTargetRowSchema,
          "resumePausedTarget",
        );
        if (resumed === undefined) throw resumeRefused(targetId, "resume-state-changed");
      },
      () => ({
        outcome: "succeeded",
        targetId,
        detail: {
          step: "resume-target",
          pauseClass,
          verifiedChecked: pauseClass === "revision_divergence" ? row.verify_checked : null,
        },
      }),
    );
    return {
      targetId,
      physicalIndex: row.physical_index,
      writeAlias: row.write_alias,
      fingerprint: row.fingerprint,
      captureEpoch: row.capture_epoch,
      remoteCreateState: "verified",
    };
  });
}
