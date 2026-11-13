import { z } from "zod";

import { type JsonValue, jsonValueSchema } from "../definition/canonical-json";
import { MAX_DOCUMENT_ID_BYTES } from "../definition/names";
import { SearchConfigurationError, SearchSchemaVersionMismatch } from "../errors";
import { type TargetState } from "../query/catalog";
import {
  acknowledgeRowSchema,
  claimableTargetRowSchema,
  claimRowSchema,
  classifyRowSchema,
  deliveryKeyRowSchema,
  ledgerRowSchema,
  pausedTargetRowSchema,
  safeIntegerColumn,
  targetEligibilityRowSchema,
  uuidSchema,
} from "./rows";
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

// Intent and runtime are split. deliveries is written only by markers and backfill; the worker locks an intent row
// (FOR UPDATE SKIP LOCKED) only to claim or delete it and never updates it, so a REPEATABLE READ marker cannot fail with
// 40001 because of the worker. delivery_runtime holds lease, retry budget and quarantine per intent incarnation.
// Lock order is intent row, then runtime row. heartbeat, classifyFailures, release, and acknowledge of an intent a
// marker holds lock only the runtime row (capture cannot lock it), so a marker never strands a lease.
// Every runtime update is fenced by (target_id, document_id, intent_id, lease_token). The retry budget belongs to the
// materialized revision and changes only in classifyFailures. Each statement runs alone in autocommit; lease times use
// clock_timestamp(), never the Node clock.

export interface DeliveryKey {
  readonly targetId: string;
  readonly documentId: string;
  readonly intentId: string;
}

export interface ClaimableTarget {
  readonly targetId: string;
  readonly definition: string;
  readonly fingerprint: string;
  readonly hashVersion: string;
  readonly physicalIndex: string;
  readonly writeAlias: string;
  readonly captureEpoch: number;
}

export interface BoundTargets {
  readonly binding: {
    readonly storeId: string;
    readonly originRecorded: boolean;
    readonly originMatches: boolean;
    readonly instanceMatches: boolean;
    readonly systemIdentifierReadable: boolean;
  };
  readonly targets: BoundTarget[];
}

export interface TargetFenceState {
  readonly epoch: number;
  readonly nonce: string | null;
  readonly pendingAgeMs: number | null;
  readonly lost: boolean;
  readonly renewalDue: boolean;
}

export interface BoundTarget extends ClaimableTarget {
  readonly fence: TargetFenceState;
}

export interface ClaimedDelivery extends DeliveryKey {
  readonly claimedRevision: number;
}

export interface ClaimResult extends ClaimedDelivery {
  readonly attempts: number;
  readonly failureRevision: number;
}

export interface ClaimInput {
  readonly targetIds: readonly string[];
  readonly limit: number;
  readonly leaseToken: string;
  readonly leaseMs: number;
}

export interface ClaimBatch {
  readonly rows: ClaimResult[];
  readonly candidates: number;
}

export interface HeartbeatInput {
  readonly leaseToken: string;
  readonly deliveries: readonly DeliveryKey[];
  readonly leaseMs: number;
}

export interface AcknowledgeItem extends DeliveryKey {
  readonly materializedRevision: number;
}

export interface AcknowledgeInput {
  readonly leaseToken: string;
  readonly items: readonly AcknowledgeItem[];
}

export interface AcknowledgeResult extends DeliveryKey {
  readonly outcome: "deleted" | "advanced" | "released";
}

export interface UnreturnedDeliveries {
  readonly leaseLost: readonly DeliveryKey[];
  readonly skippedLocked: readonly DeliveryKey[];
}

export interface ReadLedgerInput {
  readonly namespace: string;
  readonly definition: string;
  readonly documentIds: readonly string[];
}

export interface LedgerRevision {
  readonly documentId: string;
  readonly revision: number;
}

export interface DeliveryError {
  readonly class: string;
  readonly [field: string]: JsonValue;
}

export interface FailureItem extends DeliveryKey {
  readonly materializedRevision: number;
  readonly mode: "retry" | "poison";
  readonly delayMs: number;
  readonly error: DeliveryError;
}

export interface ClassifyFailuresInput {
  readonly leaseToken: string;
  readonly items: readonly FailureItem[];
  readonly maxRetryAttempts: number;
  readonly maxRetryAgeMs: number;
}

export interface FailureResult extends DeliveryKey {
  readonly outcome: "retry_scheduled" | "quarantined" | "newer_pending";
  readonly attempts: number;
  readonly retryAgeMs: number;
}

export interface ReleaseItem extends DeliveryKey {
  readonly revision: number;
  readonly delayMs: number;
  readonly error: DeliveryError | null;
}

export interface ReleaseInput {
  readonly leaseToken: string;
  readonly items: readonly ReleaseItem[];
}

export interface PauseReason {
  readonly class: "revision_divergence" | "write_alias_missing";
  readonly documents?: readonly {
    readonly id: string;
    readonly indexed: number;
    readonly ledger: number;
  }[];
}

export interface PauseTargetInput {
  readonly targetId: string;
  readonly reason: PauseReason;
}

export type TargetIneligibleReason =
  | "target-missing"
  | "target-not-active"
  | "write-disabled"
  | "capture-suspended"
  | "capture-epoch-behind";

export interface TargetEligibility {
  readonly eligible: boolean;
  readonly reason: TargetIneligibleReason | null;
  readonly target: {
    readonly state: TargetState;
    readonly writeEnabled: boolean;
    readonly captureEpoch: number;
    readonly currentCaptureEpoch: number;
    readonly captureMode: "active" | "suspended";
  } | null;
}

