import { z } from "zod";

import { RESERVED_FENCE_DOCUMENT_ID, utf8ByteLength } from "../definition/names";
import { INDEX_NOT_FOUND_TYPE } from "./classify";
import { mgetDocumentSchema, mgetMetaSchema } from "./conflict";

// The fence detects, it does not gate: a bulk whose fence item gets 409 still writes the documents after it, so it
// only bounds how long a second database writes the same index. Work bulks lead with the confirmed pair as
// external_gte: 200 passes, 409 means another writer is ahead, 201 (fence document missing) means the index
// regressed.

export const FENCE_DOCUMENT_ID = RESERVED_FENCE_DOCUMENT_ID;
export const FENCE_HASH_VERSION = "sonamu-fence-v1";
// Mirrors the DDL CHECK on target_fences.epoch.
export const MAX_FENCE_EPOCH = 9_007_199_254_740_990;

export type FenceVersionType = "external" | "external_gte";

export type FenceLossClass = "behind" | "regressed" | "foreign";

export interface FencePair {
  readonly epoch: number;
  readonly nonce: string | null;
}

export interface LocalFence extends FencePair {
  readonly pending: { readonly epoch: number; readonly nonce: string } | null;
  readonly lost: boolean;
}

export function fenceActionLines(
  epoch: number,
  nonce: string,
  versionType: FenceVersionType,
): string {
  const action = JSON.stringify({
    index: { _id: FENCE_DOCUMENT_ID, version: epoch, version_type: versionType },
  });
  const body = JSON.stringify({
    sonamu_meta: {
      deleted: true,
      revision: epoch,
      hash_version: FENCE_HASH_VERSION,
      projection_hash: nonce,
    },
  });
  return `${action}\n${body}\n`;
}

// Reserved from the byte budgets of every bulk request.
export const FENCE_ACTION_MAX_BYTES = utf8ByteLength(
  fenceActionLines(MAX_FENCE_EPOCH, "00000000-0000-0000-0000-000000000000", "external_gte"),
);

export function fenceMgetBody(physicalIndexes: readonly string[]) {
  return { docs: physicalIndexes.map((index) => ({ _index: index, _id: FENCE_DOCUMENT_ID })) };
}

export type RemoteFenceRead =
  | { readonly kind: "fence"; readonly pair: FencePair }
  | { readonly kind: "index-missing" }
  | { readonly kind: "unknown" };

const nonceSchema = z.uuid();
const fenceSourceSchema = z.looseObject({
  sonamu_meta: z.strictObject({
    deleted: z.literal(true),
    revision: z.number().int().min(1).max(MAX_FENCE_EPOCH),
    hash_version: z.literal(FENCE_HASH_VERSION),
    projection_hash: nonceSchema,
  }),
});

// A fence document the package did not write yields its epoch without a nonce, which matches no record: lost.
export function readFenceDocument<Raw>(raw: Raw): RemoteFenceRead {
  const document = mgetDocumentSchema.safeParse(raw);
  if (!document.success || document.data._id !== FENCE_DOCUMENT_ID) return { kind: "unknown" };
  const { error, found } = document.data;
  if (error !== undefined) {
    return error.type === INDEX_NOT_FOUND_TYPE ? { kind: "index-missing" } : { kind: "unknown" };
  }
  if (found === false) return { kind: "fence", pair: { epoch: 0, nonce: null } };
  if (found !== true) return { kind: "unknown" };
  const version = document.data._version;
  if (version === undefined || version < 1) return { kind: "unknown" };
  const source = fenceSourceSchema.safeParse(document.data._source);
  if (!source.success || source.data.sonamu_meta.revision !== version) {
    return { kind: "fence", pair: { epoch: version, nonce: null } };
  }
  return {
    kind: "fence",
    pair: { epoch: version, nonce: source.data.sonamu_meta.projection_hash },
  };
}

export function readFenceMget<Body>(
  physicalIndexes: readonly string[],
  status: number,
  body: Body,
): RemoteFenceRead[] {
  const unknown = physicalIndexes.map((): RemoteFenceRead => ({ kind: "unknown" }));
  if (status !== 200) return unknown;
  const parsed = mgetMetaSchema.safeParse(body);
  if (!parsed.success || parsed.data.docs.length !== physicalIndexes.length) return unknown;
  return parsed.data.docs.map((doc, position) => {
    const index = mgetDocumentSchema.safeParse(doc).data?._index;
    // Responses follow request order; an answer for another index is not trusted.
    if (index !== undefined && index !== physicalIndexes[position]) return { kind: "unknown" };
    return readFenceDocument(doc);
  });
}

export type FenceVerdict =
  | { readonly kind: "current" }
  | { readonly kind: "pending-landed" }
  | { readonly kind: "unfenced" }
  | { readonly kind: "takeover-pending" }
  | {
      readonly kind: "lost";
      readonly class: FenceLossClass;
      readonly localEpoch: number;
      readonly remoteEpoch: number;
    };

function samePair(left: FencePair, right: FencePair): boolean {
  return left.epoch === right.epoch && left.nonce === right.nonce;
}

export function compareFence(
  remote: FencePair,
  local: Pick<LocalFence, "epoch" | "nonce" | "pending">,
): FenceVerdict {
  const { pending } = local;
  if (pending !== null && remote.nonce !== null && samePair(remote, pending)) {
    return { kind: "pending-landed" };
  }
  if (local.epoch >= 1 && local.nonce !== null && samePair(remote, local)) {
    return { kind: "current" };
  }
  if (local.epoch === 0 && remote.epoch === 0) return { kind: "unfenced" };
  if (
    local.epoch >= 1 &&
    local.nonce === null &&
    pending !== null &&
    remote.epoch === local.epoch
  ) {
    return { kind: "takeover-pending" };
  }
  return {
    kind: "lost",
    class: lossClass(local.epoch, remote.epoch),
    localEpoch: local.epoch,
    remoteEpoch: remote.epoch,
  };
}

export function lossClass(localEpoch: number, remoteEpoch: number): FenceLossClass {
  if (remoteEpoch > localEpoch) return "behind";
  if (remoteEpoch < localEpoch) return "regressed";
  return "foreign";
}

export interface FenceLossDetail {
  readonly class: FenceLossClass;
  readonly local_epoch: number;
  readonly remote_epoch: number;
}

export const fenceLossDetailSchema = z.object({
  class: z.enum(["behind", "regressed", "foreign"]),
  local_epoch: z.number().int().min(0),
  remote_epoch: z.number().int().min(0),
});

export function isFenceNonce(value: string): boolean {
  return nonceSchema.safeParse(value).success;
}
