import { randomBytes } from "node:crypto";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { type Knex } from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { SearchTimeout } from "../../src/errors";
import { type IndexerEvent } from "../../src/postgres";
import { setWorkerMemoryProbe } from "../../src/worker/indexer";
import { maxDrainDurationMs, type WorkerLimits } from "../../src/worker/limits";
import { type DrainReport } from "../../src/worker/worker-handle";
import { useIntegrationHarness } from "../helpers/harness";
import { qualified, sql } from "../helpers/sql";
import {
  latch,
  type NoteHooks,
  recordingClient,
  TEST_LIMITS,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Worker resource use stays within its limits against real PostgreSQL and OpenSearch: held serialized bytes and heap
 * growth for a claim of large documents, the drain window and leases under slow bulks, overlapping drains, and SQL
 * statement deadlines.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";

afterEach(() => {
  setWorkerMemoryProbe(undefined);
});

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

/** Random hex bodies, so no document shares a repeated string with another. */
async function writeLarge(setup: WorkerSetup, count: number, bytes: number): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) => `d${String(index).padStart(3, "0")}`);
  for (let start = 0; start < ids.length; start += 8) {
    const slice = ids.slice(start, start + 8);
    await kit.write(setup, KEY, slice, async (trx) => {
      for (const id of slice) {
        await kit.upsert(trx, KEY, id, randomBytes(Math.floor(bytes / 2)).toString("hex"));
      }
    });
  }
  return ids;
}

function outcomeSum(report: DrainReport): number {
  return (
    report.indexed +
    report.superseded +
    report.retried +
    report.quarantined +
    report.released +
    report.leaseLost +
    report.skippedLocked +
    report.abandoned
  );
}

const runtimeRowSchema = z.object({
  document_id: z.string(),
  lease_token: z.string().nullable(),
  attempts: z.number(),
  last_error: z.record(z.string(), z.json()).nullable(),
});

async function runtimeRows(): Promise<z.infer<typeof runtimeRowSchema>[]> {
  const { rows } = await h.knex.raw<{ rows: unknown[] }>(
    sql`SELECT document_id, lease_token::text AS lease_token, attempts, last_error FROM ${qualified(h.searchSchema, "delivery_runtime")} ORDER BY document_id`,
  );
  return z.array(runtimeRowSchema).parse(rows);
}

describe("claim 하나의 메모리", () => {
  it("큰 문서의 claim을 chunk로 나눠 보내며, 붙잡은 직렬화 바이트는 maxInFlightBytes 이하이고 힙 증가는 한도 식 안이다", async () => {
    setFlagsFromString("--expose_gc");
    // A context created after setting the flag exposes gc; only heap after a full GC is compared.
    const collect = () => {
      runInNewContext("gc()");
    };

    const DOCUMENT_BYTES = 512 * 1024;
    const COUNT = 48;
    const limits = {
      maxDocumentsPerClaim: COUNT,
      maxBulkBytes: 1_200_000,
      maxConcurrentBulkRequests: 2,
      maxInFlightBytes: 2_600_000,
      maxIsolationCallsPerBatch: 20,
    } satisfies Partial<WorkerLimits>;
    const setup = await kit.setUp();
    const target = targetOf(setup);
    await writeLarge(setup, COUNT, DOCUMENT_BYTES);

    let held = 0;
    setWorkerMemoryProbe((bytes) => {
      held = Math.max(held, bytes);
    });
    let peakHeap = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    let requests = 0;
    let largestBody = 0;
    const recorded = recordingClient(kit.nativeClient(), {
      // Measure heap after a full GC at each send, when the most is held.
      before: async (record) => {
        concurrent += 1;
        requests += 1;
        largestBody = Math.max(largestBody, Buffer.byteLength(record.body));
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        collect();
        peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
      },
      after: async () => {
        concurrent -= 1;
        // Drop finished records so the recording client's copies do not count.
        recorded.bulks.splice(0);
      },
    });
    const { indexer } = kit.indexer(setup, { client: recorded.client, limits });
    collect();
    const baseline = process.memoryUsage().heapUsed;
    const report = await indexer.drainOnce();

    expect(report).toMatchObject({ outcome: "processed", claimed: COUNT, indexed: COUNT });
    expect(outcomeSum(report)).toBe(COUNT);
    expect((await kit.indexed(target, "d000"))?.revision).toBe(1);
    expect(largestBody).toBeLessThanOrEqual(limits.maxBulkBytes);
    expect(requests).toBeGreaterThanOrEqual(COUNT / 2);
    expect(maxConcurrent).toBeLessThanOrEqual(limits.maxConcurrentBulkRequests);
    // Bytes held by the package, packing plus sending, stay within the budget.
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThanOrEqual(limits.maxInFlightBytes);
    // Heap growth bound: 2 * maxInFlightBytes (held bytes plus the projector's chunk of sources), plus
    // (3 + concurrent requests) * maxBulkBytes (joining a body, one document's working copy, the recorder re-reading
    // the body), plus 8 MiB of slack.
    const formula =
      2 * limits.maxInFlightBytes +
      (3 + limits.maxConcurrentBulkRequests) * limits.maxBulkBytes +
      8 * 1024 * 1024;
    const growth = peakHeap - baseline;
    console.info("[worker memory]", { held, growth, formula, requests });
    expect(growth).toBeLessThanOrEqual(formula);
  });
});

