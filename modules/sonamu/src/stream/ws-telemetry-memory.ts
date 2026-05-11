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

type EstimateBytes<TRecord> = (record: TRecord) => number;

// 단일 FIFO ring buffer. critical/non-critical 우선순위는 두지 않는다 —
// 인메모리 store는 휘발성 디버깅 용도이므로 critical 보존이 필요하면
// 별도의 영속 sink를 등록해서 처리한다.
class InMemoryRingBuffer<TRecord extends { timestamp: number }> {
  private readonly slots: Array<TRecord | undefined>;
  private readonly slotBytes: number[];
  private readonly capacity: number;
  private readonly maxBytes: number;
  private readonly estimateBytes: EstimateBytes<TRecord>;
  private head = 0;
  private count = 0;
  private currentBytes = 0;

  constructor(options: InMemoryStoreOptions, estimateBytes: EstimateBytes<TRecord>) {
    this.capacity = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.estimateBytes = estimateBytes;
    this.slots = new Array(this.capacity);
    this.slotBytes = new Array(this.capacity).fill(0);
  }

  push(record: TRecord): void {
    if (this.capacity <= 0) return;

    const recordSize = this.estimateBytes(record);
    // 단일 record가 maxBytes를 넘으면 받아들이지 않는다.
    if (recordSize > this.maxBytes) return;

    if (this.count === this.capacity) {
      // 가장 오래된 슬롯을 덮어쓴다.
      this.currentBytes -= this.slotBytes[this.head];
      this.slots[this.head] = record;
      this.slotBytes[this.head] = recordSize;
      this.currentBytes += recordSize;
      this.head = (this.head + 1) % this.capacity;
    } else {
      const tail = (this.head + this.count) % this.capacity;
      this.slots[tail] = record;
      this.slotBytes[tail] = recordSize;
      this.currentBytes += recordSize;
      this.count += 1;
    }

    while (this.currentBytes > this.maxBytes && this.count > 1) {
      this.currentBytes -= this.slotBytes[this.head];
      this.slots[this.head] = undefined;
      this.slotBytes[this.head] = 0;
      this.head = (this.head + 1) % this.capacity;
      this.count -= 1;
    }
  }

  filter(predicate: (record: TRecord) => boolean, limit?: number): TRecord[] {
    const matched: TRecord[] = [];
    for (let i = 0; i < this.count; i++) {
      const record = this.slots[(this.head + i) % this.capacity];
      if (record !== undefined && predicate(record)) matched.push(record);
    }
    if (limit !== undefined && limit > 0 && matched.length > limit) {
      return matched.slice(-limit);
    }
    return matched;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = undefined;
      this.slotBytes[i] = 0;
    }
    this.head = 0;
    this.count = 0;
    this.currentBytes = 0;
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

function estimateMetricBytes(_record: WebSocketTelemetryMetricRecord): number {
  return 200;
}

function estimateSpanBytes(_record: WebSocketTelemetrySpanRecord): number {
  return 200;
}

export class InMemoryEventStore implements WebSocketTelemetryEventStore {
  readonly sink: WebSocketTelemetryEventSink;

  private readonly buffer: InMemoryRingBuffer<WebSocketTelemetryEventRecord>;

  constructor(options: InMemoryStoreOptions = {}) {
    this.buffer = new InMemoryRingBuffer<WebSocketTelemetryEventRecord>(
      options,
      estimateEventBytes,
    );

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
      if (filter.userId !== undefined && record.userId !== filter.userId) return false;
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
      if (filter.userId !== undefined && record.userId !== filter.userId) return false;
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
    this.buffer = new InMemoryRingBuffer<WebSocketTelemetrySpanRecord>(options, estimateSpanBytes);

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
      if (filter.userId !== undefined && record.userId !== filter.userId) return false;
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
