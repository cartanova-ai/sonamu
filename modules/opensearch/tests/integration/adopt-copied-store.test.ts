import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createAdminStore } from "../../src/admin/admin-lease";
import { AdminOperation, parseOperationRequest } from "../../src/admin/admin-lease";
import { indexMetaSchema } from "../../src/admin/remote-schemas";
import { readSearchIndexMeta } from "../../src/definition/envelope";
import {
  SearchAdminLeaseLost,
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchStoreMismatch,
} from "../../src/errors";
import { createPostgresSynchronization } from "../../src/postgres";
import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import {
  backfillAndCutover,
  copyByTemplate,
  type CopyStore,
  databaseUrl,
  expectWorkerRefused,
  markNote,
  NOTES_KEY,
  notesDefinition,
  openStore,
  prepareNotesSource,
  reserveDatabase,
  storeIdOf,
  targetRowsOf,
} from "../helpers/copied-database";
import { useIntegrationHarness } from "../helpers/harness";
import { aliasExists, indexExists } from "../helpers/opensearch-ops";
import { audit, rejectionOf } from "../helpers/read-path-fixture";

/**
 * Copies are made with CREATE DATABASE ... TEMPLATE on the same server and share the source's OpenSearch cluster.
 * Remote requests are recorded per store to prove that adoption sends none.
 */

const h = useIntegrationHarness({ sampleDomain: false });

const countSchema = z.object({ count: z.coerce.number() });

async function count(db: Knex, query: string): Promise<number> {
  const { rows } = await db.raw<{ rows: unknown[] }>(query);
  return countSchema.parse(rows[0]).count;
}

async function storeMetaOf(physicalIndex: string): Promise<string | undefined> {
  const mapping = await h.opensearch.indices.getMapping({ index: physicalIndex });
  return readSearchIndexMeta(indexMetaSchema.parse(mapping.body)[physicalIndex]?.mappings)
    ?.store_id;
}

async function indexDocuments(physicalIndex: string): Promise<[string, number][]> {
  await h.opensearch.indices.refresh({ index: physicalIndex });
  const response = await h.opensearch.search({
    index: physicalIndex,
    body: { query: { match_all: {} }, size: 100, version: true, sort: [{ _id: "asc" }] },
  });
  return z
    .object({
      hits: z.object({ hits: z.array(z.looseObject({ _id: z.string(), _version: z.number() })) }),
    })
    .parse(response.body)
    .hits.hits.filter((hit) => hit._id !== FENCE_DOCUMENT_ID)
    .map((hit): [string, number] => [hit._id, hit._version]);
}

/** Drops the result so rejections of operations with different return types fit one list. */
function settle(pending: Promise<object | void>): Promise<void> {
  return pending.then(() => undefined);
}

/** A source with a serving target and an open rebuild, and its TEMPLATE copy. */
async function sourceAndCopy(label: string) {
  const source = await prepareNotesSource(h, `${label}src`, () => audit("source"));
  const prepared = openStore(h, databaseUrl(h, source.name), source.docs);
  const rebuild = await prepared.admin.beginRebuild(
    { logicalKey: NOTES_KEY, fingerprint: notesDefinition().fingerprint },
    audit("source"),
  );
  await prepared.close();
  const copy = reserveDatabase(h, `${label}copy`);
  await copyByTemplate(h, source.name, copy);
  const original = openStore(h, databaseUrl(h, source.name), source.docs);
  const replica = openStore(h, databaseUrl(h, copy), new Map(source.docs));
  return { source, rebuild, copy, original, replica };
}

async function closeAll(...stores: CopyStore[]): Promise<void> {
  await Promise.allSettled(stores.map((store) => store.close()));
}

