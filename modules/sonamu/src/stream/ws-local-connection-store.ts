import { type ManagedWebSocketConnection } from "./ws-core";

export class WebSocketLocalConnectionStore {
  private readonly connections = new Map<string, ManagedWebSocketConnection>();

  register(connection: ManagedWebSocketConnection): void {
    this.connections.set(connection.id, connection);
  }

  unregister(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  getConnection(connectionId: string): ManagedWebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  getConnections(connectionIds: string[]): ManagedWebSocketConnection[] {
    const targets: ManagedWebSocketConnection[] = [];
    const seen = new Set<string>();

    for (const connectionId of connectionIds) {
      if (seen.has(connectionId)) {
        continue;
      }
      seen.add(connectionId);

      const connection = this.connections.get(connectionId);
      if (!connection || connection.closed) {
        continue;
      }

      targets.push(connection);
    }

    return targets;
  }

  closeAll(code?: number, reason?: string): void {
    for (const connection of this.connections.values()) {
      connection.close(code, reason);
    }
  }
}
