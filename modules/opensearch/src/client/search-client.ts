import { pipeline, type Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { z } from "zod";

import { type JsonObject, type JsonValue } from "../definition/canonical-json";
import {
  SearchConfigurationError,
  type SearchError,
  SearchStopping,
  SearchTimeout,
  SearchUnavailable,
} from "../errors";
import {
  describeResponseFailure,
  normalizeOpenSearchError,
  toSearchError,
} from "./error-normalization";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  issuePath,
  responseBytesSchema,
  timeoutMsSchema,
} from "./request-limits";
import { type OpenSearchClient } from "./sdk-types";

export interface SearchClientOptions {
  /** Called on the first operation, never by the factory. */
  createClient: () => OpenSearchClient | Promise<OpenSearchClient>;
  /** When true, close() closes the created client. */
  ownsClient: boolean;
  /** A nearer search deadline wins. */
  requestTimeoutMs: number;
  /** After decompression; default 16 MiB, at most 512 MiB; one response can hold about twice this in memory. */
  maxResponseBytes?: number;
}

export interface ConnectionReport {
  ok: boolean;
  latencyMs: number;
  clusterName?: string;
  version?: { number: string; distribution?: string };
  error?: SearchError;
}

export interface SearchClient {
  /** Reports failures instead of throwing, except SearchStopping after close(). */
  checkConnection(options?: { signal?: AbortSignal }): Promise<ConnectionReport>;
  /** Low-level access for trusted server code; SearchStopping after close(). */
  withNativeClient<T>(use: (client: OpenSearchClient) => Promise<T>): Promise<T>;
  /** Refuses new work, waits for in-flight work, then closes the client if owned. Idempotent. */
  close(): Promise<void>;
}

export interface SearchRequest {
  method: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  path: string;
  body?: JsonObject;
  ndjson?: string;
  querystring?: Readonly<Record<string, string>>;
}

export interface SearchRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface SearchHttpResponse {
  status: number;
  body: JsonValue | undefined;
}

export interface SearchRequester {
  send(request: SearchRequest, options?: SearchRequestOptions): Promise<SearchHttpResponse>;
}

const functionSchema = z.instanceof(Function);
const clientOptionsSchema = z.strictObject({
  createClient: functionSchema,
  ownsClient: z.boolean(),
  requestTimeoutMs: timeoutMsSchema,
  maxResponseBytes: responseBytesSchema.optional(),
});
const nativeClientSchema = z.looseObject({
  transport: z.looseObject({ request: functionSchema }),
  close: functionSchema,
});
// Node lowercases response header names.
const responseHeadersSchema = z.looseObject({
  "content-encoding": z.string().optional(),
  "content-length": z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value))
    .optional(),
});
type ResponseHeaders = z.infer<typeof responseHeadersSchema>;

interface TransportParams {
  method: string;
  path: string;
  body?: JsonObject;
  bulkBody?: string;
  querystring?: Record<string, string>;
}

const streamResponseSchema = z.looseObject({
  statusCode: z.number().int().min(100).max(599),
  headers: responseHeadersSchema.nullable().optional(),
  body: z.custom<Readable>(
    (value) =>
      z.looseObject({ pipe: functionSchema, destroy: functionSchema }).safeParse(value).success,
  ),
});
const infoSchema = z.looseObject({
  cluster_name: z.string(),
  version: z.looseObject({ number: z.string(), distribution: z.string().optional() }),
});

const requesters = new WeakMap<SearchClient, SearchRequester>();

export function getSearchRequester(client: SearchClient): SearchRequester {
  const requester = requesters.get(client);
  if (requester === undefined) {
    throw new SearchConfigurationError(
      { key: "client.foreignClient" },
      { details: { reason: "foreign-search-client" } },
    );
  }
  return requester;
}

function invalidResponse(reason: string): SearchUnavailable {
  return new SearchUnavailable(
    { key: "client.invalidResponse" },
    { retryable: false, details: { reason } },
  );
}

function responseTooLarge(maxBytes: number): SearchUnavailable {
  return new SearchUnavailable(
    { key: "client.responseTooLarge", params: { maxBytes } },
    { retryable: false, details: { reason: "response-too-large", maxBytes } },
  );
}

