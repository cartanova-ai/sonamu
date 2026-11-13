import { z } from "zod";

import {
  type JsonObject,
  jsonObjectSchema,
  type JsonValue,
  parseJsonWith,
  serializeCanonicalJson,
  sha256Hex,
} from "../definition/canonical-json";
import { SearchQueryInvalid } from "../errors";
import {
  DEFAULT_QUERY_BODY_BYTES,
  MAX_SORT_VALUES,
  nonNegativeSafeIntegerSchema,
  type SortValue,
  sortValueSchema,
  sourceFieldPathSchema,
} from "./schemas";

// Every other top-level key (aggs, suggest, pit, post_filter, from, ...) is refused; native query clauses are trusted
// server input and sent unchanged.
export const ALLOWED_BODY_KEYS = [
  "query",
  "sort",
  "size",
  "search_after",
  "_source",
  "highlight",
  "track_total_hits",
] as const;
type AllowedBodyKey = (typeof ALLOWED_BODY_KEYS)[number];

export const DEFAULT_PAGE_SIZE = 10;

export const NOT_DELETED_FILTER: JsonObject = { term: { "sonamu_meta.deleted": false } };

export const REVISION_SOURCE_FIELD = "sonamu_meta.revision";

const MAX_ECHOED_KEY_LENGTH = 64;
const MAX_TRACK_TOTAL_HITS = 2_147_483_647;

const allowedKeySchema = z.enum(ALLOWED_BODY_KEYS);
const objectSchema = z.record(z.string(), z.unknown());
const sortEntrySchema = z.union([z.string(), objectSchema]);
const bodyFieldSchemas = {
  query: objectSchema,
  sort: z.union([sortEntrySchema, z.array(sortEntrySchema).min(1)]),
  size: nonNegativeSafeIntegerSchema,
  search_after: z.array(sortValueSchema).min(1).max(MAX_SORT_VALUES),
  _source: z.union([z.boolean(), sourceFieldPathSchema, z.array(sourceFieldPathSchema).max(256)]),
  highlight: objectSchema,
  track_total_hits: z.union([z.boolean(), z.number().int().min(0).max(MAX_TRACK_TOTAL_HITS)]),
} satisfies Record<AllowedBodyKey, z.ZodType>;

export interface SourcePolicy {
  allowTrackTotalHits: boolean;
  sourceIncludes: readonly string[];
}

export interface PreparedSearchBody {
  base: JsonObject;
  size: number;
  searchAfter: SortValue[] | undefined;
  hasSort: boolean;
  sourceFields: readonly string[];
  queryHash: string;
}

function invalidValue(key: string): SearchQueryInvalid {
  return new SearchQueryInvalid(
    { key: "query.invalidBodyValue", params: { key } },
    { details: { reason: "invalid-body-value", key } },
  );
}

function bodyTooLarge(maxBytes: number): SearchQueryInvalid {
  return new SearchQueryInvalid(
    { key: "query.bodyTooLarge", params: { maxBytes } },
    { details: { reason: "body-too-large", maxBytes } },
  );
}

// A lower bound (escapes not counted) that reads descriptors so no getter runs; cycles, getters and non-JSON values are
// skipped for parseJsonWith to refuse with the exact reason.
function exceedsJsonBytes<Body>(root: Body, maxBytes: number): boolean {
  let bytes = 0;
  const ancestors = new Set<object>();
  const stack: { node: Body | PropertyDescriptor["value"]; exit: boolean }[] = [
    { node: root, exit: false },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { node } = frame;
    const text = z.string().safeParse(node);
    if (text.success) {
      bytes += Buffer.byteLength(text.data, "utf8") + 3;
    } else if (Object(node) !== node) {
      bytes += 8;
    } else {
      const container: object = Object(node);
      if (frame.exit) {
        ancestors.delete(container);
        continue;
      }
      if (ancestors.has(container)) continue;
      ancestors.add(container);
      stack.push({ node, exit: true });
      const isArray = Array.isArray(container);
      bytes += 2;
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(container))) {
        if (isArray && key === "length") continue;
        bytes += isArray ? 1 : Buffer.byteLength(key, "utf8") + 4;
        if ("value" in descriptor) stack.push({ node: descriptor.value, exit: false });
        if (bytes > maxBytes) return true;
      }
    }
    if (bytes > maxBytes) return true;
  }
  return false;
}

