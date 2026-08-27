import { randomUUID } from "node:crypto";

import { runtimeTypeOf } from "../runtime-type";
import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketAudienceResolver } from "./ws-audience-resolver";
import { type WebSocketClusterBus, type WebSocketClusterEnvelope } from "./ws-cluster-bus";
import { type ManagedWebSocketConnection } from "./ws-core";
import { type WebSocketLocalConnectionStore } from "./ws-local-connection-store";
import {
  NoopWebSocketTelemetryController,
  type WebSocketTelemetryController,
} from "./ws-telemetry";

// fan-out을 event loop tick 단위로 나눠 한 번에 긴 동기 루프를 만들지 않게 함
const FAN_OUT_BATCH_SIZE = 250;

export class WebSocketDeliveryEngine {
  private readonly pendingFanOutJobs: Array<{
    targets: ManagedWebSocketConnection[];
    event: string;
    data: unknown;
    cursor: number;
  }> = [];
  private fanOutFlushScheduled = false;
  private readonly unsubscribe: () => void;
  private readonly telemetry: WebSocketTelemetryController;
  private readonly unregisterMetricSource: () => void;

  constructor(
    private readonly options: {
      nodeId: string;
      localConnections: WebSocketLocalConnectionStore;
      audienceResolver: WebSocketAudienceResolver;
      clusterBus: WebSocketClusterBus;
      telemetryController?: WebSocketTelemetryController;
    },
  ) {
    this.telemetry = this.options.telemetryController ?? new NoopWebSocketTelemetryController();
    this.unsubscribe = this.options.clusterBus.subscribe((envelope) => {
      this.handleClusterEnvelope(envelope);
    });
    this.unregisterMetricSource = this.telemetry.registerMetricSource({
      collect: () => this.getTelemetrySnapshot(),
    });
  }

  publishToAudience<Data>(audience: WebSocketAudience, event: string, data: Data): void {
    const routingPlan = this.options.audienceResolver.resolve(audience);
    const localTargets = this.options.localConnections.getConnections(routingPlan.localSessionIds);

    this.telemetry.emit({
      name: "ws.fanout.resolved",
      level: "debug",
      detail: {
        localTargetCount: localTargets.length,
        remoteNodeCount: routingPlan.remoteNodeIds.length,
      },
    });
    this.telemetry.recordMetric({
      name: "sonamu.ws.fanout.targets",
      kind: "histogram",
      value: localTargets.length + routingPlan.remoteNodeIds.length,
      unit: "1",
      tags: { audience_type: audience.type },
    });

    this.enqueueFanOut(localTargets, event, data);

    if (routingPlan.remoteNodeIds.length === 0) {
      return;
    }

    const envelope: WebSocketClusterEnvelope = {
      id: randomUUID(),
      sourceNodeId: this.options.nodeId,
      targetNodeIds: routingPlan.remoteNodeIds,
      audience,
      event,
      data,
      emittedAt: Date.now(),
    };

    const publishStartedAt = performance.now();
    Promise.resolve(this.options.clusterBus.publish(envelope))
      .then(() => {
        const durationMs = performance.now() - publishStartedAt;
        this.telemetry.emit({
          name: "ws.cluster.envelope.published",
          level: "debug",
          detail: { event, targetNodeCount: routingPlan.remoteNodeIds.length },
        });
        this.telemetry.recordSpan({
          operationName: "ws.cluster.publish",
          kind: "producer",
          durationMs,
          status: "unset",
          attributes: {
            event,
            targetNodeCount: routingPlan.remoteNodeIds.length,
          },
        });
      })
      .catch((cause: unknown) => {
        const durationMs = performance.now() - publishStartedAt;
        this.telemetry.emit({
          name: "ws.cluster.envelope.failed",
          level: "error",
          detail: { event },
        });
        this.telemetry.recordSpan({
          operationName: "ws.cluster.publish",
          kind: "producer",
          durationMs,
          status: "error",
          attributes: { event },
          errorType: cause instanceof Error ? cause.name : runtimeTypeOf(cause),
        });
      });
  }

  async shutdown(): Promise<void> {
    this.unregisterMetricSource();
    this.unsubscribe();
    await this.options.clusterBus.shutdown();
  }

