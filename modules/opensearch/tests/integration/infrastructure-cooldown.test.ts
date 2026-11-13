import { createServer, type Server } from "node:http";

import { type ApiError, type ApiResponse, Client, Transport } from "@opensearch-project/opensearch";
import {
  type TransportRequestCallback,
  type TransportRequestOptions,
  type TransportRequestParams,
  type TransportRequestPromise,
} from "@opensearch-project/opensearch/lib/Transport.js";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { type WorkerLimits } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { startTcpProxy } from "../helpers/tcp-proxy";
import { createBulkInjector, type InjectedItemOutcome } from "../helpers/transport-proxy";
import {
  outcomeSum,
  type RecordedStatement,
  type RuntimeRow,
  useWorkerFixture,
  waitFor,
  type WorkerSetup,
} from "../helpers/worker-fixture";

/**
 * Across repeated drains during an infrastructure outage, no document spends retry budget and nothing is quarantined.
 * Cooldown applies to the right scope (client for request failures, the target for item failures, the database for
 * projection delays), to both the start() loop and direct drainOnce() calls, and indexing resumes on its own afterwards.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";
const OTHER = "other";

// Leading text of the claim statement and of each materialize snapshot, used to count them.
const CLAIM_TEXT = "WITH cand AS MATERIALIZED";
const SNAPSHOT_TEXT = "set_config('statement_timeout'";

function targetOf(setup: WorkerSetup, key = KEY) {
  const target = setup.targets.get(key);
  if (target === undefined) throw new Error(`대상 ${key}가 없습니다.`);
  return target;
}

function engineUrl(): string {
  const endpoint = h.env.opensearch;
  if (endpoint === null) throw new Error("OpenSearch 접속 정보가 없습니다.");
  return endpoint.url;
}

type Route = "engine" | "unavailable" | "blackhole";

interface FaultyEngine {
  readonly client: Client;
  route(next: Route): void;
  /** Date.now() of each 503 response. */
  readonly unavailableAt: number[];
}

/**
 * Routes bulk requests to the chosen fault; other requests reach the real engine. unavailable answers HTTP 503 and
 * blackhole accepts connections but never answers.
 */
