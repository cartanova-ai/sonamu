import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { useMemo, useState } from "react";

import { type TelemetryRecord } from "@/services/telemetry/telemetry.types";

import { RecordDetail } from "./RecordDetail";
import { TraceWaterfall } from "./TraceWaterfall";
import {
  type EventRecord,
  formatDurationMs,
  formatTimestampWithMs,
  getRecordKey,
  isEventRecord,
  isSpanRecord,
  type SpanRecord,
} from "./utils";

type TraceGroup = {
  traceId: string;
  start: number;
  end: number;
  spans: SpanRecord[];
  events: EventRecord[];
  errorCount: number;
};

type TracesViewProps = {
  records: TelemetryRecord[];
};

export function TracesView({ records }: TracesViewProps) {
  const [search, setSearch] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const groups = useMemo(() => buildTraceGroups(records), [records]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => {
      if (g.traceId.toLowerCase().includes(term)) return true;
      return g.spans.some((s) => s.operationName.toLowerCase().includes(term));
    });
  }, [groups, search]);

  const activeGroup = visible.find((g) => g.traceId === selectedTraceId) ?? visible[0] ?? null;
  const orphanRecord =
    activeGroup &&
    [...activeGroup.spans, ...activeGroup.events].find((r) => getRecordKey(r) === selectedKey);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-5">
      <Card className="shadow-sm border-border/40">
        <CardHeader className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-none m-0">Traces</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">{visible.length}</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-gray-100">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="traceId / operationName"
              className="h-8 text-xs bg-white border-gray-300"
            />
          </div>
          <div className="divide-y divide-gray-100 max-h-[640px] overflow-auto">
            {visible.map((group) => {
              const isActive = activeGroup?.traceId === group.traceId;
              const duration = group.end - group.start;
              return (
                <button
                  key={group.traceId}
                  type="button"
                  onClick={() => {
                    setSelectedTraceId(group.traceId);
                    setSelectedKey(null);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                    isActive ? "bg-gray-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono truncate">
                      {group.traceId.slice(0, 16)}…
                    </span>
                    {group.errorCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] py-0 h-4">
                        {group.errorCount} err
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {group.spans.length}sp · {group.events.length}ev
                    </span>
                    <span className="tabular-nums">{formatDurationMs(duration)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {formatTimestampWithMs(group.start)}
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className="px-4 py-10 text-sm text-muted-foreground text-center">No traces.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5 min-w-0">
        <Card className="shadow-sm border-border/40">
          <CardHeader className="px-5 py-3 border-b border-gray-100">
            <CardTitle className="text-sm font-medium leading-none m-0">
              {activeGroup ? activeGroup.traceId : "Trace timeline"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {activeGroup ? (
              <TraceWaterfall
                spans={activeGroup.spans}
                events={activeGroup.events}
                getKey={getRecordKey}
                selectedKey={selectedKey}
                onSelect={(span) => setSelectedKey(getRecordKey(span))}
              />
            ) : (
              <div className="text-sm text-muted-foreground text-center py-10">
                Select a trace to view timeline.
              </div>
            )}
          </CardContent>
        </Card>

        {activeGroup && activeGroup.events.length > 0 && (
          <Card className="shadow-sm border-border/40">
            <CardHeader className="px-5 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-medium leading-none m-0">
                Events on this trace
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100 max-h-[260px] overflow-auto">
                {activeGroup.events
                  .toSorted((a, b) => a.timestamp - b.timestamp)
                  .map((e) => {
                    const key = getRecordKey(e);
                    const isSelected = selectedKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={`w-full text-left px-4 py-2 grid grid-cols-[100px_minmax(0,1fr)_64px] gap-3 items-center hover:bg-gray-50 ${
                          isSelected ? "bg-gray-50" : ""
                        }`}
                      >
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {formatTimestampWithMs(e.timestamp)}
                        </span>
                        <span className="text-xs truncate">{e.name}</span>
                        <Badge variant="outline" className="text-[10px] justify-self-end">
                          {e.level}
                        </Badge>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        <RecordDetail record={orphanRecord ?? activeGroup?.spans[0] ?? null} />
      </div>
    </div>
  );
}

function buildTraceGroups(records: TelemetryRecord[]): TraceGroup[] {
  const map = new Map<string, TraceGroup>();
  for (const r of records) {
    if (!r.traceId) continue;
    if (!isSpanRecord(r) && !isEventRecord(r)) continue;
    let group = map.get(r.traceId);
    if (!group) {
      group = {
        traceId: r.traceId,
        start: r.timestamp,
        end: r.timestamp,
        spans: [],
        events: [],
        errorCount: 0,
      };
      map.set(r.traceId, group);
    }
    if (r.timestamp < group.start) group.start = r.timestamp;
    if (r.timestamp > group.end) group.end = r.timestamp;
    if (isSpanRecord(r)) {
      const spanEnd = r.timestamp + Math.max(0, r.durationMs);
      if (spanEnd > group.end) group.end = spanEnd;
      group.spans.push(r);
      if (r.status === "error") group.errorCount += 1;
    } else if (isEventRecord(r)) {
      group.events.push(r);
      if (r.level === "error") group.errorCount += 1;
    }
  }
  return [...map.values()].toSorted((a, b) => b.start - a.start);
}
