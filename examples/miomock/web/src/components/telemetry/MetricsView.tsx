import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sonamu-kit/react-components/components";
import { useMemo, useState } from "react";

import { type TelemetryRecord } from "@/services/telemetry/telemetry.types";

import { TimeSeriesChart, type SeriesPoint } from "./TimeSeriesChart";
import {
  formatDurationMs,
  formatNumber,
  isMetricRecord,
  isSpanRecord,
  type MetricKind,
  METRIC_KIND_COLOR,
  type MetricRecord,
} from "./utils";

type SeriesEntry = {
  key: string;
  label: string;
  kind: MetricKind | "span";
  unit?: string;
  sample: number;
  points: SeriesPoint[];
  meta: { count: number };
};

type MetricsViewProps = {
  records: TelemetryRecord[];
};

const COUNTER_BUCKET_MS = 5_000;

export function MetricsView({ records }: MetricsViewProps) {
  const series = useMemo(() => buildSeries(records), [records]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const resolvedActiveKey = series.some((entry) => entry.key === activeKey)
    ? activeKey
    : (series[0]?.key ?? null);
  const active = series.find((entry) => entry.key === resolvedActiveKey) ?? null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-5">
      <Card className="shadow-sm border-border/40">
        <CardHeader className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-none m-0">Metrics</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">{series.length}</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100 max-h-[640px] overflow-auto">
            {series.map((s) => {
              const isActive = s.key === resolvedActiveKey;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-label={`View metric ${s.label}`}
                  onClick={() => setActiveKey(s.key)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 ${
                    isActive ? "bg-gray-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{s.label}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 h-4 ${
                        s.kind === "span"
                          ? "text-rose-700 bg-rose-50 border-rose-200"
                          : METRIC_KIND_COLOR[s.kind]
                      }`}
                    >
                      {s.kind}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{s.meta.count} samples</span>
                    <span className="tabular-nums">{formatSampleValue(s)}</span>
                  </div>
                </button>
              );
            })}
            {series.length === 0 && (
              <div className="px-4 py-10 text-sm text-muted-foreground text-center">
                No metric records.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/40">
        <CardHeader className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-none m-0">
            {active ? active.label : "Series"}
          </CardTitle>
          {active && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatSampleValue(active)} latest
            </span>
          )}
        </CardHeader>
        <CardContent className="p-5">
          {active ? (
            <>
              <TimeSeriesChart
                points={active.points}
                mode={active.kind === "gauge" ? "line" : "bar"}
                height={260}
                yLabel={chartYLabel(active)}
              />
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <SummaryCell label="Min" value={formatSeriesNumber(active, minOf(active.points))} />
                <SummaryCell label="Max" value={formatSeriesNumber(active, maxOf(active.points))} />
                <SummaryCell label="Avg" value={formatSeriesNumber(active, avgOf(active.points))} />
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Select a metric to view its series.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function buildSeries(records: TelemetryRecord[]): SeriesEntry[] {
  const metrics = records.filter(isMetricRecord);
  const spans = records.filter(isSpanRecord);

  const out: SeriesEntry[] = [];
  const byMetricName = groupBy(metrics, (m) => `${m.kind}::${m.name}`);
  for (const [key, group] of byMetricName.entries()) {
    const [kind, ...nameParts] = key.split("::");
    const name = nameParts.join("::");
    const sorted = group.toSorted((a, b) => a.timestamp - b.timestamp);
    if (kind === "gauge") {
      const points = sorted.map((m) => ({ t: m.timestamp, v: m.value }));
      out.push({
        key,
        label: name,
        kind: "gauge",
        unit: sorted[0]?.unit,
        sample: points.at(-1)?.v ?? 0,
        points,
        meta: { count: points.length },
      });
    } else if (kind === "counter") {
      const points = bucketCount(sorted, COUNTER_BUCKET_MS);
      const total = sorted.reduce((sum, m) => sum + m.value, 0);
      out.push({
        key,
        label: name,
        kind: "counter",
        unit: sorted[0]?.unit,
        sample: total,
        points,
        meta: { count: sorted.length },
      });
    } else {
      const points = sorted.map((m) => ({ t: m.timestamp, v: m.value }));
      out.push({
        key,
        label: name,
        kind: "histogram",
        unit: sorted[0]?.unit,
        sample: avgOf(points),
        points,
        meta: { count: points.length },
      });
    }
  }

  if (spans.length > 0) {
    const byOp = groupBy(spans, (s) => s.operationName);
    for (const [name, group] of byOp.entries()) {
      const points = group
        .map((s) => ({ t: s.timestamp, v: s.durationMs }))
        .toSorted((a, b) => a.t - b.t);
      out.push({
        key: `span::${name}`,
        label: `${name} (durationMs)`,
        kind: "span",
        unit: "ms",
        sample: avgOf(points),
        points,
        meta: { count: points.length },
      });
    }
  }

  return out.toSorted((a, b) => b.meta.count - a.meta.count);
}

function bucketCount(points: MetricRecord[], windowMs: number): SeriesPoint[] {
  if (points.length === 0) return [];
  const start = points[0].timestamp;
  const end = points[points.length - 1].timestamp;
  const bins = Math.max(1, Math.ceil((end - start) / windowMs));
  const buckets: SeriesPoint[] = [];
  for (let i = 0; i < bins + 1; i += 1) {
    buckets.push({ t: start + i * windowMs, v: 0 });
  }
  for (const p of points) {
    const idx = Math.min(buckets.length - 1, Math.floor((p.timestamp - start) / windowMs));
    buckets[idx].v += p.value;
  }
  return buckets;
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function minOf(points: SeriesPoint[]): number {
  return points.length === 0 ? 0 : Math.min(...points.map((p) => p.v));
}
function maxOf(points: SeriesPoint[]): number {
  return points.length === 0 ? 0 : Math.max(...points.map((p) => p.v));
}
function avgOf(points: SeriesPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + p.v, 0) / points.length;
}

function chartYLabel(entry: SeriesEntry): string {
  if (entry.kind === "counter") return `count / ${COUNTER_BUCKET_MS / 1_000}s`;
  if (entry.kind === "gauge") return entry.unit && entry.unit !== "1" ? entry.unit : "value";
  if (entry.kind === "span") return "ms";
  return entry.unit ?? "value";
}

function formatSeriesNumber(entry: SeriesEntry, value: number): string {
  if (entry.kind === "span" || entry.unit === "ms") return formatDurationMs(value);
  return formatNumber(value);
}

function formatSampleValue(entry: SeriesEntry): string {
  return formatSeriesNumber(entry, entry.sample);
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-100 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
