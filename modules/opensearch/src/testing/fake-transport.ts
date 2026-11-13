import { Readable } from "node:stream";

import { z } from "zod";

import { type OpenSearchClient } from "../client/sdk-types";
import {
  compareCodeUnits,
  type JsonObject,
  jsonObjectSchema,
  type JsonValue,
} from "../definition/canonical-json";
import { RESERVED_FENCE_DOCUMENT_ID } from "../definition/names";

/**
 * Deterministic, partial in-memory OpenSearch. Unsupported requests and queries fail with 400 fake_unsupported_* so a
 * test cannot pass with different semantics unnoticed.
 */

export interface FakeItemOutcome {
  status: number;
  type: string;
}

export type FakeRequestOutcome =
  | { kind: "error"; status: number; type: string }
  | { kind: "response"; status: number; body: JsonValue }
  | { kind: "timeout" }
  | { kind: "connection" }
  /** Never responds until aborted or requestTimeout passes. */
  | { kind: "hang" };

export interface FakeRequestRecord {
  method: string;
  path: string;
  bytes: number;
}

export interface FakeOpenSearch {
  client: OpenSearchClient;
  /** Earlier rules win. The worker's fence item never reaches the rules. */
  scriptBulk(
    plan: (item: { alias: string; id: string; version: number }) => FakeItemOutcome | undefined,
  ): void;
  scriptRequest(
    plan: (request: { method: string; path: string }) => FakeRequestOutcome | undefined,
  ): void;
  /** Excludes the target fence document. */
  documents(index: string): ReadonlyMap<string, { version: number; source: JsonObject }>;
  requests(): readonly FakeRequestRecord[];
}

interface FakeDocument {
  version: number;
  source: JsonObject;
}

interface FakeResponse {
  status: number;
  body: JsonValue | undefined;
}

type RequestPayload = JsonValue | string | undefined;
type QueryParams = Readonly<Record<string, string>>;

interface CallParams {
  method: string;
  path: string;
  body?: JsonValue;
  querystring?: QueryParams;
}

interface FakeTransportResult {
  statusCode: number;
  headers: Record<string, string>;
  body: JsonValue | Readable | undefined;
  warnings: null;
  meta: Record<string, never>;
}

interface FakeSdkError extends Error {
  statusCode?: number;
  body?: JsonValue;
  meta: { statusCode: number | null; body: JsonValue; headers: Record<string, never> };
}

class FakeUnsupported extends Error {
  constructor(readonly type: string) {
    super(type);
  }
}

const FAKE_VERSION = "3.5.0";

// Engine default point_in_time.max_keep_alive (1 day); a longer PIT keep_alive is refused with 400.
const FAKE_MAX_PIT_KEEP_ALIVE_MS = 86_400_000;
const KEEP_ALIVE_UNITS_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const keepAliveSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/)
  .transform((value) => {
    const unit = z.enum(["ms", "s", "m", "h", "d"]).parse(/(ms|s|m|h|d)$/.exec(value)?.[1]);
    return Number.parseInt(value, 10) * KEEP_ALIVE_UNITS_MS[unit];
  });

function keepAliveAccepted(value: string): boolean {
  const parsed = keepAliveSchema.safeParse(value);
  return parsed.success && parsed.data <= FAKE_MAX_PIT_KEEP_ALIVE_MS;
}

const functionSchema = z.instanceof(Function);
const querystringSchema = z.union([
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  z.string(),
]);
const requestParamsSchema = z.looseObject({
  method: z.string(),
  path: z.string(),
  body: z.json().optional(),
  bulkBody: z.union([z.string(), z.array(z.json())]).optional(),
  querystring: querystringSchema.optional(),
});
const requestOptionsSchema = z.looseObject({
  asStream: z.boolean().optional(),
  requestTimeout: z.union([z.number(), z.string()]).optional(),
  querystring: querystringSchema.optional(),
});
const apiParamsSchema = z.looseObject({
  index: z.string().optional(),
  body: z.json().optional(),
  keep_alive: z.string().optional(),
  require_alias: z.boolean().optional(),
});
const bulkActionSchema = z
  .partialRecord(
    z.enum(["index", "create", "delete"]),
    z.looseObject({
      _index: z.string().optional(),
      _id: z.string(),
      version: z.number().int().optional(),
      version_type: z.enum(["internal", "external", "external_gte"]).optional(),
    }),
  )
  .refine((line) => Object.keys(line).length === 1);
