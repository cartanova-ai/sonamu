import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { type z } from "zod";

import {
  describeResponseFailure,
  readEngineErrorType,
  toSearchError,
} from "../client/error-normalization";
import { type SearchHttpResponse, type SearchRequester } from "../client/search-client";
import { type DefinedSearch } from "../definition/define-search";
import { composeIndexMappings, readSearchIndexMeta } from "../definition/envelope";
import { buildPhysicalIndexName, buildWriteAliasName, isLogicalKey } from "../definition/names";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  type SearchError,
  type SearchErrorDetail,
  SearchNotConfigured,
  SearchUnavailable,
} from "../errors";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { remoteStoreMismatch, requireStoreBinding } from "../postgres/store-binding";
import {
  AdminOperation,
  type AdminStore,
  invalidAdminRow,
  parseOperationRequest,
  runAdminOperation,
  singleRow,
} from "./admin-lease";
import { type BuildContext, type BuildHandle, buildStatementsFor, readBuild } from "./builds";
import { confirmDeselection, cutoverStatementsFor } from "./cutover";
import { adminFenceStoreFor, verifyFence } from "./fences";
import {
  attemptRemoteCreate,
  checkPlan,
  compareMeta,
  type CreatePlan,
  leaseBoundRequester,
  type RemoteIdentity,
} from "./remote-create";
import { indexMetaSchema } from "./remote-schemas";
import {
  type adminContextSchema,
  aliasRemovedRowSchema,
  captureEpochRowSchema,
  generationRowSchema,
  indexDeletedRowSchema,
  leaseTokenRowSchema,
  openBuildLookupRowSchema,
  openBuildOfTargetRowSchema,
  quiescedRowSchema,
  readHeadRowSchema,
  residualIntentRowSchema,
  residualRuntimeKeyRowSchema,
  retiredRowSchema,
  retirementGraceRowSchema,
  retirementLockRowSchema,
  retiringRowSchema,
  suspendedHeadRowSchema,
  targetIdArgumentSchema,
} from "./rows";
import {
  readPendingResumeTargets,
  readPlanState,
  readRetirementState,
  recordTargetIntent,
  registerResume,
  type RetirementStateRow,
} from "./targets";

// Suspend runs under the exclusive barrier: seize the running lease, lock the read head, then suspend capture, mark
// rebuild_required, disable writes, deselect the serving target and fail open builds in one commit; confirmDeselection
// follows the commit. Retirement resumes where it stopped, renews the lease right before every remote command and
// records each step in its own fenced transaction: begin (exclusive barrier) → DELETE write alias → record → wait for
// quiescence → check _meta and fence → DELETE index → record → purge batches → retired. The alias goes first so late
// bulks fail with require_alias, and nothing recreates a retired identity's alias or index.

type AdminAudit = z.input<typeof adminContextSchema>;
type DetailRecord = Record<string, SearchErrorDetail>;

export interface CaptureModeContext extends BuildContext {
  readonly workerBounds: { readonly leaseDurationMs: number; readonly requestTimeoutMs: number };
}

interface CaptureStatements {
  readonly seizeLease: SqlFragment;
  readonly suspendIndexCapture: SqlFragment;
  readonly markRebuildRequired: SqlFragment;
  readonly disableTargetWrites: SqlFragment;
  readonly deselectServingTarget: SqlFragment;
  readonly failOpenBuilds: SqlFragment;
  readonly readRetirementGrace: SqlFragment;
  readonly findOpenBuildOfTarget: SqlFragment;
  readonly lockTargetForRetirement: SqlFragment;
  readonly closeRollbackWindow: SqlFragment;
  readonly markTargetRetiring: SqlFragment;
  readonly bumpIndexGeneration: SqlFragment;
  readonly recordAliasRemoved: SqlFragment;
  readonly checkRetirementQuiesced: SqlFragment;
  readonly recordIndexDeleted: SqlFragment;
  readonly lockResidualIntents: SqlFragment;
  readonly deleteResidualRuntime: SqlFragment;
  readonly deleteResidualIntents: SqlFragment;
  readonly deleteOrphanRuntime: SqlFragment;
  readonly markTargetRetired: SqlFragment;
}

