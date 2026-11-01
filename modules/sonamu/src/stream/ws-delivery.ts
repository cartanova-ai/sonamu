import { randomUUID } from "node:crypto";

import { type z } from "zod";

import { runtimeTypeOf } from "../runtime-type";
import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketAudienceResolver } from "./ws-audience-resolver";
import { type WebSocketClusterBus, type WebSocketClusterEnvelope } from "./ws-cluster-bus";
import { type WebSocketUserId, type WebSocketFrameConnection } from "./ws-core";
import { encodeWebSocketFrame, type WebSocketFrameEncoding } from "./ws-frame";
import { type WebSocketLocalConnectionStore } from "./ws-local-connection-store";
import {
  NoopWebSocketTelemetryController,
  type WebSocketTelemetryController,
} from "./ws-telemetry";

// fan-out을 event loop tick 단위로 나눠 한 번에 긴 동기 루프를 만들지 않게 함
const FAN_OUT_BATCH_SIZE = 250;

export type WebSocketRouteDefinition = {
  routeKey: string;
  outEvents: z.ZodObject;
};

type FanOutTarget = {
  connection: WebSocketFrameConnection;
  frame: string;
};

type FanOutJob = {
  targets: FanOutTarget[];
  event: string;
  cursor: number;
};

type Unsubscribe = () => void;

export class WebSocketDeliveryEngine {
  private readonly pendingFanOutJobs: FanOutJob[] = [];
  private fanOutFlushScheduled = false;
  // routeKey → outEvents. 모든 노드가 같은 route 집합을 등록하므로 routeKey는 클러스터 전체에서 일관된다
  private readonly routes = new Map<string, z.ZodObject>();
  // 노드 단위 직렬 publish 큐. 앞선 publish의 라우팅이 느려도 원격 envelope 순서가 뒤바뀌지 않는다
  private publishQueue: Promise<void> = Promise.resolve();
  private readonly subscription: Promise<Unsubscribe | undefined>;
  private stopped = false;
  private readonly telemetry: WebSocketTelemetryController;
  private readonly unregisterMetricSource: () => void;

  constructor(
    private readonly options: {
      nodeId: string;
      localConnections: WebSocketLocalConnectionStore;
      // registry 메모리 기준으로 audience에 속한 로컬 활성 세션 ID를 반환한다
      resolveLocalSessionIds: (audience: WebSocketAudience) => string[];
      leaveLocalUser: (
        userId: WebSocketUserId,
        roomId: string,
        namespace?: string,
      ) => {
        localLeftCount: number;
        completion: Promise<boolean>;
      };
      resolveControlNodeIds: (userId: WebSocketUserId, namespace?: string) => Promise<string[]>;
      audienceResolver: WebSocketAudienceResolver;
      clusterBus: WebSocketClusterBus;
      telemetryController?: WebSocketTelemetryController;
    },
  ) {
    this.telemetry = this.options.telemetryController ?? new NoopWebSocketTelemetryController();
    this.subscription = this.subscribe();
    this.unregisterMetricSource = this.telemetry.registerMetricSource({
      collect: () => this.getTelemetrySnapshot(),
    });
  }

  registerRoute(routeKey: string, outEvents: z.ZodObject): void {
    this.routes.set(routeKey, outEvents);
  }

  replaceRoutes(routes: WebSocketRouteDefinition[]): void {
    this.routes.clear();
    for (const route of routes) {
      this.routes.set(route.routeKey, route.outEvents);
    }
  }

