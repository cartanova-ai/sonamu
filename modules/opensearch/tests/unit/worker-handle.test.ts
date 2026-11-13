import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchConfigurationError, SearchStopping, SearchUnavailable } from "../../src/errors";
import { getSearchLocale, setSearchLocale } from "../../src/i18n";
import {
  createWorkerRuntime,
  type DrainReport,
  type WorkerDriver,
} from "../../src/worker/worker-handle";

const MAX_CLAIM = 10;

function reportOf(fields: Partial<DrainReport> = {}): DrainReport {
  return {
    outcome: "processed",
    claimed: 0,
    indexed: 0,
    superseded: 0,
    retried: 0,
    quarantined: 0,
    released: 0,
    leaseLost: 0,
    skippedLocked: 0,
    abandoned: 0,
    unsupportedTargets: [],
    cooldownRemainingMs: 0,
    elapsedMs: 0,
    ...fields,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

interface Harness {
  driver: WorkerDriver;
  drain: ReturnType<typeof vi.fn<(signal: AbortSignal) => Promise<DrainReport>>>;
  finish: ReturnType<typeof vi.fn<() => Promise<{ clientClosed: boolean }>>>;
  signals: AbortSignal[];
  errors: string[];
}

function harness(drainImpl: (signal: AbortSignal, call: number) => Promise<DrainReport>): Harness {
  const signals: AbortSignal[] = [];
  const errors: string[] = [];
  let call = 0;
  const drain = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    call += 1;
    return drainImpl(signal, call);
  });
  const finish = vi.fn(async () => ({ clientClosed: true }));
  const driver: WorkerDriver = {
    drain,
    gateRemainingMs: () => 0,
    pausedTargets: () => ["t-paused"],
    finish,
    onDrainError: (error) => errors.push(error.code),
    maxDocumentsPerClaim: MAX_CLAIM,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 5_000,
    random: () => 0.999,
  };
  return { driver, drain, finish, signals, errors };
}

// Drains pending microtasks without advancing timers.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setSearchLocale("en");
});