function renderCaptureStatements(schema: string): CaptureStatements {
  const s = schemaIdentifier(schema);
  const indexes = qualified(s, "indexes");
  const controls = qualified(s, "admin_controls");
  const readHeads = qualified(s, "read_heads");
  const targets = qualified(s, "targets");
  const builds = qualified(s, "builds");
  const deliveries = qualified(s, "deliveries");
  const runtime = qualified(s, "delivery_runtime");
  return {
    // Takes over any running lease; run only under the exclusive barrier.
    seizeLease: sql`UPDATE ${controls} c
SET operation_id = $3, operation_kind = $4, actor = $5, lease_token = $6::uuid,
    lease_expires_at = clock_timestamp() + ($7::bigint * interval '1 millisecond'),
    acquired_at = clock_timestamp(), heartbeat_at = clock_timestamp()
WHERE c.namespace = $1 AND c.definition = $2
RETURNING c.lease_token;`,
    suspendIndexCapture: sql`UPDATE ${indexes} SET capture_mode = 'suspended', capture_epoch = capture_epoch + 1, generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND capture_mode = 'active'
RETURNING capture_epoch;`,
    markRebuildRequired: sql`UPDATE ${readHeads} SET rebuild_required = true, generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2
RETURNING target_id;`,
    disableTargetWrites: sql`UPDATE ${targets} SET write_enabled = false WHERE namespace = $1 AND definition = $2 AND write_enabled;`,
    deselectServingTarget: sql`UPDATE ${targets} SET deselected_at = COALESCE(deselected_at, clock_timestamp())
WHERE target_id = (SELECT target_id FROM ${readHeads} WHERE namespace = $1 AND definition = $2);`,
    failOpenBuilds: sql`UPDATE ${builds} SET phase = 'failed', failure = '{"code":"capture_epoch_invalidated"}'::jsonb, closed_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving');`,
    readRetirementGrace: sql`SELECT max_cursor_lifetime_ms + max_search_lifetime_ms + retirement_safety_margin_ms AS grace_ms
FROM ${readHeads} WHERE namespace = $1 AND definition = $2;`,
    // The namespace and key predicates ($2, $3) look redundant but let builds_one_open_idx serve this and
    // closeRollbackWindow.
    findOpenBuildOfTarget: sql`SELECT build_id, phase FROM ${builds}
WHERE namespace = $2 AND definition = $3 AND new_target_id = $1
  AND phase IN ('planned', 'created', 'backfilling', 'catching_up', 'serving');`,
    // $2 = cursor + search + margin from read_heads, in ms.
    lockTargetForRetirement: sql`SELECT state, remote_create_state, selected_at, deselected_at, deselect_confirmed_at,
       (deselected_at IS NULL AND selected_at IS NULL)
       OR (deselect_confirmed_at IS NOT NULL AND clock_timestamp() >= deselect_confirmed_at + ($2::bigint * interval '1 millisecond')) AS grace_elapsed
FROM ${targets} WHERE target_id = $1 FOR UPDATE;`,
    closeRollbackWindow: sql`UPDATE ${builds} SET phase = 'retired', closed_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE namespace = $2 AND definition = $3 AND old_target_id = $1 AND phase = 'serving';`,
    markTargetRetiring: sql`UPDATE ${targets} SET state = 'retiring', write_enabled = false, retiring_at = clock_timestamp()
WHERE target_id = $1 AND state IN ('creating', 'active', 'paused', 'failed')
  AND remote_create_state NOT IN ('in_flight', 'ambiguous')
RETURNING target_id;`,
    bumpIndexGeneration: sql`UPDATE ${indexes} SET generation = generation + 1, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2
RETURNING generation;`,
    recordAliasRemoved: sql`UPDATE ${targets} SET alias_removed_at = clock_timestamp()
WHERE target_id = $1 AND state = 'retiring' AND alias_removed_at IS NULL
RETURNING alias_removed_at;`,
    // $2 = leaseDurationMs + requestTimeoutMs. statement_timestamp() is fixed per statement, so it bounds the partial
    // expiry index scan; a lease alive at statement start counts as alive.
    checkRetirementQuiesced: sql`SELECT statement_timestamp() >= t.alias_removed_at + ($2::bigint * interval '1 millisecond')
       AND NOT EXISTS (SELECT 1 FROM ${runtime} r
                       WHERE r.target_id = t.target_id AND r.lease_expires_at > statement_timestamp()) AS quiesced
FROM ${targets} t WHERE t.target_id = $1;`,
    recordIndexDeleted: sql`UPDATE ${targets} SET index_deleted_at = clock_timestamp()
WHERE target_id = $1 AND state = 'retiring' AND alias_removed_at IS NOT NULL AND index_deleted_at IS NULL
RETURNING index_deleted_at;`,
    // The lock holds through the two deletes below. $3 is the previous batch's last document_id, so deleted rows
    // are not rescanned.
    lockResidualIntents: sql`SELECT target_id, document_id, intent_id FROM ${deliveries}
WHERE target_id = $1 AND document_id > $3 ORDER BY document_id LIMIT $2 FOR UPDATE SKIP LOCKED;`,
    deleteResidualRuntime: sql`DELETE FROM ${runtime} r
USING unnest($2::text[], $3::uuid[]) AS p(document_id, intent_id)
WHERE r.target_id = $1 AND r.document_id = p.document_id AND r.intent_id = p.intent_id;`,
    deleteResidualIntents: sql`DELETE FROM ${deliveries} d
USING unnest($2::text[], $3::uuid[]) AS p(document_id, intent_id)
WHERE d.target_id = $1 AND d.document_id = p.document_id AND d.intent_id = p.intent_id;`,
    deleteOrphanRuntime: sql`DELETE FROM ${runtime} r
WHERE (r.target_id, r.document_id, r.intent_id) IN (
  SELECT o.target_id, o.document_id, o.intent_id FROM ${runtime} o
  WHERE o.target_id = $1 AND (o.target_id, o.document_id, o.intent_id) > ($1, $3, $4::uuid)
    AND NOT EXISTS (SELECT 1 FROM ${deliveries} d
                    WHERE d.target_id = o.target_id AND d.document_id = o.document_id AND d.intent_id = o.intent_id)
  ORDER BY o.document_id, o.intent_id
  LIMIT $2 FOR UPDATE OF o SKIP LOCKED)
RETURNING r.document_id, r.intent_id;`,
    markTargetRetired: sql`UPDATE ${targets} t SET state = 'retired', retired_at = clock_timestamp()
WHERE t.target_id = $1 AND t.state = 'retiring' AND t.index_deleted_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ${deliveries} d WHERE d.target_id = t.target_id)
  AND NOT EXISTS (SELECT 1 FROM ${runtime} r WHERE r.target_id = t.target_id)
RETURNING retired_at;`,
  };
}

