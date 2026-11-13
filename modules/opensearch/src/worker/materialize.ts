import { type StandardSchemaV1 } from "@standard-schema/spec";
import { type Knex } from "knex";
import { z } from "zod";

import {
  HASH_VERSION,
  type JsonObject,
  type JsonValue,
  MAX_CANONICAL_DEPTH,
  parseCanonicalProjection,
  sha256Hex,
} from "../definition/canonical-json";
import {
  type DefinedSearch,
  type DocumentId,
  type Projection,
  type ProjectionReadContext,
} from "../definition/define-search";
import {
  assertRevision,
  isReservedDocumentField,
  type SearchEnvelope,
} from "../definition/envelope";
import {
  SearchConfigurationError,
  SearchError,
  type SearchErrorDetail,
  SearchProjectionError,
  SearchTimeout,
} from "../errors";
import {
  type ClaimedDelivery,
  type DeliveryError,
  type DeliveryStore,
} from "../postgres/delivery-store";
import { mapPgError, readPgError } from "../postgres/pg-errors";
import { type PrimarySnapshot, runInPrimarySnapshot } from "../postgres/snapshot";
import { canonicalEnvelopeLine } from "./bulk";
import { type WorkerLimits, workerLimitsSchema } from "./limits";
import {
  type PresentProjectionValue,
  type ProjectionValue,
  projectionResultSchema,
  projectionValueSchema,
  schemaIssueCodeSchema,
  schemaPathSegmentSchema,
} from "./schemas";

// One call reads the ledger and runs the projection in one read-only REPEATABLE READ snapshot on the primary, so the
// indexed body and its external version come from the same instant. Infrastructure failures (SQLSTATE 08, 53, 57
// except 57014, 58, 40001, 40P01, 55P03, lost connection) release every undecided document without budget. Data
// failures are bisected into fresh snapshots down to one document. Timeouts bisect breadth first; a lone timeout
// spends retry budget only if the database answered another projection meanwhile, otherwise it releases as
// infrastructure, so one slow document cannot release its group forever and an outage spends no budget.

export type FailureDisposition = "poison" | "retry" | "release";

export type DocumentFailureReason =
  | "ledger_missing"
  | "missing_projection"
  | "invalid_projection"
  | "invalid_result"
  | "document_not_object"
  | "non_json_document"
  | "schema_invalid"
  | "reserved_field"
  | "oversized"
  | "invalid_revision"
  | "projection_threw"
  | "projection_sql_error"
  | "read_only_violation"
  | "snapshot_aborted"
  | "snapshot_replaced"
  | "projection_timeout"
  | "database_unavailable"
  | "aborted"
  | "isolation_budget_exhausted"
  | "drain_deadline";

export interface MaterializedDocument {
  readonly kind: "materialized";
  readonly delivery: ClaimedDelivery;
  readonly revision: number;
  readonly projection: Projection<JsonObject>;
  readonly canonical: string;
  readonly projectionHash: string;
  readonly envelope: SearchEnvelope;
}

export interface FailedDocument {
  readonly kind: "failed";
  readonly delivery: ClaimedDelivery;
  readonly revision: number;
  readonly disposition: FailureDisposition;
  readonly reason: DocumentFailureReason;
  readonly error: SearchProjectionError;
  readonly deliveryError: DeliveryError;
}

export type DocumentOutcome = MaterializedDocument | FailedDocument;

export interface MaterializeGroupInput {
  readonly db: Knex;
  readonly store: Pick<DeliveryStore, "readLedger">;
  readonly namespace: string;
  readonly definition: DefinedSearch;
  readonly deliveries: readonly ClaimedDelivery[];
  readonly limits: Pick<
    WorkerLimits,
    "projectionTimeoutMs" | "maxIsolationCallsPerBatch" | "maxBulkBytes"
  >;
  readonly signal?: AbortSignal;
  readonly deadlineAt?: number;
  readonly callTimeoutMs?: number;
  readonly isolationBudget?: { remaining: number };
  readonly onMaterialized?: (document: MaterializedDocument) => Promise<void> | void;
}

