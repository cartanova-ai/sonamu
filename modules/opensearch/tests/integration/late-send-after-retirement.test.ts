import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createSearchClient, getSearchRequester } from "../../src/client/search-client";
import { buildSearchEnvelope } from "../../src/definition/envelope";
import { createDeliveryStore } from "../../src/postgres/delivery-store";
import { BULK_QUERYSTRING, bulkPath, packBulkRequests } from "../../src/worker/bulk";
import { bulkResponseSchema, INDEX_NOT_FOUND_TYPE } from "../../src/worker/classify";
import { useIntegrationHarness } from "../helpers/harness";
import { aliasExists, indexExists, listIndices } from "../helpers/opensearch-ops";
import { gate, type RecordedRequest } from "../helpers/request-recorder";
import { audit, KEY, useRetirementFixture } from "../helpers/retirement-fixture";
import { recordingClient, useWorkerFixture, waitFor } from "../helpers/worker-fixture";

/**
 * Retirement removes the write alias first and deletes the index only after the in-flight bound. A late bulk always
 * goes to the write alias with require_alias=true, so without the alias it gets item 404 and creates nothing. Any path
 * that recreated the alias would break this, hence the index and alias listings are compared around retirement.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const fixture = useRetirementFixture(h, kit);

const catAliasesSchema = z.array(z.looseObject({ alias: z.string(), index: z.string() }));
const countSchema = z.looseObject({ count: z.number() });

async function remoteObjects(): Promise<{ indices: string[]; aliases: string[] }> {
  const response = await h.opensearch.cat.aliases({ format: "json" });
  const aliases = catAliasesSchema
    .parse(response.body)
    .filter((row) => row.alias.startsWith(h.indexPrefix))
    .map((row) => `${row.alias}->${row.index}`)
    .toSorted();
  return { indices: await listIndices(h.opensearch, h.indexPrefix), aliases };
}

async function documentCount(physicalIndex: string): Promise<number> {
  await h.opensearch.indices.refresh({ index: physicalIndex });
  const response = await h.opensearch.count({ index: physicalIndex });
  return countSchema.parse(response.body).count;
}

const isMapping = (request: RecordedRequest) =>
  request.method === "GET" && request.path.endsWith("/_mapping");
const isAliasRemoval = (request: RecordedRequest) =>
  request.method === "DELETE" && request.path.includes("/_alias/");

/** Sends a request built by the package's own bulk builder to the write alias, exactly as the worker would. */
async function lateBulk(writeAlias: string, ids: readonly string[]) {
  const packed = packBulkRequests(
    ids.map((id) => ({
      documentId: id,
      envelope: buildSearchEnvelope({ state: "present", document: { body: `늦은 ${id}` } }, 99),
    })),
    { maxBulkBytes: 1_000_000, maxDocuments: 50 },
  );
  expect(packed.rejected).toEqual([]);
  expect(packed.requests).toHaveLength(1);
  const client = createSearchClient({
    createClient: () => kit.nativeClient(),
    ownsClient: false,
    requestTimeoutMs: 10_000,
  });
  try {
    const response = await getSearchRequester(client).send({
      method: "POST",
      path: bulkPath(writeAlias),
      ndjson: packed.requests[0].body,
      querystring: BULK_QUERYSTRING,
    });
    return { status: response.status, body: bulkResponseSchema.parse(response.body) };
  } finally {
    await client.close();
  }
}

function expectAllMissing(result: Awaited<ReturnType<typeof lateBulk>>, count: number): void {
  expect(result.status).toBe(200);
  expect(result.body.errors).toBe(true);
  expect(result.body.items).toHaveLength(count);
  for (const item of result.body.items) {
    expect(item.index.status).toBe(404);
    expect(item.index.error?.type).toBe(INDEX_NOT_FOUND_TYPE);
  }
}

