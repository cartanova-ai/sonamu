import { SearchConfigurationError, SearchInvalidDocumentId } from "../errors";

export const DEFAULT_SEARCH_SCHEMA = "sonamu_search";

/** UTF-8 byte limit of an OpenSearch _id, and of the ledger document_id CHECK. */
export const MAX_DOCUMENT_ID_BYTES = 512;
/** Fence document ID in every target index; markChanged refuses it, so it never enters the ledger. */
export const RESERVED_FENCE_DOCUMENT_ID = "__sonamu_fence__";

export const MAX_INDEX_NAME_BYTES = 255;

/** Cleanup never touches indexes outside this prefix. */
export const PHYSICAL_INDEX_PREFIX = "snm-";

export const WRITE_ALIAS_SUFFIX = "-w";

const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
// Must match the CHECK constraint of the indexes table.
const NAME_PART_SOURCE = "[a-z0-9][a-z0-9-]{0,62}";
const NAME_PART_PATTERN = new RegExp(`^${NAME_PART_SOURCE}$`);
const TARGET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHYSICAL_INDEX_PATTERN = new RegExp(
  `^snm-${NAME_PART_SOURCE}-${NAME_PART_SOURCE}-[0-9a-f]{32}$`,
);
const WRITE_ALIAS_PATTERN = new RegExp(
  `^snm-${NAME_PART_SOURCE}-${NAME_PART_SOURCE}-[0-9a-f]{32}-w$`,
);
const RESERVED_SCHEMAS = new Set(["public", "information_schema"]);

const MAX_ECHOED_NAME_LENGTH = 80;

function describeName(value: string): string {
  return value.length > MAX_ECHOED_NAME_LENGTH
    ? `${value.slice(0, MAX_ECHOED_NAME_LENGTH)}…`
    : value;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function assertSchemaName(schema: string): string {
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new SearchConfigurationError({
      key: "names.invalidSchema",
      params: { name: describeName(schema) },
    });
  }
  if (schema.startsWith("pg_") || RESERVED_SCHEMAS.has(schema)) {
    throw new SearchConfigurationError({
      key: "names.reservedSchema",
      params: { name: describeName(schema) },
    });
  }
  return schema;
}

export function assertNamespace(namespace: string): string {
  if (!NAME_PART_PATTERN.test(namespace)) {
    throw new SearchConfigurationError({
      key: "names.invalidNamespace",
      params: { name: describeName(namespace) },
    });
  }
  return namespace;
}

export function assertLogicalKey(logicalKey: string): string {
  if (!NAME_PART_PATTERN.test(logicalKey)) {
    throw new SearchConfigurationError({
      key: "names.invalidLogicalKey",
      params: { name: describeName(logicalKey) },
    });
  }
  return logicalKey;
}

export function assertTargetId(targetId: string): string {
  if (!TARGET_ID_PATTERN.test(targetId)) {
    throw new SearchConfigurationError({
      key: "names.invalidTargetId",
      params: { name: describeName(targetId) },
    });
  }
  return targetId;
}

export function isNamespace(value: string): boolean {
  return NAME_PART_PATTERN.test(value);
}

export function isLogicalKey(value: string): boolean {
  return NAME_PART_PATTERN.test(value);
}

export function isTargetId(value: string): boolean {
  return TARGET_ID_PATTERN.test(value);
}

function assertIndexNameBytes(kind: "physicalIndex" | "writeAlias", name: string): void {
  const bytes = utf8ByteLength(name);
  if (bytes > MAX_INDEX_NAME_BYTES) {
    throw new SearchConfigurationError(
      { key: "names.indexNameTooLong", params: { kind, bytes, maxBytes: MAX_INDEX_NAME_BYTES } },
      { details: { bytes, maxBytes: MAX_INDEX_NAME_BYTES } },
    );
  }
}

export function assertPhysicalIndexName(physicalIndex: string): string {
  // Length first, so the regular expression only sees short input.
  assertIndexNameBytes("physicalIndex", physicalIndex);
  if (!PHYSICAL_INDEX_PATTERN.test(physicalIndex)) {
    throw new SearchConfigurationError({
      key: "names.invalidPhysicalIndex",
      params: { name: describeName(physicalIndex) },
    });
  }
  return physicalIndex;
}

export function assertWriteAliasName(writeAlias: string): string {
  assertIndexNameBytes("writeAlias", writeAlias);
  if (!WRITE_ALIAS_PATTERN.test(writeAlias)) {
    throw new SearchConfigurationError({
      key: "names.invalidWriteAlias",
      params: { name: describeName(writeAlias) },
    });
  }
  return writeAlias;
}

export function buildPhysicalIndexName(
  namespace: string,
  logicalKey: string,
  targetId: string,
): string {
  const compactId = assertTargetId(targetId).replaceAll("-", "");
  return assertPhysicalIndexName(
    `${PHYSICAL_INDEX_PREFIX}${assertNamespace(namespace)}-${assertLogicalKey(logicalKey)}-${compactId}`,
  );
}

export function buildWriteAliasName(physicalIndex: string): string {
  return assertWriteAliasName(`${assertPhysicalIndexName(physicalIndex)}${WRITE_ALIAS_SUFFIX}`);
}

// NUL cannot be stored in PostgreSQL text; an unpaired surrogate changes when encoded to UTF-8.
export function assertDocumentId(documentId: string): string {
  if (documentId.length === 0) {
    throw new SearchInvalidDocumentId({ key: "documentId.empty" });
  }
  if (documentId === RESERVED_FENCE_DOCUMENT_ID) {
    throw new SearchInvalidDocumentId(
      { key: "documentId.reserved" },
      { details: { reason: "reserved-document-id" } },
    );
  }
  if (documentId.includes("\u0000")) {
    throw new SearchInvalidDocumentId({ key: "documentId.nul" });
  }
  if (!documentId.isWellFormed()) {
    throw new SearchInvalidDocumentId({ key: "documentId.illFormed" });
  }
  const bytes = utf8ByteLength(documentId);
  if (bytes > MAX_DOCUMENT_ID_BYTES) {
    throw new SearchInvalidDocumentId(
      { key: "documentId.tooLong", params: { bytes, maxBytes: MAX_DOCUMENT_ID_BYTES } },
      { details: { bytes, maxBytes: MAX_DOCUMENT_ID_BYTES } },
    );
  }
  return documentId;
}
