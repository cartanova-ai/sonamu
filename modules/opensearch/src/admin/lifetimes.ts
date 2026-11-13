import { type Knex } from "knex";
import { z } from "zod";

import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchNotConfigured,
} from "../errors";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { requireStoreBinding } from "../postgres/store-binding";
import {
  invalidAdminRow,
  parseOperationRequest,
  runAdminOperation,
  singleRow,
} from "./admin-lease";
import { type RemoteCreateContext } from "./remote-create";
import {
  type adminContextSchema,
  adminLifetimesSchema,
  int8Column,
  logicalKeyArgumentSchema,
} from "./rows";

// Raising any value, or lowering maxPitKeepAliveMs, is safe at once. Lowering search, cursor or margin is refused: a
// cursor issued under the longer bound may still be live, and retirement computes its grace from the current values,
// so it could delete the target under that cursor. Schema version 2 keeps neither the old values nor the change time.

type AdminAudit = z.input<typeof adminContextSchema>;
export type ReadLifetimes = z.infer<typeof adminLifetimesSchema>;

export interface ReadLifetimeChange {
  logicalKey: string;
  previous: ReadLifetimes;
  current: ReadLifetimes;
  /** false when all values were equal; nothing is written then, but the audit record remains. */
  changed: boolean;
}

const GRACE_FIELDS = [
  "maxSearchLifetimeMs",
  "maxCursorLifetimeMs",
  "retirementSafetyMarginMs",
] as const satisfies readonly (keyof ReadLifetimes)[];

interface LifetimeStatements {
  readonly lockReadLifetimes: SqlFragment;
  readonly updateReadLifetimes: SqlFragment;
}

function renderLifetimeStatements(schema: string): LifetimeStatements {
  const readHeads = qualified(schemaIdentifier(schema), "read_heads");
  return {
    lockReadLifetimes: sql`SELECT max_search_lifetime_ms, max_cursor_lifetime_ms, max_pit_keep_alive_ms, retirement_safety_margin_ms
FROM ${readHeads} WHERE namespace = $1 AND definition = $2 FOR UPDATE;`,
    updateReadLifetimes: sql`UPDATE ${readHeads}
SET max_search_lifetime_ms = $3, max_cursor_lifetime_ms = $4, max_pit_keep_alive_ms = $5,
    retirement_safety_margin_ms = $6, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2;`,
  };
}

const statementCache = createSchemaStatementCache(renderLifetimeStatements);

export function lifetimeStatementsFor(schema: string): LifetimeStatements {
  return statementCache.get(schema);
}

const recordedLifetimesRowSchema = z.object({
  max_search_lifetime_ms: int8Column,
  max_cursor_lifetime_ms: int8Column,
  max_pit_keep_alive_ms: int8Column,
  retirement_safety_margin_ms: int8Column,
});

function refused(
  logicalKey: string,
  field: string,
  recordedMs: number,
  requestedMs: number,
): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.lifetimeChangeRefused", params: { logicalKey, field, recordedMs, requestedMs } },
    {
      details: {
        reason: "read-lifetime-decrease-unsupported",
        logicalKey,
        field,
        recordedMs,
        requestedMs,
      },
    },
  );
}

export async function changeReadLifetimes(
  context: RemoteCreateContext,
  logicalKey: string,
  lifetimes: ReadLifetimes,
  audit: AdminAudit,
): Promise<ReadLifetimeChange> {
  const key = logicalKeyArgumentSchema.safeParse(logicalKey);
  if (!key.success) {
    throw new SearchConfigurationError(
      { key: "names.invalidLogicalKey", params: { name: String(logicalKey).slice(0, 80) } },
      { details: { reason: "invalid-logical-key" } },
    );
  }
  const requested = adminLifetimesSchema.safeParse(lifetimes);
  if (!requested.success) {
    const path = `lifetimes.${String(requested.error.issues[0]?.path[0] ?? "")}`;
    throw new SearchConfigurationError(
      { key: "admin.invalidOptions", params: { path } },
      { details: { reason: "invalid-admin-option", path } },
    );
  }
  const { store } = context;
  await requireStoreBinding(context.binding);
  const request = parseOperationRequest({
    logicalKey: key.data,
    kind: "change-lifetimes",
    ...audit,
  });
  const q = lifetimeStatementsFor(store.schema);
  const params = [store.namespace, key.data] as const;
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    return operation.fenced(
      "shared",
      async (trx: Knex.Transaction): Promise<ReadLifetimeChange> => {
        const row = singleRow(
          await store.execute(trx, statement(q.lockReadLifetimes, params)),
          recordedLifetimesRowSchema,
          "lockReadLifetimes",
        );
        if (row === undefined) {
          const namespace = store.namespace;
          throw new SearchNotConfigured(
            { key: "admin.notRegistered", params: { namespace, logicalKey: key.data } },
            { details: { reason: "logical-key-not-registered", namespace, logicalKey: key.data } },
          );
        }
        const previous: ReadLifetimes = {
          maxSearchLifetimeMs: row.max_search_lifetime_ms,
          maxCursorLifetimeMs: row.max_cursor_lifetime_ms,
          maxPitKeepAliveMs: row.max_pit_keep_alive_ms,
          retirementSafetyMarginMs: row.retirement_safety_margin_ms,
        };
        const current = requested.data;
        for (const field of GRACE_FIELDS) {
          if (current[field] < previous[field]) {
            throw refused(key.data, field, previous[field], current[field]);
          }
        }
        const changed =
          previous.maxSearchLifetimeMs !== current.maxSearchLifetimeMs ||
          previous.maxCursorLifetimeMs !== current.maxCursorLifetimeMs ||
          previous.maxPitKeepAliveMs !== current.maxPitKeepAliveMs ||
          previous.retirementSafetyMarginMs !== current.retirementSafetyMarginMs;
        if (changed) {
          const result = await store.execute(
            trx,
            statement(q.updateReadLifetimes, [
              ...params,
              current.maxSearchLifetimeMs,
              current.maxCursorLifetimeMs,
              current.maxPitKeepAliveMs,
              current.retirementSafetyMarginMs,
            ]),
          );
          if (result.rowCount !== 1) throw invalidAdminRow("updateReadLifetimes");
        }
        return { logicalKey: key.data, previous, current: { ...current }, changed };
      },
      (result) => ({
        outcome: "succeeded",
        detail: {
          step: "change-lifetimes",
          changed: result.changed,
          previousSearchMs: result.previous.maxSearchLifetimeMs,
          previousCursorMs: result.previous.maxCursorLifetimeMs,
          previousPitMs: result.previous.maxPitKeepAliveMs,
          previousMarginMs: result.previous.retirementSafetyMarginMs,
          searchMs: result.current.maxSearchLifetimeMs,
          cursorMs: result.current.maxCursorLifetimeMs,
          pitMs: result.current.maxPitKeepAliveMs,
          marginMs: result.current.retirementSafetyMarginMs,
        },
      }),
    );
  });
}
