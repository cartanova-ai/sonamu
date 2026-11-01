import { type z } from "zod";

import { runtimeTypeOf } from "../runtime-type";
import { isFunctionValue } from "../utils/runtime-value";
import { WebSocketAudience, type WebSocketAudience as WebSocketAudienceSpec } from "./ws-audience";
import { WebSocketAudienceResolver } from "./ws-audience-resolver";
import { NoopWebSocketClusterBus, type WebSocketClusterBus } from "./ws-cluster-bus";
import {
  type ManagedWebSocketConnection,
  type MaybePromise,
  type WebSocketFrameConnection,
  type WebSocketRegistryStats,
  type WebSocketRoomId,
  type WebSocketUserId,
} from "./ws-core";
import { WebSocketDeliveryEngine, type WebSocketRouteDefinition } from "./ws-delivery";
import { WebSocketLocalConnectionStore } from "./ws-local-connection-store";
import { WebSocketPresenceIndex } from "./ws-presence-index";
import {
  InMemoryWebSocketPresenceStore,
  type WebSocketPresenceStore,
  type WebSocketSessionPresence,
} from "./ws-presence-store";
import {
  type TelemetryContextProvider,
  NoopWebSocketTelemetryController,
  type WebSocketTelemetryConnectionContext,
  type WebSocketTelemetryController,
} from "./ws-telemetry";

export type {
  ManagedWebSocketConnection,
  WebSocketRegistryStats,
  WebSocketRoomId,
  WebSocketUserId,
};
export type WebSocketLeaveUserResult = {
  localLeftCount: number;
  // 발행 성공 여부와 무관하게 전송을 시도한 원격 노드 수
  targetNodeCount: number;
  // 로컬 store 반영, 노드 조회 또는 제어 메시지 발행이 실패했으면 true
  partial: boolean;
};

export type WebSocketConnectionMeta = WebSocketSessionPresence;
export type WebSocketRoomMemberCount = {
  count: number;
  // store 조회에 실패해 노드 로컬 수로 대체했으면 true
  partial: boolean;
};

const DEFAULT_DRAIN_TIMEOUT_MS = 5000;

type StoreMutationOperation =
  | "register"
  | "activate"
  | "unregister"
  | "setUserId"
  | "clearUserId"
  | "join"
  | "leave";

export type WebSocketRegistryOptions = {
  // 분산 환경에서 노드 간 라우팅 식별자로 쓰이므로 반드시 호출 측(WebSocketRuntime)에서 결정해 넘긴다
  nodeId: string;
  presenceStore?: WebSocketPresenceStore;
  clusterBus?: WebSocketClusterBus;
  telemetryController?: WebSocketTelemetryController;
  // shutdown 시 진행 중인 store mutation과 publish를 기다리는 상한
  drainTimeoutMs?: number;
};

/**
 * 노드 로컬 presence를 메모리에 소유하고, 설정된 store에는 세션별 순서대로 replica를 반영한다.
 * mutation과 publish는 호출 시점에 메모리를 동기로 갱신하고, store 실패는 telemetry로만 기록하며 reject하지 않는다.
 */
export class WebSocketRegistry {
  readonly nodeId: string;
  readonly localConnections = new WebSocketLocalConnectionStore();
  readonly presenceStore: WebSocketPresenceStore;
  readonly clusterBus: WebSocketClusterBus;
  readonly telemetryController: WebSocketTelemetryController;
  private readonly memory = new WebSocketPresenceIndex();
  private readonly deliveryEngine: WebSocketDeliveryEngine;
  private readonly drainTimeoutMs: number;
  // 세션별 store mutation 큐의 꼬리. 같은 세션의 호출은 이 promise 뒤에 이어 붙어 호출 순서대로 store에 도달한다
  private readonly mutationQueues = new Map<string, Promise<void>>();