  /**
   * 발행 노드에서 route별로 한 번 검증·인코딩하고, 로컬 fan-out은 즉시 큐에 넣는다.
   * 원격 라우팅과 cluster publish는 노드 단위 직렬 큐에서 처리한다. 반환한 promise는 reject하지 않는다.
   */
  publishToAudience<Data>(audience: WebSocketAudience, event: string, data: Data): Promise<void> {
    try {
      let declared = false;
      let rejected = false;
      const record = (encoding: WebSocketFrameEncoding) => {
        if (encoding.status !== "unknownEvent") {
          declared = true;
        }
        if (encoding.status === "invalidPayload") {
          rejected = true;
        }
      };

      // 이벤트를 선언한 route마다 한 번만 검증·인코딩한다. 원격 수신자도 이 frame을 그대로 받는다
      const routeFrames: Record<string, string> = {};
      for (const [routeKey, outEvents] of this.routes) {
        const encoding = encodeWebSocketFrame(outEvents, event, data);
        record(encoding);
        if (encoding.status === "encoded") {
          routeFrames[routeKey] = encoding.frame;
        }
      }

      // route table에 없는 로컬 연결은 자기 스키마로 인코딩한다(스키마 객체당 한 번)
      const fallbackEncodings = new Map<z.ZodObject, WebSocketFrameEncoding>();
      const localTargets: FanOutTarget[] = [];
      for (const connection of this.options.localConnections.getConnections(
        this.options.resolveLocalSessionIds(audience),
      )) {
        let frame: string | undefined;
        if (connection.routeKey !== undefined && this.routes.has(connection.routeKey)) {
          frame = getOwnFrame(routeFrames, connection.routeKey);
        } else {
          let encoding = fallbackEncodings.get(connection.outEvents);
          if (!encoding) {
            encoding = encodeWebSocketFrame(connection.outEvents, event, data);
            fallbackEncodings.set(connection.outEvents, encoding);
            record(encoding);
          }
          frame = encoding.status === "encoded" ? encoding.frame : undefined;
        }

        // 이벤트를 선언하지 않았거나 검증에 실패한 route의 연결은 닫지 않고 건너뛴다
        if (frame !== undefined) {
          localTargets.push({ connection, frame });
        }
      }

      if (!declared) {
        this.emitPublishRejected(event, "unknownEvent");
      } else if (rejected) {
        this.emitPublishRejected(event, "invalidPayload");
      }

      this.enqueueFanOut(localTargets, event);

      if (Object.keys(routeFrames).length === 0) {
        this.emitFanOutResolved(audience, localTargets.length, 0);
        return Promise.resolve();
      }

      // 원격 라우팅(store 조회)은 앞선 publish를 기다리지 않고 지금 바로 시작한다. store가 멈춰도 버스트 비용이 N×T가 아닌 약 T다.
      // 반면 envelope 발행은 노드 단위 큐에 이어 붙여 publish 순서를 지킨다. 뒤 publish의 라우팅이 먼저 끝나도 앞 발행을 기다린다
      const routing = this.resolveRemoteNodeIds(audience, event);
      const task = this.publishQueue
        .then(() => routing)
        .then((remoteNodeIds) =>
          this.publishRemote(audience, event, routeFrames, localTargets.length, remoteNodeIds),
        )
        .catch((cause: unknown) => {
          this.emitRouteFailed(event, audience, cause);
        });
      this.publishQueue = task;
      return task;
    } catch (cause) {
      // 스키마 transform 예외 등 예상하지 못한 실패도 호출자에게 reject로 새지 않게 한다
      this.emitRouteFailed(event, audience, cause);
      return Promise.resolve();
    }
  }

  publishLeaveUser(
    userId: WebSocketUserId,
    roomId: string,
    namespace?: string,
  ): Promise<{ targetNodeCount: number; partial: boolean }> {
    const routing = Promise.resolve()
      .then(() => this.options.resolveControlNodeIds(userId, namespace))
      .catch((cause: unknown) => {
        this.emitControlFailed("route", cause);
        return undefined;
      });
    const task = this.publishQueue.then(async () => {
      const targetNodeIds = await routing;
      if (!targetNodeIds) {
        return { targetNodeCount: 0, partial: true };
      }
      if (targetNodeIds.length === 0) {
        return { targetNodeCount: 0, partial: false };
      }
      try {
        await this.options.clusterBus.publish({
          kind: "leaveUser",
          id: randomUUID(),
          sourceNodeId: this.options.nodeId,
          targetNodeIds,
          userId,
          roomId,
          namespace,
          emittedAt: Date.now(),
        });
        this.telemetry.emit({
          name: "ws.cluster.control.published",
          level: "debug",
          detail: { userId, roomId, namespace, targetNodeCount: targetNodeIds.length },
        });
        return { targetNodeCount: targetNodeIds.length, partial: false };
      } catch (cause) {
        this.emitControlFailed("publish", cause);
        return { targetNodeCount: targetNodeIds.length, partial: true };
      }
    });
    this.publishQueue = task.then(() => undefined);
    return task;
  }

  private emitControlFailed(stage: "route" | "publish", cause: unknown): void {
    this.telemetry.emit({
      name: "ws.cluster.control.failed",
      level: "warn",
      detail: { stage, errorType: describeError(cause) },
    });
  }

