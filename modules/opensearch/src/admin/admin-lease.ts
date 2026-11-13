import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { z } from "zod";

import { assertNamespace, assertSchemaName } from "../definition/names";
import {
  SearchAdminBusy,
  SearchAdminLeaseLost,
  SearchConfigurationError,
  SearchError,
  type SearchErrorDetail,
  SearchNotConfigured,
  SearchSchemaVersionMismatch,
} from "../errors";
import { mapPgError } from "../postgres/pg-errors";
import { isSqlExecutor, looksLikeTransaction } from "../postgres/rows";
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
  timeoutStatement,
} from "../postgres/sql";
import {
  adminOperationRequestSchema,
  adminTimeoutsSchema,
  barrierRowSchema,
  controlRowSchema,
  leaseTokenRowSchema,
  releasedLeaseRowSchema,
} from "./rows";

// Lock order, without exception: barrier (indexes) → admin_controls → read_heads → targets/builds → deliveries →
// delivery_runtime. acquireLease and renewLease touch one admin_controls row and never the barrier, so they never block
// markers. A fenced transaction takes the barrier, then lockHeldLease, then runs its body: a lease takeover waits while
// lockHeldLease holds the control row, and if the takeover committed first nothing is written. This fences database
// writes only, never remote commands.

export type AdminTimeouts = z.infer<typeof adminTimeoutsSchema>;

export type AdminOperationRequest = z.infer<typeof adminOperationRequestSchema>;

export type BarrierRow = z.infer<typeof barrierRowSchema>;
export type BarrierMode = "shared" | "exclusive";

export interface AuditEntry {
  outcome: "started" | "succeeded" | "failed";
  targetId?: string | null;
  buildId?: string | null;
  detail?: Readonly<Record<string, SearchErrorDetail | undefined>>;
}

type FailureDetail = {
  code: string;
  retryable?: boolean;
  reason?: string;
  sqlstate?: string;
};

interface LeaseStatements {
  readonly lockBarrierShared: SqlFragment;
  readonly lockBarrierExclusive: SqlFragment;
  readonly readLeaseHolder: SqlFragment;
  readonly acquireLease: SqlFragment;
  readonly renewLease: SqlFragment;
  readonly lockHeldLease: SqlFragment;
  readonly releaseLease: SqlFragment;
  readonly insertAuditRecord: SqlFragment;
}

function renderLeaseStatements(schema: string): LeaseStatements {
  const s = schemaIdentifier(schema);
  const indexes = qualified(s, "indexes");
  const controls = qualified(s, "admin_controls");
  const operations = qualified(s, "admin_operations");
  return {
    lockBarrierShared: sql`SELECT generation, capture_mode, capture_epoch FROM ${indexes} WHERE namespace = $1 AND definition = $2 FOR SHARE;`,
    lockBarrierExclusive: sql`SELECT generation, capture_mode, capture_epoch FROM ${indexes} WHERE namespace = $1 AND definition = $2 FOR UPDATE;`,
    readLeaseHolder: sql`SELECT operation_kind FROM ${controls} WHERE namespace = $1 AND definition = $2;`,
    acquireLease: sql`UPDATE ${controls} c
SET operation_id = $3, operation_kind = $4, actor = $5, lease_token = $6::uuid,
    lease_expires_at = clock_timestamp() + ($7::bigint * interval '1 millisecond'),
    acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp()
WHERE c.namespace = $1 AND c.definition = $2
  AND (c.lease_token IS NULL OR c.lease_expires_at <= clock_timestamp() OR c.operation_id = $3)
RETURNING c.lease_token;`,
    renewLease: sql`UPDATE ${controls}
SET lease_expires_at = clock_timestamp() + ($4::bigint * interval '1 millisecond'), heartbeat_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND lease_token = $3::uuid
RETURNING lease_token;`,
    lockHeldLease: sql`SELECT lease_token FROM ${controls}
WHERE namespace = $1 AND definition = $2 AND lease_token = $3::uuid AND lease_expires_at > clock_timestamp()
FOR UPDATE;`,
    releaseLease: sql`UPDATE ${controls}
SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND lease_token = $3::uuid
RETURNING operation_id;`,
    insertAuditRecord: sql`INSERT INTO ${operations} (operation_id, namespace, definition, kind, actor, reason, target_id, build_id, outcome, detail)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb);`,
  };
}

