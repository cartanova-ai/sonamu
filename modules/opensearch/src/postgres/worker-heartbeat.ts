import { z } from "zod";

import { type JsonObject, jsonObjectSchema, sha256HexSchema } from "../definition/canonical-json";
import { isLogicalKey, isNamespace } from "../definition/names";
import { SearchConfigurationError } from "../errors";
import { uuidSchema } from "./rows";
import {
  executeSql,
  qualified,
  schemaIdentifier,
  sql,
  type SqlExecutor,
  type SqlFragment,
  statement,
} from "./sql";

// One row per worker. stop() deletes it, a drainOnce-only caller deletes it when the drain ends, and live workers
// prune rows of dead processes after the expiry. Nothing reads this table to block or decide anything.

/** Expiry of a capability heartbeat row (24 hours); older rows are hidden from inspect and pruned. */
export const WORKER_HEARTBEAT_EXPIRY_MS = 86_400_000;

export const WORKER_STATES = ["idle", "running", "degraded", "stopping", "stopped"] as const;
export type WorkerHeartbeatState = (typeof WORKER_STATES)[number];

export interface WorkerHeartbeatInput {
  readonly workerId: string;
  readonly namespace: string;
  readonly capabilities: readonly string[];
  readonly state: WorkerHeartbeatState;
  readonly startedAt: Date;
  readonly lastReport: JsonObject | null;
}

export interface WorkerHeartbeatStore {
  readonly schema: string;
  beat(db: SqlExecutor, input: WorkerHeartbeatInput): Promise<void>;
  prune(db: SqlExecutor, workerId: string): Promise<number>;
  remove(db: SqlExecutor, workerId: string): Promise<boolean>;
}

type Statements = {
  readonly upsertHeartbeat: SqlFragment;
  readonly deleteHeartbeat: SqlFragment;
  readonly pruneExpiredHeartbeats: SqlFragment;
};

export function renderWorkerHeartbeatStatements(schema: SqlFragment): Statements {
  const heartbeats = qualified(schema, "worker_heartbeats");
  return {
    upsertHeartbeat: sql`INSERT INTO ${heartbeats} AS w (worker_id, namespace, capabilities, state, started_at, heartbeat_at, last_report)
VALUES ($1, $2, $3::text[], $4, $5, clock_timestamp(), $6::jsonb)
ON CONFLICT (worker_id) DO UPDATE
SET capabilities = EXCLUDED.capabilities, state = EXCLUDED.state,
    heartbeat_at = clock_timestamp(), last_report = EXCLUDED.last_report;`,
    deleteHeartbeat: sql`DELETE FROM ${heartbeats} WHERE worker_id = $1 RETURNING worker_id;`,
    pruneExpiredHeartbeats: sql`DELETE FROM ${heartbeats}
WHERE worker_id <> $1 AND heartbeat_at < clock_timestamp() - ($2::bigint * interval '1 millisecond')
RETURNING worker_id;`,
  };
}

const MAX_CAPABILITIES = 10_000;
// The last_report CHECK is 4096 bytes of jsonb::text, up to 1.5x JSON.stringify, hence 2700.
const MAX_REPORT_JSON_BYTES = 2700;

const capabilitySchema = z.string().refine((value) => {
  const at = value.lastIndexOf("@");
  return (
    at > 0 &&
    isLogicalKey(value.slice(0, at)) &&
    sha256HexSchema.safeParse(value.slice(at + 1)).success
  );
});

const heartbeatInputSchema = z.object({
  workerId: uuidSchema,
  namespace: z.string().refine(isNamespace),
  capabilities: z.array(capabilitySchema).max(MAX_CAPABILITIES).readonly(),
  state: z.enum(WORKER_STATES),
  startedAt: z.date().refine((value) => Number.isFinite(value.getTime())),
  lastReport: jsonObjectSchema
    .refine((value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_REPORT_JSON_BYTES)
    .nullable(),
});

function invalidInput(issue: z.core.$ZodIssue | undefined): SearchConfigurationError {
  const field = (issue?.path ?? []).map(String).join(".").slice(0, 120) || "input";
  return new SearchConfigurationError(
    { key: "heartbeat.invalidInput", params: { field } },
    { details: { reason: "invalid-heartbeat-input", field, issue: issue?.code ?? "unknown" } },
  );
}

export function createWorkerHeartbeatStore(options: { schema: string }): WorkerHeartbeatStore {
  const statements = renderWorkerHeartbeatStatements(schemaIdentifier(options.schema));
  return Object.freeze({
    schema: options.schema,

    async beat(db, input) {
      const parsed = heartbeatInputSchema.safeParse(input);
      if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
      const { workerId, namespace, capabilities, state, startedAt, lastReport } = parsed.data;
      await executeSql(
        db,
        statement(statements.upsertHeartbeat, [
          workerId,
          namespace,
          [...new Set(capabilities)].toSorted(),
          state,
          startedAt.toISOString(),
          lastReport === null ? null : JSON.stringify(lastReport),
        ]),
        "worker",
      );
    },

    async remove(db, workerId) {
      const parsed = uuidSchema.safeParse(workerId);
      if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
      const result = await executeSql(
        db,
        statement(statements.deleteHeartbeat, [parsed.data]),
        "worker",
      );
      return result.rowCount > 0;
    },

    async prune(db, workerId) {
      const parsed = uuidSchema.safeParse(workerId);
      if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
      const result = await executeSql(
        db,
        statement(statements.pruneExpiredHeartbeats, [parsed.data, WORKER_HEARTBEAT_EXPIRY_MS]),
        "worker",
      );
      return result.rowCount;
    },
  } satisfies WorkerHeartbeatStore);
}
