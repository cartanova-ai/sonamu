import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { z } from "zod";

import { type SearchRequester } from "../client/search-client";
import {
  SearchAdminBusy,
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
} from "../errors";
import { instanceNameSchema } from "../postgres/rows";
import {
  qualified,
  schemaIdentifier,
  sql,
  type SqlFragment,
  type SqlResult,
  statement,
} from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { readSystemIdentifier } from "../postgres/store-binding";
import { type AdminStore, invalidAdminRow, singleRow } from "./admin-lease";
import { captureStatementsFor } from "./capture-mode";
import { listFenceCandidates, takeOverFences } from "./fences";
import {
  adminContextSchema,
  adminUuidSchema,
  residualIntentRowSchema,
  residualRuntimeKeyRowSchema,
} from "./rows";

type AdminAudit = z.input<typeof adminContextSchema>;

interface OwnershipStatements {
  readonly findAdoptionReplay: SqlFragment;
  readonly lockStoreRow: SqlFragment;
  readonly lockAllIndexes: SqlFragment;
  readonly seizeAllLeases: SqlFragment;
  readonly replaceStoreIdentity: SqlFragment;
  readonly suspendAllIndexes: SqlFragment;
  readonly detachReadHeads: SqlFragment;
  readonly detachInheritedTargets: SqlFragment;
  readonly failAllOpenBuilds: SqlFragment;
  readonly deleteAllFences: SqlFragment;
  readonly deleteWorkerHeartbeats: SqlFragment;
  readonly insertAdoptionAudit: SqlFragment;
  readonly listDetachedTargets: SqlFragment;
  readonly lockAllControls: SqlFragment;
  readonly acquireAllLeases: SqlFragment;
  readonly releaseAllLeases: SqlFragment;
  readonly recordConfirmedOrigin: SqlFragment;
  readonly insertConfirmationAudit: SqlFragment;
}

