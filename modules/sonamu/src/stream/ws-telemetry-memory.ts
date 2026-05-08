import {
  type WebSocketTelemetryEventQueryFilter,
  type WebSocketTelemetryEventRecord,
  type WebSocketTelemetryEventSink,
  type WebSocketTelemetryEventStore,
  type WebSocketTelemetryMetricQueryFilter,
  type WebSocketTelemetryMetricRecord,
  type WebSocketTelemetryMetricSink,
  type WebSocketTelemetryMetricStore,
  type WebSocketTelemetrySpanQueryFilter,
  type WebSocketTelemetrySpanRecord,
  type WebSocketTelemetrySpanSink,
  type WebSocketTelemetrySpanStore,
} from "./ws-telemetry";

type InMemoryStoreOptions = {
  maxRecords?: number;
  maxBytes?: number;
};

const DEFAULT_MAX_RECORDS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB
const CRITICAL_LEVEL_MIN_RESERVE = 100; // warn/error/closed/rejected를 위해 예약하는 최소 record 수

type EstimateBytes<TRecord> = (record: TRecord) => number;
type IsCritical<TRecord> = (record: TRecord) => boolean;

/**
 * 3개의 신호별 InMemory store가 공유하는 ring buffer helper.
 * 외부로 export하지 않는다.
 */
class InMemoryRingBuffer<TRecord extends { timestamp: number }> {
  private readonly records: TRecord[] = [];
  private readonly maxRecords: number;
  private readonly maxBytes: number;
  private readonly estimateBytes: EstimateBytes<TRecord>;
  private readonly isCritical: IsCritical<TRecord>;
  private currentBytes = 0;

  constructor(
    options: InMemoryStoreOptions,
    estimateBytes: EstimateBytes<TRecord>,
    isCritical: IsCritical<TRecord>,
  ) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.estimateBytes = estimateBytes;
    this.isCritical = isCritical;
  }

  push(record: TRecord): void {
    const recordSize = this.estimateBytes(record);
    const incomingCritical = this.isCritical(record);

    // 용량을 초과하는 동안 evict 수행
    while (
      (this.records.length >= this.maxRecords || this.currentBytes + recordSize > this.maxBytes) &&
      this.records.length > 0
    ) {
      if (!this.evictOne(incomingCritical)) {
        return;
      }
    }

    this.records.push(record);
    this.currentBytes += recordSize;
  }

  filter(predicate: (record: TRecord) => boolean, limit?: number): TRecord[] {
    const matched: TRecord[] = [];
    for (const record of this.records) {
      if (predicate(record)) matched.push(record);
    }
    if (limit !== undefined && limit > 0 && matched.length > limit) {
      return matched.slice(-limit);
    }
    return matched;
  }

  clear(): void {
    this.records.length = 0;
    this.currentBytes = 0;
  }

  private evictOne(incomingCritical: boolean): boolean {
    const criticalCount = this.countCriticalRecords();
    const criticalReserve = Math.min(CRITICAL_LEVEL_MIN_RESERVE, this.maxRecords);

    // 우선 non-critical record부터 evict 시도
    for (let i = 0; i < this.records.length; i++) {
      if (!this.isCritical(this.records[i])) {
        const removed = this.records.splice(i, 1);
        this.currentBytes -= this.estimateBytes(removed[0]);
        return true;
      }
    }

    // 모든 record가 critical인 경우. 들어오는 record가 critical이라면 오래된 critical record를 대체할 수 있으나,
    // non-critical record는 진단용으로 예약된 최소량을 침범해서는 안 됨.
    if (incomingCritical || criticalCount > criticalReserve) {
      const removed = this.records.shift();
      if (removed) {
        this.currentBytes -= this.estimateBytes(removed);
      }
      return true;
    }

    return false;
  }

  private countCriticalRecords(): number {
    let count = 0;
    for (const record of this.records) {
      if (this.isCritical(record)) count += 1;
    }
    return count;
  }
}

function applyTimeWindow<TRecord extends { timestamp: number }>(
  record: TRecord,
  since: number | undefined,
  until: number | undefined,
): boolean {
  if (since !== undefined && record.timestamp < since) return false;
  if (until !== undefined && record.timestamp > until) return false;
  return true;
}

function estimateEventBytes(record: WebSocketTelemetryEventRecord): number {
  let size = 200;
  if (record.payloadPreview !== undefined) {
    try {
      size += Buffer.byteLength(JSON.stringify(record.payloadPreview), "utf-8");
    } catch {
      size += 100;
    }
  }
  if (record.detail) {
    try {
      size += Buffer.byteLength(JSON.stringify(record.detail), "utf-8");
    } catch {
      size += 100;
    }
  }
  return size;
}

