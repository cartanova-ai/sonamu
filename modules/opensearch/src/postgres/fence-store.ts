import { z } from "zod";

import { SearchConfigurationError, SearchSchemaVersionMismatch } from "../errors";
import {
  type FenceLossDetail,
  fenceLossDetailSchema,
  type LocalFence,
  MAX_FENCE_EPOCH,
} from "../worker/fence";
import { type PgErrorContext } from "./pg-errors";
import { safeIntegerColumn, uuidSchema } from "./rows";
import {
  executeSql,
  qualified,
  schemaIdentifier,
  sql,
  type SqlExecutor,
  type SqlFragment,
  type SqlValue,
  statement,
} from "./sql";

// Each statement touches one target_fences row by primary key. Times and renewal-due use the database clock, so clock
// skew between workers never decides who renews. beginAdvance commits before the remote write; completeAdvance is a
// nonce CAS, and no row back means a sibling completed it or the state changed.

export interface FenceStatements {
  readonly readFence: SqlFragment;
  readonly beginAdvance: SqlFragment;
  readonly completeAdvance: SqlFragment;
  readonly recordLoss: SqlFragment;
  readonly takeOver: SqlFragment;
  readonly deleteFence: SqlFragment;
  readonly inspectFences: SqlFragment;
}

export function renderFenceStatements(schema: SqlFragment): FenceStatements {
  const fences = qualified(schema, "target_fences");
  return {
    readFence: sql`SELECT epoch, nonce, pending_epoch, pending_nonce, lost_at IS NOT NULL AS lost, lost_detail
FROM ${fences} WHERE target_id = $1;`,
    beginAdvance: sql`INSERT INTO ${fences} AS f (target_id, epoch, pending_epoch, pending_nonce, pending_at)
VALUES ($1, $3::bigint, $3::bigint + 1, $2::uuid, clock_timestamp())
ON CONFLICT (target_id) DO UPDATE
SET pending_epoch = f.epoch + 1, pending_nonce = EXCLUDED.pending_nonce, pending_at = clock_timestamp()
WHERE f.epoch = $3::bigint AND f.pending_epoch IS NULL AND f.lost_at IS NULL
  AND ($4::bigint IS NULL OR f.renewed_at IS NULL
       OR f.renewed_at <= clock_timestamp() - ($4::bigint * interval '1 millisecond'))
RETURNING f.pending_epoch, f.pending_nonce;`,
    completeAdvance: sql`UPDATE ${fences}
SET epoch = pending_epoch, nonce = pending_nonce, pending_epoch = NULL, pending_nonce = NULL, pending_at = NULL,
    renewed_at = clock_timestamp()
WHERE target_id = $1 AND pending_nonce = $2::uuid AND lost_at IS NULL
RETURNING epoch;`,
    recordLoss: sql`INSERT INTO ${fences} AS f (target_id, epoch, lost_at, lost_detail)
VALUES ($1, 0, clock_timestamp(), $2::jsonb)
ON CONFLICT (target_id) DO UPDATE
SET lost_at = clock_timestamp(), lost_detail = EXCLUDED.lost_detail,
    pending_epoch = NULL, pending_nonce = NULL, pending_at = NULL
WHERE f.lost_at IS NULL AND f.epoch = $3::bigint AND f.pending_nonce IS NOT DISTINCT FROM $4::uuid
RETURNING f.lost_at;`,
    takeOver: sql`INSERT INTO ${fences} AS f (target_id, epoch, pending_epoch, pending_nonce, pending_at)
VALUES ($1, $2::bigint, $2::bigint + 1, $3::uuid, clock_timestamp())
ON CONFLICT (target_id) DO UPDATE
SET epoch = EXCLUDED.epoch, nonce = NULL, pending_epoch = EXCLUDED.pending_epoch, pending_nonce = EXCLUDED.pending_nonce,
    pending_at = clock_timestamp(), lost_at = NULL, lost_detail = NULL
RETURNING f.pending_epoch;`,
    // Runs in the final retirement transaction.
    deleteFence: sql`DELETE FROM ${fences} WHERE target_id = $1;`,
    inspectFences: sql`SELECT target_id, epoch, pending_epoch IS NOT NULL AS pending, renewed_at, lost_at, lost_detail
FROM ${fences} WHERE target_id = ANY($1::uuid[]);`,
  };
}