function renderOwnershipStatements(schema: string): OwnershipStatements {
  const s = schemaIdentifier(schema);
  const store = qualified(s, "store");
  const indexes = qualified(s, "indexes");
  const controls = qualified(s, "admin_controls");
  const operations = qualified(s, "admin_operations");
  const readHeads = qualified(s, "read_heads");
  const targets = qualified(s, "targets");
  const builds = qualified(s, "builds");
  const fences = qualified(s, "target_fences");
  const heartbeats = qualified(s, "worker_heartbeats");
  return {
    findAdoptionReplay: sql`SELECT count(*) > 0 AS replay FROM ${operations}
WHERE operation_id = $1 AND kind = 'adopt-copied-store' AND outcome = 'succeeded';`,
    lockStoreRow: sql`SELECT store_id FROM ${store} FOR UPDATE;`,
    lockAllIndexes: sql`SELECT namespace, definition FROM ${indexes} ORDER BY namespace, definition FOR UPDATE;`,
    seizeAllLeases: sql`UPDATE ${controls}
SET operation_id = $1, operation_kind = 'adopt-copied-store', actor = $2, lease_token = $3::uuid,
    lease_expires_at = clock_timestamp() + ($4::bigint * interval '1 millisecond'),
    acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp();`,
    replaceStoreIdentity: sql`UPDATE ${store}
SET store_id = gen_random_uuid(), origin_system_identifier = $1::text,
    origin_database_oid = (SELECT oid::bigint FROM pg_database WHERE datname = current_database()),
    origin_database_name = current_database()::text, origin_recorded_at = clock_timestamp(), instance_name = $2::text
RETURNING store_id;`,
    suspendAllIndexes: sql`UPDATE ${indexes}
SET store_id = (SELECT store_id FROM ${store}), capture_mode = 'suspended', capture_epoch = capture_epoch + 1,
    generation = generation + 1, updated_at = clock_timestamp();`,
    detachReadHeads: sql`UPDATE ${readHeads}
SET target_id = NULL, rebuild_required = true, generation = generation + 1, updated_at = clock_timestamp();`,
    detachInheritedTargets: sql`UPDATE ${targets}
SET state = 'detached', write_enabled = false, detached_at = clock_timestamp()
WHERE state NOT IN ('retired', 'detached')
RETURNING target_id, namespace, definition, physical_index;`,
    failAllOpenBuilds: sql`UPDATE ${builds}
SET phase = 'failed', failure = '{"code":"store_adopted"}'::jsonb, closed_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving');`,
    deleteAllFences: sql`DELETE FROM ${fences};`,
    // Runs after the commit; a live worker writes its row again on its next heartbeat.
    deleteWorkerHeartbeats: sql`DELETE FROM ${heartbeats};`,
    insertAdoptionAudit: sql`INSERT INTO ${operations} (operation_id, namespace, definition, kind, actor, reason, outcome, detail)
SELECT $1, i.namespace, i.definition, 'adopt-copied-store', $2, $3, 'succeeded', $4::jsonb FROM ${indexes} i;`,
    listDetachedTargets: sql`SELECT target_id, namespace, definition, physical_index FROM ${targets}
WHERE state = 'detached' ORDER BY detached_at, target_id;`,
    lockAllControls: sql`SELECT namespace, definition, operation_kind,
       (lease_token IS NOT NULL AND lease_expires_at > clock_timestamp() AND operation_id IS DISTINCT FROM $1) AS held
FROM ${controls} ORDER BY namespace, definition FOR UPDATE;`,
    acquireAllLeases: sql`UPDATE ${controls}
SET operation_id = $1, operation_kind = 'confirm-store-ownership', actor = $2, lease_token = $3::uuid,
    lease_expires_at = clock_timestamp() + ($4::bigint * interval '1 millisecond'),
    acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp();`,
    releaseAllLeases: sql`UPDATE ${controls}
SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = clock_timestamp()
WHERE lease_token = $1::uuid;`,
    recordConfirmedOrigin: sql`UPDATE ${store}
SET origin_system_identifier = $1::text,
    origin_database_oid = (SELECT oid::bigint FROM pg_database WHERE datname = current_database()),
    origin_database_name = current_database()::text, origin_recorded_at = clock_timestamp(),
    instance_name = COALESCE($2::text, instance_name)
RETURNING store_id;`,
    insertConfirmationAudit: sql`INSERT INTO ${operations} (operation_id, namespace, definition, kind, actor, reason, outcome, detail)
SELECT $1, i.namespace, i.definition, 'confirm-store-ownership', $2, $3, 'succeeded', $4::jsonb FROM ${indexes} i;`,
  };
}

const statementCache = createSchemaStatementCache(renderOwnershipStatements);

export function ownershipStatementsFor(schema: string): OwnershipStatements {
  return statementCache.get(schema);
}

const storeIdRowSchema = z.object({ store_id: adminUuidSchema });
const replayRowSchema = z.object({ replay: z.boolean() });
const detachedRowSchema = z.object({
  target_id: adminUuidSchema,
  namespace: z.string(),
  definition: z.string(),
  physical_index: z.string(),
});
const controlLockRowSchema = z.object({
  namespace: z.string(),
  definition: z.string(),
  operation_kind: z.string().nullable(),
  held: z.boolean(),
});

const adoptInputSchema = z.strictObject({
  confirmCopy: z.literal(true),
  instanceName: instanceNameSchema.optional(),
});
const confirmInputSchema = z.strictObject({
  confirmSoleOwner: z.literal(true),
  instanceName: instanceNameSchema.optional(),
});

export interface OwnershipContext {
  readonly store: AdminStore;
  readonly instanceName: string | undefined;
  readonly requester?: SearchRequester;
}

export interface DetachedTarget {
  targetId: string;
  logicalKey: string;
  physicalIndex: string;
}

// adoptCopiedStore is one transaction: lock the store row, then every index row in name order, seize every lease,
// replace store_id and origin, suspend capture, detach inherited targets and read heads, fail open builds and delete
// fences; no remote command is sent. After the commit it releases the leases and purges the detached targets' rows.
// confirmStoreOwnership acquires every lease, records the origin again and takes over fences while still holding them.
// Both apply to the whole store (schema), not one namespace.