describe("adoptCopiedStore", () => {
  it("채택은 원격 명령 없이 store_id를 바꾸고 원점을 다시 기록하며, 캡처를 중단하고 물려받은 대상을 떼어 낸다. 원본은 그대로다", async () => {
    const { source, rebuild, original, replica } = await sourceAndCopy("ad1");
    try {
      const oldStoreId = await storeIdOf(replica.knex);
      const sourceTargetsBefore = await targetRowsOf(original.knex);
      const servedDocsBefore = await indexDocuments(source.served.physicalIndex);
      // Before adoption, capture on the copy is not blocked but its worker sends nothing.
      await replica.sync.initialize();
      expect(await markNote(replica, "a", "복사본 a")).toBe("recorded");
      expect(
        await count(replica.knex, "SELECT count(*) FROM sonamu_search.deliveries"),
      ).toBeGreaterThan(0);
      await expectWorkerRefused(replica, "store-origin-changed");
      await replica.knex.raw(
        // The source worker may already have copied a fence row; either way leave one at epoch 3.
        "INSERT INTO sonamu_search.target_fences (target_id, epoch) VALUES (?, 3) ON CONFLICT (target_id) DO UPDATE SET epoch = 3, nonce = NULL",
        [source.served.targetId],
      );
      await replica.knex.raw(
        "INSERT INTO sonamu_search.worker_heartbeats (worker_id, namespace, capabilities, state, started_at) VALUES (?, ?, '{}', 'running', clock_timestamp())",
        [randomUUID(), h.namespace],
      );
      const epochBefore = await count(
        replica.knex,
        "SELECT capture_epoch AS count FROM sonamu_search.indexes",
      );

      replica.requests.splice(0);
      const adopted = await replica.admin.adoptCopiedStore(
        { confirmCopy: true },
        { operationId: "adopt-1", actor: "tester", reason: "staging 복사본" },
      );
      expect(replica.requests).toEqual([]);
      expect(adopted.storeId).not.toBe(oldStoreId);
      expect(adopted.detachedTargets.map((target) => target.targetId).toSorted()).toEqual(
        [source.served.targetId, rebuild.target.targetId].toSorted(),
      );
      expect(await storeIdOf(replica.knex)).toBe(adopted.storeId);
      expect((await replica.admin.inspect(NOTES_KEY)).binding).toEqual({
        storeId: adopted.storeId,
        originRecorded: true,
        originMatches: true,
        instanceMatches: true,
      });

      const { rows: indexes } = await replica.knex.raw<{ rows: unknown[] }>(
        "SELECT store_id::text, capture_mode, capture_epoch FROM sonamu_search.indexes",
      );
      expect(indexes).toEqual([
        { store_id: adopted.storeId, capture_mode: "suspended", capture_epoch: epochBefore + 1 },
      ]);
      const { rows: heads } = await replica.knex.raw<{ rows: unknown[] }>(
        "SELECT target_id, rebuild_required FROM sonamu_search.read_heads",
      );
      expect(heads).toEqual([{ target_id: null, rebuild_required: true }]);
      expect(
        (await targetRowsOf(replica.knex)).map((row) => [row.state, row.write_enabled]),
      ).toEqual([
        ["detached", false],
        ["detached", false],
      ]);
      expect(
        await count(
          replica.knex,
          "SELECT count(*) FROM sonamu_search.targets WHERE detached_at IS NULL",
        ),
      ).toBe(0);
      const { rows: builds } = await replica.knex.raw<{ rows: unknown[] }>(
        "SELECT build_id::text, phase, failure->>'code' AS code FROM sonamu_search.builds WHERE build_id = ?",
        [rebuild.buildId],
      );
      expect(builds).toEqual([
        { build_id: rebuild.buildId, phase: "failed", code: "store_adopted" },
      ]);
      for (const table of [
        "deliveries",
        "delivery_runtime",
        "target_fences",
        "worker_heartbeats",
      ]) {
        expect([
          table,
          await count(replica.knex, `SELECT count(*) FROM sonamu_search.${table}`),
        ]).toEqual([table, 0]);
      }
      const { rows: audits } = await replica.knex.raw<{
        rows: unknown[];
      }>(
        "SELECT definition, kind, outcome, detail FROM sonamu_search.admin_operations WHERE operation_id = 'adopt-1'",
      );
      expect(audits).toEqual([
        expect.objectContaining({
          definition: NOTES_KEY,
          kind: "adopt-copied-store",
          outcome: "succeeded",
          detail: expect.objectContaining({
            oldStoreId,
            newStoreId: adopted.storeId,
            detachedTargets: 2,
            detachedTargetIds: expect.arrayContaining([source.served.targetId]),
          }),
        }),
      ]);
      expect(
        await count(
          replica.knex,
          "SELECT count(*) FROM sonamu_search.admin_controls WHERE lease_token IS NOT NULL",
        ),
      ).toBe(0);

      // Retire and retry refuse with target-detached; resume, verify and reconcile refuse through their existing
      // state checks. None of them sends a remote request.
      replica.requests.splice(0);
      const detached = source.served.targetId;
      const reasons: [string, string][] = [];
      for (const [name, run] of [
        ["retireTarget", () => settle(replica.admin.retireTarget(detached, audit("copy")))],
        ["resumeTarget", () => settle(replica.admin.resumeTarget(detached, audit("copy")))],
        [
          "runTargetVerificationPage",
          () => settle(replica.admin.runTargetVerificationPage(detached, { limit: 10 })),
        ],
        [
          "retryQuarantined",
          () =>
            settle(
              replica.admin.retryQuarantined({ targetId: detached, limit: 10 }, audit("copy")),
            ),
        ],
        [
          "reconcileCreate",
          () =>
            settle(
              replica.admin.reconcileCreate(detached, { confirmQuiescent: true }, audit("copy")),
            ),
        ],
      ] as const) {
        const error = await rejectionOf(run());
        expect([name, error.code, error.details?.reason]).toEqual([
          name,
          "SEARCH_ADMIN_PRECONDITION_FAILED",
          expect.any(String),
        ]);
        reasons.push([name, String(error.details?.reason)]);
      }
      expect(reasons).toEqual([
        ["retireTarget", "target-detached"],
        ["resumeTarget", "target-not-paused"],
        ["runTargetVerificationPage", "target-not-paused"],
        ["retryQuarantined", "target-detached"],
        ["reconcileCreate", "remote-create-not-unresolved"],
      ]);
      expect(replica.requests).toEqual([]);

      replica.requests.splice(0);
      replica.events.splice(0);
      await replica.indexer.drainOnce();
      expect(replica.events).toEqual([
        expect.objectContaining({ type: "drain", outcome: "no-targets" }),
      ]);
      expect(replica.requests).toEqual([]);

      // A marker initialized before adoption stays pinned to the old store_id until restart; calling initialize()
      // again does not re-read it. A freshly initialized marker returns "suspended".
      expect(await replica.sync.initialize()).not.toEqual({ storeId: adopted.storeId });
      for (const attempt of ["고정된 마커 1", "고정된 마커 2"]) {
        const pinned = await rejectionOf(markNote(replica, "a", attempt));
        expect(pinned).toBeInstanceOf(SearchStoreMismatch);
        expect([pinned.code, pinned.retryable, pinned.details?.reason]).toEqual([
          "SEARCH_STORE_MISMATCH",
          false,
          "store-mismatch",
        ]);
        expect(pinned.details?.actual).toBe(adopted.storeId);
      }
      const fresh = createPostgresSynchronization({
        getPrimaryDatabase: () => replica.knex,
        namespace: h.namespace,
      });
      expect(await fresh.initialize()).toEqual({ storeId: adopted.storeId });
      expect(
        await replica.knex.transaction((trx) => fresh.markChanged(trx, NOTES_KEY, ["a"])),
      ).toBe("suspended");

      const own = await replica.admin.resumeCaptureForRebuild(NOTES_KEY, audit("copy"));
      expect(await storeMetaOf(own.target.physicalIndex)).toBe(adopted.storeId);
      await backfillAndCutover(h, replica, own.buildId, audit("copy"));
      expect((await indexDocuments(own.target.physicalIndex)).map(([id]) => id)).toEqual([
        "a",
        "b",
      ]);
      expect(
        replica.requests
          .filter((request) => request.path.includes("_bulk"))
          .every((request) => !request.path.includes(source.served.physicalIndex)),
      ).toBe(true);

      expect(await targetRowsOf(original.knex)).toEqual(sourceTargetsBefore);
      expect(await storeIdOf(original.knex)).toBe(oldStoreId);
      for (const target of [source.served, rebuild.target]) {
        expect(await aliasExists(h.opensearch, target.writeAlias)).toBe(true);
        expect(await indexExists(h.opensearch, target.physicalIndex)).toBe(true);
        expect(await storeMetaOf(target.physicalIndex)).toBe(oldStoreId);
      }
      expect(await indexDocuments(source.served.physicalIndex)).toEqual(servedDocsBefore);
      expect((await original.admin.inspect(NOTES_KEY)).binding.originMatches).toBe(true);
    } finally {
      await closeAll(replica, original);
    }
  });

  it("같은 operation_id로 다시 부르면 아무것도 바꾸지 않고 같은 결과를 돌려주며, confirmCopy 없이는 아무것도 바꾸지 않는다", async () => {
    const { original, replica } = await sourceAndCopy("ad2");
    try {
      const before = await storeIdOf(replica.knex);
      const unconfirmed = await rejectionOf(
        // @ts-expect-error confirmCopy must be true.
        replica.admin.adoptCopiedStore({ confirmCopy: false }, audit("copy")),
      );
      expect(unconfirmed).toBeInstanceOf(SearchAdminPreconditionFailed);
      expect(unconfirmed.details?.reason).toBe("copy-not-confirmed");
      expect(await storeIdOf(replica.knex)).toBe(before);

      const context = { operationId: "adopt-replay", actor: "tester", reason: "재시도" };
      const first = await replica.admin.adoptCopiedStore({ confirmCopy: true }, context);
      const replayed = await replica.admin.adoptCopiedStore({ confirmCopy: true }, context);
      expect(replayed).toEqual(first);
      expect(await storeIdOf(replica.knex)).toBe(first.storeId);
      expect(
        await count(
          replica.knex,
          "SELECT count(*) FROM sonamu_search.admin_operations WHERE operation_id = 'adopt-replay'",
        ),
      ).toBe(1);
      const again = await replica.admin.adoptCopiedStore({ confirmCopy: true }, audit("copy"));
      expect(again.storeId).not.toBe(first.storeId);
      expect(replica.requests).toEqual([]);
    } finally {
      await closeAll(replica, original);
    }
  });

  it("채택은 진행 중인 관리 작업의 임대를 빼앗고, 그 작업의 다음 fenced 기록은 아무것도 커밋하지 않는다", async () => {
    const { original, replica } = await sourceAndCopy("ad3");
    try {
      const store = createAdminStore({
        getPrimaryDatabase: () => replica.knex,
        schema: "sonamu_search",
        namespace: h.namespace,
        timeouts: {
          lockTimeoutMs: 10_000,
          statementTimeoutMs: 20_000,
          idleInTransactionTimeoutMs: 60_000,
          adminLeaseMs: 120_000,
        },
      });
      const operation = new AdminOperation(
        store,
        parseOperationRequest({ logicalKey: NOTES_KEY, kind: "suspend", ...audit("in-flight") }),
      );
      await operation.acquire();
      await replica.admin.adoptCopiedStore({ confirmCopy: true }, audit("copy"));
      const lost = await rejectionOf(
        operation.fenced("exclusive", async (trx) => {
          await trx.raw("UPDATE sonamu_search.indexes SET capture_mode = 'active'");
        }),
      );
      expect(lost).toBeInstanceOf(SearchAdminLeaseLost);
      expect(
        await count(
          replica.knex,
          "SELECT count(*) FROM sonamu_search.indexes WHERE capture_mode = 'active'",
        ),
      ).toBe(0);
    } finally {
      await closeAll(replica, original);
    }
  });

  it("instanceName은 인수와 설정이 다르면 거부되고, 같거나 한쪽만 있으면 그 값을 기록한다", async () => {
    const { source, original, replica, copy } = await sourceAndCopy("ad4");
    const named = openStore(h, databaseUrl(h, copy), new Map(source.docs), {
      instanceName: "staging",
    });
    try {
      const conflict = await rejectionOf(
        named.admin.adoptCopiedStore({ confirmCopy: true, instanceName: "prod" }, audit("copy")),
      );
      expect(conflict).toBeInstanceOf(SearchConfigurationError);
      expect(conflict.details?.reason).toBe("instance-name-conflict");
      await named.admin.adoptCopiedStore({ confirmCopy: true }, audit("copy"));
      const { rows } = await named.knex.raw<{ rows: unknown[] }>(
        "SELECT instance_name FROM sonamu_search.store",
      );
      expect(rows).toEqual([{ instance_name: "staging" }]);
      expect((await named.admin.inspect(NOTES_KEY)).binding.instanceMatches).toBe(true);
      // A handle without instanceName does not compare against the recorded name.
      expect((await replica.admin.inspect(NOTES_KEY)).binding.instanceMatches).toBe(true);
    } finally {
      await closeAll(named, replica, original);
    }
  });
});

