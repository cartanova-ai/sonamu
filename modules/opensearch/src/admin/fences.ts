import { randomUUID } from "node:crypto";

import { z } from "zod";

import { readEngineErrorType } from "../client/error-normalization";
import { type SearchRequester } from "../client/search-client";
import { SearchAdminPreconditionFailed, SearchStoreMismatch, SearchUnavailable } from "../errors";
import { createFenceStore, type FenceStore } from "../postgres/fence-store";
import { qualified, schemaIdentifier, sql, type SqlFragment, statement } from "../postgres/sql";
import { createSchemaStatementCache } from "../postgres/statement-cache";
import { BULK_QUERYSTRING, bulkPath } from "../worker/bulk";
import {
  bulkResponseSchema,
  INDEX_NOT_FOUND_TYPE,
  VERSION_CONFLICT_TYPE,
} from "../worker/classify";
import { MGET_QUERYSTRING, mgetPath } from "../worker/conflict";
import {
  compareFence,
  FENCE_DOCUMENT_ID,
  fenceActionLines,
  type FenceLossDetail,
  fenceMgetBody,
  type FencePair,
  readFenceMget,
  type RemoteFenceRead,
} from "../worker/fence";
import { type AdminStore, invalidAdminRow } from "./admin-lease";
import { adminUuidSchema } from "./rows";

// verifyFence never bootstraps: with no fence on either side it passes as "unfenced", and an already recorded loss
// throws without reading the remote side. takeOverFences runs after confirmStoreOwnership records the origin, holding
// every lease: remote read → record takeover → remote write at epoch + 1 → complete; a 409 restarts from the remote
// read, at most TAKEOVER_ATTEMPTS times.

type FenceListStatements = { readonly listTakeoverTargets: SqlFragment };

function renderFenceListStatements(schema: string): FenceListStatements {
  const targets = qualified(schemaIdentifier(schema), "targets");
  return {
    listTakeoverTargets: sql`SELECT target_id, physical_index, write_alias FROM ${targets}
WHERE state IN ('creating', 'active', 'paused', 'retiring') ORDER BY target_id;`,
  };
}

const listCache = createSchemaStatementCache(renderFenceListStatements);
const fenceStoreCache = createSchemaStatementCache((schema) =>
  createFenceStore({ schema, context: "admin" }),
);

export function adminFenceStoreFor(schema: string): FenceStore {
  return fenceStoreCache.get(schema);
}

const fenceTargetRowSchema = z.object({
  target_id: adminUuidSchema,
  physical_index: z.string().min(1),
  write_alias: z.string().min(1),
});

export interface FenceTarget {
  readonly targetId: string;
  readonly physicalIndex: string;
}

export function fenceLost(targetId: string, detail: FenceLossDetail | null): SearchStoreMismatch {
  const fenceClass = detail?.class ?? "foreign";
  const localEpoch = detail?.local_epoch ?? 0;
  const remoteEpoch = detail?.remote_epoch ?? 0;
  return new SearchStoreMismatch(
    { key: "fence.lost", params: { targetId, class: fenceClass, localEpoch, remoteEpoch } },
    {
      details: {
        reason: "target-fence-lost",
        targetId,
        class: fenceClass,
        localEpoch,
        remoteEpoch,
      },
    },
  );
}

function fenceUnreadable(targetId: string, reason: string): SearchUnavailable {
  return new SearchUnavailable(
    { key: "fence.unreadable", params: { targetId } },
    { details: { reason, targetId } },
  );
}

async function readOne(requester: SearchRequester, target: FenceTarget): Promise<RemoteFenceRead> {
  try {
    const response = await requester.send({
      method: "POST",
      path: mgetPath(target.physicalIndex),
      body: { ids: [FENCE_DOCUMENT_ID] },
      querystring: MGET_QUERYSTRING,
    });
    if (response.status === 404 && readEngineErrorType(response.body) === INDEX_NOT_FOUND_TYPE) {
      return { kind: "index-missing" };
    }
    return (
      readFenceMget([target.physicalIndex], response.status, response.body)[0] ?? {
        kind: "unknown",
      }
    );
  } catch {
    return { kind: "unknown" };
  }
}

