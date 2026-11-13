import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECOMMENDED_WORKER_LIMITS } from "../../src/defaults";
import {
  type JsonObject,
  parseCanonicalProjection,
  sha256Hex,
} from "../../src/definition/canonical-json";
import { buildSearchEnvelope } from "../../src/definition/envelope";
import { SearchError, SearchTimeout } from "../../src/errors";
import {
  canonicalEnvelopeLine,
  createBulkPacker,
  serializeBulkItem,
  type SerializedBulkItem,
  serializeCanonicalBulkItem,
} from "../../src/worker/bulk";
import { createCooldownRegistry } from "../../src/worker/cooldown";
import { maxDrainDurationMs, parseWorkerLimits, requiredLeaseMs } from "../../src/worker/limits";
import { boundedExecutor } from "../../src/worker/statement-deadline";
import { createWorkerRuntime, type DrainReport } from "../../src/worker/worker-handle";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

function detailsOf(run: () => void): SearchError["details"] {
  try {
    run();
  } catch (error) {
    if (error instanceof SearchError) return error.details;
    throw error;
  }
  return undefined;
}

describe("워커 한도", () => {
  it("권장값은 통과하고, maxInFlightBytes < maxBulkBytes와 너무 짧은 임대는 거부한다", () => {
    expect(parseWorkerLimits(RECOMMENDED_WORKER_LIMITS)).toEqual(RECOMMENDED_WORKER_LIMITS);
    expect(
      detailsOf(() =>
        parseWorkerLimits({ ...RECOMMENDED_WORKER_LIMITS, maxInFlightBytes: 5 * 1024 * 1024 - 1 }),
      ),
    ).toMatchObject({ reason: "in-flight-below-bulk" });
    // If requestTimeout + heartbeatInterval reaches the lease, no lease is left to send one request between heartbeats.
    expect(
      detailsOf(() =>
        parseWorkerLimits({
          ...RECOMMENDED_WORKER_LIMITS,
          leaseDurationMs: 50_000,
          heartbeatIntervalMs: 20_000,
          requestTimeoutMs: 30_000,
          projectionTimeoutMs: 30_000,
        }),
      ),
    ).toMatchObject({ reason: "lease-too-short-for-drain" });
    expect(requiredLeaseMs(RECOMMENDED_WORKER_LIMITS)).toBe(50_001);
    expect(
      detailsOf(() => parseWorkerLimits({ ...RECOMMENDED_WORKER_LIMITS, statementTimeoutMs: 0 })),
    ).toMatchObject({ reason: "invalid-worker-limits", field: "statementTimeoutMs" });
    // 2 min + max(30 s + 5 s, 30 s + 15 s) + 16 × 5 s = 4 min 5 s
    expect(maxDrainDurationMs(RECOMMENDED_WORKER_LIMITS)).toBe(245_000);
  });
});

