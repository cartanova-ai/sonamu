import { type Knex } from "knex";
import { z } from "zod";

import { type DefinedSearch, type ProjectionReadContext } from "../definition/define-search";
import {
  SearchAdminBusy,
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
import { type MarkChangedResult, type PostgresSynchronization } from "../postgres/synchronization";
import {
  type AdminStore,
  invalidAdminRow,
  parseOperationRequest,
  runAdminOperation,
} from "./admin-lease";
import { cutoverStatementsFor } from "./cutover";
import { type RemoteCreateContext } from "./remote-create";
import {
  type adminContextSchema,
  ledgerIdRowSchema,
  releasedQuarantineRowSchema,
  remarkInputSchema,
  retryScopeSchema,
  scanBoundarySchema,
  scanPageSchema,
  writeTargetFingerprintRowSchema,
} from "./rows";
import { readTargetIdentity } from "./targets";

// remark marks IDs with the synchronization handle's markChanged inside a fenced transaction, so a repair gets a new
// ledger revision the same way a domain write does. A domain transaction marking the same document serializes on the
// ledger row lock: READ COMMITTED waits, an older REPEATABLE READ snapshot fails with 40001 and must rerun. A ledger
// scan is the only way to find hard deletes that were never marked (FK CASCADE and the like).

type AdminAudit = z.input<typeof adminContextSchema>;
type RemarkInput = z.output<typeof remarkInputSchema>;

export interface RepairContext extends RemoteCreateContext {
  readonly synchronization: PostgresSynchronization;
}

export type RetryScope = {
  targetId: string;
  limit: number;
  documentIds?: readonly string[];
  signal?: AbortSignal;
};
export interface RetryReport {
  released: number;
}
export type DocumentScope =
  | { logicalKey: string; ids: readonly string[]; signal?: AbortSignal }
  | {
      logicalKey: string;
      scan: "source" | "ledger";
      after?: string;
      through?: string;
      limit: number;
      signal?: AbortSignal;
    };
export interface RemarkReport {
  /** 0 while capture is suspended. */
  marked: number;
  result: MarkChangedResult;
  /** Absent when the scan of this range is finished. */
  next?: string;
}

interface RepairStatements {
  readonly releaseQuarantine: SqlFragment;
  readonly readWriteTargetFingerprints: SqlFragment;
}

function renderRepairStatements(schema: string): RepairStatements {
  const s = schemaIdentifier(schema);
  const indexes = qualified(s, "indexes");
  const targets = qualified(s, "targets");
  const readHeads = qualified(s, "read_heads");
  const deliveries = qualified(s, "deliveries");
  const runtime = qualified(s, "delivery_runtime");
  return {
    // Locks the intent first and changes only the matching incarnation's runtime; never rewrites the intent.
    releaseQuarantine: sql`WITH picked AS MATERIALIZED (
  SELECT d.target_id, d.document_id, d.intent_id
  FROM ${deliveries} d
  JOIN ${runtime} r
    ON r.target_id = d.target_id AND r.document_id = d.document_id AND r.intent_id = d.intent_id
  WHERE d.target_id = $1 AND r.quarantined_revision IS NOT NULL
    AND ($2::text[] IS NULL OR d.document_id = ANY($2::text[]))
  ORDER BY d.target_id, d.document_id
  LIMIT $3
  FOR UPDATE OF d SKIP LOCKED
),
locked AS MATERIALIZED (
  SELECT r.target_id, r.document_id, r.intent_id
  FROM ${runtime} r
  JOIN picked p ON p.target_id = r.target_id AND p.document_id = r.document_id AND p.intent_id = r.intent_id
  ORDER BY r.target_id, r.document_id
  FOR UPDATE OF r SKIP LOCKED
)
UPDATE ${runtime} r
SET quarantined_revision = NULL, failure_revision = 0, attempts = 0, first_attempt_at = NULL, retry_age_ms = 0,
    last_error = NULL, available_at = clock_timestamp(), available_revision = 0, updated_at = clock_timestamp()
FROM locked l
WHERE r.target_id = l.target_id AND r.document_id = l.document_id AND r.intent_id = l.intent_id
RETURNING r.document_id;`,
    readWriteTargetFingerprints: sql`SELECT t.fingerprint
FROM ${targets} t
JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
LEFT JOIN ${readHeads} h ON h.namespace = t.namespace AND h.definition = t.definition
WHERE t.namespace = $1 AND t.definition = $2 AND t.write_enabled AND t.capture_epoch = i.capture_epoch
ORDER BY (t.target_id IS NOT DISTINCT FROM h.target_id) DESC, t.created_at DESC, t.target_id;`,
  };
}

const statementCache = createSchemaStatementCache(renderRepairStatements);

export function repairStatementsFor(schema: string): RepairStatements {
  return statementCache.get(schema);
}

function invalidArgument(path: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "admin.invalidRepairArgument", params: { path } },
    { details: { reason: "invalid-repair-argument", path } },
  );
}

