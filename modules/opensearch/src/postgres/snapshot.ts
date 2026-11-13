import { type Knex } from "knex";
import { z } from "zod";

import { SearchConfigurationError, SearchInvalidTransaction } from "../errors";
import { mapPgError } from "./pg-errors";
import { executeSql, sql, statement } from "./sql";

// Knex silently drops isolation and read-only options on a nested transaction, so a transaction handle is refused.
// REPEATABLE READ takes its snapshot at the first statement, which also sets transaction-scoped timeouts and checks
// isolation, read-only and replica state. verify() catches a projection that swallowed an error (25P02) or sent
// COMMIT/ROLLBACK and moved to another snapshot; reads in between cannot be trusted.

export interface PrimarySnapshotTimeouts {
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
  readonly idleInTransactionTimeoutMs: number;
}

export type SnapshotIntegrity =
  | { readonly intact: true }
  | { readonly intact: false; readonly reason: "snapshot_aborted" | "snapshot_replaced" };

export interface PrimarySnapshot {
  readonly trx: Knex.Transaction;
  readonly snapshot: string;
  verify(): Promise<SnapshotIntegrity>;
}

const durationMsSchema = z.number().int().min(1).max(2_147_483_647);
const timeoutsSchema = z.strictObject({
  statementTimeoutMs: durationMsSchema,
  lockTimeoutMs: durationMsSchema,
  idleInTransactionTimeoutMs: durationMsSchema,
});
const functionSchema = z.instanceof(Function);
const primarySchema = z.custom<Knex>(
  (value) =>
    functionSchema.safeParse(value).success &&
    functionSchema.safeParse(Object(value).transaction).success &&
    Object(value).isTransaction !== true,
);

const OPEN_SNAPSHOT = sql`SELECT set_config('statement_timeout', $1, true) AS statement_timeout,
       set_config('lock_timeout', $2, true) AS lock_timeout,
       set_config('idle_in_transaction_session_timeout', $3, true) AS idle_in_transaction_session_timeout,
       current_setting('transaction_isolation') AS iso, current_setting('transaction_read_only') AS ro,
       pg_is_in_recovery() AS replica,
       pg_current_snapshot()::text AS snapshot, transaction_timestamp()::text AS started;`;
const VERIFY_SNAPSHOT = sql`SELECT pg_current_snapshot()::text AS snapshot, transaction_timestamp()::text AS started,
       current_setting('transaction_read_only') AS ro;`;

const snapshotRowSchema = z.object({
  iso: z.string(),
  ro: z.string(),
  replica: z.boolean(),
  snapshot: z.string().min(1),
  started: z.string().min(1),
});
const verifyRowSchema = z.object({
  snapshot: z.string().min(1),
  started: z.string().min(1),
  ro: z.string(),
});

const ISOLATION_LEVELS = new Set([
  "read uncommitted",
  "read committed",
  "repeatable read",
  "serializable",
]);

function invalidRow(statementId: "openSnapshot" | "verifySnapshot"): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "snapshot.invalidRow", params: { statement: statementId } },
    { details: { reason: "invalid-row", statement: statementId } },
  );
}

function assertSnapshotRow(row: z.output<typeof snapshotRowSchema>): void {
  if (row.iso !== "repeatable read") {
    const isolation = ISOLATION_LEVELS.has(row.iso) ? row.iso : "unknown";
    throw new SearchConfigurationError(
      { key: "snapshot.notRepeatableRead", params: { isolation } },
      { details: { reason: "snapshot-not-repeatable-read", isolation } },
    );
  }
  if (row.ro !== "on") {
    throw new SearchConfigurationError(
      { key: "snapshot.notReadOnly" },
      { details: { reason: "snapshot-not-read-only" } },
    );
  }
  if (row.replica) {
    throw new SearchConfigurationError(
      { key: "snapshot.onReplica" },
      { details: { reason: "snapshot-on-replica" } },
    );
  }
}

export function parseSnapshotTimeouts(timeouts: PrimarySnapshotTimeouts): PrimarySnapshotTimeouts {
  const parsed = timeoutsSchema.safeParse(timeouts);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "timeouts").slice(0, 64);
    throw new SearchConfigurationError(
      { key: "snapshot.invalidTimeouts", params: { field } },
      { details: { reason: "invalid-snapshot-timeouts", field } },
    );
  }
  return parsed.data;
}

export async function runInPrimarySnapshot<T>(
  db: Knex,
  timeouts: PrimarySnapshotTimeouts,
  work: (snapshot: PrimarySnapshot) => Promise<T>,
): Promise<T> {
  if (!primarySchema.safeParse(db).success) {
    const isTransaction = Object(db).isTransaction === true;
    throw new SearchConfigurationError(
      { key: isTransaction ? "snapshot.primaryIsTransaction" : "snapshot.invalidPrimary" },
      { details: { reason: isTransaction ? "primary-is-transaction" : "invalid-primary" } },
    );
  }
  const limits = parseSnapshotTimeouts(timeouts);
  let workFailure: { error: unknown } | undefined;
  try {
    return await db.transaction(
      async (trx) => {
        const { rows } = await executeSql(
          trx,
          statement(OPEN_SNAPSHOT, [
            `${limits.statementTimeoutMs}ms`,
            `${limits.lockTimeoutMs}ms`,
            `${limits.idleInTransactionTimeoutMs}ms`,
          ]),
          "worker",
        );
        const row = snapshotRowSchema.safeParse(rows[0]);
        if (!row.success || rows.length !== 1) throw invalidRow("openSnapshot");
        assertSnapshotRow(row.data);
        const opened = row.data;
        const snapshot: PrimarySnapshot = Object.freeze({
          trx,
          snapshot: opened.snapshot,
          async verify(): Promise<SnapshotIntegrity> {
            let verified: readonly unknown[];
            try {
              verified = (await executeSql(trx, statement(VERIFY_SNAPSHOT), "worker")).rows;
            } catch (error) {
              if (
                error instanceof SearchInvalidTransaction &&
                error.details?.sqlstate === "25P02"
              ) {
                return { intact: false, reason: "snapshot_aborted" };
              }
              throw error;
            }
            const current = verifyRowSchema.safeParse(verified[0]);
            if (!current.success) throw invalidRow("verifySnapshot");
            const same =
              current.data.snapshot === opened.snapshot &&
              current.data.started === opened.started &&
              current.data.ro === "on";
            return same ? { intact: true } : { intact: false, reason: "snapshot_replaced" };
          },
        });
        try {
          return await work(snapshot);
        } catch (error) {
          workFailure = { error };
          throw error;
        }
      },
      { isolationLevel: "repeatable read", readOnly: true },
    );
  } catch (error) {
    if (workFailure !== undefined && workFailure.error === error) throw error;
    throw mapPgError(error, "worker");
  }
}