export interface DeliveryStore {
  readonly schema: string;
  listClaimableTargets(db: SqlExecutor, namespace: string): Promise<ClaimableTarget[]>;
  listBoundTargets(
    db: SqlExecutor,
    input: {
      namespace: string;
      instanceName: string | null;
      systemIdentifierReadable: boolean;
      fenceRenewIntervalMs: number;
    },
  ): Promise<BoundTargets>;
  claim(db: SqlExecutor, input: ClaimInput): Promise<ClaimResult[]>;
  claimBatch(db: SqlExecutor, input: ClaimInput): Promise<ClaimBatch>;
  heartbeat(db: SqlExecutor, input: HeartbeatInput): Promise<DeliveryKey[]>;
  acknowledge(db: SqlExecutor, input: AcknowledgeInput): Promise<AcknowledgeResult[]>;
  leasedBy(db: SqlExecutor, leaseToken: string): Promise<DeliveryKey[]>;
  classifyUnreturned(
    db: SqlExecutor,
    leaseToken: string,
    requested: readonly DeliveryKey[],
    returned: readonly DeliveryKey[],
  ): Promise<UnreturnedDeliveries>;
  readLedger(db: SqlExecutor, input: ReadLedgerInput): Promise<LedgerRevision[]>;
  classifyFailures(db: SqlExecutor, input: ClassifyFailuresInput): Promise<FailureResult[]>;
  release(db: SqlExecutor, input: ReleaseInput): Promise<DeliveryKey[]>;
  pauseTarget(db: SqlExecutor, input: PauseTargetInput): Promise<boolean>;
  checkTargetEligibility(db: SqlExecutor, targetId: string): Promise<TargetEligibility>;
}

type Statements = {
  readonly listClaimableTargets: SqlFragment;
  readonly listBoundTargets: SqlFragment;
  readonly listBoundTargetsWithoutSystemIdentifier: SqlFragment;
  readonly claim: SqlFragment;
  readonly heartbeat: SqlFragment;
  readonly acknowledge: SqlFragment;
  readonly listLeasedByToken: SqlFragment;
  readonly readLedger: SqlFragment;
  readonly classifyFailures: SqlFragment;
  readonly release: SqlFragment;
  readonly pauseTarget: SqlFragment;
  readonly checkTargetEligibility: SqlFragment;
};

// On a binding mismatch the first LATERAL condition is false, so the target part never runs and one row with only
// binding columns comes back.
function renderBoundDiscovery(
  schema: SqlFragment,
  targets: SqlFragment,
  indexes: SqlFragment,
  readable: boolean,
): SqlFragment {
  const store = qualified(schema, "store");
  const fences = qualified(schema, "target_fences");
  const systemIdentifier = readable
    ? sql`
         AND (s.origin_system_identifier IS NULL OR s.origin_system_identifier = (pg_control_system()).system_identifier::text)`
    : sql``;
  return sql`SELECT b.store_id, b.origin_recorded, b.origin_matches, b.instance_matches,
       w.target_id, w.definition, w.fingerprint, w.hash_version, w.physical_index, w.write_alias, w.capture_epoch,
       w.fence_epoch, w.fence_nonce, w.fence_pending_age_ms, w.fence_lost, w.fence_renewal_due
FROM (
  SELECT s.store_id,
         s.origin_recorded_at IS NOT NULL AS origin_recorded,
         s.origin_database_oid IS NOT DISTINCT FROM (SELECT oid::bigint FROM pg_database WHERE datname = current_database())
         AND s.origin_database_name IS NOT DISTINCT FROM current_database()::text${systemIdentifier} AS origin_matches,
         ($2::text IS NULL OR s.instance_name IS NULL OR s.instance_name = $2::text) AS instance_matches
  FROM ${store} s
) b
LEFT JOIN LATERAL (
  SELECT t.target_id, t.definition, t.fingerprint, t.hash_version, t.physical_index, t.write_alias, t.capture_epoch,
         COALESCE(f.epoch, 0) AS fence_epoch, f.nonce AS fence_nonce,
         (extract(epoch FROM (clock_timestamp() - f.pending_at)) * 1000)::bigint AS fence_pending_age_ms,
         f.lost_at IS NOT NULL AS fence_lost,
         (f.renewed_at IS NULL OR f.renewed_at <= clock_timestamp() - ($3::bigint * interval '1 millisecond')) AS fence_renewal_due
  FROM ${targets} t
  JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
  LEFT JOIN ${fences} f ON f.target_id = t.target_id
  WHERE b.origin_recorded AND b.origin_matches AND b.instance_matches
    AND t.namespace = $1 AND t.state = 'active' AND t.write_enabled
    AND i.capture_mode = 'active' AND t.capture_epoch = i.capture_epoch
) w ON true;`;
}

const boundRowSchema = z.object({
  store_id: uuidSchema,
  origin_recorded: z.boolean(),
  origin_matches: z.boolean(),
  instance_matches: z.boolean(),
  target_id: uuidSchema.nullable(),
  definition: z.string().min(1).nullable(),
  fingerprint: z.string().min(1).nullable(),
  hash_version: z.string().min(1).nullable(),
  physical_index: z.string().min(1).nullable(),
  write_alias: z.string().min(1).nullable(),
  capture_epoch: z.number().int().min(1).nullable(),
  fence_epoch: safeIntegerColumn.pipe(z.number().int().min(0)).nullable(),
  fence_nonce: uuidSchema.nullable(),
  fence_pending_age_ms: safeIntegerColumn.nullable(),
  fence_lost: z.boolean().nullable(),
  fence_renewal_due: z.boolean().nullable(),
});