  constructor(options: WebSocketRegistryOptions) {
    this.nodeId = options.nodeId;
    this.presenceStore = options.presenceStore ?? new InMemoryWebSocketPresenceStore();
    this.clusterBus = options.clusterBus ?? new NoopWebSocketClusterBus();
    this.drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
    assertMatchingNodeId("presenceStore", this.presenceStore.nodeId, this.nodeId);
    assertMatchingNodeId("clusterBus", this.clusterBus.nodeId, this.nodeId);
    this.telemetryController =
      options.telemetryController ?? new NoopWebSocketTelemetryController();
    this.deliveryEngine = new WebSocketDeliveryEngine({
      nodeId: this.nodeId,
      localConnections: this.localConnections,
      resolveLocalSessionIds: (audience) =>
        this.memory.queryAudience(audience).map((session) => session.sessionId),
      leaveLocalUser: (userId, roomId, namespace) => this.leaveLocalUser(userId, roomId, namespace),
      resolveControlNodeIds: async (userId, namespace) => {
        const nodes = this.presenceStore.getLiveNodeIds
          ? await this.presenceStore.getLiveNodeIds()
          : (
              await this.presenceStore.resolveRoute(
                WebSocketAudience.user(userId, namespace),
                this.nodeId,
              )
            ).remoteNodeIds;
        return [...new Set(nodes)].filter((nodeId) => nodeId !== this.nodeId);
      },
      audienceResolver: new WebSocketAudienceResolver({
        nodeId: this.nodeId,
        presenceStore: this.presenceStore,
      }),
      clusterBus: this.clusterBus,
      telemetryController: this.telemetryController,
    });

    // telemetry는 노드 로컬 메모리만 집계한다. 클러스터 합계를 모든 노드가 보고하면 집계 시 중복되기 때문이다
    this.telemetryController.registerMetricSource({
      collect: (_now) => {
        const stats = this.memory.getStats();
        const localSnapshot = this.localConnections.getTelemetrySnapshot();
        return {
          activeConnections: stats.totalConnections,
          activeConnectionsByNamespace: stats.byNamespace,
          roomCount: stats.totalRooms,
          pendingInboundMessages: localSnapshot.pendingInboundMessages,
          pendingOutboundMessages: localSnapshot.pendingOutboundMessages,
          socketBufferedBytes: localSnapshot.socketBufferedBytes,
        };
      },
    });
  }

  registerRoute(routeKey: string, outEvents: z.ZodObject): void {
    this.deliveryEngine.registerRoute(routeKey, outEvents);
  }

  replaceRoutes(routes: WebSocketRouteDefinition[]): void {
    this.deliveryEngine.replaceRoutes(routes);
  }

  /**
   * 연결을 메모리에 즉시 등록하고 store.register가 끝나면 resolve한다.
   * store가 실패해도 메모리 전용 등록으로 resolve한다.
   */
  async register(
    connection: WebSocketFrameConnection,
    active: boolean = true,
  ): Promise<WebSocketConnectionMeta> {
    const registration = {
      sessionId: connection.id,
      nodeId: this.nodeId,
      namespace: connection.namespace,
      active,
      connectedAt: new Date(),
    };
    this.localConnections.register(connection);
    this.memory.register(registration);
    this.telemetryController.emit({
      name: "ws.connection.registered",
      level: "info",
      connectionId: connection.id,
      namespace: connection.namespace,
      userId: connection.userId,
      ...getConnectionTelemetryContext(connection),
    });
    this.telemetryController.recordMetric({
      name: "sonamu.ws.connections",
      kind: "counter",
      value: 1,
      unit: "1",
      tags: { outcome: "registered", namespace: connection.namespace },
      userId: connection.userId,
    });

    await this.enqueueStoreMutation(connection.id, "register", () =>
      this.presenceStore.register(registration),
    );
    // 등록 도중 닫혔으면 메모리에서 이미 빠졌으므로 등록 시점 값을 돌려준다
    return (
      this.memory.getConnection(connection.id) ?? {
        ...registration,
        rooms: new Set(),
        lastSeenAt: registration.connectedAt,
      }
    );
  }

  activate(connectionId: string): Promise<void> {
    if (!this.memory.has(connectionId)) {
      this.emitMutationSkipped(connectionId, { operation: "activate" });
      return Promise.resolve();
    }

    this.memory.activate(connectionId);
    const connection = this.localConnections.getConnection(connectionId);
    this.telemetryController.emit({
      name: "ws.connection.activated",
      level: "info",
      connectionId,
      userId: connection?.userId,
      ...getConnectionTelemetryContext(connection),
    });
    return this.enqueueStoreMutation(connectionId, "activate", () =>
      this.presenceStore.activate(connectionId),
    );
  }