const epochColumn = safeIntegerColumn.pipe(z.number().int().min(0).max(MAX_FENCE_EPOCH));
const readFenceRowSchema = z.object({
  epoch: epochColumn,
  nonce: uuidSchema.nullable(),
  pending_epoch: epochColumn.nullable(),
  pending_nonce: uuidSchema.nullable(),
  lost: z.boolean(),
  lost_detail: z.unknown(),
});
const beginAdvanceRowSchema = z.object({ pending_epoch: epochColumn, pending_nonce: uuidSchema });
const completeAdvanceRowSchema = z.object({ epoch: epochColumn });
const recordLossRowSchema = z.object({ lost_at: z.date() });
const takeOverRowSchema = z.object({ pending_epoch: epochColumn });
const inspectFencesRowSchema = z.object({
  target_id: uuidSchema,
  epoch: epochColumn,
  pending: z.boolean(),
  renewed_at: z.date().nullable(),
  lost_at: z.date().nullable(),
  lost_detail: z.unknown(),
});

const targetIdInput = uuidSchema;
const nonceInput = uuidSchema;
const epochInput = z.number().int().min(0).max(MAX_FENCE_EPOCH);
const intervalInput = z.number().int().min(1).max(2_147_483_647).nullable();
const lossInput = z.object({
  targetId: targetIdInput,
  detail: fenceLossDetailSchema,
  judgedEpoch: epochInput,
  judgedPendingNonce: nonceInput.nullable(),
});

export interface StoredFence extends LocalFence {
  readonly lostDetail: FenceLossDetail | null;
}

export interface InspectedFenceRow {
  readonly targetId: string;
  readonly epoch: number;
  readonly pending: boolean;
  readonly renewedAt: Date | null;
  readonly lost: boolean;
  readonly lostDetail: FenceLossDetail | null;
}

export interface FenceStore {
  readonly statements: FenceStatements;
  read(db: SqlExecutor, targetId: string): Promise<StoredFence>;
  beginAdvance(
    db: SqlExecutor,
    input: { targetId: string; nonce: string; seenEpoch: number; intervalMs: number | null },
  ): Promise<{ epoch: number; nonce: string } | undefined>;
  completeAdvance(
    db: SqlExecutor,
    input: { targetId: string; nonce: string },
  ): Promise<number | undefined>;
  recordLoss(db: SqlExecutor, input: z.input<typeof lossInput>): Promise<boolean>;
  takeOver(
    db: SqlExecutor,
    input: { targetId: string; remoteEpoch: number; nonce: string },
  ): Promise<number>;
  remove(db: SqlExecutor, targetId: string): Promise<void>;
  inspect(db: SqlExecutor, targetIds: readonly string[]): Promise<InspectedFenceRow[]>;
}

type FenceStatementId =
  | "readFence"
  | "beginAdvance"
  | "completeAdvance"
  | "recordLoss"
  | "takeOver"
  | "deleteFence"
  | "inspectFences";

function invalidRow(statementId: FenceStatementId): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "fence.invalidRow", params: { statement: statementId } },
    { details: { reason: "invalid-row", statement: statementId } },
  );
}

function invalidInput(operation: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "fence.invalidInput", params: { operation } },
    { details: { reason: "invalid-fence-input", operation } },
  );
}

function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  operation: string,
  input: z.input<Schema>,
): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidInput(operation);
  return parsed.data;
}

function rowsOf<Schema extends z.ZodType>(
  schema: Schema,
  statementId: FenceStatementId,
  rows: readonly unknown[],
): z.output<Schema>[] {
  return rows.map((raw) => {
    const row = schema.safeParse(raw);
    if (!row.success) throw invalidRow(statementId);
    return row.data;
  });
}