export function renderDeliveryStatements(schema: SqlFragment): Statements {
  const deliveries = qualified(schema, "deliveries");
  const runtime = qualified(schema, "delivery_runtime");
  const targets = qualified(schema, "targets");
  const indexes = qualified(schema, "indexes");
  const documents = qualified(schema, "documents");
  return {
    listClaimableTargets: sql`SELECT t.target_id, t.definition, t.fingerprint, t.hash_version, t.physical_index, t.write_alias, t.capture_epoch
FROM ${targets} t
JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
WHERE t.namespace = $1 AND t.state = 'active' AND t.write_enabled
  AND i.capture_mode = 'active' AND t.capture_epoch = i.capture_epoch;`,
    listBoundTargets: renderBoundDiscovery(schema, targets, indexes, true),
    listBoundTargetsWithoutSystemIdentifier: renderBoundDiscovery(schema, targets, indexes, false),
    // Sort key GREATEST(enqueued_at, last claim) keeps re-marked documents from starving others; no index orders it, hence
    // two branches. ON CONFLICT ... WHERE re-checks the live runtime row so a stale-snapshot claim cannot take a lease.
    claim: sql`WITH cand AS MATERIALIZED (
  SELECT c.target_id, c.document_id, c.intent_id, c.sort_at
  FROM unnest($1::uuid[]) AS x(target_id)
  JOIN ${targets} t ON t.target_id = x.target_id
  JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
  CROSS JOIN LATERAL (
    (SELECT d.target_id, d.document_id, d.intent_id, d.enqueued_at AS sort_at
     FROM ${deliveries} d
     WHERE d.target_id = t.target_id
       AND NOT EXISTS (SELECT 1 FROM ${runtime} r
                       WHERE r.target_id = d.target_id AND r.document_id = d.document_id AND r.intent_id = d.intent_id)
     ORDER BY d.enqueued_at, d.document_id
     LIMIT 2 * $2::bigint)
    UNION ALL
    (SELECT d.target_id, d.document_id, d.intent_id,
            GREATEST(d.enqueued_at, COALESCE(r.claim_started_at, d.enqueued_at)) AS sort_at
     FROM ${runtime} r
     JOIN ${deliveries} d
       ON d.target_id = r.target_id AND d.document_id = r.document_id AND d.intent_id = r.intent_id
     WHERE r.target_id = t.target_id
       AND (r.lease_expires_at IS NULL OR r.lease_expires_at <= clock_timestamp())
       AND d.desired_revision > r.applied_revision
       AND (r.quarantined_revision IS NULL OR r.quarantined_revision < d.desired_revision)
       AND (r.available_revision < d.desired_revision OR r.available_at <= clock_timestamp())
     ORDER BY sort_at, d.document_id
     LIMIT 2 * $2::bigint)
  ) c
  WHERE t.state = 'active' AND t.write_enabled
    AND i.capture_mode = 'active' AND t.capture_epoch = i.capture_epoch
  ORDER BY c.sort_at, c.target_id, c.document_id
  LIMIT 2 * $2::bigint
),
picked AS MATERIALIZED (
  SELECT d.target_id, d.document_id, d.intent_id, d.desired_revision
  FROM cand c
  JOIN ${deliveries} d
    ON d.target_id = c.target_id AND d.document_id = c.document_id AND d.intent_id = c.intent_id
  ORDER BY c.sort_at, d.target_id, d.document_id
  LIMIT $2::bigint
  FOR UPDATE OF d SKIP LOCKED
)
INSERT INTO ${runtime} AS r
  (target_id, document_id, intent_id, claimed_revision, lease_token, lease_expires_at, claim_started_at)
SELECT p.target_id, p.document_id, p.intent_id, p.desired_revision, $3::uuid,
       clock_timestamp() + ($4::bigint * interval '1 millisecond'), clock_timestamp()
FROM picked p
ORDER BY p.target_id, p.document_id
ON CONFLICT (target_id, document_id, intent_id) DO UPDATE
SET claimed_revision = EXCLUDED.claimed_revision, lease_token = EXCLUDED.lease_token,
    lease_expires_at = EXCLUDED.lease_expires_at, claim_started_at = EXCLUDED.claim_started_at,
    updated_at = clock_timestamp()
WHERE (r.lease_expires_at IS NULL OR r.lease_expires_at <= clock_timestamp())
  AND EXCLUDED.claimed_revision > r.applied_revision
  AND (r.quarantined_revision IS NULL OR r.quarantined_revision < EXCLUDED.claimed_revision)
  AND (r.available_revision < EXCLUDED.claimed_revision OR r.available_at <= clock_timestamp())
RETURNING r.target_id, r.document_id, r.intent_id, r.claimed_revision, r.attempts, r.failure_revision,
  (SELECT count(*) FROM cand)::integer AS candidates;`,
    heartbeat: sql`WITH locked AS MATERIALIZED (
  SELECT r.target_id, r.document_id, r.intent_id
  FROM ${runtime} r
  JOIN unnest($2::uuid[], $3::text[], $4::uuid[]) AS x(target_id, document_id, intent_id)
    ON x.target_id = r.target_id AND x.document_id = r.document_id AND x.intent_id = r.intent_id
  JOIN ${targets} t ON t.target_id = r.target_id
  JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
  WHERE r.lease_token = $1::uuid
    AND t.state = 'active' AND t.write_enabled AND i.capture_mode = 'active' AND t.capture_epoch = i.capture_epoch
    AND EXISTS (SELECT 1 FROM ${deliveries} d
                WHERE d.target_id = r.target_id AND d.document_id = r.document_id AND d.intent_id = r.intent_id)
  ORDER BY r.target_id, r.document_id
  FOR UPDATE OF r SKIP LOCKED
)
UPDATE ${runtime} r
SET lease_expires_at = clock_timestamp() + ($5::bigint * interval '1 millisecond'), updated_at = clock_timestamp()
FROM locked l
WHERE r.target_id = l.target_id AND r.document_id = l.document_id AND r.intent_id = l.intent_id
  AND r.lease_token = $1::uuid
RETURNING r.target_id, r.document_id, r.intent_id;`,
    // The intent is locked SKIP LOCKED: when a marker holds it, the outcome comes from the runtime row alone (advanced,
    // or released without recording M), so acknowledge never waits on a marker.
    acknowledge: sql`WITH input AS (
  SELECT * FROM unnest($2::uuid[], $3::text[], $4::uuid[], $5::bigint[])
    AS x(target_id, document_id, intent_id, materialized)
),
held AS MATERIALIZED (
  SELECT d.target_id, d.document_id, d.intent_id, d.desired_revision
  FROM ${deliveries} d
  JOIN input x ON x.target_id = d.target_id AND x.document_id = d.document_id AND x.intent_id = d.intent_id
  ORDER BY d.target_id, d.document_id
  FOR UPDATE OF d SKIP LOCKED
),
locked AS MATERIALIZED (
  SELECT r.target_id, r.document_id, r.intent_id, x.materialized,
         h.target_id IS NOT NULL AS intent_held,
         COALESCE(h.desired_revision, d.desired_revision) AS desired_revision
  FROM ${runtime} r
  JOIN input x ON x.target_id = r.target_id AND x.document_id = r.document_id AND x.intent_id = r.intent_id
  LEFT JOIN held h ON h.target_id = r.target_id AND h.document_id = r.document_id AND h.intent_id = r.intent_id
  LEFT JOIN ${deliveries} d ON d.target_id = r.target_id AND d.document_id = r.document_id AND d.intent_id = r.intent_id
  WHERE r.lease_token = $1::uuid
  ORDER BY r.target_id, r.document_id
  FOR UPDATE OF r SKIP LOCKED
),
dropped_runtime AS (
  DELETE FROM ${runtime} r USING locked l
  WHERE r.target_id = l.target_id AND r.document_id = l.document_id AND r.intent_id = l.intent_id
    AND l.intent_held AND l.desired_revision <= l.materialized
  RETURNING r.target_id, r.document_id, r.intent_id
),
dropped_intent AS (
  DELETE FROM ${deliveries} d USING locked l
  WHERE d.target_id = l.target_id AND d.document_id = l.document_id AND d.intent_id = l.intent_id
    AND l.intent_held AND l.desired_revision <= l.materialized AND d.desired_revision <= l.materialized
  RETURNING d.target_id, d.document_id, d.intent_id
),
advanced AS (
  UPDATE ${runtime} r
  SET applied_revision = GREATEST(r.applied_revision, l.materialized),
      lease_token = NULL, lease_expires_at = NULL,
      available_at = clock_timestamp(), last_error = NULL, updated_at = clock_timestamp()
  FROM locked l
  WHERE r.target_id = l.target_id AND r.document_id = l.document_id AND r.intent_id = l.intent_id
    AND l.desired_revision > l.materialized
  RETURNING r.target_id, r.document_id, r.intent_id
),
released AS (
  UPDATE ${runtime} r
  SET lease_token = NULL, lease_expires_at = NULL,
      available_at = clock_timestamp(), last_error = NULL, updated_at = clock_timestamp()
  FROM locked l
  WHERE r.target_id = l.target_id AND r.document_id = l.document_id AND r.intent_id = l.intent_id
    AND NOT l.intent_held AND (l.desired_revision IS NULL OR l.desired_revision <= l.materialized)
  RETURNING r.target_id, r.document_id, r.intent_id
)
SELECT 'deleted' AS outcome, target_id, document_id, intent_id FROM dropped_intent
UNION ALL
SELECT 'advanced', target_id, document_id, intent_id FROM advanced
UNION ALL
SELECT 'released', target_id, document_id, intent_id FROM released;`,
    listLeasedByToken: sql`SELECT target_id, document_id, intent_id FROM ${runtime} WHERE lease_token = $1::uuid;`,
    readLedger: sql`SELECT document_id, revision FROM ${documents}
WHERE namespace = $1 AND definition = $2 AND document_id = ANY($3::text[]);`,
    classifyFailures: sql`WITH input AS (
  SELECT * FROM unnest($2::uuid[], $3::text[], $4::uuid[], $5::bigint[], $6::text[], $7::bigint[], $8::jsonb[])
    AS x(target_id, document_id, intent_id, materialized, mode, delay_ms, error)
),
held AS (
  SELECT d.target_id, d.document_id, d.intent_id, d.desired_revision, x.materialized, x.mode, x.delay_ms, x.error
  FROM ${deliveries} d
  JOIN input x ON x.target_id = d.target_id AND x.document_id = d.document_id AND x.intent_id = d.intent_id
),
locked AS MATERIALIZED (
  SELECT r.target_id, r.document_id, r.intent_id, h.desired_revision, h.materialized, h.mode, h.delay_ms, h.error,
         CASE WHEN r.failure_revision = h.materialized THEN r.attempts ELSE 0 END AS base_attempts,
         CASE WHEN r.failure_revision = h.materialized THEN r.retry_age_ms ELSE 0 END AS base_age_ms,
         CASE WHEN r.failure_revision = h.materialized THEN r.first_attempt_at END AS base_first_at,
         GREATEST(0, ceil(extract(epoch FROM (clock_timestamp() - r.claim_started_at)) * 1000))::bigint AS elapsed_ms
  FROM ${runtime} r
  JOIN held h ON h.target_id = r.target_id AND h.document_id = r.document_id AND h.intent_id = r.intent_id
  WHERE r.lease_token = $1::uuid
  ORDER BY r.target_id, r.document_id
  FOR UPDATE OF r SKIP LOCKED
),
decided AS (
  SELECT l.*,
         (l.desired_revision > l.materialized) AS newer,
         l.base_attempts + CASE WHEN l.mode = 'retry' THEN 1 ELSE 0 END AS next_attempts,
         l.base_age_ms + CASE WHEN l.mode = 'retry' THEN l.elapsed_ms + l.delay_ms ELSE 0 END AS next_age_ms
  FROM locked l
)
UPDATE ${runtime} r
SET lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp(),
    failure_revision = CASE WHEN c.newer THEN r.failure_revision ELSE c.materialized END,
    attempts = CASE WHEN c.newer THEN r.attempts ELSE c.next_attempts END,
    retry_age_ms = CASE WHEN c.newer THEN r.retry_age_ms ELSE c.next_age_ms END,
    first_attempt_at = CASE WHEN c.newer THEN r.first_attempt_at
                            WHEN c.mode = 'retry' THEN COALESCE(c.base_first_at, clock_timestamp())
                            ELSE c.base_first_at END,
    quarantined_revision = CASE WHEN c.newer THEN r.quarantined_revision
                                WHEN c.mode = 'poison' OR c.next_attempts >= $9::integer OR c.next_age_ms >= $10::bigint
                                  THEN c.materialized
                                ELSE NULL END,
    available_at = CASE WHEN c.newer THEN clock_timestamp()
                        ELSE clock_timestamp() + (c.delay_ms * interval '1 millisecond') END,
    available_revision = CASE WHEN c.newer THEN r.available_revision ELSE c.materialized END,
    last_error = CASE WHEN c.newer THEN r.last_error
                      WHEN c.mode = 'retry' AND (c.next_attempts >= $9::integer OR c.next_age_ms >= $10::bigint)
                        THEN c.error || '{"exhausted": true}'::jsonb
                      ELSE c.error END
FROM decided c
WHERE r.target_id = c.target_id AND r.document_id = c.document_id AND r.intent_id = c.intent_id
  AND r.lease_token IS NOT DISTINCT FROM $1::uuid
RETURNING r.target_id, r.document_id, r.intent_id, r.attempts, r.retry_age_ms,
          CASE WHEN c.newer THEN 'newer_pending'
               WHEN r.quarantined_revision = c.materialized THEN 'quarantined'
               ELSE 'retry_scheduled' END AS outcome;`,
    release: sql`WITH input AS (
  SELECT * FROM unnest($2::uuid[], $3::text[], $4::uuid[], $5::bigint[], $6::bigint[], $7::jsonb[])
    AS x(target_id, document_id, intent_id, revision, delay_ms, error)
),
held AS (
  SELECT d.target_id, d.document_id, d.intent_id, x.revision, x.delay_ms, x.error
  FROM ${deliveries} d
  JOIN input x ON x.target_id = d.target_id AND x.document_id = d.document_id AND x.intent_id = d.intent_id
),
locked AS MATERIALIZED (
  SELECT r.target_id, r.document_id, r.intent_id, h.revision, h.delay_ms, h.error
  FROM ${runtime} r
  JOIN held h ON h.target_id = r.target_id AND h.document_id = r.document_id AND h.intent_id = r.intent_id
  WHERE r.lease_token = $1::uuid
  ORDER BY r.target_id, r.document_id
  FOR UPDATE OF r SKIP LOCKED
)
UPDATE ${runtime} r
SET lease_token = NULL, lease_expires_at = NULL,
    available_at = clock_timestamp() + (l.delay_ms * interval '1 millisecond'),
    available_revision = l.revision, last_error = l.error, updated_at = clock_timestamp()
FROM locked l
WHERE r.target_id = l.target_id AND r.document_id = l.document_id AND r.intent_id = l.intent_id
RETURNING r.target_id, r.document_id, r.intent_id;`,
    checkTargetEligibility: sql`SELECT t.state, t.write_enabled, t.capture_epoch, i.capture_epoch AS current_capture_epoch, i.capture_mode
FROM ${targets} t
JOIN ${indexes} i ON i.namespace = t.namespace AND i.definition = t.definition
WHERE t.target_id = $1;`,
    pauseTarget: sql`UPDATE ${targets}
SET state = 'paused', pause_reason = $2::jsonb, paused_at = clock_timestamp()
WHERE target_id = $1 AND state = 'active'
RETURNING target_id;`,
  };
}

