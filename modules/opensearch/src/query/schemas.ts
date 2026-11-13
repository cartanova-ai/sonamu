import { z } from "zod";

import {
  issuePath,
  pageSizeSchema,
  responseBytesSchema,
  timeoutMsSchema,
} from "../client/request-limits";
import { type JsonObject, sha256HexSchema } from "../definition/canonical-json";
import {
  isLogicalKey,
  isTargetId,
  MAX_INDEX_NAME_BYTES,
  utf8ByteLength,
} from "../definition/names";
import { type ReadHeadState, type ReadTarget, type SearchCatalogReader } from "./catalog";

// Callers build error messages from catalogue keys, never from zod messages.
const functionSchema = z.instanceof(Function);

export const DEFAULT_QUERY_BODY_BYTES = 1024 * 1024;
export const MAX_QUERY_BODY_BYTES_LIMIT = 16 * 1024 * 1024;

export const nonNegativeSafeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const sourceFieldPathSchema = z
  .string()
  .max(256)
  .regex(/^[A-Za-z0-9_@$][A-Za-z0-9_@$-]*(?:\.[A-Za-z0-9_@$][A-Za-z0-9_@$-]*)*$/);

// No dots: the dot separates cursor parts.
export const signingKeyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const MIN_SIGNING_SECRET_BYTES = 32;
const MAX_SIGNING_SECRET_BYTES = 1024;

const signingKeySchema = z.strictObject({
  id: signingKeyIdSchema,
  secret: z
    .instanceof(Uint8Array)
    .refine(
      (secret) =>
        secret.byteLength >= MIN_SIGNING_SECRET_BYTES &&
        secret.byteLength <= MAX_SIGNING_SECRET_BYTES,
    ),
});

const catalogReaderSchema = z.custom<SearchCatalogReader>(
  (value) =>
    z
      .looseObject({ resolveReadHeads: functionSchema, resolveTarget: functionSchema })
      .safeParse(value).success,
);

export const searchQueriesOptionsSchema = z.strictObject({
  client: z.custom<object>((value) => Object(value) === value),
  catalog: catalogReaderSchema,
  logicalKey: z.string().refine(isLogicalKey),
  supportedFingerprints: z.array(sha256HexSchema).min(1).max(64),
  limits: z.strictObject({
    maxPageSize: pageSizeSchema,
    timeoutMs: timeoutMsSchema,
    maxSearchLifetimeMs: timeoutMsSchema,
    maxCursorLifetimeMs: timeoutMsSchema,
    maxPitKeepAliveMs: timeoutMsSchema,
    maxResponseBytes: responseBytesSchema.optional(),
    maxQueryBodyBytes: z.number().int().min(1).max(MAX_QUERY_BODY_BYTES_LIMIT).optional(),
  }),
  cursor: z.strictObject({ signingKeys: z.array(signingKeySchema).min(1).max(16) }).optional(),
  policy: z
    .strictObject({
      allowTrackTotalHits: z.boolean().optional(),
      sourceIncludes: z.array(sourceFieldPathSchema).max(256).optional(),
    })
    .optional(),
});

export const searchInputSchema = z.strictObject({
  body: z.unknown(),
  signal: z.instanceof(AbortSignal).optional(),
  timeoutMs: timeoutMsSchema.optional(),
  cursor: z.string().optional(),
  paginate: z.strictObject({ pit: z.boolean().optional() }).optional(),
  maxResponseBytes: responseBytesSchema.optional(),
});

export const closeCursorInputSchema = z.strictObject({
  cursor: z.string(),
  options: z.strictObject({ signal: z.instanceof(AbortSignal).optional() }).optional(),
});

export { issuePath };

const physicalIndexSchema = z
  .string()
  .min(1)
  .refine((name) => utf8ByteLength(name) <= MAX_INDEX_NAME_BYTES)
  .regex(/^snm-[a-z0-9][a-z0-9-]*-[0-9a-f]{32}$/);