describe("워커 핸들 상태 기계", () => {
  it("start()는 멱등이고 루프는 하나뿐이며, 덜 찬 claim 뒤에는 pollIntervalMs만큼 쉰다", async () => {
    const h = harness(async () => reportOf({ claimed: 1, indexed: 1 }));
    const runtime = createWorkerRuntime(h.driver);
    expect(runtime.status().state).toBe("idle");
    const first = runtime.start({ pollIntervalMs: 1_000 });
    const second = runtime.start({ pollIntervalMs: 50 });
    expect(second).toBe(first);
    await flush();
    expect(h.drain).toHaveBeenCalledTimes(1);
    expect(first.status().state).toBe("running");
    await vi.advanceTimersByTimeAsync(999);
    expect(h.drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.drain).toHaveBeenCalledTimes(2);
    const status = first.status();
    expect(status.lastReport?.indexed).toBe(1);
    expect(status.pausedTargets).toEqual(["t-paused"]);
    await first.stop({ deadlineMs: 1_000 });
  });

  it("가득 찬 claim이면 쉬지 않고 바로 다음 drain을 하고, cooldown이면 그만큼 쉬며 degraded다", async () => {
    const h = harness(async (_signal, call) =>
      call === 1
        ? reportOf({ claimed: MAX_CLAIM, indexed: MAX_CLAIM })
        : call === 2
          ? reportOf({ cooldownRemainingMs: 3_000 })
          : reportOf(),
    );
    const handle = createWorkerRuntime(h.driver).start({ pollIntervalMs: 100 });
    await flush();
    expect(h.drain).toHaveBeenCalledTimes(2);
    expect(handle.status().state).toBe("degraded");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(h.drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.drain).toHaveBeenCalledTimes(3);
    expect(handle.status().state).toBe("running");
    await handle.stop({ deadlineMs: 0 });
  });

  it("cooldown 시간이 지나도 성공이 인프라 실패 기록을 지우기 전까지는 degraded를 유지한다", async () => {
    let unrecovered = true;
    const h = harness(async () => reportOf());
    const handle = createWorkerRuntime({ ...h.driver, unrecovered: () => unrecovered }).start({
      pollIntervalMs: 100,
    });
    await flush();
    // A drain that claims nothing is no evidence of recovery.
    expect(handle.status().state).toBe("degraded");
    await vi.advanceTimersByTimeAsync(100);
    expect(h.drain).toHaveBeenCalledTimes(2);
    expect(handle.status().state).toBe("degraded");
    unrecovered = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(handle.status().state).toBe("running");
    await handle.stop({ deadlineMs: 0 });
  });

  it("거부된 drain은 안정 코드로 기록되고 메시지만 읽는 시점의 로캘로 바뀌며, 지수 backoff와 설정 오류의 최대 지연을 쓴다", async () => {
    const h = harness(async (_signal, call) => {
      if (call === 1) throw new SearchUnavailable({ key: "error.unavailable" });
      if (call === 2) {
        throw new SearchConfigurationError(
          { key: "worker.invalidOptions", params: { path: "limits" } },
          { details: { reason: "x" } },
        );
      }
      return reportOf();
    });
    const handle = createWorkerRuntime(h.driver).start({ pollIntervalMs: 10 });
    await flush();
    expect(handle.status()).toMatchObject({ state: "degraded", consecutiveFailures: 1 });
    expect(handle.status().lastError).toMatchObject({
      code: "SEARCH_UNAVAILABLE",
      key: "error.unavailable",
    });
    // First failure backoff: min(5000, 100 * 2^0) * ~1 = 99 ms
    await vi.advanceTimersByTimeAsync(98);
    expect(h.drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.drain).toHaveBeenCalledTimes(2);
    const lastError = handle.status().lastError;
    expect(lastError).toMatchObject({
      code: "SEARCH_CONFIGURATION_ERROR",
      key: "worker.invalidOptions",
      params: { path: "limits" },
    });
    const english = lastError?.message;
    setSearchLocale("ko");
    expect(getSearchLocale()).toBe("ko");
    const korean = handle.status().lastError?.message;
    expect(korean).not.toBe(english);
    expect(handle.status().lastError?.code).toBe("SEARCH_CONFIGURATION_ERROR");
    // A configuration error waits retryMaxDelayMs.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(h.drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.drain).toHaveBeenCalledTimes(3);
    expect(handle.status()).toMatchObject({ state: "running", consecutiveFailures: 0 });
    expect(h.errors).toEqual(["SEARCH_UNAVAILABLE", "SEARCH_CONFIGURATION_ERROR"]);
    await handle.stop({ deadlineMs: 0 });
  });

  it("stop은 기한 안에 진행 중인 drain을 기다리고, 정리를 한 번만 하며, 타이머를 남기지 않는다", async () => {
    const gate = deferred<DrainReport>();
    const h = harness(() => gate.promise);
    const runtime = createWorkerRuntime(h.driver);
    const handle = runtime.start({ pollIntervalMs: 1_000 });
    await flush();
    expect(h.drain).toHaveBeenCalledTimes(1);

    const stopping = handle.stop({ deadlineMs: 5_000 });
    expect(handle.status().state).toBe("stopping");
    await expect(runtime.drainOnce(undefined)).rejects.toBeInstanceOf(SearchStopping);
    expect(h.drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    gate.resolve(reportOf({ claimed: 2, indexed: 2 }));
    const report = await stopping;
    expect(report).toMatchObject({ drained: true, abortedInFlight: 0, clientClosed: true });
    expect(h.signals[0]?.aborted).toBe(false);
    expect(handle.status().state).toBe("stopped");
    expect(h.finish).toHaveBeenCalledTimes(1);
    expect(handle.stop({ deadlineMs: 0 })).toBe(stopping);
    expect(runtime.start({ pollIntervalMs: 1 })).toBe(handle);
    await flush();
    expect(h.finish).toHaveBeenCalledTimes(1);
    expect(h.drain).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("기한이 지나면 진행 중인 drain(직접 호출 포함)을 중단하고, 결과를 모르는 문서 수를 보고한다", async () => {
    const h = harness(
      (signal) =>
        new Promise<DrainReport>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve(reportOf({ claimed: 3, released: 1, abandoned: 2 }));
          });
        }),
    );
    const runtime = createWorkerRuntime(h.driver);
    const handle = runtime.start({ pollIntervalMs: 1_000 });
    const direct = runtime.drainOnce(undefined);
    await flush();
    expect(h.drain).toHaveBeenCalledTimes(2);
    const stopping = handle.stop({ deadlineMs: 300 });
    await vi.advanceTimersByTimeAsync(299);
    expect(h.signals.every((signal) => !signal.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    const report = await stopping;
    expect(h.signals.every((signal) => signal.aborted)).toBe(true);
    expect(h.signals[0]?.reason).toBeInstanceOf(SearchStopping);
    expect(report).toMatchObject({ drained: false, abortedInFlight: 4, clientClosed: true });
    await expect(direct).resolves.toMatchObject({ abandoned: 2 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("start의 signal이 중단되면 기한 0으로 멈추고, 직접 drainOnce의 signal은 그 drain에만 이어진다", async () => {
    const h = harness(
      (signal) =>
        new Promise<DrainReport>((resolve) => {
          signal.addEventListener("abort", () => resolve(reportOf()));
        }),
    );
    const runtime = createWorkerRuntime(h.driver);
    const own = new AbortController();
    const direct = runtime.drainOnce(own.signal);
    own.abort();
    await expect(direct).resolves.toMatchObject({ claimed: 0 });

    const controller = new AbortController();
    const handle = runtime.start({ pollIntervalMs: 1_000, signal: controller.signal });
    await flush();
    controller.abort();
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(handle.status().state).toBe("stopped");
    expect(h.finish).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("상태 변화 이벤트와 짧은 claim", () => {
  it("상태가 바뀔 때마다 이전 상태, 새 상태, 안정된 이유를 한 번씩 알리고 status()와 같다", async () => {
    const h = harness(async (_signal, call) => {
      if (call === 2) throw new SearchUnavailable({ key: "error.unavailable" });
      if (call === 3) return reportOf({ cooldownRemainingMs: 1_000 });
      return reportOf({ claimed: 1, indexed: 1 });
    });
    const changes: string[] = [];
    const runtime = createWorkerRuntime({
      ...h.driver,
      onStateChange: (change) => {
        changes.push(`${change.previous}>${change.state}:${change.reason}`);
        expect(runtime.status().state).toBe(change.state);
      },
    });
    const handle = runtime.start({ pollIntervalMs: 100 });
    await flush();
    // Drains: success, failure after 100 ms, cooldown after the backoff, recovery after 1 s.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.drain.mock.calls.length).toBeGreaterThanOrEqual(4);
    await handle.stop({ deadlineMs: 0 });
    expect(changes).toEqual([
      "idle>running:started",
      "running>degraded:drain-failed",
      "degraded>running:recovered",
      "running>stopping:stop-requested",
      "stopping>stopped:stopped",
    ]);
    expect(handle.status().state).toBe("stopped");
  });

  it("cooldown으로 degraded가 되면 이유는 infrastructure-cooldown이고, 같은 상태로의 전이는 알리지 않는다", async () => {
    const h = harness(async (_signal, call) =>
      call <= 2 ? reportOf({ cooldownRemainingMs: 500 }) : reportOf(),
    );
    const changes: string[] = [];
    const handle = createWorkerRuntime({
      ...h.driver,
      onStateChange: (change) =>
        changes.push(`${change.previous}>${change.state}:${change.reason}`),
    }).start({ pollIntervalMs: 100 });
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.drain).toHaveBeenCalledTimes(3);
    await handle.stop({ deadlineMs: 0 });
    expect(changes.slice(0, 3)).toEqual([
      "idle>running:started",
      "running>degraded:infrastructure-cooldown",
      "degraded>running:recovered",
    ]);
  });

  it("잠긴 후보를 건너뛰어 짧아진 claim 뒤에는 쉬지 않고, 같은 수라도 대기열이 바닥난 claim 뒤에는 pollIntervalMs만큼 쉰다", async () => {
    const short = reportOf({ claimed: 3, indexed: 3 });
    const drained = reportOf({ claimed: 3, indexed: 3 });
    const h = harness(async (_signal, call) =>
      call === 1 ? short : call === 2 ? drained : reportOf(),
    );
    const handle = createWorkerRuntime({
      ...h.driver,
      continueImmediately: (report) => report === short,
    }).start({ pollIntervalMs: 60_000 });
    await flush();
    // The short claim is followed at once by the second drain, which exhausted the queue and so sleeps.
    expect(h.drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(h.drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.drain).toHaveBeenCalledTimes(3);
    await handle.stop({ deadlineMs: 0 });
  });

  it("아무것도 잡지 못한 drain은 continueImmediately가 true여도 쉰다", async () => {
    const h = harness(async () => reportOf());
    const handle = createWorkerRuntime({ ...h.driver, continueImmediately: () => true }).start({
      pollIntervalMs: 1_000,
    });
    await flush();
    expect(h.drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(h.drain).toHaveBeenCalledTimes(1);
    await handle.stop({ deadlineMs: 0 });
  });

  it("직접 부른 drainOnce가 거부되면 error 이벤트를 내고 호출자는 같은 오류를 받으며, stopping 뒤의 거부는 알리지 않는다", async () => {
    const failure = new SearchUnavailable({ key: "error.unavailable" });
    const h = harness(async () => {
      throw failure;
    });
    const runtime = createWorkerRuntime(h.driver);
    await expect(runtime.drainOnce(undefined)).rejects.toBe(failure);
    expect(h.errors).toEqual(["SEARCH_UNAVAILABLE"]);
    expect(runtime.status().state).toBe("idle");

    await runtime.start({ pollIntervalMs: 1_000 }).stop({ deadlineMs: 0 });
    const errorsBefore = h.errors.length;
    const drainsBefore = h.drain.mock.calls.length;
    await expect(runtime.drainOnce(undefined)).rejects.toBeInstanceOf(SearchStopping);
    expect(h.errors).toHaveLength(errorsBefore);
    expect(h.drain).toHaveBeenCalledTimes(drainsBefore);
  });
});