const MAX_REVISION = Number.MAX_SAFE_INTEGER;
// Largest lease that keeps PostgreSQL interval arithmetic in range (about 24 days).
const MAX_LEASE_MS = 2_147_483_647;
const MAX_DELAY_MS = 2_147_483_647;
const MAX_BATCH = 100_000;
// The CHECKs measure jsonb::text, up to 1.5x JSON.stringify, so inputs stay below 2/3 of the 2048- and 4096-byte
// limits; classifyFailures may append '"exhausted": true' to last_error.
const MAX_ERROR_JSON_BYTES = 1300;
const MAX_PAUSE_REASON_JSON_BYTES = 2700;
const MAX_PAUSE_DOCUMENTS = 20;

const documentIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      Buffer.byteLength(value, "utf8") <= MAX_DOCUMENT_ID_BYTES && !value.includes("\u0000"),
  );
// No byte limit: an oversized stored ID must reach the send-time check that quarantines it as invalid_id; rejecting
// it here would fail every drain.
const storedDocumentIdSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\u0000"));
const deliveryKeySchema = z.object({
  targetId: uuidSchema,
  documentId: storedDocumentIdSchema,
  intentId: uuidSchema,
});
const leaseMsSchema = z.number().int().min(1).max(MAX_LEASE_MS);
const revisionSchema = z.number().int().min(1).max(MAX_REVISION);
const delayMsSchema = z.number().int().min(0).max(MAX_DELAY_MS);

