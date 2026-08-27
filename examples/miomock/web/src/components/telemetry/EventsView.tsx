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
import {
  type EventLevel,
  type EventRecord,
  formatTimestampWithMs,
  getRecordKey,
  isEventRecord,
  LEVEL_COLOR,
  LEVEL_DOT,
} from "./utils";

const LEVELS: EventLevel[] = ["debug", "info", "warn", "error"];

type EventsViewProps = {
  records: TelemetryRecord[];
};

export function EventsView({ records }: EventsViewProps) {
  const events = useMemo(() => records.filter(isEventRecord), [records]);

  const [levelFilter, setLevelFilter] = useState<EventLevel[]>([]);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const toggleLevel = (level: EventLevel) => {
    setLevelFilter((prev) =>
      prev.includes(level) ? prev.filter((lv) => lv !== level) : [...prev, level],
    );
  };

  const levelDistribution = useMemo(() => {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of events) counts[e.level] += 1;
    return counts;
  }, [events]);

  const totalEvents = events.length;

  const topEvents = useMemo(() => {
    const map = new Map<string, { name: string; count: number; lastLevel: EventLevel }>();
    for (const e of events) {
      const cur = map.get(e.name);
      if (cur) {
        cur.count += 1;
        cur.lastLevel = e.level;
      } else {
        map.set(e.name, { name: e.name, count: 1, lastLevel: e.level });
      }
    }
    return [...map.values()].toSorted((a, b) => b.count - a.count).slice(0, 10);
  }, [events]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((e) => {
      if (levelFilter.length > 0 && !levelFilter.includes(e.level)) return false;
      if (term && !e.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [events, levelFilter, search]);

  const selected = filtered.find((r) => getRecordKey(r) === selectedKey) ?? filtered[0] ?? null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)] gap-5">
      <div className="space-y-5 min-w-0">
        <Card className="shadow-sm border-border/40 overflow-hidden">
          <CardHeader className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-medium leading-none m-0">Events</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {LEVELS.map((lv) => {
                  const active = levelFilter.includes(lv);
                  return (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => toggleLevel(lv)}
                      aria-pressed={active}
                      className={`h-7 px-2 text-xs rounded-md border inline-flex items-center gap-1.5 transition-colors ${
                        active
                          ? LEVEL_COLOR[lv]
                          : "bg-white border-gray-200 text-muted-foreground hover:bg-gray-50"
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${LEVEL_DOT[lv]}`} />
                      {lv}
                      <span className="tabular-nums opacity-70">{levelDistribution[lv]}</span>
                    </button>
                  );
                })}
                {levelFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLevelFilter([])}
                    className="h-7 px-2 text-xs rounded-md border border-gray-200 text-muted-foreground hover:bg-gray-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="name contains"
                className="h-8 w-44 text-xs bg-white border-gray-300"
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} / {totalEvents}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100 max-h-[640px] overflow-auto">
              {filtered.map((record) => {
                const key = getRecordKey(record);
                const isSelected = selected && getRecordKey(selected) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-gray-50" : ""
                    }`}
                  >
                    <div className="grid grid-cols-[18px_92px_minmax(0,1fr)_minmax(0,200px)] gap-3 items-center">
                      <span className={`size-2 rounded-full ${LEVEL_DOT[record.level]}`} />
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatTimestampWithMs(record.timestamp)}
                      </span>
                      <span className="text-sm font-medium truncate">{record.name}</span>
                      <span className="text-xs text-muted-foreground truncate text-right">
                        {record.connectionId ?? record.traceId ?? record.namespace ?? "-"}
                      </span>
                    </div>
                    {(record.detail || record.attributes) && <DetailHint event={record} />}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-5 py-10 text-sm text-muted-foreground text-center">
                  No events match the filter.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5 min-w-0">
        <Card className="shadow-sm border-border/40">
          <CardHeader className="px-5 py-3 border-b border-gray-100">
            <CardTitle className="text-sm font-medium leading-none m-0">
              Level distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            {LEVELS.map((lv) => {
              const count = levelDistribution[lv];
              const ratio = totalEvents > 0 ? count / totalEvents : 0;
              return (
                <div key={lv} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="outline" className={LEVEL_COLOR[lv]}>
                      {lv}
                    </Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {count} ({(ratio * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`${LEVEL_DOT[lv]} h-full rounded-full transition-[width]`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/40">
          <CardHeader className="px-5 py-3 border-b border-gray-100">
            <CardTitle className="text-sm font-medium leading-none m-0">Top events</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            {topEvents.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">No events.</div>
            )}
            {topEvents.map((row) => {
              const max = topEvents[0]?.count ?? 1;
              const ratio = row.count / max;
              return (
                <div key={row.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="tabular-nums text-muted-foreground">{row.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`${LEVEL_DOT[row.lastLevel]} h-full rounded-full opacity-70`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <RecordDetail record={selected} />
      </div>
    </div>
  );
}

function DetailHint({ event }: { event: EventRecord }) {
  const detailKeys = event.detail ? Object.keys(event.detail).slice(0, 3) : [];
  const attrKeys = event.attributes ? Object.keys(event.attributes).slice(0, 3) : [];
  const tokens = [...detailKeys, ...attrKeys];
  if (tokens.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-muted-foreground/80 truncate pl-[30px]">
      {tokens.join(" · ")}
    </div>
  );
}
