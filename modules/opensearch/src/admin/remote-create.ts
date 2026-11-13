import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  describeResponseFailure,
  readEngineErrorType,
  toSearchError,
} from "../client/error-normalization";
import { type NativeIndexSettings, type NativeTypeMapping } from "../client/sdk-types";
import { type SearchHttpResponse, type SearchRequester } from "../client/search-client";
import {
  canonicalizeJson,
  HASH_VERSION,
  type JsonObject,
  jsonObjectSchema,
  sha256HexSchema,
} from "../definition/canonical-json";
import { type DefinedSearch } from "../definition/define-search";
import {
  composeIndexMappings,
  readSearchIndexMeta,
  type SearchIndexMeta,
} from "../definition/envelope";
import {
  buildPhysicalIndexName,
  buildWriteAliasName,
  isLogicalKey,
  isNamespace,
  isTargetId,
} from "../definition/names";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchError,
  type SearchErrorDetail,
  SearchNotConfigured,
  SearchStopping,
  SearchTargetUnavailable,
  SearchUnavailable,
} from "../errors";
import {
  remoteStoreMismatch,
  requireStoreBinding,
  type StoreBindingSource,
} from "../postgres/store-binding";
import {
  type AdminOperation,
  type AdminTimeouts,
  type AdminStore,
  parseOperationRequest,
  runAdminOperation,
} from "./admin-lease";
import {
  acknowledgedSchema,
  aliasStateSchema,
  catNodesSchema,
  catPluginsSchema,
  indexMetaSchema,
} from "./remote-schemas";
import {
  adminContextSchema,
  type adminLifetimesSchema,
  type remoteCreateStateSchema,
} from "./rows";
import { type TargetHandle } from "./search-admin";
import {
  abandonRemoteCreate,
  beginRemoteCreate,
  finishRemoteCreate,
  readPlanState,
  readTargetIdentity,
  reconcileRemoteCreate,
  recordTargetIntent,
  registerTarget,
  type RegistrationInput,
} from "./targets";

type RemoteCreateState = z.infer<typeof remoteCreateStateSchema>;
type AdminLifetimes = z.infer<typeof adminLifetimesSchema>;
type DetailRecord = Record<string, SearchErrorDetail>;

export interface CreatePlan {
  logicalKey: string;
  namespace: string;
  fingerprint: string;
  hashVersion: string;
  targetId: string;
  physicalIndex: string;
  writeAlias: string;
  body: { settings: NativeIndexSettings; mappings: NativeTypeMapping };
  missingPlugins: readonly string[];
  captureEpoch: number;
  warnings: readonly string[];
}

// recordCreateAttempt commits an attempt token before PUT <index>, so a failure before it means no remote command.
// An attempt with an unknown result (timeout, dropped connection, 5xx, unreadable response) stays ambiguous until
// reconcileCreate. A creator that lost its token or lease undoes nothing remotely: this file never sends DELETE.

export interface RemoteCreateContext {
  readonly store: AdminStore;
  readonly requester: SearchRequester;
  readonly definitions: ReadonlyMap<string, DefinedSearch>;
  readonly lifetimes: AdminLifetimes;
  readonly binding: StoreBindingSource;
}

export const createPlanSchema = z.strictObject({
  logicalKey: z.string().refine(isLogicalKey),
  namespace: z.string().refine(isNamespace),
  fingerprint: sha256HexSchema,
  hashVersion: z.literal(HASH_VERSION),
  targetId: z.string().refine(isTargetId),
  physicalIndex: z.string(),
  writeAlias: z.string(),
  body: z.strictObject({ settings: jsonObjectSchema, mappings: jsonObjectSchema }),
  missingPlugins: z.array(z.string()),
  captureEpoch: z.number().int().min(1),
  warnings: z.array(z.string()),
});

const reconcileInputSchema = z.strictObject({ confirmQuiescent: z.literal(true) });
const targetIdArgumentSchema = z.string().refine(isTargetId);

function invalidPlan(field: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "admin.invalidPlan", params: { field } },
    { details: { reason: "invalid-create-plan", field } },
  );
}