export const readTargetSchema: z.ZodType<ReadTarget> = z.object({
  targetId: z.string().refine(isTargetId),
  logicalKey: z.string().refine(isLogicalKey),
  physicalIndex: physicalIndexSchema,
  fingerprint: sha256HexSchema,
  hashVersion: z.string().min(1),
  state: z.enum(["creating", "active", "paused", "retiring", "retired", "failed", "detached"]),
  captureEpoch: nonNegativeSafeIntegerSchema,
  currentCaptureEpoch: nonNegativeSafeIntegerSchema,
});

export const readLifetimeLimitsSchema = z.object({
  maxSearchLifetimeMs: nonNegativeSafeIntegerSchema,
  maxCursorLifetimeMs: nonNegativeSafeIntegerSchema,
  maxPitKeepAliveMs: nonNegativeSafeIntegerSchema,
});

export const readHeadStateSchema: z.ZodType<ReadHeadState> = z.object({
  logicalKey: z.string().refine(isLogicalKey),
  readGeneration: nonNegativeSafeIntegerSchema,
  rebuildRequired: z.boolean(),
  target: readTargetSchema.nullable(),
  lifetimes: readLifetimeLimitsSchema,
});

export const readHeadsResultSchema = z.object({
  heads: z.map(z.string(), readHeadStateSchema),
  cursorIssueMs: nonNegativeSafeIntegerSchema,
  databaseNowMs: nonNegativeSafeIntegerSchema,
});

export const resolvedTargetSchema = z.object({
  target: readTargetSchema.nullable(),
  rebuildRequired: z.boolean(),
  lifetimes: readLifetimeLimitsSchema.nullable(),
  databaseNowMs: nonNegativeSafeIntegerSchema,
});

// Namespace and logical key may both contain hyphens, so only the suffix can be matched; it still stops a catalog row
// from pointing at another target's index.
export function isTargetIndexConsistent(target: ReadTarget): boolean {
  return target.physicalIndex.endsWith(
    `-${target.logicalKey}-${target.targetId.replaceAll("-", "")}`,
  );
}

export const sortValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type SortValue = z.infer<typeof sortValueSchema>;

export const MAX_SORT_VALUES = 64;
export const MAX_PIT_ID_LENGTH = 8192;

// tid target id, fp fingerprint, qh query hash, iat/exp database epoch ms, sa last sort values, n candidates
// consumed, g read generation at issue.
export const cursorPayloadSchema = z
  .strictObject({
    v: z.literal(1),
    tid: z.string().refine(isTargetId),
    fp: sha256HexSchema,
    qh: sha256HexSchema,
    iat: nonNegativeSafeIntegerSchema,
    exp: nonNegativeSafeIntegerSchema,
    sa: z.array(sortValueSchema).min(1).max(MAX_SORT_VALUES),
    pit: z.string().min(1).max(MAX_PIT_ID_LENGTH).optional(),
    n: nonNegativeSafeIntegerSchema,
    g: nonNegativeSafeIntegerSchema,
  })
  .refine((payload) => payload.exp > payload.iat);
export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

// JSON.parse output is JSON by construction: only the shape is checked and the original kept, since a recursive check
// would deep-copy the response.
const shallowObjectSchema = z.record(z.string(), z.unknown());
const parsedJsonObjectSchema = z.custom<JsonObject>(
  (value) => shallowObjectSchema.safeParse(value).success,
);

const hitSchema = z.looseObject({
  _id: z.string(),
  _score: z.number().nullable().optional(),
  _source: z.looseObject({
    sonamu_meta: z.looseObject({
      revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    }),
    doc: parsedJsonObjectSchema.optional(),
  }),
  sort: z.array(sortValueSchema).max(MAX_SORT_VALUES).optional(),
  highlight: z.record(z.string(), z.array(z.string())).optional(),
});

export const searchResponseSchema = z.looseObject({
  timed_out: z.boolean(),
  pit_id: z.string().min(1).max(MAX_PIT_ID_LENGTH).optional(),
  hits: z.looseObject({
    total: z
      .looseObject({ value: nonNegativeSafeIntegerSchema, relation: z.enum(["eq", "gte"]) })
      .optional(),
    hits: z.array(hitSchema),
  }),
});
export type ParsedSearchResponse = z.infer<typeof searchResponseSchema>;

export const pitCreateResponseSchema = z.looseObject({
  pit_id: z.string().min(1).max(MAX_PIT_ID_LENGTH),
});
