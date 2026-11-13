import { describeResponseFailure, toSearchError } from "../client/error-normalization";
import { remainingMs, startDeadline } from "../client/request-limits";
import { type NativeSearchBody } from "../client/sdk-types";
import {
  getSearchRequester,
  type SearchClient,
  type SearchHttpResponse,
  type SearchRequester,
} from "../client/search-client";
import { HASH_VERSION, type JsonObject } from "../definition/canonical-json";
import { type DocumentId, type Revision } from "../definition/define-search";
import {
  SearchCatalogUnavailable,
  SearchConfigurationError,
  SearchCursorExpired,
  SearchDefinitionMismatch,
  SearchError,
  SearchNotConfigured,
  SearchNotReady,
  SearchQueryInvalid,
  SearchRebuildRequired,
  SearchTargetUnavailable,
  SearchTimeout,
  SearchUnavailable,
} from "../errors";
import { prepareSearchBody, type PreparedSearchBody, type SourcePolicy } from "./body-allowlist";
import {
  type CatalogReadOptions,
  type ReadLifetimeLimits,
  type ReadTarget,
  type SearchCatalogReader,
} from "./catalog";
import { type CursorKey, decodeCursor, encodeCursor } from "./cursor";
import {
  closeCursorInputSchema,
  DEFAULT_QUERY_BODY_BYTES,
  type CursorPayload,
  isTargetIndexConsistent,
  issuePath,
  type ParsedSearchResponse,
  pitCreateResponseSchema,
  readHeadsResultSchema,
  resolvedTargetSchema,
  searchInputSchema,
  searchQueriesOptionsSchema,
  searchResponseSchema,
  type SortValue,
} from "./schemas";

/** OpenSearch may return null for a document without the sort field. */
export type SearchSortValue = SortValue;

export interface SearchCandidate<TDocument> {
  id: DocumentId;
  revision: Revision;
  score: number | null;
  sort?: readonly SearchSortValue[];
  /** Only the requested doc fields the policy allows; absent when none is requested. */
  source?: TDocument;
  highlight?: Record<string, string[]>;
}

export interface SearchCandidates<TDocument> {
  target: { targetId: string; fingerprint: string; readGeneration: number };
  hits: readonly SearchCandidate<TDocument>[];
  total?: { value: number; relation: "eq" | "gte" };
  timedOut: boolean;
  nextCursor?: string;
}

export interface SearchInput {
  body: NativeSearchBody;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Continues on the target the cursor pinned, never on another. */
  cursor?: string;
  /** In bytes after decompression; can only lower the handle's and the client's caps. */
  maxResponseBytes?: number;
  /** Requests a nextCursor; the body must have a sort. `pit` pins the pages to a point in time. */
  paginate?: { pit?: boolean };
}

export interface SearchQueries<TDocument> {
  search(input: SearchInput): Promise<SearchCandidates<TDocument>>;
  /** Releases the cursor's point in time early; a no-op without one or when already closed. */
  closeCursor(cursor: string, options?: { signal?: AbortSignal }): Promise<void>;
}

/** `secret` must have at least 32 bytes. */
export interface CursorSigningKey {
  id: string;
  secret: Uint8Array;
}

export interface SearchQueriesOptions {
  client: SearchClient;
  catalog: SearchCatalogReader;
  logicalKey: string;
  supportedFingerprints: readonly string[];
  limits: {
    maxPageSize: number;
    timeoutMs: number;
    /** Capped at the client's maxResponseBytes. */
    maxResponseBytes?: number;
    /** Search body cap in JSON bytes; default 1 MiB, at most 16 MiB. */
    maxQueryBodyBytes?: number;
  } & ReadLifetimeLimits;
  /** Signs with the first key and verifies with all, for key rotation. */
  cursor?: { signingKeys: readonly [CursorSigningKey, ...CursorSigningKey[]] };
  policy?: { allowTrackTotalHits?: boolean; sourceIncludes?: readonly string[] };
}

export interface SearchQueriesHooks {
  assertNoAmbientTransaction?: () => void;
}

const READABLE_STATES = new Set(["active", "paused"]);
const LIFETIME_KEYS = ["maxSearchLifetimeMs", "maxCursorLifetimeMs", "maxPitKeepAliveMs"] as const;

interface Operation {
  readonly signal: AbortSignal;
  remaining(): number;
  dispose(): void;
  maxResponseBytes?: number;
}