function invalidRemoteResponse(operation: string): SearchUnavailable {
  return new SearchUnavailable(
    { key: "admin.invalidRemoteResponse", params: { operation } },
    { retryable: false, details: { reason: "invalid-remote-response", operation } },
  );
}

function refused(reason: string, targetId: string, extra: DetailRecord = {}) {
  const message =
    reason === "remote-create-ambiguous"
      ? ({ key: "admin.remoteCreateAmbiguous", params: { targetId } } as const)
      : ({ key: "admin.reconcileRefused", params: { targetId, reason } } as const);
  return new SearchAdminPreconditionFailed(message, {
    details: { ...extra, reason, targetId },
  });
}

function definitionForKey(context: RemoteCreateContext, logicalKey: string): DefinedSearch {
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

const planOptionsSchema = z.strictObject({ fingerprint: sha256HexSchema.optional() });

function selectDefinition(
  context: RemoteCreateContext,
  logicalKey: string,
  options: { fingerprint?: string },
): DefinedSearch {
  const parsed = planOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const path = `options.${String(parsed.error.issues[0]?.path[0] ?? "")}`;
    throw new SearchConfigurationError(
      { key: "admin.invalidOptions", params: { path } },
      { details: { reason: "invalid-admin-option", path } },
    );
  }
  const { fingerprint } = parsed.data;
  if (fingerprint === undefined) return definitionForKey(context, logicalKey);
  const definition = context.definitions.get(`${logicalKey}@${fingerprint}`);
  if (definition === undefined) {
    throw new SearchNotConfigured(
      { key: "admin.definitionNotRegistered", params: { logicalKey } },
      { details: { reason: "definition-not-registered", logicalKey, fingerprint } },
    );
  }
  return definition;
}

type CreateBody = {
  settings: JsonObject;
  mappings: JsonObject;
};

function computeNativeBody(
  namespace: string,
  definition: DefinedSearch,
  targetId: string,
  storeId: string,
): CreatePlan["body"] {
  return {
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
  };
}

function computeBody(
  namespace: string,
  definition: DefinedSearch,
  targetId: string,
  storeId: string,
): CreateBody {
  const native = computeNativeBody(namespace, definition, targetId, storeId);
  const settings = jsonObjectSchema.safeParse(native.settings);
  const parsedMappings = jsonObjectSchema.safeParse(native.mappings);
  if (!settings.success) throw invalidPlan("body.settings");
  if (!parsedMappings.success) throw invalidPlan("body.mappings");
  return { settings: settings.data, mappings: parsedMappings.data };
}

async function sendRead(
  requester: SearchRequester,
  path: string,
  querystring?: Readonly<Record<string, string>>,
): Promise<SearchHttpResponse> {
  return requester.send(
    querystring === undefined ? { method: "GET", path } : { method: "GET", path, querystring },
  );
}

function engineError(response: SearchHttpResponse): SearchError {
  return toSearchError(describeResponseFailure(response.status, response.body));
}

// _cat/plugins omits nodes without plugins, so the node list comes from _cat/nodes.
async function findMissingPlugins(
  requester: SearchRequester,
  definition: DefinedSearch,
): Promise<string[]> {
  if (definition.requiredPlugins.length === 0) return [];
  const nodesResponse = await sendRead(requester, "/_cat/nodes", { format: "json", h: "name" });
  if (nodesResponse.status !== 200) throw engineError(nodesResponse);
  const nodes = catNodesSchema.safeParse(nodesResponse.body);
  if (!nodes.success || nodes.data.length === 0) throw invalidRemoteResponse("cat-nodes");
  const pluginsResponse = await sendRead(requester, "/_cat/plugins", { format: "json" });
  if (pluginsResponse.status !== 200) throw engineError(pluginsResponse);
  const plugins = catPluginsSchema.safeParse(pluginsResponse.body);
  if (!plugins.success) throw invalidRemoteResponse("cat-plugins");
  const installed = new Set(plugins.data.map((row) => JSON.stringify([row.name, row.component])));
  return definition.requiredPlugins.filter(
    (plugin) => !nodes.data.every((node) => installed.has(JSON.stringify([node.name, plugin]))),
  );
}