function aborted(operation: string): SearchTimeout {
  return new SearchTimeout(
    { key: "admin.aborted", params: { operation } },
    { details: { reason: "aborted", operation } },
  );
}

function throwIfAborted(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted === true) throw aborted(operation);
}

function targetNotFound(targetId: string): SearchNotConfigured {
  return new SearchNotConfigured(
    { key: "admin.targetNotFound", params: { targetId } },
    { details: { reason: "target-not-found", targetId } },
  );
}

function invalidScanResult(logicalKey: string, field: string): SearchProjectionError {
  return new SearchProjectionError(
    { key: "admin.invalidScanResult", params: { logicalKey, field } },
    { details: { reason: "invalid-scan-result", logicalKey, field } },
  );
}

// The synchronization handle maps errors in the capture context; here these become SearchAdminBusy.
const ADMIN_BUSY_SQLSTATES = new Set(["40001", "40P01", "55P03", "57014"]);
const sqlstateDetailSchema = z.looseObject({ sqlstate: z.string() });

function asAdminError<Thrown>(error: Thrown): Thrown | SearchAdminBusy {
  if (!(error instanceof SearchError) || error instanceof SearchAdminBusy) return error;
  const detail = sqlstateDetailSchema.safeParse(error.details ?? {});
  if (!detail.success || !ADMIN_BUSY_SQLSTATES.has(detail.data.sqlstate)) return error;
  const { sqlstate } = detail.data;
  return new SearchAdminBusy(
    { key: "pg.transactionConflict", params: { sqlstate } },
    { details: { ...error.details } },
  );
}

async function sourceDefinition(
  context: RepairContext,
  logicalKey: string,
): Promise<DefinedSearch> {
  const candidates = [...context.definitions.values()].filter((d) => d.key === logicalKey);
  if (candidates.length === 0) {
    throw new SearchNotConfigured(
      { key: "admin.definitionNotRegistered", params: { logicalKey } },
      { details: { reason: "definition-not-registered", logicalKey } },
    );
  }
  if (candidates.length === 1) return candidates[0];
  const { store } = context;
  const q = repairStatementsFor(store.schema);
  const fingerprints = await store.transaction(
    async (trx) =>
      (
        await store.execute(
          trx,
          statement(q.readWriteTargetFingerprints, [store.namespace, logicalKey]),
        )
      ).rows.map((raw) => {
        const row = writeTargetFingerprintRowSchema.safeParse(raw);
        if (!row.success) throw invalidAdminRow("readWriteTargetFingerprints");
        return row.data.fingerprint;
      }),
    { readOnly: true },
  );
  for (const fingerprint of fingerprints) {
    const found = context.definitions.get(`${logicalKey}@${fingerprint}`);
    if (found !== undefined) return found;
  }
  throw new SearchConfigurationError(
    { key: "admin.definitionAmbiguous", params: { logicalKey, count: candidates.length } },
    { details: { reason: "definition-ambiguous", logicalKey, count: candidates.length } },
  );
}

