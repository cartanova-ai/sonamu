import { z } from "zod";

import { type SonamuMeta } from "../definition/envelope";
import { type DeliveryError } from "../postgres/delivery-store";
import { normalizeEngineType } from "./classify";

// A 409 is success only when the indexed revision V is proven M <= V <= L, with M the revision sent and L the ledger
// revision read after the mget in a new statement. V < M or V > L means index and ledger diverged: pause, never ack.

export const mgetDocumentSchema = z.looseObject({
  _id: z.string(),
  _index: z.string().optional(),
  found: z.boolean().optional(),
  _version: z.number().int().optional(),
  _source: z.unknown().optional(),
  error: z.looseObject({ type: z.string().min(1) }).optional(),
});
export const mgetMetaSchema = z.looseObject({ docs: z.array(mgetDocumentSchema) });

export const indexedMetaSourceSchema = z.looseObject({
  sonamu_meta: z.strictObject({
    deleted: z.boolean(),
    revision: z.number().int().min(1),
    hash_version: z.string().min(1),
    projection_hash: z.string().min(1),
  }),
});

export function mgetPath(physicalIndex: string): string {
  return `/${encodeURIComponent(physicalIndex)}/_mget`;
}
export const MGET_QUERYSTRING: Readonly<Record<string, string>> = Object.freeze({
  _source_includes: "sonamu_meta",
});

export interface ConflictCandidate {
  readonly documentId: string;
  readonly attempted: SonamuMeta;
}

export interface DivergentDocument {
  readonly id: string;
  readonly indexed: number;
  readonly ledger: number;
}

export type ConflictVerdict =
  | { readonly kind: "duplicate" }
  | { readonly kind: "superseded" }
  | { readonly kind: "poison"; readonly error: DeliveryError }
  | { readonly kind: "release"; readonly error: DeliveryError }
  | { readonly kind: "pause"; readonly document: DivergentDocument };

export type MgetResult =
  | { readonly kind: "response"; readonly status: number; readonly body: unknown }
  | { readonly kind: "failed" };

export interface VerifyConflictsInput {
  readonly physicalIndex: string;
  readonly conflicts: readonly ConflictCandidate[];
  readonly mget: MgetResult;
  readonly ledger: ReadonlyMap<string, number> | undefined;
}

function release(reason: string, extra: Record<string, string | number> = {}): ConflictVerdict {
  return { kind: "release", error: { class: "conflict_unverified", reason, ...extra } };
}

export function verifyConflicts(input: VerifyConflictsInput): ConflictVerdict[] {
  const { conflicts, ledger, physicalIndex, mget } = input;
  if (mget.kind === "failed") return conflicts.map(() => release("mget-failed"));
  if (ledger === undefined) return conflicts.map(() => release("ledger-read-failed"));
  if (mget.status !== 200) {
    return conflicts.map(() => release("mget-status", { status: mget.status }));
  }
  const parsed = mgetMetaSchema.safeParse(mget.body);
  if (!parsed.success) return conflicts.map(() => release("mget-invalid-response"));
  const { docs } = parsed.data;
  if (
    docs.length !== conflicts.length ||
    conflicts.some((conflict, index) => docs[index]?._id !== conflict.documentId)
  ) {
    return conflicts.map(() => release("mget-mismatch"));
  }
  return conflicts.map((conflict, index) => {
    const doc = docs[index];
    if (doc === undefined) return release("mget-mismatch");
    if (doc.error !== undefined) {
      return release("mget-document-error", { type: normalizeEngineType(doc.error.type) });
    }
    if (doc.found !== true) return release("document-missing");
    const M = conflict.attempted.revision;
    const L = ledger.get(conflict.documentId) ?? 0;
    const source = indexedMetaSourceSchema.safeParse(doc._source);
    const V = doc._version;
    if (
      V === undefined ||
      !source.success ||
      source.data.sonamu_meta.revision !== V ||
      (doc._index !== undefined && doc._index !== physicalIndex)
    ) {
      return { kind: "pause", document: { id: conflict.documentId, indexed: V ?? 0, ledger: L } };
    }
    const indexed = source.data.sonamu_meta;
    if (V > L || V < M) {
      return { kind: "pause", document: { id: conflict.documentId, indexed: V, ledger: L } };
    }
    if (V > M) return { kind: "superseded" };
    if (indexed.hash_version !== conflict.attempted.hash_version) {
      return {
        kind: "release",
        error: { class: "hash_version_mismatch", revision: M },
      };
    }
    if (
      indexed.projection_hash === conflict.attempted.projection_hash &&
      indexed.deleted === conflict.attempted.deleted
    ) {
      return { kind: "duplicate" };
    }
    return { kind: "poison", error: { class: "hash_mismatch", revision: M } };
  });
}

export interface MgetRequestBody {
  ids: string[];
}

export function mgetBody(conflicts: readonly ConflictCandidate[]): MgetRequestBody {
  return { ids: conflicts.map((conflict) => conflict.documentId) };
}