export interface RemoteIdentity {
  targetId: string;
  physicalIndex: string;
  writeAlias: string;
  namespace: string;
  logicalKey: string;
  fingerprint: string;
  hashVersion: string;
  storeId: string;
}

type IndexMetaState = { kind: "missing" } | { kind: "present"; meta: SearchIndexMeta | undefined };

async function readIndexMeta(
  requester: SearchRequester,
  physicalIndex: string,
): Promise<IndexMetaState> {
  const response = await sendRead(requester, `/${encodeURIComponent(physicalIndex)}/_mapping`);
  if (
    response.status === 404 &&
    readEngineErrorType(response.body) === "index_not_found_exception"
  ) {
    return { kind: "missing" };
  }
  if (response.status !== 200) throw engineError(response);
  const parsed = indexMetaSchema.safeParse(response.body);
  if (!parsed.success) throw invalidRemoteResponse("get-mapping");
  const entries = Object.entries(parsed.data);
  if (entries.length !== 1 || entries[0][0] !== physicalIndex) {
    throw invalidRemoteResponse("get-mapping");
  }
  return { kind: "present", meta: readSearchIndexMeta(entries[0][1].mappings) };
}

type AliasState = { kind: "missing" } | { kind: "present"; indices: string[]; writeIndex: boolean };

// The alias stands in the index position: without an index the security plugin authorizes against all indices (*),
// which an admin role limited to snm-* fails with 403.
async function readAliasState(requester: SearchRequester, writeAlias: string): Promise<AliasState> {
  const alias = encodeURIComponent(writeAlias);
  const response = await sendRead(requester, `/${alias}/_alias/${alias}`);
  if (response.status === 404) return { kind: "missing" };
  if (response.status !== 200) throw engineError(response);
  const parsed = aliasStateSchema.safeParse(response.body);
  if (!parsed.success) throw invalidRemoteResponse("get-alias");
  const entries = Object.entries(parsed.data).filter(([, entry]) => writeAlias in entry.aliases);
  if (entries.length === 0) throw invalidRemoteResponse("get-alias");
  return {
    kind: "present",
    indices: entries.map(([index]) => index).toSorted(),
    writeIndex: entries.every(([, entry]) => entry.aliases[writeAlias]?.is_write_index === true),
  };
}

type RemoteVerdict =
  | "match"
  | "index-missing"
  | "meta-mismatch"
  | "store-mismatch"
  | "alias-missing"
  | "alias-mismatch";

export function compareMeta(
  meta: SearchIndexMeta | undefined,
  identity: Omit<RemoteIdentity, "physicalIndex" | "writeAlias">,
): "match" | "meta-mismatch" | "store-mismatch" {
  const same =
    meta !== undefined &&
    meta.target_id === identity.targetId &&
    meta.namespace === identity.namespace &&
    meta.logical_key === identity.logicalKey &&
    meta.fingerprint === identity.fingerprint &&
    meta.hash_version === identity.hashVersion;
  if (!same) return "meta-mismatch";
  if (meta.store_id !== undefined && meta.store_id !== identity.storeId) return "store-mismatch";
  return "match";
}

interface RemoteInspection {
  verdict: RemoteVerdict;
  remoteStoreId: string | null;
}

async function inspectRemote(
  requester: SearchRequester,
  identity: RemoteIdentity,
): Promise<RemoteInspection> {
  const index = await readIndexMeta(requester, identity.physicalIndex);
  if (index.kind === "missing") return { verdict: "index-missing", remoteStoreId: null };
  const meta = compareMeta(index.meta, identity);
  if (meta !== "match") {
    return { verdict: meta, remoteStoreId: index.meta?.store_id ?? null };
  }
  const alias = await readAliasState(requester, identity.writeAlias);
  if (alias.kind === "missing") return { verdict: "alias-missing", remoteStoreId: null };
  if (
    alias.indices.length !== 1 ||
    alias.indices[0] !== identity.physicalIndex ||
    !alias.writeIndex
  ) {
    return { verdict: "alias-mismatch", remoteStoreId: null };
  }
  return { verdict: "match", remoteStoreId: null };
}

