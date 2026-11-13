import { type Knex } from "knex";
import { z } from "zod";

import { timeoutMsSchema } from "../client/request-limits";
import { sha256HexSchema } from "../definition/canonical-json";
import {
  assertNamespace,
  assertSchemaName,
  DEFAULT_SEARCH_SCHEMA,
  isLogicalKey,
  isTargetId,
} from "../definition/names";
import {
  SearchCatalogUnavailable,
  SearchConfigurationError,
  SearchError,
  type SearchErrorDetail,
  SearchSchemaMissing,
} from "../errors";
import {
  type CatalogReadOptions,
  type ReadHeadState,
  type ReadHeadsResult,
  type ReadLifetimeLimits,
  type ReadTarget,
  type ResolvedTarget,
  type SearchCatalogReader,
} from "../query/catalog";
import { isSqlExecutor, looksLikeTransaction } from "./rows";
import {
  executeSql,
  qualified,
  schemaIdentifier,
  sql,
  type SqlExecutor,
  type SqlFragment,
  type SqlResult,
  type SqlStatement,
  statement,
} from "./sql";

// Each lookup is one autocommit statement on the pool getPrimaryDatabase() returns, never in an application
// transaction; nothing is cached and no lock is taken. Knex cancels the statement server-side at the deadline and the
// whole wait, pool acquisition included, races the remaining time; a timeout is SearchCatalogUnavailable, never a
// fallback to a cached pointer.

export interface PostgresCatalogReaderOptions {
  /** Called on every lookup; returning a transaction is refused. */
  getPrimaryDatabase: () => Knex;
  /** Default "sonamu_search". */
  schema?: string;
  namespace: string;
}

export const MAX_CATALOG_KEYS = 256;

const functionSchema = z.instanceof(Function);

const readerOptionsSchema = z.strictObject({
  getPrimaryDatabase: functionSchema,
  schema: z.string().optional(),
  namespace: z.string(),
});

const readOptionsSchema = z.strictObject({
  signal: z.instanceof(AbortSignal).optional(),
  timeoutMs: timeoutMsSchema,
});

const logicalKeysSchema = z.array(z.string().refine(isLogicalKey)).min(1).max(MAX_CATALOG_KEYS);

const targetIdArgumentSchema = z.string().refine(isTargetId);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuidColumn = z.string().regex(UUID_PATTERN);

const int8Column = z
  .union([z.string().regex(/^\d{1,20}$/), z.number().int().min(0)])
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value));

const targetStateColumn = z.enum([
  "creating",
  "active",
  "paused",
  "retiring",
  "retired",
  "failed",
  "detached",
]);

const readHeadRowSchema = z.object({
  definition: z.string().refine(isLogicalKey),
  target_id: uuidColumn.nullable(),
  read_generation: int8Column,
  rebuild_required: z.boolean(),
  max_search_lifetime_ms: int8Column,
  max_cursor_lifetime_ms: int8Column,
  max_pit_keep_alive_ms: int8Column,
  physical_index: z.string().nullable(),
  fingerprint: sha256HexSchema.nullable(),
  hash_version: z.string().min(1).nullable(),
  state: targetStateColumn.nullable(),
  capture_epoch: z.number().int().min(1).nullable(),
  current_capture_epoch: z.number().int().min(1),
  cursor_issue_ms: int8Column,
  database_now_ms: int8Column,
});

const resolvedTargetRowSchema = z.object({
  target_id: uuidColumn,
  definition: z.string().refine(isLogicalKey),
  physical_index: z.string(),
  fingerprint: sha256HexSchema,
  hash_version: z.string().min(1),
  state: targetStateColumn,
  capture_epoch: z.number().int().min(1),
  current_capture_epoch: z.number().int().min(1),
  rebuild_required: z.boolean(),
  max_search_lifetime_ms: int8Column,
  max_cursor_lifetime_ms: int8Column,
  max_pit_keep_alive_ms: int8Column,
  database_now_ms: int8Column,
});

const clockRowSchema = z.object({
  cursor_issue_ms: int8Column,
  database_now_ms: int8Column,
});

