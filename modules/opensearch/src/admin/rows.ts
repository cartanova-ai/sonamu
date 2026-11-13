import { z } from "zod";

import { timeoutMsSchema } from "../client/request-limits";
import { HASH_VERSION, sha256HexSchema } from "../definition/canonical-json";
import { assertDocumentId, isLogicalKey } from "../definition/names";

const functionSchema = z.instanceof(Function);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const adminUuidSchema = z.string().regex(UUID_PATTERN);

// pg returns int8 as a string.
export const int8Column = z
  .union([z.string().regex(/^-?\d{1,20}$/), z.number().int()])
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value));

export const nullableInt8Column = int8Column.nullable();

const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]*$/u;
const auditText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(NO_CONTROL_CHARACTERS)
    .refine((value) => value.trim() === value);

export const MAX_OPERATION_ID_LENGTH = 200;
export const MAX_ACTOR_LENGTH = 200;
export const MAX_REASON_LENGTH = 2000;

export const operationIdSchema = auditText(MAX_OPERATION_ID_LENGTH);
export const actorSchema = auditText(MAX_ACTOR_LENGTH);
export const auditReasonSchema = auditText(MAX_REASON_LENGTH);

export const adminContextSchema = z.strictObject({
  operationId: operationIdSchema,
  actor: actorSchema,
  reason: auditReasonSchema,
});

export const operationKindSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);

export const adminOperationRequestSchema = z.strictObject({
  logicalKey: z.string().refine(isLogicalKey),
  kind: operationKindSchema,
  operationId: operationIdSchema,
  actor: actorSchema,
  reason: auditReasonSchema,
});

export const adminTimeoutsSchema = z.strictObject({
  lockTimeoutMs: timeoutMsSchema,
  statementTimeoutMs: timeoutMsSchema,
  idleInTransactionTimeoutMs: timeoutMsSchema,
  adminLeaseMs: timeoutMsSchema,
});

export const adminLifetimesSchema = z.strictObject({
  maxSearchLifetimeMs: timeoutMsSchema,
  maxCursorLifetimeMs: timeoutMsSchema,
  maxPitKeepAliveMs: timeoutMsSchema,
  retirementSafetyMarginMs: timeoutMsSchema,
});

const registeredDefinitionSchema = z.looseObject({
  key: z.string().refine(isLogicalKey),
  fingerprint: sha256HexSchema,
  hashVersion: z.literal(HASH_VERSION),
});

const synchronizationHandleSchema = z.looseObject({
  namespace: z.string(),
  schema: z.string(),
  options: z.looseObject({ getPrimaryDatabase: functionSchema }),
});

export const searchAdminOptionsSchema = z.strictObject({
  client: z.custom<object>((value) => Object(value) === value).optional(),
  synchronization: synchronizationHandleSchema,
  definitions: z.array(registeredDefinitionSchema).max(1024),
  lifetimes: adminLifetimesSchema,
  timeouts: adminTimeoutsSchema,
  cutover: z.strictObject({
    maxPendingDocuments: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    sampleSize: z.number().int().min(0).max(10_000),
  }),
  workerBounds: z.strictObject({
    leaseDurationMs: timeoutMsSchema,
    requestTimeoutMs: timeoutMsSchema,
  }),
});

export const logicalKeyArgumentSchema = z.string().refine(isLogicalKey);

export const captureModeSchema = z.enum(["active", "suspended"]);
export const targetStateSchema = z.enum([
  "creating",
  "active",
  "paused",
  "retiring",
  "retired",
  "failed",
  "detached",
]);
export const remoteCreateStateSchema = z.enum([
  "not_started",
  "in_flight",
  "verified",
  "ambiguous",
  "abandoned",
]);
export const buildPhaseSchema = z.enum([
  "planned",
  "created",
  "backfilling",
  "catching_up",
  "serving",
  "failed",
  "retired",
]);
export const buildKindSchema = z.enum(["initial", "rebuild", "resume"]);

export const barrierRowSchema = z.object({
  generation: int8Column,
  capture_mode: captureModeSchema,
  capture_epoch: z.number().int().min(1),
});

export const leaseTokenRowSchema = z.object({ lease_token: adminUuidSchema });

export const controlRowSchema = z.object({ operation_kind: z.string().nullable() });

export const releasedLeaseRowSchema = z.object({ operation_id: z.string().nullable() });

export const targetIntentRowSchema = z.object({
  state: targetStateSchema,
  remote_create_state: remoteCreateStateSchema,
  capture_epoch: z.number().int().min(1),
  fingerprint: z.string(),
  create_operation_id: z.string(),
});