type CreateOutcome =
  | { kind: "verified"; detail: DetailRecord }
  | { kind: "refused"; error: SearchError; detail: DetailRecord }
  | {
      kind: "rejected";
      reason: "remote-create-rejected" | "remote-index-conflict";
      detail: DetailRecord;
    }
  | { kind: "ambiguous"; detail: DetailRecord };

type CauseDetail = {
  cause: string;
  causeReason: string | null;
};

function errorDetail<Thrown>(error: Thrown): CauseDetail {
  if (!(error instanceof SearchError)) return { cause: "unclassified", causeReason: null };
  const reason = z.looseObject({ reason: z.string() }).safeParse(error.details ?? {});
  return {
    cause: error.code,
    causeReason: reason.success ? reason.data.reason.slice(0, 120) : null,
  };
}

async function verifyAfterCreate(
  requester: SearchRequester,
  identity: RemoteIdentity,
  alreadyExisted: boolean,
): Promise<CreateOutcome> {
  let verdict: RemoteVerdict;
  try {
    verdict = (await inspectRemote(requester, identity)).verdict;
  } catch (error) {
    return { kind: "ambiguous", detail: { ...errorDetail(error), phase: "read-back" } };
  }
  const detail = { readBack: verdict, alreadyExisted };
  if (verdict === "match") return { kind: "verified", detail };
  // A pre-existing index of another identity is neither adopted nor deleted.
  if (alreadyExisted && verdict !== "index-missing") {
    return { kind: "rejected", reason: "remote-index-conflict", detail };
  }
  return { kind: "ambiguous", detail };
}

async function sendCreate(
  requester: SearchRequester,
  identity: RemoteIdentity,
  body: { settings: JsonObject; mappings: JsonObject },
): Promise<CreateOutcome> {
  let response: SearchHttpResponse;
  try {
    response = await requester.send({
      method: "PUT",
      path: `/${encodeURIComponent(identity.physicalIndex)}`,
      body: {
        settings: body.settings,
        aliases: { [identity.writeAlias]: { is_write_index: true } },
        mappings: body.mappings,
      },
    });
  } catch (error) {
    // A closed client refuses before sending, so the command certainly did not go out.
    if (error instanceof SearchStopping)
      return { kind: "refused", error, detail: errorDetail(error) };
    return { kind: "ambiguous", detail: errorDetail(error) };
  }
  const { status } = response;
  if (status >= 200 && status < 300) {
    const ack = acknowledgedSchema.safeParse(response.body);
    if (
      !ack.success ||
      (ack.data.index !== undefined && ack.data.index !== identity.physicalIndex)
    ) {
      return { kind: "ambiguous", detail: { status, cause: "invalid-remote-response" } };
    }
    return verifyAfterCreate(requester, identity, false);
  }
  const type = readEngineErrorType(response.body);
  if (status === 400 && type === "resource_already_exists_exception") {
    return verifyAfterCreate(requester, identity, true);
  }
  if (status === 400 && type !== "unknown") {
    return { kind: "rejected", reason: "remote-create-rejected", detail: { status, type } };
  }
  if (status === 401 || status === 403 || status === 429) {
    const error = new SearchUnavailable(
      { key: "admin.remoteCreateRefused", params: { targetId: identity.targetId, status } },
      { details: { reason: "remote-create-refused", targetId: identity.targetId, status, type } },
    );
    return { kind: "refused", error, detail: { status, type } };
  }
  return { kind: "ambiguous", detail: { status, type } };
}