interface CatalogStatements {
  readonly readHeads: SqlFragment;
  readonly readPinnedTarget: SqlFragment;
  readonly readClock: SqlFragment;
}

function renderStatements(schema: string): CatalogStatements {
  const s = schemaIdentifier(schema);
  const readHeads = qualified(s, "read_heads");
  const indexes = qualified(s, "indexes");
  const targets = qualified(s, "targets");
  return {
    // transaction_timestamp(), not statement_timestamp(): over the extended protocol the latter is Execute time and can
    // be later than the snapshot taken at Bind.
    readHeads: sql`SELECT h.definition, h.target_id, h.generation AS read_generation, h.rebuild_required,
       h.max_search_lifetime_ms, h.max_cursor_lifetime_ms, h.max_pit_keep_alive_ms,
       t.physical_index, t.fingerprint, t.hash_version, t.state, t.capture_epoch,
       i.capture_epoch AS current_capture_epoch,
       (extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS cursor_issue_ms,
       (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS database_now_ms
FROM ${readHeads} h
JOIN ${indexes} i ON i.namespace = h.namespace AND i.definition = h.definition
LEFT JOIN ${targets} t ON t.target_id = h.target_id
WHERE h.namespace = $1 AND h.definition = ANY($2::text[]);`,
    readPinnedTarget: sql`SELECT t.target_id, t.definition, t.physical_index, t.fingerprint, t.hash_version, t.state, t.capture_epoch,
       i.capture_epoch AS current_capture_epoch, h.rebuild_required,
       h.max_search_lifetime_ms, h.max_cursor_lifetime_ms, h.max_pit_keep_alive_ms,
       (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS database_now_ms
FROM ${targets} t
JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
JOIN ${readHeads} h ON h.namespace = t.namespace AND h.definition = t.definition
WHERE t.target_id = $1 AND t.namespace = $2;`,
    readClock: sql`SELECT (extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS cursor_issue_ms,
       (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS database_now_ms;`,
  };
}

function issuePathOf(issues: readonly z.core.$ZodIssue[]): string {
  return (issues[0]?.path ?? []).map(String).join(".").slice(0, 120) || "options";
}

function invalidArgument(path: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "catalog.invalidArgument", params: { path } },
    { details: { reason: "invalid-catalog-argument", path } },
  );
}

function invalidRow(statementId: string): SearchCatalogUnavailable {
  return new SearchCatalogUnavailable(
    { key: "catalog.invalidRow", params: { statement: statementId } },
    { retryable: false, details: { reason: "invalid-catalog-row", statement: statementId } },
  );
}

function timedOut(timeoutMs: number, extra: Record<string, SearchErrorDetail> = {}) {
  return new SearchCatalogUnavailable(
    { key: "catalog.timeout", params: { timeoutMs } },
    { details: { reason: "catalog-timeout", timeoutMs, ...extra } },
  );
}

function aborted(): SearchCatalogUnavailable {
  return new SearchCatalogUnavailable(
    { key: "catalog.aborted" },
    { details: { reason: "catalog-aborted" } },
  );
}

const errorDetailsSchema = z.looseObject({
  sqlstate: z.string().optional().catch(undefined),
  errorName: z.string().optional().catch(undefined),
  reason: z.string().optional().catch(undefined),
});

function toCatalogError<Thrown>(error: Thrown, timeoutMs: number): SearchError {
  if (error instanceof SearchSchemaMissing) return error;
  if (!(error instanceof SearchError)) {
    return new SearchCatalogUnavailable(
      { key: "catalog.failed" },
      { details: { reason: "catalog-failed" } },
    );
  }
  const { sqlstate, errorName, reason: cause } = errorDetailsSchema.parse(error.details ?? {});
  if (
    errorName === "KnexTimeoutError" ||
    sqlstate === "57014" ||
    sqlstate === "55P03" ||
    error.code === "SEARCH_TIMEOUT"
  ) {
    return timedOut(timeoutMs, { phase: "statement", sqlstate: sqlstate ?? null });
  }
  if (error instanceof SearchCatalogUnavailable && cause !== undefined) {
    return error;
  }
  return new SearchCatalogUnavailable(
    { key: "catalog.failed" },
    {
      retryable: error.retryable,
      details: {
        reason: "catalog-statement-failed",
        code: error.code,
        sqlstate: sqlstate ?? null,
        cause: cause ?? null,
      },
    },
  );
}

