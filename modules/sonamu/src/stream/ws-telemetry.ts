import { runtimeTypeOf } from "../runtime-type";
import { isFunctionValue, isObjectValue } from "../utils/runtime-value";
import { InMemoryEventStore, InMemoryMetricStore, InMemorySpanStore } from "./ws-telemetry-memory";
import { generateSpanId, generateTraceId, parseTraceParent } from "./ws-telemetry-trace";

export type WebSocketTelemetryValue =
  | null
  | undefined
  | bigint
  | boolean
  | number
  | string
  | Date
  | WebSocketTelemetryValue[]
  | WebSocketTelemetryAttributes;

export interface WebSocketTelemetryAttributes {
  [key: string]: WebSocketTelemetryValue;
}

// -- Record types (unchanged) --

export type WebSocketTelemetryRecordBase = {
  timestamp: number;
  monotonicTime?: number;
  runtimeId: string;
  nodeId: string;
  namespace?: string;
  connectionId?: string;
  // userId는 connection 소유자를 식별하기 위한 opaque identifier (보통 DB PK)
  // pseudonymous identifier로만 사용하며, 이메일/전화번호 등 PII는 들어가지 않는다고 가정함
  userId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
};

export type WebSocketTelemetryEventRecord = WebSocketTelemetryRecordBase & {
  type: "event";
  name: string;
  level: "debug" | "info" | "warn" | "error";
  attributes?: Record<string, string | number | boolean>;
  detail?: WebSocketTelemetryAttributes;
  payloadPreview?: string;
};

export type WebSocketTelemetryMetricRecord = WebSocketTelemetryRecordBase & {
  type: "metric";
  name: string;
  kind: "counter" | "histogram" | "gauge";
  value: number;
  unit?: "1" | "ms" | "By";
  tags?: Record<string, string>;
  snapshot?: WebSocketTelemetryMetricsSnapshot;
};

export type WebSocketTelemetrySpanRecord = WebSocketTelemetryRecordBase & {
  type: "span";
  operationName: string;
  kind: "internal" | "producer" | "consumer" | "server" | "client";
  durationMs: number;
  status: "unset" | "ok" | "error";
  attributes?: Record<string, string | number | boolean>;
  errorType?: string;
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: WebSocketTelemetryAttributes;
  }>;
  links?: Array<{
    traceId: string;
    spanId: string;
    attributes?: WebSocketTelemetryAttributes;
  }>;
};

export type WebSocketTelemetryRecord =
  | WebSocketTelemetryEventRecord
  | WebSocketTelemetryMetricRecord
  | WebSocketTelemetrySpanRecord;

// -- Input types (unchanged) --

export type WebSocketTelemetryEventInput = {
  name: string;
  level: "debug" | "info" | "warn" | "error";
  namespace?: string;
  connectionId?: string;
  userId?: string;
  attributes?: Record<string, string | number | boolean>;
  detail?: WebSocketTelemetryAttributes;
  payload?: WebSocketTelemetryValue;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
};

export type WebSocketMetricInput = {
  name: string;
  kind: "counter" | "histogram" | "gauge";
  value: number;
  unit?: "1" | "ms" | "By";
  tags?: Record<string, string>;
  namespace?: string;
  connectionId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
  snapshot?: WebSocketTelemetryMetricsSnapshot;
};

export type WebSocketSpanInput = {
  operationName: string;
  kind: "internal" | "producer" | "consumer" | "server" | "client";
  durationMs: number;
  status: "unset" | "ok" | "error";
  namespace?: string;
  connectionId?: string;
  userId?: string;
  attributes?: Record<string, string | number | boolean>;
  errorType?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: WebSocketTelemetryAttributes;
  }>;
  links?: Array<{
    traceId: string;
    spanId: string;
    attributes?: WebSocketTelemetryAttributes;
  }>;
};

export type WebSocketTelemetryInput =
  | ({ type: "event" } & WebSocketTelemetryEventInput)
  | ({ type: "metric" } & WebSocketMetricInput)
  | ({ type: "span" } & WebSocketSpanInput);

// -- Metrics snapshot --

export type WebSocketTelemetryMetricsSnapshot = {
  timestamp: number;
  activeConnections: number;
  activeConnectionsByNamespace: Record<string, number>;
  roomCount: number;
  pendingInboundMessages: number;
  pendingOutboundMessages: number;
  socketBufferedBytes: number;
  pendingFanOutJobs: number;
  pendingFanOutTargets: number;
  telemetryDroppedRecords: number;
  telemetrySinkFailures: number;
};

// -- Connection snapshot (TelemetryInspectableConnection) --

export type WebSocketTelemetryConnectionSnapshot = {
  pendingInboundMessages: number;
  pendingOutboundMessages: number;
  socketBufferedBytes: number;
};

export interface TelemetryInspectableConnection {
  getTelemetrySnapshot(): WebSocketTelemetryConnectionSnapshot;
}

// -- Signal-narrowed sinks --

export interface WebSocketTelemetryEventSink {
  emit(record: WebSocketTelemetryEventRecord): void | Promise<void>;
  shutdown?(options?: { timeoutMs?: number }): void | Promise<void>;
}

export interface WebSocketTelemetryMetricSink {
  emit(record: WebSocketTelemetryMetricRecord): void | Promise<void>;
  shutdown?(options?: { timeoutMs?: number }): void | Promise<void>;
}

export interface WebSocketTelemetrySpanSink {
  emit(record: WebSocketTelemetrySpanRecord): void | Promise<void>;
  shutdown?(options?: { timeoutMs?: number }): void | Promise<void>;
}

// -- Signal-narrowed query filters --

export type WebSocketTelemetryEventQueryFilter = {
  name?: string;
  level?: "debug" | "info" | "warn" | "error";
  connectionId?: string;
  userId?: string;
  namespace?: string;
  traceId?: string;
  since?: number;
  until?: number;
  limit?: number;
};

export type WebSocketTelemetryMetricQueryFilter = {
  name?: string;
  kind?: "counter" | "histogram" | "gauge";
  connectionId?: string;
  userId?: string;
  namespace?: string;
  traceId?: string;
  since?: number;
  until?: number;
  limit?: number;
};

export type WebSocketTelemetrySpanQueryFilter = {
  operationName?: string;
  kind?: "internal" | "producer" | "consumer" | "server" | "client";
  status?: "unset" | "ok" | "error";
  connectionId?: string;
  userId?: string;
  namespace?: string;
  traceId?: string;
  since?: number;
  until?: number;
  limit?: number;
};

// -- Signal-narrowed stores --

export interface WebSocketTelemetryEventStore {
  readonly sink: WebSocketTelemetryEventSink;
  query(filter: WebSocketTelemetryEventQueryFilter): WebSocketTelemetryEventRecord[];
  clear(): void;
}

export interface WebSocketTelemetryMetricStore {
  readonly sink: WebSocketTelemetryMetricSink;
  query(filter: WebSocketTelemetryMetricQueryFilter): WebSocketTelemetryMetricRecord[];
  clear(): void;
}

export interface WebSocketTelemetrySpanStore {
  readonly sink: WebSocketTelemetrySpanSink;
  query(filter: WebSocketTelemetrySpanQueryFilter): WebSocketTelemetrySpanRecord[];
  clear(): void;
}

// -- Metric source interface (unchanged) --

export interface WebSocketTelemetryMetricSource {
  collect(now: number): Partial<WebSocketTelemetryMetricsSnapshot>;
}

// -- Redactor / beforeRecord types (signal-narrowed + shared) --

export type WebSocketTelemetryEventRedactor = (
  record: WebSocketTelemetryEventRecord,
) => WebSocketTelemetryEventRecord | null;

