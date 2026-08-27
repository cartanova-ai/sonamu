import { isFunctionValue } from "../utils/runtime-value";
import { WebSocketAudience, type WebSocketAudience as WebSocketAudienceSpec } from "./ws-audience";
import { WebSocketAudienceResolver } from "./ws-audience-resolver";
import { NoopWebSocketClusterBus, type WebSocketClusterBus } from "./ws-cluster-bus";
import {
  type ManagedWebSocketConnection,
  type WebSocketRegistryStats,
  type WebSocketRoomId,
  type WebSocketUserId,
} from "./ws-core";
import { WebSocketDeliveryEngine } from "./ws-delivery";
import { WebSocketLocalConnectionStore } from "./ws-local-connection-store";
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
export type WebSocketConnectionMeta = WebSocketSessionPresence;

export type WebSocketRegistryOptions = {
  // 분산 환경에서 노드 간 라우팅 식별자로 쓰이므로 반드시 호출 측(WebSocketRuntime)에서 결정해 넘긴다
  nodeId: string;
  presenceStore?: WebSocketPresenceStore;
  clusterBus?: WebSocketClusterBus;
  telemetryController?: WebSocketTelemetryController;
};

export class WebSocketRegistry {
  readonly nodeId: string;
  readonly localConnections = new WebSocketLocalConnectionStore();
  readonly presenceStore: WebSocketPresenceStore;
  readonly clusterBus: WebSocketClusterBus;
  readonly audienceResolver: WebSocketAudienceResolver;
  readonly deliveryEngine: WebSocketDeliveryEngine;
  readonly telemetryController: WebSocketTelemetryController;