function raceDeadline<T>(
  work: Promise<T>,
  remainingMs: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  work.catch(() => {});
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(timedOut(timeoutMs, { phase: "deadline" }));
    }, remainingMs);
    const onAbort = () => {
      cleanup();
      reject(aborted());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function toLifetimes(row: {
  max_search_lifetime_ms: number;
  max_cursor_lifetime_ms: number;
  max_pit_keep_alive_ms: number;
}): ReadLifetimeLimits {
  return {
    maxSearchLifetimeMs: row.max_search_lifetime_ms,
    maxCursorLifetimeMs: row.max_cursor_lifetime_ms,
    maxPitKeepAliveMs: row.max_pit_keep_alive_ms,
  };
}

function headTarget(row: z.infer<typeof readHeadRowSchema>): ReadTarget | null {
  if (row.target_id === null) return null;
  const { physical_index, fingerprint, hash_version, state, capture_epoch } = row;
  if (
    physical_index === null ||
    fingerprint === null ||
    hash_version === null ||
    state === null ||
    capture_epoch === null
  ) {
    throw invalidRow("readHeads");
  }
  return {
    targetId: row.target_id,
    logicalKey: row.definition,
    physicalIndex: physical_index,
    fingerprint,
    hashVersion: hash_version,
    state,
    captureEpoch: capture_epoch,
    currentCaptureEpoch: row.current_capture_epoch,
  };
}

function parseReadOptions(readOptions: CatalogReadOptions) {
  const result = readOptionsSchema.safeParse(readOptions);
  if (!result.success) throw invalidArgument(issuePathOf(result.error.issues));
  return result.data;
}

interface Budget {
  remainingMs: number;
  timeoutMs: number;
}

async function runBounded(
  db: Knex,
  compiled: SqlStatement,
  budget: Budget,
  signal?: AbortSignal,
): Promise<SqlResult> {
  const { remainingMs, timeoutMs } = budget;
  const timed: SqlExecutor = {
    // SAFETY: executeSql only calls the (sql, bindings) overload of Knex.raw; the returned Raw resolves to the same result.
    raw: ((text: string, bindings: readonly Knex.RawBinding[]) =>
      db.raw(text, bindings).timeout(remainingMs, { cancel: true })) as Knex["raw"],
  };
  try {
    return await raceDeadline(
      executeSql(timed, compiled, "catalog"),
      remainingMs,
      timeoutMs,
      signal,
    );
  } catch (error) {
    throw toCatalogError(error, timeoutMs);
  }
}

/** Creates the catalog reader; inert until the first lookup. */
export function createPostgresCatalogReader(
  options: PostgresCatalogReaderOptions,
): SearchCatalogReader {
  const parsed = readerOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const path = issuePathOf(parsed.error.issues);
    throw new SearchConfigurationError(
      { key: "catalog.invalidOptions", params: { path } },
      { details: { reason: "invalid-catalog-option", path } },
    );
  }
  const schema = assertSchemaName(parsed.data.schema ?? DEFAULT_SEARCH_SCHEMA);
  const namespace = assertNamespace(parsed.data.namespace);
  const statements = renderStatements(schema);
  const getPrimaryDatabase = options.getPrimaryDatabase;

  const resolvePrimary = (): Knex => {
    let db: Knex;
    try {
      db = getPrimaryDatabase();
    } catch (error) {
      if (error instanceof SearchError) throw error;
      throw new SearchConfigurationError(
        { key: "catalog.primaryResolverFailed" },
        { details: { reason: "primary-resolver-failed" } },
      );
    }
    if (!isSqlExecutor(db)) {
      throw new SearchConfigurationError(
        { key: "catalog.invalidPrimary" },
        { details: { reason: "invalid-primary" } },
      );
    }
    if (looksLikeTransaction(db)) {
      throw new SearchConfigurationError(
        { key: "catalog.primaryIsTransaction" },
        { details: { reason: "resolver-returned-transaction" } },
      );
    }
    return db;
  };

  const begin = (readOptions: CatalogReadOptions) => {
    const { timeoutMs, signal } = parseReadOptions(readOptions);
    if (signal?.aborted === true) throw aborted();
    const startedAt = performance.now();
    const db = resolvePrimary();
    const remaining = (): Budget => ({
      remainingMs: Math.max(1, Math.floor(timeoutMs - (performance.now() - startedAt))),
      timeoutMs,
    });
    return { db, signal, remaining };
  };

  const readClock = async (
    db: Knex,
    remaining: () => Budget,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof clockRowSchema>> => {
    const result = await runBounded(db, statement(statements.readClock), remaining(), signal);
    const row = clockRowSchema.safeParse(result.rows[0]);
    if (result.rows.length !== 1 || !row.success) throw invalidRow("readClock");
    return row.data;
  };

  return Object.freeze({
    async resolveReadHeads(
      logicalKeys: readonly string[],
      readOptions: CatalogReadOptions,
    ): Promise<ReadHeadsResult> {
      const keys = logicalKeysSchema.safeParse(logicalKeys);
      if (!keys.success) throw invalidArgument("logicalKeys");
      const { db, signal, remaining } = begin(readOptions);
      const result = await runBounded(
        db,
        statement(statements.readHeads, [namespace, [...new Set(keys.data)]]),
        remaining(),
        signal,
      );
      if (result.rows.length === 0) {
        const clock = await readClock(db, remaining, signal);
        return {
          heads: new Map(),
          cursorIssueMs: clock.cursor_issue_ms,
          databaseNowMs: clock.database_now_ms,
        };
      }
      const heads = new Map<string, ReadHeadState>();
      let cursorIssueMs = 0;
      let databaseNowMs = 0;
      for (const raw of result.rows) {
        const row = readHeadRowSchema.safeParse(raw);
        if (!row.success || heads.has(row.data.definition)) throw invalidRow("readHeads");
        // transaction_timestamp() is equal on every row; clock_timestamp() is not, so take the latest.
        cursorIssueMs = row.data.cursor_issue_ms;
        databaseNowMs = Math.max(databaseNowMs, row.data.database_now_ms);
        heads.set(row.data.definition, {
          logicalKey: row.data.definition,
          readGeneration: row.data.read_generation,
          rebuildRequired: row.data.rebuild_required,
          target: headTarget(row.data),
          lifetimes: toLifetimes(row.data),
        });
      }
      return { heads, cursorIssueMs, databaseNowMs };
    },

    async resolveTarget(
      targetId: string,
      readOptions: CatalogReadOptions,
    ): Promise<ResolvedTarget> {
      if (!targetIdArgumentSchema.safeParse(targetId).success) throw invalidArgument("targetId");
      const { db, signal, remaining } = begin(readOptions);
      const result = await runBounded(
        db,
        statement(statements.readPinnedTarget, [targetId, namespace]),
        remaining(),
        signal,
      );
      if (result.rows.length === 0) {
        const clock = await readClock(db, remaining, signal);
        return {
          target: null,
          rebuildRequired: false,
          lifetimes: null,
          databaseNowMs: clock.database_now_ms,
        };
      }
      const row = resolvedTargetRowSchema.safeParse(result.rows[0]);
      if (result.rows.length !== 1 || !row.success) throw invalidRow("readPinnedTarget");
      const data = row.data;
      return {
        target: {
          targetId: data.target_id,
          logicalKey: data.definition,
          physicalIndex: data.physical_index,
          fingerprint: data.fingerprint,
          hashVersion: data.hash_version,
          state: data.state,
          captureEpoch: data.capture_epoch,
          currentCaptureEpoch: data.current_capture_epoch,
        },
        rebuildRequired: data.rebuild_required,
        lifetimes: toLifetimes(data),
        databaseNowMs: data.database_now_ms,
      };
    },
  });
}