export type WebSocketTelemetryMetricRedactor = (
  record: WebSocketTelemetryMetricRecord,
) => WebSocketTelemetryMetricRecord | null;

export type WebSocketTelemetrySpanRedactor = (
  record: WebSocketTelemetrySpanRecord,
) => WebSocketTelemetrySpanRecord | null;

export type WebSocketTelemetryRedactor = (
  record: WebSocketTelemetryRecord,
) => WebSocketTelemetryRecord | null;

export type WebSocketTelemetryEventBeforeRecord = (
  record: WebSocketTelemetryEventRecord,
) => WebSocketTelemetryEventRecord | null;

export type WebSocketTelemetryMetricBeforeRecord = (
  record: WebSocketTelemetryMetricRecord,
) => WebSocketTelemetryMetricRecord | null;

export type WebSocketTelemetrySpanBeforeRecord = (
  record: WebSocketTelemetrySpanRecord,
) => WebSocketTelemetrySpanRecord | null;

export type WebSocketTelemetryBeforeRecord = (
  record: WebSocketTelemetryRecord,
) => WebSocketTelemetryRecord | null;

// -- Trace options / connection context --

export type WebSocketTelemetryTraceOptions = {
  extractTraceParent: boolean;
  generateConnectionTrace: boolean;
  propagateMessageTrace: boolean;
  recordConnectionLifetimeSpan: boolean;
};

export type WebSocketTelemetryConnectionContext = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
};

export interface TelemetryContextProvider {
  getTelemetryContext(): WebSocketTelemetryConnectionContext;
}

// -- Options schema --

export type WebSocketTelemetryEventSamplingOptions = {
  defaultRate?: number;
  rateByEvent?: Record<string, number>;
  maxRecordsPerSecond?: number;
  alwaysRecordLevels?: Array<"warn" | "error">;
};

export type WebSocketTelemetryMetricSamplingOptions = {
  maxRecordsPerSecond?: number;
};

export type WebSocketTelemetrySpanSamplingOptions = {
  defaultRate?: number;
  maxRecordsPerSecond?: number;
};

export type WebSocketTelemetryDefaultsOptions = {
  redactor?: WebSocketTelemetryRedactor;
  beforeRecord?: WebSocketTelemetryBeforeRecord;
  maxRecords?: number;
  maxBytes?: number;
  maxRecordsPerSecond?: number;
};

export type WebSocketTelemetryEventsOptions = {
  sinks?: WebSocketTelemetryEventSink[];
  store?: WebSocketTelemetryEventStore;
  maxRecords?: number;
  maxBytes?: number;
  maxInFlightEmits?: number;
  redactor?: WebSocketTelemetryEventRedactor | null;
  beforeRecord?: WebSocketTelemetryEventBeforeRecord | null;
  sampling?: WebSocketTelemetryEventSamplingOptions;
  capturePayload?: false | "preview";
  maxPayloadPreviewBytes?: number;
};

export type WebSocketTelemetryMetricsOptions = {
  sinks?: WebSocketTelemetryMetricSink[];
  store?: WebSocketTelemetryMetricStore;
  maxRecords?: number;
  maxBytes?: number;
  maxInFlightEmits?: number;
  redactor?: WebSocketTelemetryMetricRedactor | null;
  beforeRecord?: WebSocketTelemetryMetricBeforeRecord | null;
  sampling?: WebSocketTelemetryMetricSamplingOptions;
  collectionEnabled?: boolean;
  sampleIntervalMs?: number;
};

export type WebSocketTelemetrySpansOptions = {
  sinks?: WebSocketTelemetrySpanSink[];
  store?: WebSocketTelemetrySpanStore;
  maxRecords?: number;
  maxBytes?: number;
  maxInFlightEmits?: number;
  redactor?: WebSocketTelemetrySpanRedactor | null;
  beforeRecord?: WebSocketTelemetrySpanBeforeRecord | null;
  sampling?: WebSocketTelemetrySpanSamplingOptions;
};

export type WebSocketTelemetryOptions = {
  enabled?: boolean;
  controller?: WebSocketTelemetryController;
  defaults?: WebSocketTelemetryDefaultsOptions;
  events?: WebSocketTelemetryEventsOptions;
  metrics?: WebSocketTelemetryMetricsOptions;
  spans?: WebSocketTelemetrySpansOptions;
  trace?: Partial<WebSocketTelemetryTraceOptions>;
  shutdownTimeoutMs?: number;
};

// -- Controller interface --

export interface WebSocketTelemetryController {
  emit(input: WebSocketTelemetryEventInput): void;
  recordMetric(input: WebSocketMetricInput): void;
  recordSpan(input: WebSocketSpanInput): void;
  getMetricsSnapshot(): WebSocketTelemetryMetricsSnapshot;
  getEventStore(): WebSocketTelemetryEventStore | undefined;
  getMetricStore(): WebSocketTelemetryMetricStore | undefined;
  getSpanStore(): WebSocketTelemetrySpanStore | undefined;
  registerMetricSource(source: WebSocketTelemetryMetricSource): () => void;
  createConnectionContext(request?: {
    headers?: Readonly<Record<string, string | string[] | undefined>>;
  }): WebSocketTelemetryConnectionContext;
  getTraceOptions(): WebSocketTelemetryTraceOptions;
  shutdown(options?: { timeoutMs?: number }): Promise<void>;
}

// -- Constants and shared helpers (preserved-behavior) --

export const EMPTY_METRICS_SNAPSHOT: WebSocketTelemetryMetricsSnapshot = {
  timestamp: 0,
  activeConnections: 0,
  activeConnectionsByNamespace: {},
  roomCount: 0,
  pendingInboundMessages: 0,
  pendingOutboundMessages: 0,
  socketBufferedBytes: 0,
  pendingFanOutJobs: 0,
  pendingFanOutTargets: 0,
  telemetryDroppedRecords: 0,
  telemetrySinkFailures: 0,
};

export const DEFAULT_TRACE_OPTIONS: WebSocketTelemetryTraceOptions = {
  extractTraceParent: true,
  generateConnectionTrace: true,
  propagateMessageTrace: true,
  recordConnectionLifetimeSpan: false,
};

const DEFAULT_MAX_RECORDS_PER_SECOND = 10_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000;
const DEFAULT_EVENT_SAMPLING_DEFAULT_RATE = 1.0;
const DEFAULT_EVENT_ALWAYS_RECORD_LEVELS: ReadonlyArray<"warn" | "error"> = ["warn", "error"];
const DEFAULT_EVENT_CAPTURE_PAYLOAD: false | "preview" = false;
const DEFAULT_EVENT_MAX_PAYLOAD_PREVIEW_BYTES = 1024;
const DEFAULT_METRIC_COLLECTION_ENABLED = true;
const DEFAULT_METRIC_SAMPLE_INTERVAL_MS = 10_000;
const DEFAULT_SPAN_SAMPLING_DEFAULT_RATE = 1.0;
const DEFAULT_MAX_IN_FLIGHT_EMITS_PER_SINK = 100;

const SENSITIVE_KEY_PATTERNS = [
  "authorization",
  "cookie",
  "token",
  "password",
  "secret",
  "apikey",
  "session",
  "email",
] as const;
const REDACTED_VALUE = "[redacted]";

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function redactValue(value: WebSocketTelemetryValue, key?: string): WebSocketTelemetryValue {
  if (key !== undefined && isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && isObjectValue(value)) {
    const redacted: WebSocketTelemetryAttributes = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      redacted[childKey] = redactValue(childValue, childKey);
    }
    return redacted;
  }

  return value;
}

/**
 * defaultSensitiveKeyRedact — sensitive key 패턴 기반 built-in redactor.
 * pipeline emit flow의 첫 단계에서 항상 적용된다.
 */