describe("정규 JSON에서 만든 bulk 항목", () => {
  const documents: readonly JsonObject[] = [
    { 이름: "한글", z: 1, a: [true, null, -0, 1.5e300], "\u0000": '제어\n문자"' },
    { b: { y: "😀", x: [] }, a: {} },
  ];
  it.each(documents)(
    "present 문서 %#: serializeBulkItem과 JSON 값과 바이트 수가 같고, 해시한 바이트가 곧 본문이다",
    (document) => {
      const { projection, canonical } = parseCanonicalProjection({ state: "present", document });
      const envelope = buildSearchEnvelope(projection, 7);
      const before = serializeBulkItem({ documentId: "문서-1", envelope });
      const after = serializeCanonicalBulkItem(
        { documentId: "문서-1" },
        { meta: envelope.sonamu_meta, canonical },
      );
      if (!("text" in before) || !("text" in after)) throw new Error("serialization failed");
      const [beforeAction, beforeEnvelope] = before.text.split("\n");
      const [afterAction, afterEnvelope] = after.text.split("\n");
      expect(afterAction).toBe(beforeAction);
      expect(JSON.parse(afterEnvelope ?? "")).toEqual(JSON.parse(beforeEnvelope ?? ""));
      expect(after.bytes).toBe(before.bytes);
      expect(after.bytes).toBe(bytes(after.text));
      expect(after.chars).toBe(after.text.length);
      // The doc part of the body is byte-identical to the hashed canonical document.
      const doc = canonical.slice('{"document":'.length, -',"state":"present"}'.length);
      expect(afterEnvelope).toBe(
        `{"sonamu_meta":${JSON.stringify(envelope.sonamu_meta)},"doc":${doc}}`,
      );
      expect(envelope.sonamu_meta.projection_hash).toBe(sha256Hex(canonical));
    },
  );

  it("tombstone도 serializeBulkItem과 같은 값과 바이트이며, 정규 JSON이 아닌 입력은 거부한다", () => {
    const { projection } = parseCanonicalProjection({ state: "deleted" });
    const envelope = buildSearchEnvelope(projection, 3);
    const before = serializeBulkItem({ documentId: "d", envelope });
    const after = serializeCanonicalBulkItem({ documentId: "d" }, { meta: envelope.sonamu_meta });
    if (!("text" in before) || !("text" in after)) throw new Error("serialization failed");
    expect(after.text).toBe(before.text);
    expect(() => canonicalEnvelopeLine({ meta: envelope.sonamu_meta, canonical: "{}" })).toThrow();
  });
});

describe("하나씩 묶는 packer", () => {
  const item = (id: string, size: number): SerializedBulkItem<{ documentId: string }> => {
    const text = `${id}:${"x".repeat(size)}\n`;
    return {
      document: { documentId: id },
      version: 1,
      text,
      bytes: bytes(text),
      chars: text.length,
    };
  };

  it("닫히지 않은 요청 하나만 붙잡고, 한도를 넘기 직전에 요청을 내놓으며, 항목은 텍스트 대신 길이만 가진다", () => {
    const packer = createBulkPacker<{ documentId: string }>({ maxBulkBytes: 110, maxDocuments: 3 });
    const closed = [];
    for (const [index, size] of [30, 30, 30, 10, 60, 60].entries()) {
      const next = item(`i${index}`, size);
      const request = packer.add(next);
      if (request !== undefined) closed.push(request);
      expect(packer.pendingBytes()).toBeLessThanOrEqual(110);
    }
    const tail = packer.flush();
    if (tail !== undefined) closed.push(tail);
    expect(
      closed.map((request) => request.items.map((entry) => entry.document.documentId)),
    ).toEqual([["i0", "i1", "i2"], ["i3", "i4"], ["i5"]]);
    for (const request of closed) {
      expect(request.bytes).toBe(bytes(request.body));
      expect(request.bytes).toBeLessThanOrEqual(110);
      expect(request.items.every((entry) => !("text" in entry))).toBe(true);
    }
    expect(packer.flush()).toBeUndefined();
  });
});

describe("cooldown 항목 정리", () => {
  it("살아 있는 대상에 없는 만료된 대상 항목만 지워, 항목 수가 과거 실패 수로 늘지 않는다", () => {
    let now = 0;
    const registry = createCooldownRegistry(
      { baseDelayMs: 100, maxDelayMs: 1_000 },
      { now: () => now, random: () => 0.5 },
    );
    for (let index = 0; index < 1_000; index += 1) {
      registry.enter({ scope: "target", targetId: `old-${index}` });
    }
    registry.enter({ scope: "target", targetId: "live" });
    registry.enter({ scope: "client" });
    expect(registry.size()).toBe(1_002);
    // Entries still active are kept.
    registry.retainTargets(new Set(["live"]));
    expect(registry.size()).toBe(1_002);
    now = 2_000;
    registry.retainTargets(new Set(["live"]));
    // Only the client entry and the live target's entry (failure count intact) remain.
    expect(registry.size()).toBe(2);
    expect(registry.entry({ scope: "target", targetId: "live" })?.failures).toBe(1);
    expect(registry.coolingTargets()).toEqual([]);
  });
});

