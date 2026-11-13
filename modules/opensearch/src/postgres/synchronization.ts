import { type Knex } from "knex";
import { type z } from "zod";

import { type DocumentId } from "../definition/define-search";
import {
  assertDocumentId,
  assertNamespace,
  assertSchemaName,
  DEFAULT_SEARCH_SCHEMA,
  isLogicalKey,
} from "../definition/names";
import {
  SearchConfigurationError,
  SearchError,
  SearchInvalidDocumentId,
  SearchInvalidTransaction,
  SearchNoWriteTarget,
  SearchNotConfigured,
  SearchRevisionOverflow,
  SearchSchemaVersionMismatch,
  SearchStoreMismatch,
  SearchTimeout,
} from "../errors";
import {
  barrierRowSchema,
  captureRowSchema,
  DEFAULT_MAX_IDS_PER_CALL,
  isLiveTransaction,
  isSqlExecutor,
  ledgerRowSchema,
  looksLikeTransaction,
  markChangedInputSchema,
  storeRowSchema,
  synchronizationOptionsSchema,
} from "./rows";
import { executeSql, qualified, schemaIdentifier, sql, type SqlFragment, statement } from "./sql";
import { readStoreBinding, readStoreBindingCombined, type StoreBinding } from "./store-binding";

export type { StoreBinding } from "./store-binding";

// markChanged runs only on the caller's transaction, never another connection or a new transaction. The handle is
// checked before any statement (a dead handle cannot be failed). A package precondition violation (store identity,
// input, barrier or capture row, revision range) first fails the transaction, so a caller that swallows the error
// cannot commit the domain change without its intent; SQL errors have already failed it. "suspended" is a result:
// nothing is failed or written. The store identity comes only from expectedStoreId or initialize(). One call sorts its
// IDs by bytes; call once per logical key in ascending byte order and rerun the whole transaction on 40001/40P01.

export type MarkChangedResult = "recorded" | "suspended";

export interface SearchSynchronization {
  readonly namespace: string;
  readonly schema: string;
  /** Increments each document's ledger revision and schedules it for every write target, in the caller's transaction. */
  markChanged(
    trx: Knex.Transaction,
    logicalKey: string,
    ids: readonly DocumentId[],
  ): Promise<MarkChangedResult>;
}

export interface PostgresSynchronizationOptions {
  /** Called on every operation, never by markChanged. */
  getPrimaryDatabase: () => Knex;
  /** Default "sonamu_search". */
  schema?: string;
  namespace: string;
  /** When set, markChanged works without initialize(). */
  expectedStoreId?: string;
  /** Default 10_000. */
  maxIdsPerCall?: number;
  /**
   * Per-environment name (1 to 128 bytes); never hard-code it. When it differs from the recorded name, the worker and
   * remote admin operations stop with store-instance-mismatch.
   */
  instanceName?: string;
}

export interface PostgresSynchronization extends SearchSynchronization {
  /** Reads and pins store_id once; await it before marking. Concurrent calls share one read. */
  initialize(options?: { signal?: AbortSignal }): Promise<{ storeId: string }>;
  storeId(): string | undefined;
  /** Checks the store's binding to this database and instanceName; a mismatch is returned, not thrown. */
  checkBinding(): Promise<StoreBinding>;
  readonly instanceName: string | undefined;
  readonly options: Readonly<
    Required<Omit<PostgresSynchronizationOptions, "expectedStoreId" | "instanceName">>
  >;
}

export type SynchronizationStatements = {
  readonly readStoreId: SqlFragment;
  readonly abortTransaction: SqlFragment;
  readonly lockIndexRow: SqlFragment;
  readonly readCaptureTargets: SqlFragment;
  readonly incrementRevisions: SqlFragment;
  readonly enqueueDeliveries: SqlFragment;
};