function defaultSensitiveKeyRedact(record: WebSocketTelemetryRecord): WebSocketTelemetryRecord {
  if (record.type === "event") {
    // SAFETY: redactor는 이벤트 레코드의 키 구조를 유지하고 값만 마스킹한다.
    return {
      ...record,
      attributes: record.attributes
        ? (redactValue(record.attributes) as WebSocketTelemetryEventRecord["attributes"])
        : undefined,
      detail: record.detail
        ? (redactValue(record.detail) as WebSocketTelemetryEventRecord["detail"])
        : undefined,
      payloadPreview: record.payloadPreview,
    };
  }

  if (record.type === "metric") {
    // SAFETY: redactor는 메트릭 레코드의 키 구조를 유지하고 값만 마스킹한다.
    return {
      ...record,
      tags: record.tags
        ? (redactValue(record.tags) as WebSocketTelemetryMetricRecord["tags"])
        : undefined,
      snapshot: record.snapshot ? { ...record.snapshot } : undefined,
    };
  }

  // SAFETY: redactor는 span과 하위 이벤트·링크의 키 구조를 유지하고 값만 마스킹한다.
  return {
    ...record,
    attributes: record.attributes
      ? (redactValue(record.attributes) as WebSocketTelemetrySpanRecord["attributes"])
      : undefined,
    events: record.events?.map((event) => ({
      ...event,
      attributes: event.attributes
        ? (redactValue(event.attributes) as WebSocketTelemetryAttributes)
        : undefined,
    })),
    links: record.links?.map((link) => ({
      ...link,
      attributes: link.attributes
        ? (redactValue(link.attributes) as WebSocketTelemetryAttributes)
        : undefined,
    })),
  };
}

function truncatePayloadPreview(payload: WebSocketTelemetryValue, maxBytes: number): string {
  try {
    const serialized = JSON.stringify(redactValue(payload));
    if (Buffer.byteLength(serialized, "utf-8") <= maxBytes) {
      return serialized;
    }
    return truncateUtf8String(serialized, maxBytes);
  } catch {
    return "[unserializable]";
  }
}

function truncateUtf8String(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";

  const suffix = maxBytes >= 3 ? "..." : "";
  const contentBudget = maxBytes - Buffer.byteLength(suffix, "utf-8");
  let result = "";
  let usedBytes = 0;

  for (const char of value) {
    const charBytes = Buffer.byteLength(char, "utf-8");
    if (usedBytes + charBytes > contentBudget) break;
    result += char;
    usedBytes += charBytes;
  }

  return result + suffix;
}

export function isPromiseLike<Value>(value: Value): value is Value & Promise<void> {
  return isObjectValue(value) && value !== null && "then" in value && "catch" in value;
}

// -- TokenBucket (unchanged) --

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// -- NoopWebSocketTelemetryController (preserved-behavior) --

const noopUnsubscribe = (): void => {};

export class NoopWebSocketTelemetryController implements WebSocketTelemetryController {
  emit(_input: WebSocketTelemetryEventInput): void {
    // noop
  }

  recordMetric(_input: WebSocketMetricInput): void {
    // noop
  }

  recordSpan(_input: WebSocketSpanInput): void {
    // noop
  }

  getMetricsSnapshot(): WebSocketTelemetryMetricsSnapshot {
    return { ...EMPTY_METRICS_SNAPSHOT, timestamp: Date.now() };
  }

  getEventStore(): WebSocketTelemetryEventStore | undefined {
    return undefined;
  }

  getMetricStore(): WebSocketTelemetryMetricStore | undefined {
    return undefined;
  }

  getSpanStore(): WebSocketTelemetrySpanStore | undefined {
    return undefined;
  }

  registerMetricSource(_source: WebSocketTelemetryMetricSource): () => void {
    return noopUnsubscribe;
  }

  createConnectionContext(_request?: {
    headers?: Readonly<Record<string, string | string[] | undefined>>;
  }): WebSocketTelemetryConnectionContext {
    return {};
  }

  getTraceOptions(): WebSocketTelemetryTraceOptions {
    return { ...DEFAULT_TRACE_OPTIONS };
  }

  shutdown(_options?: { timeoutMs?: number }): Promise<void> {
    return Promise.resolve();
  }
}

// -- Resolved per-pipeline option types (internal) --

type RuntimeMetadata = {
  runtimeId: string;
  nodeId: string;
};

type ResolvedEventPipelineOptions = {
  sinks: WebSocketTelemetryEventSink[];
  store: WebSocketTelemetryEventStore | undefined;
  maxRecordsPerSecond: number;
  maxInFlightEmits: number;
  sharedRedactor: WebSocketTelemetryRedactor | undefined;
  signalRedactor: WebSocketTelemetryEventRedactor | undefined;
  sharedBeforeRecord: WebSocketTelemetryBeforeRecord | undefined;
  signalBeforeRecord: WebSocketTelemetryEventBeforeRecord | undefined;
  sampling: {
    defaultRate: number;
    rateByEvent: Record<string, number>;
    alwaysRecordLevels: Array<"warn" | "error">;
  };
  capturePayload: false | "preview";
  maxPayloadPreviewBytes: number;
};

type ResolvedMetricPipelineOptions = {
  sinks: WebSocketTelemetryMetricSink[];
  store: WebSocketTelemetryMetricStore | undefined;
  maxRecordsPerSecond: number;
  maxInFlightEmits: number;
  sharedRedactor: WebSocketTelemetryRedactor | undefined;
  signalRedactor: WebSocketTelemetryMetricRedactor | undefined;
  sharedBeforeRecord: WebSocketTelemetryBeforeRecord | undefined;
  signalBeforeRecord: WebSocketTelemetryMetricBeforeRecord | undefined;
  collectionEnabled: boolean;
  sampleIntervalMs: number;
};

type ResolvedSpanPipelineOptions = {
  sinks: WebSocketTelemetrySpanSink[];
  store: WebSocketTelemetrySpanStore | undefined;
  maxRecordsPerSecond: number;
  maxInFlightEmits: number;
  sharedRedactor: WebSocketTelemetryRedactor | undefined;
  signalRedactor: WebSocketTelemetrySpanRedactor | undefined;
  sharedBeforeRecord: WebSocketTelemetryBeforeRecord | undefined;
  signalBeforeRecord: WebSocketTelemetrySpanBeforeRecord | undefined;
  sampling: {
    defaultRate: number;
  };
};

// -- Internal event reporter type --
// EventPipeline 자신과 controller가 내부 진단 이벤트를 발행할 때 사용한다.
// type-mismatch / shutdown.timeout / sink.failed 등을 events pipeline 경로로 보낸다.
type InternalEventReporter = (
  name: string,
  level: WebSocketTelemetryEventRecord["level"],
  detail?: WebSocketTelemetryAttributes,
) => void;

// -- TelemetryPipeline (abstract) --

abstract class TelemetryPipeline<
  TRecord extends WebSocketTelemetryRecord,
  TInput,
  TSink extends {
    emit(record: TRecord): void | Promise<void>;
    shutdown?(options?: { timeoutMs?: number }): void | Promise<void>;
  },
  TStore extends { readonly sink: TSink; clear(): void } | undefined,
