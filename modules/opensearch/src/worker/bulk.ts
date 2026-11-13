import { type SearchEnvelope, type SonamuMeta } from "../definition/envelope";
import {
  MAX_DOCUMENT_ID_BYTES,
  RESERVED_FENCE_DOCUMENT_ID,
  utf8ByteLength,
} from "../definition/names";
import { SearchConfigurationError } from "../errors";

// Bytes are the UTF-8 bytes sent, newlines included. Deletes index a tombstone; the write path never sends a native
// delete. An _id over 512 bytes would make the engine refuse the whole request, so it is quarantined as invalid_id
// before sending; an item over maxBulkBytes alone is quarantined as oversized, never truncated. Memory: the envelope
// line slices the hashed canonical JSON, closed requests keep only lengths, and bisection slices the body instead of
// copying it.

export interface IdentifiedDocument {
  readonly documentId: string;
}

export interface BulkDocument extends IdentifiedDocument {
  readonly envelope: SearchEnvelope;
}

export interface BulkItemRef<TDocument extends IdentifiedDocument = IdentifiedDocument> {
  readonly document: TDocument;
  readonly version: number;
  readonly bytes: number;
  readonly chars: number;
}

export interface SerializedBulkItem<
  TDocument extends IdentifiedDocument = BulkDocument,
> extends BulkItemRef<TDocument> {
  readonly text: string;
}

export type PreSendRejection = "invalid_id" | "oversized";

export interface RejectedBulkDocument<TDocument extends IdentifiedDocument = BulkDocument> {
  readonly document: TDocument;
  readonly reason: PreSendRejection;
  readonly bytes: number;
}

export interface BulkRequest<
  TDocument extends IdentifiedDocument = BulkDocument,
  TItem extends BulkItemRef<TDocument> = SerializedBulkItem<TDocument>,
> {
  readonly items: readonly TItem[];
  readonly body: string;
  readonly bytes: number;
}

export interface BulkPackLimits {
  readonly maxBulkBytes: number;
  readonly maxDocuments: number;
}

export interface BulkPackResult<TDocument extends BulkDocument = BulkDocument> {
  readonly requests: readonly BulkRequest<TDocument>[];
  readonly rejected: readonly RejectedBulkDocument<TDocument>[];
}

// require_alias keeps a physical index name from ever being a bulk target.
export const BULK_FILTER_PATH =
  "errors,items.*._id,items.*.status,items.*._version,items.*.error.type";
export const BULK_QUERYSTRING: Readonly<Record<string, string>> = Object.freeze({
  require_alias: "true",
  filter_path: BULK_FILTER_PATH,
});

export function bulkPath(writeAlias: string): string {
  return `/${encodeURIComponent(writeAlias)}/_bulk`;
}

function invalidLimit(name: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "bulk.invalidLimit", params: { name } },
    { details: { reason: "invalid-bulk-limit", name } },
  );
}

export function assertBulkPackLimits(limits: BulkPackLimits): BulkPackLimits {
  if (!Number.isSafeInteger(limits.maxBulkBytes) || limits.maxBulkBytes < 1) {
    throw invalidLimit("maxBulkBytes");
  }
  if (!Number.isSafeInteger(limits.maxDocuments) || limits.maxDocuments < 1) {
    throw invalidLimit("maxDocuments");
  }
  return limits;
}

// The reserved fence id is refused too, so a ledger row written around the marker cannot overwrite the fence.
export function isSendableDocumentId(documentId: string): boolean {
  return (
    documentId.length > 0 &&
    documentId !== RESERVED_FENCE_DOCUMENT_ID &&
    !documentId.includes("\u0000") &&
    documentId.isWellFormed() &&
    utf8ByteLength(documentId) <= MAX_DOCUMENT_ID_BYTES
  );
}

function actionLine(documentId: string, version: number): string {
  return JSON.stringify({ index: { _id: documentId, version, version_type: "external" } });
}

