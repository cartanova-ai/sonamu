import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type WebSocketMetricInput,
  type WebSocketSpanInput,
  type WebSocketTelemetryController,
  type WebSocketTelemetryEventInput,
  type WebSocketTelemetryEventRecord,
  type WebSocketTelemetryEventSink,
  type WebSocketTelemetryMetricRecord,
  type WebSocketTelemetryMetricSink,
  type WebSocketTelemetryMetricSource,
  type WebSocketTelemetrySpanRecord,
  type WebSocketTelemetrySpanSink,
  NoopWebSocketTelemetryController,
  createWebSocketTelemetryController,
} from "../ws-telemetry";
import { InMemoryEventStore, InMemoryMetricStore, InMemorySpanStore } from "../ws-telemetry-memory";

// -- Test helpers --

const TEST_RUNTIME_METADATA = { runtimeId: "test-runtime", nodeId: "test-node" };

class EventCollectorSink implements WebSocketTelemetryEventSink {
  records: WebSocketTelemetryEventRecord[] = [];
  emit(record: WebSocketTelemetryEventRecord): void {
    this.records.push(record);
  }
}

class MetricCollectorSink implements WebSocketTelemetryMetricSink {
  records: WebSocketTelemetryMetricRecord[] = [];
  emit(record: WebSocketTelemetryMetricRecord): void {
    this.records.push(record);
  }
}

class SpanCollectorSink implements WebSocketTelemetrySpanSink {
  records: WebSocketTelemetrySpanRecord[] = [];
  emit(record: WebSocketTelemetrySpanRecord): void {
    this.records.push(record);
  }
}

class ThrowingMetricSink implements WebSocketTelemetryMetricSink {
  emit(_record: WebSocketTelemetryMetricRecord): void {
    throw new Error("metric sink explosion");
  }
}

class ThrowingEventSink implements WebSocketTelemetryEventSink {
  emit(_record: WebSocketTelemetryEventRecord): void {
    throw new Error("event sink explosion");
  }
}

class RejectingEventSink implements WebSocketTelemetryEventSink {
  emit(_record: WebSocketTelemetryEventRecord): Promise<void> {
    return Promise.reject(new Error("async event sink explosion"));
  }
}

class DeferredEventSink implements WebSocketTelemetryEventSink {
  records: WebSocketTelemetryEventRecord[] = [];
  private readonly promises: Array<Promise<void>> = [];
  private readonly resolvers: Array<() => void> = [];

  emit(record: WebSocketTelemetryEventRecord): Promise<void> {
    this.records.push(record);
    const promise = new Promise<void>((resolve) => {
      this.resolvers.push(resolve);
    });
    this.promises.push(promise);
    return promise;
  }

  resolveAll(): void {
    for (const resolve of this.resolvers.splice(0)) {
      resolve();
    }
  }
}

class HangingEventSink implements WebSocketTelemetryEventSink {
  records: WebSocketTelemetryEventRecord[] = [];
  emit(record: WebSocketTelemetryEventRecord): void {
    this.records.push(record);
  }
  shutdown(_options?: { timeoutMs?: number }): Promise<void> {
    // Never resolves — exercises the per-sink shutdown timeout.
    return new Promise(() => {});
  }
}

class TrackingEventSink implements WebSocketTelemetryEventSink {
  records: WebSocketTelemetryEventRecord[] = [];
  shutdownCalled = false;
  emit(record: WebSocketTelemetryEventRecord): void {
    this.records.push(record);
  }
  shutdown(_options?: { timeoutMs?: number }): void {
    this.shutdownCalled = true;
  }
}

function makeEventInput(
  overrides: Partial<WebSocketTelemetryEventInput> = {},
): WebSocketTelemetryEventInput {
  return {
    name: "test.event",
    level: "info",
    ...overrides,
  };
}

function makeMetricInput(overrides: Partial<WebSocketMetricInput> = {}): WebSocketMetricInput {
  return {
    name: "test.metric",
    kind: "counter",
    value: 1,
    ...overrides,
  };
}