export function invalidAdminRow(statementId: string): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "admin.invalidRow", params: { statement: statementId } },
    { details: { reason: "invalid-row", statement: statementId } },
  );
}

export function singleRow<Schema extends z.ZodType>(
  result: SqlResult,
  schema: Schema,
  statementId: string,
): z.infer<Schema> | undefined {
  if (result.rows.length === 0) return undefined;
  const parsed = schema.safeParse(result.rows[0]);
  if (result.rows.length !== 1 || !parsed.success) throw invalidAdminRow(statementId);
  return parsed.data;
}

export interface AdminStore {
  readonly schema: string;
  readonly namespace: string;
  readonly timeouts: AdminTimeouts;
  execute(db: SqlExecutor, compiled: SqlStatement): Promise<SqlResult>;
  transaction<T>(
    body: (trx: Knex.Transaction) => Promise<T>,
    options?: { readOnly?: boolean },
  ): Promise<T>;
  primary(): Knex;
  readonly statements: LeaseStatements;
}

export interface AdminStoreOptions {
  getPrimaryDatabase: () => Knex;
  schema: string;
  namespace: string;
  timeouts: AdminTimeouts;
}

export function createAdminStore(options: AdminStoreOptions): AdminStore {
  const schema = assertSchemaName(options.schema);
  const namespace = assertNamespace(options.namespace);
  const timeouts = adminTimeoutsSchema.safeParse(options.timeouts);
  if (!timeouts.success) {
    throw new SearchConfigurationError(
      { key: "admin.invalidOptions", params: { path: "timeouts" } },
      { details: { reason: "invalid-admin-option", path: "timeouts" } },
    );
  }
  const statements = renderLeaseStatements(schema);
  const getPrimaryDatabase = options.getPrimaryDatabase;

  // Admin transactions issue BEGIN themselves, so a transaction is refused.
  const resolvePrimary = (): Knex => {
    let db: Knex;
    try {
      db = getPrimaryDatabase();
    } catch (error) {
      if (error instanceof SearchError) throw error;
      throw new SearchConfigurationError(
        { key: "admin.primaryResolverFailed" },
        { details: { reason: "primary-resolver-failed" } },
      );
    }
    if (!isSqlExecutor(db)) {
      throw new SearchConfigurationError(
        { key: "admin.invalidPrimary" },
        { details: { reason: "invalid-primary" } },
      );
    }
    if (looksLikeTransaction(db)) {
      throw new SearchConfigurationError(
        { key: "admin.primaryIsTransaction" },
        { details: { reason: "resolver-returned-transaction" } },
      );
    }
    return db;
  };

  const transaction = async <T>(
    body: (trx: Knex.Transaction) => Promise<T>,
    transactionOptions: { readOnly?: boolean } = {},
  ): Promise<T> => {
    const db = resolvePrimary();
    try {
      return await db.transaction(
        async (trx) => {
          await executeAdmin(
            trx,
            timeoutStatement({
              lockTimeoutMs: timeouts.data.lockTimeoutMs,
              statementTimeoutMs: timeouts.data.statementTimeoutMs,
              idleInTransactionTimeoutMs: timeouts.data.idleInTransactionTimeoutMs,
            }),
          );
          return body(trx);
        },
        { isolationLevel: "read committed", readOnly: transactionOptions.readOnly === true },
      );
    } catch (error) {
      throw mapPgError(error, "admin");
    }
  };

  return Object.freeze({
    schema,
    namespace,
    timeouts: Object.freeze({ ...timeouts.data }),
    execute: executeAdmin,
    transaction,
    statements,
    primary: resolvePrimary,
  });
}

function executeAdmin(db: SqlExecutor, compiled: SqlStatement): Promise<SqlResult> {
  return executeSql(db, compiled, "admin");
}