const createIndexSchema = z.looseObject({
  aliases: z.record(z.string(), z.unknown()).optional(),
});
const mgetSchema = z.looseObject({
  docs: z.array(z.looseObject({ _index: z.string().optional(), _id: z.string() })).optional(),
  ids: z.array(z.string()).optional(),
});
const pitDeleteSchema = z.looseObject({ pit_id: z.union([z.string(), z.array(z.string())]) });
const searchBodySchema = z.looseObject({
  query: jsonObjectSchema.optional(),
  sort: z.json().optional(),
  size: z.number().int().min(0).optional(),
  search_after: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  _source: z.json().optional(),
  track_total_hits: z.union([z.boolean(), z.number()]).optional(),
  pit: z.looseObject({ id: z.string(), keep_alive: z.string().optional() }).optional(),
});
const sourceIncludesSchema = z.union([
  z.boolean(),
  z.string(),
  z.array(z.string()),
  z.looseObject({ includes: z.array(z.string()).optional() }),
]);
const sortFieldSchema = z.union([
  z.string(),
  z.record(
    z.string(),
    z.union([
      z.enum(["asc", "desc"]),
      z.looseObject({ order: z.enum(["asc", "desc"]).optional() }),
    ]),
  ),
]);

const clientSurfaceSchema = z.looseObject({
  transport: z.looseObject({ request: functionSchema }),
  close: functionSchema,
});

// Only transport.request and close are implemented; calling any other member fails with a TypeError.
function isClientSurface<Value extends object>(value: Value): value is Value & OpenSearchClient {
  return clientSurfaceSchema.safeParse(value).success;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && !Array.isArray(value) && Object(value) === value;
}

function sdkError(name: string, status?: number, body?: JsonValue): FakeSdkError {
  const error: FakeSdkError = Object.assign(
    new Error(name === "ResponseError" ? "Response Error" : name),
    {
      meta: { statusCode: status ?? null, body: body ?? null, headers: {} },
    },
  );
  error.name = name;
  if (status !== undefined) {
    error.statusCode = status;
    error.body = body ?? null;
  }
  return error;
}