> {
  abstract readonly signal: "event" | "metric" | "span";
  protected readonly sinks: TSink[];
  protected readonly telemetryStore: TStore;
  protected readonly tokenBucket: TokenBucket;
  protected readonly maxInFlightEmits: number;
  protected readonly runtimeMetadata: RuntimeMetadata;
  protected readonly sharedRedactor: WebSocketTelemetryRedactor | undefined;
  protected readonly sharedBeforeRecord: WebSocketTelemetryBeforeRecord | undefined;
  protected internalEventReporter: InternalEventReporter | undefined;
  private readonly inFlightEmits = new WeakMap<TSink, number>();
  droppedCount = 0;
  sinkFailureCount = 0;
  shutdownCalled = false;

  protected constructor(
    sinks: TSink[],
    store: TStore,
    maxRecordsPerSecond: number,
    maxInFlightEmits: number,
    sharedRedactor: WebSocketTelemetryRedactor | undefined,
    sharedBeforeRecord: WebSocketTelemetryBeforeRecord | undefined,
    runtimeMetadata: RuntimeMetadata,
  ) {
    this.sinks = sinks;
    this.telemetryStore = store;
    this.tokenBucket = new TokenBucket(maxRecordsPerSecond, maxRecordsPerSecond);
    this.maxInFlightEmits = maxInFlightEmits;
    this.sharedRedactor = sharedRedactor;
    this.sharedBeforeRecord = sharedBeforeRecord;
    this.runtimeMetadata = runtimeMetadata;
  }

  get store(): TStore {
    return this.telemetryStore;
  }

  setInternalEventReporter(reporter: InternalEventReporter): void {
    this.internalEventReporter = reporter;
  }

  abstract emit(input: TInput): void;

  protected abstract buildRecord(input: TInput): TRecord;

  protected abstract shouldBypassRateLimit(record: TRecord): boolean;

  protected abstract isCriticalRecord(record: TRecord): boolean;

  protected abstract getSignalRedactor(): ((record: TRecord) => TRecord | null) | undefined;

  protected abstract getSignalBeforeRecord(): ((record: TRecord) => TRecord | null) | undefined;

  // 공통 emit 흐름. 모든 신호별 pipeline의 emit이 이 메서드로 위임한다.
  protected emitInternal(input: TInput): void {
    if (this.shutdownCalled) return;

    let record: TRecord;
    try {
      record = this.buildRecord(input);
    } catch {
      this.droppedCount += 1;
      return;
    }

    const skipRateLimit = this.shouldBypassRateLimit(record);
    if (!skipRateLimit && !this.tokenBucket.tryConsume()) {
      this.droppedCount += 1;
      return;
    }

    // step 1: defaultSensitiveKeyRedact 항상 적용
    let prepared: TRecord;
    try {
      const afterDefault = defaultSensitiveKeyRedact(record);
      if (afterDefault.type !== record.type) {
        // 방어 로직 — 본 구현에서는 발생하지 않지만 type-narrow를 위해 검증
        this.droppedCount += 1;
        return;
      }
      prepared =
        /* SAFETY: 등록된 WebSocket 이벤트 스키마가 이 값의 타입을 보장한다. */ afterDefault as TRecord;
    } catch {
      this.droppedCount += 1;
      return;
    }

    // step 2: sharedRedactor (이미 buildController에서 signalRedactor===null이면 sharedRedactor=undefined로 덮어쓴 상태)
    if (this.sharedRedactor !== undefined) {
      const sharedRedactor = this.sharedRedactor;
      const result = this.applyTransform(prepared, (r) => sharedRedactor(r), "shared", "redactor");
      if (result === null) return;
      prepared = result;
    }

    // step 3: signalRedactor
    const signalRedactor = this.getSignalRedactor();
    if (signalRedactor !== undefined) {
      const result = this.applyTransform(prepared, (r) => signalRedactor(r), "signal", "redactor");
      if (result === null) return;
      prepared = result;
    }

    // step 4: sharedBeforeRecord
    if (this.sharedBeforeRecord !== undefined) {
      const sharedBeforeRecord = this.sharedBeforeRecord;
      const result = this.applyTransform(
        prepared,
        (r) => sharedBeforeRecord(r),
        "shared",
        "beforeRecord",
      );
      if (result === null) return;
      prepared = result;
    }

    // step 5: signalBeforeRecord
    const signalBeforeRecord = this.getSignalBeforeRecord();
    if (signalBeforeRecord !== undefined) {
      const result = this.applyTransform(
        prepared,
        (r) => signalBeforeRecord(r),
        "signal",
        "beforeRecord",
      );
      if (result === null) return;
      prepared = result;
    }

    this.dispatchToSinks(prepared);
  }

  // redactor 또는 beforeRecord 1회 적용. 반환값이 null이면 drop, type 불일치면 drop + internal event.
  // shared 변환은 wider record를 받아 wider record를 반환하지만, signal 변환은 narrowed TRecord끼리 변환한다.
  // 양쪽 모두 동일한 type-mismatch defensive 검사를 거친다.
  private applyTransform(
    record: TRecord,
    runner: (record: TRecord) => WebSocketTelemetryRecord | null,
    source: "shared" | "signal",
    kind: "redactor" | "beforeRecord",
  ): TRecord | null {
    let result: WebSocketTelemetryRecord | null;
    try {
      result = runner(record);
    } catch {
      this.droppedCount += 1;
      return null;
    }

    if (result === null) {
      this.droppedCount += 1;
      return null;
    }

    if (result.type !== record.type) {
      this.droppedCount += 1;
      const eventName =
        kind === "redactor"
          ? "ws.telemetry.redactor.type_mismatch"
          : "ws.telemetry.beforeRecord.type_mismatch";
      this.dispatchInternalEvent(eventName, "warn", {
        expected: record.type,
        actual: result.type,
        source,
      });
      return null;
    }

    // result.type === record.type === TRecord["type"]이므로 narrowed TRecord로 안전하게 좁힐 수 있다.
    return /* SAFETY: 등록된 WebSocket 이벤트 스키마가 이 값의 타입을 보장한다. */ result as TRecord;
  }

  protected dispatchToSinks(record: TRecord, selfObserveFailures = true): void {
    const critical = this.isCriticalRecord(record);
    let droppedForRecord = false;

    for (const sink of this.sinks) {
      const inFlight = this.inFlightEmits.get(sink) ?? 0;
      if (!critical && inFlight >= this.maxInFlightEmits) {
        if (!droppedForRecord) {
          this.droppedCount += 1;
          droppedForRecord = true;
        }
        continue;
      }

      try {
        const result = sink.emit(record);
        if (isPromiseLike(result)) {
          this.inFlightEmits.set(sink, inFlight + 1);
          result.then(
            () => {
              this.decrementInFlightEmit(sink);
            },
            (cause: unknown) => {
              this.decrementInFlightEmit(sink);
              this.observeSinkFailure("emit", cause, selfObserveFailures);
            },
          );
        }
      } catch (error) {
        this.observeSinkFailure("emit", error, selfObserveFailures);
      }
    }
  }

  private decrementInFlightEmit(sink: TSink): void {
    const current = this.inFlightEmits.get(sink) ?? 0;
    if (current <= 1) {
      this.inFlightEmits.delete(sink);
      return;
    }
    this.inFlightEmits.set(sink, current - 1);
  }

  private observeSinkFailure<Value>(
    phase: "emit" | "shutdown",
    error: Value,
    selfObserveFailure: boolean,
  ): void {
    this.sinkFailureCount += 1;
    if (!selfObserveFailure) return;
    this.dispatchInternalEvent("ws.telemetry.sink.failed", "warn", {
      phase,
      signal: this.signal,
      errorType: error instanceof Error ? error.name : runtimeTypeOf(error),
    });
  }

  protected dispatchInternalEvent(
    name: string,
    level: WebSocketTelemetryEventRecord["level"],
    detail?: WebSocketTelemetryAttributes,
  ): void {
    if (this.internalEventReporter === undefined) return;
    try {
      this.internalEventReporter(name, level, detail);
    } catch {
      // 진단 이벤트 자체가 실패하면 swallow
    }
  }

  async shutdown(timeoutMs: number): Promise<void> {
    if (this.shutdownCalled) return;
    this.shutdownCalled = true;

    const sinkShutdowns = this.sinks.map((sink) => this.shutdownSink(sink, timeoutMs));
    if (sinkShutdowns.length > 0) {
      await Promise.allSettled(sinkShutdowns);
    }
  }

  private async shutdownSink(sink: TSink, timeoutMs: number): Promise<void> {
    if (!sink.shutdown) return;

    try {
      const result = sink.shutdown({ timeoutMs });
      if (!isPromiseLike(result)) return;

      let timeout: ReturnType<typeof setTimeout> | null = null;
      const shutdownPromise = result.then(
        () => "completed" as const,
        (cause: unknown) => {
          throw cause;
        },
      );
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => {
          resolve("timeout");
        }, timeoutMs);
      });

      const outcome = await Promise.race([shutdownPromise, timeoutPromise]);
      if (timeout) {
        clearTimeout(timeout);
      }

      if (outcome === "timeout") {
        shutdownPromise.catch(() => {});
        this.sinkFailureCount += 1;
        this.dispatchInternalEvent("ws.telemetry.shutdown.timeout", "warn", {
          timeoutMs,
          signal: this.signal,
        });
      }
    } catch (error) {
      this.observeSinkFailure("shutdown", error, true);
    }
  }
}