  unregister(connectionId: string): Promise<void> {
    const connection = this.localConnections.getConnection(connectionId);
    const telemetryContext = getConnectionTelemetryContext(connection);
    const meta = this.memory.unregister(connectionId);
    const userId = connection?.userId ?? formatUserId(meta?.userId);
    this.localConnections.unregister(connectionId);
    this.telemetryController.emit({
      name: "ws.connection.unregistered",
      level: "debug",
      connectionId,
      namespace: meta?.namespace,
      userId,
      ...telemetryContext,
    });
    if (!meta) {
      return Promise.resolve();
    }

    this.telemetryController.recordMetric({
      name: "sonamu.ws.connections",
      kind: "counter",
      value: 1,
      unit: "1",
      tags: { outcome: "unregistered", namespace: meta.namespace },
      userId,
    });
    // 같은 세션 큐에 이어 붙으므로 진행 중인 register보다 먼저 store에 도달하지 않는다
    return this.enqueueStoreMutation(connectionId, "unregister", () =>
      this.presenceStore.unregister(connectionId),
    );
  }

  // lastSeenAt은 메모리만 갱신한다. store에는 마지막 mutation 시점 값이 남는다
  touch(connectionId: string): void {
    this.memory.touch(connectionId);
  }

  setUserId(connectionId: string, userId: WebSocketUserId): Promise<void> {
    const meta = this.memory.getConnection(connectionId);
    if (!meta) {
      this.emitMutationSkipped(connectionId, { operation: "setUserId", userId });
      return Promise.resolve();
    }

    this.memory.setUserId(connectionId, userId);
    this.telemetryController.emit({
      name: "ws.user.bound",
      level: "debug",
      connectionId,
      namespace: meta.namespace,
      userId: String(userId),
      detail: { userId },
      ...getConnectionTelemetryContext(this.localConnections.getConnection(connectionId)),
    });
    return this.enqueueStoreMutation(connectionId, "setUserId", () =>
      this.presenceStore.setUserId(connectionId, userId),
    );
  }

  clearUserId(connectionId: string): Promise<void> {
    const meta = this.memory.getConnection(connectionId);
    if (!meta) {
      this.emitMutationSkipped(connectionId, { operation: "clearUserId" });
      return Promise.resolve();
    }

    const userId = meta.userId;
    this.memory.clearUserId(connectionId);
    this.telemetryController.emit({
      name: "ws.user.cleared",
      level: "debug",
      connectionId,
      namespace: meta.namespace,
      userId: formatUserId(userId),
      detail: userId !== undefined ? { userId } : undefined,
      ...getConnectionTelemetryContext(this.localConnections.getConnection(connectionId)),
    });
    return this.enqueueStoreMutation(connectionId, "clearUserId", () =>
      this.presenceStore.clearUserId(connectionId),
    );
  }

  join(connectionId: string, roomId: WebSocketRoomId): Promise<void> {
    const meta = this.memory.getConnection(connectionId);
    if (!meta) {
      this.emitMutationSkipped(connectionId, { operation: "join", roomId });
      return Promise.resolve();
    }

    this.memory.join(connectionId, roomId);
    const connection = this.localConnections.getConnection(connectionId);
    this.telemetryController.emit({
      name: "ws.room.joined",
      level: "debug",
      connectionId,
      namespace: meta.namespace,
      userId: connection?.userId ?? formatUserId(meta.userId),
      detail: { roomId },
      ...getConnectionTelemetryContext(connection),
    });
    return this.enqueueStoreMutation(connectionId, "join", () =>
      this.presenceStore.join(connectionId, roomId),
    );
  }

  leave(connectionId: string, roomId: WebSocketRoomId): Promise<void> {
    return this.leaveSession(connectionId, roomId);
  }