export const insertedTargetRowSchema = z.object({ target_id: adminUuidSchema });

export const indexStateRowSchema = z.object({
  generation: int8Column,
  capture_mode: captureModeSchema,
  capture_epoch: z.number().int().min(1),
  read_target_id: adminUuidSchema.nullable(),
  read_generation: nullableInt8Column,
  rebuild_required: z.boolean().nullable(),
  max_search_lifetime_ms: nullableInt8Column,
  max_cursor_lifetime_ms: nullableInt8Column,
  max_pit_keep_alive_ms: nullableInt8Column,
  retirement_safety_margin_ms: nullableInt8Column,
  database_now_ms: int8Column,
});

export const pauseReasonSchema = z.strictObject({
  class: z.enum(["revision_divergence", "write_alias_missing"]),
  documents: z
    .array(
      z.strictObject({
        id: z.string(),
        indexed: z.number().int().min(0),
        ledger: z.number().int().min(0).nullable(),
      }),
    )
    .optional(),
});

export const inspectedTargetRowSchema = z.object({
  target_id: adminUuidSchema,
  physical_index: z.string(),
  write_alias: z.string(),
  fingerprint: z.string(),
  capture_epoch: z.number().int().min(1),
  state: targetStateSchema,
  write_enabled: z.boolean(),
  remote_create_state: remoteCreateStateSchema,
  pause_reason: pauseReasonSchema.nullable(),
  deselected_at_ms: nullableInt8Column,
  deselect_confirmed_at_ms: nullableInt8Column,
  remote_create_started_at_ms: nullableInt8Column,
  verify_started_at_ms: nullableInt8Column,
  verify_completed_at_ms: nullableInt8Column,
  verify_checked: int8Column,
  verify_violations: int8Column,
});

export const openBuildRowSchema = z.object({
  build_id: adminUuidSchema,
  kind: buildKindSchema,
  phase: buildPhaseSchema,
  capture_epoch: z.number().int().min(1),
  new_target_id: adminUuidSchema,
  old_target_id: adminUuidSchema.nullable(),
  expected_read_target_id: adminUuidSchema.nullable(),
  expected_read_generation: int8Column,
  scan_boundary: z.string().nullable(),
  scan_cursor: z.string().nullable(),
  scan_pages: int8Column,
  scan_documents: int8Column,
  scan_completed: z.boolean(),
});

export const targetLagRowSchema = z.object({
  pending: int8Column,
  quarantined: int8Column,
  oldest_pending_at: z.date().nullable(),
});

export const targetBacklogRowSchema = z.object({
  intents: int8Column,
  pending: int8Column,
  quarantine_scanned: int8Column,
  quarantined: int8Column,
  leased: int8Column,
  runtime_scanned: int8Column,
  delayed: int8Column,
  oldest_scanned: int8Column,
  oldest_pending_ms: nullableInt8Column,
});

export const inspectOptionsSchema = z
  .strictObject({
    counts: z.enum(["bounded", "exact"]).optional(),
    countLimit: z.number().int().min(1).max(1_000_000).optional(),
  })
  .optional();

export const workerHeartbeatRowSchema = z.object({
  worker_id: adminUuidSchema,
  capabilities: z.array(z.string()),
  heartbeat_age_ms: int8Column,
});

export const liveTargetsRowSchema = z.object({ live_targets: int8Column });

export const attemptRowSchema = z.object({ remote_create_attempts: z.number().int().min(1) });

export const remoteCreateResultRowSchema = z.object({
  remote_create_state: remoteCreateStateSchema,
});

export const failedRowSchema = z.object({ state: z.literal("failed") });

export const reconciledRowSchema = z.object({
  state: targetStateSchema,
  remote_create_state: z.enum(["verified", "abandoned"]),
});

export const writeTargetsRowSchema = z.object({ write_targets: int8Column });

export const registeredRowSchema = z.object({ target_id: adminUuidSchema });

export const generationRowSchema = z.object({ generation: int8Column });

export const buildIdRowSchema = z.object({ build_id: adminUuidSchema });

export const targetIdentityRowSchema = z.object({
  namespace: z.string(),
  definition: z.string(),
  physical_index: z.string(),
  write_alias: z.string(),
  fingerprint: z.string(),
  hash_version: z.string(),
  capture_epoch: z.number().int().min(1),
  state: targetStateSchema,
  remote_create_state: remoteCreateStateSchema,
});

