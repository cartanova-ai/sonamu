import { Client } from "@opensearch-project/opensearch";
import { describe, expect, it, onTestFinished } from "vitest";

import { type IndexerEvent } from "../../src/postgres";
import { WORKER_HEARTBEAT_EXPIRY_MS } from "../../src/postgres/worker-heartbeat";
import { inspectIndex } from "../helpers/delivery-fixture";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import { closedPortUrl } from "../helpers/tcp-proxy";
import { useWorkerFixture, waitFor, type WorkerSetup } from "../helpers/worker-fixture";

/**
 * Every drain attempt emits one drain event with its outcome. A caller using only drainOnce keeps its capability row
 * for the duration of the call; expired rows (24 h) are hidden from inspection and purged by any live worker. A claim
 * shortened by locked candidates does not make the loop sleep.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

function fingerprintOf(setup: WorkerSetup): string {
  const definition = setup.definitions.get(KEY);
  if (definition === undefined) throw new Error("정의가 없습니다.");
  return definition.fingerprint;
}

async function writeNotes(setup: WorkerSetup, ids: readonly string[]): Promise<void> {
  // One commit per id keeps enqueued_at in id order.
  for (const id of ids) {
    await kit.write(setup, KEY, [id], async (trx) => kit.upsert(trx, KEY, id, `note ${id}`));
  }
}

async function heartbeatRows(): Promise<{ worker_id: string; age_h: number }[]> {
  const { rows } = await h.knex.raw<{ rows: { worker_id: string; age_h: number }[] }>(
    sql`SELECT worker_id::text, floor(extract(epoch FROM clock_timestamp() - heartbeat_at) / 3600)::integer AS age_h
FROM ${qualified(h.searchSchema, "worker_heartbeats")} ORDER BY age_h, worker_id`,
  );
  return rows;
}

/** Connection refused: a request-level infrastructure failure, hence a client cooldown. */
async function refusingClient(): Promise<Client> {
  const client = new Client({ node: await closedPortUrl(), maxRetries: 0 });
  onTestFinished(() => client.close());
  return client;
}

const drains = (events: readonly IndexerEvent[]) =>
  events.flatMap((event) =>
    event.type === "drain" ? [{ outcome: event.outcome, claimed: event.report.claimed }] : [],
  );
describe("drain 이벤트", () => {
  it("drain 시도마다 outcome이 있는 drain 이벤트가 하나씩 나온다: processed, empty, no-targets, cooldown", async () => {
    const setup = await kit.setUp({ keys: [KEY] });
    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events });
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0, cooldownRemainingMs: 0 });
    await writeNotes(setup, ["a"]);
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
    expect(drains(events)).toEqual([
      { outcome: "empty", claimed: 0 },
      { outcome: "processed", claimed: 1 },
    ]);

    // A worker that knows no registered fingerprint has no target to claim.
    const unknown: IndexerEvent[] = [];
    const stranger = kit.indexer({ ...setup, definitions: new Map() }, { events: unknown }).indexer;
    expect(await stranger.drainOnce()).toMatchObject({
      claimed: 0,
      unsupportedTargets: [targetOf(setup).targetId],
    });
    expect(drains(unknown)).toEqual([{ outcome: "no-targets", claimed: 0 }]);

    // An unreachable engine releases and enters client cooldown; the next drainOnce reads nothing and ends as cooldown.
    const cooling: IndexerEvent[] = [];
    const failing = kit.indexer(setup, {
      client: await refusingClient(),
      events: cooling,
      limits: { retryBaseDelayMs: 60_000, retryMaxDelayMs: 60_000 },
    }).indexer;
    await writeNotes(setup, ["b"]);
    expect(await failing.drainOnce()).toMatchObject({ claimed: 1, released: 1 });
    const skipped = await failing.drainOnce();
    expect(skipped.claimed).toBe(0);
    expect(skipped.cooldownRemainingMs).toBeGreaterThan(0);
    expect(cooling).toEqual([
      expect.objectContaining({ type: "drain", outcome: "processed" }),
      { type: "drain", outcome: "cooldown", report: skipped },
    ]);
  });
});