const jsonBytes = (value: JsonValue): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const stableCodeSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/);
const deliveryErrorSchema = z
  .object({ class: stableCodeSchema })
  .catchall(jsonValueSchema)
  .refine((value) => jsonBytes(value) <= MAX_ERROR_JSON_BYTES);

const claimInputSchema = z.object({
  targetIds: z.array(uuidSchema).max(MAX_BATCH).readonly(),
  limit: z.number().int().min(1).max(MAX_BATCH),
  leaseToken: uuidSchema,
  leaseMs: leaseMsSchema,
});
// The statement casts count(*) to integer so pg returns a number, not a string.
const claimBatchRowSchema = claimRowSchema.extend({
  candidates: z.number().int().min(0),
});
const heartbeatInputSchema = z.object({
  leaseToken: uuidSchema,
  deliveries: z.array(deliveryKeySchema).max(MAX_BATCH).readonly(),
  leaseMs: leaseMsSchema,
});
const acknowledgeInputSchema = z.object({
  leaseToken: uuidSchema,
  items: z
    .array(deliveryKeySchema.extend({ materializedRevision: revisionSchema }))
    .max(MAX_BATCH)
    .readonly(),
});
const readLedgerInputSchema = z.object({
  namespace: z.string().min(1),
  definition: z.string().min(1),
  documentIds: z.array(storedDocumentIdSchema).max(MAX_BATCH).readonly(),
});
const classifyFailuresInputSchema = z.object({
  leaseToken: uuidSchema,
  items: z
    .array(
      deliveryKeySchema.extend({
        materializedRevision: revisionSchema,
        mode: z.enum(["retry", "poison"]),
        delayMs: delayMsSchema,
        error: deliveryErrorSchema,
      }),
    )
    .max(MAX_BATCH)
    .readonly(),
  maxRetryAttempts: z.number().int().min(1).max(2_147_483_647),
  maxRetryAgeMs: z.number().int().min(1).max(MAX_REVISION),
});
const releaseInputSchema = z.object({
  leaseToken: uuidSchema,
  items: z
    .array(
      deliveryKeySchema.extend({
        revision: revisionSchema,
        delayMs: delayMsSchema,
        error: deliveryErrorSchema.nullable(),
      }),
    )
    .max(MAX_BATCH)
    .readonly(),
});
const pauseTargetInputSchema = z.object({
  targetId: uuidSchema,
  reason: z.strictObject({
    class: z.enum(["revision_divergence", "write_alias_missing"]),
    documents: z
      .array(
        z.strictObject({
          id: documentIdSchema,
          indexed: z.number().int().min(0).max(MAX_REVISION),
          ledger: z.number().int().min(0).max(MAX_REVISION),
        }),
      )
      .max(MAX_PAUSE_DOCUMENTS)
      .readonly()
      .optional(),
  }),
});