// -- EventPipeline --

class EventPipeline extends TelemetryPipeline<
  WebSocketTelemetryEventRecord,
  WebSocketTelemetryEventInput,
  WebSocketTelemetryEventSink,
  WebSocketTelemetryEventStore | undefined
> {
  readonly signal = "event" as const;
  protected readonly signalRedactor: WebSocketTelemetryEventRedactor | undefined;
  protected readonly signalBeforeRecord: WebSocketTelemetryEventBeforeRecord | undefined;
  protected readonly sampling: {
    defaultRate: number;
    rateByEvent: Record<string, number>;
    alwaysRecordLevels: Array<"warn" | "error">;
  };
  protected readonly capturePayload: false | "preview";
  protected readonly maxPayloadPreviewBytes: number;
  // alwaysRecord level 경로에서 prepareRecord(skipRateLimit=true) 의미를 보존하기 위한 플래그.
  private currentEmitAlwaysRecord = false;

  constructor(options: ResolvedEventPipelineOptions, runtimeMetadata: RuntimeMetadata) {
    super(
      options.sinks,
      options.store,
      options.maxRecordsPerSecond,
      options.maxInFlightEmits,
      options.sharedRedactor,
      options.sharedBeforeRecord,
      runtimeMetadata,
    );
    this.signalRedactor = options.signalRedactor;
    this.signalBeforeRecord = options.signalBeforeRecord;
    this.sampling = options.sampling;
    this.capturePayload = options.capturePayload;
    this.maxPayloadPreviewBytes = options.maxPayloadPreviewBytes;
  }

  emit(input: WebSocketTelemetryEventInput): void {
    try {
      if (this.shutdownCalled) return;

      // sampling: alwaysRecordLevels 우선
      const levels: ReadonlyArray<string> = this.sampling.alwaysRecordLevels;
      const alwaysRecord = levels.includes(input.level);

      if (!alwaysRecord) {
        const rate = this.sampling.rateByEvent[input.name] ?? this.sampling.defaultRate;
        if (rate <= 0) {
          this.droppedCount += 1;
          return;
        }
        if (rate < 1 && Math.random() >= rate) {
          this.droppedCount += 1;
          return;
        }
      }

      this.currentEmitAlwaysRecord = alwaysRecord;
      try {
        this.emitInternal(input);
      } finally {
        this.currentEmitAlwaysRecord = false;
      }
    } catch {
      // pipeline emit 또한 throw-free 정책
    }
  }

  // 내부 진단 이벤트 — sampling/rate-limit 우회. shutdown 중에도 발행해 timeout/실패 진단이 유실되지 않도록 한다.
  // 사용자 redactor의 type-mismatch 위험을 피하기 위해 default redactor만 적용한다.
  dispatchInternalDiagnosticEvent(
    name: string,
    level: WebSocketTelemetryEventRecord["level"],
    detail?: WebSocketTelemetryAttributes,
  ): void {
    const record: WebSocketTelemetryEventRecord = {
      type: "event",
      timestamp: Date.now(),
      monotonicTime: performance.now(),
      runtimeId: this.runtimeMetadata.runtimeId,
      nodeId: this.runtimeMetadata.nodeId,
      name,
      level,
      detail,
    };

    // 진단 이벤트는 항상 default redactor만 적용해 sink에 직접 전달한다.
    // (사용자 redactor가 진단 이벤트의 type을 잘못 바꿔 무한 루프를 일으키는 일을 막는다.)
    try {
      const sanitized = defaultSensitiveKeyRedact(record);
      if (sanitized.type !== "event") return;
      this.dispatchToSinks(sanitized, false);
    } catch {
      // swallow
    }
  }

  protected buildRecord(input: WebSocketTelemetryEventInput): WebSocketTelemetryEventRecord {
    let record: WebSocketTelemetryEventRecord = {
      type: "event",
      timestamp: Date.now(),
      monotonicTime: performance.now(),
      runtimeId: this.runtimeMetadata.runtimeId,
      nodeId: this.runtimeMetadata.nodeId,
      name: input.name,
      level: input.level,
      namespace: input.namespace,
      connectionId: input.connectionId,
      userId: input.userId,
      attributes: input.attributes,
      detail: input.detail,
      traceId: input.traceId,
      spanId: input.spanId,
      parentSpanId: input.parentSpanId,
      sampled: input.sampled,
    };

    if (this.capturePayload === "preview" && input.payload !== undefined) {
      record = {
        ...record,
        payloadPreview: truncatePayloadPreview(input.payload, this.maxPayloadPreviewBytes),
      };
    }

    return record;
  }

  protected shouldBypassRateLimit(_record: WebSocketTelemetryEventRecord): boolean {
    // alwaysRecordLevels에 해당하는 record는 sampling을 거치지 않고 들어왔으며,
    // 기존 controller 동작을 보존하기 위해 token bucket도 skip한다.
    return this.currentEmitAlwaysRecord;
  }

  protected isCriticalRecord(record: WebSocketTelemetryEventRecord): boolean {
    return record.level === "warn" || record.level === "error";
  }

  protected getSignalRedactor():
    | ((record: WebSocketTelemetryEventRecord) => WebSocketTelemetryEventRecord | null)
    | undefined {
    return this.signalRedactor;
  }

  protected getSignalBeforeRecord():
    | ((record: WebSocketTelemetryEventRecord) => WebSocketTelemetryEventRecord | null)
    | undefined {
    return this.signalBeforeRecord;
  }
}

// -- MetricPipeline --

class MetricPipeline extends TelemetryPipeline<
  WebSocketTelemetryMetricRecord,
  WebSocketMetricInput,
  WebSocketTelemetryMetricSink,
  WebSocketTelemetryMetricStore | undefined