  /**
   * 사용자의 모든 로컬 세션을 방에서 즉시 제거하고, live 노드에 같은 퇴장을 요청한다.
   * namespace 생략 또는 빈 문자열은 전체 namespace를 뜻한다. 원격 적용 완료를 확인하는 응답은 기다리지 않는다.
   */
  leaveUser(
    userId: WebSocketUserId,
    roomId: WebSocketRoomId,
    namespace?: string,
  ): Promise<WebSocketLeaveUserResult> {
    const local = this.leaveLocalUser(userId, roomId, namespace);
    // 로컬 변경 직후 큐 자리를 확보해 뒤따르는 publish가 제어 메시지를 앞지르지 못하게 한다
    const remote = this.deliveryEngine.publishLeaveUser(userId, roomId, namespace);
    return Promise.all([local.completion, remote]).then(([localPartial, result]) => {
      const summary = {
        localLeftCount: local.localLeftCount,
        targetNodeCount: result.targetNodeCount,
        partial: localPartial || result.partial,
      };
      this.telemetryController.emit({
        name: "ws.room.user_left",
        level: "info",
        detail: { userId, roomId, namespace, ...summary },
      });
      return summary;
    });
  }

  private leaveLocalUser(userId: WebSocketUserId, roomId: WebSocketRoomId, namespace?: string) {
    let partial = false;
    const sessions = this.memory
      .getUserSessions(userId, namespace)
      .filter((session) => session.rooms.has(roomId));
    const mutations = sessions.map((session) =>
      this.leaveSession(session.sessionId, roomId, () => {
        partial = true;
      }),
    );
    return {
      localLeftCount: sessions.length,
      completion: Promise.all(mutations).then(() => partial),
    };
  }

  private leaveSession(
    connectionId: string,
    roomId: WebSocketRoomId,
    onFailed?: () => void,
  ): Promise<void> {
    const meta = this.memory.getConnection(connectionId);
    if (!meta) {
      this.emitMutationSkipped(connectionId, { operation: "leave", roomId });
      return Promise.resolve();
    }

    this.memory.leave(connectionId, roomId);
    const connection = this.localConnections.getConnection(connectionId);
    this.telemetryController.emit({
      name: "ws.room.left",
      level: "debug",
      connectionId,
      namespace: meta.namespace,
      userId: connection?.userId ?? formatUserId(meta.userId),
      detail: { roomId },
      ...getConnectionTelemetryContext(connection),
    });
    return this.enqueueStoreMutation(
      connectionId,
      "leave",
      () => this.presenceStore.leave(connectionId, roomId),
      onFailed,
    );
  }

  broadcast<Data>(event: string, data: Data, namespace?: string): Promise<void> {
    return this.publishToAudience(WebSocketAudience.all(namespace), event, data);
  }

  publishToRoom<Data>(
    roomId: WebSocketRoomId,
    event: string,
    data: Data,
    namespace?: string,
  ): Promise<void> {
    return this.publishToAudience(WebSocketAudience.room(roomId, namespace), event, data);
  }

  publishToUser<Data>(
    userId: WebSocketUserId,
    event: string,
    data: Data,
    namespace?: string,
  ): Promise<void> {
    return this.publishToAudience(WebSocketAudience.user(userId, namespace), event, data);
  }

  publishToAudience<Data>(
    audience: WebSocketAudienceSpec,
    event: string,
    data: Data,
  ): Promise<void> {
    return this.deliveryEngine.publishToAudience(audience, event, data);
  }

  // 아래 읽기 API는 노드 로컬 snapshot(복사본)이다
  getConnection(connectionId: string): WebSocketConnectionMeta | undefined {
    return this.memory.getConnection(connectionId);
  }

  getConnectionCount(namespace?: string): number {
    return this.memory.getConnectionCount(namespace);
  }

  getRoomMembers(roomId: WebSocketRoomId, namespace?: string): WebSocketConnectionMeta[] {
    return this.memory.getRoomMembers(roomId, namespace);
  }

  getStats(): WebSocketRegistryStats {
    return this.memory.getStats();
  }

  /**
   * 클러스터 전체의 활성 방 인원수. store가 실패하면 노드 로컬 수에 partial: true를 붙여 반환하며 reject하지 않는다.
   */
  async getRoomMemberCount(
    roomId: WebSocketRoomId,
    namespace?: string,
  ): Promise<WebSocketRoomMemberCount> {
    try {
      const count = await callStore(() => this.presenceStore.getRoomMemberCount(roomId, namespace));
      return { count, partial: false };
    } catch (cause) {
      this.telemetryController.emit({
        name: "ws.registry.read.failed",
        level: "warn",
        detail: { operation: "getRoomMemberCount", roomId, errorType: describeError(cause) },
      });
      return { count: this.memory.getRoomMemberCount(roomId, namespace), partial: true };
    }
  }

