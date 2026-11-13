import { Client } from "@opensearch-project/opensearch";
import {
  createSearchClient,
  RECOMMENDED_ADMIN_LIFETIMES,
  RECOMMENDED_ADMIN_TIMEOUTS,
  RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
  RECOMMENDED_CUTOVER,
  RECOMMENDED_WORKER_LIMITS,
  SearchAdminPreconditionFailed,
  workerBoundsFrom,
} from "@sonamu-kit/opensearch";
import {
  type AdminContext,
  applySearchGrants,
  type BuildHandle,
  type CreatePlan,
  createSearchAdmin,
  type DocumentScope,
  type ReadLifetimeChange,
  type ReadLifetimes,
  type SearchAdmin,
  type SearchAdminOptions,
  type SearchGrantsOptions,
  type TargetHandle,
  type TargetLag,
} from "@sonamu-kit/opensearch/admin";
import { createPostgresSynchronization } from "@sonamu-kit/opensearch/postgres";
import { type Knex } from "knex";
import { z } from "zod";

import { chatMessagesSearch } from "./chat-messages.definition";
import { SEARCH_NAMESPACE } from "./client";

const ambiguousCreateSchema = z.looseObject({
  reason: z.literal("remote-create-ambiguous"),
  targetId: z.string(),
});

const gracePendingSchema = z.looseObject({
  reason: z.literal("retirement-grace-pending"),
  earliestAtMs: z.number(),
});

/** Build the admin handle with admin credentials only, and run its commands explicitly from operator tooling. */
export function createChatSearchAdmin(adminDatabase: () => Knex): SearchAdmin {
  return createSearchAdmin({
    ...adminOptions(adminDatabase),
    client: createSearchClient({
      createClient: () =>
        new Client({ node: process.env.OPENSEARCH_ADMIN_URL ?? "http://localhost:9200" }),
      ownsClient: true,
      requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    }),
  });
}

/** Without OpenSearch credentials only POSTGRES_ONLY_ADMIN_OPERATIONS work; the rest refuse with search-client-not-configured. */
export function createChatSearchMonitor(adminDatabase: () => Knex): SearchAdmin {
  return createSearchAdmin(adminOptions(adminDatabase));
}

function adminOptions(adminDatabase: () => Knex): SearchAdminOptions {
  return {
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: adminDatabase,
      namespace: SEARCH_NAMESPACE,
      // Set a distinct name per environment from its configuration; a name fixed in code protects nothing.
      instanceName: process.env.SEARCH_INSTANCE_NAME,
    }),
    definitions: [chatMessagesSearch],
    lifetimes: RECOMMENDED_ADMIN_LIFETIMES,
    timeouts: RECOMMENDED_ADMIN_TIMEOUTS,
    cutover: RECOMMENDED_CUTOVER,
    // Derive from the limits the workers actually use; retirement waits for in-flight writes by these bounds.
    workerBounds: workerBoundsFrom(RECOMMENDED_WORKER_LIMITS),
  };
}

/** A role may appear in one group only; grant a login role that needs two groups membership in both group roles instead. */
export async function grantSearchRoles(adminKnex: Knex, schema?: string): Promise<void> {
  const options: SearchGrantsOptions = {
    roles: {
      capture: ["chat_search_capture"],
      worker: ["chat_search_worker"],
      query: ["chat_search_query"],
      admin: ["chat_search_admin"],
    },
  };
  if (schema !== undefined) options.schema = schema;
  await applySearchGrants(adminKnex, options);
}

export function auditContext(actor: string, reason: string): AdminContext {
  return { operationId: `chat-search-${Date.now()}`, actor, reason };
}

export async function backfill(admin: SearchAdmin, build: BuildHandle): Promise<void> {
  for (;;) {
    const progress = await admin.runBackfillPage(build.buildId, { limit: 1_000 });
    if (progress.done) return;
  }
}

export async function buildAndCutover(
  admin: SearchAdmin,
  audit: AdminContext,
): Promise<BuildHandle> {
  const build = await admin.beginRebuild(
    { logicalKey: chatMessagesSearch.key, fingerprint: chatMessagesSearch.fingerprint },
    audit,
  );
  await backfill(admin, build);
  const inspection = await admin.inspectBuild(build.buildId);
  if (!inspection.eligibleForCutover) {
    throw new Error(`cutover 차단: ${inspection.blockers.join(", ")}`);
  }
  await admin.cutover(build.buildId, audit);
  return build;
}

export async function rollbackBuild(admin: SearchAdmin, build: BuildHandle, audit: AdminContext) {
  return admin.rollback(build.buildId, audit);
}