function isEventCritical(record: WebSocketTelemetryEventRecord): boolean {
  if (record.level === "warn" || record.level === "error") return true;
  if (record.name.includes("closed") || record.name.includes("rejected")) return true;
  return false;
}

function estimateMetricBytes(_record: WebSocketTelemetryMetricRecord): number {
  return 200;
}

function isMetricCritical(_record: WebSocketTelemetryMetricRecord): boolean {
  return false;
}

function estimateSpanBytes(_record: WebSocketTelemetrySpanRecord): number {
  return 200;
}

function isSpanCritical(record: WebSocketTelemetrySpanRecord): boolean {
  return record.status === "error";
}

export class InMemoryEventStore implements WebSocketTelemetryEventStore {
  readonly sink: WebSocketTelemetryEventSink;

  private readonly buffer: InMemoryRingBuffer<WebSocketTelemetryEventRecord>;

  constructor(options: InMemoryStoreOptions = {}) {
    this.buffer = new InMemoryRingBuffer<WebSocketTelemetryEventRecord>(
      options,
      estimateEventBytes,
      isEventCritical,
    );

    // has-a 관계: store가 sink를 구현하는 것이 아니라 sink를 보유함
    this.sink = {
      emit: (record: WebSocketTelemetryEventRecord): void => {
        this.buffer.push(record);
      },
    };
  }

  query(filter: WebSocketTelemetryEventQueryFilter): WebSocketTelemetryEventRecord[] {
    return this.buffer.filter((record) => {
      if (filter.name !== undefined && record.name !== filter.name) return false;
      if (filter.level !== undefined && record.level !== filter.level) return false;
      if (filter.connectionId !== undefined && record.connectionId !== filter.connectionId)
        return false;
      if (filter.namespace !== undefined && record.namespace !== filter.namespace) return false;
      if (filter.traceId !== undefined && record.traceId !== filter.traceId) return false;
      if (!applyTimeWindow(record, filter.since, filter.until)) return false;
      return true;
    }, filter.limit);
  }

  clear(): void {
    this.buffer.clear();
  }
}

export class InMemoryMetricStore implements WebSocketTelemetryMetricStore {
  readonly sink: WebSocketTelemetryMetricSink;

  private readonly buffer: InMemoryRingBuffer<WebSocketTelemetryMetricRecord>;

  constructor(options: InMemoryStoreOptions = {}) {
    this.buffer = new InMemoryRingBuffer<WebSocketTelemetryMetricRecord>(
      options,
      estimateMetricBytes,
      isMetricCritical,
    );

    this.sink = {
      emit: (record: WebSocketTelemetryMetricRecord): void => {
        this.buffer.push(record);
      },
    };
  }

  query(filter: WebSocketTelemetryMetricQueryFilter): WebSocketTelemetryMetricRecord[] {
    return this.buffer.filter((record) => {
      if (filter.name !== undefined && record.name !== filter.name) return false;
      if (filter.kind !== undefined && record.kind !== filter.kind) return false;
      if (filter.connectionId !== undefined && record.connectionId !== filter.connectionId)
        return false;
      if (filter.namespace !== undefined && record.namespace !== filter.namespace) return false;
      if (filter.traceId !== undefined && record.traceId !== filter.traceId) return false;
      if (!applyTimeWindow(record, filter.since, filter.until)) return false;
      return true;
    }, filter.limit);
  }

  clear(): void {
    this.buffer.clear();
  }
}

export class InMemorySpanStore implements WebSocketTelemetrySpanStore {
  readonly sink: WebSocketTelemetrySpanSink;

  private readonly buffer: InMemoryRingBuffer<WebSocketTelemetrySpanRecord>;

  constructor(options: InMemoryStoreOptions = {}) {
    this.buffer = new InMemoryRingBuffer<WebSocketTelemetrySpanRecord>(
      options,
      estimateSpanBytes,
      isSpanCritical,
    );

    this.sink = {
      emit: (record: WebSocketTelemetrySpanRecord): void => {
        this.buffer.push(record);
      },
    };
  }

  query(filter: WebSocketTelemetrySpanQueryFilter): WebSocketTelemetrySpanRecord[] {
    return this.buffer.filter((record) => {
      if (filter.operationName !== undefined && record.operationName !== filter.operationName)
        return false;
      if (filter.kind !== undefined && record.kind !== filter.kind) return false;
      if (filter.status !== undefined && record.status !== filter.status) return false;
      if (filter.connectionId !== undefined && record.connectionId !== filter.connectionId)
        return false;
      if (filter.namespace !== undefined && record.namespace !== filter.namespace) return false;
      if (filter.traceId !== undefined && record.traceId !== filter.traceId) return false;
      if (!applyTimeWindow(record, filter.since, filter.until)) return false;
      return true;
    }, filter.limit);
  }

  clear(): void {
    this.buffer.clear();
  }
}
