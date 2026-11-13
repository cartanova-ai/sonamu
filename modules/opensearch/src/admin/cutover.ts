import { randomBytes, randomUUID } from "node:crypto";

import { type z } from "zod";

import { describeResponseFailure, toSearchError } from "../client/error-normalization";
import { type SearchHttpResponse, type SearchRequester } from "../client/search-client";
import { HASH_VERSION } from "../definition/canonical-json";
import { SearchAdminPreconditionFailed, type SearchError, SearchUnavailable } from "../errors";
import { createDeliveryStore } from "../postgres/delivery-store";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { requireStoreBinding } from "../postgres/store-binding";
import {
  indexedMetaSourceSchema,
  MGET_QUERYSTRING,
  mgetMetaSchema,
  mgetPath,
} from "../worker/conflict";
import { materializeGroup } from "../worker/materialize";
import {
  type AdminOperation,
  type AdminStore,
  invalidAdminRow,
  parseOperationRequest,
  runAdminOperation,
  singleRow,
} from "./admin-lease";
import { type BuildContext, type BuildRow, definitionFor, readBuild } from "./builds";
import { verifyFence } from "./fences";
import { leasedRemoteRequestTimeoutMs, verifyRegistered } from "./remote-create";
import {
  type adminContextSchema,
  backlogRowSchema,
  buildTransitionRowSchema,
  deselectConfirmedRowSchema,
  generationRowSchema,
  ledgerIdRowSchema,
  lockedBuildRowSchema,
  lockedTargetRowSchema,
  pendingIdRowSchema,
  readHeadRowSchema,
} from "./rows";
import { readTargetIdentity } from "./targets";

// Order: acquire the lease; with no lock held, verify the incoming target remotely, its fence and (cutover) a sample;
// renew; then one fenced transaction under the shared barrier locks read head → build → targets (id order), checks
// every blocker, moves the read head and transitions the build. A failed check changes nothing. confirmDeselection runs
// only after the commit is visible, and the retirement grace counts from it. transitionBuild rewrites the expected head
// from the resulting head, so cutover → rollback → cutover passes the expected-head check every time.

export interface CutoverResult {
  logicalKey: string;
  readTargetId: string;
  previousTargetId: string | null;
  readGeneration: number;
}

type Direction = "cutover" | "rollback";

interface CutoverStatements {
  readonly lockReadHead: SqlFragment;
  readonly lockBuild: SqlFragment;
  readonly lockBuildTargets: SqlFragment;
  readonly readCutoverBacklog: SqlFragment;
  readonly moveReadHead: SqlFragment;
  readonly markOutgoingDeselected: SqlFragment;
  readonly markIncomingSelected: SqlFragment;
  readonly transitionBuild: SqlFragment;
  readonly confirmDeselection: SqlFragment;
  readonly closeBuildWithoutRollback: SqlFragment;
  readonly scanLedgerIds: SqlFragment;
  readonly readPendingSampleIds: SqlFragment;
}