function startOperation(timeoutMs: number, callerSignal: AbortSignal | undefined): Operation {
  const deadline = startDeadline(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new SearchTimeout(
        { key: "error.timeout" },
        { details: { reason: "search-deadline", timeoutMs } },
      ),
    );
  }, timeoutMs);
  const signal =
    callerSignal === undefined
      ? controller.signal
      : AbortSignal.any([callerSignal, controller.signal]);
  return { signal, remaining: () => remainingMs(deadline), dispose: () => clearTimeout(timer) };
}

function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      promise.catch(() => undefined);
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function optionsError(path: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "query.invalidOptions", params: { path } },
    { details: { reason: "invalid-query-option", path } },
  );
}

function inputError(path: string): SearchQueryInvalid {
  const shown = path === "" ? "input" : path;
  return new SearchQueryInvalid(
    { key: "query.invalidInput", params: { path: shown } },
    { details: { reason: "invalid-search-input", path: shown } },
  );
}

function cursorsNotConfigured(): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "query.cursorsNotConfigured" },
    { details: { reason: "cursors-not-configured" } },
  );
}

function invalidCatalogResult(): SearchCatalogUnavailable {
  return new SearchCatalogUnavailable(
    { key: "query.invalidCatalogResult" },
    { retryable: false, details: { reason: "invalid-catalog-result" } },
  );
}

function invalidSearchResponse(): SearchUnavailable {
  return new SearchUnavailable(
    { key: "client.invalidResponse" },
    { retryable: false, details: { reason: "invalid-search-response" } },
  );
}