export function renderSynchronizationStatements(schema: string): SynchronizationStatements {
  const s = schemaIdentifier(schema);
  const store = qualified(s, "store");
  const indexes = qualified(s, "indexes");
  const targets = qualified(s, "targets");
  const documents = qualified(s, "documents");
  const deliveries = qualified(s, "deliveries");
  return {
    readStoreId: sql`SELECT store_id FROM ${store};`,
    // $1 = 0: SQLSTATE 22012 fails the transaction (or savepoint).
    abortTransaction: sql`SELECT 1 / $1::integer;`,
    lockIndexRow: sql`SELECT generation, store_id FROM ${indexes} WHERE namespace = $1 AND definition = $2 FOR SHARE;`,
    // Read in a statement after the barrier lock, never in the locking statement or its CTE.
    readCaptureTargets: sql`SELECT i.capture_mode, i.capture_epoch,
       COALESCE(array_agg(t.target_id ORDER BY t.target_id) FILTER (WHERE t.target_id IS NOT NULL), '{}') AS target_ids
FROM ${indexes} i
LEFT JOIN ${targets} t
  ON t.namespace = i.namespace AND t.definition = i.definition
 AND t.write_enabled AND t.capture_epoch = i.capture_epoch
WHERE i.namespace = $1 AND i.definition = $2
GROUP BY i.capture_mode, i.capture_epoch;`,
    incrementRevisions: sql`INSERT INTO ${documents} AS d (namespace, definition, document_id, revision, updated_at)
SELECT $1, $2, x.id, 1, clock_timestamp()
FROM unnest($3::text[]) WITH ORDINALITY AS x(id, ord)
ORDER BY x.ord
ON CONFLICT (namespace, definition, document_id)
DO UPDATE SET revision = d.revision + 1, updated_at = clock_timestamp()
RETURNING d.document_id, d.revision;`,
    enqueueDeliveries: sql`INSERT INTO ${deliveries} AS q (target_id, document_id, desired_revision)
SELECT t.target_id, r.document_id, r.revision
FROM unnest($1::uuid[]) AS t(target_id)
CROSS JOIN unnest($2::text[], $3::bigint[]) AS r(document_id, revision)
ORDER BY t.target_id, r.document_id COLLATE "C"
ON CONFLICT (target_id, document_id)
DO UPDATE SET desired_revision = EXCLUDED.desired_revision, updated_at = clock_timestamp()
WHERE q.desired_revision < EXCLUDED.desired_revision;`,
  };
}

// Byte order matches COLLATE "C" in enqueueDeliveries.
function sortedUniqueIds(ids: readonly string[]): string[] {
  const encoded = [...new Set(ids)].map((id) => ({ id, bytes: Buffer.from(id, "utf8") }));
  encoded.sort((left, right) => Buffer.compare(left.bytes, right.bytes));
  return encoded.map((entry) => entry.id);
}

function describeIssuePath(issue: z.core.$ZodIssue | undefined): string {
  return (issue?.path ?? []).map(String).join(".").slice(0, 120) || "options";
}

function parseOptions(options: PostgresSynchronizationOptions) {
  const parsed = synchronizationOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = describeIssuePath(issue);
    throw new SearchConfigurationError(
      { key: "sync.invalidOptions", params: { path } },
      { details: { reason: "invalid-options", issue: issue?.code ?? "unknown", path } },
    );
  }
  return {
    getPrimaryDatabase: options.getPrimaryDatabase,
    schema: assertSchemaName(parsed.data.schema ?? DEFAULT_SEARCH_SCHEMA),
    namespace: assertNamespace(parsed.data.namespace),
    maxIdsPerCall: parsed.data.maxIdsPerCall ?? DEFAULT_MAX_IDS_PER_CALL,
    expectedStoreId: parsed.data.expectedStoreId,
    instanceName: parsed.data.instanceName,
  };
}

function invalidRow(statementId: string): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "sync.invalidRow", params: { statement: statementId } },
    { details: { reason: "invalid-row", statement: statementId } },
  );
}

class PreconditionFailure {
  constructor(readonly error: SearchError) {}
}

function precondition(error: SearchError): PreconditionFailure {
  return new PreconditionFailure(error);
}

function abortedError(): SearchTimeout {
  return new SearchTimeout(
    { key: "sync.initializeAborted" },
    { details: { reason: "initialize-aborted" } },
  );
}

function waitUnlessAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Creates the synchronization handle; inert until the first operation. */
export function createPostgresSynchronization(
  options: PostgresSynchronizationOptions,
): PostgresSynchronization {
  const parsed = parseOptions(options);
  const { schema, namespace, maxIdsPerCall, expectedStoreId, instanceName } = parsed;
  const statements = renderSynchronizationStatements(schema);
  const inputSchema = markChangedInputSchema(maxIdsPerCall);

  let pinnedStoreId: string | undefined = expectedStoreId;
  let verified = false;
  let inFlight: Promise<{ storeId: string }> | undefined;

  const resolvePrimary = (): Knex => {
    let db: Knex;
    try {
      db = parsed.getPrimaryDatabase();
    } catch (error) {
      if (error instanceof SearchError) throw error;
      throw new SearchConfigurationError(
        { key: "sync.primaryResolverFailed" },
        { details: { reason: "primary-resolver-failed" } },
      );
    }
    // A shared transaction (Sonamu test mode) runs only the store ID read; a finished transaction is refused.
    if (!isSqlExecutor(db) || (looksLikeTransaction(db) && !isLiveTransaction(db))) {
      throw new SearchConfigurationError(
        { key: "sync.invalidPrimary" },
        { details: { reason: "invalid-primary" } },
      );
    }
    return db;
  };

  const readStoreId = async (): Promise<{ storeId: string }> => {
    const db = resolvePrimary();
    const result = await executeSql(db, statement(statements.readStoreId), "capture");
    const row = storeRowSchema.safeParse(result.rows[0]);
    if (result.rows.length !== 1 || !row.success) throw invalidRow("readStoreId");
    const storeId = row.data.store_id;
    if (expectedStoreId !== undefined && expectedStoreId !== storeId) {
      throw new SearchStoreMismatch(
        {
          key: "sync.initializeStoreMismatch",
          params: { expected: expectedStoreId, actual: storeId },
        },
        {
          details: {
            reason: "expected-store-mismatch",
            expected: expectedStoreId,
            actual: storeId,
          },
        },
      );
    }
    pinnedStoreId = storeId;
    verified = true;
    return { storeId };
  };

  const initialize = async (initializeOptions: { signal?: AbortSignal } = {}) => {
    const { signal } = initializeOptions;
    if (signal?.aborted === true) throw abortedError();
    if (verified && pinnedStoreId !== undefined) return { storeId: pinnedStoreId };
    if (inFlight === undefined) {
      const attempt = readStoreId();
      inFlight = attempt;
      attempt.then(
        () => {},
        () => {
          if (inFlight === attempt) inFlight = undefined;
        },
      );
    }
    return signal === undefined ? inFlight : waitUnlessAborted(inFlight, signal);
  };

  // The readable value is not cached: each combined check re-reads it, so a pool reconnecting to another server is
  // still caught.
  let systemIdentifierUnreadable = false;

  const checkBinding = async (): Promise<StoreBinding> => {
    const db = resolvePrimary();
    const configured = instanceName ?? null;
    if (!systemIdentifierUnreadable) {
      const combined = await readStoreBindingCombined(db, schema, configured, "worker");
      if (combined !== false) return combined;
      // 42501 also comes from a missing privilege on the store table; only a successful fallback proves the function alone
      // is blocked.
      const fallback = await readStoreBinding(db, schema, null, configured, "worker");
      systemIdentifierUnreadable = true;
      return fallback;
    }
    return readStoreBinding(db, schema, null, configured, "worker");
  };

  const failTransaction = async (trx: Knex.Transaction): Promise<void> => {
    try {
      await executeSql(trx, statement(statements.abortTransaction, [0]), "capture");
    } catch {
      // 22012 is expected; any other error has left the transaction unusable as well.
    }
  };

  const validateInput = (logicalKey: string, ids: readonly DocumentId[]): string[] => {
    const input = inputSchema.safeParse({ logicalKey, ids });
    if (!input.success) {
      const issue = input.error.issues[0];
      const field = String(issue?.path[0] ?? "ids");
      if (field === "ids" && issue?.code === "too_big") {
        const count = Array.isArray(ids) ? ids.length : 0;
        throw precondition(
          new SearchConfigurationError(
            { key: "sync.tooManyIds", params: { count, max: maxIdsPerCall } },
            { details: { reason: "too-many-ids", count, max: maxIdsPerCall } },
          ),
        );
      }
      const message = {
        key: "sync.invalidMarkInput",
        params: { field: field === "logicalKey" ? "logicalKey" : "ids" },
      } as const;
      const details = {
        reason: "invalid-mark-input",
        issue: issue?.code ?? "unknown",
        path: describeIssuePath(issue),
      };
      throw precondition(
        field === "logicalKey"
          ? new SearchConfigurationError(message, { details })
          : new SearchInvalidDocumentId(message, { details }),
      );
    }
    if (!isLogicalKey(input.data.logicalKey)) {
      throw precondition(
        new SearchConfigurationError(
          { key: "names.invalidLogicalKey", params: { name: input.data.logicalKey.slice(0, 80) } },
          { details: { reason: "invalid-logical-key" } },
        ),
      );
    }
    try {
      input.data.ids.forEach((id) => assertDocumentId(id));
    } catch (error) {
      if (error instanceof SearchError) throw precondition(error);
      throw error;
    }
    return sortedUniqueIds(input.data.ids);
  };

  const mark = async (
    trx: Knex.Transaction,
    logicalKey: string,
    ids: readonly DocumentId[],
  ): Promise<MarkChangedResult> => {
    const storeId = pinnedStoreId;
    if (storeId === undefined) {
      throw precondition(
        new SearchConfigurationError(
          { key: "sync.storeIdentityUninitialized" },
          { retryable: true, details: { reason: "store-identity-uninitialized" } },
        ),
      );
    }
    const sorted = validateInput(logicalKey, ids);

    const barrierResult = await executeSql(
      trx,
      statement(statements.lockIndexRow, [namespace, logicalKey]),
      "capture",
    );
    if (barrierResult.rows.length === 0) {
      throw precondition(
        new SearchNotConfigured(
          { key: "sync.logicalKeyNotRegistered", params: { namespace, logicalKey } },
          { details: { reason: "logical-key-not-registered", namespace, logicalKey } },
        ),
      );
    }
    const barrier = barrierRowSchema.safeParse(barrierResult.rows[0]);
    if (barrierResult.rows.length !== 1 || !barrier.success)
      throw precondition(invalidRow("lockIndexRow"));
    if (barrier.data.store_id !== storeId) {
      throw precondition(
        new SearchStoreMismatch(
          {
            key: "sync.storeMismatch",
            params: { expected: storeId, actual: barrier.data.store_id },
          },
          {
            details: { reason: "store-mismatch", expected: storeId, actual: barrier.data.store_id },
          },
        ),
      );
    }

    const captureResult = await executeSql(
      trx,
      statement(statements.readCaptureTargets, [namespace, logicalKey]),
      "capture",
    );
    const capture = captureRowSchema.safeParse(captureResult.rows[0]);
    if (captureResult.rows.length !== 1 || !capture.success)
      throw precondition(invalidRow("readCaptureTargets"));
    if (capture.data.capture_mode === "suspended") return "suspended";
    const targetIds = capture.data.target_ids;
    if (targetIds.length === 0) {
      throw precondition(
        new SearchNoWriteTarget(
          { key: "sync.noWriteTarget", params: { namespace, logicalKey } },
          { details: { reason: "no-write-target", namespace, logicalKey } },
        ),
      );
    }
    if (sorted.length === 0) return "recorded";

    const ledgerResult = await executeSql(
      trx,
      statement(statements.incrementRevisions, [namespace, logicalKey, sorted]),
      "capture",
    );
    const documentIds: string[] = [];
    const revisions: number[] = [];
    for (const raw of ledgerResult.rows) {
      const row = ledgerRowSchema.safeParse(raw);
      if (!row.success) {
        const unsafe = row.error.issues.some((issue) => issue.path[0] === "revision");
        throw precondition(
          unsafe
            ? new SearchRevisionOverflow(
                { key: "revision.overflow" },
                { details: { reason: "revision-overflow" } },
              )
            : invalidRow("incrementRevisions"),
        );
      }
      documentIds.push(row.data.document_id);
      revisions.push(row.data.revision);
    }
    if (documentIds.length !== sorted.length) throw precondition(invalidRow("incrementRevisions"));

    await executeSql(
      trx,
      statement(statements.enqueueDeliveries, [targetIds, documentIds, revisions]),
      "capture",
    );
    return "recorded";
  };

  const markChanged = async (
    trx: Knex.Transaction,
    logicalKey: string,
    ids: readonly DocumentId[],
  ): Promise<MarkChangedResult> => {
    if (!isLiveTransaction(trx)) {
      const isTransaction = looksLikeTransaction(trx);
      throw new SearchInvalidTransaction(
        { key: isTransaction ? "sync.completedTransaction" : "sync.notTransaction" },
        { details: { reason: isTransaction ? "completed-transaction" : "not-a-transaction" } },
      );
    }
    try {
      return await mark(trx, logicalKey, ids);
    } catch (failure) {
      if (failure instanceof PreconditionFailure) {
        await failTransaction(trx);
        throw failure.error;
      }
      throw failure;
    }
  };

  return Object.freeze({
    namespace,
    schema,
    options: Object.freeze({
      getPrimaryDatabase: parsed.getPrimaryDatabase,
      schema,
      namespace,
      maxIdsPerCall,
    }),
    markChanged,
    initialize,
    storeId: () => pinnedStoreId,
    checkBinding,
    instanceName,
  });
}