export const planStateRowSchema = z.object({
  capture_mode: captureModeSchema,
  capture_epoch: z.number().int().min(1),
  live_targets: int8Column,
});

export const rebuildInputSchema = z.strictObject({
  logicalKey: z.string().refine(isLogicalKey),
  fingerprint: sha256HexSchema,
});

export const buildIdArgumentSchema = adminUuidSchema;

export const MAX_BACKFILL_PAGE = 10_000;
export const backfillOptionsSchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_BACKFILL_PAGE),
  signal: z.instanceof(AbortSignal).optional(),
});

export const openBuildLookupRowSchema = z.object({
  build_id: adminUuidSchema,
  kind: buildKindSchema,
  phase: buildPhaseSchema,
  new_target_id: adminUuidSchema,
  fingerprint: z.string(),
});

export const buildRowSchema = z.object({
  build_id: adminUuidSchema,
  definition: z.string(),
  kind: buildKindSchema,
  phase: buildPhaseSchema,
  capture_epoch: z.number().int().min(1),
  new_target_id: adminUuidSchema,
  old_target_id: adminUuidSchema.nullable(),
  expected_read_target_id: adminUuidSchema.nullable(),
  expected_read_generation: int8Column,
  scan_boundary: z.string().nullable(),
  scan_cursor: z.string().nullable(),
  scan_pages: int8Column,
  scan_documents: int8Column,
  scan_completed: z.boolean(),
  operation_id: z.string(),
  physical_index: z.string(),
  write_alias: z.string(),
  fingerprint: z.string(),
  hash_version: z.string(),
  target_capture_epoch: z.number().int().min(1),
  target_state: targetStateSchema,
  write_enabled: z.boolean(),
  remote_create_state: remoteCreateStateSchema,
});

export const boundaryRowSchema = z.object({ build_id: adminUuidSchema });

export const inspectedBuildRowSchema = openBuildRowSchema.extend({ definition: z.string() });

export const readHeadTargetRowSchema = z.object({ target_id: adminUuidSchema.nullable() });

export const pageLockRowSchema = z.object({
  phase: buildPhaseSchema,
  capture_epoch: z.number().int().min(1),
  new_target_id: adminUuidSchema,
  cursor_matches: z.boolean(),
  state: targetStateSchema,
  write_enabled: z.boolean(),
});

export const cursorAdvanceRowSchema = z.object({
  phase: buildPhaseSchema,
  scan_cursor: z.string().nullable(),
});

export const scanPageSchema = z.strictObject({
  ids: z.array(z.string().refine(isValidDocumentId)),
  next: z
    .string()
    .refine((value) => !value.includes("\u0000"))
    .optional(),
});

function isValidDocumentId(id: string): boolean {
  try {
    assertDocumentId(id);
    return true;
  } catch {
    return false;
  }
}

export const scanBoundarySchema = z.string().refine((value) => !value.includes("\u0000"));

export const readHeadRowSchema = z.object({
  target_id: adminUuidSchema.nullable(),
  generation: int8Column,
  rebuild_required: z.boolean(),
});

export const lockedBuildRowSchema = z.object({
  build_id: adminUuidSchema,
  kind: buildKindSchema,
  phase: buildPhaseSchema,
  capture_epoch: z.number().int().min(1),
  new_target_id: adminUuidSchema,
  old_target_id: adminUuidSchema.nullable(),
  expected_read_target_id: adminUuidSchema.nullable(),
  expected_read_generation: int8Column,
  scan_completed: z.boolean(),
});

export const lockedTargetRowSchema = z.object({
  target_id: adminUuidSchema,
  state: targetStateSchema,
  write_enabled: z.boolean(),
  capture_epoch: z.number().int().min(1),
  fingerprint: z.string(),
});

export const backlogRowSchema = z.object({ pending: int8Column, quarantined: z.boolean() });

export const buildTransitionRowSchema = z.object({
  phase: buildPhaseSchema,
  expected_read_generation: int8Column,
});

export const deselectConfirmedRowSchema = z.object({ deselect_confirmed_at: z.date() });

export const ledgerIdRowSchema = z.object({ document_id: z.string() });

export const pendingIdRowSchema = z.object({ document_id: z.string() });

export const captureEpochRowSchema = z.object({ capture_epoch: z.number().int().min(1) });

export const suspendedHeadRowSchema = z.object({ target_id: adminUuidSchema.nullable() });

export const pendingResumeTargetRowSchema = z.object({
  target_id: adminUuidSchema,
  physical_index: z.string(),
  write_alias: z.string(),
  fingerprint: z.string(),
  hash_version: z.string(),
  remote_create_state: remoteCreateStateSchema,
});