type StatementId =
  | "listClaimableTargets"
  | "listBoundTargets"
  | "claim"
  | "heartbeat"
  | "acknowledge"
  | "listLeasedByToken"
  | "readLedger"
  | "classifyFailures"
  | "release"
  | "pauseTarget"
  | "checkTargetEligibility";

function invalidInput(operation: string, issue: z.core.$ZodIssue | undefined) {
  const field = (issue?.path ?? []).map(String).join(".").slice(0, 120) || "input";
  return new SearchConfigurationError(
    { key: "delivery.invalidInput", params: { operation, field } },
    {
      details: {
        reason: "invalid-delivery-input",
        operation,
        field,
        issue: issue?.code ?? "unknown",
      },
    },
  );
}

function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  operation: string,
  input: z.input<Schema>,
): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidInput(operation, parsed.error.issues[0]);
  return parsed.data;
}

function invalidRow(statementId: StatementId): SearchSchemaVersionMismatch {
  return new SearchSchemaVersionMismatch(
    { key: "delivery.invalidRow", params: { statement: statementId } },
    { details: { reason: "invalid-row", statement: statementId } },
  );
}

function parseRows<Schema extends z.ZodType>(
  schema: Schema,
  statementId: StatementId,
  rows: readonly unknown[],
): z.output<Schema>[] {
  return rows.map((raw) => {
    const row = schema.safeParse(raw);
    if (!row.success) throw invalidRow(statementId);
    return row.data;
  });
}

function toKey(row: z.output<typeof deliveryKeyRowSchema>): DeliveryKey {
  return { targetId: row.target_id, documentId: row.document_id, intentId: row.intent_id };
}