describe("은퇴 뒤의 늦은 전송", () => {
  it("pause → retire 뒤 늦은 bulk는 require_alias로 거부되고 인덱스가 되살아나지 않는다", async () => {
    const mapping = gate();
    let armed = false;
    let aliasRemoved = false;
    const prepared = await fixture.prepare({
      shortGrace: true,
      hooks: {
        before: async (request) => {
          if (isAliasRemoval(request)) aliasRemoved = true;
          // Retirement also reads _meta before removing the alias, so stop at the check after the removal.
          if (armed && aliasRemoved && isMapping(request)) {
            armed = false;
            await mapping.wait();
          }
        },
      },
    });
    const first = prepared.first;
    await fixture.replaceFirst(prepared);
    // Index one real document so the document count can prove that nothing was written.
    expect(await fixture.mark(prepared.setup, ["a"])).toBe("recorded");
    await kit.indexer(prepared.setup).indexer.drainOnce();
    expect(await fixture.indexedIn(first.physicalIndex, "a")).toBe(true);
    // Retire from the state a worker leaves after pausing the target for a missing alias.
    const store = createDeliveryStore({ schema: h.searchSchema });
    expect(
      await store.pauseTarget(prepared.setup.worker, {
        targetId: first.targetId,
        reason: { class: "write_alias_missing" },
      }),
    ).toBe(true);
    await fixture.waitForGrace(first.targetId);
    const count = await documentCount(first.physicalIndex);
    const before = await remoteObjects();
    expect(before.aliases).toContain(`${first.writeAlias}->${first.physicalIndex}`);

    armed = true;
    const retiring = prepared.admin.retireTarget(first.targetId, {
      ...audit(),
      reason: "late send",
    });
    retiring.catch(() => {});
    await mapping.reached;
    expect(await fixture.target(first.targetId)).toMatchObject({
      state: "retiring",
      alias_removed: true,
      index_deleted: false,
    });
    const afterAlias = await remoteObjects();
    expect(afterAlias.indices).toEqual(before.indices);
    expect(afterAlias.aliases).toEqual(
      before.aliases.filter((alias) => !alias.startsWith(`${first.writeAlias}->`)),
    );
    expectAllMissing(await lateBulk(first.writeAlias, ["late-1", "a"]), 2);
    expect(await remoteObjects()).toEqual(afterAlias);
    expect(await documentCount(first.physicalIndex)).toBe(count);
    expect(await indexExists(h.opensearch, first.writeAlias)).toBe(false);

    mapping.open();
    await retiring;
    expect((await fixture.target(first.targetId)).state).toBe("retired");
    const afterIndex = await remoteObjects();
    expect(afterIndex.indices).toEqual(
      afterAlias.indices.filter((index) => index !== first.physicalIndex),
    );
    // Also after the index is gone: the engine does not create an index under the alias name.
    expectAllMissing(await lateBulk(first.writeAlias, ["late-2"]), 1);
    expect(await remoteObjects()).toEqual(afterIndex);
    expect(await indexExists(h.opensearch, first.physicalIndex)).toBe(false);
    expect(await aliasExists(h.opensearch, first.writeAlias)).toBe(false);
  });

  it("drain이 진행 중이던 워커가 alias 제거 뒤에 보낸 bulk는 아무것도 쓰지 않는다", async () => {
    const mapping = gate();
    let armed = false;
    let aliasRemoved = false;
    const prepared = await fixture.prepare({
      shortGrace: true,
      admin: { workerBounds: { leaseDurationMs: 2_000, requestTimeoutMs: 1_000 } },
      hooks: {
        before: async (request) => {
          if (isAliasRemoval(request)) aliasRemoved = true;
          // Retirement also reads _meta before removing the alias, so stop at the check after the removal.
          if (armed && aliasRemoved && isMapping(request)) {
            armed = false;
            await mapping.wait();
          }
        },
      },
    });
    const first = prepared.first;
    // Mark before the rebuild is registered so only the first target gets an intent.
    await fixture.serveOpenBuild(prepared.admin);
    expect(await fixture.mark(prepared.setup, ["a"])).toBe("recorded");
    const second = await prepared.admin.beginRebuild(
      { logicalKey: KEY, fingerprint: prepared.fingerprint },
      audit(),
    );
    await fixture.backfill(prepared.admin, second.buildId);
    await prepared.admin.cutover(second.buildId, audit());
    await fixture.waitForGrace(first.targetId);

    // The worker passes the pre-send eligibility check and stops right before sending the bulk.
    const send = gate();
    const recorder = recordingClient(kit.nativeClient(), { before: () => send.wait() });
    const { indexer } = kit.indexer(prepared.setup, {
      client: recorder.client,
      limits: {
        leaseDurationMs: 2_000,
        heartbeatIntervalMs: 100,
        projectionTimeoutMs: 1_500,
        requestTimeoutMs: 1_000,
      },
    });
    const draining = indexer.drainOnce();
    await send.reached;
    const count = await documentCount(first.physicalIndex);
    const before = await remoteObjects();

    armed = true;
    const retiring = prepared.admin.retireTarget(first.targetId, audit());
    retiring.catch(() => {});
    // Retirement removes the alias, waits out the worker's lease and the bound, then stops before deleting the index.
    await mapping.reached;
    expect(await fixture.target(first.targetId)).toMatchObject({
      alias_removed: true,
      index_deleted: false,
    });
    const afterAlias = await remoteObjects();
    expect(afterAlias.indices).toEqual(before.indices);

    send.open();
    const report = await draining;
    expect(recorder.bulks.map((bulk) => bulk.path)).toEqual([`/${first.writeAlias}/_bulk`]);
    expect(report).toMatchObject({ claimed: 1, indexed: 0 });
    expect(await documentCount(first.physicalIndex)).toBe(count);
    expect(await fixture.indexedIn(first.physicalIndex, "a")).toBe(false);
    expect(await remoteObjects()).toEqual(afterAlias);
    expect(await indexExists(h.opensearch, first.writeAlias)).toBe(false);
    // Pausing only changes active targets, so a retiring target stays retiring.
    expect((await fixture.target(first.targetId)).state).toBe("retiring");

    mapping.open();
    await retiring;
    await waitFor(
      "은퇴 완료",
      async () => (await fixture.target(first.targetId)).state === "retired",
    );
    expect(await fixture.residue(first.targetId)).toEqual({ intents: 0, runtimes: 0 });
    expect(await indexExists(h.opensearch, first.physicalIndex)).toBe(false);
    expect(await aliasExists(h.opensearch, first.writeAlias)).toBe(false);
  });
});
