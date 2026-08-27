import { api, BaseFrameClass, Sonamu } from "sonamu";

import { TelemetryQueryParams, TelemetryRecord, TelemetrySnapshot } from "./telemetry.types";

class TelemetryFrameClass extends BaseFrameClass {
  @api({
    httpMethod: "GET",
    clients: ["axios", "tanstack-query"],
    resourceName: "TelemetrySnapshot",
    guards: ["admin"],
  })
  async getSnapshot(rawParams?: TelemetryQueryParams): Promise<TelemetrySnapshot> {
    const params = TelemetryQueryParams.parse({
      limit: 100,
      ...rawParams,
    });
    const controller = Sonamu.websocketRuntime.telemetryController;
    const eventStore = controller.getEventStore();
    const metricStore = controller.getMetricStore();
    const spanStore = controller.getSpanStore();
    const storeEnabled = Boolean(eventStore ?? metricStore ?? spanStore);

    const { type, name, level, connectionId, userId, namespace, traceId, since, until, limit } =
      params;
    const common = { connectionId, userId, namespace, traceId, since, until, limit };

    const eventRecords =
      (type === undefined || type === "event") && eventStore
        ? eventStore.query({ ...common, name, level })
        : [];
    const metricRecords =
      (type === undefined || type === "metric") && metricStore
        ? metricStore.query({ ...common, name })
        : [];
    const spanRecords =
      (type === undefined || type === "span") && spanStore
        ? spanStore.query({ ...common, operationName: name })
        : [];

    const merged = [...eventRecords, ...metricRecords, ...spanRecords].toSorted(
      (a, b) => b.timestamp - a.timestamp,
    );
    const records = (limit !== undefined ? merged.slice(0, limit) : merged).map((record) =>
      TelemetryRecord.parse(record),
    );

    return TelemetrySnapshot.parse({
      metrics: controller.getMetricsSnapshot(),
      records,
      storeEnabled,
    });
  }
}

export const TelemetryFrame = new TelemetryFrameClass();
