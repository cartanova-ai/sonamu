import { z } from "zod";

import {
  type NativeDynamicMapping,
  type NativeProperty,
  type NativeTypeMapping,
  type SearchDocumentMappings,
} from "../client/sdk-types";
import { SearchConfigurationError, SearchProjectionError, SearchRevisionOverflow } from "../errors";
import {
  HASH_VERSION,
  type HashVersion,
  type JsonObject,
  jsonObjectSchema,
  parseCanonicalProjection,
  parseJsonWith,
  sha256Hex,
  sha256HexSchema,
} from "./canonical-json";
import { type Projection, type Revision } from "./define-search";
import {
  assertLogicalKey,
  assertNamespace,
  assertTargetId,
  isLogicalKey,
  isNamespace,
  isTargetId,
} from "./names";

export const ENVELOPE_VERSION = 1;
export type EnvelopeVersion = typeof ENVELOPE_VERSION;

export const SONAMU_META_FIELD = "sonamu_meta";
export const DOCUMENT_FIELD = "doc";
export const INDEX_META_KEY = "sonamu";

const MAX_ECHOED_FIELD_LENGTH = 64;

function echoField(name: string): string {
  return name.length > MAX_ECHOED_FIELD_LENGTH
    ? `${name.slice(0, MAX_ECHOED_FIELD_LENGTH)}…`
    : name;
}

// Names starting with _ can collide with OpenSearch metadata fields.
export function isReservedDocumentField(name: string): boolean {
  return name === SONAMU_META_FIELD || name.startsWith("_");
}

const dynamicMappingSchema: z.ZodType<NativeDynamicMapping> = z.union([
  z.boolean(),
  z.enum(["true", "false", "strict", "strict_allow_templates"]),
]);
const documentMappingsSchema = z.strictObject({
  properties: z.record(
    z.string().refine((name) => !isReservedDocumentField(name)),
    z.unknown(),
  ),
  dynamic: dynamicMappingSchema.optional(),
});

function mappingsError(issue: z.core.$ZodIssue | undefined): SearchConfigurationError {
  const [head, name] = issue?.path ?? [];
  if (issue?.code === "unrecognized_keys") {
    const key = echoField(issue.keys[0] ?? "");
    return new SearchConfigurationError(
      { key: "mappings.unsupportedKey", params: { key } },
      { details: { reason: "unsupported_mapping_key", key } },
    );
  }
  if (head === "properties" && issue?.code === "invalid_key" && name !== undefined) {
    const property = echoField(String(name));
    return new SearchConfigurationError(
      { key: "mappings.reservedProperty", params: { property } },
      { details: { reason: "reserved_property", property } },
    );
  }
  if (head === "properties") {
    return new SearchConfigurationError(
      { key: "mappings.propertiesNotObject" },
      { details: { reason: "properties_not_object" } },
    );
  }
  if (head === "dynamic") {
    return new SearchConfigurationError(
      { key: "mappings.invalidDynamic" },
      { details: { reason: "invalid_dynamic" } },
    );
  }
  return new SearchConfigurationError(
    { key: "mappings.notObject" },
    { details: { reason: "mappings_not_object" } },
  );
}

// Top-level-only parameters (_source, _routing, _meta, dynamic_templates) cannot move under doc, so only properties
// and dynamic are accepted.
export function parseDocumentMappings(mappings: SearchDocumentMappings): SearchDocumentMappings {
  const { properties, dynamic } = parseDocumentMappingsJson(mappings);
  // SAFETY: OpenSearch validates property semantics; the package only guarantees JSON objects.
  const nativeProperties = properties as Record<string, NativeProperty>;
  return dynamic === undefined
    ? { properties: nativeProperties }
    : { properties: nativeProperties, dynamic };
}

export interface DocumentMappingsJson {
  properties: JsonObject;
  dynamic?: NativeDynamicMapping;
}

export function parseDocumentMappingsJson(mappings: SearchDocumentMappings): DocumentMappingsJson {
  const parsed = documentMappingsSchema.safeParse(mappings);
  if (!parsed.success) throw mappingsError(parsed.error.issues[0]);
  const properties = parseJsonWith(jsonObjectSchema, parsed.data.properties, (violation) => {
    const path = `/properties${violation.path}`;
    return new SearchConfigurationError(
      {
        key: "definition.invalidPart",
        params: { field: "mappings", reason: violation.reason, path },
      },
      { details: { field: "mappings", reason: violation.reason, path } },
    );
  });
  const { dynamic } = parsed.data;
  return dynamic === undefined ? { properties } : { properties, dynamic };
}

// The range OpenSearch external versions carry without loss.
export function assertRevision(revision: Revision): Revision {
  if (Number.isInteger(revision) && revision > Number.MAX_SAFE_INTEGER) {
    throw new SearchRevisionOverflow({ key: "revision.overflow" });
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new SearchConfigurationError(
      { key: "revision.invalid" },
      { details: { reason: "invalid_revision" } },
    );
  }
  return revision;
}