function leaseLost(logicalKey: string, reason: string): SearchAdminLeaseLost {
  return new SearchAdminLeaseLost(
    { key: "admin.leaseLost", params: { logicalKey } },
    { details: { reason, logicalKey } },
  );
}

const failureDetailsSchema = z.looseObject({
  reason: z.string().optional().catch(undefined),
  sqlstate: z.string().optional().catch(undefined),
});

function failureDetail<Thrown>(error: Thrown): FailureDetail {
  if (!(error instanceof SearchError)) return { code: "UNCLASSIFIED" };
  const detail: FailureDetail = { code: error.code, retryable: error.retryable };
  const parsed = failureDetailsSchema.safeParse(error.details ?? {});
  if (parsed.success) {
    if (parsed.data.reason !== undefined) detail.reason = parsed.data.reason.slice(0, 120);
    if (parsed.data.sqlstate !== undefined) detail.sqlstate = parsed.data.sqlstate.slice(0, 120);
  }
  return detail;
}

// The token is fixed at construction, so release is safe even when it is unknown whether acquireLease committed.
export class AdminOperation {
  readonly token: string = randomUUID();
  #attempted = false;
  #renewedAt = Number.NEGATIVE_INFINITY;

  constructor(
    readonly store: AdminStore,
    readonly request: AdminOperationRequest,
  ) {}

  get attempted(): boolean {
    return this.#attempted;
  }

  private keyParams(): [string, string] {
    return [this.store.namespace, this.request.logicalKey];
  }

  private acquireLeaseStatement(): SqlStatement {
    const { operationId, kind, actor } = this.request;
    return statement(this.store.statements.acquireLease, [
      ...this.keyParams(),
      operationId,
      kind,
      actor,
      this.token,
      this.store.timeouts.adminLeaseMs,
    ]);
  }

  private busy(holderKind: string | null): SearchAdminBusy {
    const { logicalKey } = this.request;
    return new SearchAdminBusy(
      { key: "admin.leaseBusy", params: { logicalKey } },
      { details: { reason: "lease-held", logicalKey, holderKind } },
    );
  }

  async acquire(): Promise<void> {
    const db = this.store.primary();
    this.#attempted = true;
    const sentAt = performance.now();
    const result = await this.store.execute(db, this.acquireLeaseStatement());
    if (singleRow(result, leaseTokenRowSchema, "acquireLease") !== undefined) {
      this.#renewedAt = sentAt;
      return;
    }
    const control = await this.store.execute(
      db,
      statement(this.store.statements.readLeaseHolder, this.keyParams()),
    );
    const row = singleRow(control, controlRowSchema, "readLeaseHolder");
    if (row === undefined) {
      const { logicalKey } = this.request;
      const namespace = this.store.namespace;
      throw new SearchNotConfigured(
        { key: "admin.notRegistered", params: { namespace, logicalKey } },
        { details: { reason: "logical-key-not-registered", namespace, logicalKey } },
      );
    }
    throw this.busy(row.operation_kind);
  }

  async acquireWithin(trx: Knex.Transaction): Promise<void> {
    this.#attempted = true;
    const sentAt = performance.now();
    const result = await this.store.execute(trx, this.acquireLeaseStatement());
    if (singleRow(result, leaseTokenRowSchema, "acquireLease") === undefined) throw this.busy(null);
    this.#renewedAt = sentAt;
  }