function isSuccess(response: SearchHttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

function searchFailure(response: SearchHttpResponse, viaPit: boolean): SearchError {
  // On a PIT search, 404 means the PIT closed or expired; other 400s (keep_alive over the limit) cannot be told apart
  // from a bad query. A missing index never falls back to another index.
  const failure = describeResponseFailure(response.status, response.body);
  if (failure.kind === "response") {
    const { status, type } = failure;
    if (viaPit && status === 404) {
      return new SearchCursorExpired(
        { key: "cursor.pitClosed" },
        { details: { reason: "pit-closed", status, type } },
      );
    }
    if (viaPit && status === 400 && type === "action_request_validation_exception") {
      return new SearchQueryInvalid(
        { key: "query.pitRequestRejected" },
        { details: { reason: "pit-request-rejected", status, type } },
      );
    }
    if (status === 404 && type === "index_not_found_exception") {
      return new SearchTargetUnavailable(
        { key: "query.targetIndexMissing" },
        { details: { reason: "index-not-found", status, type } },
      );
    }
  }
  return toSearchError(failure);
}

function pitCreateFailure(response: SearchHttpResponse): SearchError {
  // The create request has no caller body, so a 400 refuses the PIT itself (keep_alive over max_keep_alive).
  const failure = describeResponseFailure(response.status, response.body);
  if (failure.kind === "response" && failure.status === 400) {
    return new SearchQueryInvalid(
      { key: "query.pitRequestRejected" },
      { details: { reason: "pit-request-rejected", status: failure.status, type: failure.type } },
    );
  }
  return searchFailure(response, false);
}

/**
 * Creates a managed search handle; the factory only validates options. Do not call search inside an active
 * application transaction: the catalog read takes a second pool connection, and only the /sonamu entry point refuses
 * that.
 */
export function createSearchQueries<TDocument extends JsonObject>(
  options: SearchQueriesOptions,
): SearchQueries<TDocument> {
  return createGuardedSearchQueries<TDocument>(options, {});
}

export function createGuardedSearchQueries<TDocument extends JsonObject>(
  options: SearchQueriesOptions,
  hooks: SearchQueriesHooks,
): SearchQueries<TDocument> {
  const parsed = searchQueriesOptionsSchema.safeParse(options);
  if (!parsed.success) throw optionsError(issuePath(parsed.error.issues[0]));
  const { logicalKey, limits } = parsed.data;
  if (limits.timeoutMs > limits.maxSearchLifetimeMs) {
    throw new SearchConfigurationError(
      {
        key: "query.timeoutExceedsSearchLifetime",
        params: { timeoutMs: limits.timeoutMs, maxSearchLifetimeMs: limits.maxSearchLifetimeMs },
      },
      { details: { reason: "timeout-exceeds-search-lifetime" } },
    );
  }
  const keys: CursorKey[] | undefined = parsed.data.cursor?.signingKeys.map((key) => ({
    id: key.id,
    // Copied so a later change to the caller's array cannot change the key.
    secret: Uint8Array.from(key.secret),
  }));
  const seenKeyIds = new Set<string>();
  for (const key of keys ?? []) {
    if (seenKeyIds.has(key.id)) {
      throw new SearchConfigurationError(
        { key: "query.duplicateSigningKey", params: { keyId: key.id } },
        { details: { reason: "duplicate-signing-key", keyId: key.id } },
      );
    }
    seenKeyIds.add(key.id);
  }
  const policy: SourcePolicy = {
    allowTrackTotalHits: parsed.data.policy?.allowTrackTotalHits ?? false,
    sourceIncludes: [...(parsed.data.policy?.sourceIncludes ?? [])],
  };
  const supported = new Set(parsed.data.supportedFingerprints);
  const catalog = options.catalog;
  const requester: SearchRequester = getSearchRequester(options.client);

  async function callCatalog<T>(
    operation: Operation,
    run: (readOptions: CatalogReadOptions) => Promise<T>,
  ): Promise<T> {
    try {
      const pending = (async () =>
        run({ signal: operation.signal, timeoutMs: Math.max(1, operation.remaining()) }))();
      return await raceSignal(pending, operation.signal);
    } catch (error) {
      if (operation.signal.aborted) throw operation.signal.reason;
      if (error instanceof SearchError) throw error;
      // Catalog implementation errors (pg or knex messages) are not carried.
      throw new SearchCatalogUnavailable(
        { key: "query.catalogFailed" },
        { details: { reason: "catalog-failed" } },
      );
    }
  }

  function assertLifetimes(catalogLimits: ReadLifetimeLimits): void {
    for (const limit of LIFETIME_KEYS) {
      if (limits[limit] > catalogLimits[limit]) {
        throw new SearchConfigurationError(
          {
            key: "query.lifetimeExceedsCatalog",
            params: { limit, configured: limits[limit], maximum: catalogLimits[limit] },
          },
          { details: { reason: "lifetime-exceeds-catalog", limit } },
        );
      }
    }
  }

  function assertSupportedTarget(target: ReadTarget): void {
    if (!supported.has(target.fingerprint)) {
      throw new SearchDefinitionMismatch(
        {
          key: "query.unsupportedFingerprint",
          params: { logicalKey, fingerprint: target.fingerprint },
        },
        { details: { reason: "unsupported-fingerprint", fingerprint: target.fingerprint } },
      );
    }
    if (target.hashVersion !== HASH_VERSION) {
      throw new SearchDefinitionMismatch(
        {
          key: "query.unsupportedHashVersion",
          params: { logicalKey, hashVersion: target.hashVersion },
        },
        { details: { reason: "unsupported-hash-version", hashVersion: target.hashVersion } },
      );
    }
  }

  function closePitQuietly(pitId: string): void {
    // Not awaited; on failure the engine closes the PIT once keep_alive passes.
    requester
      .send({ method: "DELETE", path: "/_search/point_in_time", body: { pit_id: [pitId] } })
      .catch(() => undefined);
  }

  async function openPit(
    operation: Operation,
    physicalIndex: string,
    keepAliveMs: number,
  ): Promise<string> {
    const response = await requester.send(
      {
        method: "POST",
        path: `/${encodeURIComponent(physicalIndex)}/_search/point_in_time`,
        querystring: { keep_alive: `${keepAliveMs}ms` },
      },
      { signal: operation.signal, timeoutMs: operation.remaining() },
    );
    if (!isSuccess(response)) throw pitCreateFailure(response);
    const created = pitCreateResponseSchema.safeParse(response.body);
    if (!created.success) throw invalidSearchResponse();
    return created.data.pit_id;
  }

  async function runSearch(
    operation: Operation,
    physicalIndex: string,
    prepared: PreparedSearchBody,
    searchAfter: readonly SortValue[] | undefined,
    pit: { id: string; keepAliveMs: number } | undefined,
  ): Promise<ParsedSearchResponse> {
    const body: JsonObject = { ...prepared.base, size: prepared.size };
    if (searchAfter !== undefined) body.search_after = [...searchAfter];
    // The engine refuses (400) a PIT search that also names an index.
    if (pit !== undefined) {
      body.pit = { id: pit.id, keep_alive: `${pit.keepAliveMs}ms` };
    }
    const response = await requester.send(
      {
        method: "POST",
        path: pit === undefined ? `/${encodeURIComponent(physicalIndex)}/_search` : "/_search",
        body,
      },
      operation.maxResponseBytes === undefined
        ? { signal: operation.signal, timeoutMs: operation.remaining() }
        : {
            signal: operation.signal,
            timeoutMs: operation.remaining(),
            maxResponseBytes: operation.maxResponseBytes,
          },
    );
    if (!isSuccess(response)) throw searchFailure(response, pit !== undefined);
    const parsedResponse = searchResponseSchema.safeParse(response.body);
    if (!parsedResponse.success) throw invalidSearchResponse();
    return parsedResponse.data;
  }

  function toCandidates(
    response: ParsedSearchResponse,
    prepared: PreparedSearchBody,
  ): SearchCandidate<TDocument>[] {
    return response.hits.hits.map((hit) => {
      const candidate: SearchCandidate<TDocument> = {
        id: hit._id,
        revision: hit._source.sonamu_meta.revision,
        score: hit._score ?? null,
      };
      if (hit.sort !== undefined) candidate.sort = hit.sort;
      if (prepared.sourceFields.length > 0) {
        // SAFETY: a partial document of policy-allowed doc fields, typed as the public API declares.
        candidate.source = (hit._source.doc ?? {}) as TDocument;
      }
      if (hit.highlight !== undefined) candidate.highlight = hit.highlight;
      return candidate;
    });
  }

  interface PageContext {
    target: ReadTarget;
    readGeneration: number;
    issuedAt: number;
    expiresAt: number;
    databaseNow: () => number;
    consumed: number;
    pitId: string | undefined;
    wantsCursor: boolean;
  }

  function finishPage(
    response: ParsedSearchResponse,
    prepared: PreparedSearchBody,
    context: PageContext,
  ): SearchCandidates<TDocument> {
    const hits = toCandidates(response, prepared);
    const pitId = response.pit_id ?? context.pitId;
    const last = response.hits.hits.at(-1);
    let nextCursor: string | undefined;
    try {
      // Only a full page with cursor lifetime left gets a next cursor; iat stays the first issue time.
      if (
        context.wantsCursor &&
        keys !== undefined &&
        prepared.size > 0 &&
        hits.length === prepared.size &&
        last?.sort !== undefined &&
        last.sort.length > 0 &&
        context.databaseNow() < context.expiresAt
      ) {
        const [signingKey] = keys;
        if (signingKey !== undefined) {
          const payload: CursorPayload = {
            v: 1,
            tid: context.target.targetId,
            fp: context.target.fingerprint,
            qh: prepared.queryHash,
            iat: context.issuedAt,
            exp: context.expiresAt,
            sa: last.sort,
            n: context.consumed + hits.length,
            g: context.readGeneration,
          };
          if (pitId !== undefined) payload.pit = pitId;
          nextCursor = encodeCursor(payload, signingKey);
        }
      }
    } catch (error) {
      if (pitId !== undefined) closePitQuietly(pitId);
      throw error;
    }
    // Without a cursor the caller cannot close the PIT.
    if (nextCursor === undefined && pitId !== undefined) closePitQuietly(pitId);
    const result: SearchCandidates<TDocument> = {
      target: {
        targetId: context.target.targetId,
        fingerprint: context.target.fingerprint,
        readGeneration: context.readGeneration,
      },
      hits,
      timedOut: response.timed_out,
    };
    if (response.hits.total !== undefined) result.total = response.hits.total;
    if (nextCursor !== undefined) result.nextCursor = nextCursor;
    return result;
  }

  async function newSearch(
    operation: Operation,
    prepared: PreparedSearchBody,
    paginate: { pit?: boolean } | undefined,
  ): Promise<SearchCandidates<TDocument>> {
    const raw = await callCatalog(operation, (readOptions) =>
      catalog.resolveReadHeads([logicalKey], readOptions),
    );
    const catalogReturnedAt = performance.now();
    const resolved = readHeadsResultSchema.safeParse(raw);
    if (!resolved.success) throw invalidCatalogResult();
    const head = resolved.data.heads.get(logicalKey);
    if (head === undefined || head.logicalKey !== logicalKey) {
      throw new SearchNotConfigured(
        { key: "query.logicalKeyNotInCatalog", params: { logicalKey } },
        { details: { reason: "logical-key-not-in-catalog" } },
      );
    }
    const target = head.target;
    if (target === null) {
      throw new SearchNotReady(
        { key: "query.notReady", params: { logicalKey } },
        { details: { reason: "no-read-target" } },
      );
    }
    if (head.rebuildRequired) {
      throw new SearchRebuildRequired(
        { key: "query.rebuildRequired", params: { logicalKey } },
        { details: { reason: "rebuild-required" } },
      );
    }
    if (target.logicalKey !== logicalKey || !isTargetIndexConsistent(target)) {
      throw invalidCatalogResult();
    }
    assertSupportedTarget(target);
    assertLifetimes(head.lifetimes);
    if (!READABLE_STATES.has(target.state)) {
      throw new SearchTargetUnavailable(
        { key: "query.targetNotReadable", params: { state: target.state } },
        { details: { reason: "target-not-readable", state: target.state } },
      );
    }
    if (target.captureEpoch !== target.currentCaptureEpoch) {
      throw new SearchRebuildRequired(
        { key: "query.rebuildRequired", params: { logicalKey } },
        { details: { reason: "capture-epoch-invalidated" } },
      );
    }

    const issuedAt = resolved.data.cursorIssueMs;
    const expiresAt = issuedAt + limits.maxCursorLifetimeMs;
    const databaseNow = () =>
      resolved.data.databaseNowMs + Math.ceil(performance.now() - catalogReturnedAt);
    const wantsCursor = paginate !== undefined && databaseNow() < expiresAt;
    let pitId: string | undefined;
    let keepAliveMs = 0;
    if (wantsCursor && paginate?.pit === true) {
      keepAliveMs = Math.max(1, Math.min(limits.maxPitKeepAliveMs, expiresAt - databaseNow()));
      pitId = await openPit(operation, target.physicalIndex, keepAliveMs);
    }
    let response: ParsedSearchResponse;
    try {
      response = await runSearch(
        operation,
        target.physicalIndex,
        prepared,
        prepared.searchAfter,
        pitId === undefined ? undefined : { id: pitId, keepAliveMs },
      );
    } catch (error) {
      if (pitId !== undefined) closePitQuietly(pitId);
      throw error;
    }
    return finishPage(response, prepared, {
      target,
      readGeneration: head.readGeneration,
      issuedAt,
      expiresAt,
      databaseNow,
      consumed: 0,
      pitId,
      wantsCursor,
    });
  }

  async function continueSearch(
    operation: Operation,
    prepared: PreparedSearchBody,
    payload: CursorPayload,
  ): Promise<SearchCandidates<TDocument>> {
    if (payload.qh !== prepared.queryHash) {
      throw new SearchCursorExpired(
        { key: "cursor.queryMismatch" },
        { details: { reason: "query-mismatch" } },
      );
    }
    const raw = await callCatalog(operation, (readOptions) =>
      catalog.resolveTarget(payload.tid, readOptions),
    );
    const catalogReturnedAt = performance.now();
    const resolved = resolvedTargetSchema.safeParse(raw);
    if (!resolved.success) throw invalidCatalogResult();
    const { target, lifetimes, databaseNowMs } = resolved.data;
    if (target === null) {
      throw new SearchCursorExpired(
        { key: "cursor.targetMissing" },
        { details: { reason: "target-missing" } },
      );
    }
    if (target.targetId !== payload.tid || !isTargetIndexConsistent(target)) {
      throw invalidCatalogResult();
    }
    if (target.logicalKey !== logicalKey) {
      throw new SearchCursorExpired(
        { key: "cursor.logicalKeyMismatch" },
        { details: { reason: "logical-key-mismatch" } },
      );
    }
    if (resolved.data.rebuildRequired) {
      throw new SearchRebuildRequired(
        { key: "query.rebuildRequired", params: { logicalKey } },
        { details: { reason: "rebuild-required" } },
      );
    }
    if (!READABLE_STATES.has(target.state)) {
      throw new SearchCursorExpired(
        { key: "cursor.targetNotReadable", params: { state: target.state } },
        { details: { reason: "target-not-readable", state: target.state } },
      );
    }
    // Dead even after a resumed build cuts over.
    if (target.captureEpoch !== target.currentCaptureEpoch) {
      throw new SearchCursorExpired(
        { key: "cursor.epochInvalidated" },
        { details: { reason: "capture-epoch-invalidated" } },
      );
    }
    if (target.fingerprint !== payload.fp) {
      throw new SearchCursorExpired(
        { key: "cursor.fingerprintMismatch" },
        { details: { reason: "fingerprint-mismatch" } },
      );
    }
    assertSupportedTarget(target);
    if (lifetimes === null) throw invalidCatalogResult();
    assertLifetimes(lifetimes);
    // Fixed at issue, never extended, compared in database time.
    if (databaseNowMs >= payload.exp) {
      throw new SearchCursorExpired({ key: "cursor.expired" }, { details: { reason: "expired" } });
    }

    const databaseNow = () => databaseNowMs + Math.ceil(performance.now() - catalogReturnedAt);
    const keepAliveMs = Math.max(
      1,
      Math.min(limits.maxPitKeepAliveMs, payload.exp - databaseNow()),
    );
    const response = await runSearch(
      operation,
      target.physicalIndex,
      prepared,
      payload.sa,
      payload.pit === undefined ? undefined : { id: payload.pit, keepAliveMs },
    );
    return finishPage(response, prepared, {
      target,
      readGeneration: payload.g,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      databaseNow,
      consumed: payload.n,
      pitId: payload.pit,
      wantsCursor: true,
    });
  }

  return {
    async search(input) {
      hooks.assertNoAmbientTransaction?.();
      const parsedInput = searchInputSchema.safeParse(input);
      if (!parsedInput.success) throw inputError(issuePath(parsedInput.error.issues[0]));
      const { signal, cursor, paginate } = parsedInput.data;
      signal?.throwIfAborted();
      // The retirement grace period assumes maxSearchLifetimeMs, so no per-call timeoutMs may exceed it.
      const timeoutMs = Math.min(
        parsedInput.data.timeoutMs ?? limits.timeoutMs,
        limits.maxSearchLifetimeMs,
      );
      const operation = startOperation(timeoutMs, signal);
      const responseCap = Math.min(
        parsedInput.data.maxResponseBytes ?? Number.MAX_SAFE_INTEGER,
        limits.maxResponseBytes ?? Number.MAX_SAFE_INTEGER,
      );
      if (responseCap !== Number.MAX_SAFE_INTEGER) operation.maxResponseBytes = responseCap;
      try {
        const prepared = prepareSearchBody(parsedInput.data.body, {
          maxPageSize: limits.maxPageSize,
          policy,
          maxBodyBytes: limits.maxQueryBodyBytes ?? DEFAULT_QUERY_BODY_BYTES,
        });
        if (cursor !== undefined) {
          if (keys === undefined) throw cursorsNotConfigured();
          if (prepared.searchAfter !== undefined) {
            throw new SearchQueryInvalid(
              { key: "query.searchAfterWithCursor" },
              { details: { reason: "search-after-with-cursor" } },
            );
          }
          const payload = decodeCursor(cursor, keys, limits.maxCursorLifetimeMs);
          return await continueSearch(operation, prepared, payload);
        }
        if (paginate !== undefined) {
          if (keys === undefined) throw cursorsNotConfigured();
          if (!prepared.hasSort) {
            throw new SearchQueryInvalid(
              { key: "query.paginateRequiresSort" },
              { details: { reason: "paginate-requires-sort" } },
            );
          }
        }
        return await newSearch(operation, prepared, paginate);
      } finally {
        operation.dispose();
      }
    },

    async closeCursor(cursor, closeOptions) {
      hooks.assertNoAmbientTransaction?.();
      const parsedInput = closeCursorInputSchema.safeParse({ cursor, options: closeOptions });
      if (!parsedInput.success) throw inputError(issuePath(parsedInput.error.issues[0]));
      if (keys === undefined) throw cursorsNotConfigured();
      const signal = parsedInput.data.options?.signal;
      signal?.throwIfAborted();
      const payload = decodeCursor(parsedInput.data.cursor, keys, limits.maxCursorLifetimeMs);
      if (payload.pit === undefined) return;
      const operation = startOperation(limits.timeoutMs, signal);
      try {
        const response = await requester.send(
          { method: "DELETE", path: "/_search/point_in_time", body: { pit_id: [payload.pit] } },
          { signal: operation.signal, timeoutMs: operation.remaining() },
        );
        if (isSuccess(response) || response.status === 404) return;
        throw toSearchError(describeResponseFailure(response.status, response.body));
      } finally {
        operation.dispose();
      }
    },
  };
}