  constructor(options: WebSocketRegistryOptions) {
    this.nodeId = options.nodeId;
    this.presenceStore = options.presenceStore ?? new InMemoryWebSocketPresenceStore();
    this.clusterBus = options.clusterBus ?? new NoopWebSocketClusterBus();
    this.telemetryController =
      options.telemetryController ?? new NoopWebSocketTelemetryController();
    this.audienceResolver = new WebSocketAudienceResolver({
      nodeId: this.nodeId,
      presenceStore: this.presenceStore,
    });
    this.deliveryEngine = new WebSocketDeliveryEngine({
      nodeId: this.nodeId,
      localConnections: this.localConnections,
      audienceResolver: this.audienceResolver,
      clusterBus: this.clusterBus,
      telemetryController: this.telemetryController,
    });

    this.telemetryController.registerMetricSource({
      collect: (_now) => {
        const stats = this.presenceStore.getStats();
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

  register(
    connection: ManagedWebSocketConnection,
    active: boolean = true,
  ): WebSocketConnectionMeta {
    this.localConnections.register(connection);
    const meta = this.presenceStore.register({
      sessionId: connection.id,
      nodeId: this.nodeId,
      namespace: connection.namespace,
      active,
    });
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
    return meta;
  }

  activate(connectionId: string): void {
    if (!this.presenceStore.getConnection(connectionId)) {
      this.emitMutationSkipped(connectionId, { operation: "activate" });
      return;
    }

    this.presenceStore.activate(connectionId);
    const connection = this.localConnections.getConnection(connectionId);
    this.telemetryController.emit({
      name: "ws.connection.activated",
      level: "info",
      connectionId,
      userId: connection?.userId,
      ...getConnectionTelemetryContext(connection),
    });
  }

  unregister(connectionId: string): void {
    const connection = this.localConnections.getConnection(connectionId);
    const telemetryContext = getConnectionTelemetryContext(connection);
    const userId =
      connection?.userId ?? formatUserId(this.presenceStore.getConnection(connectionId)?.userId);
    const meta = this.presenceStore.unregister(connectionId);
    this.localConnections.unregister(connectionId);
    this.telemetryController.emit({
      name: "ws.connection.unregistered",
      level: "debug",
      connectionId,
      namespace: meta?.namespace,
      userId,
      ...telemetryContext,
    });
    if (meta) {
      this.telemetryController.recordMetric({
        name: "sonamu.ws.connections",
        kind: "counter",
        value: 1,
        unit: "1",
        tags: { outcome: "unregistered", namespace: meta.namespace },
        userId,
      });
    }
  }

  touch(connectionId: string): void {
    this.presenceStore.touch(connectionId);
  }

  setUserId(connectionId: string, userId: WebSocketUserId): void {
    if (!this.presenceStore.getConnection(connectionId)) {
      this.emitMutationSkipped(connectionId, { operation: "setUserId", userId });
      return;
    }

    this.presenceStore.setUserId(connectionId, userId);
    const meta = this.presenceStore.getConnection(connectionId);
    this.telemetryController.emit({
      name: "ws.user.bound",
      level: "debug",
      connectionId,
      namespace: meta?.namespace,
      userId: String(userId),
      detail: { userId },
      ...getConnectionTelemetryContext(this.localConnections.getConnection(connectionId)),
    });
  }

  clearUserId(connectionId: string): void {
    const meta = this.presenceStore.getConnection(connectionId);
    if (!meta) {
      this.emitMutationSkipped(connectionId, { operation: "clearUserId" });
      return;
    }

    const userId = meta.userId;
    this.presenceStore.clearUserId(connectionId);
    this.telemetryController.emit({
      name: "ws.user.cleared",
      level: "debug",
      connectionId,
      namespace: meta.namespace,
      userId: formatUserId(userId),
      detail: userId !== undefined ? { userId } : undefined,
      ...getConnectionTelemetryContext(this.localConnections.getConnection(connectionId)),
    });
  }

  join(connectionId: string, roomId: WebSocketRoomId): void {
    if (!this.presenceStore.getConnection(connectionId)) {
      this.emitMutationSkipped(connectionId, { operation: "join", roomId });
      return;
    }

    this.presenceStore.join(connectionId, roomId);
    const meta = this.presenceStore.getConnection(connectionId);
    const connection = this.localConnections.getConnection(connectionId);
    this.telemetryController.emit({
      name: "ws.room.joined",
      level: "debug",
      connectionId,
      namespace: meta?.namespace,
      userId: connection?.userId ?? formatUserId(meta?.userId),
      detail: { roomId },
      ...getConnectionTelemetryContext(connection),
    });
  }

  leave(connectionId: string, roomId: WebSocketRoomId): void {
    const meta = this.presenceStore.getConnection(connectionId);
    if (!meta) {
      this.emitMutationSkipped(connectionId, { operation: "leave", roomId });
      return;
    }

    this.presenceStore.leave(connectionId, roomId);
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

  broadcast<Data>(event: string, data: Data, namespace?: string): void {
    this.publishToAudience(WebSocketAudience.all(namespace), event, data);
  }

  publishToRoom<Data>(
    roomId: WebSocketRoomId,
    event: string,
    data: Data,
    namespace?: string,
  ): void {
    this.publishToAudience(WebSocketAudience.room(roomId, namespace), event, data);
  }

  publishToUser<Data>(
    userId: WebSocketUserId,
    event: string,
    data: Data,
    namespace?: string,
  ): void {
    this.publishToAudience(WebSocketAudience.user(userId, namespace), event, data);
  }

  publishToAudience<Data>(audience: WebSocketAudienceSpec, event: string, data: Data): void {
    this.deliveryEngine.publishToAudience(audience, event, data);
  }

  getConnection(connectionId: string): WebSocketConnectionMeta | undefined {
    return this.presenceStore.getConnection(connectionId);
  }

  getConnectionCount(namespace?: string): number {
    return this.presenceStore.getConnectionCount(namespace);
  }

  getRoomMembers(roomId: WebSocketRoomId, namespace?: string): WebSocketConnectionMeta[] {
    return this.presenceStore.getRoomMembers(roomId, namespace);
  }

  getStats(): WebSocketRegistryStats {
    return this.presenceStore.getStats();
  }

  closeAll(code?: number, reason?: string): void {
    this.localConnections.closeAll(code, reason);
  }

  async shutdown(code?: number, reason?: string): Promise<void> {
    this.closeAll(code, reason);
    await this.deliveryEngine.shutdown();
  }
}

function getConnectionTelemetryContext(
  connection: ManagedWebSocketConnection | undefined,
): WebSocketTelemetryConnectionContext {
  if (!connection || !isTelemetryContextProvider(connection)) {
    return {};
  }

  return connection.getTelemetryContext();
}

// telemetry record의 userId는 string 정규화 — presence store는 number | string 그대로 보관함
function formatUserId(userId: WebSocketUserId | undefined): string | undefined {
  return userId === undefined ? undefined : String(userId);
}

function isTelemetryContextProvider(
  connection: ManagedWebSocketConnection,
): connection is ManagedWebSocketConnection & TelemetryContextProvider {
  return "getTelemetryContext" in connection && isFunctionValue(connection.getTelemetryContext);
}