function requestTimeout(): SearchTimeout {
  return new SearchTimeout(
    { key: "client.requestTimeout" },
    { details: { reason: "request-timeout" } },
  );
}

function decodedStream(stream: Readable, encoding: string): Readable {
  let decoder: Readable & NodeJS.WritableStream;
  if (encoding.includes("gzip")) decoder = createGunzip();
  else if (encoding.includes("deflate")) decoder = createInflate();
  else if (encoding.includes("br")) decoder = createBrotliDecompress();
  else return stream;
  // pipe() does not end the decoder when the source is destroyed, so a timeout mid-body would hang the read forever
  // (seen with real gzip responses); pipeline() errors the decoder instead.
  pipeline(stream, decoder, () => undefined);
  return decoder;
}

async function readCapped(
  stream: Readable,
  headers: ResponseHeaders,
  maxBytes: number,
): Promise<string> {
  const contentEncoding = (headers["content-encoding"] ?? "").toLowerCase();
  const declared = headers["content-length"];
  if (contentEncoding === "" && declared !== undefined && declared > maxBytes) {
    stream.destroy();
    throw responseTooLarge(maxBytes);
  }
  const source = decodedStream(stream, contentEncoding);
  // Chunks are decoded at once and their Buffers dropped, so N bytes peak at about 2N (parts plus the joined string).
  const decoder = new StringDecoder("utf8");
  const parts: string[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    total += buffer.byteLength;
    if (total > maxBytes) {
      source.destroy();
      stream.destroy();
      throw responseTooLarge(maxBytes);
    }
    const text = decoder.write(buffer);
    if (text.length > 0) parts.push(text);
  }
  const rest = decoder.end();
  if (rest.length > 0) parts.push(rest);
  return parts.length === 1 ? (parts[0] ?? "") : parts.join("");
}

function parseJsonText(text: string): JsonValue | undefined {
  if (text.length === 0) return undefined;
  try {
    const parsed: JsonValue = JSON.parse(text);
    return parsed;
  } catch {
    throw invalidResponse("invalid-json");
  }
}

function optionsError(issue: z.core.$ZodIssue | undefined): SearchConfigurationError {
  const path = issuePath(issue);
  return new SearchConfigurationError(
    { key: "client.invalidOptions", params: { path } },
    { details: { reason: "invalid-client-option", path } },
  );
}

function conflictingBody(): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "client.conflictingBody" },
    { details: { reason: "conflicting-request-body" } },
  );
}

