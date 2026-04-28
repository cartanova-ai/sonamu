import { randomUUID } from "node:crypto";

import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketAudienceResolver } from "./ws-audience-resolver";
import { type WebSocketClusterBus, type WebSocketClusterEnvelope } from "./ws-cluster-bus";
import { type ManagedWebSocketConnection } from "./ws-core";
import { type WebSocketLocalConnectionStore } from "./ws-local-connection-store";

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

  constructor(
    private readonly options: {
      nodeId: string;
      localConnections: WebSocketLocalConnectionStore;
      audienceResolver: WebSocketAudienceResolver;
      clusterBus: WebSocketClusterBus;
    },
  ) {
    this.unsubscribe = this.options.clusterBus.subscribe((envelope) => {
      this.handleClusterEnvelope(envelope);
    });
  }

  publishToAudience(audience: WebSocketAudience, event: string, data: unknown): void {
    const routingPlan = this.options.audienceResolver.resolve(audience);
    const localTargets = this.options.localConnections.getConnections(routingPlan.localSessionIds);
    this.enqueueFanOut(localTargets, event, data);

    if (routingPlan.remoteNodeIds.length === 0) {
      return;
    }

    void this.options.clusterBus.publish({
      id: randomUUID(),
      sourceNodeId: this.options.nodeId,
      targetNodeIds: routingPlan.remoteNodeIds,
      audience,
      event,
      data,
      emittedAt: Date.now(),
    });
  }

  async shutdown(): Promise<void> {
    this.unsubscribe();
    await this.options.clusterBus.shutdown();
  }

  private handleClusterEnvelope(envelope: WebSocketClusterEnvelope): void {
    if (envelope.sourceNodeId === this.options.nodeId) {
      return;
    }

    if (
      envelope.targetNodeIds &&
      envelope.targetNodeIds.length > 0 &&
      !envelope.targetNodeIds.includes(this.options.nodeId)
    ) {
      return;
    }

    const routingPlan = this.options.audienceResolver.resolve(envelope.audience);
    this.enqueueFanOut(
      this.options.localConnections.getConnections(routingPlan.localSessionIds),
      envelope.event,
      envelope.data,
    );
  }

  private enqueueFanOut(targets: ManagedWebSocketConnection[], event: string, data: unknown): void {
    if (targets.length === 0) {
      return;
    }

    this.pendingFanOutJobs.push({
      targets,
      event,
      data,
      cursor: 0,
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
    let processed = 0;

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

    if (this.pendingFanOutJobs.length > 0) {
      this.scheduleFanOutFlush();
    }
  }

  private safePublish(connection: ManagedWebSocketConnection, event: string, data: unknown): void {
    try {
      if (!connection.closed) {
        connection.publishUntyped(event, data);
      }
    } catch {
      connection.close(1011, "WebSocket publish failed");
    }
  }
}