function makeSpanInput(overrides: Partial<WebSocketSpanInput> = {}): WebSocketSpanInput {
  return {
    operationName: "test.op",
    kind: "internal",
    durationMs: 50,
    status: "unset",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// -- T1~T4: redactor chaining --

describe("redactor chaining", () => {
  it("T1 defaults.redactor applies to all three signal records", () => {
    const eventSink = new EventCollectorSink();
    const metricSink = new MetricCollectorSink();
    const spanSink = new SpanCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        defaults: {
          redactor: (record) => {
            if (record.type === "event") {
              return { ...record, attributes: { ...record.attributes, marked: "shared" } };
            }
            if (record.type === "metric") {
              return { ...record, tags: { ...record.tags, marked: "shared" } };
            }
            return { ...record, attributes: { ...record.attributes, marked: "shared" } };
          },
        },
        events: { sinks: [eventSink] },
        metrics: { sinks: [metricSink], collectionEnabled: false },
        spans: { sinks: [spanSink] },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t1.event" }));
    controller.recordMetric(makeMetricInput({ name: "t1.metric" }));
    controller.recordSpan(makeSpanInput({ operationName: "t1.span" }));

    expect(eventSink.records).toHaveLength(1);
    expect(eventSink.records[0].attributes?.marked).toBe("shared");
    expect(metricSink.records).toHaveLength(1);
    expect(metricSink.records[0].tags?.marked).toBe("shared");
    expect(spanSink.records).toHaveLength(1);
    expect(spanSink.records[0].attributes?.marked).toBe("shared");
  });

  it("T2 defaults.redactor runs before per-signal redactor", () => {
    const eventSink = new EventCollectorSink();
    const order: string[] = [];

    const controller = createWebSocketTelemetryController(
      {
        defaults: {
          redactor: (record) => {
            if (record.type !== "event") return record;
            order.push("defaults");
            return {
              ...record,
              attributes: { ...record.attributes, stage: "defaults" },
            };
          },
        },
        events: {
          sinks: [eventSink],
          redactor: (record) => {
            order.push(`events:${record.attributes?.stage ?? "none"}`);
            return {
              ...record,
              attributes: { ...record.attributes, stage: "events" },
            };
          },
        },
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t2.chain" }));

    expect(order).toEqual(["defaults", "events:defaults"]);
    expect(eventSink.records).toHaveLength(1);
    expect(eventSink.records[0].attributes?.stage).toBe("events");
  });

  it("T3 per-signal redactor null disables defaults for that signal only", () => {
    const eventSink = new EventCollectorSink();
    const metricSink = new MetricCollectorSink();
    const spanSink = new SpanCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        defaults: {
          redactor: (record) => {
            if (record.type === "event") {
              return { ...record, attributes: { ...record.attributes, marked: "shared" } };
            }
            if (record.type === "metric") {
              return { ...record, tags: { ...record.tags, marked: "shared" } };
            }
            return { ...record, attributes: { ...record.attributes, marked: "shared" } };
          },
        },
        events: { sinks: [eventSink] },
        metrics: { sinks: [metricSink], redactor: null, collectionEnabled: false },
        spans: { sinks: [spanSink] },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t3.event" }));
    controller.recordMetric(makeMetricInput({ name: "t3.metric" }));
    controller.recordSpan(makeSpanInput({ operationName: "t3.span" }));

    expect(eventSink.records[0].attributes?.marked).toBe("shared");
    expect(metricSink.records[0].tags?.marked).toBeUndefined();
    expect(spanSink.records[0].attributes?.marked).toBe("shared");
  });

  it("T4 redactor returning mismatched record.type is dropped with internal event", () => {
    const eventSink = new EventCollectorSink();
    const metricSink = new MetricCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        defaults: {
          redactor: (record) => {
            if (record.type === "event") {
              // 의도적으로 type을 변경해서 type-mismatch defensive drop을 유도.
              const mismatched: WebSocketTelemetryMetricRecord = {
                timestamp: record.timestamp,
                runtimeId: record.runtimeId,
                nodeId: record.nodeId,
                type: "metric",
                name: record.name,
                kind: "counter",
                value: 0,
              };
              return mismatched;
            }
            return record;
          },
        },
        events: { sinks: [eventSink] },
        metrics: { sinks: [metricSink], collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t4.original" }));

    // 본래 event는 drop되어야 한다.
    const originals = eventSink.records.filter((record) => record.name === "t4.original");
    expect(originals).toHaveLength(0);

    // type-mismatch 내부 event가 events pipeline으로 발행되어야 한다.
    const mismatchEvents = eventSink.records.filter(
      (record) => record.name === "ws.telemetry.redactor.type_mismatch",
    );
    expect(mismatchEvents.length).toBeGreaterThanOrEqual(1);
    expect(mismatchEvents[0].level).toBe("warn");

    // metric sink로는 새지 않아야 한다 (drop).
    expect(metricSink.records.filter((record) => record.name === "t4.original")).toHaveLength(0);
  });
});

// -- T5~T6: signal routing --

describe("signal routing", () => {
  it("T5 each signal sink receives only its own record type", () => {
    const eventSink = new EventCollectorSink();
    const metricSink = new MetricCollectorSink();
    const spanSink = new SpanCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        events: { sinks: [eventSink] },
        metrics: { sinks: [metricSink], collectionEnabled: false },
        spans: { sinks: [spanSink] },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t5.event" }));
    controller.recordMetric(makeMetricInput({ name: "t5.metric" }));
    controller.recordSpan(makeSpanInput({ operationName: "t5.span" }));

    expect(eventSink.records).toHaveLength(1);
    expect(eventSink.records[0].type).toBe("event");
    expect(eventSink.records[0].name).toBe("t5.event");

    expect(metricSink.records).toHaveLength(1);
    expect(metricSink.records[0].type).toBe("metric");
    expect(metricSink.records[0].name).toBe("t5.metric");

    expect(spanSink.records).toHaveLength(1);
    expect(spanSink.records[0].type).toBe("span");
    expect(spanSink.records[0].operationName).toBe("t5.span");
  });

  it("T6 InMemory*Store query returns only its own type and controller exposes get*Store getters", () => {
    const controller = createWebSocketTelemetryController(
      {
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t6.event" }));
    controller.recordMetric(makeMetricInput({ name: "t6.metric" }));
    controller.recordSpan(makeSpanInput({ operationName: "t6.span" }));

    const eventStore = controller.getEventStore();
    const metricStore = controller.getMetricStore();
    const spanStore = controller.getSpanStore();

    expect(eventStore).toBeInstanceOf(InMemoryEventStore);
    expect(metricStore).toBeInstanceOf(InMemoryMetricStore);
    expect(spanStore).toBeInstanceOf(InMemorySpanStore);

    const events = eventStore?.query({}) ?? [];
    const metrics = metricStore?.query({}) ?? [];
    const spans = spanStore?.query({}) ?? [];

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((record) => record.type === "event")).toBe(true);
    expect(events.some((record) => record.name === "t6.event")).toBe(true);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].type).toBe("metric");
    expect(metrics[0].name).toBe("t6.metric");

    expect(spans).toHaveLength(1);
    expect(spans[0].type).toBe("span");
    expect(spans[0].operationName).toBe("t6.span");
  });
});

// -- T7: signal-independent maxRecords --

describe("limits", () => {
  it("T7 events/metrics maxRecords are independent and fall back to defaults then InMemory default", () => {
    const controller = createWebSocketTelemetryController(
      {
        events: { maxRecords: 10 },
        metrics: { maxRecords: 5, collectionEnabled: false },
        // spans는 미지정 → InMemory 기본값(10000) 적용
      },
      TEST_RUNTIME_METADATA,
    );

    for (let i = 0; i < 12; i++) {
      controller.emit(makeEventInput({ name: `t7.event.${i}` }));
    }
    for (let i = 0; i < 12; i++) {
      controller.recordMetric(makeMetricInput({ name: `t7.metric.${i}` }));
    }
    for (let i = 0; i < 12; i++) {
      controller.recordSpan(makeSpanInput({ operationName: `t7.span.${i}` }));
    }

    const events = controller.getEventStore()?.query({}) ?? [];
    const metrics = controller.getMetricStore()?.query({}) ?? [];
    const spans = controller.getSpanStore()?.query({}) ?? [];

    expect(events.length).toBeLessThanOrEqual(10);
    // 가장 최근 emit된 record가 살아있는지(ring buffer 동작) 확인.
    expect(events.some((record) => record.name === "t7.event.11")).toBe(true);

    expect(metrics).toHaveLength(5);
    expect(metrics.some((record) => record.name === "t7.metric.11")).toBe(true);

    // spans는 InMemory 기본값(10000)을 사용하므로 12개 모두 보관됨.
    expect(spans).toHaveLength(12);
  });
});

// -- T8 / T11: rate limit independence and metric bypass --

describe("rate limit", () => {
  it("T8 events.maxRecordsPerSecond is independent of metrics/spans buckets", () => {
    const eventSink = new EventCollectorSink();
    const metricSink = new MetricCollectorSink();
    const spanSink = new SpanCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        events: {
          sinks: [eventSink],
          // alwaysRecordLevels를 비워 sampling skip→skipRateLimit 우회를 막는다.
          sampling: { maxRecordsPerSecond: 1, alwaysRecordLevels: [] },
        },
        metrics: { sinks: [metricSink], collectionEnabled: false },
        spans: { sinks: [spanSink] },
      },
      TEST_RUNTIME_METADATA,
    );

    for (let i = 0; i < 3; i++) {
      controller.emit(makeEventInput({ name: `t8.event.${i}`, level: "info" }));
    }
    for (let i = 0; i < 3; i++) {
      controller.recordMetric(makeMetricInput({ name: `t8.metric.${i}` }));
    }
    for (let i = 0; i < 3; i++) {
      controller.recordSpan(makeSpanInput({ operationName: `t8.span.${i}` }));
    }

    // events 버킷이 1이므로 첫 emit만 통과해야 한다.
    expect(eventSink.records).toHaveLength(1);
    expect(eventSink.records[0].name).toBe("t8.event.0");

    // metrics/spans는 영향 없이 모두 통과.
    expect(metricSink.records).toHaveLength(3);
    expect(spanSink.records).toHaveLength(3);
  });

  it("T11 metric outcome=failed and .dropped name pattern bypass rate limit", () => {
    const metricSink = new MetricCollectorSink();
    const controller = createWebSocketTelemetryController(
      {
        metrics: {
          sinks: [metricSink],
          sampling: { maxRecordsPerSecond: 1 },
          collectionEnabled: false,
        },
      },
      TEST_RUNTIME_METADATA,
    );

    // 첫 normal metric은 토큰 1개 소진.
    controller.recordMetric(makeMetricInput({ name: "t11.normal.first" }));
    // 두번째 normal metric은 토큰 부족으로 drop.
    controller.recordMetric(makeMetricInput({ name: "t11.normal.second" }));
    // outcome=failed metric은 우회.
    controller.recordMetric(makeMetricInput({ name: "t11.with.tag", tags: { outcome: "failed" } }));
    // .dropped 패턴 이름도 우회.
    controller.recordMetric(makeMetricInput({ name: "ws.something.dropped" }));

    const names = metricSink.records.map((record) => record.name);
    expect(names).toContain("t11.normal.first");
    expect(names).not.toContain("t11.normal.second");
    expect(names).toContain("t11.with.tag");
    expect(names).toContain("ws.something.dropped");
  });
});

// -- T9 / T10: sampling --

describe("sampling", () => {
  it("T9 alwaysRecordLevels bypass sampling while defaultRate=0 drops other levels", () => {
    const eventSink = new EventCollectorSink();
    const controller = createWebSocketTelemetryController(
      {
        events: {
          sinks: [eventSink],
          sampling: { defaultRate: 0, alwaysRecordLevels: ["error"] },
        },
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t9.error", level: "error" }));
    controller.emit(makeEventInput({ name: "t9.info", level: "info" }));

    const names = eventSink.records.map((record) => record.name);
    expect(names).toContain("t9.error");
    expect(names).not.toContain("t9.info");
  });

  it("T10 span with status=error bypasses sampling even when defaultRate=0", () => {
    const spanSink = new SpanCollectorSink();
    const controller = createWebSocketTelemetryController(
      {
        spans: { sinks: [spanSink], sampling: { defaultRate: 0 } },
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.recordSpan(makeSpanInput({ operationName: "t10.error", status: "error" }));
    controller.recordSpan(makeSpanInput({ operationName: "t10.unset", status: "unset" }));

    const ops = spanSink.records.map((record) => record.operationName);
    expect(ops).toContain("t10.error");
    expect(ops).not.toContain("t10.unset");
  });
});

// -- T12: getMetricsSnapshot aggregation --

describe("metrics snapshot", () => {
  it("T12 getMetricsSnapshot aggregates dropped/sinkFailures across pipelines", () => {
    const throwingMetricSink = new ThrowingMetricSink();
    const controller = createWebSocketTelemetryController(
      {
        // events redactor가 null을 반환해 drop을 발생시킨다.
        events: {
          redactor: (_record) => null,
        },
        metrics: { sinks: [throwingMetricSink], collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "t12.dropped" }));
    controller.recordMetric(makeMetricInput({ name: "t12.failure" }));

    const snapshot = controller.getMetricsSnapshot();
    expect(snapshot.telemetryDroppedRecords).toBeGreaterThanOrEqual(1);
    expect(snapshot.telemetrySinkFailures).toBeGreaterThanOrEqual(1);
    expect(snapshot.timestamp).toBeGreaterThan(0);
  });
});

// -- T13: registerMetricSource unsubscribe --

describe("metric source", () => {
  it("T13 registerMetricSource returns working unsubscribe", () => {
    const controller = createWebSocketTelemetryController(
      {
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    const source: WebSocketTelemetryMetricSource = {
      collect: () => ({ activeConnections: 7 }),
    };

    const unsubscribe = controller.registerMetricSource(source);
    expect(unsubscribe).toBeInstanceOf(Function);

    const snapshotBefore = controller.getMetricsSnapshot();
    expect(snapshotBefore.activeConnections).toBe(7);

    unsubscribe();

    const snapshotAfter = controller.getMetricsSnapshot();
    expect(snapshotAfter.activeConnections).toBe(0);
  });
});

// -- T14: periodic metric collection --

describe("metric collection", () => {
  it("T14 collectionEnabled with sampleIntervalMs emits gauge to metrics sink periodically", () => {
    vi.useFakeTimers();
    const metricSink = new MetricCollectorSink();
    const controller = createWebSocketTelemetryController(
      {
        metrics: {
          sinks: [metricSink],
          collectionEnabled: true,
          sampleIntervalMs: 10,
        },
      },
      TEST_RUNTIME_METADATA,
    );
    controller.registerMetricSource({
      collect: () => ({ activeConnections: 3 }),
    });

    vi.advanceTimersByTime(50);

    const gauges = metricSink.records.filter(
      (record) => record.name === "ws.connections.active" && record.kind === "gauge",
    );
    expect(gauges.length).toBeGreaterThanOrEqual(1);
    expect(gauges[0].value).toBe(3);
  });

  it("uses controller-wide dropped and sink failure counts in periodic gauge snapshots", async () => {
    vi.useFakeTimers();
    const metricSink = new MetricCollectorSink();
    const throwingEventSink = new ThrowingEventSink();

    const controller = createWebSocketTelemetryController(
      {
        events: {
          sinks: [throwingEventSink],
          redactor: (record) => {
            if (record.name === "periodic.dropped.event") return null;
            return record;
          },
        },
        metrics: {
          sinks: [metricSink],
          collectionEnabled: true,
          sampleIntervalMs: 10,
        },
        spans: {
          redactor: (record) => {
            if (record.operationName === "periodic.dropped.span") return null;
            return record;
          },
        },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "periodic.dropped.event" }));
    controller.emit(makeEventInput({ name: "periodic.failed.event" }));
    controller.recordSpan(makeSpanInput({ operationName: "periodic.dropped.span" }));
    vi.advanceTimersByTime(10);
    await Promise.resolve();

    const gauges = metricSink.records.filter(
      (record) => record.name === "ws.connections.active" && record.kind === "gauge",
    );
    expect(gauges.length).toBeGreaterThanOrEqual(1);
    expect(gauges[0].snapshot?.telemetryDroppedRecords).toBeGreaterThanOrEqual(2);
    expect(gauges[0].snapshot?.telemetrySinkFailures).toBeGreaterThanOrEqual(1);
  });
});

describe("sink failures", () => {
  it("emits ws.telemetry.sink.failed for sync and async emit failures", async () => {
    const observerSink = new EventCollectorSink();
    const controller = createWebSocketTelemetryController(
      {
        events: {
          sinks: [new ThrowingEventSink(), new RejectingEventSink(), observerSink],
        },
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "sink.failure.target" }));
    await Promise.resolve();

    const failureRecords = observerSink.records.filter(
      (record) => record.name === "ws.telemetry.sink.failed",
    );
    expect(failureRecords).toHaveLength(2);
    expect(failureRecords.map((record) => record.detail?.phase)).toEqual(["emit", "emit"]);
    expect(failureRecords.map((record) => record.detail?.signal)).toEqual(["event", "event"]);
    expect(controller.getMetricsSnapshot().telemetrySinkFailures).toBeGreaterThanOrEqual(2);
  });
});

describe("sink backpressure", () => {
  it("limits per-sink in-flight emits and drops non-critical records beyond the limit", async () => {
    const deferredSink = new DeferredEventSink();
    const observerSink = new EventCollectorSink();
    const controller = createWebSocketTelemetryController(
      {
        events: {
          sinks: [deferredSink, observerSink],
          maxInFlightEmits: 2,
          sampling: { alwaysRecordLevels: [] },
        },
        metrics: { collectionEnabled: false },
      },
      TEST_RUNTIME_METADATA,
    );

    controller.emit(makeEventInput({ name: "backpressure.one", level: "info" }));
    controller.emit(makeEventInput({ name: "backpressure.two", level: "info" }));
    controller.emit(makeEventInput({ name: "backpressure.three", level: "info" }));
    controller.emit(makeEventInput({ name: "backpressure.critical", level: "error" }));

    expect(deferredSink.records.map((record) => record.name)).toEqual([
      "backpressure.one",
      "backpressure.two",
      "backpressure.critical",
    ]);
    expect(observerSink.records.map((record) => record.name)).toEqual([
      "backpressure.one",
      "backpressure.two",
      "backpressure.three",
      "backpressure.critical",
    ]);
    expect(observerSink.records.some((record) => record.name === "backpressure.three")).toBe(true);
    expect(controller.getMetricsSnapshot().telemetryDroppedRecords).toBeGreaterThanOrEqual(1);

    deferredSink.resolveAll();
    await Promise.resolve();
  });
});

// -- T15 / T16: shutdown --

describe("shutdown", () => {
  it("T15 sink shutdown timeout is isolated and emits ws.telemetry.shutdown.timeout event", async () => {
    const hangingEventSink = new HangingEventSink();
    const observerSink = new EventCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        events: { sinks: [hangingEventSink, observerSink] },
        metrics: { collectionEnabled: false },
        shutdownTimeoutMs: 20,
      },
      TEST_RUNTIME_METADATA,
    );

    await controller.shutdown();

    // hanging sink는 timeout, observer sink는 정상 종료.
    // sinkFailureCount는 metrics snapshot에서 1 이상.
    const snapshot = controller.getMetricsSnapshot();
    expect(snapshot.telemetrySinkFailures).toBeGreaterThanOrEqual(1);

    // ws.telemetry.shutdown.timeout 이벤트가 events pipeline으로 발행되어야 함.
    const timeoutRecords = observerSink.records.filter(
      (record) => record.name === "ws.telemetry.shutdown.timeout",
    );
    expect(timeoutRecords.length).toBeGreaterThanOrEqual(1);
  });

  it("T16 emit/recordMetric/recordSpan after shutdown are silent drops", async () => {
    const eventSink = new TrackingEventSink();
    const metricSink = new MetricCollectorSink();
    const spanSink = new SpanCollectorSink();

    const controller = createWebSocketTelemetryController(
      {
        events: { sinks: [eventSink] },
        metrics: { sinks: [metricSink], collectionEnabled: false },
        spans: { sinks: [spanSink] },
      },
      TEST_RUNTIME_METADATA,
    );

    await controller.shutdown();

    const eventCountBefore = eventSink.records.length;
    const metricCountBefore = metricSink.records.length;
    const spanCountBefore = spanSink.records.length;

    expect(() => controller.emit(makeEventInput({ name: "t16.late" }))).not.toThrow();
    expect(() => controller.recordMetric(makeMetricInput({ name: "t16.late" }))).not.toThrow();
    expect(() => controller.recordSpan(makeSpanInput({ operationName: "t16.late" }))).not.toThrow();

    expect(eventSink.records.length).toBe(eventCountBefore);
    expect(metricSink.records.length).toBe(metricCountBefore);
    expect(spanSink.records.length).toBe(spanCountBefore);
  });
});

// -- T17: trace context --

describe("trace context", () => {
  it("T17 createConnectionContext preserves traceparent extraction/generation", () => {
    const controller = createWebSocketTelemetryController(true, TEST_RUNTIME_METADATA);

    const extracted = controller.createConnectionContext({
      headers: {
        traceparent: "00-4bf92f3577b16d8a2e3e24ff02e6c998-00f067aa0ba902b7-01",
      },
    });
    expect(extracted.traceId).toBe("4bf92f3577b16d8a2e3e24ff02e6c998");
    expect(extracted.parentSpanId).toBe("00f067aa0ba902b7");
    expect(extracted.sampled).toBe(true);
    expect(extracted.spanId).toMatch(/^[0-9a-f]{16}$/);
    // 새 spanId는 추출된 parentSpanId와 달라야 함.
    expect(extracted.spanId).not.toBe(extracted.parentSpanId);

    const generated = controller.createConnectionContext();
    expect(generated.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(generated.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(generated.parentSpanId).toBeUndefined();
  });
});

// -- T18 / T19: option resolution --

describe("options", () => {
  it("T18 controller option combined with other options throws", () => {
    const custom: WebSocketTelemetryController = new NoopWebSocketTelemetryController();
    expect(() =>
      createWebSocketTelemetryController({ controller: custom, events: {} }, TEST_RUNTIME_METADATA),
    ).toThrow();
  });

  it("T19 enabled=false yields NoopController and undefined get*Store", () => {
    const controller = createWebSocketTelemetryController(
      { enabled: false },
      TEST_RUNTIME_METADATA,
    );
    expect(controller).toBeInstanceOf(NoopWebSocketTelemetryController);
    expect(controller.getEventStore()).toBeUndefined();
    expect(controller.getMetricStore()).toBeUndefined();
    expect(controller.getSpanStore()).toBeUndefined();
  });
});