/** Returns null once retired, or the earliest retry time in epoch milliseconds while the read grace period lasts. */
export async function retireWhenAllowed(
  admin: SearchAdmin,
  targetId: string,
  audit: AdminContext,
): Promise<number | null> {
  try {
    await admin.retireTarget(targetId, audit);
    return null;
  } catch (error) {
    if (error instanceof SearchAdminPreconditionFailed) {
      const pending = gracePendingSchema.safeParse(error.details);
      if (pending.success) return pending.data.earliestAtMs;
    }
    throw error;
  }
}

/** After restoring the source database: suspend capture first, then resume into a new build and cut over. */
export async function restoreFromSource(admin: SearchAdmin, audit: AdminContext): Promise<void> {
  await admin.suspendCapture(chatMessagesSearch.key, audit);
  const build = await admin.resumeCaptureForRebuild(chatMessagesSearch.key, audit);
  await backfill(admin, build);
  await admin.cutover(build.buildId, audit);
}

/** Use after unmarked changes (FK CASCADE, manual SQL); the ledger scan also reaches rows deleted from the source. */
export async function remarkLedgerRange(
  admin: SearchAdmin,
  range: { after?: string; through: string },
  audit: AdminContext,
): Promise<number> {
  let after = range.after;
  let marked = 0;
  for (;;) {
    const scope: DocumentScope = {
      logicalKey: chatMessagesSearch.key,
      scan: "ledger",
      through: range.through,
      limit: 1_000,
    };
    if (after !== undefined) scope.after = after;
    const report = await admin.remark(scope, audit);
    marked += report.marked;
    if (report.next === undefined) return marked;
    after = report.next;
  }
}

/** Fix the cause (mapping, source data) before releasing quarantined documents. */
export async function retryQuarantinedDocuments(
  admin: SearchAdmin,
  targetId: string,
  audit: AdminContext,
): Promise<number> {
  let released = 0;
  for (;;) {
    const report = await admin.retryQuarantined({ targetId, limit: 1_000 }, audit);
    released += report.released;
    if (report.released < 1_000) return released;
  }
}

/** Remove the pause cause first; revision_divergence resumes only after a verification scan with no violation. */
export async function verifyAndResumeTarget(
  admin: SearchAdmin,
  targetId: string,
  audit: AdminContext,
): Promise<readonly { id: string; indexed: number; ledger: number | null }[]> {
  const inspection = await admin.inspect(chatMessagesSearch.key);
  const target = inspection.targets.find((candidate) => candidate.targetId === targetId);
  if (target?.pauseReason?.class === "revision_divergence") {
    const violations: { id: string; indexed: number; ledger: number | null }[] = [];
    for (;;) {
      const progress = await admin.runTargetVerificationPage(targetId, { limit: 1_000 });
      violations.push(...progress.sample);
      if (progress.done) {
        if (progress.violations > 0) return violations;
        break;
      }
    }
  }
  await admin.resumeTarget(targetId, audit);
  return [];
}

/** Run on a copied database before any application process starts on it; restart processes that initialized earlier. */
export async function adoptCopiedDatabase(
  admin: SearchAdmin,
  audit: AdminContext,
): Promise<readonly { targetId: string; physicalIndex: string }[]> {
  const adopted = await admin.adoptCopiedStore({ confirmCopy: true }, audit);
  await restoreFromSource(admin, audit);
  return adopted.detachedTargets;
}

/** Never run on a copy: it would let the copy write and delete the original's indexes. */
export async function confirmSameStore(admin: SearchAdmin, audit: AdminContext): Promise<void> {
  const { binding } = await admin.inspect(chatMessagesSearch.key);
  if (binding.originMatches && binding.instanceMatches) return;
  await admin.confirmStoreOwnership({ confirmSoleOwner: true }, audit);
}

export async function lostFences(
  admin: SearchAdmin,
): Promise<
  readonly { targetId: string; class: string; localEpoch: number; remoteEpoch: number }[]
> {
  const inspection = await admin.inspect(chatMessagesSearch.key);
  return inspection.targets.flatMap((target) =>
    target.fence.lost
      ? [
          {
            targetId: target.targetId,
            class: target.fence.lostDetail?.class ?? "foreign",
            localEpoch: target.fence.lostDetail?.localEpoch ?? 0,
            remoteEpoch: target.fence.lostDetail?.remoteEpoch ?? 0,
          },
        ]
      : [],
  );
}