  async heartbeat(): Promise<void> {
    if (!this.#attempted) throw leaseLost(this.request.logicalKey, "lease-not-held");
    const sentAt = performance.now();
    const result = await this.store.execute(
      this.store.primary(),
      statement(this.store.statements.renewLease, [
        ...this.keyParams(),
        this.token,
        this.store.timeouts.adminLeaseMs,
      ]),
    );
    if (singleRow(result, leaseTokenRowSchema, "renewLease") === undefined) {
      throw leaseLost(this.request.logicalKey, "lease-replaced");
    }
    this.#renewedAt = sentAt;
  }

  // Renews only after a third of adminLeaseMs, so a long loop never loses the lease and renewals scale with time.
  async renewIfDue(): Promise<void> {
    if (performance.now() - this.#renewedAt >= this.store.timeouts.adminLeaseMs / 3) {
      await this.heartbeat();
    }
  }

  async fenced<T>(
    barrier: BarrierMode,
    body: (trx: Knex.Transaction, barrierRow: BarrierRow) => Promise<T>,
    audit?: (result: T) => AuditEntry,
  ): Promise<T> {
    const { logicalKey } = this.request;
    if (!this.#attempted) throw leaseLost(logicalKey, "lease-not-held");
    return this.store.transaction(async (trx) => {
      const barrierRow = await this.lockBarrier(trx, barrier);
      const fence = await this.store.execute(
        trx,
        statement(this.store.statements.lockHeldLease, [...this.keyParams(), this.token]),
      );
      if (singleRow(fence, leaseTokenRowSchema, "lockHeldLease") === undefined) {
        throw leaseLost(logicalKey, "lease-replaced-or-expired");
      }
      const result = await body(trx, barrierRow);
      if (audit !== undefined) {
        await this.audit(trx, audit(result));
      }
      return result;
    });
  }

  // Must be the first row lock of the transaction (lock order).
  async lockBarrier(trx: Knex.Transaction, barrier: BarrierMode): Promise<BarrierRow> {
    const fragment =
      barrier === "exclusive"
        ? this.store.statements.lockBarrierExclusive
        : this.store.statements.lockBarrierShared;
    const result = await this.store.execute(trx, statement(fragment, this.keyParams()));
    const row = singleRow(
      result,
      barrierRowSchema,
      barrier === "exclusive" ? "lockBarrierExclusive" : "lockBarrierShared",
    );
    if (row === undefined) {
      const { logicalKey } = this.request;
      const namespace = this.store.namespace;
      throw new SearchNotConfigured(
        { key: "admin.notRegistered", params: { namespace, logicalKey } },
        { details: { reason: "logical-key-not-registered", namespace, logicalKey } },
      );
    }
    return row;
  }

  async audit(executor: SqlExecutor, entry: AuditEntry): Promise<void> {
    const { operationId, kind, actor, reason } = this.request;
    await this.store.execute(
      executor,
      statement(this.store.statements.insertAuditRecord, [
        operationId,
        ...this.keyParams(),
        kind,
        actor,
        reason,
        entry.targetId ?? null,
        entry.buildId ?? null,
        entry.outcome,
        JSON.stringify(entry.detail ?? {}),
      ]),
    );
  }

  // Standalone statement, so the record survives the rolled-back transaction.
  async recordFailure<Thrown>(error: Thrown): Promise<void> {
    await this.audit(this.store.primary(), { outcome: "failed", detail: failureDetail(error) });
  }

  async release(): Promise<boolean> {
    const result = await this.store.execute(
      this.store.primary(),
      statement(this.store.statements.releaseLease, [...this.keyParams(), this.token]),
    );
    return singleRow(result, releasedLeaseRowSchema, "releaseLease") !== undefined;
  }
}

export function parseOperationRequest(request: AdminOperationRequest): AdminOperationRequest {
  const parsed = adminOperationRequestSchema.safeParse(request);
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "request");
    throw new SearchConfigurationError(
      { key: "admin.invalidOperation", params: { path } },
      { details: { reason: "invalid-admin-operation", path } },
    );
  }
  return parsed.data;
}

export async function runAdminOperation<T>(
  store: AdminStore,
  request: AdminOperationRequest,
  body: (operation: AdminOperation) => Promise<T>,
): Promise<T> {
  const operation = new AdminOperation(store, parseOperationRequest(request));
  try {
    return await body(operation);
  } catch (error) {
    // Release and failure-audit errors are swallowed so they cannot mask the original outcome; an unreleased lease
    // expires after adminLeaseMs.
    await operation.recordFailure(error).catch(() => {});
    throw error;
  } finally {
    if (operation.attempted) await operation.release().catch(() => false);
  }
}