function lossDetailOf<Detail>(detail: Detail): FenceLossDetail | null {
  return fenceLossDetailSchema.safeParse(detail).data ?? null;
}

export function createFenceStore(options: { schema: string; context: PgErrorContext }): FenceStore {
  const statements = renderFenceStatements(schemaIdentifier(options.schema));
  const run = async (
    db: SqlExecutor,
    fragment: SqlFragment,
    values: readonly SqlValue[],
  ): Promise<readonly unknown[]> =>
    (await executeSql(db, statement(fragment, values), options.context)).rows;
  return Object.freeze({
    statements,

    async read(db, targetId) {
      const id = parseInput(targetIdInput, "read", targetId);
      const [row] = rowsOf(
        readFenceRowSchema,
        "readFence",
        await run(db, statements.readFence, [id]),
      );
      if (row === undefined) {
        return { epoch: 0, nonce: null, pending: null, lost: false, lostDetail: null };
      }
      const pending =
        row.pending_epoch === null || row.pending_nonce === null
          ? null
          : { epoch: row.pending_epoch, nonce: row.pending_nonce };
      return {
        epoch: row.epoch,
        nonce: row.nonce,
        pending,
        lost: row.lost,
        lostDetail: lossDetailOf(row.lost_detail),
      };
    },

    async beginAdvance(db, input) {
      const targetId = parseInput(targetIdInput, "beginAdvance", input.targetId);
      const nonce = parseInput(nonceInput, "beginAdvance", input.nonce);
      const seen = parseInput(epochInput, "beginAdvance", input.seenEpoch);
      const interval = parseInput(intervalInput, "beginAdvance", input.intervalMs);
      const [row] = rowsOf(
        beginAdvanceRowSchema,
        "beginAdvance",
        await run(db, statements.beginAdvance, [targetId, nonce, seen, interval]),
      );
      return row === undefined ? undefined : { epoch: row.pending_epoch, nonce: row.pending_nonce };
    },

    async completeAdvance(db, input) {
      const targetId = parseInput(targetIdInput, "completeAdvance", input.targetId);
      const nonce = parseInput(nonceInput, "completeAdvance", input.nonce);
      const [row] = rowsOf(
        completeAdvanceRowSchema,
        "completeAdvance",
        await run(db, statements.completeAdvance, [targetId, nonce]),
      );
      return row?.epoch;
    },

    async recordLoss(db, input) {
      const parsed = parseInput(lossInput, "recordLoss", input);
      const rows = rowsOf(
        recordLossRowSchema,
        "recordLoss",
        await run(db, statements.recordLoss, [
          parsed.targetId,
          JSON.stringify(parsed.detail),
          parsed.judgedEpoch,
          parsed.judgedPendingNonce,
        ]),
      );
      return rows.length === 1;
    },

    async takeOver(db, input) {
      const targetId = parseInput(targetIdInput, "takeOver", input.targetId);
      const remote = parseInput(epochInput.max(MAX_FENCE_EPOCH - 1), "takeOver", input.remoteEpoch);
      const nonce = parseInput(nonceInput, "takeOver", input.nonce);
      const [row] = rowsOf(
        takeOverRowSchema,
        "takeOver",
        await run(db, statements.takeOver, [targetId, remote, nonce]),
      );
      if (row === undefined) throw invalidRow("takeOver");
      return row.pending_epoch;
    },

    async remove(db, targetId) {
      await run(db, statements.deleteFence, [parseInput(targetIdInput, "remove", targetId)]);
    },

    async inspect(db, targetIds) {
      const ids = parseInput(z.array(targetIdInput).max(100_000), "inspect", [...targetIds]);
      if (ids.length === 0) return [];
      return rowsOf(
        inspectFencesRowSchema,
        "inspectFences",
        await run(db, statements.inspectFences, [ids]),
      ).map((row) => ({
        targetId: row.target_id,
        epoch: row.epoch,
        pending: row.pending,
        renewedAt: row.renewed_at,
        lost: row.lost_at !== null,
        lostDetail: lossDetailOf(row.lost_detail),
      }));
    },
  } satisfies FenceStore);
}
