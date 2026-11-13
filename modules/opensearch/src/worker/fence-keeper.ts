import { randomUUID } from "node:crypto";

import { z } from "zod";

import { readEngineErrorType } from "../client/error-normalization";
import { type SearchRequester } from "../client/search-client";
import { type BoundTarget } from "../postgres/delivery-store";
import { type FenceStore, type StoredFence } from "../postgres/fence-store";
import { type SqlExecutor } from "../postgres/sql";
import { BULK_QUERYSTRING, bulkPath } from "./bulk";
import {
  bulkResponseSchema,
  classifyRequestStatus,
  classifyThrown,
  normalizeEngineType,
  type RequestClassification,
  VERSION_CONFLICT_TYPE,
} from "./classify";
import { MGET_QUERYSTRING } from "./conflict";
import { type CooldownRegistry } from "./cooldown";
import {
  compareFence,
  FENCE_DOCUMENT_ID,
  fenceActionLines,
  type FenceLossClass,
  type FenceLossDetail,
  fenceMgetBody,
  type FencePair,
  type LocalFence,
  readFenceMget,
  type RemoteFenceRead,
} from "./fence";
import { type WorkerLimits } from "./limits";

// Per drain, after the claim and inside the work window:
//  A. Renew due targets (idle and unprojectable ones too) by recording an advance intent; only the worker that gets the
//     row continues. A pending advance older than 2 × requestTimeoutMs is resent with its own nonce.
//  B. Read the remote fence of every target needing verification in one POST /_mget.
//  C. Write the advance remotely and confirm it only if the remote matches; otherwise record a loss.
//  D. Each group sends its confirmed pair as the first bulk item, or holds when the remote was unreadable.

export interface GroupFence {
  pair: FencePair;
  status: "send" | "lost" | "hold";
  reconciling: Promise<void> | undefined;
}

export interface TargetFenceLostEvent {
  readonly type: "target-fence-lost";
  readonly targetId: string;
  readonly class: FenceLossClass;
  readonly localEpoch: number;
  readonly remoteEpoch: number;
}

export interface FenceKeeperDependencies {
  readonly fences: FenceStore;
  readonly requester: SearchRequester;
  readonly limits: Readonly<WorkerLimits>;
  readonly cooldown: Pick<CooldownRegistry, "enter">;
  readonly emit: (event: TargetFenceLostEvent) => void;
}

export interface FenceDrainContext {
  readonly db: SqlExecutor;
  readonly signal: AbortSignal;
  readonly deadline: number;
}

interface FenceMemory {
  verifiedAt: number | undefined;
  lastSentAt: number | undefined;
  retryAt: number | undefined;
}

const RENEWAL_CONCURRENCY = 4;

const leadingItemSchema = z.looseObject({
  items: z
    .array(
      z.strictObject({
        index: z.looseObject({
          _id: z.string(),
          status: z.number().int(),
          error: z.looseObject({ type: z.string() }).optional(),
        }),
      }),
    )
    .min(1),
});

function leadingFenceItem<Body>(body: Body): { status: number; type?: string } | undefined {
  const parsed = leadingItemSchema.safeParse(body);
  const first = parsed.data?.items[0]?.index;
  if (first === undefined || first._id !== FENCE_DOCUMENT_ID) return undefined;
  return { status: first.status, type: first.error?.type };
}

async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await run(item);
    }
  });
  await Promise.all(workers);
}

type AdvanceResult = "advanced" | "lost" | "unknown" | "failed";

export interface FenceKeeper {
  observe(db: SqlExecutor, targets: readonly BoundTarget[]): Promise<void>;
  maintain(
    context: FenceDrainContext,
    input: { all: readonly BoundTarget[]; groups: readonly BoundTarget[] },
  ): Promise<Map<string, GroupFence>>;
  prefix(fence: GroupFence): string;
  afterSend(
    context: FenceDrainContext,
    target: BoundTarget,
    fence: GroupFence,
    outcome:
      | {
          readonly kind: "response";
          readonly status: number;
          readonly body: unknown;
          readonly prefixed: boolean;
        }
      | { readonly kind: "failed" },
  ): Promise<void>;
  lostTargets(): readonly string[];
}