export async function attemptRemoteCreate(
  operation: AdminOperation,
  requester: SearchRequester,
  identity: RemoteIdentity,
  body: { settings: JsonObject; mappings: JsonObject },
): Promise<void> {
  const attemptToken = randomUUID();
  // Renew right before the attempt record so the command and its result record finish within the lease.
  await operation.heartbeat();
  await beginRemoteCreate(operation, identity.targetId, attemptToken);
  const outcome = await sendCreate(requester, identity, body);
  switch (outcome.kind) {
    case "verified":
      await finishRemoteCreate(
        operation,
        identity.targetId,
        attemptToken,
        "verified",
        outcome.detail,
      );
      return;
    case "refused":
      await finishRemoteCreate(
        operation,
        identity.targetId,
        attemptToken,
        "not_started",
        outcome.detail,
      );
      throw outcome.error;
    case "ambiguous":
      await finishRemoteCreate(
        operation,
        identity.targetId,
        attemptToken,
        "ambiguous",
        outcome.detail,
      );
      throw refused("remote-create-ambiguous", identity.targetId, outcome.detail);
    case "rejected": {
      await abandonRemoteCreate(operation, identity.targetId, attemptToken, outcome.detail);
      const params = { targetId: identity.targetId };
      throw new SearchAdminPreconditionFailed(
        outcome.reason === "remote-index-conflict"
          ? { key: "admin.remoteIndexConflict", params }
          : { key: "admin.remoteCreateRejected", params },
        { details: { ...outcome.detail, reason: outcome.reason, targetId: identity.targetId } },
      );
    }
  }
}

export const MIN_LEASED_REMOTE_REQUEST_MS = 1_000;
const LEASED_REMOTE_REQUESTS = 3;
const LEASE_WAITING_STATEMENTS = 4;

// Until the result record's fence, LEASE_WAITING_STATEMENTS statement timeouts and LEASED_REMOTE_REQUESTS requests can
// pass after a renewal, so one request gets (adminLeaseMs − 4 × statementTimeoutMs) / 3.
export function leasedRemoteRequestTimeoutMs(timeouts: AdminTimeouts): number {
  const margin = LEASE_WAITING_STATEMENTS * timeouts.statementTimeoutMs;
  const perRequest = Math.floor((timeouts.adminLeaseMs - margin) / LEASED_REMOTE_REQUESTS);
  if (perRequest < MIN_LEASED_REMOTE_REQUEST_MS) {
    const requiredMs = margin + LEASED_REMOTE_REQUESTS * MIN_LEASED_REMOTE_REQUEST_MS;
    throw new SearchConfigurationError(
      { key: "admin.leaseTooShort", params: { leaseMs: timeouts.adminLeaseMs, requiredMs } },
      {
        details: {
          reason: "admin-lease-too-short",
          adminLeaseMs: timeouts.adminLeaseMs,
          statementTimeoutMs: timeouts.statementTimeoutMs,
          requiredMs,
        },
      },
    );
  }
  return perRequest;
}