  getTelemetrySnapshot() {
    let pendingFanOutTargets = 0;

    for (const job of this.pendingFanOutJobs) {
      pendingFanOutTargets += Math.max(job.targets.length - job.cursor, 0);
    }

    return {
      pendingFanOutJobs: this.pendingFanOutJobs.length,
      pendingFanOutTargets,
    };
  }

  private handleClusterEnvelope(envelope: WebSocketClusterEnvelope): void {
    if (envelope.sourceNodeId === this.options.nodeId) {
      this.telemetry.emit({
        name: "ws.cluster.envelope.ignored",
        level: "debug",
        detail: { reason: "selfSource", event: envelope.event },
      });
      return;
    }

    if (
      envelope.targetNodeIds &&
      envelope.targetNodeIds.length > 0 &&
      !envelope.targetNodeIds.includes(this.options.nodeId)
    ) {
      this.telemetry.emit({
        name: "ws.cluster.envelope.ignored",
        level: "debug",
        detail: { reason: "targetMismatch", event: envelope.event },
      });
      return;
    }

    const startedAt = performance.now();
    this.telemetry.emit({
      name: "ws.cluster.envelope.received",
      level: "debug",
      detail: { event: envelope.event, sourceNodeId: envelope.sourceNodeId },
    });

    const routingPlan = this.options.audienceResolver.resolve(envelope.audience);
    const localTargets = this.options.localConnections.getConnections(routingPlan.localSessionIds);
    this.enqueueFanOut(localTargets, envelope.event, envelope.data);

    this.telemetry.recordSpan({
      operationName: "ws.cluster.receive",
      kind: "consumer",
      durationMs: performance.now() - startedAt,
      status: "unset",
      attributes: {
        event: envelope.event,
        sourceNodeId: envelope.sourceNodeId,
        localTargetCount: localTargets.length,
      },
    });
  }

  private enqueueFanOut<Data>(
    targets: ManagedWebSocketConnection[],
    event: string,
    data: Data,
  ): void {
    if (targets.length === 0) {
      return;
    }

    this.pendingFanOutJobs.push({
      targets,
      event,
      data,
      cursor: 0,
    });
    this.telemetry.emit({
      name: "ws.fanout.enqueued",
      level: "debug",
      detail: { targetCount: targets.length, event },
    });
    this.scheduleFanOutFlush();
  }

  private scheduleFanOutFlush(): void {
    if (this.fanOutFlushScheduled) {
      return;
    }

    this.fanOutFlushScheduled = true;
    setImmediate(() => {
      this.fanOutFlushScheduled = false;
      this.flushFanOutJobs();
    });
  }

  private flushFanOutJobs(): void {
    const startedAt = performance.now();
    let processed = 0;
    let status: "unset" | "error" = "unset";
    let errorType: string | undefined;

    try {
      while (this.pendingFanOutJobs.length > 0 && processed < FAN_OUT_BATCH_SIZE) {
        const job = this.pendingFanOutJobs[0];

        while (job.cursor < job.targets.length && processed < FAN_OUT_BATCH_SIZE) {
          this.safePublish(job.targets[job.cursor], job.event, job.data);
          job.cursor += 1;
          processed += 1;
        }

        if (job.cursor >= job.targets.length) {
          this.pendingFanOutJobs.shift();
        }
      }
    } catch (error) {
      status = "error";
      errorType = error instanceof Error ? error.name : runtimeTypeOf(error);
      throw error;
    } finally {
      const durationMs = performance.now() - startedAt;
      this.telemetry.emit({
        name: "ws.fanout.flushed",
        level: "debug",
        detail: { processedCount: processed },
      });
      this.telemetry.recordSpan({
        operationName: "ws.fanout.dispatch",
        kind: "internal",
        durationMs,
        status,
        attributes: { processedCount: processed },
        errorType,
      });

      if (this.pendingFanOutJobs.length > 0) {
        this.scheduleFanOutFlush();
      }
    }
  }

  private safePublish<Data>(
    connection: ManagedWebSocketConnection,
    event: string,
    data: Data,
  ): void {
    try {
      if (!connection.closed) {
        connection.publishUntyped(event, data);
      }
    } catch {
      this.telemetry.emit({
        name: "ws.fanout.publish.failed",
        level: "error",
        connectionId: connection.id,
        namespace: connection.namespace,
        userId: connection.userId,
        detail: { event },
      });
      connection.close(1011, "WebSocket publish failed");
    }
  }
}