export function createFenceKeeper(dependencies: FenceKeeperDependencies): FenceKeeper {
  const { fences, requester, limits, cooldown, emit } = dependencies;
  const memory = new Map<string, FenceMemory>();
  const lost = new Set<string>();
  const announced = new Set<string>();
  const interval = limits.fenceRenewIntervalMs;
  const statementMs = limits.statementTimeoutMs;
  const requestMs = limits.requestTimeoutMs;
  // R + 3S: the allowance maxDrainDurationMs gives work still running when the window closes.
  const advanceBoundMs = requestMs + 3 * statementMs;
  const reconcileBoundMs = 2 * statementMs + requestMs;

  const memoryOf = (targetId: string): FenceMemory => {
    let found = memory.get(targetId);
    if (found === undefined) {
      found = { verifiedAt: undefined, lastSentAt: undefined, retryAt: undefined };
      memory.set(targetId, found);
    }
    return found;
  };
  const needsVerify = (targetId: string, now: number): boolean => {
    const found = memory.get(targetId);
    if (found?.verifiedAt === undefined) return true;
    return now - Math.max(found.verifiedAt, found.lastSentAt ?? 0) > interval;
  };
  const markVerified = (targetId: string) => {
    memoryOf(targetId).verifiedAt = performance.now();
  };
  const unverify = (targetId: string) => {
    const found = memory.get(targetId);
    if (found !== undefined) found.verifiedAt = undefined;
  };
  const announce = (targetId: string, detail: FenceLossDetail | null) => {
    lost.add(targetId);
    memory.delete(targetId);
    if (announced.has(targetId)) return;
    announced.add(targetId);
    emit({
      type: "target-fence-lost",
      targetId,
      class: detail?.class ?? "foreign",
      localEpoch: detail?.local_epoch ?? 0,
      remoteEpoch: detail?.remote_epoch ?? 0,
    });
  };
  const hold = (fence: GroupFence, targetId: string) => {
    if (fence.status === "send") {
      fence.status = "hold";
      cooldown.enter({ scope: "target", targetId });
    }
    unverify(targetId);
  };

  const recordLoss = async (
    db: SqlExecutor,
    targetId: string,
    detail: FenceLossDetail,
    judged: { epoch: number; pendingNonce: string | null },
  ): Promise<boolean> => {
    // Records only if the state the decision used is unchanged.
    const recorded = await fences.recordLoss(db, {
      targetId,
      detail,
      judgedEpoch: judged.epoch,
      judgedPendingNonce: judged.pendingNonce,
    });
    if (recorded) announce(targetId, detail);
    return recorded;
  };

  const applyRequestFailure = (
    classification: RequestClassification,
    targets: readonly BoundTarget[],
  ) => {
    // Same cooldown as a failed bulk, so an unreachable engine shows as degraded even when no bulk is sent.
    if (classification.kind !== "release" || classification.cooldown === null) return;
    const atMaximum = classification.delay === "maximum";
    if (classification.cooldown === "client") {
      cooldown.enter({ scope: "client" }, { atMaximum });
      return;
    }
    for (const target of targets) {
      cooldown.enter({ scope: "target", targetId: target.targetId }, { atMaximum });
    }
  };

  const readRemote = async (
    context: FenceDrainContext,
    targets: readonly BoundTarget[],
  ): Promise<Map<string, RemoteFenceRead>> => {
    const indexes = targets.map((target) => target.physicalIndex);
    let reads: RemoteFenceRead[];
    try {
      const response = await requester.send(
        {
          method: "POST",
          path: "/_mget",
          body: fenceMgetBody(indexes),
          querystring: MGET_QUERYSTRING,
        },
        { signal: context.signal, timeoutMs: requestMs },
      );
      reads = readFenceMget(indexes, response.status, response.body);
      if (response.status !== 200) {
        applyRequestFailure(
          classifyRequestStatus(
            response.status,
            normalizeEngineType(readEngineErrorType(response.body)),
          ),
          targets,
        );
      }
    } catch (error) {
      applyRequestFailure(classifyThrown(error).classification, targets);
      reads = indexes.map(() => ({ kind: "unknown" }));
    }
    return new Map(
      targets.map((target, position) => [target.targetId, reads[position] ?? { kind: "unknown" }]),
    );
  };

  const writeRemote = async (
    context: FenceDrainContext,
    target: BoundTarget,
    pending: { epoch: number; nonce: string },
  ): Promise<"ok" | "created" | "conflict" | "unknown" | "failed"> => {
    try {
      const response = await requester.send(
        {
          method: "POST",
          path: bulkPath(target.writeAlias),
          ndjson: fenceActionLines(pending.epoch, pending.nonce, "external"),
          querystring: BULK_QUERYSTRING,
        },
        { signal: context.signal, timeoutMs: requestMs },
      );
      if (response.status !== 200) {
        // Without a write alias (404) nothing is written; the document path stops the target.
        if (response.status === 404) return "unknown";
        applyRequestFailure(
          classifyRequestStatus(
            response.status,
            normalizeEngineType(readEngineErrorType(response.body)),
          ),
          [target],
        );
        return "failed";
      }
      const parsed = bulkResponseSchema.safeParse(response.body);
      const item = parsed.data?.items[0]?.index;
      if (parsed.data?.items.length !== 1 || item?._id !== FENCE_DOCUMENT_ID) return "unknown";
      if (item.status === 200) return "ok";
      if (item.status === 201) return "created";
      if (item.status === 409 && item.error?.type === VERSION_CONFLICT_TYPE) return "conflict";
      return "unknown";
    } catch (error) {
      applyRequestFailure(classifyThrown(error).classification, [target]);
      return "failed";
    }
  };

  const drivePending = async (
    context: FenceDrainContext,
    target: BoundTarget,
    pending: { epoch: number; nonce: string },
    judgedEpoch: number,
  ): Promise<AdvanceResult> => {
    const { db } = context;
    const written = await writeRemote(context, target, pending);
    if (written === "failed") return "failed";
    if (written === "created" && judgedEpoch >= 1) {
      // A confirmed fence was expected and missing: the index was recreated.
      const recorded = await recordLoss(
        db,
        target.targetId,
        { class: "regressed", local_epoch: judgedEpoch, remote_epoch: 0 },
        { epoch: judgedEpoch, pendingNonce: pending.nonce },
      );
      return recorded ? "lost" : "unknown";
    }
    if (written === "ok" || written === "created") {
      await fences.completeAdvance(db, { targetId: target.targetId, nonce: pending.nonce });
      return "advanced";
    }
    if (written === "conflict") {
      // Without time for the read and confirmation the pending stays; any worker later resolves it with the same
      // nonce.
      if (
        context.signal.aborted ||
        performance.now() + requestMs + statementMs > context.deadline
      ) {
        return "unknown";
      }
      const read = (await readRemote(context, [target])).get(target.targetId);
      if (read?.kind !== "fence") return "unknown";
      if (read.pair.epoch === pending.epoch && read.pair.nonce === pending.nonce) {
        await fences.completeAdvance(db, { targetId: target.targetId, nonce: pending.nonce });
        return "advanced";
      }
      const recorded = await recordLoss(
        db,
        target.targetId,
        {
          class: read.pair.epoch > judgedEpoch ? "behind" : "foreign",
          local_epoch: judgedEpoch,
          remote_epoch: read.pair.epoch,
        },
        { epoch: judgedEpoch, pendingNonce: pending.nonce },
      );
      return recorded ? "lost" : "unknown";
    }
    return "unknown";
  };

  const settleGroup = async (
    context: FenceDrainContext,
    target: BoundTarget,
    fence: GroupFence,
    remote: FencePair,
  ): Promise<void> => {
    const { db } = context;
    let local: LocalFence = {
      epoch: target.fence.epoch,
      nonce: target.fence.nonce,
      pending: null,
      lost: false,
    };
    let verdict = compareFence(remote, local);
    if (verdict.kind !== "current" && verdict.kind !== "unfenced") {
      const stored: StoredFence = await fences.read(db, target.targetId);
      if (stored.lost) {
        fence.status = "lost";
        announce(target.targetId, stored.lostDetail);
        return;
      }
      local = stored;
      verdict = compareFence(remote, local);
    }
    switch (verdict.kind) {
      case "current":
        fence.pair = { epoch: local.epoch, nonce: local.nonce };
        markVerified(target.targetId);
        return;
      case "pending-landed": {
        const pending = local.pending;
        if (pending === null) return hold(fence, target.targetId);
        await fences.completeAdvance(db, { targetId: target.targetId, nonce: pending.nonce });
        fence.pair = pending;
        markVerified(target.targetId);
        return;
      }
      case "unfenced":
      case "takeover-pending": {
        let pending = local.pending;
        if (pending === null && verdict.kind === "unfenced") {
          pending =
            (await fences.beginAdvance(db, {
              targetId: target.targetId,
              nonce: randomUUID(),
              seenEpoch: 0,
              intervalMs: null,
            })) ?? null;
          if (pending === null) {
            const stored = await fences.read(db, target.targetId);
            if (stored.lost) {
              fence.status = "lost";
              announce(target.targetId, stored.lostDetail);
              return;
            }
            local = stored;
            pending = stored.pending;
          }
        }
        if (pending === null) {
          // A sibling already confirmed; send that pair and let the fence item verify it.
          fence.pair = { epoch: local.epoch, nonce: local.nonce };
          return;
        }
        const result = await drivePending(context, target, pending, local.epoch);
        if (result === "advanced") {
          fence.pair = pending;
          markVerified(target.targetId);
        } else if (result === "lost") {
          fence.status = "lost";
        } else if (result === "failed") {
          // The engine was unreachable and a work bulk would fail too (cooldown already entered).
          hold(fence, target.targetId);
        } else {
          // Remote write result unknown: send the confirmed pair and let the document path classify.
          fence.pair = { epoch: local.epoch, nonce: local.nonce };
        }
        return;
      }
      case "lost": {
        const recorded = await recordLoss(
          db,
          target.targetId,
          {
            class: verdict.class,
            local_epoch: verdict.localEpoch,
            remote_epoch: verdict.remoteEpoch,
          },
          { epoch: local.epoch, pendingNonce: local.pending?.nonce ?? null },
        );
        if (recorded) fence.status = "lost";
        else hold(fence, target.targetId);
        return;
      }
    }
  };

  return {
    async observe(db, targets) {
      const live = new Set(targets.map((target) => target.targetId));
      for (const targetId of memory.keys()) if (!live.has(targetId)) memory.delete(targetId);
      lost.clear();
      for (const target of targets) if (target.fence.lost) lost.add(target.targetId);
      for (const targetId of announced) if (!lost.has(targetId)) announced.delete(targetId);
      for (const targetId of lost) {
        memory.delete(targetId);
        if (announced.has(targetId)) continue;
        try {
          announce(targetId, (await fences.read(db, targetId)).lostDetail);
        } catch {
          // Already in the lost set; the next drain reads again.
        }
      }
    },

    async maintain(context, input) {
      const { db, signal, deadline } = context;
      const result = new Map<string, GroupFence>();
      const fits = (bound: number) => !signal.aborted && performance.now() + bound <= deadline;

      const now = performance.now();
      const due = input.all.filter((target) => {
        if (target.fence.lost) return false;
        const { pendingAgeMs, renewalDue } = target.fence;
        if (pendingAgeMs === null) return renewalDue;
        const retryAt = memory.get(target.targetId)?.retryAt;
        return pendingAgeMs > 2 * requestMs && (retryAt === undefined || now >= retryAt);
      });
      const winners: { target: BoundTarget; pending: { epoch: number; nonce: string } }[] = [];
      await mapLimit(due, RENEWAL_CONCURRENCY, async (target) => {
        if (!fits(advanceBoundMs)) return;
        try {
          if (target.fence.pendingAgeMs !== null) {
            memoryOf(target.targetId).retryAt = performance.now() + interval;
            const stored = await fences.read(db, target.targetId);
            if (stored.lost || stored.pending === null) return;
            await drivePending(context, target, stored.pending, stored.epoch);
            return;
          }
          const pending = await fences.beginAdvance(db, {
            targetId: target.targetId,
            nonce: randomUUID(),
            seenEpoch: target.fence.epoch,
            intervalMs: interval,
          });
          if (pending !== undefined) winners.push({ target, pending });
        } catch {
          // A failed renewal never blocks indexing; a leftover pending is resolved after 2 × requestTimeoutMs.
        }
      });

      const checkAt = performance.now();
      const toRead = new Map<string, BoundTarget>();
      for (const winner of winners) {
        if (needsVerify(winner.target.targetId, checkAt)) {
          toRead.set(winner.target.targetId, winner.target);
        }
      }
      for (const target of input.groups) {
        if (!lost.has(target.targetId) && needsVerify(target.targetId, checkAt)) {
          toRead.set(target.targetId, target);
        }
      }
      const reads =
        toRead.size > 0 && fits(requestMs)
          ? await readRemote(context, [...toRead.values()])
          : new Map<string, RemoteFenceRead>();

      const advanced = new Map<string, FencePair>();
      await mapLimit(winners, RENEWAL_CONCURRENCY, async ({ target, pending }) => {
        try {
          const judged = target.fence.epoch;
          if (toRead.has(target.targetId)) {
            const read = reads.get(target.targetId);
            if (read?.kind !== "fence") {
              unverify(target.targetId);
              return;
            }
            const verdict = compareFence(read.pair, {
              epoch: judged,
              nonce: target.fence.nonce,
              pending: null,
            });
            if (verdict.kind === "lost") {
              await recordLoss(
                db,
                target.targetId,
                {
                  class: verdict.class,
                  local_epoch: verdict.localEpoch,
                  remote_epoch: verdict.remoteEpoch,
                },
                { epoch: judged, pendingNonce: pending.nonce },
              );
              return;
            }
            if (verdict.kind !== "current" && verdict.kind !== "unfenced") return;
            markVerified(target.targetId);
          }
          if (!fits(requestMs + statementMs)) return;
          const outcome = await drivePending(context, target, pending, judged);
          if (outcome === "advanced") advanced.set(target.targetId, pending);
        } catch {
          // As above.
        }
      });

      for (const target of input.groups) {
        const fence: GroupFence = {
          pair: { epoch: target.fence.epoch, nonce: target.fence.nonce },
          status: lost.has(target.targetId) ? "lost" : "send",
          reconciling: undefined,
        };
        result.set(target.targetId, fence);
        if (fence.status !== "send") continue;
        const own = advanced.get(target.targetId);
        if (!toRead.has(target.targetId)) {
          if (own !== undefined) fence.pair = own;
          continue;
        }
        const read = reads.get(target.targetId);
        if (read === undefined) {
          unverify(target.targetId);
          continue;
        }
        if (read.kind === "unknown") {
          hold(fence, target.targetId);
          continue;
        }
        if (read.kind === "index-missing") {
          unverify(target.targetId);
          continue;
        }
        if (own !== undefined) {
          // This process just advanced, so the remote it read must still match the confirmed pair.
          const before = compareFence(read.pair, {
            epoch: target.fence.epoch,
            nonce: target.fence.nonce,
            pending: null,
          });
          if (before.kind === "current" || before.kind === "unfenced") {
            fence.pair = own;
            markVerified(target.targetId);
            continue;
          }
        }
        if (!fits(advanceBoundMs)) {
          // No time to decide (short lease): send unverified; the fence item and the next drain verify.
          unverify(target.targetId);
          continue;
        }
        try {
          await settleGroup(context, target, fence, read.pair);
        } catch {
          hold(fence, target.targetId);
        }
      }
      return result;
    },

    prefix(fence) {
      const { epoch, nonce } = fence.pair;
      return fence.status === "send" && epoch >= 1 && nonce !== null
        ? fenceActionLines(epoch, nonce, "external_gte")
        : "";
    },

    async afterSend(context, target, fence, outcome) {
      const { targetId } = target;
      if (outcome.kind === "failed" || outcome.status !== 200) {
        unverify(targetId);
        return;
      }
      memoryOf(targetId).lastSentAt = performance.now();
      if (!outcome.prefixed) return;
      const item = leadingFenceItem(outcome.body);
      if (item === undefined) {
        unverify(targetId);
        return;
      }
      if (item.status === 200) return;
      const sent = fence.pair;
      if (item.status === 201) {
        // Regressed: this bulk's documents are already written to the recreated index, since the fence does not gate.
        await guarded(fence, targetId, async () => {
          const stored = await fences.read(context.db, targetId);
          if (stored.lost) {
            fence.status = "lost";
            announce(targetId, stored.lostDetail);
            return;
          }
          const recorded = await recordLoss(
            context.db,
            targetId,
            { class: "regressed", local_epoch: stored.epoch, remote_epoch: 0 },
            { epoch: stored.epoch, pendingNonce: stored.pending?.nonce ?? null },
          );
          if (recorded) fence.status = "lost";
          else hold(fence, targetId);
        });
        return;
      }
      if (item.status !== 409 || item.type !== VERSION_CONFLICT_TYPE) {
        unverify(targetId);
        return;
      }
      if (fence.reconciling !== undefined) {
        await fence.reconciling;
        return;
      }
      if (fence.pair !== sent || fence.status !== "send") return;
      if (performance.now() + reconcileBoundMs > context.deadline) {
        hold(fence, targetId);
        return;
      }
      fence.reconciling = guarded(fence, targetId, async () => {
        const stored = await fences.read(context.db, targetId);
        if (stored.lost) {
          fence.status = "lost";
          announce(targetId, stored.lostDetail);
          return;
        }
        if (stored.epoch > sent.epoch && stored.nonce !== null) {
          // A sibling worker advanced; not a loss.
          fence.pair = { epoch: stored.epoch, nonce: stored.nonce };
          return;
        }
        const read = (await readRemote(context, [target])).get(targetId);
        if (read?.kind !== "fence") {
          hold(fence, targetId);
          return;
        }
        const verdict = compareFence(read.pair, stored);
        switch (verdict.kind) {
          case "current":
            fence.pair = { epoch: stored.epoch, nonce: stored.nonce };
            markVerified(targetId);
            return;
          case "pending-landed":
            if (stored.pending === null) return hold(fence, targetId);
            await fences.completeAdvance(context.db, { targetId, nonce: stored.pending.nonce });
            fence.pair = stored.pending;
            markVerified(targetId);
            return;
          case "lost": {
            const recorded = await recordLoss(
              context.db,
              targetId,
              {
                class: verdict.class,
                local_epoch: verdict.localEpoch,
                remote_epoch: verdict.remoteEpoch,
              },
              { epoch: stored.epoch, pendingNonce: stored.pending?.nonce ?? null },
            );
            if (recorded) fence.status = "lost";
            else hold(fence, targetId);
            return;
          }
          default:
            hold(fence, targetId);
        }
      });
      try {
        await fence.reconciling;
      } finally {
        fence.reconciling = undefined;
      }
    },

    lostTargets() {
      return [...lost].toSorted();
    },
  };

  async function guarded(
    fence: GroupFence,
    targetId: string,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
    } catch {
      hold(fence, targetId);
    }
  }
}