async function faultyEngine(base: Client): Promise<FaultyEngine> {
  const unavailableAt: number[] = [];
  const server: Server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      unavailableAt.push(Date.now());
      response.writeHead(503, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: { type: "cluster_block_exception", reason: "injected" },
          status: 503,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = z.object({ port: z.number() }).parse(server.address());
  const proxy = await startTcpProxy(engineUrl());
  proxy.setMode({ kind: "blackhole" });
  const clients = {
    unavailable: new Client({ node: `http://127.0.0.1:${address.port}`, maxRetries: 0 }),
    blackhole: new Client({ node: proxy.url, maxRetries: 0 }),
  } satisfies Record<Exclude<Route, "engine">, Client>;
  onTestFinished(async () => {
    await Promise.allSettled(Object.values(clients).map((client) => client.close()));
    await proxy.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  let current: Route = "engine";

  class SwitchingTransport extends Transport {
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
    ): TransportRequestPromise<ApiResponse>;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestCallback;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestPromise<ApiResponse> | TransportRequestCallback {
      if (callback !== undefined || current === "engine" || !params.path.endsWith("/_bulk")) {
        return super.request(params, options, callback);
      }
      return clients[current].transport.request(params, options);
    }
  }
  return {
    client: base.child({ Transport: SwitchingTransport }),
    route(next) {
      current = next;
    },
    unavailableAt,
  };
}

const OUTAGE_LIMITS: Partial<WorkerLimits> = {
  requestTimeoutMs: 1_000,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 1_000,
};

/** Lower bound of the cooldown after the k-th failure: 0.5 * min(max, base * 2^(k-1)), jitter is [0.5, 1). */
function minimumCooldownMs(failures: number): number {
  const base = OUTAGE_LIMITS.retryBaseDelayMs ?? 0;
  const max = OUTAGE_LIMITS.retryMaxDelayMs ?? 0;
  return 0.5 * Math.min(max, base * 2 ** (failures - 1));
}

/**
 * Records when the last bulk response or failure reached the worker. The cooldown starts after that moment, so while
 * less than its lower bound has elapsed since then, the cooldown cannot have ended yet.
 */
interface TimedClient {
  readonly client: Client;
  lastBulkSettledAt(): number;
}

function timedClient(base: Client): TimedClient {
  let settledAt = Number.NEGATIVE_INFINITY;
  const mark = () => {
    settledAt = performance.now();
  };
  const request = (params: TransportRequestParams, options?: TransportRequestOptions) => {
    const pending = base.transport.request(params, options);
    if (!params.path.endsWith("/_bulk")) return pending;
    const observed = pending.then(
      (response) => {
        mark();
        return response;
      },
      (error: Error) => {
        mark();
        throw error;
      },
    );
    return Object.assign(observed, { abort: () => pending.abort() });
  };
  const transport = new Proxy(base.transport, {
    get(target, property) {
      if (property === "request") return request;
      // SAFETY: the get trap only receives real property names of the Transport and reads them from it unchanged.
      return target[property as keyof Transport];
    },
  });
  const client = new Proxy(base, {
    get(target, property) {
      if (property === "transport") return transport;
      // SAFETY: the get trap only receives real property names of the Client and reads them from it unchanged.
      return target[property as keyof Client];
    },
  });
  return { client, lastBulkSettledAt: () => settledAt } satisfies TimedClient;
}

function claims(statements: readonly RecordedStatement[]): RecordedStatement[] {
  return statements.filter((statement) => statement.sql.includes(CLAIM_TEXT));
}

function expectUntouchedBudget(rows: readonly RuntimeRow[]): void {
  for (const row of rows) {
    expect(row).toMatchObject({
      attempts: 0,
      retry_age_ms: 0,
      failure_revision: 0,
      quarantined_revision: null,
      lease_token: null,
    });
  }
}

type Outage =
  | { readonly name: string; readonly scope: "client"; readonly route: Exclude<Route, "engine"> }
  | { readonly name: string; readonly scope: "target"; readonly item: InjectedItemOutcome };

// One request-level and one item-level outage. Request 503 and refused connections take the same worker branch as
// the timeout; item 503 and unavailable_shards the same as item 429.
const OUTAGES: readonly Outage[] = [
  { name: "요청 제한 시간", scope: "client", route: "blackhole" },
  {
    name: "항목 429",
    scope: "target",
    item: { status: 429, type: "es_rejected_execution_exception" },
  },
];

const FAILING_SENDS = 5;

describe("인프라 장애와 cooldown", () => {
  for (const outage of OUTAGES) {
    it(
      `${outage.name}: 여러 번 drain해도 예산 없이 반납되고 ${outage.scope} 범위의 cooldown이 걸리며, 끝나면 스스로 색인한다`,
      { timeout: 90_000 },
      async () => {
        const setup = await kit.setUp({ keys: [KEY, OTHER] });
        const target = targetOf(setup);
        const ids = ["a", "b", "c"];
        await kit.write(setup, KEY, ids, async (trx) => {
          for (const id of ids) await kit.upsert(trx, KEY, id, `본문 ${id}`);
        });

        const native = kit.nativeClient();
        let client: Client;
        let end: () => void;
        if (outage.scope === "client") {
          const engine = await faultyEngine(native);
          engine.route(outage.route);
          client = engine.client;
          end = () => engine.route("engine");
        } else {
          const injector = createBulkInjector(native);
          injector.inject({
            match: (operation) => ids.includes(operation.id ?? ""),
            outcome: outage.item,
            times: Number.POSITIVE_INFINITY,
          });
          client = injector.client;
          end = () => injector.clear();
        }
        const timed = timedClient(client);
        const { indexer } = kit.indexer(setup, { client: timed.client, limits: OUTAGE_LIMITS });

        let failingSends = 0;
        let otherDocuments = 0;
        // Scope is asserted only when the clock proves the cooldown cannot have ended; count how often that happened.
        let scopeChecks = 0;
        while (failingSends < FAILING_SENDS) {
          const report = await indexer.drainOnce();
          expect(report).toMatchObject({ retried: 0, quarantined: 0, indexed: 0 });
          expect(outcomeSum(report)).toBe(report.claimed);
          if (report.claimed === 0) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            continue;
          }
          expect(report.released).toBe(report.claimed);
          failingSends += 1;
          const failedAt = timed.lastBulkSettledAt();
          expectUntouchedBudget(await kit.runtimes());

          // On a loaded host a single domain write can outlast the cooldown, hence the clock check.
          const claimsBefore = claims(setup.statements).length;
          if (outage.scope === "client") {
            const provable = performance.now() - failedAt < minimumCooldownMs(failingSends);
            if (provable) {
              // A client cooldown reports the remaining time without listing targets or claiming.
              const blocked = await indexer.drainOnce();
              expect(blocked.claimed).toBe(0);
              expect(blocked.cooldownRemainingMs).toBeGreaterThan(0);
              expect(claims(setup.statements).length).toBe(claimsBefore);
              scopeChecks += 1;
            }
          } else {
            // A target cooldown skips only that target; the other keeps indexing.
            otherDocuments += 1;
            const id = `o${otherDocuments}`;
            await kit.write(setup, OTHER, [id], (trx) => kit.upsert(trx, OTHER, id, "다른 대상"));
            const provable = performance.now() - failedAt < minimumCooldownMs(failingSends);
            const other = await indexer.drainOnce();
            expect(other).toMatchObject({
              indexed: 1,
              retried: 0,
              quarantined: 0,
              cooldownRemainingMs: 0,
            });
            if (provable) {
              expect(other).toMatchObject({ claimed: 1 });
              const claim = claims(setup.statements).at(-1);
              expect(JSON.stringify(claim?.bindings)).not.toContain(target.targetId);
              scopeChecks += 1;
            } else if (other.claimed > 1) {
              // The cooldown had already ended and the failing target was retried: also an unbudgeted release.
              expect(other.released).toBe(other.claimed - 1);
              failingSends += 1;
            }
            expect(await kit.indexed(targetOf(setup, OTHER), id)).toMatchObject({ version: 1 });
          }
        }
        expect(scopeChecks, "cooldown 범위를 시계로 증명하고 단언한 횟수").toBeGreaterThan(0);
        expectUntouchedBudget(await kit.runtimes());
        expect((await kit.runtimes()).map((row) => row.document_id)).toEqual(ids);

        end();
        await waitFor("장애 뒤 색인", async () => {
          const report = await indexer.drainOnce();
          expect(report).toMatchObject({ retried: 0, quarantined: 0 });
          return (await kit.intents()).length === 0;
        });
        for (const id of ids) {
          expect(await kit.indexed(target, id)).toMatchObject({
            version: 1,
            doc: { body: `본문 ${id}` },
          });
        }
        expect(await kit.runtimes()).toEqual([]);
      },
    );
  }

  it(
    "cooldown 중에는 start() 루프와 직접 호출한 drainOnce() 모두 claim하지 않는다",
    { timeout: 90_000 },
    async () => {
      const setup = await kit.setUp();
      const target = targetOf(setup);
      const ids = ["a", "b"];
      await kit.write(setup, KEY, ids, async (trx) => {
        for (const id of ids) await kit.upsert(trx, KEY, id, `본문 ${id}`);
      });
      const engine = await faultyEngine(kit.nativeClient());
      engine.route("unavailable");
      const baseDelayMs = 400;
      const maxDelayMs = 800;
      const { indexer } = kit.indexer(setup, {
        client: engine.client,
        limits: { retryBaseDelayMs: baseDelayMs, retryMaxDelayMs: maxDelayMs },
      });
      const handle = indexer.start({ pollIntervalMs: 10 });
      onTestFinished(async () => {
        await handle.stop({ deadlineMs: 5_000 });
      });

      // When the server logs the 503 the worker may not have classified it yet, so wait for the loop's release (the
      // cooldown, at least base * 0.5 = 200 ms, is set before it) and then call drainOnce directly.
      await waitFor("첫 503 뒤 루프의 반납", () => (handle.status().lastReport?.released ?? 0) > 0);
      const direct = await indexer.drainOnce();
      expect(direct.claimed).toBe(0);
      expect(direct.cooldownRemainingMs).toBeGreaterThan(0);

      await waitFor("503 네 번", () => engine.unavailableAt.length >= 4, 30_000);
      expect(handle.status().state).toBe("degraded");
      const failures = [...engine.unavailableAt];
      const claimTimes = claims(setup.statements).map((statement) => statement.at);
      // After failure i the cooldown is min(max, base * 2^i) * [0.5, 1); no claim may be issued within it.
      failures.slice(0, 3).forEach((failedAt, index) => {
        const minimum = 0.5 * Math.min(maxDelayMs, baseDelayMs * 2 ** index);
        const next = claimTimes.find((at) => at > failedAt);
        expect(next, `실패 ${index} 뒤의 claim`).toBeDefined();
        expect((next ?? 0) - failedAt).toBeGreaterThanOrEqual(minimum - 5);
      });
      // The fourth drain may not have written its release yet; wait for a lease-free moment (the next claim comes only
      // after the cooldown) before checking the budget.
      let settled: Awaited<ReturnType<typeof kit.runtimes>> = [];
      await waitFor("네 번째 실패의 반납", async () => {
        settled = await kit.runtimes();
        return settled.every((row) => row.lease_token === null);
      });
      expectUntouchedBudget(settled);

      engine.route("engine");
      await waitFor("루프가 색인", async () => (await kit.intents()).length === 0, 30_000);
      for (const id of ids) expect(await kit.indexed(target, id)).toMatchObject({ version: 1 });
      await waitFor("running", () => handle.status().state === "running");
      expect(await kit.runtimes()).toEqual([]);
    },
  );

  it(
    "모든 projection이 느리면 한정된 수의 스냅샷 안에 예산 없이 모두 반납되고 database cooldown이 걸린다",
    { timeout: 90_000 },
    async () => {
      const setup = await kit.setUp();
      const target = targetOf(setup);
      const ids = Array.from({ length: 8 }, (_, index) => `s${index}`);
      await kit.write(setup, KEY, ids, async (trx) => {
        for (const id of ids) await kit.upsert(trx, KEY, id, `느림 ${id}`, undefined, true);
      });
      const { indexer } = kit.indexer(setup, {
        limits: { projectionTimeoutMs: 800, retryBaseDelayMs: 2_000, retryMaxDelayMs: 4_000 },
      });

      for (let round = 1; round <= 2; round += 1) {
        const snapshotsBefore = setup.statements.filter((s) =>
          s.sql.includes(SNAPSHOT_TEXT),
        ).length;
        let report = await indexer.drainOnce();
        await waitFor(
          `${round}회차 claim`,
          async () => {
            if (report.claimed > 0) return true;
            await new Promise((resolve) => setTimeout(resolve, 50));
            report = await indexer.drainOnce();
            return report.claimed > 0;
          },
          20_000,
        );
        expect(report).toMatchObject({
          claimed: 8,
          released: 8,
          retried: 0,
          quarantined: 0,
          indexed: 0,
        });
        // When the first snapshot and both halves time out, bisection stops: three snapshots.
        const snapshots =
          setup.statements.filter((s) => s.sql.includes(SNAPSHOT_TEXT)).length - snapshotsBefore;
        expect(snapshots).toBe(3);
        const rows = await kit.runtimes();
        expect(rows).toHaveLength(8);
        for (const row of rows) {
          expect(row).toMatchObject({
            attempts: 0,
            retry_age_ms: 0,
            failure_revision: 0,
            quarantined_revision: null,
            last_error: {
              class: "materialize_released",
              code: "projection_timeout",
              evidence: "none",
            },
          });
        }
        const cooling = await indexer.drainOnce();
        expect(cooling.claimed).toBe(0);
        expect(cooling.cooldownRemainingMs).toBeGreaterThan(0);
      }

      await kit.write(setup, KEY, ids, async (trx) => {
        for (const id of ids) await kit.upsert(trx, KEY, id, `빠름 ${id}`);
      });
      await waitFor(
        "지연 뒤 색인",
        async () => {
          await indexer.drainOnce();
          return (await kit.intents()).length === 0;
        },
        30_000,
      );
      for (const id of ids) expect(await kit.indexed(target, id)).toMatchObject({ version: 2 });
      expect(await kit.runtimes()).toEqual([]);
    },
  );
});