/** Creates an OpenSearch client wrapper; no connection or timer until the first operation. */
export function createSearchClient(options: SearchClientOptions): SearchClient {
  const parsed = clientOptionsSchema.safeParse(options);
  if (!parsed.success) throw optionsError(parsed.error.issues[0]);
  const { ownsClient, requestTimeoutMs } = parsed.data;
  const maxResponseBytes = parsed.data.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const createClient = options.createClient;

  let state: "open" | "stopping" = "open";
  let clientPromise: Promise<OpenSearchClient> | undefined;
  let closePromise: Promise<void> | undefined;
  const inFlight = new Set<Promise<unknown>>();

  function nativeClient(): Promise<OpenSearchClient> {
    if (clientPromise === undefined) {
      const created = (async () => {
        let client: OpenSearchClient;
        try {
          client = await createClient();
        } catch {
          // The error may carry external text (a credential provider), so it is dropped.
          throw new SearchUnavailable(
            { key: "client.createFailed" },
            { details: { reason: "client-create-failed" } },
          );
        }
        if (!nativeClientSchema.safeParse(client).success) {
          throw new SearchConfigurationError(
            { key: "client.createFailed" },
            { details: { reason: "invalid-native-client" } },
          );
        }
        return client;
      })();
      clientPromise = created;
      created.catch(() => {
        if (clientPromise === created) clientPromise = undefined;
      });
    }
    return clientPromise;
  }

  function track<T>(run: () => Promise<T>): Promise<T> {
    if (state !== "open") {
      return Promise.reject(
        new SearchStopping({ key: "error.stopping" }, { details: { reason: "client-closed" } }),
      );
    }
    const promise = run();
    inFlight.add(promise);
    const remove = () => {
      inFlight.delete(promise);
    };
    promise.then(remove, remove);
    return promise;
  }

  async function sendOnce(
    request: SearchRequest,
    requestOptions: SearchRequestOptions,
  ): Promise<SearchHttpResponse> {
    const { signal } = requestOptions;
    signal?.throwIfAborted();
    if (request.body !== undefined && request.ndjson !== undefined) throw conflictingBody();
    const timeoutMs = Math.min(requestTimeoutMs, requestOptions.timeoutMs ?? requestTimeoutMs);
    if (timeoutMs <= 0) throw requestTimeout();
    const client = await nativeClient();
    signal?.throwIfAborted();

    let timedOut = false;
    let stream: Readable | undefined;
    let pending: ReturnType<OpenSearchClient["transport"]["request"]> | undefined;
    const abortAll = () => {
      pending?.abort();
      stream?.destroy();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      abortAll();
    }, timeoutMs);
    signal?.addEventListener("abort", abortAll, { once: true });
    try {
      const params: TransportParams = { method: request.method, path: request.path };
      if (request.body !== undefined) params.body = request.body;
      // The SDK sends a string bulkBody unchanged, so the bytes the worker counted are the bytes sent.
      if (request.ndjson !== undefined) params.bulkBody = request.ndjson;
      if (request.querystring !== undefined) params.querystring = { ...request.querystring };
      pending = client.transport.request(params, {
        requestTimeout: timeoutMs,
        // SDK retries would restart the timeout and overrun the search deadline.
        maxRetries: 0,
        asStream: true,
      });
      const response = streamResponseSchema.safeParse(await pending);
      if (!response.success) throw invalidResponse("invalid-transport-response");
      stream = response.data.body;
      if (timedOut || signal?.aborted === true) abortAll();
      const cap = Math.min(maxResponseBytes, requestOptions.maxResponseBytes ?? maxResponseBytes);
      return {
        status: response.data.statusCode,
        body: parseJsonText(await readCapped(stream, response.data.headers ?? {}, cap)),
      };
    } catch (error) {
      if (signal?.aborted === true) throw signal.reason;
      if (timedOut) throw requestTimeout();
      throw normalizeOpenSearchError(error);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortAll);
    }
  }

  const requester: SearchRequester = {
    send: (request, requestOptions = {}) => track(() => sendOnce(request, requestOptions)),
  };

  const client: SearchClient = {
    async checkConnection(checkOptions = {}) {
      const started = performance.now();
      const latency = () => Math.round(performance.now() - started);
      try {
        const response = await requester.send(
          { method: "GET", path: "/" },
          checkOptions.signal === undefined ? {} : { signal: checkOptions.signal },
        );
        if (response.status < 200 || response.status >= 300) {
          return {
            ok: false,
            latencyMs: latency(),
            error: toSearchError(describeResponseFailure(response.status, response.body)),
          };
        }
        const info = infoSchema.safeParse(response.body);
        if (!info.success) {
          return { ok: false, latencyMs: latency(), error: invalidResponse("invalid-info") };
        }
        const { number, distribution } = info.data.version;
        return {
          ok: true,
          latencyMs: latency(),
          clusterName: info.data.cluster_name,
          version: distribution === undefined ? { number } : { number, distribution },
        };
      } catch (error) {
        if (checkOptions.signal?.aborted === true) throw checkOptions.signal.reason;
        if (error instanceof SearchStopping) throw error;
        return { ok: false, latencyMs: latency(), error: normalizeOpenSearchError(error) };
      }
    },

    withNativeClient(use) {
      return track(async () => use(await nativeClient()));
    },

    close() {
      if (closePromise !== undefined) return closePromise;
      state = "stopping";
      closePromise = (async () => {
        await Promise.allSettled(inFlight);
        if (!ownsClient || clientPromise === undefined) return;
        let native: OpenSearchClient;
        try {
          native = await clientPromise;
        } catch {
          return;
        }
        try {
          await native.close();
        } catch {
          throw new SearchUnavailable(
            { key: "client.closeFailed" },
            { retryable: false, details: { reason: "close-failed" } },
          );
        }
      })();
      return closePromise;
    },
  };
  requesters.set(client, requester);
  return client;
}