describe("confirmStoreOwnership", () => {
  it("원점과 instanceName만 다시 기록하고 store_id와 대상은 그대로 두며, 같은 입력으로 다시 불러도 결과가 같다", async () => {
    const { source, original, replica } = await sourceAndCopy("cf1");
    try {
      const storeId = await storeIdOf(replica.knex);
      const targetsBefore = await targetRowsOf(replica.knex);
      const unconfirmed = await rejectionOf(
        // @ts-expect-error confirmSoleOwner must be true.
        replica.admin.confirmStoreOwnership({ confirmSoleOwner: false }, audit("confirm")),
      );
      expect(unconfirmed).toBeInstanceOf(SearchAdminPreconditionFailed);
      expect(unconfirmed.details?.reason).toBe("ownership-not-confirmed");
      expect((await replica.admin.inspect(NOTES_KEY)).binding.originMatches).toBe(false);

      const context = { operationId: "confirm-1", actor: "tester", reason: "제자리 복원" };
      const first = await replica.admin.confirmStoreOwnership(
        { confirmSoleOwner: true, instanceName: "prod" },
        context,
      );
      // Every target that has a remote index has its fence taken over at a new epoch.
      const fenceable = targetsBefore
        .filter((row) => ["creating", "active", "paused", "retiring"].includes(row.state))
        .map((row) => row.target_id)
        .toSorted();
      expect(first.storeId).toBe(storeId);
      expect(first.fencedTargets.map((fenced) => fenced.targetId).toSorted()).toEqual(fenceable);
      const again = await replica.admin.confirmStoreOwnership(
        { confirmSoleOwner: true, instanceName: "prod" },
        context,
      );
      // A repeat records the same origin and moves each fence one epoch further.
      expect(again.storeId).toBe(storeId);
      expect(again.fencedTargets).toEqual(
        first.fencedTargets.map((fenced) => ({ ...fenced, epoch: fenced.epoch + 1 })),
      );
      expect(await targetRowsOf(replica.knex)).toEqual(targetsBefore);
      expect((await replica.admin.inspect(NOTES_KEY)).binding).toEqual({
        storeId,
        originRecorded: true,
        originMatches: true,
        instanceMatches: true,
      });
      const { rows } = await replica.knex.raw<{ rows: unknown[] }>(
        "SELECT kind, outcome FROM sonamu_search.admin_operations WHERE operation_id = 'confirm-1'",
      );
      expect(rows).toEqual([
        { kind: "confirm-store-ownership", outcome: "succeeded" },
        { kind: "confirm-store-ownership", outcome: "succeeded" },
      ]);
      // The only remote requests are the fence takeover: one _mget per call and one single-item bulk per target.
      expect(replica.requests.map((request) => `${request.method} ${request.path}`)).toEqual(
        [0, 1].flatMap(() => [
          "POST /_mget",
          ...first.fencedTargets.map((fenced) => {
            const row = targetsBefore.find((target) => target.target_id === fenced.targetId);
            return `POST /${encodeURIComponent(row?.write_alias ?? "")}/_bulk`;
          }),
        ]),
      );
      expect(
        await count(
          replica.knex,
          "SELECT count(*) FROM sonamu_search.admin_controls WHERE lease_token IS NOT NULL",
        ),
      ).toBe(0);
      expect(source.served.targetId).toBe(targetsBefore[0]?.target_id);
    } finally {
      await closeAll(replica, original);
    }
  });
});