const statementCache = createSchemaStatementCache(renderCaptureStatements);

export function captureStatementsFor(schema: string): CaptureStatements {
  return statementCache.get(schema);
}

function invalidLogicalKey(logicalKey: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "names.invalidLogicalKey", params: { name: String(logicalKey).slice(0, 80) } },
    { details: { reason: "invalid-logical-key" } },
  );
}

function resumeRefused(
  logicalKey: string,
  reason: string,
  extra: DetailRecord = {},
): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.resumeRefused", params: { logicalKey, reason } },
    { details: { ...extra, reason, logicalKey } },
  );
}

function retirementRefused(
  targetId: string,
  reason: string,
  options: { retryable?: boolean; extra?: DetailRecord } = {},
): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.retirementRefused", params: { targetId, reason } },
    {
      retryable: options.retryable ?? false,
      details: { ...options.extra, reason, targetId },
    },
  );
}

function invalidRemoteResponse(operation: string): SearchUnavailable {
  return new SearchUnavailable(
    { key: "admin.invalidRemoteResponse", params: { operation } },
    { retryable: false, details: { reason: "invalid-remote-response", operation } },
  );
}

function targetDetached(targetId: string): SearchAdminPreconditionFailed {
  return new SearchAdminPreconditionFailed(
    { key: "admin.targetDetached", params: { targetId } },
    { details: { reason: "target-detached", targetId } },
  );
}

function engineError(response: SearchHttpResponse): SearchError {
  return toSearchError(describeResponseFailure(response.status, response.body));
}