> {
  readonly signal = "metric" as const;
  protected readonly signalRedactor: WebSocketTelemetryMetricRedactor | undefined;
  protected readonly signalBeforeRecord: WebSocketTelemetryMetricBeforeRecord | undefined;
  protected readonly metricSources: Set<WebSocketTelemetryMetricSource> = new Set();
  protected readonly collectionEnabled: boolean;
  protected readonly sampleIntervalMs: number;
  protected collectionInterval: ReturnType<typeof setInterval> | null = null;
  protected snapshotProvider: (() => WebSocketTelemetryMetricsSnapshot) | undefined;

  constructor(options: ResolvedMetricPipelineOptions, runtimeMetadata: RuntimeMetadata) {
    super(
      options.sinks,
      options.store,
      options.maxRecordsPerSecond,
      options.maxInFlightEmits,
      options.sharedRedactor,
      options.sharedBeforeRecord,
      runtimeMetadata,
    );
    this.signalRedactor = options.signalRedactor;
    this.signalBeforeRecord = options.signalBeforeRecord;
    this.collectionEnabled = options.collectionEnabled;
    this.sampleIntervalMs = options.sampleIntervalMs;

    if (this.collectionEnabled && this.sampleIntervalMs > 0) {
      this.collectionInterval = setInterval(() => {
        this.collectAndEmit();
      }, this.sampleIntervalMs);

      if (
        this.collectionInterval &&
        isObjectValue(this.collectionInterval) &&
        "unref" in this.collectionInterval
      ) {
        this.collectionInterval.unref();
      }
    }
  }

  emit(input: WebSocketMetricInput): void {
    try {
      this.emitInternal(input);
    } catch {
      // pipeline emit throw-free 정책
    }
  }

  protected buildRecord(input: WebSocketMetricInput): WebSocketTelemetryMetricRecord {
    return {
      type: "metric",
      timestamp: Date.now(),
      monotonicTime: performance.now(),
      runtimeId: this.runtimeMetadata.runtimeId,
      nodeId: this.runtimeMetadata.nodeId,
      name: input.name,
      kind: input.kind,
      value: input.value,
      unit: input.unit,
      tags: input.tags,
      namespace: input.namespace,
      connectionId: input.connectionId,
      userId: input.userId,
      traceId: input.traceId,
      spanId: input.spanId,
      parentSpanId: input.parentSpanId,
      sampled: input.sampled,
      snapshot: input.snapshot,
    };
  }

  protected shouldBypassRateLimit(record: WebSocketTelemetryMetricRecord): boolean {
    const outcome = record.tags?.outcome;
    if (outcome === "failed" || outcome === "rejected" || outcome === "dropped") {
      return true;
    }

    return (
      record.name.endsWith(".failures") ||
      record.name.endsWith(".failure") ||
      record.name.endsWith(".dropped") ||
      record.name.includes(".failures.") ||
      record.name.includes(".dropped.")
    );
  }

  protected isCriticalRecord(record: WebSocketTelemetryMetricRecord): boolean {
    return this.shouldBypassRateLimit(record);
  }

  protected getSignalRedactor():
    | ((record: WebSocketTelemetryMetricRecord) => WebSocketTelemetryMetricRecord | null)
    | undefined {
    return this.signalRedactor;
  }

  protected getSignalBeforeRecord():
    | ((record: WebSocketTelemetryMetricRecord) => WebSocketTelemetryMetricRecord | null)
    | undefined {
    return this.signalBeforeRecord;
  }

  registerMetricSource(source: WebSocketTelemetryMetricSource): () => void {
    this.metricSources.add(source);
    return () => {
      this.metricSources.delete(source);
    };
  }

  setSnapshotProvider(provider: () => WebSocketTelemetryMetricsSnapshot): void {
    this.snapshotProvider = provider;
  }

  getSnapshot(): WebSocketTelemetryMetricsSnapshot {
    const now = Date.now();
    const base: WebSocketTelemetryMetricsSnapshot = {
      ...EMPTY_METRICS_SNAPSHOT,
      timestamp: now,
      activeConnectionsByNamespace: {},
      telemetryDroppedRecords: this.droppedCount,
      telemetrySinkFailures: this.sinkFailureCount,
    };

    for (const source of this.metricSources) {
      try {
        const partial = source.collect(now);
        base.activeConnections += partial.activeConnections ?? 0;
        base.roomCount += partial.roomCount ?? 0;
        base.pendingInboundMessages += partial.pendingInboundMessages ?? 0;
        base.pendingOutboundMessages += partial.pendingOutboundMessages ?? 0;
        base.socketBufferedBytes += partial.socketBufferedBytes ?? 0;
        base.pendingFanOutJobs += partial.pendingFanOutJobs ?? 0;
        base.pendingFanOutTargets += partial.pendingFanOutTargets ?? 0;
        if (partial.activeConnectionsByNamespace) {
          for (const [ns, count] of Object.entries(partial.activeConnectionsByNamespace)) {
            base.activeConnectionsByNamespace[ns] =
              (base.activeConnectionsByNamespace[ns] ?? 0) + count;
          }
        }
      } catch {
        // metric source 실패는 외부로 전파되어선 안 됨
      }
    }

    return base;
  }

  collectAndEmit(): void {
    try {
      if (this.shutdownCalled) return;
      const snapshot = this.snapshotProvider?.() ?? this.getSnapshot();
      const input: WebSocketMetricInput = {
        name: "ws.connections.active",
        kind: "gauge",
        value: snapshot.activeConnections,
        unit: "1",
        snapshot,
      };
      this.emit(input);
    } catch {
      // metrics 수집 실패는 외부로 전파되어선 안 됨
    }
  }

  override async shutdown(timeoutMs: number): Promise<void> {
    if (this.collectionInterval !== null) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    await super.shutdown(timeoutMs);
  }
}

// -- SpanPipeline --

class SpanPipeline extends TelemetryPipeline<
  WebSocketTelemetrySpanRecord,
  WebSocketSpanInput,
  WebSocketTelemetrySpanSink,
  WebSocketTelemetrySpanStore | undefined
> {
  readonly signal = "span" as const;
  protected readonly signalRedactor: WebSocketTelemetrySpanRedactor | undefined;
  protected readonly signalBeforeRecord: WebSocketTelemetrySpanBeforeRecord | undefined;
  protected readonly sampling: {
    defaultRate: number;
  };

  constructor(options: ResolvedSpanPipelineOptions, runtimeMetadata: RuntimeMetadata) {
    super(
      options.sinks,
      options.store,
      options.maxRecordsPerSecond,
      options.maxInFlightEmits,
      options.sharedRedactor,
      options.sharedBeforeRecord,
      runtimeMetadata,
    );
    this.signalRedactor = options.signalRedactor;
    this.signalBeforeRecord = options.signalBeforeRecord;
    this.sampling = { defaultRate: options.sampling.defaultRate };
  }

  emit(input: WebSocketSpanInput): void {
    try {
      if (this.shutdownCalled) return;

      // status === "error"는 sampling 우회
      if (input.status !== "error") {
        const rate = this.sampling.defaultRate;
        if (rate <= 0) {
          this.droppedCount += 1;
          return;
        }
        if (rate < 1 && Math.random() >= rate) {
          this.droppedCount += 1;
          return;
        }
      }

      this.emitInternal(input);
    } catch {
      // pipeline emit throw-free 정책
    }
  }

  protected buildRecord(input: WebSocketSpanInput): WebSocketTelemetrySpanRecord {
    return {
      type: "span",
      timestamp: Date.now(),
      monotonicTime: performance.now(),
      runtimeId: this.runtimeMetadata.runtimeId,
      nodeId: this.runtimeMetadata.nodeId,
      operationName: input.operationName,
      kind: input.kind,
      durationMs: input.durationMs,
      status: input.status,
      namespace: input.namespace,
      connectionId: input.connectionId,
      userId: input.userId,
      attributes: input.attributes,
      errorType: input.errorType,
      traceId: input.traceId,
      spanId: input.spanId,
      parentSpanId: input.parentSpanId,
      sampled: input.sampled,
      events: input.events,
      links: input.links,
    };
  }

  protected shouldBypassRateLimit(record: WebSocketTelemetrySpanRecord): boolean {
    return record.status === "error";
  }

  protected isCriticalRecord(record: WebSocketTelemetrySpanRecord): boolean {
    return record.status === "error";
  }

  protected getSignalRedactor():
    | ((record: WebSocketTelemetrySpanRecord) => WebSocketTelemetrySpanRecord | null)
    | undefined {
    return this.signalRedactor;
  }

  protected getSignalBeforeRecord():
    | ((record: WebSocketTelemetrySpanRecord) => WebSocketTelemetrySpanRecord | null)
    | undefined {
    return this.signalBeforeRecord;
  }
}