function keyOf(key: DeliveryKey): string {
  return JSON.stringify([key.targetId, key.documentId, key.intentId]);
}

function rejectDuplicates(operation: string, keys: readonly DeliveryKey[]): void {
  const seen = new Set<string>();
  keys.forEach((key, position) => {
    const id = keyOf(key);
    if (seen.has(id)) {
      throw new SearchConfigurationError(
        { key: "delivery.invalidInput", params: { operation, field: String(position) } },
        { details: { reason: "duplicate-delivery", operation, position } },
      );
    }
    seen.add(id);
  });
}

function columns(keys: readonly DeliveryKey[]): [string[], string[], string[]] {
  return [
    keys.map((key) => key.targetId),
    keys.map((key) => key.documentId),
    keys.map((key) => key.intentId),
  ];
}

async function run(
  db: SqlExecutor,
  fragment: SqlFragment,
  values: readonly SqlValue[],
): Promise<readonly unknown[]> {
  const result = await executeSql(db, statement(fragment, values), "worker");
  return result.rows;
}

function jsonColumn(values: readonly (DeliveryError | null)[]): (string | null)[] {
  return values.map((value) => (value === null ? null : JSON.stringify(value)));
}

// Diagnostics must never make a pause fail on the 4096-byte CHECK, so trailing documents are dropped.
function fitPauseReason(reason: z.output<typeof pauseTargetInputSchema>["reason"]): PauseReason {
  if (reason.documents === undefined) return { class: reason.class };
  const documents = [...reason.documents];
  while (
    documents.length > 0 &&
    jsonBytes({ class: reason.class, documents }) > MAX_PAUSE_REASON_JSON_BYTES
  ) {
    documents.pop();
  }
  return { class: reason.class, documents };
}

function ineligibleReason(
  row: z.output<typeof targetEligibilityRowSchema>,
): TargetIneligibleReason | null {
  if (row.state !== "active") return "target-not-active";
  if (!row.write_enabled) return "write-disabled";
  if (row.capture_mode !== "active") return "capture-suspended";
  if (row.capture_epoch !== row.current_capture_epoch) return "capture-epoch-behind";
  return null;
}