export function leaseBoundRequester(context: RemoteCreateContext): SearchRequester {
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

export async function verifyRegistered(
  requester: SearchRequester,
  identity: RemoteIdentity,
): Promise<void> {
  const { verdict, remoteStoreId } = await inspectRemote(requester, identity);
  if (verdict === "match") return;
  if (verdict === "store-mismatch" && remoteStoreId !== null) {
    throw remoteStoreMismatch(identity.storeId, identity.targetId, remoteStoreId);
  }
  const reason =
    verdict === "index-missing" || verdict === "alias-missing"
      ? "registered-target-missing-remote"
      : "registered-target-remote-mismatch";
  throw new SearchTargetUnavailable(
    { key: "admin.registeredTargetUnavailable", params: { targetId: identity.targetId, reason } },
    { details: { reason, targetId: identity.targetId, remote: verdict } },
  );
}

export async function planCreate(
  context: RemoteCreateContext,
  logicalKey: string,
  options: { fingerprint?: string } = {},
): Promise<CreatePlan> {
  if (!isLogicalKey(logicalKey)) {
    throw new SearchConfigurationError(
      { key: "names.invalidLogicalKey", params: { name: String(logicalKey).slice(0, 80) } },
      { details: { reason: "invalid-logical-key" } },
    );
  }
  const definition = selectDefinition(context, logicalKey, options);
  const { namespace } = context.store;
  // Planning has no remote effect, so a binding mismatch is not refused here.
  const { storeId } = await context.binding.checkBinding();
  const state = await readPlanState(context.store, logicalKey);
  const missingPlugins = await findMissingPlugins(context.requester, definition);
  const targetId = randomUUID();
  const physicalIndex = buildPhysicalIndexName(namespace, logicalKey, targetId);
  const body = computeNativeBody(namespace, definition, targetId, storeId);
  computeBody(namespace, definition, targetId, storeId);
  const warnings: string[] = [];
  if (state.captureMode !== "active") warnings.push("capture-suspended");
  if (state.liveTargets > 0) warnings.push("index-has-live-target");
  if (missingPlugins.length > 0) warnings.push("plugins-missing");
  return Object.freeze({
    logicalKey,
    namespace,
    fingerprint: definition.fingerprint,
    hashVersion: definition.hashVersion,
    targetId,
    physicalIndex,
    writeAlias: buildWriteAliasName(physicalIndex),
    body,
    missingPlugins: Object.freeze(missingPlugins),
    captureEpoch: state.captureEpoch,
    warnings: Object.freeze(warnings),
  });
}

interface CheckedPlan {
  definition: DefinedSearch;
  identity: RemoteIdentity;
  body: { settings: JsonObject; mappings: JsonObject };
}

export function checkPlan(
  context: RemoteCreateContext,
  plan: CreatePlan,
  storeId: string,
): CheckedPlan {
  const parsed = createPlanSchema.safeParse(plan);
  if (!parsed.success) {
    throw invalidPlan(String(parsed.error.issues[0]?.path[0] ?? "plan").slice(0, 40));
  }
  const input = parsed.data;
  if (input.namespace !== context.store.namespace) throw invalidPlan("namespace");
  const definition = context.definitions.get(`${input.logicalKey}@${input.fingerprint}`);
  if (definition === undefined) {
    throw new SearchNotConfigured(
      { key: "admin.definitionNotRegistered", params: { logicalKey: input.logicalKey } },
      { details: { reason: "definition-not-registered", logicalKey: input.logicalKey } },
    );
  }
  const physicalIndex = buildPhysicalIndexName(input.namespace, input.logicalKey, input.targetId);
  if (input.physicalIndex !== physicalIndex) throw invalidPlan("physicalIndex");
  if (input.writeAlias !== buildWriteAliasName(physicalIndex)) throw invalidPlan("writeAlias");
  const body = computeBody(input.namespace, definition, input.targetId, storeId);
  // The body sent remotely is always the recomputed one.
  if (canonicalizeJson(body) !== canonicalizeJson(input.body)) throw invalidPlan("body");
  return {
    definition,
    body,
    identity: {
      targetId: input.targetId,
      physicalIndex,
      writeAlias: input.writeAlias,
      namespace: input.namespace,
      logicalKey: input.logicalKey,
      fingerprint: input.fingerprint,
      hashVersion: input.hashVersion,
      storeId,
    },
  };
}

function parseAudit(audit: z.input<typeof adminContextSchema>): z.infer<typeof adminContextSchema> {
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

export interface ExecuteCreateOptions {
  registration: Omit<RegistrationInput, "targetId">;
  checkedStoreId?: string;
}

export async function executeCreate(
  context: RemoteCreateContext,
  plan: CreatePlan,
  audit: z.input<typeof adminContextSchema>,
  options: ExecuteCreateOptions = { registration: { kind: "initial", oldTargetId: null } },
): Promise<TargetHandle> {
  const auditContext = parseAudit(audit);
  const storeId = options.checkedStoreId ?? (await requireStoreBinding(context.binding)).storeId;
  const { definition, identity, body } = checkPlan(context, plan, storeId);
  const leased = leaseBoundRequester(context);
  const missing = await findMissingPlugins(context.requester, definition);
  if (missing.length > 0) {
    throw new SearchAdminPreconditionFailed(
      {
        key: "admin.pluginsMissing",
        params: { logicalKey: identity.logicalKey, count: missing.length },
      },
      {
        details: {
          reason: "plugins-missing",
          logicalKey: identity.logicalKey,
          count: missing.length,
        },
      },
    );
  }
  const request = parseOperationRequest({
    logicalKey: identity.logicalKey,
    kind: "create",
    ...auditContext,
  });
  return runAdminOperation(context.store, request, async (operation) => {
    const initial = options.registration.kind === "initial";
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
      { requireActiveCapture: true, exclusiveInitial: initial },
    );
    const handle = (captureEpoch: number, remoteCreateState: RemoteCreateState): TargetHandle => ({
      targetId: identity.targetId,
      physicalIndex: identity.physicalIndex,
      writeAlias: identity.writeAlias,
      fingerprint: identity.fingerprint,
      captureEpoch,
      remoteCreateState,
    });
    if (intent.action === "registered") {
      await verifyRegistered(leased, identity);
      await operation.audit(context.store.primary(), {
        outcome: "succeeded",
        targetId: identity.targetId,
        detail: { step: "verify-registered" },
      });
      return handle(intent.captureEpoch, "verified");
    }
    if (intent.action === "recorded" || intent.action === "create-pending") {
      await attemptRemoteCreate(operation, leased, identity, body);
    }
    const registered = await registerTarget(operation, {
      targetId: identity.targetId,
      ...options.registration,
    });
    return handle(registered.captureEpoch, "verified");
  });
}

export async function reconcileCreate(
  context: RemoteCreateContext,
  targetId: string,
  input: { confirmQuiescent: true },
  audit: z.input<typeof adminContextSchema>,
): Promise<TargetHandle> {
  if (!targetIdArgumentSchema.safeParse(targetId).success) {
    throw new SearchConfigurationError(
      { key: "names.invalidTargetId", params: { name: String(targetId).slice(0, 80) } },
      { details: { reason: "invalid-target-id" } },
    );
  }
  if (!reconcileInputSchema.safeParse(input).success) {
    throw new SearchAdminPreconditionFailed(
      { key: "admin.quiescenceNotConfirmed", params: { targetId } },
      { details: { reason: "quiescence-not-confirmed", targetId } },
    );
  }
  const auditContext = parseAudit(audit);
  const { store } = context;
  const leased = leaseBoundRequester(context);
  const { storeId } = await requireStoreBinding(context.binding);
  const notFound = () =>
    new SearchNotConfigured(
      { key: "admin.targetNotFound", params: { targetId } },
      { details: { reason: "target-not-found", targetId } },
    );
  const before = await readTargetIdentity(store, targetId);
  if (before === undefined || before.namespace !== store.namespace) throw notFound();
  const request = parseOperationRequest({
    logicalKey: before.definition,
    kind: "reconcile-create",
    ...auditContext,
  });
  return runAdminOperation(store, request, async (operation) => {
    await operation.acquire();
    const row = await readTargetIdentity(store, targetId);
    if (row === undefined) throw notFound();
    if (
      row.state !== "creating" ||
      (row.remote_create_state !== "in_flight" && row.remote_create_state !== "ambiguous")
    ) {
      throw refused("remote-create-not-unresolved", targetId, {
        state: row.state,
        remoteCreateState: row.remote_create_state,
      });
    }
    const identity: RemoteIdentity = {
      targetId,
      physicalIndex: row.physical_index,
      writeAlias: row.write_alias,
      namespace: row.namespace,
      logicalKey: row.definition,
      fingerprint: row.fingerprint,
      hashVersion: row.hash_version,
      storeId,
    };
    const { verdict, remoteStoreId } = await inspectRemote(leased, identity);
    // An index another store created with the same identity is neither adopted nor abandoned.
    if (verdict === "store-mismatch" && remoteStoreId !== null) {
      throw remoteStoreMismatch(storeId, targetId, remoteStoreId);
    }
    const result = verdict === "match" ? "verified" : "abandoned";
    const reconciled = await reconcileRemoteCreate(operation, targetId, result, {
      remote: verdict,
    });
    return {
      targetId,
      physicalIndex: row.physical_index,
      writeAlias: row.write_alias,
      fingerprint: row.fingerprint,
      captureEpoch: row.capture_epoch,
      remoteCreateState: reconciled.remote_create_state,
    };
  });
}
