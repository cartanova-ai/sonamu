import { Card, CardContent, CardHeader, CardTitle } from "@sonamu-kit/react-components/components";

import { type TelemetryRecord } from "@/services/telemetry/telemetry.types";

import {
  formatDurationMs,
  formatTimestampWithMs,
  getRecordName,
  isMetricRecord,
  isSpanRecord,
} from "./utils";

type RecordDetailProps = {
  record: TelemetryRecord | null;
};

export function RecordDetail({ record }: RecordDetailProps) {
  return (
    <Card className="shadow-sm border-border/40 overflow-hidden">
      <CardHeader className="px-5 py-3 border-b border-gray-100">
        <CardTitle className="text-sm font-medium leading-none m-0">Selected Record</CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        {record ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <DetailItem label="Type" value={record.type} />
              <DetailItem label="Time" value={formatTimestampWithMs(record.timestamp)} />
              <DetailItem label="Name" value={getRecordName(record)} />
              <DetailItem label="Connection" value={record.connectionId ?? "-"} />
              <DetailItem label="Namespace" value={record.namespace ?? "-"} />
              <DetailItem label="Trace" value={record.traceId ?? "-"} />
              {isSpanRecord(record) && (
                <>
                  <DetailItem label="Duration" value={formatDurationMs(record.durationMs)} />
                  <DetailItem label="Status" value={record.status} />
                </>
              )}
              {isMetricRecord(record) && (
                <>
                  <DetailItem label="Kind" value={record.kind} />
                  <DetailItem
                    label="Value"
                    value={`${record.value}${record.unit && record.unit !== "1" ? record.unit : ""}`}
                  />
                </>
              )}
            </div>
            <pre className="max-h-[620px] overflow-auto rounded-md bg-gray-950 p-4 text-xs leading-5 text-gray-100">
              {JSON.stringify(record, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="py-10 text-sm text-muted-foreground text-center">Select a record.</div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