export async function verifyFence(
  store: AdminStore,
  requester: SearchRequester,
  target: FenceTarget,
): Promise<"fenced" | "unfenced" | "takeover-pending" | "index-missing"> {
  const fences = adminFenceStoreFor(store.schema);
  const stored = await store.transaction((trx) => fences.read(trx, target.targetId));
  if (stored.lost) throw fenceLost(target.targetId, stored.lostDetail);
  const read = await readOne(requester, target);
  if (read.kind === "index-missing") return "index-missing";
  if (read.kind === "unknown") throw fenceUnreadable(target.targetId, "fence-unreadable");
  const verdict = compareFence(read.pair, stored);
  switch (verdict.kind) {
    case "current":
      return "fenced";
    case "unfenced":
      return "unfenced";
    case "takeover-pending":
      return "takeover-pending";
    case "pending-landed": {
      const pending = stored.pending;
      if (pending !== null) {
        await store.transaction((trx) =>
          fences.completeAdvance(trx, { targetId: target.targetId, nonce: pending.nonce }),
        );
      }
      return "fenced";
    }
    case "lost": {
      const detail: FenceLossDetail = {
        class: verdict.class,
        local_epoch: verdict.localEpoch,
        remote_epoch: verdict.remoteEpoch,
      };
      const recorded = await store.transaction((trx) =>
        fences.recordLoss(trx, {
          targetId: target.targetId,
          detail,
          judgedEpoch: stored.epoch,
          judgedPendingNonce: stored.pending?.nonce ?? null,
        }),
      );
      // The record changed between read and judgement (a sibling worker completed an advance): retry, do not declare
      // a loss.
      if (!recorded) throw fenceUnreadable(target.targetId, "fence-state-changed");
      throw fenceLost(target.targetId, detail);
    }
  }
}

export async function listFenceCandidates(
  store: AdminStore,
): Promise<{ targetId: string; physicalIndex: string; writeAlias: string }[]> {
  const q = listCache.get(store.schema);
  const result = await store.transaction(
    (trx) => store.execute(trx, statement(q.listTakeoverTargets)),
    {
      readOnly: true,
    },
  );
  return result.rows.map((raw) => {
    const row = fenceTargetRowSchema.safeParse(raw);
    if (!row.success) throw invalidAdminRow("listTakeoverTargets");
    return {
      targetId: row.data.target_id,
      physicalIndex: row.data.physical_index,
      writeAlias: row.data.write_alias,
    };
  });
}

async function writeTakeover(
  requester: SearchRequester,
  writeAlias: string,
  pair: { epoch: number; nonce: string },
): Promise<"written" | "conflict" | "missing" | "unknown"> {
  try {
    const response = await requester.send({
      method: "POST",
      path: bulkPath(writeAlias),
      ndjson: fenceActionLines(pair.epoch, pair.nonce, "external"),
      querystring: BULK_QUERYSTRING,
    });
    if (response.status === 404) return "missing";
    if (response.status !== 200) return "unknown";
    const parsed = bulkResponseSchema.safeParse(response.body);
    const item = parsed.data?.items[0]?.index;
    if (parsed.data?.items.length !== 1 || item?._id !== FENCE_DOCUMENT_ID) return "unknown";
    if (item.status === 200 || item.status === 201) return "written";
    if (item.status === 409 && item.error?.type === VERSION_CONFLICT_TYPE) return "conflict";
    if (item.status === 404 && item.error?.type === INDEX_NOT_FOUND_TYPE) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

const TAKEOVER_ATTEMPTS = 3;

export async function takeOverFences(
  store: AdminStore,
  requester: SearchRequester,
  candidates: readonly { targetId: string; physicalIndex: string; writeAlias: string }[],
): Promise<{ targetId: string; epoch: number }[]> {
  if (candidates.length === 0) return [];
  const fences = adminFenceStoreFor(store.schema);
  const indexes = candidates.map((candidate) => candidate.physicalIndex);
  let first: RemoteFenceRead[];
  try {
    const response = await requester.send({
      method: "POST",
      path: "/_mget",
      body: fenceMgetBody(indexes),
      querystring: MGET_QUERYSTRING,
    });
    first = readFenceMget(indexes, response.status, response.body);
  } catch {
    first = indexes.map(() => ({ kind: "unknown" }));
  }
  const fenced: { targetId: string; epoch: number }[] = [];
  for (const [position, candidate] of candidates.entries()) {
    let read: RemoteFenceRead = first[position] ?? { kind: "unknown" };
    for (let attempt = 1; ; attempt += 1) {
      if (read.kind === "index-missing") break;
      if (read.kind === "unknown") throw fenceUnreadable(candidate.targetId, "fence-unreadable");
      const remote: FencePair = read.pair;
      const nonce = randomUUID();
      const epoch = await store.transaction((trx) =>
        fences.takeOver(trx, { targetId: candidate.targetId, remoteEpoch: remote.epoch, nonce }),
      );
      const written = await writeTakeover(requester, candidate.writeAlias, { epoch, nonce });
      if (written === "written") {
        await store.transaction((trx) =>
          fences.completeAdvance(trx, { targetId: candidate.targetId, nonce }),
        );
        fenced.push({ targetId: candidate.targetId, epoch });
        break;
      }
      if (written === "missing") break;
      if (written === "unknown") {
        throw fenceUnreadable(candidate.targetId, "fence-takeover-unknown");
      }
      if (attempt >= TAKEOVER_ATTEMPTS) {
        throw new SearchAdminPreconditionFailed(
          {
            key: "fence.takeoverContended",
            params: { targetId: candidate.targetId, attempts: TAKEOVER_ATTEMPTS },
          },
          {
            details: {
              reason: "fence-takeover-contended",
              targetId: candidate.targetId,
              attempts: TAKEOVER_ATTEMPTS,
            },
          },
        );
      }
      read = await readOne(requester, candidate);
    }
  }
  return fenced;
}