function renderCutoverStatements(schema: string): CutoverStatements {
  const s = schemaIdentifier(schema);
  const readHeads = qualified(s, "read_heads");
  const builds = qualified(s, "builds");
  const targets = qualified(s, "targets");
  const documents = qualified(s, "documents");
  const deliveries = qualified(s, "deliveries");
  const runtime = qualified(s, "delivery_runtime");
  return {
    lockReadHead: sql`SELECT target_id, generation, rebuild_required FROM ${readHeads} WHERE namespace = $1 AND definition = $2 FOR UPDATE;`,
    lockBuild: sql`SELECT build_id, kind, phase, capture_epoch, new_target_id, old_target_id, expected_read_target_id,
       expected_read_generation, (scan_completed_at IS NOT NULL) AS scan_completed
FROM ${builds} WHERE build_id = $1 FOR UPDATE;`,
    lockBuildTargets: sql`SELECT target_id, state, write_enabled, capture_epoch, fingerprint FROM ${targets}
WHERE target_id = ANY($1::uuid[]) ORDER BY target_id FOR UPDATE;`,
    // Pending stops at $2 + 1 rows and quarantine is only tested for existence, so the check under the lock stays bounded.
    readCutoverBacklog: sql`SELECT
  (SELECT count(*) FROM (
     SELECT 1 FROM ${deliveries} d
     LEFT JOIN LATERAL (SELECT r.quarantined_revision FROM ${runtime} r
                        WHERE r.target_id = d.target_id AND r.document_id = d.document_id AND r.intent_id = d.intent_id
                        LIMIT 1) r ON true
     WHERE d.target_id = $1 AND (r.quarantined_revision IS NULL OR r.quarantined_revision < d.desired_revision)
     LIMIT $2::bigint + 1) p) AS pending,
  EXISTS (SELECT 1 FROM ${runtime} r
          JOIN ${deliveries} d
            ON d.target_id = r.target_id AND d.document_id = r.document_id AND d.intent_id = r.intent_id
          WHERE r.target_id = $1 AND r.quarantined_revision IS NOT NULL
            AND r.quarantined_revision >= d.desired_revision) AS quarantined;`,
    moveReadHead: sql`UPDATE ${readHeads} SET target_id = $3, generation = generation + 1, rebuild_required = false, updated_at = clock_timestamp()
WHERE namespace = $1 AND definition = $2 AND generation = $4
RETURNING generation;`,
    markOutgoingDeselected: sql`UPDATE ${targets} SET deselected_at = COALESCE(deselected_at, clock_timestamp()) WHERE target_id = $1;`,
    markIncomingSelected: sql`UPDATE ${targets} SET selected_at = clock_timestamp(), deselected_at = NULL, deselect_confirmed_at = NULL WHERE target_id = $1;`,
    transitionBuild: sql`UPDATE ${builds} b
SET phase = $2,
    expected_read_target_id = h.target_id,
    expected_read_generation = h.generation,
    cutover_at = CASE WHEN $2 = 'serving' THEN clock_timestamp() ELSE b.cutover_at END,
    rolled_back_at = CASE WHEN $2 = 'catching_up' THEN clock_timestamp() ELSE b.rolled_back_at END,
    updated_at = clock_timestamp()
FROM ${readHeads} h
WHERE b.build_id = $1 AND b.phase = $3 AND h.namespace = b.namespace AND h.definition = b.definition
RETURNING b.phase, b.expected_read_generation;`,
    confirmDeselection: sql`UPDATE ${targets} SET deselect_confirmed_at = clock_timestamp()
WHERE target_id = $1 AND deselected_at IS NOT NULL AND deselect_confirmed_at IS NULL
RETURNING deselect_confirmed_at;`,
    // A build without a rollback partner has no rollback window; left open, builds_one_open_idx would refuse every
    // later beginRebuild.
    closeBuildWithoutRollback: sql`UPDATE ${builds} SET phase = 'retired', closed_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE build_id = $1 AND phase = 'serving' AND old_target_id IS NULL
RETURNING phase;`,
    scanLedgerIds: sql`SELECT document_id FROM ${documents}
WHERE namespace = $1 AND definition = $2
  AND ($3::text IS NULL OR document_id > $3)
  AND ($4::text IS NULL OR document_id <= $4)
ORDER BY document_id COLLATE "C" LIMIT $5;`,
    readPendingSampleIds: sql`SELECT document_id FROM ${deliveries} WHERE target_id = $1 AND document_id = ANY($2::text[]);`,
  };
}

const statementCache = createSchemaStatementCache(renderCutoverStatements);

export function cutoverStatementsFor(schema: string): CutoverStatements {
  return statementCache.get(schema);
}

function blocked(direction: Direction, buildId: string, blockers: readonly string[]) {
  const reason = blockers[0] ?? "unknown";
  return new SearchAdminPreconditionFailed(
    {
      key: direction === "cutover" ? "admin.cutoverBlocked" : "admin.rollbackBlocked",
      params: { buildId, reason },
    },
    { details: { reason, blockers: blockers.join(","), buildId } },
  );
}

function invalidRemoteResponse(operation: string): SearchUnavailable {
  return new SearchUnavailable(
    { key: "admin.invalidRemoteResponse", params: { operation } },
    { retryable: false, details: { reason: "invalid-remote-response", operation } },
  );
}

function engineError(response: SearchHttpResponse): SearchError {
  return toSearchError(describeResponseFailure(response.status, response.body));
}

function leaseBoundRequester(context: BuildContext): SearchRequester {
  const capMs = leasedRemoteRequestTimeoutMs(context.store.timeouts);
  const { requester } = context;
  return {
    send: (request, options = {}) =>
      requester.send(request, {
        ...options,
        timeoutMs: Math.min(options.timeoutMs ?? capMs, capMs),
      }),
  };
}