describe("drain 기한과 임대", () => {
  it("짧은 임대와 느린 bulk에서 임대가 끝난 행으로 일하지 않고, 창이 닫히면 남은 문서를 반납하며, drain 시간은 식 안이다", async () => {
    const limits = {
      leaseDurationMs: 3_000,
      heartbeatIntervalMs: 500,
      projectionTimeoutMs: 1_000,
      requestTimeoutMs: 1_000,
      statementTimeoutMs: 500,
      maxDocumentsPerClaim: 30,
      maxBulkBytes: 300_000,
      maxInFlightBytes: 600_000,
      maxConcurrentBulkRequests: 1,
      maxIsolationCallsPerBatch: 20,
    } satisfies Partial<WorkerLimits>;
    const setup = await kit.setUp();
    await writeLarge(setup, limits.maxDocumentsPerClaim, 200 * 1024);
    const runtime = qualified(h.searchSchema, "delivery_runtime");

    // For each request, check by the database clock that its documents' leases outlast the request timeout, then
    // delay the send by 250 ms.
    const shortLeases: string[][] = [];
    const recorded = recordingClient(kit.nativeClient(), {
      before: async (record) => {
        const { rows } = await h.knex.raw<{ rows: { document_id: string }[] }>(
          sql`SELECT document_id FROM ${runtime}
WHERE document_id = ANY(?) AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp() + (? * interval '1 millisecond'))`,
          [[...record.ids], limits.requestTimeoutMs],
        );
        if (rows.length > 0) shortLeases.push(rows.map((row) => row.document_id));
        await new Promise((resolve) => setTimeout(resolve, 250));
      },
    });
    const { indexer } = kit.indexer(setup, { client: recorded.client, limits });

    // Count expired leases every 50 ms while the drain runs.
    let running = true;
    let expiredWhileWorking = 0;
    const watcher = (async () => {
      while (running) {
        const { rows } = await h.knex.raw<{ rows: { n: number }[] }>(
          sql`SELECT count(*)::integer AS n FROM ${runtime} WHERE lease_token IS NOT NULL AND lease_expires_at <= clock_timestamp()`,
        );
        if (running) expiredWhileWorking = Math.max(expiredWhileWorking, rows[0]?.n ?? 0);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })();
    const started = performance.now();
    let report: DrainReport;
    try {
      report = await indexer.drainOnce();
    } finally {
      running = false;
      await watcher;
    }
    const elapsed = performance.now() - started;

    const fullLimits = { ...TEST_LIMITS, ...limits };
    console.info("[worker deadline]", {
      elapsed: Math.round(elapsed),
      bound: maxDrainDurationMs(fullLimits),
      bulks: recorded.bulks.length,
      report,
    });
    expect(report.claimed).toBe(limits.maxDocumentsPerClaim);
    expect(outcomeSum(report)).toBe(report.claimed);
    // Part is sent within the 3 s window; the rest is released at the deadline.
    expect(report.indexed).toBeGreaterThan(0);
    expect(report.released).toBeGreaterThan(0);
    expect(report.indexed + report.released).toBe(report.claimed);
    const rows = await runtimeRows();
    const deadlineReleased = rows.filter((row) => row.last_error?.reason === "drain-deadline");
    expect(deadlineReleased).toHaveLength(report.released);
    expect(rows.every((row) => row.lease_token === null && row.attempts === 0)).toBe(true);
    // No request went out with leases shorter than the request timeout, and no lease expired while working.
    expect(shortLeases).toEqual([]);
    expect(expiredWhileWorking).toBe(0);
    expect(elapsed).toBeLessThanOrEqual(maxDrainDurationMs(fullLimits));
  });
});

describe("겹친 drain", () => {
  it("같은 indexer의 drainOnce 열 번과 start() 루프가 겹쳐도 drain은 하나만 돌고 나머지는 I/O 없이 busy다", async () => {
    const setup = await kit.setUp();
    const target = targetOf(setup);
    await kit.write(setup, KEY, ["a", "b", "c"], async (trx) => {
      for (const id of ["a", "b", "c"]) await kit.upsert(trx, KEY, id, `본문 ${id}`);
    });
    const gate = latch();
    let concurrent = 0;
    let maxConcurrent = 0;
    const recorded = recordingClient(kit.nativeClient(), {
      before: async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await gate.promise;
      },
      after: async () => {
        concurrent -= 1;
      },
    });
    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, {
      client: recorded.client,
      events,
      limits: { maxConcurrentBulkRequests: 2 },
    });
    const claims = () =>
      setup.statements.filter((s) => s.sql.includes("WITH cand AS MATERIALIZED"));

    const first = indexer.drainOnce();
    await waitFor("첫 drain의 bulk가 붙잡힘", () => recorded.bulks.length === 1);
    const statementsBefore = setup.statements.length;
    const overlapping = await Promise.all(Array.from({ length: 10 }, () => indexer.drainOnce()));
    expect(overlapping.every((report) => report.outcome === "busy" && report.claimed === 0)).toBe(
      true,
    );
    // Overlapping calls ran no statement at all.
    expect(setup.statements.length).toBe(statementsBefore);
    const handle = indexer.start({ pollIntervalMs: 20 });
    await waitFor(
      "루프의 busy drain",
      () =>
        events.filter((event) => event.type === "drain" && event.outcome === "busy").length >= 12,
    );
    expect(claims()).toHaveLength(1);
    gate.open();
    expect(await first).toMatchObject({ outcome: "processed", claimed: 3, indexed: 3 });
    expect(maxConcurrent).toBe(1);
    expect((await kit.indexed(target, "c"))?.revision).toBe(1);
    // A busy report does not replace lastReport.
    await waitFor("루프의 drain", () => handle.status().lastReport !== undefined);
    expect(handle.status().lastReport?.outcome).not.toBe("busy");
    const stopped = await handle.stop({ deadlineMs: 5_000 });
    expect(stopped).toMatchObject({ drained: true, abandonedDrains: 0 });
    expect(
      events.filter((event) => event.type === "drain" && event.outcome === "busy").length,
    ).toBeGreaterThanOrEqual(10);
  });
});