export const targetIdArgumentSchema = adminUuidSchema;

export const retirementStateRowSchema = z.object({
  namespace: z.string(),
  definition: z.string(),
  physical_index: z.string(),
  write_alias: z.string(),
  fingerprint: z.string(),
  hash_version: z.string(),
  state: targetStateSchema,
  remote_create_state: remoteCreateStateSchema,
  alias_removed: z.boolean(),
  index_deleted: z.boolean(),
});

export const retirementGraceRowSchema = z.object({ grace_ms: int8Column });

export const openBuildOfTargetRowSchema = z.object({
  build_id: adminUuidSchema,
  phase: buildPhaseSchema,
});

export const retirementLockRowSchema = z.object({
  state: targetStateSchema,
  remote_create_state: remoteCreateStateSchema,
  selected_at: z.date().nullable(),
  deselected_at: z.date().nullable(),
  deselect_confirmed_at: z.date().nullable(),
  grace_elapsed: z.boolean(),
});

export const retiringRowSchema = z.object({ target_id: adminUuidSchema });

export const aliasRemovedRowSchema = z.object({ alias_removed_at: z.date() });

export const quiescedRowSchema = z.object({ quiesced: z.boolean() });

export const indexDeletedRowSchema = z.object({ index_deleted_at: z.date() });

export const residualIntentRowSchema = z.object({
  target_id: adminUuidSchema,
  document_id: z.string(),
  intent_id: adminUuidSchema,
});

export const residualRuntimeKeyRowSchema = z.object({
  document_id: z.string(),
  intent_id: adminUuidSchema,
});

export const retiredRowSchema = z.object({ retired_at: z.date() });

export const MAX_REPAIR_PAGE = 10_000;

const repairDocumentIdSchema = z.string().refine(isValidDocumentId);
// NUL cannot be stored in PostgreSQL text.
const repairCursorSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\u0000"));
const repairLimitSchema = z.number().int().min(1).max(MAX_REPAIR_PAGE);
const optionalSignalSchema = z.instanceof(AbortSignal).optional();

export const remarkInputSchema = z.union([
  z.strictObject({
    logicalKey: z.string().refine(isLogicalKey),
    ids: z.array(repairDocumentIdSchema).min(1).max(MAX_REPAIR_PAGE),
    signal: optionalSignalSchema,
  }),
  z.strictObject({
    logicalKey: z.string().refine(isLogicalKey),
    scan: z.enum(["source", "ledger"]),
    after: repairCursorSchema.optional(),
    through: repairCursorSchema.optional(),
    limit: repairLimitSchema,
    signal: optionalSignalSchema,
  }),
]);

export const retryScopeSchema = z.strictObject({
  targetId: adminUuidSchema,
  limit: repairLimitSchema,
  documentIds: z.array(repairDocumentIdSchema).min(1).max(MAX_REPAIR_PAGE).optional(),
  signal: optionalSignalSchema,
});

export const verificationOptionsSchema = z.strictObject({
  limit: repairLimitSchema,
  signal: optionalSignalSchema,
});

export const releasedQuarantineRowSchema = z.object({ document_id: z.string() });

export const writeTargetFingerprintRowSchema = z.object({ fingerprint: z.string() });

export const verifyTargetRowSchema = z.object({
  namespace: z.string(),
  definition: z.string(),
  physical_index: z.string(),
  write_alias: z.string(),
  fingerprint: z.string(),
  hash_version: z.string(),
  capture_epoch: z.number().int().min(1),
  state: targetStateSchema,
  write_enabled: z.boolean(),
  remote_create_state: remoteCreateStateSchema,
  pause_reason: pauseReasonSchema.nullable(),
  verify_cursor: z.string().nullable(),
  verify_current: z.boolean(),
  verify_completed: z.boolean(),
  verify_checked: int8Column,
  verify_violations: int8Column,
});

export const verifyQuiescedRowSchema = z.object({
  state: targetStateSchema,
  pause_reason: pauseReasonSchema.nullable(),
  quiesced: z.boolean().nullable(),
});

export const verifyStartedRowSchema = z.object({ verify_started_at: z.date() });

export const verifyAdvancedRowSchema = z.object({
  verify_checked: int8Column,
  verify_violations: int8Column,
  verify_completed_at: z.date().nullable(),
});

export const resumedTargetRowSchema = z.object({ target_id: adminUuidSchema });

export const ledgerRevisionRowSchema = z.object({
  document_id: z.string(),
  revision: int8Column,
});
