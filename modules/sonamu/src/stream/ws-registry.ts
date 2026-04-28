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

export type {
  ManagedWebSocketConnection,
  WebSocketRegistryStats,
  WebSocketRoomId,
  WebSocketUserId,
};
export type WebSocketConnectionMeta = WebSocketSessionPresence;

export type WebSocketRegistryOptions = {
  nodeId?: string;
  presenceStore?: WebSocketPresenceStore;
  clusterBus?: WebSocketClusterBus;
};

export class WebSocketRegistry {
  readonly nodeId: string;
  readonly localConnections = new WebSocketLocalConnectionStore();
  readonly presenceStore: WebSocketPresenceStore;
  readonly clusterBus: WebSocketClusterBus;
  readonly audienceResolver: WebSocketAudienceResolver;
  readonly deliveryEngine: WebSocketDeliveryEngine;

  constructor(options: WebSocketRegistryOptions = {}) {
    this.nodeId = options.nodeId ?? "local";
    this.presenceStore = options.presenceStore ?? new InMemoryWebSocketPresenceStore();
    this.clusterBus = options.clusterBus ?? new NoopWebSocketClusterBus();
    this.audienceResolver = new WebSocketAudienceResolver({
      nodeId: this.nodeId,
      presenceStore: this.presenceStore,
    });
    this.deliveryEngine = new WebSocketDeliveryEngine({
      nodeId: this.nodeId,
      localConnections: this.localConnections,
      audienceResolver: this.audienceResolver,
      clusterBus: this.clusterBus,
    });
  }

  register(
    connection: ManagedWebSocketConnection,
    active: boolean = true,
  ): WebSocketConnectionMeta {
    this.localConnections.register(connection);
    return this.presenceStore.register({
      sessionId: connection.id,
      nodeId: this.nodeId,
      namespace: connection.namespace,
      active,
    });
  }

  activate(connectionId: string): void {
    this.presenceStore.activate(connectionId);
  }

  unregister(connectionId: string): void {
    this.presenceStore.unregister(connectionId);
    this.localConnections.unregister(connectionId);
  }

  touch(connectionId: string): void {
    this.presenceStore.touch(connectionId);
  }

  setUserId(connectionId: string, userId: WebSocketUserId): void {
    this.presenceStore.setUserId(connectionId, userId);
  }

  clearUserId(connectionId: string): void {
    this.presenceStore.clearUserId(connectionId);
  }

  join(connectionId: string, roomId: WebSocketRoomId): void {
    this.presenceStore.join(connectionId, roomId);
  }

  leave(connectionId: string, roomId: WebSocketRoomId): void {
    this.presenceStore.leave(connectionId, roomId);
  }

  broadcast(event: string, data: unknown, namespace?: string): void {
    this.publishToAudience(WebSocketAudience.all(namespace), event, data);
  }

  publishToRoom(roomId: WebSocketRoomId, event: string, data: unknown, namespace?: string): void {
    this.publishToAudience(WebSocketAudience.room(roomId, namespace), event, data);
  }

  publishToUser(userId: WebSocketUserId, event: string, data: unknown, namespace?: string): void {
    this.publishToAudience(WebSocketAudience.user(userId, namespace), event, data);
  }

  publishToAudience(audience: WebSocketAudienceSpec, event: string, data: unknown): void {
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