// -- WebSocketTelemetryControllerImpl --

export class WebSocketTelemetryControllerImpl implements WebSocketTelemetryController {
  protected readonly events: EventPipeline;
  protected readonly metrics: MetricPipeline;
  protected readonly spans: SpanPipeline;
  protected readonly runtimeId: string;
  protected readonly nodeId: string;
  protected readonly traceOptions: WebSocketTelemetryTraceOptions;
  protected readonly shutdownTimeoutMs: number;
  protected shutdownCalled = false;

  constructor(
    events: EventPipeline,
    metrics: MetricPipeline,
    spans: SpanPipeline,
    traceOptions: WebSocketTelemetryTraceOptions,
    runtimeMetadata: RuntimeMetadata,
    shutdownTimeoutMs: number,
  ) {
    this.events = events;
    this.metrics = metrics;
    this.spans = spans;
    this.traceOptions = traceOptions;
    this.runtimeId = runtimeMetadata.runtimeId;
    this.nodeId = runtimeMetadata.nodeId;
    this.shutdownTimeoutMs = shutdownTimeoutMs;

    // 모든 pipeline 진단 이벤트는 events pipeline 경로로 라우팅한다.
    const reporter: InternalEventReporter = (name, level, detail) => {
      this.events.dispatchInternalDiagnosticEvent(name, level, detail);
    };
    this.events.setInternalEventReporter(reporter);
    this.metrics.setInternalEventReporter(reporter);
    this.spans.setInternalEventReporter(reporter);
    this.metrics.setSnapshotProvider(() => this.getMetricsSnapshot());
  }

  emit(input: WebSocketTelemetryEventInput): void {
    try {
      if (this.shutdownCalled) return;
      this.events.emit(input);
    } catch {
      // controller throw-free
    }
  }

  recordMetric(input: WebSocketMetricInput): void {
    try {
      if (this.shutdownCalled) return;
      this.metrics.emit(input);
    } catch {
      // controller throw-free
    }
  }

  recordSpan(input: WebSocketSpanInput): void {
    try {
      if (this.shutdownCalled) return;
      this.spans.emit(input);
    } catch {
      // controller throw-free
    }
  }

  getMetricsSnapshot(): WebSocketTelemetryMetricsSnapshot {
    try {
      const base = this.metrics.getSnapshot();
      base.telemetryDroppedRecords =
        this.events.droppedCount + this.metrics.droppedCount + this.spans.droppedCount;
      base.telemetrySinkFailures =
        this.events.sinkFailureCount + this.metrics.sinkFailureCount + this.spans.sinkFailureCount;
      return base;
    } catch {
      return { ...EMPTY_METRICS_SNAPSHOT, timestamp: Date.now() };
    }
  }

  getEventStore(): WebSocketTelemetryEventStore | undefined {
    try {
      return this.events.store;
    } catch {
      return undefined;
    }
  }

  getMetricStore(): WebSocketTelemetryMetricStore | undefined {
    try {
      return this.metrics.store;
    } catch {
      return undefined;
    }
  }

  getSpanStore(): WebSocketTelemetrySpanStore | undefined {
    try {
      return this.spans.store;
    } catch {
      return undefined;
    }
  }

  registerMetricSource(source: WebSocketTelemetryMetricSource): () => void {
    try {
      return this.metrics.registerMetricSource(source);
    } catch {
      return noopUnsubscribe;
    }
  }

  createConnectionContext(request?: {
    headers?: Readonly<Record<string, string | string[] | undefined>>;
  }): WebSocketTelemetryConnectionContext {
    try {
      if (this.traceOptions.extractTraceParent && request?.headers) {
        const traceparentHeader = request.headers["traceparent"];
        const traceparentValue = Array.isArray(traceparentHeader)
          ? traceparentHeader[0]
          : traceparentHeader;
        if (traceparentValue) {
          const parsed = parseTraceParent(traceparentValue);
          if (parsed) {
            const context: WebSocketTelemetryConnectionContext = {
              traceId: parsed.traceId,
              parentSpanId: parsed.parentId,
              sampled: parsed.sampled,
            };
            if (this.traceOptions.generateConnectionTrace) {
              context.spanId = generateSpanId();
            }
            return { ...context };
          }
        }
      }

      if (!this.traceOptions.generateConnectionTrace) {
        return {};
      }

      return { traceId: generateTraceId(), spanId: generateSpanId() };
    } catch {
      return {};
    }
  }

  getTraceOptions(): WebSocketTelemetryTraceOptions {
    return { ...this.traceOptions };
  }

  async shutdown(options?: { timeoutMs?: number }): Promise<void> {
    if (this.shutdownCalled) return;
    this.shutdownCalled = true;

    const timeoutMs = options?.timeoutMs ?? this.shutdownTimeoutMs;
    try {
      await Promise.allSettled([
        this.events.shutdown(timeoutMs),
        this.metrics.shutdown(timeoutMs),
        this.spans.shutdown(timeoutMs),
      ]);
    } catch {
      // controller shutdown은 throw-free
    }
  }
}

// -- Factory --

