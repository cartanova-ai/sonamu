import { Client } from "@opensearch-project/opensearch";
import { describe, expect, it, onTestFinished } from "vitest";

import { type IndexerEvent, type WorkerHandle } from "../../src/postgres";
import { useIntegrationHarness } from "../helpers/harness";
import { closedPortUrl } from "../helpers/tcp-proxy";
import { outcomeSum, useWorkerFixture, waitFor, type WorkerSetup } from "../helpers/worker-fixture";

/**
 * A release whose cause may lie in the releasing process (a request-level or database-side failure) must not put
 * that process's cooldown into the shared runtime row; only the failing worker waits. Two workers that cannot reach
 * the engine and one healthy worker share a target.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const KEY = "notes";
const UNHEALTHY_LIMITS = { retryBaseDelayMs: 10_000, retryMaxDelayMs: 20_000 } as const;
/** Lower bound of the cooldown after the first failure (base * 0.5). */
const MIN_COOLDOWN_MS = UNHEALTHY_LIMITS.retryBaseDelayMs / 2;
/** Must stay below MIN_COOLDOWN_MS, otherwise a shared delay would go unnoticed. */
const BOUND_MS = 3_000;

function targetOf(setup: WorkerSetup) {
  const target = setup.targets.get(KEY);
  if (target === undefined) throw new Error("대상이 없습니다.");
  return target;
}

/** Event array that also records when each event arrived. */
class TimedEvents extends Array<IndexerEvent> {
  readonly times: number[] = [];

  override push(...items: IndexerEvent[]): number {
    this.times.push(...items.map(() => performance.now()));
    return super.push(...items);
  }

  processed(): { at: number; event: IndexerEvent }[] {
    return this.flatMap((event, index) =>
      event.type === "drain" && event.outcome === "processed"
        ? [{ at: this.times[index] ?? 0, event }]
        : [],
    );
  }
}

async function refusingClient(): Promise<Client> {
  const client = new Client({ node: await closedPortUrl(), maxRetries: 0 });
  onTestFinished(() => client.close());
  return client;
}

async function waitIndexed(
  setup: WorkerSetup,
  ids: readonly string[],
  since: number,
): Promise<number> {
  await waitFor(
    `${ids.join(",")} 색인`,
    async () => {
      const found = await Promise.all(ids.map((id) => kit.indexed(targetOf(setup), id)));
      return found.every((document) => document !== null);
    },
    BOUND_MS * 4,
  );
  return performance.now() - since;
}

describe("프로세스 안 cooldown과 공유 행", () => {
  it(
    "엔진에 닿지 못하는 워커 둘이 반납한 문서를 건강한 워커가 자기 poll 간격 안에 색인하고, 불건강 워커는 예산 없이 자기 cooldown만큼만 claim한다",
    { timeout: 90_000 },
    async () => {
      const setup = await kit.setUp({ keys: [KEY] });
      const write = (ids: readonly string[]) =>
        kit.write(setup, KEY, ids, async (trx) => {
          for (const id of ids) await kit.upsert(trx, KEY, id, `본문 ${id}`);
        });
      const handles: WorkerHandle[] = [];
      onTestFinished(async () => {
        await Promise.all(handles.map((handle) => handle.stop({ deadlineMs: 5_000 })));
      });

      // The unhealthy workers claim and release the documents first.
      const initial = ["d1", "d2", "d3", "d4", "d5"];
      await write(initial);
      const unhealthy: TimedEvents[] = [];
      for (let index = 0; index < 2; index += 1) {
        const events = new TimedEvents();
        const { indexer } = kit.indexer(setup, {
          client: await refusingClient(),
          limits: UNHEALTHY_LIMITS,
          events,
        });
        unhealthy.push(events);
        handles.push(indexer.start({ pollIntervalMs: 100 }));
      }
      await waitFor("두 불건강 워커가 문서를 잡고 반납", () =>
        unhealthy.every((events) => events.processed().length > 0),
      );
      for (const events of unhealthy) {
        for (const { event } of events.processed()) {
          if (event.type !== "drain") continue;
          expect(event.report).toMatchObject({ indexed: 0, retried: 0, quarantined: 0 });
          expect(event.report.released).toBe(event.report.claimed);
          expect(outcomeSum(event.report)).toBe(event.report.claimed);
        }
      }

      // The healthy worker indexes them without waiting for the unhealthy workers' cooldown.
      const healthyStarted = performance.now();
      const { indexer: healthy } = kit.indexer(setup);
      handles.push(healthy.start({ pollIntervalMs: 100 }));
      expect(await waitIndexed(setup, initial, healthyStarted)).toBeLessThan(BOUND_MS);

      // Later documents stay fast even when an unhealthy worker wakes after its cooldown and claims them first.
      const latencies: number[] = [];
      for (let index = 1; index <= 12; index += 1) {
        const id = `n${index}`;
        const writtenAt = performance.now();
        await write([id]);
        latencies.push(await waitIndexed(setup, [id], writtenAt));
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      expect(Math.max(...latencies)).toBeLessThan(BOUND_MS);
      await waitFor("대기열 비움", async () => (await kit.intents()).length === 0);

      // Unhealthy workers spent no budget and claimed no more often than their own cooldown allows.
      for (const row of await kit.runtimes()) {
        expect(row).toMatchObject({ attempts: 0, retry_age_ms: 0, quarantined_revision: null });
      }
      for (const events of unhealthy) {
        const times = events.processed().map(({ at }) => at);
        times.slice(1).forEach((at, index) => {
          expect(at - times[index]).toBeGreaterThanOrEqual(MIN_COOLDOWN_MS - 100);
        });
      }
    },
  );
});