export async function suspendCapture(
  context: CaptureModeContext,
  logicalKey: string,
  audit: AdminAudit,
): Promise<void> {
  if (!isLogicalKey(logicalKey)) throw invalidLogicalKey(logicalKey);
  const { store } = context;
  const request = parseOperationRequest({ logicalKey, kind: "suspend", ...audit });
  await requireStoreBinding(context.binding);
  const operation = new AdminOperation(store, request);
  const q = captureStatementsFor(store.schema);
  const lockReadHead = cutoverStatementsFor(store.schema).lockReadHead;
  const key = [store.namespace, logicalKey] as const;
  let preempted = false;
  try {
    const outcome = await store.transaction(async (trx) => {
      const barrier = await operation.lockBarrier(trx, "exclusive");
      if (barrier.capture_mode === "suspended") {
        await operation.audit(trx, {
          outcome: "succeeded",
          detail: { step: "suspend", noop: true, captureEpoch: barrier.capture_epoch },
        });
        return { noop: true as const };
      }
      preempted = true;
      const lease = singleRow(
        await store.execute(
          trx,
          statement(q.seizeLease, [
            ...key,
            request.operationId,
            request.kind,
            request.actor,
            operation.token,
            store.timeouts.adminLeaseMs,
          ]),
        ),
        leaseTokenRowSchema,
        "seizeLease",
      );
      if (lease === undefined) throw invalidAdminRow("seizeLease");
      const head = singleRow(
        await store.execute(trx, statement(lockReadHead, key)),
        readHeadRowSchema,
        "lockReadHead",
      );
      if (head === undefined) throw invalidAdminRow("lockReadHead");
      const epoch = singleRow(
        await store.execute(trx, statement(q.suspendIndexCapture, key)),
        captureEpochRowSchema,
        "suspendIndexCapture",
      );
      if (epoch === undefined) throw invalidAdminRow("suspendIndexCapture");
      const suspendedHead = singleRow(
        await store.execute(trx, statement(q.markRebuildRequired, key)),
        suspendedHeadRowSchema,
        "markRebuildRequired",
      );
      if (suspendedHead === undefined) throw invalidAdminRow("markRebuildRequired");
      const disabled = await store.execute(trx, statement(q.disableTargetWrites, key));
      await store.execute(trx, statement(q.deselectServingTarget, key));
      const failedBuilds = await store.execute(trx, statement(q.failOpenBuilds, key));
      await operation.audit(trx, {
        outcome: "succeeded",
        targetId: head.target_id,
        detail: {
          step: "suspend",
          captureEpoch: epoch.capture_epoch,
          disabledTargets: disabled.rowCount,
          failedBuilds: failedBuilds.rowCount,
        },
      });
      return { noop: false as const, deselected: head.target_id };
    });
    if (!outcome.noop && outcome.deselected !== null) {
      // Already committed: if this stamp fails, retirement stamps it first.
      await confirmDeselection(store, outcome.deselected).catch(() => null);
    }
  } catch (error) {
    await operation.recordFailure(error).catch(() => {});
    throw error;
  } finally {
    // If seizeLease rolled back, this token matches no row and nothing is cleared.
    if (preempted) await operation.release().catch(() => false);
  }
}

function resumeDefinition(context: CaptureModeContext, logicalKey: string): DefinedSearch {
  const matches = [...context.definitions.values()].filter((d) => d.key === logicalKey);
  if (matches.length === 0) {
    throw new SearchNotConfigured(
      { key: "admin.definitionNotRegistered", params: { logicalKey } },
      { details: { reason: "definition-not-registered", logicalKey } },
    );
  }
  if (matches.length > 1) {
    throw new SearchConfigurationError(
      { key: "admin.definitionAmbiguous", params: { logicalKey, count: matches.length } },
      { details: { reason: "definition-ambiguous", logicalKey, count: matches.length } },
    );
  }
  return matches[0];
}

function resumePlan(
  context: CaptureModeContext,
  definition: DefinedSearch,
  targetId: string,
  captureEpoch: number,
  storeId: string,
): CreatePlan {
  const { namespace } = context.store;
  const physicalIndex = buildPhysicalIndexName(namespace, definition.key, targetId);
  return {
    logicalKey: definition.key,
    namespace,
    fingerprint: definition.fingerprint,
    hashVersion: definition.hashVersion,
    targetId,
    physicalIndex,
    writeAlias: buildWriteAliasName(physicalIndex),
    body: {
      settings: definition.settings,
      mappings: composeIndexMappings({
        targetId,
        namespace,
        logicalKey: definition.key,
        fingerprint: definition.fingerprint,
        hashVersion: definition.hashVersion,
        mappings: definition.mappings,
        storeId,
      }),
    },
    missingPlugins: [],
    captureEpoch,
    warnings: [],
  };
}

function resumeHandle(
  buildId: string,
  identity: RemoteIdentity,
  captureEpoch: number,
): BuildHandle {
  return {
    buildId,
    kind: "resume",
    target: {
      targetId: identity.targetId,
      physicalIndex: identity.physicalIndex,
      writeAlias: identity.writeAlias,
      fingerprint: identity.fingerprint,
      captureEpoch,
      remoteCreateState: "verified",
    },
  };
}

