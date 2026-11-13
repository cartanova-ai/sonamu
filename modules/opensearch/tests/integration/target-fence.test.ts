import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type IndexerEvent } from "../../src/postgres";
import { NOT_DELETED_FILTER } from "../../src/query/body-allowlist";
import { FENCE_DOCUMENT_ID } from "../../src/worker/fence";
import { useIntegrationHarness } from "../helpers/harness";
import { type RecordedRequest, requestRecorder } from "../helpers/request-recorder";
import { qualified, sql } from "../helpers/sql";
import {
  type RecordedStatement,
  useWorkerFixture,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Fence cost, counted in statements and requests rather than time: an idle drain adds no fence statement and no
 * request, a working drain only prefixes its document bulk with a fence item, the first send bootstraps with one
 * advance, and on renewal only one of several workers on the same database advances. Physical copies are covered by
 * target-fence-twin.test.ts.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

async function fenceRow(targetId: string) {
  const { rows } = await h.knex.raw<{
    rows: { epoch: number; pending: boolean; lost: boolean }[];
  }>(
    sql`SELECT epoch::int AS epoch, pending_nonce IS NOT NULL AS pending, lost_at IS NOT NULL AS lost
FROM ${qualified(h.searchSchema, "target_fences")} WHERE target_id = ?`,
    [targetId],
  );
  return rows[0];
}

async function remoteFenceVersion(physicalIndex: string): Promise<number | undefined> {
  const response = await h.opensearch.mget({
    index: physicalIndex,
    body: { ids: [FENCE_DOCUMENT_ID] },
  });
  const doc = z
    .object({
      docs: z.array(z.looseObject({ found: z.boolean(), _version: z.number().optional() })),
    })
    .parse(response.body).docs[0];
  return doc?.found ? doc._version : undefined;
}

/** Statements touching target_fences, except the target listing that only joins it. */
function fenceStatements(statements: readonly RecordedStatement[]): string[] {
  return statements
    .map((statement) => statement.sql)
    .filter((text) => text.includes("target_fences") && !text.includes("LEFT JOIN"));
}

async function measure<T>(
  setup: WorkerSetup,
  requests: readonly RecordedRequest[],
  run: () => Promise<T>,
) {
  const statementsBefore = setup.statements.length;
  const requestsBefore = requests.length;
  const result = await run();
  const ran = setup.statements.slice(statementsBefore);
  return {
    result,
    statements: ran.length,
    fence: fenceStatements(ran).length,
    requests: requests.slice(requestsBefore),
  };
}

describe("대상 fence", () => {
  it("fence 없는 대상의 첫 전송은 전진 하나로 bootstrap하고, 그 뒤 빈 drain과 일하는 drain은 fence 비용을 더하지 않는다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    expect(await fenceRow(target.targetId)).toBeUndefined();
    const info = z
      .object({ version: z.looseObject({ number: z.string() }) })
      .parse((await h.opensearch.info()).body);
    process.stdout.write(`[engine] OpenSearch ${info.version.number}\n`);
    const recorder = requestRecorder(kit.nativeClient());
    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { client: recorder.client, events });
    const path = (request: { method: string; path: string }) => `${request.method} ${request.path}`;

    await kit.write(setup, KEY, ["a", "b"], async (trx) => {
      await kit.upsert(trx, KEY, "a", "본문 a");
      await kit.upsert(trx, KEY, "b", "본문 b");
    });
    const first = await measure(setup, recorder.requests, () => indexer.drainOnce());
    expect(first.result).toMatchObject({ indexed: 2 });
    process.stdout.write(
      `[fence-cost] first: statements=${first.statements} fence=${first.fence} requests=${first.requests.map(path).join(", ")}\n`,
    );
    // The process's first check (one _mget for all targets), the advance (a fence-only bulk), then one document bulk.
    expect(first.requests.map(path)).toEqual([
      "POST /_mget",
      `POST /${target.writeAlias}/_bulk`,
      `POST /${target.writeAlias}/_bulk`,
    ]);
    expect(first.fence).toBe(2);
    expect(await fenceRow(target.targetId)).toEqual({ epoch: 1, pending: false, lost: false });
    expect(await remoteFenceVersion(target.physicalIndex)).toBe(1);

    // An idle drain: no fence statement and no remote request.
    const idle = await measure(setup, recorder.requests, () => indexer.drainOnce());
    expect(idle.result).toMatchObject({ claimed: 0 });
    expect([idle.fence, idle.requests.length]).toEqual([0, 0]);
    process.stdout.write(`[fence-cost] idle: statements=${idle.statements}\n`);

    // A working drain: one document bulk prefixed with the fence item, no fence statement.
    await kit.write(setup, KEY, ["c"], async (trx) => kit.upsert(trx, KEY, "c", "본문 c"));
    const working = await measure(setup, recorder.requests, () => indexer.drainOnce());
    expect(working.result).toMatchObject({ indexed: 1 });
    expect([working.fence, working.requests.map(path)]).toEqual([
      0,
      [`POST /${target.writeAlias}/_bulk`],
    ]);
    expect(await remoteFenceVersion(target.physicalIndex)).toBe(1);
    expect(events.filter((event) => event.type === "target-fence-lost")).toEqual([]);

    // The fence document is marked deleted, so the search filter excludes it.
    await h.opensearch.indices.refresh({ index: target.physicalIndex });
    const searched = await h.opensearch.search({
      index: target.physicalIndex,
      body: { query: { bool: { filter: [NOT_DELETED_FILTER] } }, size: 10, _source: false },
    });
    const ids = z
      .object({ hits: z.object({ hits: z.array(z.looseObject({ _id: z.string() })) }) })
      .parse(searched.body)
      .hits.hits.map((hit) => hit._id)
      .toSorted();
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("갱신할 때가 되면 같은 데이터베이스의 워커 여럿 중 하나만 전진하고, 다른 워커는 상실로 보지 않는다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const recorder = requestRecorder(kit.nativeClient());
    const events: IndexerEvent[] = [];
    const workers = [0, 1, 2].map(
      () => kit.indexer(setup, { client: recorder.client, events }).indexer,
    );
    await kit.write(setup, KEY, ["a"], async (trx) => kit.upsert(trx, KEY, "a", "본문 a"));
    await workers[0]?.drainOnce();
    expect((await fenceRow(target.targetId))?.epoch).toBe(1);

    await h.knex.raw(
      sql`UPDATE ${qualified(h.searchSchema, "target_fences")} SET renewed_at = renewed_at - interval '1 hour'`,
    );
    const before = recorder.requests.length;
    await Promise.all(workers.map((worker) => worker.drainOnce()));
    const sent = recorder.requests.slice(before);
    process.stdout.write(
      `[fence-cost] renewal x3: requests=${sent.map((r) => `${r.method} ${r.path}`).join(", ")}\n`,
    );
    // Exactly one advance: the epoch rises by one with a single fence-only bulk.
    expect(await fenceRow(target.targetId)).toEqual({ epoch: 2, pending: false, lost: false });
    expect(await remoteFenceVersion(target.physicalIndex)).toBe(2);
    expect(sent.filter((request) => request.path.endsWith("/_bulk"))).toHaveLength(1);
    expect(events.filter((event) => event.type === "target-fence-lost")).toEqual([]);

    // The workers that lost the race read the new epoch and keep sending.
    await kit.write(setup, KEY, ["b"], async (trx) => kit.upsert(trx, KEY, "b", "본문 b"));
    for (const worker of workers) await worker.drainOnce();
    expect(await kit.intents()).toEqual([]);
    expect(events.filter((event) => event.type === "target-fence-lost")).toEqual([]);
  });

  it("인덱스가 같은 이름으로 다시 만들어지면 다음 전송의 fence 항목이 created(201)가 되어 regressed로 그 대상을 잃는다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events });
    await kit.write(setup, KEY, ["a"], async (trx) => kit.upsert(trx, KEY, "a", "본문 a"));
    expect((await indexer.drainOnce()).indexed).toBe(1);

    // Recreate an empty index with the same name and write alias, as a snapshot restore or a manual rebuild would.
    await h.opensearch.indices.delete({ index: target.physicalIndex });
    await h.opensearch.indices.create({
      index: target.physicalIndex,
      body: {
        settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
        aliases: { [target.writeAlias]: { is_write_index: true } },
      },
    });
    await kit.write(setup, KEY, ["b"], async (trx) => kit.upsert(trx, KEY, "b", "본문 b"));
    const report = await indexer.drainOnce();
    // The fence detects rather than gates: that request's documents were written and settle normally; nothing after.
    expect(report.retried).toBe(0);
    expect(events).toContainEqual({
      type: "target-fence-lost",
      targetId: target.targetId,
      class: "regressed",
      localEpoch: 1,
      remoteEpoch: 0,
    });
    expect(await fenceRow(target.targetId)).toMatchObject({ lost: true });
    expect(indexer).toBeDefined();
  });
});