  closeAll(code?: number, reason?: string): void {
    this.localConnections.closeAll(code, reason);
  }

  /**
   * 로컬 연결을 닫고, 진행 중인 store mutation과 publish를 drainTimeoutMs까지 기다린 뒤 store와 bus를 종료한다.
   */
  async shutdown(code?: number, reason?: string): Promise<void> {
    this.closeAll(code, reason);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.drainTimeoutMs);
    });
    try {
      await Promise.race([
        Promise.all([...this.mutationQueues.values(), this.deliveryEngine.drainPublishes()]),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }

    try {
      await callStore(() => this.presenceStore.shutdown?.());
    } catch (cause) {
      this.telemetryController.emit({
        name: "ws.registry.shutdown.failed",
        level: "error",
        detail: { errorType: describeError(cause) },
      });
    }
    // 구독 해제는 drain이 끝났으므로 즉시 포기할 수 있게 이미 끝난 deadline을 넘긴다
    await this.deliveryEngine.shutdown(Promise.resolve());
  }

  /**
   * 세션별 큐 뒤에 store 호출을 이어 붙인다. 실패는 telemetry로만 기록하고, 반환한 promise는 reject하지 않는다.
   */
  private enqueueStoreMutation(
    sessionId: string,
    operation: StoreMutationOperation,
    call: () => MaybePromise<void>,
    onFailed?: () => void,
  ): Promise<void> {
    const previous = this.mutationQueues.get(sessionId) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(call)
      .then(
        () => undefined,
        (cause: unknown) => {
          onFailed?.();
          this.telemetryController.emit({
            name: "ws.registry.mutation.failed",
            level: "warn",
            connectionId: sessionId,
            detail: { operation, errorType: describeError(cause) },
          });
        },
      )
      .then(() => {
        // 마지막 mutation이 끝나면 큐를 비워 세션 수만큼 promise가 쌓이지 않게 한다
        if (this.mutationQueues.get(sessionId) === next) {
          this.mutationQueues.delete(sessionId);
        }
      });
    this.mutationQueues.set(sessionId, next);
    return next;
  }

  private emitMutationSkipped(
    connectionId: string,
    detail: {
      operation: "activate" | "setUserId" | "clearUserId" | "join" | "leave";
      roomId?: WebSocketRoomId;
      userId?: WebSocketUserId;
    },
  ): void {
    this.telemetryController.emit({
      name: "ws.registry.mutation.skipped",
      level: "debug",
      connectionId,
      detail: { ...detail, reason: "connectionMissing" },
    });
  }
}

// store 호출의 동기 throw를 rejection으로 바꾼다
function callStore<T>(call: () => MaybePromise<T>): Promise<T> {
  return Promise.resolve().then(call);
}

function assertMatchingNodeId(
  source: "presenceStore" | "clusterBus",
  sourceNodeId: string | undefined,
  nodeId: string,
): void {
  if (sourceNodeId !== undefined && sourceNodeId !== nodeId) {
    throw new Error(
      `WebSocket ${source}.nodeId (${sourceNodeId}) must match the runtime nodeId (${nodeId}).`,
    );
  }
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.name : runtimeTypeOf(cause);
}

function getConnectionTelemetryContext(
  connection: ManagedWebSocketConnection | undefined,
): WebSocketTelemetryConnectionContext {
  if (!connection || !isTelemetryContextProvider(connection)) {
    return {};
  }

  return connection.getTelemetryContext();
}

// telemetry record의 userId는 string 정규화 — presence는 number | string 그대로 보관함
function formatUserId(userId: WebSocketUserId | undefined): string | undefined {
  return userId === undefined ? undefined : String(userId);
}

function isTelemetryContextProvider(
  connection: ManagedWebSocketConnection,
): connection is ManagedWebSocketConnection & TelemetryContextProvider {
  return "getTelemetryContext" in connection && isFunctionValue(connection.getTelemetryContext);
}
