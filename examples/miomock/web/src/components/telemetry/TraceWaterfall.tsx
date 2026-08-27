import { Fragment } from "react";

import { formatDurationMs, formatTimestampWithMs, type SpanRecord } from "./utils";
import { type EventRecord } from "./utils";

export type TraceItem = {
  span: SpanRecord;
  depth: number;
  start: number;
  end: number;
};

type TraceWaterfallProps = {
  spans: SpanRecord[];
  events: EventRecord[];
  selectedKey?: string | null;
  getKey: (s: SpanRecord) => string;
  onSelect?: (s: SpanRecord) => void;
};

export function TraceWaterfall({
  spans,
  events,
  selectedKey,
  getKey,
  onSelect,
}: TraceWaterfallProps) {
  if (spans.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">No spans in this trace.</div>
    );
  }

  const items = layoutSpans(spans);
  const traceStart = Math.min(...items.map((it) => it.start));
  const traceEnd = Math.max(...items.map((it) => it.end));
  const traceDuration = Math.max(1, traceEnd - traceStart);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-2">
        <span>{formatTimestampWithMs(traceStart)}</span>
        <span className="tabular-nums">{formatDurationMs(traceDuration)}</span>
        <span>{formatTimestampWithMs(traceEnd)}</span>
      </div>
      <div className="rounded border border-gray-100 bg-gray-50/40">
        {items.map((item) => {
          const key = getKey(item.span);
          const isSelected = selectedKey === key;
          const offsetPct = ((item.start - traceStart) / traceDuration) * 100;
          const widthPct = Math.max(0.4, ((item.end - item.start) / traceDuration) * 100);
          const isError = item.span.status === "error";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(item.span)}
              className={`w-full grid grid-cols-[minmax(0,300px)_minmax(0,1fr)_72px] items-center gap-3 px-2 py-1.5 text-left hover:bg-white transition-colors ${
                isSelected ? "bg-white" : ""
              }`}
            >
              <div
                className="flex items-center gap-2 truncate"
                style={{ paddingLeft: item.depth * 14 }}
              >
                {item.depth > 0 && <span className="text-muted-foreground/50 select-none">└</span>}
                <span className="text-xs font-medium truncate">{item.span.operationName}</span>
                {isError && (
                  <span className="text-[10px] px-1 rounded bg-rose-100 text-rose-700 shrink-0">
                    error
                  </span>
                )}
              </div>
              <div className="relative h-3 w-full bg-gray-100 rounded">
                <div
                  className={`absolute top-0 bottom-0 rounded ${
                    isError ? "bg-rose-500" : "bg-sky-500"
                  } opacity-90`}
                  style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                />
                {events
                  .filter((ev) => ev.timestamp >= traceStart && ev.timestamp <= traceEnd)
                  .slice(0, 30)
                  .map((ev, idx) => {
                    const left = ((ev.timestamp - traceStart) / traceDuration) * 100;
                    return (
                      <Fragment key={`${ev.name}:${ev.timestamp}:${idx}`}>
                        <span
                          className="absolute -top-0.5 size-1.5 rounded-full bg-amber-500"
                          style={{ left: `calc(${left}% - 3px)` }}
                          title={`${ev.name} · ${formatTimestampWithMs(ev.timestamp)}`}
                        />
                      </Fragment>
                    );
                  })}
              </div>
              <div className="text-[11px] tabular-nums text-muted-foreground text-right">
                {formatDurationMs(item.end - item.start)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function layoutSpans(spans: SpanRecord[]): TraceItem[] {
  const sorted = spans.toSorted((a, b) => a.timestamp - b.timestamp);
  const byId = new Map<string, SpanRecord>();
  for (const span of sorted) {
    if (span.spanId) byId.set(span.spanId, span);
  }
  const depthCache = new Map<string, number>();
  const computeDepth = (span: SpanRecord, seen = new Set<string>()): number => {
    if (!span.spanId) return 0;
    const cached = depthCache.get(span.spanId);
    if (cached !== undefined) return cached;
    if (!span.parentSpanId || seen.has(span.spanId)) {
      depthCache.set(span.spanId, 0);
      return 0;
    }
    const parent = byId.get(span.parentSpanId);
    if (!parent) {
      depthCache.set(span.spanId, 0);
      return 0;
    }
    seen.add(span.spanId);
    const d = computeDepth(parent, seen) + 1;
    depthCache.set(span.spanId, d);
    return d;
  };

  return sorted.map((span) => ({
    span,
    depth: computeDepth(span),
    start: span.timestamp,
    end: span.timestamp + Math.max(0, span.durationMs),
  }));
}