function buildController(
  options: WebSocketTelemetryOptions,
  runtimeMetadata: RuntimeMetadata,
): WebSocketTelemetryController {
  const defaults = options.defaults ?? {};
  const eventsOpt = options.events ?? {};
  const metricsOpt = options.metrics ?? {};
  const spansOpt = options.spans ?? {};

  const defaultsMaxRecordsPerSecond =
    defaults.maxRecordsPerSecond ?? DEFAULT_MAX_RECORDS_PER_SECOND;

  // 신호별 redactor / beforeRecord 해석.
  // null이면 sharedRedactor를 undefined로 덮어써 step 2 자체를 skip한다.
  const eventsSharedRedactor = eventsOpt.redactor === null ? undefined : defaults.redactor;
  const eventsSignalRedactor = isFunctionValue(eventsOpt.redactor) ? eventsOpt.redactor : undefined;
  const eventsSharedBeforeRecord =
    eventsOpt.beforeRecord === null ? undefined : defaults.beforeRecord;
  const eventsSignalBeforeRecord = isFunctionValue(eventsOpt.beforeRecord)
    ? eventsOpt.beforeRecord
    : undefined;

  const metricsSharedRedactor = metricsOpt.redactor === null ? undefined : defaults.redactor;
  const metricsSignalRedactor = isFunctionValue(metricsOpt.redactor)
    ? metricsOpt.redactor
    : undefined;
  const metricsSharedBeforeRecord =
    metricsOpt.beforeRecord === null ? undefined : defaults.beforeRecord;
  const metricsSignalBeforeRecord = isFunctionValue(metricsOpt.beforeRecord)
    ? metricsOpt.beforeRecord
    : undefined;

  const spansSharedRedactor = spansOpt.redactor === null ? undefined : defaults.redactor;
  const spansSignalRedactor = isFunctionValue(spansOpt.redactor) ? spansOpt.redactor : undefined;
  const spansSharedBeforeRecord =
    spansOpt.beforeRecord === null ? undefined : defaults.beforeRecord;
  const spansSignalBeforeRecord = isFunctionValue(spansOpt.beforeRecord)
    ? spansOpt.beforeRecord
    : undefined;

  // events
  const eventSinks: WebSocketTelemetryEventSink[] = eventsOpt.sinks ? [...eventsOpt.sinks] : [];
  let eventStore: WebSocketTelemetryEventStore | undefined = eventsOpt.store;
  if (eventSinks.length === 0 && eventStore === undefined) {
    eventStore = new InMemoryEventStore({
      maxRecords: eventsOpt.maxRecords ?? defaults.maxRecords,
      maxBytes: eventsOpt.maxBytes ?? defaults.maxBytes,
    });
    eventSinks.push(eventStore.sink);
  } else if (eventStore !== undefined && !eventSinks.includes(eventStore.sink)) {
    eventSinks.push(eventStore.sink);
  }

  const eventsResolved: ResolvedEventPipelineOptions = {
    sinks: eventSinks,
    store: eventStore,
    maxRecordsPerSecond: eventsOpt.sampling?.maxRecordsPerSecond ?? defaultsMaxRecordsPerSecond,
    maxInFlightEmits: eventsOpt.maxInFlightEmits ?? DEFAULT_MAX_IN_FLIGHT_EMITS_PER_SINK,
    sharedRedactor: eventsSharedRedactor,
    signalRedactor: eventsSignalRedactor,
    sharedBeforeRecord: eventsSharedBeforeRecord,
    signalBeforeRecord: eventsSignalBeforeRecord,
    sampling: {
      defaultRate: eventsOpt.sampling?.defaultRate ?? DEFAULT_EVENT_SAMPLING_DEFAULT_RATE,
      rateByEvent: eventsOpt.sampling?.rateByEvent ?? {},
      alwaysRecordLevels: eventsOpt.sampling?.alwaysRecordLevels ?? [
        ...DEFAULT_EVENT_ALWAYS_RECORD_LEVELS,
      ],
    },
    capturePayload: eventsOpt.capturePayload ?? DEFAULT_EVENT_CAPTURE_PAYLOAD,
    maxPayloadPreviewBytes:
      eventsOpt.maxPayloadPreviewBytes ?? DEFAULT_EVENT_MAX_PAYLOAD_PREVIEW_BYTES,
  };

  // metrics
  const metricSinks: WebSocketTelemetryMetricSink[] = metricsOpt.sinks ? [...metricsOpt.sinks] : [];
  let metricStore: WebSocketTelemetryMetricStore | undefined = metricsOpt.store;
  if (metricSinks.length === 0 && metricStore === undefined) {
    metricStore = new InMemoryMetricStore({
      maxRecords: metricsOpt.maxRecords ?? defaults.maxRecords,
      maxBytes: metricsOpt.maxBytes ?? defaults.maxBytes,
    });
    metricSinks.push(metricStore.sink);
  } else if (metricStore !== undefined && !metricSinks.includes(metricStore.sink)) {
    metricSinks.push(metricStore.sink);
  }

  const metricsResolved: ResolvedMetricPipelineOptions = {
    sinks: metricSinks,
    store: metricStore,
    maxRecordsPerSecond: metricsOpt.sampling?.maxRecordsPerSecond ?? defaultsMaxRecordsPerSecond,
    maxInFlightEmits: metricsOpt.maxInFlightEmits ?? DEFAULT_MAX_IN_FLIGHT_EMITS_PER_SINK,
    sharedRedactor: metricsSharedRedactor,
    signalRedactor: metricsSignalRedactor,
    sharedBeforeRecord: metricsSharedBeforeRecord,
    signalBeforeRecord: metricsSignalBeforeRecord,
    collectionEnabled: metricsOpt.collectionEnabled ?? DEFAULT_METRIC_COLLECTION_ENABLED,
    sampleIntervalMs: metricsOpt.sampleIntervalMs ?? DEFAULT_METRIC_SAMPLE_INTERVAL_MS,
  };

  // spans
  const spanSinks: WebSocketTelemetrySpanSink[] = spansOpt.sinks ? [...spansOpt.sinks] : [];
  let spanStore: WebSocketTelemetrySpanStore | undefined = spansOpt.store;
  if (spanSinks.length === 0 && spanStore === undefined) {
    spanStore = new InMemorySpanStore({
      maxRecords: spansOpt.maxRecords ?? defaults.maxRecords,
      maxBytes: spansOpt.maxBytes ?? defaults.maxBytes,
    });
    spanSinks.push(spanStore.sink);
  } else if (spanStore !== undefined && !spanSinks.includes(spanStore.sink)) {
    spanSinks.push(spanStore.sink);
  }

  const spansResolved: ResolvedSpanPipelineOptions = {
    sinks: spanSinks,
    store: spanStore,
    maxRecordsPerSecond: spansOpt.sampling?.maxRecordsPerSecond ?? defaultsMaxRecordsPerSecond,
    maxInFlightEmits: spansOpt.maxInFlightEmits ?? DEFAULT_MAX_IN_FLIGHT_EMITS_PER_SINK,
    sharedRedactor: spansSharedRedactor,
    signalRedactor: spansSignalRedactor,
    sharedBeforeRecord: spansSharedBeforeRecord,
    signalBeforeRecord: spansSignalBeforeRecord,
    sampling: {
      defaultRate: spansOpt.sampling?.defaultRate ?? DEFAULT_SPAN_SAMPLING_DEFAULT_RATE,
    },
  };

  const eventPipeline = new EventPipeline(eventsResolved, runtimeMetadata);
  const metricPipeline = new MetricPipeline(metricsResolved, runtimeMetadata);
  const spanPipeline = new SpanPipeline(spansResolved, runtimeMetadata);

  const traceOptions: WebSocketTelemetryTraceOptions = {
    extractTraceParent:
      options.trace?.extractTraceParent ?? DEFAULT_TRACE_OPTIONS.extractTraceParent,
    generateConnectionTrace:
      options.trace?.generateConnectionTrace ?? DEFAULT_TRACE_OPTIONS.generateConnectionTrace,
    propagateMessageTrace:
      options.trace?.propagateMessageTrace ?? DEFAULT_TRACE_OPTIONS.propagateMessageTrace,
    recordConnectionLifetimeSpan:
      options.trace?.recordConnectionLifetimeSpan ??
      DEFAULT_TRACE_OPTIONS.recordConnectionLifetimeSpan,
  };

  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

  return new WebSocketTelemetryControllerImpl(
    eventPipeline,
    metricPipeline,
    spanPipeline,
    traceOptions,
    runtimeMetadata,
    shutdownTimeoutMs,
  );
}

function assertControllerOptionIsExclusive(options: WebSocketTelemetryOptions): void {
  const ignoredKeys = Object.entries(options)
    .filter(([key, value]) => key !== "enabled" && key !== "controller" && value !== undefined)
    .map(([key]) => key);

  if (ignoredKeys.length === 0) return;

  throw new Error(
    `WebSocket telemetry controller option cannot be combined with other telemetry options: ${ignoredKeys.join(
      ", ",
    )}`,
  );
}

export function createWebSocketTelemetryController(
  telemetryOption: boolean | WebSocketTelemetryOptions | undefined,
  runtimeMetadata: RuntimeMetadata,
): WebSocketTelemetryController {
  if (telemetryOption === undefined || telemetryOption === false) {
    return new NoopWebSocketTelemetryController();
  }

  if (telemetryOption === true) {
    return buildController({}, runtimeMetadata);
  }

  if (telemetryOption.enabled === false) {
    return new NoopWebSocketTelemetryController();
  }

  if (telemetryOption.controller) {
    assertControllerOptionIsExclusive(telemetryOption);
    return telemetryOption.controller;
  }

  return buildController(telemetryOption, runtimeMetadata);
}