export function createDeliveryStore(options: { schema: string }): DeliveryStore {
  const schemaFragment = schemaIdentifier(options.schema);
  const statements = renderDeliveryStatements(schemaFragment);

  const leasedBy = async (db: SqlExecutor, leaseToken: string): Promise<DeliveryKey[]> => {
    const token = parseInput(uuidSchema, "leasedBy", leaseToken);
    const rows = await run(db, statements.listLeasedByToken, [token]);
    return parseRows(deliveryKeyRowSchema, "listLeasedByToken", rows).map(toKey);
  };

  const claimBatch = async (db: SqlExecutor, input: ClaimInput): Promise<ClaimBatch> => {
    const parsed = parseInput(claimInputSchema, "claim", input);
    if (parsed.targetIds.length === 0) return { rows: [], candidates: 0 };
    const raw = await run(db, statements.claim, [
      [...new Set(parsed.targetIds)],
      parsed.limit,
      parsed.leaseToken,
      parsed.leaseMs,
    ]);
    const parsedRows = parseRows(claimBatchRowSchema, "claim", raw);
    return {
      rows: parsedRows.map((row) => ({
        ...toKey(row),
        claimedRevision: row.claimed_revision,
        attempts: row.attempts,
        failureRevision: row.failure_revision,
      })),
      candidates: parsedRows[0]?.candidates ?? 0,
    };
  };

  return Object.freeze({
    schema: options.schema,

    async listBoundTargets(db, input) {
      const namespace = parseInput(z.string().min(1), "listBoundTargets", input.namespace);
      const interval = parseInput(
        z.number().int().min(1).max(MAX_LEASE_MS),
        "listBoundTargets",
        input.fenceRenewIntervalMs,
      );
      const statement = input.systemIdentifierReadable
        ? statements.listBoundTargets
        : statements.listBoundTargetsWithoutSystemIdentifier;
      const rows = parseRows(
        boundRowSchema,
        "listBoundTargets",
        await run(db, statement, [namespace, input.instanceName, interval]),
      );
      const first = rows[0];
      if (first === undefined) throw invalidRow("listBoundTargets");
      const targets: BoundTarget[] = [];
      for (const row of rows) {
        if (row.target_id === null) continue;
        const target = claimableTargetRowSchema.safeParse(row);
        if (
          !target.success ||
          row.fence_epoch === null ||
          row.fence_lost === null ||
          row.fence_renewal_due === null
        ) {
          throw invalidRow("listBoundTargets");
        }
        targets.push({
          targetId: target.data.target_id,
          definition: target.data.definition,
          fingerprint: target.data.fingerprint,
          hashVersion: target.data.hash_version,
          physicalIndex: target.data.physical_index,
          writeAlias: target.data.write_alias,
          captureEpoch: target.data.capture_epoch,
          fence: {
            epoch: row.fence_epoch,
            nonce: row.fence_nonce,
            pendingAgeMs: row.fence_pending_age_ms,
            lost: row.fence_lost,
            renewalDue: row.fence_renewal_due,
          },
        });
      }
      return {
        binding: {
          storeId: first.store_id,
          originRecorded: first.origin_recorded,
          originMatches: first.origin_matches,
          instanceMatches: first.instance_matches,
          systemIdentifierReadable: input.systemIdentifierReadable,
        },
        targets,
      };
    },

    async listClaimableTargets(db, namespace) {
      const parsed = parseInput(z.string().min(1), "listClaimableTargets", namespace);
      const rows = await run(db, statements.listClaimableTargets, [parsed]);
      return parseRows(claimableTargetRowSchema, "listClaimableTargets", rows).map((row) => ({
        targetId: row.target_id,
        definition: row.definition,
        fingerprint: row.fingerprint,
        hashVersion: row.hash_version,
        physicalIndex: row.physical_index,
        writeAlias: row.write_alias,
        captureEpoch: row.capture_epoch,
      }));
    },

    async claim(db, input) {
      return (await claimBatch(db, input)).rows;
    },

    claimBatch,

    async heartbeat(db, input) {
      const parsed = parseInput(heartbeatInputSchema, "heartbeat", input);
      rejectDuplicates("heartbeat", parsed.deliveries);
      if (parsed.deliveries.length === 0) return [];
      const rows = await run(db, statements.heartbeat, [
        parsed.leaseToken,
        ...columns(parsed.deliveries),
        parsed.leaseMs,
      ]);
      return parseRows(deliveryKeyRowSchema, "heartbeat", rows).map(toKey);
    },

    async acknowledge(db, input) {
      const parsed = parseInput(acknowledgeInputSchema, "acknowledge", input);
      rejectDuplicates("acknowledge", parsed.items);
      if (parsed.items.length === 0) return [];
      const rows = await run(db, statements.acknowledge, [
        parsed.leaseToken,
        ...columns(parsed.items),
        parsed.items.map((item) => item.materializedRevision),
      ]);
      return parseRows(acknowledgeRowSchema, "acknowledge", rows).map((row) => ({
        ...toKey(row),
        outcome: row.outcome,
      }));
    },

    leasedBy,

    async classifyUnreturned(db, leaseToken, requested, returned) {
      const answered = new Set(returned.map(keyOf));
      const missing = requested
        .filter((key) => !answered.has(keyOf(key)))
        .map(({ targetId, documentId, intentId }) => ({ targetId, documentId, intentId }));
      if (missing.length === 0) return { leaseLost: [], skippedLocked: [] };
      const stillHeld = new Set((await leasedBy(db, leaseToken)).map(keyOf));
      return {
        leaseLost: missing.filter((key) => !stillHeld.has(keyOf(key))),
        skippedLocked: missing.filter((key) => stillHeld.has(keyOf(key))),
      };
    },

    async readLedger(db, input) {
      const parsed = parseInput(readLedgerInputSchema, "readLedger", input);
      if (parsed.documentIds.length === 0) return [];
      const rows = await run(db, statements.readLedger, [
        parsed.namespace,
        parsed.definition,
        [...new Set(parsed.documentIds)],
      ]);
      return parseRows(ledgerRowSchema, "readLedger", rows).map((row) => ({
        documentId: row.document_id,
        revision: row.revision,
      }));
    },

    async classifyFailures(db, input) {
      const parsed = parseInput(classifyFailuresInputSchema, "classifyFailures", input);
      rejectDuplicates("classifyFailures", parsed.items);
      if (parsed.items.length === 0) return [];
      const rows = await run(db, statements.classifyFailures, [
        parsed.leaseToken,
        ...columns(parsed.items),
        parsed.items.map((item) => item.materializedRevision),
        parsed.items.map((item) => item.mode),
        parsed.items.map((item) => item.delayMs),
        jsonColumn(parsed.items.map((item) => item.error)),
        parsed.maxRetryAttempts,
        parsed.maxRetryAgeMs,
      ]);
      return parseRows(classifyRowSchema, "classifyFailures", rows).map((row) => ({
        ...toKey(row),
        outcome: row.outcome,
        attempts: row.attempts,
        retryAgeMs: row.retry_age_ms,
      }));
    },

    async release(db, input) {
      const parsed = parseInput(releaseInputSchema, "release", input);
      rejectDuplicates("release", parsed.items);
      if (parsed.items.length === 0) return [];
      const rows = await run(db, statements.release, [
        parsed.leaseToken,
        ...columns(parsed.items),
        parsed.items.map((item) => item.revision),
        parsed.items.map((item) => item.delayMs),
        jsonColumn(parsed.items.map((item) => item.error)),
      ]);
      return parseRows(deliveryKeyRowSchema, "release", rows).map(toKey);
    },

    async pauseTarget(db, input) {
      const parsed = parseInput(pauseTargetInputSchema, "pauseTarget", input);
      const rows = await run(db, statements.pauseTarget, [
        parsed.targetId,
        JSON.stringify(fitPauseReason(parsed.reason)),
      ]);
      return parseRows(pausedTargetRowSchema, "pauseTarget", rows).length === 1;
    },

    async checkTargetEligibility(db, targetId) {
      const parsed = parseInput(uuidSchema, "checkTargetEligibility", targetId);
      const [row] = parseRows(
        targetEligibilityRowSchema,
        "checkTargetEligibility",
        await run(db, statements.checkTargetEligibility, [parsed]),
      );
      if (row === undefined) return { eligible: false, reason: "target-missing", target: null };
      const reason = ineligibleReason(row);
      return {
        eligible: reason === null,
        reason,
        target: {
          state: row.state,
          writeEnabled: row.write_enabled,
          captureEpoch: row.capture_epoch,
          currentCaptureEpoch: row.current_capture_epoch,
          captureMode: row.capture_mode,
        },
      };
    },
  } satisfies DeliveryStore);
}