async function readOpenBuild(store: AdminStore, logicalKey: string) {
  const findOpenBuild = buildStatementsFor(store.schema).findOpenBuild;
  return store.transaction(
    async (trx) =>
      singleRow(
        await store.execute(trx, statement(findOpenBuild, [store.namespace, logicalKey])),
        openBuildLookupRowSchema,
        "findOpenBuild",
      ),
    { readOnly: true },
  );
}

export async function resumeCaptureForRebuild(
  context: CaptureModeContext,
  logicalKey: string,
  audit: AdminAudit,
): Promise<BuildHandle> {
  if (!isLogicalKey(logicalKey)) throw invalidLogicalKey(logicalKey);
  const request = parseOperationRequest({ logicalKey, kind: "resume-capture", ...audit });
  const definition = resumeDefinition(context, logicalKey);
  const leased = leaseBoundRequester(context);
  const { storeId } = await requireStoreBinding(context.binding);
  const { store } = context;
  const state = await readPlanState(store, logicalKey);
  if (state.captureMode === "active") {
    const open = await readOpenBuild(store, logicalKey);
    if (open?.kind === "resume" && open.fingerprint === definition.fingerprint) {
      const build = await readBuild(store, open.build_id);
      return {
        buildId: build.build_id,
        kind: build.kind,
        target: {
          targetId: build.new_target_id,
          physicalIndex: build.physical_index,
          writeAlias: build.write_alias,
          fingerprint: build.fingerprint,
          captureEpoch: build.target_capture_epoch,
          remoteCreateState: build.remote_create_state,
        },
      };
    }
    throw resumeRefused(logicalKey, "capture-not-suspended", { captureMode: "active" });
  }
  return runAdminOperation(store, request, async (operation) => {
    const pending = await readPendingResumeTargets(store, logicalKey);
    if (pending.length > 1) {
      throw resumeRefused(logicalKey, "resume-identity-ambiguous", { count: pending.length });
    }
    const targetId = pending[0]?.target_id ?? randomUUID();
    const { identity, body } = checkPlan(
      context,
      resumePlan(context, definition, targetId, state.captureEpoch, storeId),
      storeId,
    );
    const intent = await recordTargetIntent(
      operation,
      {
        targetId: identity.targetId,
        physicalIndex: identity.physicalIndex,
        writeAlias: identity.writeAlias,
        fingerprint: identity.fingerprint,
        hashVersion: identity.hashVersion,
      },
      context.lifetimes,
      { requireSuspendedCapture: true },
    );
    // While suspended, no registered target of the current epoch can exist.
    if (intent.action === "registered") throw invalidAdminRow("lockExistingTarget");
    if (intent.action === "recorded" || intent.action === "create-pending") {
      await attemptRemoteCreate(operation, leased, identity, body);
    }
    const registered = await registerResume(operation, identity.targetId);
    return resumeHandle(registered.buildId, identity, registered.captureEpoch);
  });
}