export interface MaterializeGroupResult {
  readonly documents: readonly DocumentOutcome[];
  readonly materializeCalls: number;
  readonly infrastructureError: SearchError | undefined;
}

type Details = Record<string, SearchErrorDetail>;

interface Failure {
  readonly reason: DocumentFailureReason;
  readonly disposition: FailureDisposition;
  readonly details?: Details;
  readonly persisted?: Record<string, DeliveryError[string]>;
}

type CallOutcome =
  | { kind: "ok"; ledger: ReadonlyMap<string, number>; results: Map<string, unknown> }
  | { kind: "failure"; ledger: ReadonlyMap<string, number>; failure: Failure }
  | { kind: "infrastructure"; error: SearchError; ledger?: ReadonlyMap<string, number> }
  | { kind: "aborted" }
  | { kind: "statement-failure"; error: SearchError };

const MAX_PERSISTED_PATH_LENGTH = 100;
const MAX_PERSISTED_ISSUES = 3;
const MAX_ECHOED_FIELD_LENGTH = 64;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const OWN_CLASS_REASONS: ReadonlySet<DocumentFailureReason> = new Set([
  "ledger_missing",
  "schema_invalid",
  "reserved_field",
  "oversized",
]);

const limitsSchema = workerLimitsSchema.pick({
  projectionTimeoutMs: true,
  maxIsolationCallsPerBatch: true,
  maxBulkBytes: true,
});
const namedErrorSchema = z.object({ name: z.string().regex(SAFE_ERROR_NAME) });
const functionSchema = z.instanceof(Function);
const inputSchema = z.object({
  namespace: z.string().min(1),
  definition: z.looseObject({
    key: z.string().min(1),
    materialize: functionSchema,
    schema: z.unknown(),
  }),
  deliveries: z
    .array(z.looseObject({ documentId: z.string().min(1), claimedRevision: z.number().int() }))
    .readonly(),
});

function invalidInput(field: string): SearchConfigurationError {
  const name = field.slice(0, MAX_ECHOED_FIELD_LENGTH);
  return new SearchConfigurationError(
    { key: "materialize.invalidInput", params: { field: name } },
    { details: { reason: "invalid-materialize-input", field: name } },
  );
}

function errorNameOf<Thrown>(error: Thrown): Details {
  const named = namedErrorSchema.safeParse(error);
  return named.success ? { errorName: named.data.name } : {};
}

function classifyThrown<Thrown>(
  error: Thrown,
): { kind: "infrastructure"; error: SearchError } | { kind: "failure"; failure: Failure } {
  const pg = readPgError(error);
  if (pg !== undefined) {
    const { sqlstate } = pg;
    const details = { sqlstate };
    if (sqlstate === "57014" || sqlstate === "25P03") {
      // The snapshot's statement_timeout and idle-in-transaction limit: both are projection timeouts, not
      // infrastructure.
      return {
        kind: "failure",
        failure: { reason: "projection_timeout", disposition: "retry", details },
      };
    }
    if (sqlstate === "25006") {
      return {
        kind: "failure",
        failure: { reason: "read_only_violation", disposition: "poison", details },
      };
    }
    if (sqlstate === "25P02") {
      return {
        kind: "failure",
        failure: { reason: "snapshot_aborted", disposition: "poison", details },
      };
    }
    if (
      /^(08|53|57|58)/.test(sqlstate) ||
      sqlstate === "40001" ||
      sqlstate === "40P01" ||
      sqlstate === "55P03"
    ) {
      return { kind: "infrastructure", error: mapPgError(error, "worker") };
    }
    return {
      kind: "failure",
      failure: { reason: "projection_sql_error", disposition: "poison", details },
    };
  }
  if (!(error instanceof SearchError)) {
    const mapped = mapPgError(error, "worker");
    if (mapped.details?.reason === "connection") return { kind: "infrastructure", error: mapped };
  }
  return {
    kind: "failure",
    failure: { reason: "projection_threw", disposition: "poison", details: errorNameOf(error) },
  };
}