export interface AdoptCopiedStoreResult {
  storeId: string;
  detachedTargets: readonly DetachedTarget[];
}

export interface ConfirmStoreOwnershipResult {
  storeId: string;
  fencedTargets: readonly { targetId: string; epoch: number }[];
}

// admin_operations.detail has an 8192-byte CHECK; beyond this only the count is kept.
const AUDITED_TARGET_IDS = 100;
const CLEANUP_BATCH = 500;

function parseAudit(audit: AdminAudit): z.infer<typeof adminContextSchema> {
  const parsed = adminContextSchema.safeParse(audit);
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "audit");
    throw new SearchConfigurationError(
      { key: "admin.invalidOperation", params: { path } },
      { details: { reason: "invalid-admin-operation", path } },
    );
  }
  return parsed.data;
}

function effectiveInstanceName(
  context: OwnershipContext,
  requested: string | undefined,
): string | null {
  const configured = context.instanceName;
  if (requested !== undefined && configured !== undefined && requested !== configured) {
    throw new SearchConfigurationError(
      { key: "admin.instanceNameConflict" },
      { details: { reason: "instance-name-conflict" } },
    );
  }
  return requested ?? configured ?? null;
}

function parseOwnershipInput<Schema extends z.ZodType, Input>(
  schema: Schema,
  input: Input,
  flag: "confirmCopy" | "confirmSoleOwner",
): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const path = String(parsed.error.issues[0]?.path[0] ?? "input");
  if (path === flag || path === "input") {
    throw flag === "confirmCopy"
      ? new SearchAdminPreconditionFailed(
          { key: "admin.copyNotConfirmed" },
          { details: { reason: "copy-not-confirmed" } },
        )
      : new SearchAdminPreconditionFailed(
          { key: "admin.ownershipNotConfirmed" },
          { details: { reason: "ownership-not-confirmed" } },
        );
  }
  throw new SearchConfigurationError(
    { key: "admin.invalidOwnershipInput", params: { path: path.slice(0, 40) } },
    { details: { reason: "invalid-ownership-input", path: path.slice(0, 40) } },
  );
}

function toDetached(result: SqlResult, statementId: string): DetachedTarget[] {
  const rows = z.array(detachedRowSchema).safeParse(result.rows);
  if (!rows.success) throw invalidAdminRow(statementId);
  return rows.data.map((row) => ({
    targetId: row.target_id,
    logicalKey: row.definition,
    physicalIndex: row.physical_index,
  }));
}

async function releaseStoreLeases(store: AdminStore, token: string): Promise<void> {
  const q = ownershipStatementsFor(store.schema);
  await store.execute(store.primary(), statement(q.releaseAllLeases, [token])).catch(() => null);
}