function isAllowedField(field: string, policy: readonly string[]): boolean {
  return policy.some((allowed) => field === allowed || field.startsWith(`${allowed}.`));
}

function requestedSourceFields(
  value: z.infer<(typeof bodyFieldSchemas)["_source"]> | undefined,
  policy: SourcePolicy,
): string[] {
  if (value === undefined || value === false) return [];
  if (value === true) return [...policy.sourceIncludes];
  const single = sourceFieldPathSchema.safeParse(value);
  const fields = single.success ? [single.data] : z.array(sourceFieldPathSchema).parse(value);
  for (const field of fields) {
    if (!isAllowedField(field, policy.sourceIncludes)) {
      const echoed = field.slice(0, MAX_ECHOED_KEY_LENGTH);
      throw new SearchQueryInvalid(
        { key: "query.sourceFieldNotAllowed", params: { field: echoed } },
        { details: { reason: "source-field-not-allowed", field: echoed } },
      );
    }
  }
  return [...new Set(fields)];
}

export function prepareSearchBody<Body>(
  body: Body,
  options: { maxPageSize: number; policy: SourcePolicy; maxBodyBytes?: number },
): PreparedSearchBody {
  // Before the deep copy and canonical serialization: peak memory is about four times this cap per body.
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_QUERY_BODY_BYTES;
  if (exceedsJsonBytes(body, maxBodyBytes)) throw bodyTooLarge(maxBodyBytes);
  const parsed = parseJsonWith(jsonObjectSchema, body, (violation) =>
    violation.path === "" && violation.reason !== "symbol_key"
      ? new SearchQueryInvalid(
          { key: "query.bodyNotObject" },
          { details: { reason: "body-not-object" } },
        )
      : new SearchQueryInvalid(
          { key: "query.invalidBody", params: { reason: violation.reason, path: violation.path } },
          { details: { reason: violation.reason, path: violation.path } },
        ),
  );
  for (const key of Object.keys(parsed)) {
    if (!allowedKeySchema.safeParse(key).success) {
      const echoed = key.slice(0, MAX_ECHOED_KEY_LENGTH);
      throw new SearchQueryInvalid(
        { key: "query.unsupportedBodyKey", params: { key: echoed } },
        { details: { reason: "unsupported-body-key", key: echoed } },
      );
    }
  }
  const field = <K extends AllowedBodyKey>(
    key: K,
  ): z.infer<(typeof bodyFieldSchemas)[K]> | undefined => {
    if (!Object.hasOwn(parsed, key)) return undefined;
    const result = bodyFieldSchemas[key].safeParse(parsed[key]);
    if (!result.success) throw invalidValue(key);
    // SAFETY: parsed with bodyFieldSchemas[key].
    return result.data as z.infer<(typeof bodyFieldSchemas)[K]>;
  };

  const query = field("query");
  const sort = field("sort");
  const size = field("size");
  const searchAfter = field("search_after");
  const sourceFields = requestedSourceFields(field("_source"), options.policy);
  const highlight = field("highlight");
  const trackTotalHits = field("track_total_hits");

  const jsonOf = (key: AllowedBodyKey): JsonValue => parsed[key] ?? null;
  const base: JsonObject = {
    query: {
      bool: {
        must: [query === undefined ? { match_all: {} } : jsonOf("query")],
        filter: [NOT_DELETED_FILTER],
      },
    },
    _source: { includes: [REVISION_SOURCE_FIELD, ...sourceFields.map((name) => `doc.${name}`)] },
    track_total_hits:
      options.policy.allowTrackTotalHits && trackTotalHits !== undefined ? trackTotalHits : false,
  };
  if (sort !== undefined) base.sort = jsonOf("sort");
  if (highlight !== undefined) base.highlight = jsonOf("highlight");

  return {
    base,
    size: Math.min(size ?? DEFAULT_PAGE_SIZE, options.maxPageSize),
    searchAfter,
    hasSort: sort !== undefined,
    sourceFields,
    queryHash: sha256Hex(serializeCanonicalJson(base)),
  };
}