const RETIREMENT_BATCH = 500;
const RETIREMENT_PURGE_ROUNDS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function beginRetirement(operation: AdminOperation, targetId: string): Promise<void> {
  const { store } = operation;
  const q = captureStatementsFor(store.schema);
  const lockReadHead = cutoverStatementsFor(store.schema).lockReadHead;
  const key = [store.namespace, operation.request.logicalKey] as const;
  await operation.fenced(
    "exclusive",
    async (trx: Knex.Transaction) => {
      const head = singleRow(
        await store.execute(trx, statement(lockReadHead, key)),
        readHeadRowSchema,
        "lockReadHead",
      );
      if (head === undefined) throw invalidAdminRow("lockReadHead");
      if (head.target_id === targetId) throw retirementRefused(targetId, "target-serving");
      const grace = singleRow(
        await store.execute(trx, statement(q.readRetirementGrace, key)),
        retirementGraceRowSchema,
        "readRetirementGrace",
      );
      if (grace === undefined) throw invalidAdminRow("readRetirementGrace");
      const locked = singleRow(
        await store.execute(trx, statement(q.lockTargetForRetirement, [targetId, grace.grace_ms])),
        retirementLockRowSchema,
        "lockTargetForRetirement",
      );
      if (locked === undefined) throw invalidAdminRow("lockTargetForRetirement");
      if (
        locked.remote_create_state === "in_flight" ||
        locked.remote_create_state === "ambiguous"
      ) {
        throw retirementRefused(targetId, "remote-create-unresolved", {
          extra: { remoteCreateState: locked.remote_create_state },
        });
      }
      if (!locked.grace_elapsed) {
        const confirmed = locked.deselect_confirmed_at;
        throw retirementRefused(targetId, "retirement-grace-pending", {
          retryable: true,
          extra: {
            earliestAtMs: confirmed === null ? null : confirmed.getTime() + grace.grace_ms,
            graceMs: grace.grace_ms,
          },
        });
      }
      const open = (
        await store.execute(trx, statement(q.findOpenBuildOfTarget, [targetId, ...key]))
      ).rows.map((raw) => {
        const row = openBuildOfTargetRowSchema.safeParse(raw);
        if (!row.success) throw invalidAdminRow("findOpenBuildOfTarget");
        return row.data;
      });
      if (open.length > 0) {
        throw retirementRefused(targetId, "target-in-open-build", {
          extra: { buildId: open[0].build_id, phase: open[0].phase },
        });
      }
      await store.execute(trx, statement(q.closeRollbackWindow, [targetId, ...key]));
      const retiring = singleRow(
        await store.execute(trx, statement(q.markTargetRetiring, [targetId])),
        retiringRowSchema,
        "markTargetRetiring",
      );
      if (retiring === undefined) {
        throw retirementRefused(targetId, "target-not-retirable", {
          extra: { state: locked.state },
        });
      }
      const generation = singleRow(
        await store.execute(trx, statement(q.bumpIndexGeneration, key)),
        generationRowSchema,
        "bumpIndexGeneration",
      );
      if (generation === undefined) throw invalidAdminRow("bumpIndexGeneration");
    },
    () => ({ outcome: "started", targetId, detail: { step: "retire-begin" } }),
  );
}

async function removeWriteAlias(
  requester: SearchRequester,
  target: RetirementStateRow,
): Promise<void> {
  const response = await requester.send({
    method: "DELETE",
    path:
      "/" +
      encodeURIComponent(target.physical_index) +
      "/_alias/" +
      encodeURIComponent(target.write_alias),
  });
  if (response.status >= 200 && response.status < 300) return;
  const type = readEngineErrorType(response.body);
  if (
    response.status === 404 &&
    (type === "aliases_not_found_exception" || type === "index_not_found_exception")
  ) {
    return;
  }
  throw engineError(response);
}

async function checkIndexOwnership(
  requester: SearchRequester,
  targetId: string,
  target: RetirementStateRow,
  storeId: string,
): Promise<"present" | "missing"> {
  const path = "/" + encodeURIComponent(target.physical_index);
  const mapping = await requester.send({ method: "GET", path: path + "/_mapping" });
  if (mapping.status === 404 && readEngineErrorType(mapping.body) === "index_not_found_exception") {
    return "missing";
  }
  if (mapping.status !== 200) throw engineError(mapping);
  const parsed = indexMetaSchema.safeParse(mapping.body);
  if (!parsed.success) throw invalidRemoteResponse("get-mapping");
  const entries = Object.entries(parsed.data);
  if (entries.length !== 1 || entries[0][0] !== target.physical_index) {
    throw invalidRemoteResponse("get-mapping");
  }
  const meta = readSearchIndexMeta(entries[0][1].mappings);
  // compareMeta accepts an index without store_id (created before schema version 2).
  const verdict = compareMeta(meta, {
    targetId,
    namespace: target.namespace,
    logicalKey: target.definition,
    fingerprint: target.fingerprint,
    hashVersion: target.hash_version,
    storeId,
  });
  if (verdict === "meta-mismatch") throw retirementRefused(targetId, "remote-index-foreign");
  if (verdict === "store-mismatch") {
    throw remoteStoreMismatch(storeId, targetId, meta?.store_id ?? "unknown");
  }
  return "present";
}

async function deletePhysicalIndex(
  requester: SearchRequester,
  targetId: string,
  target: RetirementStateRow,
  storeId: string,
  beforeDelete: () => Promise<void>,
): Promise<void> {
  if ((await checkIndexOwnership(requester, targetId, target, storeId)) === "missing") return;
  await beforeDelete();
  const path = "/" + encodeURIComponent(target.physical_index);
  const response = await requester.send({ method: "DELETE", path });
  if (response.status >= 200 && response.status < 300) return;
  if (
    response.status === 404 &&
    readEngineErrorType(response.body) === "index_not_found_exception"
  ) {
    return;
  }
  throw engineError(response);
}