function normalizeQuery(
  value: z.infer<typeof querystringSchema> | undefined,
): Record<string, string> {
  if (value === undefined) return {};
  const text = z.string().safeParse(value);
  if (text.success) return Object.fromEntries(new URLSearchParams(text.data));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function errorResponse(status: number, type: string): FakeResponse {
  return {
    status,
    body: { error: { type, reason: type, root_cause: [{ type, reason: type }] }, status },
  };
}

function getPath(source: JsonObject, path: string): JsonValue | undefined {
  if (Object.hasOwn(source, path)) return source[path];
  let current: JsonValue | undefined = source;
  for (const segment of path.split(".")) {
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function compareScalars(left: JsonValue | undefined, right: JsonValue | undefined): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  const numbers = z.tuple([z.number(), z.number()]).safeParse([left, right]);
  if (numbers.success) return numbers.data[0] - numbers.data[1];
  return compareCodeUnits(String(left), String(right));
}

function valuesOf(value: JsonValue | undefined): JsonValue[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function tokens(value: JsonValue | undefined): string[] {
  return valuesOf(value).flatMap((item) =>
    String(item)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 0),
  );
}

function clauses(value: JsonValue | undefined): JsonObject[] {
  return valuesOf(value).filter(isObject);
}

function fieldEntry(clause: JsonValue | undefined): [string, JsonValue] {
  if (!isObject(clause)) throw new FakeUnsupported("fake_unsupported_query");
  const entries = Object.entries(clause);
  const first = entries[0];
  if (entries.length !== 1 || first === undefined)
    throw new FakeUnsupported("fake_unsupported_query");
  return first;
}

function matches(query: JsonObject, id: string, source: JsonObject): boolean {
  const entries = Object.entries(query);
  const first = entries[0];
  if (entries.length !== 1 || first === undefined)
    throw new FakeUnsupported("fake_unsupported_query");
  const [kind, clause] = first;
  const fieldValue = (field: string) => (field === "_id" ? id : getPath(source, field));
  switch (kind) {
    case "match_all":
      return true;
    case "match_none":
      return false;
    case "bool": {
      if (!isObject(clause)) throw new FakeUnsupported("fake_unsupported_query");
      const required = [...clauses(clause.must), ...clauses(clause.filter)];
      const should = clauses(clause.should);
      if (!required.every((child) => matches(child, id, source))) return false;
      if (clauses(clause.must_not).some((child) => matches(child, id, source))) return false;
      return (
        required.length > 0 ||
        should.length === 0 ||
        should.some((child) => matches(child, id, source))
      );
    }
    case "term": {
      const [field, spec] = fieldEntry(clause);
      const expected = isObject(spec) ? spec.value : spec;
      return valuesOf(fieldValue(field)).some((value) => compareScalars(value, expected) === 0);
    }
    case "terms": {
      const [field, expected] = fieldEntry(clause);
      return valuesOf(fieldValue(field)).some((value) =>
        valuesOf(expected).some((candidate) => compareScalars(value, candidate) === 0),
      );
    }
    case "ids":
      return isObject(clause) && valuesOf(clause.values).some((value) => value === id);
    case "match": {
      const [field, spec] = fieldEntry(clause);
      const wanted = tokens(isObject(spec) ? spec.query : spec);
      const present = new Set(tokens(fieldValue(field)));
      return wanted.some((token) => present.has(token));
    }
    case "exists": {
      const field = z.looseObject({ field: z.string() }).safeParse(clause);
      return field.success && fieldValue(field.data.field) !== undefined;
    }
    case "range": {
      const [field, bounds] = fieldEntry(clause);
      if (!isObject(bounds)) throw new FakeUnsupported("fake_unsupported_query");
      return valuesOf(fieldValue(field)).some(
        (value) =>
          (bounds.gte === undefined || compareScalars(value, bounds.gte) >= 0) &&
          (bounds.gt === undefined || compareScalars(value, bounds.gt) > 0) &&
          (bounds.lte === undefined || compareScalars(value, bounds.lte) <= 0) &&
          (bounds.lt === undefined || compareScalars(value, bounds.lt) < 0),
      );
    }
    default:
      throw new FakeUnsupported("fake_unsupported_query");
  }
}

interface SortKey {
  field: string;
  order: "asc" | "desc";
}

function parseSort(sort: JsonValue | undefined): SortKey[] {
  if (sort === undefined) return [];
  const entries = z.union([sortFieldSchema, z.array(sortFieldSchema)]).safeParse(sort);
  if (!entries.success) throw new FakeUnsupported("fake_unsupported_sort");
  return (Array.isArray(entries.data) ? entries.data : [entries.data]).map((entry) => {
    const parsedField = z.string().safeParse(entry);
    if (parsedField.success)
      return { field: parsedField.data, order: parsedField.data === "_score" ? "desc" : "asc" };
    const pairs = Object.entries(entry);
    const pair = pairs[0];
    if (pairs.length !== 1 || pair === undefined)
      throw new FakeUnsupported("fake_unsupported_sort");
    const [field, spec] = pair;
    const order = z.enum(["asc", "desc"]).safeParse(spec);
    return {
      field,
      order: order.success
        ? order.data
        : (z.looseObject({ order: z.enum(["asc", "desc"]) }).safeParse(spec).data?.order ?? "asc"),
    };
  });
}

function pickSource(source: JsonObject, spec: JsonValue | undefined): JsonObject | undefined {
  const parsed = sourceIncludesSchema.safeParse(spec ?? true);
  if (!parsed.success) throw new FakeUnsupported("fake_unsupported_source");
  const value = parsed.data;
  if (value === true) return structuredClone(source);
  if (value === false) return undefined;
  const includes = z.string().safeParse(value).success
    ? [String(value)]
    : (z.array(z.string()).safeParse(value).data ??
      z.looseObject({ includes: z.array(z.string()) }).safeParse(value).data?.includes);
  if (includes === undefined) return structuredClone(source);
  const picked: JsonObject = {};
  for (const path of includes) {
    const found = getPath(source, path);
    if (found === undefined) continue;
    const segments = path.split(".");
    let cursor = picked;
    for (const segment of segments.slice(0, -1)) {
      const next = cursor[segment];
      if (isObject(next)) {
        cursor = next;
      } else {
        const created: JsonObject = {};
        cursor[segment] = created;
        cursor = created;
      }
    }
    cursor[segments.at(-1) ?? path] = structuredClone(found);
  }
  return picked;
}

function ndjsonLines(body: RequestPayload): JsonValue[] {
  const text = z.string().safeParse(body);
  if (text.success) {
    return text.data
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line): JsonValue => z.json().parse(JSON.parse(line)));
  }
  return z.array(z.json()).parse(body);
}

