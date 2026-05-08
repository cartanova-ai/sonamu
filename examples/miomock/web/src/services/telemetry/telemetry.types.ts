/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { z } from "zod";

const TelemetryAttributes = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
const TelemetryJsonRecord = z.record(z.string(), z.unknown());

export const TelemetryMetricsSnapshot = z.object({
  timestamp: z.number(),
  activeConnections: z.number(),
  activeConnectionsByNamespace: z.record(z.string(), z.number()),
  roomCount: z.number(),
  pendingInboundMessages: z.number(),
  pendingOutboundMessages: z.number(),
  socketBufferedBytes: z.number(),
  pendingFanOutJobs: z.number(),
  pendingFanOutTargets: z.number(),
  telemetryDroppedRecords: z.number(),
  telemetrySinkFailures: z.number(),
});
export type TelemetryMetricsSnapshot = z.infer<typeof TelemetryMetricsSnapshot>;

export const TelemetryQueryParams = z.object({
  type: z.enum(["event", "metric", "span"]).optional(),
  name: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  connectionId: z.string().optional(),
  namespace: z.string().optional(),
  traceId: z.string().optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type TelemetryQueryParams = z.infer<typeof TelemetryQueryParams>;

export const TelemetryRecordBase = z.object({
  timestamp: z.number(),
  monotonicTime: z.number().optional(),
  runtimeId: z.string(),
  nodeId: z.string(),
  namespace: z.string().optional(),
  connectionId: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().optional(),
  sampled: z.boolean().optional(),
});

export const TelemetryEventRecord = TelemetryRecordBase.extend({
  type: z.literal("event"),
  name: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  attributes: TelemetryAttributes.optional(),
  detail: TelemetryJsonRecord.optional(),
  payloadPreview: z.string().optional(),
});

export const TelemetryMetricRecord = TelemetryRecordBase.extend({
  type: z.literal("metric"),
  name: z.string(),
  kind: z.enum(["counter", "histogram", "gauge"]),
  value: z.number(),
  unit: z.enum(["1", "ms", "By"]).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  snapshot: TelemetryMetricsSnapshot.optional(),
});

export const TelemetrySpanRecord = TelemetryRecordBase.extend({
  type: z.literal("span"),
  operationName: z.string(),
  kind: z.enum(["internal", "producer", "consumer", "server", "client"]),
  durationMs: z.number(),
  status: z.enum(["unset", "ok", "error"]),
  attributes: TelemetryAttributes.optional(),
  errorType: z.string().optional(),
  events: z
    .array(
      z.object({
        name: z.string(),
        timestamp: z.number(),
        attributes: TelemetryJsonRecord.optional(),
      }),
    )
    .optional(),
  links: z
    .array(
      z.object({
        traceId: z.string(),
        spanId: z.string(),
        attributes: TelemetryJsonRecord.optional(),
      }),
    )
    .optional(),
});

export const TelemetryRecord = z.discriminatedUnion("type", [
  TelemetryEventRecord,
  TelemetryMetricRecord,
  TelemetrySpanRecord,
]);
export type TelemetryRecord = z.infer<typeof TelemetryRecord>;

export const TelemetrySnapshot = z.object({
  metrics: TelemetryMetricsSnapshot,
  records: z.array(TelemetryRecord),
  storeEnabled: z.boolean(),
});
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshot>;
