import {
  Button,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sonamu-kit/react-components/components";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import ActivityIcon from "~icons/lucide/activity";
import RefreshCwIcon from "~icons/lucide/refresh-cw";

import { EventsView } from "@/components/telemetry/EventsView";
import { MetricsView } from "@/components/telemetry/MetricsView";
import { OverviewCards } from "@/components/telemetry/OverviewCards";
import { TracesView } from "@/components/telemetry/TracesView";
import { TelemetryService } from "@/services/services.generated";
import {
  type TelemetryQueryParams,
  type TelemetryRecord,
} from "@/services/telemetry/telemetry.types";

export const Route = createFileRoute("/admin/telemetry/")({
  head: () => ({
    meta: [
      { title: "WebSocket Telemetry" },
      { name: "description", content: "WebSocket telemetry records and runtime metrics" },
    ],
  }),
  component: TelemetryPage,
});

type TabKey = "events" | "traces" | "metrics";

function TelemetryPage() {
  const [tab, setTab] = useState<TabKey>("events");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [limit, setLimit] = useState(200);

  const params = useMemo<TelemetryQueryParams>(() => ({ limit }), [limit]);

  const query = useQuery({
    ...TelemetryService.getTelemetrySnapshotQueryOptions(params),
    refetchInterval: autoRefresh ? 3_000 : false,
  });

  const records = useMemo<TelemetryRecord[]>(() => {
    const raw = query.data?.records ?? [];
    return raw.toSorted((a, b) => b.timestamp - a.timestamp);
  }, [query.data?.records]);

  const ascRecords = useMemo<TelemetryRecord[]>(() => {
    return records.toSorted((a, b) => a.timestamp - b.timestamp);
  }, [records]);

  const counts = useMemo(() => {
    let event = 0;
    let metric = 0;
    let span = 0;
    for (const r of records) {
      if (r.type === "event") event += 1;
      else if (r.type === "metric") metric += 1;
      else if (r.type === "span") span += 1;
    }
    return { event, metric, span };
  }, [records]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ActivityIcon className="h-5 w-5" />
            <span className="text-lg font-semibold h-5">WebSocket Telemetry</span>
            {query.data && !query.data.storeEnabled && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded ml-2">
                store disabled
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="h-8 px-2 text-xs bg-white border border-gray-300 rounded-md"
            >
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              Auto refresh
            </label>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCwIcon />}
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              Refresh
            </Button>
          </div>
        </div>

        <OverviewCards records={ascRecords} metrics={query.data?.metrics} />

        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value === "events" || value === "traces" || value === "metrics") {
              setTab(value);
            }
          }}
        >
          <Card className="shadow-sm border-border/40 overflow-hidden">
            <CardContent className="px-4 py-2.5 flex items-center justify-between gap-3">
              <TabsList className="bg-transparent p-0 h-auto gap-1">
                <TabTab value="events" label="Events" count={counts.event} />
                <TabTab value="traces" label="Traces" count={counts.span} />
                <TabTab value="metrics" label="Metrics" count={counts.metric + counts.span} />
              </TabsList>
              <span className="text-xs text-muted-foreground">{records.length} records loaded</span>
            </CardContent>
          </Card>

          <TabsContent value="events" className="mt-5">
            <EventsView records={records} />
          </TabsContent>
          <TabsContent value="traces" className="mt-5">
            <TracesView records={records} />
          </TabsContent>
          <TabsContent value="metrics" className="mt-5">
            <MetricsView records={records} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TabTab({ value, label, count }: { value: string; label: string; count: number }) {
  return (
    <TabsTrigger
      value={value}
      className="px-3 py-1.5 rounded-md text-sm data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700"
    >
      <span>{label}</span>
      <span className="ml-2 text-xs tabular-nums text-muted-foreground">{count}</span>
    </TabsTrigger>
  );
}