function serializedBytes(payload: RequestPayload | readonly JsonValue[]): number {
  if (payload === undefined || payload === null) return 0;
  const text = z.string().safeParse(payload);
  if (text.success) return Buffer.byteLength(text.data, "utf8");
  const lines = z.array(z.json()).safeParse(payload);
  if (lines.success) {
    return Buffer.byteLength(
      lines.data.map((line) => `${JSON.stringify(line)}\n`).join(""),
      "utf8",
    );
  }
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

export function createFakeOpenSearch(options: { autoCreateIndex?: boolean } = {}): FakeOpenSearch {
  const indices = new Map<string, Map<string, FakeDocument>>();
  const aliases = new Map<string, string>();
  const pits = new Map<string, Map<string, FakeDocument>>();
  const bulkPlans: ((item: {
    alias: string;
    id: string;
    version: number;
  }) => FakeItemOutcome | undefined)[] = [];
  const requestPlans: ((request: {
    method: string;
    path: string;
  }) => FakeRequestOutcome | undefined)[] = [];
  const records: FakeRequestRecord[] = [];
  let pitSequence = 0;
  let closed = false;

  function resolveIndex(name: string): string | undefined {
    return indices.has(name) ? name : aliases.get(name);
  }

  function createIndex(name: string, body: RequestPayload): FakeResponse {
    if (indices.has(name) || aliases.has(name))
      return errorResponse(400, "resource_already_exists_exception");
    const parsed = createIndexSchema.safeParse(body ?? {});
    if (!parsed.success) return errorResponse(400, "parse_exception");
    indices.set(name, new Map());
    for (const alias of Object.keys(parsed.data.aliases ?? {})) aliases.set(alias, name);
    return { status: 200, body: { acknowledged: true, shards_acknowledged: true, index: name } };
  }

  function deleteIndex(name: string): FakeResponse {
    if (!indices.has(name)) return errorResponse(404, "index_not_found_exception");
    indices.delete(name);
    for (const [alias, index] of aliases) if (index === name) aliases.delete(alias);
    return { status: 200, body: { acknowledged: true } };
  }

  function bulk(
    target: string | undefined,
    body: RequestPayload,
    query: QueryParams,
  ): FakeResponse {
    const requireAlias = query.require_alias === "true";
    const lines = ndjsonLines(body);
    const items: JsonObject[] = [];
    let errors = false;
    for (let index = 0; index < lines.length; index += 1) {
      const actionLine = bulkActionSchema.safeParse(lines[index]);
      if (!actionLine.success) return errorResponse(400, "illegal_argument_exception");
      const [action, meta] = Object.entries(actionLine.data)[0] ?? [];
      if (action === undefined || meta === undefined)
        return errorResponse(400, "illegal_argument_exception");
      let documentLine: JsonValue | undefined;
      if (action !== "delete") {
        index += 1;
        documentLine = lines[index];
        if (!isObject(documentLine)) return errorResponse(400, "illegal_argument_exception");
      }
      const name = meta._index ?? target ?? "";
      const item = (status: number, extra: JsonObject): void => {
        if (status >= 300) errors = true;
        items.push({ [action]: { _index: name, _id: meta._id, status, ...extra } });
      };
      const scripted =
        meta._id === RESERVED_FENCE_DOCUMENT_ID
          ? undefined
          : bulkPlans
              .map((plan) => plan({ alias: name, id: meta._id, version: meta.version ?? 0 }))
              .find((outcome) => outcome !== undefined);
      if (scripted !== undefined) {
        item(scripted.status, { error: { type: scripted.type, reason: scripted.type } });
        continue;
      }
      let resolved = resolveIndex(name);
      if (requireAlias && !aliases.has(name)) {
        item(404, { error: { type: "index_not_found_exception", reason: "require_alias" } });
        continue;
      }
      if (resolved === undefined) {
        if (options.autoCreateIndex !== true || name === "") {
          item(404, { error: { type: "index_not_found_exception", reason: "no such index" } });
          continue;
        }
        indices.set(name, new Map());
        resolved = name;
      }
      const documents = indices.get(resolved) ?? new Map<string, FakeDocument>();
      const existing = documents.get(meta._id);
      const versionType = meta.version_type ?? "internal";
      const version =
        versionType === "internal" ? (existing?.version ?? 0) + 1 : (meta.version ?? 0);
      const conflict =
        (action === "create" && existing !== undefined) ||
        (existing !== undefined && versionType === "external" && existing.version >= version) ||
        (existing !== undefined && versionType === "external_gte" && existing.version > version);
      if (conflict) {
        item(409, {
          error: { type: "version_conflict_engine_exception", reason: "version conflict" },
        });
        continue;
      }
      if (action === "delete") {
        if (existing === undefined) {
          item(404, { _version: version, result: "not_found" });
          continue;
        }
        documents.delete(meta._id);
        item(200, { _version: version, result: "deleted" });
        continue;
      }
      documents.set(meta._id, {
        version,
        source: structuredClone(isObject(documentLine) ? documentLine : {}),
      });
      item(existing === undefined ? 201 : 200, {
        _version: version,
        result: existing === undefined ? "created" : "updated",
      });
    }
    return { status: 200, body: { took: 0, errors, items } };
  }

  function mget(target: string | undefined, body: RequestPayload): FakeResponse {
    const parsed = mgetSchema.safeParse(body);
    if (!parsed.success) return errorResponse(400, "action_request_validation_exception");
    const requested =
      parsed.data.docs ?? (parsed.data.ids ?? []).map((id) => ({ _id: id, _index: target }));
    const docs = requested.map((request): JsonValue => {
      const name = request._index ?? target ?? "";
      const resolved = resolveIndex(name);
      const found = resolved === undefined ? undefined : indices.get(resolved)?.get(request._id);
      return found === undefined
        ? { _index: name, _id: request._id, found: false }
        : {
            _index: resolved ?? name,
            _id: request._id,
            _version: found.version,
            found: true,
            _source: structuredClone(found.source),
          };
    });
    return { status: 200, body: { docs } };
  }

  function search(target: string | undefined, body: RequestPayload): FakeResponse {
    const parsed = searchBodySchema.safeParse(body ?? {});
    if (!parsed.success) return errorResponse(400, "parsing_exception");
    const request = parsed.data;
    let documents: Map<string, FakeDocument>;
    let indexName: string;
    if (request.pit !== undefined) {
      // Engine behavior: a PIT search that also names an index is 400; a closed PIT is 404.
      if (target !== undefined) return errorResponse(400, "action_request_validation_exception");
      const snapshot = pits.get(request.pit.id);
      if (snapshot === undefined) return errorResponse(404, "search_phase_execution_exception");
      // Engine behavior: extending keep_alive beyond the limit fails the shards with 400 search_phase_execution_exception.
      if (request.pit.keep_alive !== undefined && !keepAliveAccepted(request.pit.keep_alive)) {
        return errorResponse(400, "search_phase_execution_exception");
      }
      documents = snapshot;
      indexName = request.pit.id;
    } else {
      const resolved = target === undefined ? undefined : resolveIndex(target);
      if (resolved === undefined) return errorResponse(404, "index_not_found_exception");
      documents = indices.get(resolved) ?? new Map();
      indexName = resolved;
    }
    const sortKeys = parseSort(request.sort);
    const query = request.query ?? { match_all: {} };
    const sortValues = (id: string, source: JsonObject): JsonValue[] =>
      sortKeys.map((key) => {
        if (key.field === "_id") return id;
        if (key.field === "_score") return 1;
        return valuesOf(getPath(source, key.field))[0] ?? null;
      });
    const compare = (left: JsonValue[], right: readonly JsonValue[]): number => {
      for (const [position, key] of sortKeys.entries()) {
        const result = compareScalars(left[position], right[position]);
        if (result !== 0) return key.order === "asc" ? result : -result;
      }
      return 0;
    };
    let matched = [...documents.entries()]
      .filter(([id, document]) => matches(query, id, document.source))
      .map(([id, document]) => ({ id, document, sort: sortValues(id, document.source) }));
    if (sortKeys.length > 0) matched.sort((left, right) => compare(left.sort, right.sort));
    const total = matched.length;
    const after = request.search_after;
    if (after !== undefined) {
      if (sortKeys.length === 0) return errorResponse(400, "illegal_argument_exception");
      matched = matched.filter((entry) => compare(entry.sort, after) > 0);
    }
    const page = matched.slice(0, request.size ?? 10);
    const hits = page.map((entry): JsonObject => {
      const hit: JsonObject = {
        _index: indexName,
        _id: entry.id,
        _score: sortKeys.length > 0 ? null : 1,
      };
      const picked = pickSource(entry.document.source, request._source);
      if (picked !== undefined) hit._source = picked;
      if (sortKeys.length > 0) hit.sort = entry.sort;
      return hit;
    });
    const hitsBody: JsonObject = { max_score: null, hits };
    if (request.track_total_hits !== false) hitsBody.total = { value: total, relation: "eq" };
    const responseBody: JsonObject = {
      took: 0,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: hitsBody,
    };
    if (request.pit !== undefined) responseBody.pit_id = request.pit.id;
    return { status: 200, body: responseBody };
  }

  function createPit(index: string, query: QueryParams): FakeResponse {
    const resolved = resolveIndex(index);
    if (resolved === undefined) return errorResponse(404, "index_not_found_exception");
    // Engine behavior: creating a PIT with keep_alive beyond the limit is 400 illegal_argument_exception.
    if (query.keep_alive !== undefined && !keepAliveAccepted(query.keep_alive)) {
      return errorResponse(400, "illegal_argument_exception");
    }
    pitSequence += 1;
    const id = `fake-pit-${pitSequence}`;
    const snapshot = new Map<string, FakeDocument>();
    for (const [documentId, document] of indices.get(resolved) ?? []) {
      snapshot.set(documentId, structuredClone(document));
    }
    pits.set(id, snapshot);
    return {
      status: 200,
      body: {
        pit_id: id,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        creation_time: 0,
      },
    };
  }

  function deletePits(body: RequestPayload): FakeResponse {
    const parsed = pitDeleteSchema.safeParse(body);
    if (!parsed.success) return errorResponse(400, "action_request_validation_exception");
    const ids = valuesOf(parsed.data.pit_id).map(String);
    for (const id of ids) pits.delete(id);
    // The engine (3.5.0, 3.9.0) answers 200 with successful: true when an already closed PIT is deleted again
    // (pinned in tests/integration/search-client-engine.test.ts).
    return {
      status: 200,
      body: { pits: ids.map((id) => ({ pit_id: id, successful: true })) },
    };
  }

  function route(
    method: string,
    path: string,
    body: RequestPayload,
    query: QueryParams,
  ): FakeResponse {
    const segments =
      path
        .split("?")[0]
        ?.split("/")
        .filter((segment) => segment.length > 0)
        .map(decodeURIComponent) ?? [];
    const [first, second, third] = segments;
    try {
      if (segments.length === 0 && method === "GET") {
        return {
          status: 200,
          body: {
            name: "fake-node",
            cluster_name: "fake-cluster",
            version: { number: FAKE_VERSION, distribution: "opensearch" },
            tagline: "fake",
          },
        };
      }
      if (first === "_bulk" && segments.length === 1) return bulk(undefined, body, query);
      if (first === "_mget" && segments.length === 1) return mget(undefined, body);
      if (first === "_search" && segments.length === 1) return search(undefined, body);
      if (
        first === "_search" &&
        second === "point_in_time" &&
        segments.length === 2 &&
        method === "DELETE"
      ) {
        return deletePits(body);
      }
      if (first !== undefined && !first.startsWith("_")) {
        if (segments.length === 1) {
          if (method === "PUT") return createIndex(first, body);
          if (method === "DELETE") return deleteIndex(first);
          if (method === "HEAD")
            return { status: resolveIndex(first) === undefined ? 404 : 200, body: undefined };
        }
        if (second === "_bulk" && segments.length === 2) return bulk(first, body, query);
        if (second === "_mget" && segments.length === 2) return mget(first, body);
        if (second === "_refresh" && segments.length === 2) {
          return resolveIndex(first) === undefined
            ? errorResponse(404, "index_not_found_exception")
            : { status: 200, body: { _shards: { total: 1, successful: 1, failed: 0 } } };
        }
        if (second === "_search" && segments.length === 2) return search(first, body);
        if (second === "_search" && third === "point_in_time" && method === "POST")
          return createPit(first, query);
      }
      return errorResponse(400, "fake_unsupported_request");
    } catch (error) {
      if (error instanceof FakeUnsupported) return errorResponse(400, error.type);
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return errorResponse(400, "parsing_exception");
      throw error;
    }
  }

  function request<Params, Options>(
    params: Params,
    requestOptions?: Options,
  ): Promise<FakeTransportResult> & { abort: () => void } {
    const parsedParams = requestParamsSchema.parse(params);
    const parsedOptions = requestOptionsSchema.parse(requestOptions ?? {});
    const method = parsedParams.method.toUpperCase();
    const path = parsedParams.path;
    const payload: RequestPayload =
      parsedParams.bulkBody === undefined
        ? parsedParams.body
        : (z.string().safeParse(parsedParams.bulkBody).data ??
          z.array(z.json()).parse(parsedParams.bulkBody));
    records.push({
      method,
      path,
      bytes: serializedBytes(parsedParams.bulkBody ?? parsedParams.body),
    });
    const query = {
      ...Object.fromEntries(new URLSearchParams(path.split("?")[1] ?? "")),
      ...normalizeQuery(parsedParams.querystring),
      ...normalizeQuery(parsedOptions.querystring),
    } satisfies QueryParams;

    let settled = false;
    let rejectRequest: (error: Error) => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<FakeTransportResult>((resolve, reject) => {
      rejectRequest = (error) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        reject(error);
      };
      const succeed = (value: FakeTransportResult) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      // Respond on the next microtask like a real transport, so the caller has a chance to abort.
      queueMicrotask(() => {
        if (settled) return;
        if (closed) {
          rejectRequest(sdkError("ConnectionError"));
          return;
        }
        const scripted = requestPlans
          .map((plan) => plan({ method, path }))
          .find((outcome) => outcome !== undefined);
        if (scripted?.kind === "timeout") return rejectRequest(sdkError("TimeoutError"));
        if (scripted?.kind === "connection") return rejectRequest(sdkError("ConnectionError"));
        if (scripted?.kind === "hang") {
          const timeout = z.coerce.number().int().min(1).safeParse(parsedOptions.requestTimeout);
          if (timeout.success)
            timer = setTimeout(() => rejectRequest(sdkError("TimeoutError")), timeout.data);
          return;
        }
        let response: FakeResponse;
        if (scripted?.kind === "error") response = errorResponse(scripted.status, scripted.type);
        else if (scripted?.kind === "response")
          response = { status: scripted.status, body: scripted.body };
        else response = route(method, path, payload, query);
        if (parsedOptions.asStream === true) {
          const text = response.body === undefined ? "" : JSON.stringify(response.body);
          succeed({
            statusCode: response.status,
            headers: {
              "content-type": "application/json",
              "content-length": String(Buffer.byteLength(text)),
            },
            body: Readable.from(text.length === 0 ? [] : [Buffer.from(text, "utf8")]),
            warnings: null,
            meta: {},
          });
          return;
        }
        if (response.status >= 400) {
          rejectRequest(sdkError("ResponseError", response.status, response.body ?? null));
          return;
        }
        succeed({
          statusCode: response.status,
          headers: {},
          body: response.body,
          warnings: null,
          meta: {},
        });
      });
    });
    return Object.assign(promise, {
      abort: () => rejectRequest(sdkError("RequestAbortedError")),
    });
  }

  const call = (method: string, path: string, body?: JsonValue, querystring?: QueryParams) => {
    const params: CallParams = { method, path };
    if (body !== undefined) params.body = body;
    if (querystring !== undefined) params.querystring = querystring;
    return request(params);
  };
  const indexPath = (index: string | undefined, suffix: string) =>
    index === undefined ? `/${suffix}` : `/${encodeURIComponent(index)}/${suffix}`;

  const fakeClient = {
    transport: { request },
    async close() {
      closed = true;
    },
    info: () => call("GET", "/"),
    search: <Params>(params: Params) => {
      const parsed = apiParamsSchema.parse(params ?? {});
      return call("POST", indexPath(parsed.index, "_search"), parsed.body);
    },
    bulk: <Params>(params: Params) => {
      const parsed = apiParamsSchema.parse(params);
      const query: QueryParams =
        parsed.require_alias === undefined ? {} : { require_alias: String(parsed.require_alias) };
      const bulkBody = z.union([z.string(), z.array(z.json())]).parse(parsed.body);
      return request({
        method: "POST",
        path: indexPath(parsed.index, "_bulk"),
        bulkBody,
        querystring: query,
      });
    },
    mget: <Params>(params: Params) => {
      const parsed = apiParamsSchema.parse(params);
      return call("POST", indexPath(parsed.index, "_mget"), parsed.body);
    },
    createPit: <Params>(params: Params) => {
      const parsed = apiParamsSchema.parse(params);
      return call("POST", indexPath(parsed.index, "_search/point_in_time"), undefined, {
        keep_alive: parsed.keep_alive ?? "1m",
      });
    },
    deletePit: <Params>(params: Params) =>
      call("DELETE", "/_search/point_in_time", apiParamsSchema.parse(params).body),
    indices: {
      create: <Params>(params: Params) => {
        const parsed = apiParamsSchema.parse(params);
        return call("PUT", indexPath(parsed.index, ""), parsed.body ?? {});
      },
      delete: <Params>(params: Params) =>
        call("DELETE", indexPath(apiParamsSchema.parse(params).index, "")),
      exists: <Params>(params: Params) =>
        call("HEAD", indexPath(apiParamsSchema.parse(params).index, "")),
      refresh: <Params>(params: Params) =>
        call("POST", indexPath(apiParamsSchema.parse(params).index, "_refresh")),
    },
  };

  if (!isClientSurface(fakeClient)) throw new TypeError("fake client surface");

  return {
    client: fakeClient,
    scriptBulk(plan) {
      if (!functionSchema.safeParse(plan).success) throw new TypeError("plan");
      bulkPlans.push(plan);
    },
    scriptRequest(plan) {
      if (!functionSchema.safeParse(plan).success) throw new TypeError("plan");
      requestPlans.push(plan);
    },
    documents(index) {
      const resolved = resolveIndex(index);
      const documents = resolved === undefined ? undefined : indices.get(resolved);
      return new Map(
        [...(documents ?? new Map<string, FakeDocument>())]
          .filter(([id]) => id !== RESERVED_FENCE_DOCUMENT_ID)
          .map(([id, document]) => [
            id,
            { version: document.version, source: structuredClone(document.source) },
          ]),
      );
    },
    requests() {
      return records.map((record) => ({ ...record }));
    },
  };
}