async function recordRetirementStep(
  operation: AdminOperation,
  targetId: string,
  step: "alias-removed" | "index-deleted",
): Promise<void> {
  const { store } = operation;
  const q = captureStatementsFor(store.schema);
  await operation.fenced(
    "shared",
    async (trx) => {
      const row =
        step === "alias-removed"
          ? singleRow(
              await store.execute(trx, statement(q.recordAliasRemoved, [targetId])),
              aliasRemovedRowSchema,
              "recordAliasRemoved",
            )
          : singleRow(
              await store.execute(trx, statement(q.recordIndexDeleted, [targetId])),
              indexDeletedRowSchema,
              "recordIndexDeleted",
            );
      if (row === undefined) throw retirementRefused(targetId, "retirement-state-changed");
    },
    () => ({ outcome: "started", targetId, detail: { step } }),
  );
}

async function waitForQuiescence(
  context: CaptureModeContext,
  operation: AdminOperation,
  targetId: string,
): Promise<void> {
  const { store } = context;
  const q = captureStatementsFor(store.schema);
  const boundMs = context.workerBounds.leaseDurationMs + context.workerBounds.requestTimeoutMs;
  const deadline = Date.now() + boundMs + store.timeouts.statementTimeoutMs;
  // Workers do not renew leases on a retiring target, so this ends within the bound.
  const pollMs = Math.min(1_000, Math.max(20, Math.floor(boundMs / 20)));
  for (;;) {
    const row = await store.transaction(
      async (trx) =>
        singleRow(
          await store.execute(trx, statement(q.checkRetirementQuiesced, [targetId, boundMs])),
          quiescedRowSchema,
          "checkRetirementQuiesced",
        ),
      { readOnly: true },
    );
    if (row === undefined) throw invalidAdminRow("checkRetirementQuiesced");
    if (row.quiesced) return;
    if (Date.now() >= deadline) {
      throw retirementRefused(targetId, "retirement-in-flight", {
        retryable: true,
        extra: { boundMs },
      });
    }
    await operation.heartbeat();
    await delay(pollMs);
  }
}

interface RuntimeKey {
  documentId: string;
  intentId: string;
}
// The empty string sorts before every document_id.
const KEYSET_START: RuntimeKey = {
  documentId: "",
  intentId: "00000000-0000-0000-0000-000000000000",
};

async function purgeIntents(
  operation: AdminOperation,
  targetId: string,
  after: string,
): Promise<{ deleted: number; next: string }> {
  const { store } = operation;
  const q = captureStatementsFor(store.schema);
  return operation.fenced("shared", async (trx) => {
    const rows = (
      await store.execute(
        trx,
        statement(q.lockResidualIntents, [targetId, RETIREMENT_BATCH, after]),
      )
    ).rows.map((raw) => {
      const row = residualIntentRowSchema.safeParse(raw);
      if (!row.success) throw invalidAdminRow("lockResidualIntents");
      return row.data;
    });
    const last = rows.at(-1);
    if (last === undefined) return { deleted: 0, next: after };
    const documents = rows.map((row) => row.document_id);
    const intents = rows.map((row) => row.intent_id);
    await store.execute(trx, statement(q.deleteResidualRuntime, [targetId, documents, intents]));
    const deleted = await store.execute(
      trx,
      statement(q.deleteResidualIntents, [targetId, documents, intents]),
    );
    await operation.audit(trx, {
      outcome: "started",
      targetId,
      detail: { step: "retire-purge", intents: deleted.rowCount },
    });
    return { deleted: deleted.rowCount, next: last.document_id };
  });
}

async function purgeOrphans(
  operation: AdminOperation,
  targetId: string,
  after: RuntimeKey,
): Promise<{ deleted: number; next: RuntimeKey }> {
  const { store } = operation;
  const q = captureStatementsFor(store.schema);
  return operation.fenced("shared", async (trx) => {
    const deleted = await store.execute(
      trx,
      statement(q.deleteOrphanRuntime, [
        targetId,
        RETIREMENT_BATCH,
        after.documentId,
        after.intentId,
      ]),
    );
    // DELETE … RETURNING has no order, so the largest deleted key becomes the next keyset.
    let next: RuntimeKey = after;
    for (const raw of deleted.rows) {
      const row = residualRuntimeKeyRowSchema.safeParse(raw);
      if (!row.success) throw invalidAdminRow("deleteOrphanRuntime");
      const { document_id: documentId, intent_id: intentId } = row.data;
      const order = compareCodeUnitsBytes(documentId, next.documentId);
      if (order > 0 || (order === 0 && intentId > next.intentId)) next = { documentId, intentId };
    }
    if (deleted.rowCount > 0) {
      await operation.audit(trx, {
        outcome: "started",
        targetId,
        detail: { step: "retire-purge-orphans", runtimes: deleted.rowCount },
      });
    }
    return { deleted: deleted.rowCount, next };
  });
}