export function serializeBulkItem<TDocument extends BulkDocument>(
  document: TDocument,
): SerializedBulkItem<TDocument> | RejectedBulkDocument<TDocument> {
  if (!isSendableDocumentId(document.documentId)) {
    return { document, reason: "invalid_id", bytes: utf8ByteLength(document.documentId) };
  }
  const version = document.envelope.sonamu_meta.revision;
  const text = `${actionLine(document.documentId, version)}\n${JSON.stringify(document.envelope)}\n`;
  return { document, version, text, bytes: utf8ByteLength(text), chars: text.length };
}

const CANONICAL_PREFIX = '{"document":';
const CANONICAL_SUFFIX = ',"state":"present"}';
const CANONICAL_FRAME_BYTES = CANONICAL_PREFIX.length + CANONICAL_SUFFIX.length;

export interface CanonicalEnvelopeSource {
  readonly meta: SonamuMeta;
  readonly canonical?: string;
}

export interface EnvelopeLine {
  readonly text: string;
  readonly bytes: number;
}

// Same JSON value and byte count as JSON.stringify(envelope); only key order inside the document differs.
export function canonicalEnvelopeLine(source: CanonicalEnvelopeSource): EnvelopeLine {
  const metaJson = JSON.stringify(source.meta);
  if (source.canonical === undefined) {
    const text = `{"sonamu_meta":${metaJson}}`;
    return { text, bytes: utf8ByteLength(text) };
  }
  const { canonical } = source;
  if (!canonical.startsWith(CANONICAL_PREFIX) || !canonical.endsWith(CANONICAL_SUFFIX)) {
    throw invalidLimit("canonical");
  }
  const head = `{"sonamu_meta":${metaJson},"doc":`;
  const doc = canonical.slice(CANONICAL_PREFIX.length, canonical.length - CANONICAL_SUFFIX.length);
  return {
    text: `${head}${doc}}`,
    bytes: utf8ByteLength(head) + utf8ByteLength(canonical) - CANONICAL_FRAME_BYTES + 1,
  };
}

// Keep only small values for matching the response in `document`, never the body.
export function serializeCanonicalBulkItem<TDocument extends IdentifiedDocument>(
  document: TDocument,
  source: CanonicalEnvelopeSource,
): SerializedBulkItem<TDocument> | RejectedBulkDocument<TDocument> {
  if (!isSendableDocumentId(document.documentId)) {
    return { document, reason: "invalid_id", bytes: utf8ByteLength(document.documentId) };
  }
  const version = source.meta.revision;
  const action = actionLine(document.documentId, version);
  const envelope = canonicalEnvelopeLine(source);
  const text = `${action}\n${envelope.text}\n`;
  return {
    document,
    version,
    text,
    bytes: utf8ByteLength(action) + envelope.bytes + 2,
    chars: text.length,
  };
}

function isRejected<TDocument extends IdentifiedDocument>(
  value: SerializedBulkItem<TDocument> | RejectedBulkDocument<TDocument>,
): value is RejectedBulkDocument<TDocument> {
  return "reason" in value;
}

export function buildBulkRequest<TDocument extends IdentifiedDocument>(
  items: readonly SerializedBulkItem<TDocument>[],
): BulkRequest<TDocument> {
  let bytes = 0;
  for (const item of items) bytes += item.bytes;
  return { items, body: items.map((item) => item.text).join(""), bytes };
}

export function checkBulkItem<TDocument extends IdentifiedDocument>(
  item: SerializedBulkItem<TDocument> | RejectedBulkDocument<TDocument>,
  limits: Pick<BulkPackLimits, "maxBulkBytes">,
):
  | { readonly kind: "item"; readonly item: SerializedBulkItem<TDocument> }
  | { readonly kind: "rejected"; readonly rejected: RejectedBulkDocument<TDocument> } {
  if (isRejected(item)) return { kind: "rejected", rejected: item };
  if (item.bytes > limits.maxBulkBytes) {
    return {
      kind: "rejected",
      rejected: { document: item.document, reason: "oversized", bytes: item.bytes },
    };
  }
  return { kind: "item", item };
}