async function sampleLedgerIds(
  store: AdminStore,
  logicalKey: string,
  size: number,
): Promise<string[]> {
  const q = cutoverStatementsFor(store.schema);
  const start = randomBytes(8).toString("hex");
  return store.transaction(
    async (trx) => {
      const read = async (after: string | null, limit: number) =>
        (
          await store.execute(
            trx,
            statement(q.scanLedgerIds, [store.namespace, logicalKey, after, null, limit]),
          )
        ).rows.map((raw) => {
          const row = ledgerIdRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("scanLedgerIds");
          return row.data.document_id;
        });
      const first = await read(start, size);
      if (first.length >= size) return first;
      const rest = await read(null, size - first.length);
      return [...new Set([...first, ...rest])];
    },
    { readOnly: true },
  );
}

async function verifySample(
  context: BuildContext,
  requester: SearchRequester,
  build: BuildRow,
): Promise<{ checked: number; violations: number }> {
  const { store } = context;
  const size = context.cutover.sampleSize;
  const definition = definitionFor(context, build.definition, build.fingerprint);
  const refresh = await requester.send({
    method: "POST",
    path: `/${encodeURIComponent(build.physical_index)}/_refresh`,
  });
  if (refresh.status !== 200) throw engineError(refresh);
  const ids = await sampleLedgerIds(store, build.definition, size);
  if (ids.length === 0) return { checked: 0, violations: 0 };
  const { timeouts } = store;
  const materialized = await materializeGroup({
    db: store.primary(),
    store: createDeliveryStore({ schema: store.schema }),
    namespace: store.namespace,
    definition,
    deliveries: ids.map((documentId) => ({
      targetId: build.new_target_id,
      documentId,
      intentId: randomUUID(),
      claimedRevision: 1,
    })),
    limits: {
      projectionTimeoutMs: timeouts.statementTimeoutMs,
      maxIsolationCallsPerBatch: 1,
      maxBulkBytes: 104_857_600,
    },
  });
  if (materialized.infrastructureError !== undefined) throw materialized.infrastructureError;
  const q = cutoverStatementsFor(store.schema);
  // Intents are read before mget, so an intent acknowledged after this read is already indexed there.
  const pending = await store.transaction(
    async (trx) =>
      new Set(
        (
          await store.execute(trx, statement(q.readPendingSampleIds, [build.new_target_id, ids]))
        ).rows.map((raw) => {
          const row = pendingIdRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("readPendingSampleIds");
          return row.data.document_id;
        }),
      ),
    { readOnly: true },
  );
  const response = await requester.send({
    method: "POST",
    path: mgetPath(build.physical_index),
    querystring: MGET_QUERYSTRING,
    body: { ids },
  });
  if (response.status !== 200) throw engineError(response);
  const mget = mgetMetaSchema.safeParse(response.body);
  if (!mget.success) throw invalidRemoteResponse("mget");
  const indexed = new Map(mget.data.docs.map((doc) => [doc._id, doc]));
  let violations = 0;
  for (const outcome of materialized.documents) {
    if (outcome.kind === "failed") {
      violations += 1;
      continue;
    }
    const id = outcome.delivery.documentId;
    const doc = indexed.get(id);
    if (doc?.error !== undefined) throw invalidRemoteResponse("mget");
    const deleted = outcome.projection.state === "deleted";
    const version = doc?.found === true ? doc._version : undefined;
    if (version !== undefined && version > outcome.revision) continue;
    if (version !== undefined && version === outcome.revision) {
      const meta = indexedMetaSourceSchema.safeParse(doc?._source);
      const same =
        meta.success &&
        meta.data.sonamu_meta.deleted === deleted &&
        meta.data.sonamu_meta.hash_version === HASH_VERSION &&
        meta.data.sonamu_meta.projection_hash === outcome.projectionHash;
      if (!same) violations += 1;
      continue;
    }
    if (version === undefined && deleted) continue;
    if (pending.has(id)) continue;
    violations += 1;
  }
  return { checked: ids.length, violations };
}