describe("능력 heartbeat 행의 수명", () => {
  it("drainOnce만 부르는 호출자의 행은 그 호출 동안만 있고, 여러 번 불러도 끝나면 남지 않는다", async () => {
    const during: number[] = [];
    const setup = await kit.setUp({
      keys: [KEY],
      hooks: {
        [KEY]: {
          beforeRead: async () => {
            during.push((await heartbeatRows()).length);
          },
        },
      },
    });
    const { indexer } = kit.indexer(setup);
    for (const id of ["a", "b", "c"]) {
      await writeNotes(setup, [id]);
      expect(await indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
      expect(await heartbeatRows()).toEqual([]);
    }
    expect(await indexer.drainOnce()).toMatchObject({ claimed: 0 });
    expect(await heartbeatRows()).toEqual([]);
    expect(during).toEqual([1, 1, 1]);
  });

  it("start()로 도는 워커의 행은 drain 사이에도 남고, 그 사이 같은 indexer의 drainOnce도 지우지 않으며, stop이 지운다", async () => {
    const setup = await kit.setUp({ keys: [KEY] });
    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events });
    const handle = indexer.start({ pollIntervalMs: 60_000 });
    await waitFor("첫 drain", () => drains(events).length >= 1);
    expect(await heartbeatRows()).toHaveLength(1);
    await indexer.drainOnce();
    expect(await heartbeatRows()).toHaveLength(1);
    await handle.stop({ deadlineMs: 1_000 });
    expect(await heartbeatRows()).toEqual([]);
  });

  it("만료(24시간)된 행은 점검에 나오지 않고, 살아 있는 워커의 heartbeat가 스키마 전체에서 지운다. 만료 전의 행은 나이와 함께 남는다", async () => {
    expect(WORKER_HEARTBEAT_EXPIRY_MS).toBe(24 * 3_600_000);
    const setup = await kit.setUp({ keys: [KEY] });
    const capability = `${KEY}@${fingerprintOf(setup)}`;
    const insert = (namespace: string, ageHours: number) =>
      h.knex.raw(
        sql`INSERT INTO ${qualified(h.searchSchema, "worker_heartbeats")} (worker_id, namespace, capabilities, state, started_at, heartbeat_at)
VALUES (gen_random_uuid(), ?, ARRAY[?], 'running', clock_timestamp() - (? * interval '1 hour'), clock_timestamp() - (? * interval '1 hour'))`,
        [namespace, capability, ageHours, ageHours],
      );
    // Rows left by dead processes: 23 h (live) and 25 h (expired) here, 25 h in another namespace.
    await insert(h.namespace, 23);
    await insert(h.namespace, 25);
    await insert("other-namespace", 25);

    const before = await inspectIndex(h, KEY);
    expect(before.workers).toHaveLength(1);
    expect(before.workers[0].heartbeatAgeMs).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(before.workers[0].heartbeatAgeMs).toBeLessThan(WORKER_HEARTBEAT_EXPIRY_MS);

    const { indexer } = kit.indexer(setup);
    await indexer.drainOnce();
    // Both expired rows are purged, the live one stays, and this worker's own row left with its drainOnce.
    expect((await heartbeatRows()).map((row) => row.age_h)).toEqual([23]);
  });
});

describe("짧은 claim 뒤의 루프", () => {
  it("마커가 앞의 후보를 잡아 claim이 한도보다 짧아도 루프는 쉬지 않고 남은 backlog를 이어서 처리한다", async () => {
    const setup = await kit.setUp({ keys: [KEY] });
    const ids = Array.from({ length: 10 }, (_, index) => `d${String(index).padStart(2, "0")}`);
    await writeNotes(setup, ids);
    // An open transaction re-marks the first four, locking four of the six candidates for a limit of 3.
    const marker = await setup.capture.transaction();
    const locked = ids.slice(0, 4);
    for (const id of locked) await kit.upsert(marker, KEY, id, `edited ${id}`);
    expect(await setup.captureSync.markChanged(marker, KEY, locked)).toBe("recorded");

    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events, limits: { maxDocumentsPerClaim: 3 } });
    // Sleeping after a short claim would delay the next drain by 60 s, failing the wait below.
    const handle = indexer.start({ pollIntervalMs: 60_000 });
    try {
      await waitFor("잠기지 않은 여섯 문서 색인", async () => {
        const found = await Promise.all(ids.slice(4).map((id) => kit.indexed(targetOf(setup), id)));
        return found.every((document) => document !== null);
      });
      await waitFor("빈 drain", () => drains(events).some((drain) => drain.outcome === "empty"));
      expect(drains(events)).toEqual([
        { outcome: "processed", claimed: 2 },
        { outcome: "processed", claimed: 2 },
        { outcome: "processed", claimed: 2 },
        { outcome: "empty", claimed: 0 },
      ]);
      for (const id of locked) expect(await kit.indexed(targetOf(setup), id)).toBeNull();
    } finally {
      await marker.commit();
      await handle.stop({ deadlineMs: 1_000 });
    }
    // The locked four were only skipped for now: the next drain indexes their new revision.
    const { indexer: next } = kit.indexer(setup);
    expect(await next.drainOnce()).toMatchObject({ claimed: 4, indexed: 4 });
    for (const id of locked) {
      expect(await kit.indexed(targetOf(setup), id)).toMatchObject({ revision: 2 });
    }
  });
});