async function inSourceSnapshot<T>(
  store: AdminStore,
  logicalKey: string,
  signal: AbortSignal | undefined,
  work: (readContext: ProjectionReadContext) => Promise<T>,
): Promise<T> {
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

interface RemarkPage {
  ids: string[];
  next?: string;
}

async function collectRemarkPage(context: RepairContext, scope: RemarkInput): Promise<RemarkPage> {
  if ("ids" in scope) return { ids: [...scope.ids] };
  const { store } = context;
  const { logicalKey, limit } = scope;
  if (scope.scan === "ledger") {
    const scanLedgerIds = cutoverStatementsFor(store.schema).scanLedgerIds;
    const ids = await store.transaction(
      async (trx) =>
        (
          await store.execute(
            trx,
            statement(scanLedgerIds, [
              store.namespace,
              logicalKey,
              scope.after ?? null,
              scope.through ?? null,
              limit,
            ]),
          )
        ).rows.map((raw) => {
          const row = ledgerIdRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("scanLedgerIds");
          return row.data.document_id;
        }),
      { readOnly: true },
    );
    return ids.length === limit ? { ids, next: ids[ids.length - 1] } : { ids };
  }
  const definition = await sourceDefinition(context, logicalKey);
  const raw = await inSourceSnapshot(store, logicalKey, scope.signal, async (readContext) => {
    let through = scope.through;
    if (through === undefined) {
      const boundary = scanBoundarySchema.safeParse(
        await definition.captureScanBoundary(readContext),
      );
      if (!boundary.success) throw invalidScanResult(logicalKey, "boundary");
      through = boundary.data;
    }
    return definition.scanSourceIds(
      readContext,
      scope.after === undefined ? { through, limit } : { after: scope.after, through, limit },
    );
  });
  const page = scanPageSchema.safeParse(raw);
  if (!page.success) {
    throw invalidScanResult(logicalKey, String(page.error.issues[0]?.path[0] ?? "page"));
  }
  if (page.data.ids.length > limit) throw invalidScanResult(logicalKey, "ids");
  // A page that does not advance the cursor would repeat forever.
  if (page.data.next !== undefined && page.data.next === scope.after) {
    throw invalidScanResult(logicalKey, "next");
  }
  return page.data.next === undefined
    ? { ids: [...page.data.ids] }
    : { ids: [...page.data.ids], next: page.data.next };
}

export async function remark(
  context: RepairContext,
  input: DocumentScope,
  audit: AdminAudit,
): Promise<RemarkReport> {
  const parsed = remarkInputSchema.safeParse(input);
  if (!parsed.success) {
    throw invalidArgument(String(parsed.error.issues[0]?.path[0] ?? "input").slice(0, 40));
  }
  const scope = parsed.data;
  const request = parseOperationRequest({ logicalKey: scope.logicalKey, kind: "remark", ...audit });
  throwIfAborted(scope.signal, "remark");
  const { store, synchronization } = context;
  await requireStoreBinding(context.binding);
  await synchronization.initialize(scope.signal === undefined ? {} : { signal: scope.signal });
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    const page = await collectRemarkPage(context, scope);
    await operation.heartbeat();
    throwIfAborted(scope.signal, "remark");
    const scanKind = "ids" in scope ? "ids" : scope.scan;
    const result = await operation.fenced(
      "shared",
      async (trx: Knex.Transaction) => {
        try {
          return await synchronization.markChanged(trx, scope.logicalKey, page.ids);
        } catch (error) {
          throw asAdminError(error);
        }
      },
      (outcome) => ({
        outcome: "succeeded",
        detail: {
          step: "remark",
          scan: scanKind,
          result: outcome,
          marked: outcome === "recorded" ? new Set(page.ids).size : 0,
          more: page.next !== undefined,
        },
      }),
    );
    const report: RemarkReport = {
      marked: result === "recorded" ? new Set(page.ids).size : 0,
      result,
    };
    if (page.next !== undefined) report.next = page.next;
    return report;
  });
}

export async function retryQuarantined(
  context: RepairContext,
  input: RetryScope,
  audit: AdminAudit,
): Promise<RetryReport> {
  const parsed = retryScopeSchema.safeParse(input);
  if (!parsed.success) {
    throw invalidArgument(String(parsed.error.issues[0]?.path[0] ?? "input").slice(0, 40));
  }
  const scope = parsed.data;
  const { store } = context;
  await requireStoreBinding(context.binding);
  const before = await readTargetIdentity(store, scope.targetId);
  if (before === undefined || before.namespace !== store.namespace) {
    throw targetNotFound(scope.targetId);
  }
  if (before.state === "detached") {
    throw new SearchAdminPreconditionFailed(
      { key: "admin.targetDetached", params: { targetId: scope.targetId } },
      { details: { reason: "target-detached", targetId: scope.targetId } },
    );
  }
  const request = parseOperationRequest({
    logicalKey: before.definition,
    kind: "retry-quarantined",
    ...audit,
  });
  throwIfAborted(scope.signal, "retry-quarantined");
  const q = repairStatementsFor(store.schema);
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    throwIfAborted(scope.signal, "retry-quarantined");
    const released = await operation.fenced(
      "shared",
      async (trx: Knex.Transaction) =>
        (
          await store.execute(
            trx,
            statement(q.releaseQuarantine, [
              scope.targetId,
              scope.documentIds ?? null,
              scope.limit,
            ]),
          )
        ).rows.map((raw) => {
          const row = releasedQuarantineRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("releaseQuarantine");
          return row.data.document_id;
        }),
      (documents) => ({
        outcome: "succeeded",
        targetId: scope.targetId,
        detail: { step: "retry-quarantined", released: documents.length },
      }),
    );
    return { released: released.length };
  });
}