function transitionBlockers(input: {
  direction: Direction;
  captureMode: "active" | "suspended";
  captureEpoch: number;
  head: z.infer<typeof readHeadRowSchema>;
  build: z.infer<typeof lockedBuildRowSchema>;
  targets: ReadonlyMap<string, z.infer<typeof lockedTargetRowSchema>>;
  lag: z.infer<typeof backlogRowSchema> | undefined;
  maxPendingDocuments: number;
  oldDefinitionRegistered: boolean;
}): string[] {
  const { build, head, captureEpoch, lag } = input;
  const blockers: string[] = [];
  if (input.direction === "cutover") {
    const target = input.targets.get(build.new_target_id);
    if (input.captureMode !== "active") blockers.push("capture-suspended");
    if (build.phase !== "catching_up") blockers.push("phase-not-catching-up");
    if (!build.scan_completed) blockers.push("scan-incomplete");
    if (build.capture_epoch !== captureEpoch || target?.capture_epoch !== captureEpoch) {
      blockers.push("capture-epoch-mismatch");
    }
    if (target?.state !== "active" || !target.write_enabled) {
      blockers.push("new-target-not-writable");
    }
    if (
      head.target_id !== build.expected_read_target_id ||
      head.generation !== build.expected_read_generation
    ) {
      blockers.push("read-head-moved");
    }
  } else {
    const target =
      build.old_target_id === null ? undefined : input.targets.get(build.old_target_id);
    if (build.phase !== "serving") blockers.push("phase-not-serving");
    if (build.old_target_id === null) blockers.push("no-rollback-target");
    if (target !== undefined) {
      if (target.state !== "active" || !target.write_enabled) {
        blockers.push("old-target-not-writable");
      }
      if (target.capture_epoch !== captureEpoch) blockers.push("capture-epoch-mismatch");
      if (!input.oldDefinitionRegistered) blockers.push("old-definition-not-registered");
    }
    if (
      head.target_id !== build.new_target_id ||
      head.target_id !== build.expected_read_target_id ||
      head.generation !== build.expected_read_generation
    ) {
      blockers.push("read-head-moved");
    }
  }
  if (lag !== undefined) {
    if (lag.quarantined) blockers.push("quarantined-documents");
    if (lag.pending > input.maxPendingDocuments) blockers.push("pending-above-limit");
  }
  return blockers;
}

interface Transition {
  result: CutoverResult;
  outgoing: string | null;
}

async function transition(
  context: BuildContext,
  operation: AdminOperation,
  direction: Direction,
  buildId: string,
): Promise<Transition> {
  const { store } = operation;
  const q = cutoverStatementsFor(store.schema);
  const logicalKey = operation.request.logicalKey;
  const key = [store.namespace, logicalKey] as const;
  return operation.fenced(
    "shared",
    async (trx, barrier): Promise<Transition> => {
      const head = singleRow(
        await store.execute(trx, statement(q.lockReadHead, key)),
        readHeadRowSchema,
        "lockReadHead",
      );
      if (head === undefined) throw invalidAdminRow("lockReadHead");
      const build = singleRow(
        await store.execute(trx, statement(q.lockBuild, [buildId])),
        lockedBuildRowSchema,
        "lockBuild",
      );
      if (build === undefined) throw invalidAdminRow("lockBuild");
      const ids = [build.new_target_id, build.old_target_id].filter(
        (id): id is string => id !== null,
      );
      const locked = (await store.execute(trx, statement(q.lockBuildTargets, [ids]))).rows.map(
        (raw) => {
          const row = lockedTargetRowSchema.safeParse(raw);
          if (!row.success) throw invalidAdminRow("lockBuildTargets");
          return row.data;
        },
      );
      const targets = new Map(locked.map((row) => [row.target_id, row]));
      const into = direction === "cutover" ? build.new_target_id : build.old_target_id;
      const lag =
        into === null
          ? undefined
          : singleRow(
              await store.execute(
                trx,
                statement(q.readCutoverBacklog, [into, context.cutover.maxPendingDocuments]),
              ),
              backlogRowSchema,
              "readCutoverBacklog",
            );
      const oldFingerprint =
        build.old_target_id === null ? undefined : targets.get(build.old_target_id)?.fingerprint;
      const blockers = transitionBlockers({
        direction,
        captureMode: barrier.capture_mode,
        captureEpoch: barrier.capture_epoch,
        head,
        build,
        targets,
        lag,
        maxPendingDocuments: context.cutover.maxPendingDocuments,
        oldDefinitionRegistered:
          oldFingerprint !== undefined &&
          context.definitions.has(`${logicalKey}@${oldFingerprint}`),
      });
      if (blockers.length > 0 || into === null) throw blocked(direction, buildId, blockers);
      const moved = singleRow(
        await store.execute(trx, statement(q.moveReadHead, [...key, into, head.generation])),
        generationRowSchema,
        "moveReadHead",
      );
      if (moved === undefined) throw blocked(direction, buildId, ["read-head-moved"]);
      if (head.target_id !== null)
        await store.execute(trx, statement(q.markOutgoingDeselected, [head.target_id]));
      await store.execute(trx, statement(q.markIncomingSelected, [into]));
      const serving = direction === "cutover";
      const transitioned = singleRow(
        await store.execute(
          trx,
          statement(q.transitionBuild, [
            buildId,
            serving ? "serving" : "catching_up",
            serving ? "catching_up" : "serving",
          ]),
        ),
        buildTransitionRowSchema,
        "transitionBuild",
      );
      if (transitioned === undefined) throw blocked(direction, buildId, ["build-phase-moved"]);
      if (serving && build.old_target_id === null) {
        await store.execute(trx, statement(q.closeBuildWithoutRollback, [buildId]));
      }
      return {
        result: {
          logicalKey,
          readTargetId: into,
          previousTargetId: head.target_id,
          readGeneration: moved.generation,
        },
        outgoing: head.target_id,
      };
    },
    (done) => ({
      outcome: "succeeded",
      targetId: done.result.readTargetId,
      buildId,
      detail: {
        step: direction,
        generation: done.result.readGeneration,
        previousTargetId: done.result.previousTargetId,
      },
    }),
  );
}

