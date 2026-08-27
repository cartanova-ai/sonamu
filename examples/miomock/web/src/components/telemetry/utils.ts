import { type TelemetryRecord } from "@/services/telemetry/telemetry.types";

export type EventRecord = Extract<TelemetryRecord, { type: "event" }>;
export type MetricRecord = Extract<TelemetryRecord, { type: "metric" }>;
export type SpanRecord = Extract<TelemetryRecord, { type: "span" }>;

export type EventLevel = EventRecord["level"];
export type MetricKind = MetricRecord["kind"];
export type SpanKind = SpanRecord["kind"];

export function isEventRecord(record: TelemetryRecord): record is EventRecord {
  return record.type === "event";
}
export function isMetricRecord(record: TelemetryRecord): record is MetricRecord {
  return record.type === "metric";
}
export function isSpanRecord(record: TelemetryRecord): record is SpanRecord {
  return record.type === "span";
}

export function getRecordName(record: TelemetryRecord): string {
  if (record.type === "span") return record.operationName;
  return record.name;
}

export function getRecordKey(record: TelemetryRecord): string {
  return [
    record.timestamp,
    record.monotonicTime ?? "",
    record.type,
    getRecordName(record),
    record.connectionId ?? "",
    record.spanId ?? "",
  ].join(":");
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTimestampWithMs(timestamp: number): string {
  const d = new Date(timestamp);
  const hms = d.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hms}.${ms}`;
}

export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1) return `${(durationMs * 1000).toFixed(0)}μs`;
  if (durationMs < 1_000) return `${durationMs.toFixed(2)}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(2)}s`;
  return `${(durationMs / 60_000).toFixed(2)}m`;
}

export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export const LEVEL_COLOR = {
  debug: "text-muted-foreground bg-muted/50 border-muted",
  info: "text-blue-700 bg-blue-50 border-blue-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  error: "text-rose-700 bg-rose-50 border-rose-200",
} satisfies Record<EventLevel, string>;

export const LEVEL_DOT = {
  debug: "bg-gray-400",
  info: "bg-blue-500",
  warn: "bg-amber-500",
  error: "bg-rose-500",
} satisfies Record<EventLevel, string>;

export const METRIC_KIND_COLOR = {
  counter: "text-emerald-700 bg-emerald-50 border-emerald-200",
  histogram: "text-violet-700 bg-violet-50 border-violet-200",
  gauge: "text-sky-700 bg-sky-50 border-sky-200",
} satisfies Record<MetricKind, string>;

export function uniqueByName<T extends { name?: string; operationName?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.name ?? item.operationName ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
