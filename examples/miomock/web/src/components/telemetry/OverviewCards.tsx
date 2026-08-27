import { Card, CardContent } from "@sonamu-kit/react-components/components";
import { useMemo } from "react";

import {
  type TelemetryMetricsSnapshot,
  type TelemetryRecord,
} from "@/services/telemetry/telemetry.types";

import { SparkLine } from "./SparkLine";
import { formatBytes, formatNumber, isMetricRecord } from "./utils";

type OverviewCardsProps = {
  records: TelemetryRecord[];
  metrics: TelemetryMetricsSnapshot | undefined;
};

type CardSpec = {
  label: string;
  value: string;
  values: number[];
  stroke: string;
  fill: string;
};

export function OverviewCards({ records, metrics }: OverviewCardsProps) {
  const snapshots = useMemo(() => collectSnapshots(records), [records]);

  const cards = useMemo<CardSpec[]>(() => {
    const series = (key: keyof TelemetryMetricsSnapshot): number[] =>
      snapshots.map((s) => Number(s[key] ?? 0)).filter((n) => Number.isFinite(n));

    return [
      {
        label: "Active connections",
        value: formatNumber(metrics?.activeConnections ?? 0),
        values: series("activeConnections"),
        stroke: "#0ea5e9",
        fill: "rgba(14, 165, 233, 0.16)",
      },
      {
        label: "Inbound queue",
        value: formatNumber(metrics?.pendingInboundMessages ?? 0),
        values: series("pendingInboundMessages"),
        stroke: "#10b981",
        fill: "rgba(16, 185, 129, 0.16)",
      },
      {
        label: "Outbound queue",
        value: formatNumber(metrics?.pendingOutboundMessages ?? 0),
        values: series("pendingOutboundMessages"),
        stroke: "#f59e0b",
        fill: "rgba(245, 158, 11, 0.16)",
      },
      {
        label: "Socket buffered",
        value: formatBytes(metrics?.socketBufferedBytes ?? 0),
        values: series("socketBufferedBytes"),
        stroke: "#8b5cf6",
        fill: "rgba(139, 92, 246, 0.16)",
      },
      {
        label: "Dropped records",
        value: formatNumber(metrics?.telemetryDroppedRecords ?? 0),
        values: series("telemetryDroppedRecords"),
        stroke: "#ef4444",
        fill: "rgba(239, 68, 68, 0.16)",
      },
      {
        label: "Sink failures",
        value: formatNumber(metrics?.telemetrySinkFailures ?? 0),
        values: series("telemetrySinkFailures"),
        stroke: "#dc2626",
        fill: "rgba(220, 38, 38, 0.16)",
      },
    ];
  }, [snapshots, metrics]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className="border-border/40 shadow-sm">
          <CardContent className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground truncate">{card.label}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-xl font-bold tabular-nums">{card.value}</span>
              <SparkLine
                values={card.values}
                width={88}
                height={28}
                stroke={card.stroke}
                fill={card.fill}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function collectSnapshots(records: TelemetryRecord[]): TelemetryMetricsSnapshot[] {
  return records
    .filter(isMetricRecord)
    .flatMap((m) => (m.kind === "gauge" && m.snapshot ? [m.snapshot] : []))
    .toSorted((a, b) => a.timestamp - b.timestamp);
}