// A detached target is terminal, so nothing else writes its rows and purging without a lease fence cannot race.
async function purgeDetachedTarget(store: AdminStore, targetId: string): Promise<void> {
  const q = captureStatementsFor(store.schema);
  let after = "";
  for (;;) {
    const next = await store.transaction(async (trx: Knex.Transaction) => {
      const rows = (
        await store.execute(trx, statement(q.lockResidualIntents, [targetId, CLEANUP_BATCH, after]))
      ).rows.map((raw) => {
        const row = residualIntentRowSchema.safeParse(raw);
        if (!row.success) throw invalidAdminRow("lockResidualIntents");
        return row.data;
      });
      const last = rows.at(-1);
      if (last === undefined) return null;
      const documents = rows.map((row) => row.document_id);
      const intents = rows.map((row) => row.intent_id);
      await store.execute(trx, statement(q.deleteResidualRuntime, [targetId, documents, intents]));
      await store.execute(trx, statement(q.deleteResidualIntents, [targetId, documents, intents]));
      return last.document_id;
    });
    if (next === null) break;
    after = next;
  }
  let orphan = { documentId: "", intentId: "00000000-0000-0000-0000-000000000000" };
  for (;;) {
    const keys = await store.transaction(async (trx: Knex.Transaction) =>
      (
        await store.execute(
          trx,
          statement(q.deleteOrphanRuntime, [
            targetId,
            CLEANUP_BATCH,
            orphan.documentId,
            orphan.intentId,
          ]),
        )
      ).rows.map((raw) => {
        const row = residualRuntimeKeyRowSchema.safeParse(raw);
        if (!row.success) throw invalidAdminRow("deleteOrphanRuntime");
        return { documentId: row.data.document_id, intentId: row.data.intent_id };
      }),
    );
    if (keys.length === 0) break;
    // RETURNING has no order, so the largest key in byte order becomes the next keyset.
    for (const key of keys) {
      const order = Buffer.compare(
        Buffer.from(key.documentId, "utf8"),
        Buffer.from(orphan.documentId, "utf8"),
      );
      if (order > 0 || (order === 0 && key.intentId > orphan.intentId)) orphan = key;
    }
  }
}

export async function adoptCopiedStore(
  context: OwnershipContext,
  input: { confirmCopy: true; instanceName?: string },
  audit: AdminAudit,
): Promise<AdoptCopiedStoreResult> {
  const parsed = parseOwnershipInput(adoptInputSchema, input, "confirmCopy");
  const auditContext = parseAudit(audit);
  const instanceName = effectiveInstanceName(context, parsed.instanceName);
  const { store } = context;
  const q = ownershipStatementsFor(store.schema);
  const systemIdentifier = await readSystemIdentifier(store.primary(), store.schema, "admin");
  const token = randomUUID();
  let seized = false;
  try {
    const outcome = await store.transaction(async (trx: Knex.Transaction) => {
      const before = singleRow(
        await store.execute(trx, statement(q.lockStoreRow)),
        storeIdRowSchema,
        "lockStoreRow",
      );
      if (before === undefined) throw invalidAdminRow("lockStoreRow");
      const replay = singleRow(
        await store.execute(trx, statement(q.findAdoptionReplay, [auditContext.operationId])),
        replayRowSchema,
        "findAdoptionReplay",
      );
      if (replay?.replay === true) {
        const detached = toDetached(
          await store.execute(trx, statement(q.listDetachedTargets)),
          "listDetachedTargets",
        );
        return { storeId: before.store_id, detachedTargets: detached };
      }
      await store.execute(trx, statement(q.lockAllIndexes));
      await store.execute(
        trx,
        statement(q.seizeAllLeases, [
          auditContext.operationId,
          auditContext.actor,
          token,
          store.timeouts.adminLeaseMs,
        ]),
      );
      seized = true;
      const adopted = singleRow(
        await store.execute(
          trx,
          statement(q.replaceStoreIdentity, [systemIdentifier, instanceName]),
        ),
        storeIdRowSchema,
        "replaceStoreIdentity",
      );
      if (adopted === undefined) throw invalidAdminRow("replaceStoreIdentity");
      await store.execute(trx, statement(q.suspendAllIndexes));
      await store.execute(trx, statement(q.detachReadHeads));
      const detached = toDetached(
        await store.execute(trx, statement(q.detachInheritedTargets)),
        "detachInheritedTargets",
      );
      const failedBuilds = await store.execute(trx, statement(q.failAllOpenBuilds));
      await store.execute(trx, statement(q.deleteAllFences));
      const detail = {
        step: "adopt-copied-store",
        oldStoreId: before.store_id,
        newStoreId: adopted.store_id,
        detachedTargets: detached.length,
        failedBuilds: failedBuilds.rowCount,
        systemIdentifierRecorded: systemIdentifier !== null,
        instanceNameRecorded: instanceName !== null,
        detachedTargetIds:
          detached.length <= AUDITED_TARGET_IDS ? detached.map((target) => target.targetId) : null,
      };
      await store.execute(
        trx,
        statement(q.insertAdoptionAudit, [
          auditContext.operationId,
          auditContext.actor,
          auditContext.reason,
          JSON.stringify(detail),
        ]),
      );
      return { storeId: adopted.store_id, detachedTargets: detached };
    });
    if (seized) await releaseStoreLeases(store, token);
    seized = false;
    for (const target of outcome.detachedTargets) {
      await purgeDetachedTarget(store, target.targetId);
    }
    await store.execute(store.primary(), statement(q.deleteWorkerHeartbeats));
    return outcome;
  } finally {
    // Failed before the commit: the seizure rolled back too, so this token matches no row.
    if (seized) await releaseStoreLeases(store, token);
  }
}