export interface BulkPacker<TDocument extends IdentifiedDocument> {
  add(
    item: SerializedBulkItem<TDocument>,
  ): BulkRequest<TDocument, BulkItemRef<TDocument>> | undefined;
  flush(): BulkRequest<TDocument, BulkItemRef<TDocument>> | undefined;
  pendingBytes(): number;
  wouldClose(item: Pick<BulkItemRef<TDocument>, "bytes">): boolean;
}

function closeRequest<TDocument extends IdentifiedDocument>(
  items: readonly SerializedBulkItem<TDocument>[],
  bytes: number,
): BulkRequest<TDocument, BulkItemRef<TDocument>> {
  // Item texts, and the canonical JSON they reference, are released here.
  const body = items.map((item) => item.text).join("");
  return {
    items: items.map(({ document, version, bytes: itemBytes, chars }) => ({
      document,
      version,
      bytes: itemBytes,
      chars,
    })),
    body,
    bytes,
  };
}

export function createBulkPacker<TDocument extends IdentifiedDocument>(
  limits: BulkPackLimits,
): BulkPacker<TDocument> {
  const { maxBulkBytes, maxDocuments } = assertBulkPackLimits(limits);
  let current: SerializedBulkItem<TDocument>[] = [];
  let currentBytes = 0;
  const wouldClose = (item: Pick<BulkItemRef<TDocument>, "bytes">) =>
    current.length > 0 &&
    (current.length >= maxDocuments || currentBytes + item.bytes > maxBulkBytes);
  const flush = () => {
    if (current.length === 0) return undefined;
    const request = closeRequest(current, currentBytes);
    current = [];
    currentBytes = 0;
    return request;
  };
  return {
    add(item) {
      const closed = wouldClose(item) ? flush() : undefined;
      current.push(item);
      currentBytes += item.bytes;
      return closed;
    },
    flush,
    pendingBytes: () => currentBytes,
    wouldClose,
  };
}

export function packBulkRequests<TDocument extends BulkDocument>(
  documents: readonly TDocument[],
  limits: BulkPackLimits,
): BulkPackResult<TDocument> {
  const { maxBulkBytes, maxDocuments } = assertBulkPackLimits(limits);
  const requests: BulkRequest<TDocument>[] = [];
  const rejected: RejectedBulkDocument<TDocument>[] = [];
  let current: SerializedBulkItem<TDocument>[] = [];
  let currentBytes = 0;
  for (const document of documents) {
    const checked = checkBulkItem(serializeBulkItem(document), { maxBulkBytes });
    if (checked.kind === "rejected") {
      rejected.push(checked.rejected);
      continue;
    }
    const { item } = checked;
    if (current.length >= maxDocuments || currentBytes + item.bytes > maxBulkBytes) {
      requests.push(buildBulkRequest(current));
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.bytes;
  }
  if (current.length > 0) requests.push(buildBulkRequest(current));
  return { requests, rejected };
}

export function splitBulkRequest<
  TDocument extends IdentifiedDocument,
  TItem extends BulkItemRef<TDocument>,
>(
  request: BulkRequest<TDocument, TItem>,
): readonly [BulkRequest<TDocument, TItem>, BulkRequest<TDocument, TItem>] | undefined {
  if (request.items.length < 2) return undefined;
  const middle = Math.ceil(request.items.length / 2);
  const head = request.items.slice(0, middle);
  let chars = 0;
  let bytes = 0;
  for (const item of head) {
    chars += item.chars;
    bytes += item.bytes;
  }
  return [
    { items: head, body: request.body.slice(0, chars), bytes },
    {
      items: request.items.slice(middle),
      body: request.body.slice(chars),
      bytes: request.bytes - bytes,
    },
  ];
}