// Must match PostgreSQL's COLLATE "C" keyset order.
function compareCodeUnitsBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

async function finishRetirement(operation: AdminOperation, targetId: string): Promise<boolean> {
  const { store } = operation;
  const q = captureStatementsFor(store.schema);
  return operation.fenced("shared", async (trx) => {
    const row = singleRow(
      await store.execute(trx, statement(q.markTargetRetired, [targetId])),
      retiredRowSchema,
      "markTargetRetired",
    );
    if (row === undefined) return false;
    await adminFenceStoreFor(store.schema).remove(trx, targetId);
    await operation.audit(trx, {
      outcome: "succeeded",
      targetId,
      detail: { step: "retired" },
    });
    return true;
  });
}

export async function retireTarget(
  context: CaptureModeContext,
  targetId: string,
  audit: AdminAudit,
): Promise<void> {
  if (!targetIdArgumentSchema.safeParse(targetId).success) {
    throw new SearchConfigurationError(
      { key: "names.invalidTargetId", params: { name: String(targetId).slice(0, 80) } },
      { details: { reason: "invalid-target-id" } },
    );
  }
  const { store } = context;
  const notFound = () =>
    new SearchNotConfigured(
      { key: "admin.targetNotFound", params: { targetId } },
      { details: { reason: "target-not-found", targetId } },
    );
  const { storeId } = await requireStoreBinding(context.binding);
  const before = await readRetirementState(store, targetId);
  if (before === undefined || before.namespace !== store.namespace) throw notFound();
  if (before.state === "detached") throw targetDetached(targetId);
  const request = parseOperationRequest({
    logicalKey: before.definition,
    kind: "retire",
    ...audit,
  });
  const leased = leaseBoundRequester(context);
  if (before.state === "retired") return;
  await runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    let current = await readRetirementState(store, targetId);
    if (current === undefined) throw notFound();
    if (current.state === "retired") return;
    if (current.state === "detached") throw targetDetached(targetId);
    if (current.state !== "retiring") {
      // Covers a cutover, rollback or suspend that died between its commit and confirmDeselection.
      await confirmDeselection(store, targetId);
      await operation.heartbeat();
      await verifyFence(store, leased, { targetId, physicalIndex: current.physical_index });
      await beginRetirement(operation, targetId);
      current = await readRetirementState(store, targetId);
      if (current === undefined) throw notFound();
    }
    if (!current.alias_removed) {
      await operation.heartbeat();
      await checkIndexOwnership(leased, targetId, current, storeId);
      await operation.heartbeat();
      await removeWriteAlias(leased, current);
      await recordRetirementStep(operation, targetId, "alias-removed");
    }
    if (!current.index_deleted) {
      await waitForQuiescence(context, operation, targetId);
      await operation.heartbeat();
      await deletePhysicalIndex(leased, targetId, current, storeId, async () => {
        await operation.heartbeat();
        await verifyFence(store, leased, { targetId, physicalIndex: current.physical_index });
      });
      await recordRetirementStep(operation, targetId, "index-deleted");
    }
    // Purging runs after the remote index is gone, so the lease must not lapse. Each round restarts the keyset to
    // revisit rows skipped by SKIP LOCKED.
    for (let round = 0; round < RETIREMENT_PURGE_ROUNDS; round += 1) {
      let intentKey: string = KEYSET_START.documentId;
      for (;;) {
        await operation.renewIfDue();
        const batch = await purgeIntents(operation, targetId, intentKey);
        if (batch.next === intentKey) break;
        intentKey = batch.next;
      }
      let orphanKey = KEYSET_START;
      for (;;) {
        await operation.renewIfDue();
        const batch = await purgeOrphans(operation, targetId, orphanKey);
        if (batch.deleted === 0) break;
        orphanKey = batch.next;
      }
      await operation.renewIfDue();
      if (await finishRetirement(operation, targetId)) return;
    }
    throw retirementRefused(targetId, "retirement-residue", { retryable: true });
  });
}