type Race<Value> =
  | { kind: "value"; value: Value }
  | { kind: "threw"; error: Error | object | string | number | boolean | bigint | symbol | null }
  | { kind: "timeout" }
  | { kind: "aborted" };

function race<Value>(
  run: (signal: AbortSignal, deadlineAt: number) => Promise<Value>,
  timeoutMs: number,
  outer: AbortSignal | undefined,
): Promise<Race<Value>> {
  const controller = new AbortController();
  // run's signal is aborted either way, so a cooperative projection stops once the snapshot ends.
  return new Promise<Race<Value>>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: Race<Value>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
      controller.abort();
      resolve(result);
    };
    const onAbort = () => finish({ kind: "aborted" });
    if (outer?.aborted === true) {
      finish({ kind: "aborted" });
      return;
    }
    outer?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    let pending: Promise<Value>;
    try {
      pending = Promise.resolve(run(controller.signal, Date.now() + timeoutMs));
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (value) => finish({ kind: "value", value }),
      (error) => finish({ kind: "threw", error }),
    );
  });
}

function pointer(segments: readonly string[]): string {
  const text = segments
    .map((segment) => `/${segment.replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
  return text.length > MAX_PERSISTED_PATH_LENGTH
    ? `${text.slice(0, MAX_PERSISTED_PATH_LENGTH)}…`
    : text;
}

function issuePath(issue: StandardSchemaV1.Issue): string {
  const segments = (issue.path ?? []).map((segment) => {
    const parsed = schemaPathSegmentSchema.safeParse(segment);
    return parsed.success ? parsed.data : "?";
  });
  return pointer(segments);
}

function schemaFailure(issues: readonly StandardSchemaV1.Issue[]): Failure {
  const summarized = issues.slice(0, MAX_PERSISTED_ISSUES).map((issue) => {
    const code = schemaIssueCodeSchema.safeParse(issue);
    return { path: issuePath(issue), code: code.success ? code.data.code : null };
  });
  const first = summarized[0];
  return {
    reason: "schema_invalid",
    disposition: "poison",
    details: {
      issueCount: issues.length,
      path: first?.path ?? null,
      code: first?.code ?? null,
    },
    persisted: { issues: summarized },
  };
}

type Validation =
  | { kind: "ok"; value: JsonObject }
  | { kind: "failure"; failure: Failure }
  | { kind: "aborted" };

async function validateDocument(
  schema: StandardSchemaV1<unknown, JsonObject>,
  present: PresentProjectionValue,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<Validation> {
  const outcome = await race(
    async () => schema["~standard"].validate(present.document),
    timeoutMs,
    signal,
  );
  switch (outcome.kind) {
    case "aborted":
      return { kind: "aborted" };
    case "timeout":
      return {
        kind: "failure",
        failure: {
          reason: "projection_timeout",
          disposition: "retry",
          details: { stage: "schema" },
        },
      };
    case "threw":
      return {
        kind: "failure",
        failure: {
          reason: "schema_invalid",
          disposition: "poison",
          details: { stage: "validator_threw", ...errorNameOf(outcome.error) },
        },
      };
    case "value":
      return outcome.value.issues === undefined
        ? { kind: "ok", value: outcome.value.value }
        : { kind: "failure", failure: schemaFailure(outcome.value.issues) };
    default:
      return { kind: "aborted" };
  }
}

const canonicalErrorDetailsSchema = z.object({
  reason: z.string(),
  path: z.string().optional(),
});

function canonicalFailure(error: SearchProjectionError): Failure {
  const parsed = canonicalErrorDetailsSchema.safeParse(error.details);
  const reason = parsed.success ? parsed.data.reason : "invalid_projection";
  if (reason === "invalid_projection" || reason === "document_not_object") {
    return { reason, disposition: "poison" };
  }
  const path = parsed.success ? parsed.data.path : undefined;
  return {
    reason: "non_json_document",
    disposition: "poison",
    details: { violation: reason, path: path?.slice(0, MAX_PERSISTED_PATH_LENGTH) ?? null },
  };
}

type Finished = DocumentOutcome | { kind: "aborted" };

interface Context {
  readonly input: MaterializeGroupInput;
  readonly limits: z.output<typeof limitsSchema>;
}

function serializedLowerBound(root: JsonValue, limit: number): number | undefined {
  // A result over limit proves the real serialization is too; undefined leaves the exact reason to the real validation.
  const seen = new WeakSet<object>();
  const stack: { value: JsonValue; depth: number }[] = [{ value: root, depth: 0 }];
  let total = 0;
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const { value, depth } = frame;
    if (Object(value) !== value) {
      if (value === null || value === true) total += 4;
      else if (value === false) total += 5;
      else if (Object(value) instanceof String)
        total += Buffer.byteLength(String(value), "utf8") + 2;
      else if (Object(value) instanceof Number) total += String(value).length;
      else return undefined;
    } else {
      const target: object = Object(value);
      if (seen.has(target) || depth >= MAX_CANONICAL_DEPTH) return undefined;
      seen.add(target);
      const prototype: object | null = Object.getPrototypeOf(target);
      if (Array.isArray(target) && prototype === Array.prototype) {
        const items: readonly JsonValue[] = target;
        total += 2 + Math.max(0, items.length - 1);
        for (let index = items.length - 1; index >= 0; index -= 1) {
          if (total > limit) return total;
          const item = items[index];
          if (item === undefined) return undefined;
          stack.push({ value: item, depth: depth + 1 });
        }
      } else if (prototype === Object.prototype || prototype === null) {
        const keys = Object.keys(target);
        total += 2 + Math.max(0, keys.length - 1);
        for (const key of keys) {
          if (total > limit) return total;
          const descriptor = Object.getOwnPropertyDescriptor(target, key);
          if (descriptor === undefined || !("value" in descriptor)) return undefined;
          total += Buffer.byteLength(key, "utf8") + 3;
          const child: JsonValue = descriptor.value;
          stack.push({ value: child, depth: depth + 1 });
        }
      } else {
        return undefined;
      }
    }
    if (total > limit) return total;
  }
  return total;
}

const YIELD_INTERVAL_MS = 10;

function createYielder(): () => Promise<void> {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < YIELD_INTERVAL_MS) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    last = performance.now();
  };
}

async function finishDocument(
  context: Context,
  delivery: ClaimedDelivery,
  revision: number,
  value: ProjectionValue,
): Promise<Finished> {
  const { input, limits } = context;
  const fail = (failure: Failure) => failed(delivery, revision, failure);

  let candidate: Projection<JsonObject> = { state: "deleted" };
  if (value.state === "present") {
    if (input.deadlineAt !== undefined && performance.now() > input.deadlineAt) {
      return fail({ reason: "drain_deadline", disposition: "release" });
    }
    const validation = await validateDocument(
      input.definition.schema,
      value,
      limits.projectionTimeoutMs,
      input.signal,
    );
    if (validation.kind === "aborted") return { kind: "aborted" };
    if (validation.kind === "failure") return fail(validation.failure);
    // Over the cap by the lower bound alone: no copy, canonical JSON or hash is made.
    const lowerBound = serializedLowerBound(validation.value, limits.maxBulkBytes);
    if (lowerBound !== undefined && lowerBound > limits.maxBulkBytes) {
      return fail({
        reason: "oversized",
        disposition: "poison",
        details: { bytes: lowerBound, maxBytes: limits.maxBulkBytes, estimate: "lower-bound" },
      });
    }
    candidate = { state: "present", document: validation.value };
  }

  let parsed: ReturnType<typeof parseCanonicalProjection>;
  try {
    parsed = parseCanonicalProjection(candidate);
  } catch (error) {
    if (error instanceof SearchProjectionError) return fail(canonicalFailure(error));
    return fail({ reason: "invalid_projection", disposition: "poison" });
  }
  const { projection, canonical } = parsed;

  if (projection.state === "present") {
    const reserved = Object.keys(projection.document).find(isReservedDocumentField);
    if (reserved !== undefined) {
      return fail({
        reason: "reserved_field",
        disposition: "poison",
        details: { field: reserved.slice(0, MAX_ECHOED_FIELD_LENGTH) },
      });
    }
  }

  let checkedRevision: number;
  try {
    checkedRevision = assertRevision(revision);
  } catch {
    return fail({ reason: "invalid_revision", disposition: "poison" });
  }

  const projectionHash = sha256Hex(canonical);
  const meta = {
    revision: checkedRevision,
    hash_version: HASH_VERSION,
    projection_hash: projectionHash,
  };
  // The body is the very copy that was hashed.
  const envelope: SearchEnvelope =
    projection.state === "present"
      ? { sonamu_meta: { deleted: false, ...meta }, doc: projection.document }
      : { sonamu_meta: { deleted: true, ...meta } };

  const { bytes } = canonicalEnvelopeLine({
    meta: envelope.sonamu_meta,
    canonical: projection.state === "present" ? canonical : undefined,
  });
  if (bytes > limits.maxBulkBytes) {
    return fail({
      reason: "oversized",
      disposition: "poison",
      details: { bytes, maxBytes: limits.maxBulkBytes },
    });
  }

  return Object.freeze({
    kind: "materialized",
    delivery,
    revision: checkedRevision,
    projection,
    canonical,
    projectionHash,
    envelope,
  });
}

function failed(delivery: ClaimedDelivery, revision: number, failure: Failure): FailedDocument {
  const { reason, disposition } = failure;
  const details = { ...failure.details, reason, disposition };
  const error = new SearchProjectionError(
    { key: "materialize.documentFailed", params: { reason } },
    { retryable: disposition !== "poison", details },
  );
  const errorClass =
    disposition === "release"
      ? "materialize_released"
      : OWN_CLASS_REASONS.has(reason)
        ? reason
        : "projection_error";
  const recorded = { ...failure.details, ...failure.persisted };
  const deliveryError: DeliveryError =
    errorClass === reason
      ? { ...recorded, class: errorClass }
      : { ...recorded, code: reason, class: errorClass };
  return Object.freeze({
    kind: "failed",
    delivery,
    revision,
    disposition,
    reason,
    error,
    deliveryError,
  });
}

async function materializeCall(context: Context, ids: readonly DocumentId[]): Promise<CallOutcome> {
  // An overrunning call ends as infrastructure without waiting; the server's statement and idle limits clean up.
  const bound = context.input.callTimeoutMs;
  const running = runMaterializeCall(context, ids);
  if (bound === undefined) return running;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<CallOutcome>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          kind: "infrastructure",
          error: new SearchTimeout(
            { key: "error.timeout" },
            { details: { reason: "snapshot-timeout", timeoutMs: bound } },
          ),
        }),
      bound,
    );
  });
  try {
    return await Promise.race([running, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function runMaterializeCall(
  context: Context,
  ids: readonly DocumentId[],
): Promise<CallOutcome> {
  const { input, limits } = context;
  const { definition } = input;
  // Failures after the projection started are infrastructure; before it, they are statement failures.
  let projectionStarted = false;
  // Lock waits stop at half the budget and surface as 55P03 (infrastructure); at the full budget the JS timeout would
  // fire first and blame a table lock on the documents.
  const timeouts = {
    statementTimeoutMs: limits.projectionTimeoutMs,
    lockTimeoutMs: Math.max(1, Math.ceil(limits.projectionTimeoutMs / 2)),
    idleInTransactionTimeoutMs: limits.projectionTimeoutMs,
  };
  try {
    return await runInPrimarySnapshot(
      input.db,
      timeouts,
      async (snapshot: PrimarySnapshot): Promise<CallOutcome> => {
        const rows = await input.store.readLedger(snapshot.trx, {
          namespace: input.namespace,
          definition: definition.key,
          documentIds: ids,
        });
        const ledger = new Map(rows.map((row) => [row.documentId, row.revision]));
        const projected = ids.filter((id) => ledger.has(id));
        if (projected.length === 0) return { kind: "ok", ledger, results: new Map() };

        projectionStarted = true;
        const outcome = await race(
          (signal, deadlineAt) => {
            const readContext: ProjectionReadContext = {
              trx: snapshot.trx,
              signal,
              deadlineAt,
              namespace: input.namespace,
              logicalKey: definition.key,
            };
            return definition.materialize(readContext, projected);
          },
          limits.projectionTimeoutMs,
          input.signal,
        );
        switch (outcome.kind) {
          case "aborted":
            return { kind: "aborted" };
          case "timeout":
            return {
              kind: "failure",
              ledger,
              failure: {
                reason: "projection_timeout",
                disposition: "retry",
                details: { timeoutMs: limits.projectionTimeoutMs },
              },
            };
          case "threw": {
            const classified = classifyThrown(outcome.error);
            return classified.kind === "infrastructure"
              ? { kind: "infrastructure", error: classified.error, ledger }
              : { kind: "failure", ledger, failure: classified.failure };
          }
          case "value":
            break;
          default:
            return { kind: "aborted" };
        }
        // A projection that swallowed an SQL error or replaced the snapshot is not trusted.
        const integrity = await snapshot.verify();
        if (!integrity.intact) {
          return {
            kind: "failure",
            ledger,
            failure: { reason: integrity.reason, disposition: "poison" },
          };
        }
        const parsed = projectionResultSchema.safeParse(outcome.value);
        const requested = new Set(projected);
        if (!parsed.success || [...parsed.data.keys()].some((key) => !requested.has(key))) {
          return {
            kind: "failure",
            ledger,
            failure: { reason: "invalid_result", disposition: "poison" },
          };
        }
        return { kind: "ok", ledger, results: parsed.data };
      },
    );
  } catch (error) {
    if (error instanceof SearchConfigurationError) throw error;
    const mapped = mapPgError(error, "worker");
    return projectionStarted
      ? { kind: "infrastructure", error: mapped }
      : { kind: "statement-failure", error: mapped };
  }
}

const RESPONSIVE_FAILURES: ReadonlySet<DocumentFailureReason> = new Set([
  "invalid_result",
  "snapshot_aborted",
  "snapshot_replaced",
  "read_only_violation",
  "projection_sql_error",
]);

// Per primary: provenSeq orders the last completed projection; unproven records each unproven lone timeout's
// sequence.
interface PrimaryLiveness {
  provenSeq: number;
  readonly unproven: Map<string, number>;
}
const MAX_UNPROVEN_ENTRIES = 10_000;
let livenessSequence = 0;
const livenessByPrimary = new WeakMap<Knex, PrimaryLiveness>();

function livenessOf(db: Knex): PrimaryLiveness {
  const existing = livenessByPrimary.get(db);
  if (existing !== undefined) return existing;
  const created: PrimaryLiveness = { provenSeq: 0, unproven: new Map() };
  livenessByPrimary.set(db, created);
  return created;
}

function livenessKey(delivery: ClaimedDelivery): string {
  return JSON.stringify([delivery.targetId, delivery.documentId, delivery.intentId]);
}

function recordUnproven(liveness: PrimaryLiveness, key: string): void {
  liveness.unproven.delete(key);
  liveness.unproven.set(key, ++livenessSequence);
  while (liveness.unproven.size > MAX_UNPROVEN_ENTRIES) {
    const oldest = liveness.unproven.keys().next();
    if (oldest.done === true) break;
    liveness.unproven.delete(oldest.value);
  }
}

export async function materializeGroup(
  input: MaterializeGroupInput,
): Promise<MaterializeGroupResult> {
  const checkedInput = inputSchema.safeParse(input);
  if (!checkedInput.success) {
    throw invalidInput(String(checkedInput.error.issues[0]?.path[0] ?? "input"));
  }
  const limits = limitsSchema.safeParse(input.limits);
  if (!limits.success) throw invalidInput(`limits.${String(limits.error.issues[0]?.path[0])}`);

  const byId = new Map<DocumentId, ClaimedDelivery>();
  for (const delivery of input.deliveries) {
    if (byId.has(delivery.documentId)) throw invalidInput("deliveries");
    byId.set(delivery.documentId, delivery);
  }
  const context: Context = { input, limits: limits.data };
  const outcomes = new Map<DocumentId, DocumentOutcome>();
  const knownRevision = new Map<DocumentId, number>();
  const deliveryOf = (id: DocumentId): ClaimedDelivery => {
    const delivery = byId.get(id);
    if (delivery === undefined) throw invalidInput("deliveries");
    return delivery;
  };
  const revisionOf = (id: DocumentId) => knownRevision.get(id) ?? deliveryOf(id).claimedRevision;
  const settle = (ids: readonly DocumentId[], failure: Failure) => {
    for (const id of ids) outcomes.set(id, failed(deliveryOf(id), revisionOf(id), failure));
  };

  const { maxIsolationCallsPerBatch } = limits.data;
  const liveness = livenessOf(input.db);
  const keyOf = (id: DocumentId) => livenessKey(deliveryOf(id));
  const priorEvidence = (id: DocumentId): boolean => {
    const recorded = liveness.unproven.get(keyOf(id));
    return recorded !== undefined && recorded < liveness.provenSeq;
  };
  const anyPriorEvidence = [...byId.keys()].some(priorEvidence);

  // The worker's shared budget leaves the first call free; other callers' budget counts it.
  const budget = input.isolationBudget ?? { remaining: maxIsolationCallsPerBatch };
  const firstCallFree = input.isolationBudget !== undefined;
  const yieldIfDue = createYielder();
  const streamed = new Set<DocumentId>();
  let calls = 0;
  let infrastructureError: SearchError | undefined;
  let stop: Failure | undefined;
  let responsive = false;
  const loneTimeouts = new Map<DocumentId, Failure>();
  let level: DocumentId[][] = byId.size === 0 ? [] : [[...byId.keys()]];
  while (level.length > 0) {
    const next: DocumentId[][] = [];
    let levelCalls = 0;
    let levelTimeouts = 0;
    for (const ids of level) {
      if (stop === undefined && input.signal?.aborted === true) {
        stop = { reason: "aborted", disposition: "release" };
      }
      if (stop !== undefined) {
        settle(ids, stop);
        continue;
      }
      const first = calls === 0;
      // No call starts after the work window, so at most one started call overruns it.
      if (input.deadlineAt !== undefined && performance.now() > input.deadlineAt) {
        stop = { reason: "drain_deadline", disposition: "release" };
        settle(ids, stop);
        continue;
      }
      if (!(first && firstCallFree)) {
        if (budget.remaining <= 0) {
          settle(ids, { reason: "isolation_budget_exhausted", disposition: "release" });
          continue;
        }
        budget.remaining -= 1;
      }
      calls += 1;
      levelCalls += 1;
      const outcome = await materializeCall(context, ids);

      if (outcome.kind === "statement-failure" || outcome.kind === "infrastructure") {
        if (first && outcome.kind === "statement-failure") throw outcome.error;
        if (outcome.kind === "infrastructure") {
          for (const [id, revision] of outcome.ledger ?? []) knownRevision.set(id, revision);
        }
        infrastructureError = outcome.error;
        stop = {
          reason: "database_unavailable",
          disposition: "release",
          details: { code: outcome.error.code },
        };
        settle(ids, stop);
        continue;
      }
      if (outcome.kind === "aborted") {
        stop = { reason: "aborted", disposition: "release" };
        settle(ids, stop);
        continue;
      }

      for (const [id, revision] of outcome.ledger) knownRevision.set(id, revision);
      const missing = ids.filter((id) => !outcome.ledger.has(id));
      settle(missing, { reason: "ledger_missing", disposition: "poison" });
      const projected = ids.filter((id) => outcome.ledger.has(id));

      if (outcome.kind === "failure") {
        const timedOut = outcome.failure.reason === "projection_timeout";
        if (timedOut) levelTimeouts += 1;
        if (RESPONSIVE_FAILURES.has(outcome.failure.reason)) responsive = true;
        if (projected.length <= 1) {
          for (const id of projected) {
            if (timedOut) loneTimeouts.set(id, outcome.failure);
            else settle([id], outcome.failure);
          }
          continue;
        }
        const middle = Math.ceil(projected.length / 2);
        next.push(projected.slice(0, middle), projected.slice(middle));
        continue;
      }

      if (projected.length > 0) responsive = true;
      const pendingIds = () =>
        projected.filter((other) => !outcomes.has(other) && !streamed.has(other));
      for (const id of projected) {
        // Yields for the heartbeat timers between documents.
        await yieldIfDue();
        if (input.deadlineAt !== undefined && performance.now() > input.deadlineAt) {
          stop = { reason: "drain_deadline", disposition: "release" };
          settle(pendingIds(), stop);
          break;
        }
        const revision = outcome.ledger.get(id) ?? revisionOf(id);
        if (!outcome.results.has(id)) {
          outcomes.set(
            id,
            failed(deliveryOf(id), revision, {
              reason: "missing_projection",
              disposition: "poison",
            }),
          );
          continue;
        }
        const value = projectionValueSchema.safeParse(outcome.results.get(id));
        outcome.results.delete(id);
        if (!value.success) {
          outcomes.set(
            id,
            failed(deliveryOf(id), revision, {
              reason: "invalid_projection",
              disposition: "poison",
            }),
          );
          continue;
        }
        const finished = await finishDocument(context, deliveryOf(id), revision, value.data);
        if (finished.kind === "aborted") {
          stop = { reason: "aborted", disposition: "release" };
          settle(pendingIds(), stop);
          break;
        }
        if (finished.kind === "materialized" && input.onMaterialized !== undefined) {
          streamed.add(id);
          liveness.unproven.delete(keyOf(id));
          await input.onMaterialized(finished);
          continue;
        }
        outcomes.set(id, finished);
      }
    }
    // Every sibling half timed out without evidence: a database-wide slowdown, so bisection stops.
    if (
      stop === undefined &&
      !responsive &&
      !anyPriorEvidence &&
      levelCalls >= 2 &&
      levelTimeouts === levelCalls
    ) {
      for (const ids of next) {
        for (const id of ids) {
          loneTimeouts.set(id, { reason: "projection_timeout", disposition: "retry" });
        }
      }
      break;
    }
    level = next;
  }

  if (responsive) liveness.provenSeq = ++livenessSequence;
  let unproven = 0;
  for (const [id, failure] of loneTimeouts) {
    if (outcomes.has(id) || streamed.has(id)) continue;
    if (responsive || priorEvidence(id)) {
      liveness.unproven.delete(keyOf(id));
      outcomes.set(id, failed(deliveryOf(id), revisionOf(id), failure));
      continue;
    }
    unproven += 1;
    recordUnproven(liveness, keyOf(id));
    outcomes.set(
      id,
      failed(deliveryOf(id), revisionOf(id), {
        ...failure,
        disposition: "release",
        details: { ...failure.details, evidence: "none" },
      }),
    );
  }
  if (unproven > 0 && infrastructureError === undefined) {
    infrastructureError = new SearchTimeout(
      { key: "error.timeout" },
      {
        details: { reason: "projection-timeout-unproven", documents: unproven },
      },
    );
  }
  for (const [id, outcome] of outcomes) {
    if (outcome.kind === "materialized") liveness.unproven.delete(keyOf(id));
  }

  const documents = input.deliveries
    .filter((delivery) => !streamed.has(delivery.documentId))
    .map(
      (delivery) =>
        outcomes.get(delivery.documentId) ??
        failed(delivery, revisionOf(delivery.documentId), {
          reason: "aborted",
          disposition: "release",
        }),
    );
  return Object.freeze({
    documents: Object.freeze(documents),
    materializeCalls: calls,
    infrastructureError,
  });
}