export async function confirmDeselection(
  store: AdminStore,
  targetId: string,
): Promise<Date | null> {
  const q = cutoverStatementsFor(store.schema);
  // A one-statement transaction so lock_timeout and statement_timeout apply.
  return store.transaction(async (trx) => {
    const row = singleRow(
      await store.execute(trx, statement(q.confirmDeselection, [targetId])),
      deselectConfirmedRowSchema,
      "confirmDeselection",
    );
    return row?.deselect_confirmed_at ?? null;
  });
}

async function move(
  context: BuildContext,
  direction: Direction,
  buildId: string,
  audit: z.input<typeof adminContextSchema>,
): Promise<CutoverResult> {
  const { store } = context;
  const { storeId } = await requireStoreBinding(context.binding);
  const before = await readBuild(store, buildId);
  const request = parseOperationRequest({
    logicalKey: before.definition,
    kind: direction,
    ...audit,
  });
  const requester = leaseBoundRequester(context);
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    const build = await readBuild(store, buildId);
    const intoId = direction === "cutover" ? build.new_target_id : build.old_target_id;
    if (intoId === null) throw blocked(direction, buildId, ["no-rollback-target"]);
    const into = await readTargetIdentity(store, intoId);
    if (into === undefined) throw invalidAdminRow("readTargetById");
    // Remote checks and sample verification hold no lock and are not rechecked in the transaction, so later remote
    // changes are not caught.
    await verifyRegistered(requester, {
      targetId: intoId,
      physicalIndex: into.physical_index,
      writeAlias: into.write_alias,
      namespace: into.namespace,
      logicalKey: into.definition,
      fingerprint: into.fingerprint,
      hashVersion: into.hash_version,
      storeId,
    });
    await operation.heartbeat();
    await verifyFence(store, requester, { targetId: intoId, physicalIndex: into.physical_index });
    if (direction === "cutover" && context.cutover.sampleSize > 0) {
      const verdict = await verifySample(context, requester, build);
      if (verdict.violations > 0) {
        throw new SearchAdminPreconditionFailed(
          {
            key: "admin.verificationFailed",
            params: { buildId, violations: verdict.violations },
          },
          {
            details: {
              reason: "verification-failed",
              buildId,
              checked: verdict.checked,
              violations: verdict.violations,
            },
          },
        );
      }
    }
    await operation.heartbeat();
    const done = await transition(context, operation, direction, buildId);
    if (done.outgoing !== null) {
      // Already committed: if this stamp fails, retirement stamps it first.
      await confirmDeselection(store, done.outgoing).catch(() => null);
    }
    return done.result;
  });
}

export function cutover(
  context: BuildContext,
  buildId: string,
  audit: z.input<typeof adminContextSchema>,
): Promise<CutoverResult> {
  return move(context, "cutover", buildId, audit);
}

export function rollback(
  context: BuildContext,
  buildId: string,
  audit: z.input<typeof adminContextSchema>,
): Promise<CutoverResult> {
  return move(context, "rollback", buildId, audit);
}