  // 진행 중인 publish(원격 포함)와 구독 시도가 모두 끝나면 resolve한다
  async drainPublishes(): Promise<void> {
    await Promise.all([this.publishQueue, this.subscription]);
  }

  /**
   * 구독을 해제하고 cluster bus를 종료한다. 구독이 deadline까지 끝나지 않으면 늦게 끝날 때 해제한다.
   */
  async shutdown(deadline: Promise<void>): Promise<void> {
    this.stopped = true;
    this.unregisterMetricSource();

    const unsubscribe = await Promise.race([this.subscription, deadline.then(() => null)]);
    if (unsubscribe === null) {
      this.subscription.then((lateUnsubscribe) => {
        this.safeUnsubscribe(lateUnsubscribe);
      });
    } else {
      this.safeUnsubscribe(unsubscribe);
    }

    try {
      await Promise.resolve().then(() => this.options.clusterBus.shutdown());
    } catch (cause) {
      this.telemetry.emit({
        name: "ws.cluster.shutdown.failed",
        level: "error",
        detail: { errorType: describeError(cause) },
      });
    }
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

  // 구독 실패는 로컬 전용 동작으로 수렴시키고 telemetry만 남긴다
  private subscribe(): Promise<Unsubscribe | undefined> {
    return Promise.resolve()
      .then(() =>
        this.options.clusterBus.subscribe(
          (envelope) => {
            this.handleClusterEnvelope(envelope);
          },
          {
            onRejected: ({ reason }) => {
              this.telemetry.emit({
                name: "ws.cluster.envelope.rejected",
                level: "warn",
                detail: { reason },
              });
            },
          },
        ),
      )
      .then(
        (unsubscribe) => unsubscribe,
        (cause: unknown) => {
          this.telemetry.emit({
            name: "ws.cluster.subscribe.failed",
            level: "error",
            detail: { errorType: describeError(cause) },
          });
          return undefined;
        },
      );
  }

  private safeUnsubscribe(unsubscribe: Unsubscribe | undefined): void {
    try {
      unsubscribe?.();
    } catch (cause) {
      this.telemetry.emit({
        name: "ws.cluster.unsubscribe.failed",
        level: "error",
        detail: { errorType: describeError(cause) },
      });
    }
  }

  // 라우팅 실패는 여기서 telemetry로 바꿔 undefined를 돌려준다. 즉시 catch를 붙이므로 큐 차례를 기다리는 동안에도 unhandled rejection이 생기지 않는다
  private resolveRemoteNodeIds(
    audience: WebSocketAudience,
    event: string,
  ): Promise<string[] | undefined> {
    return this.options.audienceResolver.resolveRemoteNodeIds(audience).catch((cause: unknown) => {
      this.emitRouteFailed(event, audience, cause);
      return undefined;
    });
  }

  private async publishRemote(
    audience: WebSocketAudience,
    event: string,
    frames: Record<string, string>,
    localTargetCount: number,
    resolvedNodeIds: string[] | undefined,
  ): Promise<void> {
    // 라우팅 실패(undefined) 시 로컬 전달은 이미 끝났으므로 이 publish의 원격 envelope만 건너뛴다
    const remoteNodeIds = resolvedNodeIds ?? [];
    this.emitFanOutResolved(audience, localTargetCount, remoteNodeIds.length);
    if (remoteNodeIds.length === 0) {
      return;
    }

    const envelope: WebSocketClusterEnvelope = {
      kind: "publish",
      id: randomUUID(),
      sourceNodeId: this.options.nodeId,
      targetNodeIds: remoteNodeIds,
      audience,
      event,
      frames,
      emittedAt: Date.now(),
    };

    const publishStartedAt = performance.now();
    try {
      await Promise.resolve().then(() => this.options.clusterBus.publish(envelope));
      const durationMs = performance.now() - publishStartedAt;
      this.telemetry.emit({
        name: "ws.cluster.envelope.published",
        level: "debug",
        detail: { event, targetNodeCount: remoteNodeIds.length },
      });
      this.telemetry.recordSpan({
        operationName: "ws.cluster.publish",
        kind: "producer",
        durationMs,
        status: "unset",
        attributes: {
          event,
          targetNodeCount: remoteNodeIds.length,
        },
      });
    } catch (cause) {
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
        errorType: describeError(cause),
      });
    }
  }

  // 수신 노드는 store 없이 자기 메모리로 audience를 해석하고, 각 연결의 route frame을 재검증 없이 그대로 보낸다
  private handleClusterEnvelope(envelope: WebSocketClusterEnvelope): void {
    if (this.stopped) {
      return;
    }

    // 구독자가 모르는 kind는 publish로 오인하지 않고 거절한다. kind가 없으면 구버전 publish다
    const kind: unknown = envelope.kind;
    if (kind !== undefined && kind !== "publish" && kind !== "leaveUser") {
      this.telemetry.emit({
        name: "ws.cluster.envelope.rejected",
        level: "warn",
        detail: { reason: "unknownKind" },
      });
      return;
    }

    if (envelope.sourceNodeId === this.options.nodeId) {
      this.telemetry.emit({
        name: "ws.cluster.envelope.ignored",
        level: "debug",
        detail: {
          reason: "selfSource",
          event: envelope.kind === "leaveUser" ? undefined : envelope.event,
        },
      });
      return;
    }

    if (
      envelope.targetNodeIds.length > 0 &&
      !envelope.targetNodeIds.includes(this.options.nodeId)
    ) {
      this.telemetry.emit({
        name: "ws.cluster.envelope.ignored",
        level: "debug",
        detail: {
          reason: "targetMismatch",
          event: envelope.kind === "leaveUser" ? undefined : envelope.event,
        },
      });
      return;
    }

    if (envelope.kind === "leaveUser") {
      const local = this.options.leaveLocalUser(
        envelope.userId,
        envelope.roomId,
        envelope.namespace,
      );
      this.telemetry.emit({
        name: "ws.cluster.control.received",
        level: "debug",
        detail: {
          userId: envelope.userId,
          roomId: envelope.roomId,
          namespace: envelope.namespace,
          sourceNodeId: envelope.sourceNodeId,
          localLeftCount: local.localLeftCount,
        },
      });
      return;
    }

    const startedAt = performance.now();
    this.telemetry.emit({
      name: "ws.cluster.envelope.received",
      level: "debug",
      detail: { event: envelope.event, sourceNodeId: envelope.sourceNodeId },
    });

    const localTargets: FanOutTarget[] = [];
    for (const connection of this.options.localConnections.getConnections(
      this.options.resolveLocalSessionIds(envelope.audience),
    )) {
      const frame =
        connection.routeKey === undefined
          ? undefined
          : getOwnFrame(envelope.frames, connection.routeKey);
      if (frame !== undefined) {
        localTargets.push({ connection, frame });
      }
    }
    this.enqueueFanOut(localTargets, envelope.event);

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

  private emitPublishRejected(event: string, reason: "unknownEvent" | "invalidPayload"): void {
    this.telemetry.emit({
      name: "ws.publish.rejected",
      level: "error",
      detail: { event, reason },
    });
  }

  private emitRouteFailed(event: string, audience: WebSocketAudience, cause: unknown): void {
    this.telemetry.emit({
      name: "ws.fanout.route.failed",
      level: "error",
      detail: { event, audienceType: audience.type, errorType: describeError(cause) },
    });
  }

  private emitFanOutResolved(
    audience: WebSocketAudience,
    localTargetCount: number,
    remoteNodeCount: number,
  ): void {
    this.telemetry.emit({
      name: "ws.fanout.resolved",
      level: "debug",
      detail: { localTargetCount, remoteNodeCount },
    });
    this.telemetry.recordMetric({
      name: "sonamu.ws.fanout.targets",
      kind: "histogram",
      value: localTargetCount + remoteNodeCount,
      unit: "1",
      tags: { audience_type: audience.type },
    });
  }

  private enqueueFanOut(targets: FanOutTarget[], event: string): void {
    if (targets.length === 0) {
      return;
    }

    this.pendingFanOutJobs.push({
      targets,
      event,
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
          this.safeSend(job.targets[job.cursor], job.event);
          job.cursor += 1;
          processed += 1;
        }

        if (job.cursor >= job.targets.length) {
          this.pendingFanOutJobs.shift();
        }
      }
    } catch (error) {
      status = "error";
      errorType = describeError(error);
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

  private safeSend(target: FanOutTarget, event: string): void {
    const { connection, frame } = target;
    try {
      if (!connection.closed) {
        connection.sendFrame(event, frame);
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

// 원격에서 온 frames는 prototype 키를 무시하고 자기 속성만 읽는다
function getOwnFrame(frames: Record<string, string>, routeKey: string): string | undefined {
  return Object.hasOwn(frames, routeKey) ? frames[routeKey] : undefined;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.name : runtimeTypeOf(cause);
}