export async function confirmStoreOwnership(
  context: OwnershipContext,
  input: { confirmSoleOwner: true; instanceName?: string },
  audit: AdminAudit,
): Promise<ConfirmStoreOwnershipResult> {
  const parsed = parseOwnershipInput(confirmInputSchema, input, "confirmSoleOwner");
  const auditContext = parseAudit(audit);
  const instanceName = effectiveInstanceName(context, parsed.instanceName);
  const { store } = context;
  const q = ownershipStatementsFor(store.schema);
  const { requester } = context;
  if (requester === undefined && (await listFenceCandidates(store)).length > 0) {
    throw new SearchAdminPreconditionFailed(
      { key: "admin.clientNotConfigured", params: { operation: "confirmStoreOwnership" } },
      {
        details: { reason: "search-client-not-configured", operation: "confirmStoreOwnership" },
      },
    );
  }
  const systemIdentifier = await readSystemIdentifier(store.primary(), store.schema, "admin");
  const token = randomUUID();
  let acquired = false;
  try {
    const storeId = await store.transaction(async (trx: Knex.Transaction) => {
      if (
        singleRow(
          await store.execute(trx, statement(q.lockStoreRow)),
          storeIdRowSchema,
          "lockStoreRow",
        ) === undefined
      ) {
        throw invalidAdminRow("lockStoreRow");
      }
      const controls = (
        await store.execute(trx, statement(q.lockAllControls, [auditContext.operationId]))
      ).rows.map((raw) => {
        const row = controlLockRowSchema.safeParse(raw);
        if (!row.success) throw invalidAdminRow("lockAllControls");
        return row.data;
      });
      const held = controls.find((row) => row.held);
      if (held !== undefined) {
        throw new SearchAdminBusy(
          { key: "admin.leaseBusy", params: { logicalKey: held.definition } },
          {
            details: {
              reason: "lease-held",
              logicalKey: held.definition,
              holderKind: held.operation_kind,
            },
          },
        );
      }
      await store.execute(
        trx,
        statement(q.acquireAllLeases, [
          auditContext.operationId,
          auditContext.actor,
          token,
          store.timeouts.adminLeaseMs,
        ]),
      );
      acquired = true;
      const confirmed = singleRow(
        await store.execute(
          trx,
          statement(q.recordConfirmedOrigin, [systemIdentifier, instanceName]),
        ),
        storeIdRowSchema,
        "recordConfirmedOrigin",
      );
      if (confirmed === undefined) throw invalidAdminRow("recordConfirmedOrigin");
      await store.execute(
        trx,
        statement(q.insertConfirmationAudit, [
          auditContext.operationId,
          auditContext.actor,
          auditContext.reason,
          JSON.stringify({
            step: "confirm-store-ownership",
            storeId: confirmed.store_id,
            systemIdentifierRecorded: systemIdentifier !== null,
            instanceNameRecorded: instanceName !== null,
          }),
        ]),
      );
      return confirmed.store_id;
    });
    // On failure the origin record stays, and calling again with the same input continues the takeover.
    const fencedTargets =
      requester === undefined
        ? []
        : await takeOverFences(store, requester, await listFenceCandidates(store));
    return { storeId, fencedTargets };
  } finally {
    if (acquired) await releaseStoreLeases(store, token);
  }
}