describe("워커 SQL의 실행 상한", () => {
  it("다른 세션이 대상 테이블을 잠그면 drain은 statementTimeoutMs 뒤 SearchTimeout으로 거부되고 재시도 예산을 쓰지 않는다", async () => {
    const setup = await kit.setUp();
    await kit.write(setup, KEY, ["a"], (trx) => kit.upsert(trx, KEY, "a", "본문"));
    const { indexer } = kit.indexer(setup, { limits: { statementTimeoutMs: 700 } });
    const holder = await h.knex.transaction();
    try {
      await holder.raw(
        sql`LOCK TABLE ${qualified(h.searchSchema, "targets")} IN ACCESS EXCLUSIVE MODE`,
      );
      const started = performance.now();
      const failure = await indexer.drainOnce().catch((error: Error) => error);
      const elapsed = performance.now() - started;
      expect(failure).toBeInstanceOf(SearchTimeout);
      expect(failure).toMatchObject({ retryable: true, details: { reason: "statement-timeout" } });
      expect(elapsed).toBeGreaterThanOrEqual(650);
      expect(elapsed).toBeLessThan(700 + 1_500);
      // The waiting statement was cancelled on the server; no worker connection keeps waiting after the deadline.
      await waitFor("워커 문장 취소", async () => {
        const { rows } = await h.knex.raw<{ rows: { n: number }[] }>(
          "SELECT count(*)::integer AS n FROM pg_locks WHERE NOT granted",
        );
        return (rows[0]?.n ?? 0) === 0;
      });
    } finally {
      await holder.rollback();
    }
    expect(await runtimeRows()).toEqual([]);
  });

  it("claim 뒤 런타임 테이블이 잠기면 정산이 기한에 끝나고, stop()은 기한 + 유예 안에 돌아오며 임대는 만료되거나 풀린다", async () => {
    const statementTimeoutMs = 600;
    let holder: Knex.Transaction | undefined;
    const locked = latch();
    const hooks = {
      [KEY]: {
        // Inside the snapshot, after the claim committed, another session locks the runtime table.
        beforeRead: async () => {
          if (holder !== undefined) return;
          holder = await h.knex.transaction();
          await holder.raw(
            sql`LOCK TABLE ${qualified(h.searchSchema, "delivery_runtime")} IN ACCESS EXCLUSIVE MODE`,
          );
          locked.open();
        },
      },
    } satisfies Record<string, NoteHooks>;
    const setup = await kit.setUp({ hooks });
    await kit.write(setup, KEY, ["a", "b"], async (trx) => {
      await kit.upsert(trx, KEY, "a", "하나");
      await kit.upsert(trx, KEY, "b", "둘");
    });
    const events: IndexerEvent[] = [];
    const { indexer } = kit.indexer(setup, { events, limits: { statementTimeoutMs } });
    const handle = indexer.start({ pollIntervalMs: 60_000 });
    try {
      await locked.promise;
      // The worker's acknowledgement really waits on the lock.
      await waitFor("확인 문장의 잠금 대기", async () => {
        const { rows } = await h.knex.raw<{ rows: { n: number }[] }>(
          "SELECT count(*)::integer AS n FROM pg_locks WHERE NOT granted",
        );
        return (rows[0]?.n ?? 0) > 0;
      });
      const deadlineMs = 200;
      const started = performance.now();
      const stopped = await handle.stop({ deadlineMs });
      const elapsed = performance.now() - started;
      console.info("[worker stop]", { elapsed: Math.round(elapsed), stopped });
      // Bound: deadline + grace (3 * statementTimeoutMs) + one heartbeat-row delete + closing the client.
      expect(elapsed).toBeLessThan(deadlineMs + 4 * statementTimeoutMs + 1_000);
      expect(stopped.drained).toBe(false);
    } finally {
      await holder?.rollback();
    }
    // After the lock: rows whose result was never recorded spent no budget, and their leases are released or expire.
    await waitFor(
      "임대 정리",
      async () => {
        const { rows } = await h.knex.raw<{ rows: { n: number }[] }>(
          sql`SELECT count(*)::integer AS n FROM ${qualified(h.searchSchema, "delivery_runtime")}
WHERE lease_token IS NOT NULL AND lease_expires_at > clock_timestamp()`,
        );
        return (rows[0]?.n ?? 0) === 0;
      },
      TEST_LIMITS.leaseDurationMs + 5_000,
    );
    expect((await runtimeRows()).every((row) => row.attempts === 0)).toBe(true);
  });
});