/** Stop every process of the other database and adopt it there first, or the two keep taking the fence from each other. */
export async function reclaimLostFences(
  admin: SearchAdmin,
  audit: AdminContext,
): Promise<readonly { targetId: string; epoch: number }[]> {
  if ((await lostFences(admin)).length === 0) return [];
  const confirmed = await admin.confirmStoreOwnership({ confirmSoleOwner: true }, audit);
  return confirmed.fencedTargets;
}

/** Review the plan before executing it; an ambiguous create blocks its target id until reconcileCreate. */
export async function createFirstTarget(
  admin: SearchAdmin,
  audit: AdminContext,
): Promise<TargetHandle | { ambiguous: CreatePlan }> {
  // Required when the handle holds two definitions for the key, as during a rebuild.
  const plan = await admin.planCreate(chatMessagesSearch.key, {
    fingerprint: chatMessagesSearch.fingerprint,
  });
  if (plan.missingPlugins.length > 0 || plan.warnings.length > 0) {
    throw new Error(
      `생성 계획을 확인하세요: ${[...plan.missingPlugins, ...plan.warnings].join(", ")}`,
    );
  }
  try {
    return await admin.executeCreate(plan, audit);
  } catch (error) {
    if (error instanceof SearchAdminPreconditionFailed) {
      if (ambiguousCreateSchema.safeParse(error.details).success) return { ambiguous: plan };
    }
    throw error;
  }
}

/** Stop every process creating with this plan before passing confirmQuiescent; an abandoned target id is never reused. */
export async function reconcileAmbiguousCreate(
  admin: SearchAdmin,
  plan: CreatePlan,
  audit: AdminContext,
): Promise<TargetHandle> {
  const reconciled = await admin.reconcileCreate(plan.targetId, { confirmQuiescent: true }, audit);
  if (reconciled.remoteCreateState === "verified") return admin.executeCreate(plan, audit);
  const fresh = await createFirstTarget(admin, audit);
  if ("ambiguous" in fresh)
    throw new Error(`새 생성도 결과를 모릅니다: ${fresh.ambiguous.targetId}`);
  return fresh;
}

/** The package never recreates a write alias; the operator restores it with their own OpenSearch tooling, then resumes. */
export async function restoreWriteAliasAndResume(
  admin: SearchAdmin,
  operatorClient: Client,
  targetId: string,
  audit: AdminContext,
): Promise<TargetHandle> {
  const inspection = await admin.inspect(chatMessagesSearch.key);
  const target = inspection.targets.find((candidate) => candidate.targetId === targetId);
  if (target?.state !== "paused" || target.pauseReason?.class !== "write_alias_missing") {
    throw new Error(`write_alias_missing으로 정지된 대상이 아닙니다: ${targetId}`);
  }
  // Operator step outside the package: point the write alias at this target's physical index.
  await operatorClient.indices.updateAliases({
    body: {
      actions: [
        { add: { index: target.physicalIndex, alias: target.writeAlias, is_write_index: true } },
      ],
    },
  });
  return admin.resumeTarget(targetId, audit);
}

/** Safe to poll: each count reads at most countLimit rows, and a count with exact false is a lower bound. */
export async function backlogByTarget(admin: SearchAdmin): Promise<Map<string, TargetLag>> {
  const inspection = await admin.inspect(chatMessagesSearch.key, { countLimit: 10_000 });
  const report = new Map<string, TargetLag>();
  for (const target of inspection.targets) {
    if (target.backlog !== null) report.set(target.targetId, target.backlog);
  }
  return report;
}

/** Costs time proportional to the backlog: never call it on a monitoring interval. */
export async function exactBacklogByTarget(
  admin: Pick<SearchAdmin, "inspect">,
): Promise<Map<string, TargetLag>> {
  const inspection = await admin.inspect(chatMessagesSearch.key, { counts: "exact" });
  const report = new Map<string, TargetLag>();
  for (const target of inspection.targets) {
    if (target.backlog !== null) report.set(target.targetId, target.backlog);
  }
  return report;
}

/** Raise the recorded maximum before giving query handles a longer cursor lifetime; lowering it is refused. */
export async function raiseCursorLifetime(
  admin: SearchAdmin,
  maxCursorLifetimeMs: number,
  audit: AdminContext,
): Promise<ReadLifetimeChange> {
  const recorded = (await admin.inspect(chatMessagesSearch.key)).lifetimes;
  if (recorded === null) throw new Error("이 key에는 아직 대상이 없습니다.");
  const next: ReadLifetimes = { ...recorded, maxCursorLifetimeMs };
  return admin.changeReadLifetimes(chatMessagesSearch.key, next, audit);
}
