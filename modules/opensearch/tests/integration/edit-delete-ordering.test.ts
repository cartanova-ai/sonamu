import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { type DrainReport, type SearchIndexer } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import {
  type BulkRecord,
  latch,
  outcomeSum,
  recordingClient,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * However an edit or delete interleaves with claim, snapshot, send and acknowledgement, the newest state ends up
 * indexed; a delayed older request cannot overwrite a newer body or tombstone.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";
const ID = "n1";

type Point = "claim 뒤 스냅샷 전" | "전송 뒤 확인 전";
const POINTS: readonly Point[] = ["claim 뒤 스냅샷 전", "전송 뒤 확인 전"];
type Change = "수정" | "삭제";

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

async function drainAll(indexer: SearchIndexer): Promise<DrainReport[]> {
  const reports: DrainReport[] = [];
  await waitFor("모든 intent 처리", async () => {
    const report = await indexer.drainOnce();
    reports.push(report);
    expect(outcomeSum(report)).toBe(report.claimed);
    return (await kit.intents()).length === 0;
  });
  return reports;
}

/**
 * Runs `run` once before the first transaction() call. The claim is a single statement outside transaction(), so
 * the first call opens the first snapshot.
 */
function beforeFirstSnapshot(db: Knex, run: () => Promise<void>): Knex {
  let done = false;
  const transaction = async (...args: Parameters<Knex["transaction"]>) => {
    if (!done) {
      done = true;
      await run();
    }
    return db.transaction(...args);
  };
  return new Proxy(db, {
    get(target, property) {
      if (property === "transaction") return transaction;
      // SAFETY: the get trap only receives real property names of the Knex instance and reads them from it unchanged.
      return target[property as keyof Knex];
    },
  });
}

function change(setup: WorkerSetup, kind: Change, body = "본문 2") {
  return kit.write(setup, KEY, [ID], (trx) =>
    kind === "수정" ? kit.upsert(trx, KEY, ID, body) : kit.remove(trx, KEY, ID),
  );
}

async function expectNewest(setup: WorkerSetup, kind: Change, revision: number): Promise<void> {
  expect(await kit.ledger(KEY)).toEqual({ [ID]: revision });
  expect(await kit.indexed(targetOf(setup), ID)).toEqual(
    kind === "수정"
      ? { version: revision, revision, deleted: false, doc: { body: `본문 ${revision}` } }
      : { version: revision, revision, deleted: true, doc: undefined },
  );
  expect(await kit.intents()).toEqual([]);
  expect(await kit.runtimes()).toEqual([]);
}

describe("수정/삭제 순서", () => {
  for (const point of POINTS) {
    const kind: Change = "수정";
    it(`${kind}가 ${point}에 커밋돼도 최신 상태가 색인된다`, async () => {
      let applied = false;
      let current: WorkerSetup | undefined;
      const apply = async () => {
        if (current === undefined || applied) return;
        applied = true;
        await change(current, kind);
      };
      const setup = await kit.setUp();
      current = setup;
      await kit.write(setup, KEY, [ID], (trx) => kit.upsert(trx, KEY, ID, "본문 1"));
      // Must keep returning the same Knex so materialize's per-primary response evidence carries over.
      const snapshotGate =
        point === "claim 뒤 스냅샷 전" ? beforeFirstSnapshot(setup.worker, apply) : undefined;
      const recorded = recordingClient(kit.nativeClient(), {
        after: () => (point === "전송 뒤 확인 전" ? apply() : Promise.resolve()),
      });
      const { indexer } = kit.indexer(setup, {
        client: recorded.client,
        primary:
          point === "claim 뒤 스냅샷 전" ? () => snapshotGate ?? setup.worker : () => setup.worker,
      });

      await drainAll(indexer);
      expect(applied).toBe(true);
      await expectNewest(setup, kind, 2);
      // External versions sent for the document never decrease.
      const versions = recorded.bulks.flatMap((bulk) => bulk.versions);
      expect(versions).toEqual(versions.toSorted((a, b) => a - b));
    });
  }

  for (const kind of ["수정", "삭제"] as const) {
    it(
      kind === "수정"
        ? "지연된 이전 리비전 요청은 새 본문을 덮어쓰지 못한다"
        : "지연된 present 요청은 더 높은 tombstone을 되살리지 못한다",
      async () => {
        const setup = await kit.setUp();
        await kit.write(setup, KEY, [ID], (trx) => kit.upsert(trx, KEY, ID, "본문 1"));
        // Hold worker A's first bulk before it reaches the engine.
        const held = latch();
        let first = true;
        const slow = recordingClient(kit.nativeClient(), {
          before: async () => {
            if (!first) return;
            first = false;
            await held.promise;
          },
        });
        const a = kit.indexer(setup, { client: slow.client });
        const pending = a.indexer.drainOnce();
        await waitFor("A의 bulk가 붙잡힘", () => slow.bulks.length === 1);
        expect(slow.bulks[0]?.versions).toEqual([1]);

        // While A is stalled (as in a GC pause) its lease expires, the change commits and worker B indexes it.
        await h.knex.raw(
          sql`UPDATE ${qualified(h.searchSchema, "delivery_runtime")} SET lease_expires_at = clock_timestamp() - interval '1 second'`,
        );
        await change(setup, kind);
        const b = kit.indexer(setup);
        expect(await b.indexer.drainOnce()).toMatchObject({ claimed: 1, indexed: 1 });
        await expectNewest(setup, kind, 2);

        // A's stale request at version 1 now arrives: 409, and the ledger shows a newer revision, so it is a past attempt.
        held.open();
        const report = await pending;
        expect(report).toMatchObject({ claimed: 1, leaseLost: 1, indexed: 0 });
        expect(outcomeSum(report)).toBe(report.claimed);
        await expectNewest(setup, kind, 2);
      },
    );
  }

  it("지운 뒤 같은 ID로 다시 만든 문서는 새 리비전으로 색인된다", async () => {
    const setup = await kit.setUp();
    const { indexer } = kit.indexer(setup);
    await kit.write(setup, KEY, [ID], (trx) => kit.upsert(trx, KEY, ID, "본문 1"));
    await change(setup, "삭제");
    await drainAll(indexer);
    await expectNewest(setup, "삭제", 2);
    await change(setup, "수정", "본문 3");
    await drainAll(indexer);
    await expectNewest(setup, "수정", 3);
  });
});

describe("워커 핸들 (stop과 진행 중인 drain)", () => {
  async function heartbeatRows(): Promise<number> {
    const { rows } = await h.knex.raw<{ rows: { n: string }[] }>(
      sql`SELECT count(*) AS n FROM ${qualified(h.searchSchema, "worker_heartbeats")}`,
    );
    return Number(rows[0]?.n);
  }

  function sentPerDocument(bulks: readonly BulkRecord[]) {
    const counts = new Map<string, number>();
    for (const id of bulks.flatMap((bulk) => bulk.ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return Object.fromEntries(counts);
  }

  async function seed(setup: WorkerSetup): Promise<void> {
    await kit.write(setup, KEY, ["a", "b", "c"], async (trx) => {
      for (const id of ["a", "b", "c"]) await kit.upsert(trx, KEY, id, `본문 ${id}`);
    });
  }

  it("기한 안에 끝나지 않은 drain은 중단되고, 보내지 않은 문서는 예산 없이 반납되어 다음 워커가 정확히 한 번 보낸다", async () => {
    const reached = latch();
    let blocking = true;
    const setup = await kit.setUp({
      hooks: {
        [KEY]: {
          // A cooperative slow projection: while blocking, it waits until the call's signal aborts.
          beforeRead: async (context) => {
            if (!blocking) return;
            reached.open();
            await new Promise<void>((resolve) => {
              if (context.signal.aborted) resolve();
              else context.signal.addEventListener("abort", () => resolve(), { once: true });
            });
          },
        },
      },
    });
    await seed(setup);
    const first = recordingClient(kit.nativeClient());
    const { indexer } = kit.indexer(setup, {
      client: first.client,
      limits: { projectionTimeoutMs: 20_000 },
    });
    const handle = indexer.start({ pollIntervalMs: 50 });
    await reached.promise;
    const report = await handle.stop({ deadlineMs: 200 });
    blocking = false;

    expect(report).toMatchObject({ drained: false, abortedInFlight: 0, clientClosed: true });
    expect(first.bulks).toEqual([]);
    expect(
      (await kit.runtimes()).map((row) => [
        row.document_id,
        row.lease_token,
        row.attempts,
        row.quarantined_revision,
      ]),
    ).toEqual([
      ["a", null, 0, null],
      ["b", null, 0, null],
      ["c", null, 0, null],
    ]);
    expect(await heartbeatRows()).toBe(0);

    // The next worker sends each document exactly once: none lost, none sent twice.
    const second = recordingClient(kit.nativeClient());
    await drainAll(kit.indexer(setup, { client: second.client }).indexer);
    expect(sentPerDocument([...first.bulks, ...second.bulks])).toEqual({ a: 1, b: 1, c: 1 });
    for (const id of ["a", "b", "c"]) {
      expect(await kit.indexed(targetOf(setup), id)).toMatchObject({
        version: 1,
        doc: { body: `본문 ${id}` },
      });
    }
  });
});
