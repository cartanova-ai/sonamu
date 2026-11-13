import { type Knex } from "knex";
import { z } from "zod";

export const DEFAULT_MAX_IDS_PER_CALL = 10_000;
export const MAX_IDS_PER_CALL_LIMIT = 1_000_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uuidSchema = z.string().regex(UUID_PATTERN);

const functionSchema = z.instanceof(Function);

export const instanceNameSchema = z
  .string()
  .regex(/^[^\p{Cc}]+$/u)
  .refine((value) => {
    const bytes = Buffer.byteLength(value, "utf8");
    return bytes >= 1 && bytes <= 128;
  });

export const synchronizationOptionsSchema = z.strictObject({
  getPrimaryDatabase: functionSchema,
  schema: z.string().optional(),
  namespace: z.string(),
  expectedStoreId: uuidSchema.optional(),
  maxIdsPerCall: z.number().int().min(1).max(MAX_IDS_PER_CALL_LIMIT).optional(),
  instanceName: instanceNameSchema.optional(),
});

export function isSqlExecutor(db: Knex | Knex.Transaction): boolean {
  return functionSchema.safeParse(db).success && functionSchema.safeParse(db.raw).success;
}

export function looksLikeTransaction(handle: Knex | Knex.Transaction): boolean {
  return isSqlExecutor(handle) && handle.isTransaction === true;
}

export function isLiveTransaction(handle: Knex | Knex.Transaction): boolean {
  if (!looksLikeTransaction(handle) || !("isCompleted" in handle)) return false;
  if (!functionSchema.safeParse(handle.isCompleted).success) return false;
  try {
    return !handle.isCompleted();
  } catch {
    return false;
  }
}

export function markChangedInputSchema(maxIdsPerCall: number) {
  return z.object({
    logicalKey: z.string(),
    ids: z.array(z.string()).max(maxIdsPerCall),
  });
}

export const safeIntegerColumn = z
  .union([z.string().regex(/^-?\d{1,20}$/), z.number().int()])
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value), { params: { reason: "unsafe_integer" } });

export const storeRowSchema = z.object({ store_id: uuidSchema });

export const barrierRowSchema = z.object({
  generation: safeIntegerColumn,
  store_id: uuidSchema,
});

// Some drivers return uuid[] as the literal "{a,b}"; a uuid contains no quote or comma, so splitting is safe.
const uuidArraySchema = z.union([
  z.array(uuidSchema),
  z
    .string()
    .regex(/^\{[0-9a-f,-]*\}$/)
    .transform((literal) => {
      const inner = literal.slice(1, -1);
      return inner === "" ? [] : inner.split(",");
    })
    .pipe(z.array(uuidSchema)),
]);

export const captureRowSchema = z.object({
  capture_mode: z.enum(["active", "suspended"]),
  capture_epoch: z.number().int().min(1),
  target_ids: uuidArraySchema,
});

// document_id has no length limit: an oversized stored ID must reach the worker's invalid_id quarantine, and
// rejecting it here would fail every drain of its target.
export const ledgerRowSchema = z.object({
  document_id: z.string().min(1),
  revision: safeIntegerColumn,
});

export const deliveryKeyRowSchema = z.object({
  target_id: uuidSchema,
  document_id: z.string().min(1),
  intent_id: uuidSchema,
});

export const claimableTargetRowSchema = z.object({
  target_id: uuidSchema,
  definition: z.string().min(1),
  fingerprint: z.string().min(1),
  hash_version: z.string().min(1),
  physical_index: z.string().min(1),
  write_alias: z.string().min(1),
  capture_epoch: z.number().int().min(1),
});

export const claimRowSchema = deliveryKeyRowSchema.extend({
  claimed_revision: safeIntegerColumn.pipe(z.number().int().min(1)),
  attempts: z.number().int().min(0),
  failure_revision: safeIntegerColumn.pipe(z.number().int().min(0)),
});

export const acknowledgeRowSchema = deliveryKeyRowSchema.extend({
  outcome: z.enum(["deleted", "advanced", "released"]),
});

export const classifyRowSchema = deliveryKeyRowSchema.extend({
  attempts: z.number().int().min(0),
  retry_age_ms: safeIntegerColumn.pipe(z.number().int().min(0)),
  outcome: z.enum(["retry_scheduled", "quarantined", "newer_pending"]),
});

export const pausedTargetRowSchema = z.object({ target_id: uuidSchema });

export const targetEligibilityRowSchema = z.object({
  state: z.enum(["creating", "active", "paused", "retiring", "retired", "failed", "detached"]),
  write_enabled: z.boolean(),
  capture_epoch: z.number().int().min(1),
  current_capture_epoch: z.number().int().min(1),
  capture_mode: z.enum(["active", "suspended"]),
});