export interface SonamuMeta<TDeleted extends boolean = boolean> {
  deleted: TDeleted;
  revision: Revision;
  hash_version: HashVersion;
  projection_hash: string;
}
export interface PresentSearchEnvelope {
  sonamu_meta: SonamuMeta<false>;
  doc: JsonObject;
}
export interface DeletedSearchEnvelope {
  sonamu_meta: SonamuMeta<true>;
}
export type SearchEnvelope = PresentSearchEnvelope | DeletedSearchEnvelope;

// doc is the same validated copy the hash was computed from, so the two cannot diverge.
export function buildSearchEnvelope(
  projection: Projection<JsonObject>,
  revision: Revision,
): SearchEnvelope {
  const checkedRevision = assertRevision(revision);
  const { projection: parsed, canonical } = parseCanonicalProjection(projection);
  const projectionHash = sha256Hex(canonical);
  if (parsed.state === "deleted") {
    return {
      sonamu_meta: {
        deleted: true,
        revision: checkedRevision,
        hash_version: HASH_VERSION,
        projection_hash: projectionHash,
      },
    };
  }
  const reserved = Object.keys(parsed.document).find(isReservedDocumentField);
  if (reserved !== undefined) {
    const field = echoField(reserved);
    throw new SearchProjectionError(
      { key: "projection.reservedField", params: { field } },
      { details: { reason: "reserved_field", field } },
    );
  }
  return {
    sonamu_meta: {
      deleted: false,
      revision: checkedRevision,
      hash_version: HASH_VERSION,
      projection_hash: projectionHash,
    },
    doc: parsed.document,
  };
}

export interface SearchIndexMeta {
  target_id: string;
  namespace: string;
  logical_key: string;
  fingerprint: string;
  hash_version: string;
  envelope: EnvelopeVersion;
  /** Absent on indexes created before schema version 2; when it differs from the current store, admin leaves the index alone. */
  store_id?: string;
}

export interface SearchIndexIdentity {
  targetId: string;
  namespace: string;
  logicalKey: string;
  fingerprint: string;
  hashVersion: HashVersion;
  storeId?: string;
}

const STORE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function buildSearchIndexMeta(identity: SearchIndexIdentity): SearchIndexMeta {
  if (!sha256HexSchema.safeParse(identity.fingerprint).success) {
    throw new SearchConfigurationError(
      { key: "indexMeta.invalidFingerprint" },
      { details: { reason: "invalid_fingerprint" } },
    );
  }
  if (identity.hashVersion !== HASH_VERSION) {
    throw new SearchConfigurationError(
      { key: "definition.unsupportedHashVersion", params: { supported: HASH_VERSION } },
      { details: { reason: "unsupported_hash_version" } },
    );
  }
  if (identity.storeId !== undefined && !STORE_ID_PATTERN.test(identity.storeId)) {
    throw new SearchConfigurationError(
      { key: "indexMeta.invalidStoreId" },
      { details: { reason: "invalid_store_id" } },
    );
  }
  const meta: SearchIndexMeta = {
    target_id: assertTargetId(identity.targetId),
    namespace: assertNamespace(identity.namespace),
    logical_key: assertLogicalKey(identity.logicalKey),
    fingerprint: identity.fingerprint,
    hash_version: identity.hashVersion,
    envelope: ENVELOPE_VERSION,
  };
  if (identity.storeId !== undefined) meta.store_id = identity.storeId;
  return meta;
}

export function sonamuMetaMapping(): NativeProperty {
  return {
    type: "object",
    dynamic: "strict",
    properties: {
      deleted: { type: "boolean" },
      revision: { type: "long" },
      hash_version: { type: "keyword" },
      projection_hash: { type: "keyword" },
    },
  };
}

export function composeIndexMappings(
  identity: SearchIndexIdentity & { mappings: SearchDocumentMappings },
): NativeTypeMapping {
  const meta = buildSearchIndexMeta(identity);
  const mappings = parseDocumentMappings(identity.mappings);
  return {
    dynamic: "strict",
    _meta: { [INDEX_META_KEY]: meta },
    properties: {
      [SONAMU_META_FIELD]: sonamuMetaMapping(),
      [DOCUMENT_FIELD]: {
        type: "object",
        dynamic: mappings.dynamic ?? "strict",
        properties: mappings.properties,
      },
    },
  };
}

const searchIndexMetaSchema = z.strictObject({
  target_id: z.string().refine(isTargetId),
  namespace: z.string().refine(isNamespace),
  logical_key: z.string().refine(isLogicalKey),
  fingerprint: sha256HexSchema,
  hash_version: z.string().min(1),
  envelope: z.literal(ENVELOPE_VERSION),
  store_id: z.string().regex(STORE_ID_PATTERN).optional(),
});
const indexMappingMetaSchema = z.object({
  _meta: z.object({ sonamu: searchIndexMetaSchema }),
});

// undefined (absent or malformed in any way) means the package does not own the index.
export function readSearchIndexMeta(mappings: NativeTypeMapping): SearchIndexMeta | undefined {
  const parsed = indexMappingMetaSchema.safeParse(mappings);
  if (!parsed.success) return undefined;
  const { _meta: meta } = parsed.data;
  return meta.sonamu;
}