describe("문장 기한", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("끝나지 않는 문장은 기한에 SearchTimeout으로 끝나고, Knex 빌더에는 서버 취소를 건다", async () => {
    const timeouts: unknown[][] = [];
    const never = new Promise<never>(() => {});
    const builder = {
      timeout(...args: unknown[]) {
        timeouts.push(args);
        return never;
      },
    };
    // SAFETY: boundedExecutor calls only raw(text, bindings).timeout(ms, options).
    const executor = boundedExecutor({ raw: () => builder } as never, 50);
    const failure = await executor.raw("SELECT 1", []).then(
      () => undefined,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(SearchTimeout);
    expect(failure).toMatchObject({
      retryable: true,
      details: { reason: "statement-timeout", timeoutMs: 50 },
    });
    expect(timeouts).toEqual([[50, { cancel: true }]]);
  });

  it("Knex의 시간 초과 오류도 같은 SearchTimeout이고, 제때 끝난 결과와 다른 오류는 그대로 돌려준다", async () => {
    const knexTimeout = Object.assign(new Error("x"), { name: "KnexTimeoutError" });
    const fake = (result: Promise<object>) => ({ timeout: () => result });
    // SAFETY: these doubles also expose only raw(...).timeout(...).
    const failing = boundedExecutor(
      { raw: () => fake(Promise.reject(knexTimeout)) } as never,
      1_000,
    );
    await expect(failing.raw("SELECT 1", [])).rejects.toBeInstanceOf(SearchTimeout);
    const other = new Error("other");
    // SAFETY: as above.
    const broken = boundedExecutor({ raw: () => fake(Promise.reject(other)) } as never, 1_000);
    await expect(broken.raw("SELECT 1", [])).rejects.toBe(other);
    // SAFETY: as above.
    const ok = boundedExecutor({ raw: () => fake(Promise.resolve({ rows: [1] })) } as never, 1_000);
    await expect(ok.raw("SELECT 1", [])).resolves.toEqual({ rows: [1] });
  });
});

describe("stop의 유예와 busy 보고", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const report = (fields: Partial<DrainReport> = {}): DrainReport => ({
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
  });

  it("중단 신호에도 끝나지 않는 drain은 유예까지만 기다리고 남겨 둔 수를 보고한다", async () => {
    const finish = vi.fn(async () => ({ clientClosed: true }));
    const runtime = createWorkerRuntime({
      // A drain that ignores the signal and never ends, as with a blocked statement.
      drain: () => new Promise<DrainReport>(() => {}),
      gateRemainingMs: () => 0,
      pausedTargets: () => [],
      finish,
      maxDocumentsPerClaim: 10,
      retryBaseDelayMs: 100,
      retryMaxDelayMs: 1_000,
      abortGraceMs: 300,
    });
    const handle = runtime.start({ pollIntervalMs: 1_000 });
    const stopping = handle.stop({ deadlineMs: 200 });
    await vi.advanceTimersByTimeAsync(499);
    expect(finish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const stopped = await stopping;
    expect(stopped).toMatchObject({ drained: false, abandonedDrains: 1, clientClosed: true });
    expect(handle.status().state).toBe("stopped");
  });

  it("busy 보고서는 lastReport와 unsupportedTargets를 바꾸지 않는다", async () => {
    let call = 0;
    const runtime = createWorkerRuntime({
      drain: async () => {
        call += 1;
        return call === 1
          ? report({ claimed: 1, indexed: 1, unsupportedTargets: ["t"] })
          : report({ outcome: "busy" });
      },
      gateRemainingMs: () => 0,
      pausedTargets: () => [],
      finish: async () => ({ clientClosed: true }),
      maxDocumentsPerClaim: 10,
      retryBaseDelayMs: 100,
      retryMaxDelayMs: 1_000,
    });
    await runtime.drainOnce(undefined);
    expect(await runtime.drainOnce(undefined)).toMatchObject({ outcome: "busy" });
    expect(runtime.status().lastReport).toMatchObject({ indexed: 1 });
    expect(runtime.status().unsupportedTargets).toEqual(["t"]);
  });
});
