import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketRegistryStats, type WebSocketRoomId, type WebSocketUserId } from "./ws-core";

export type WebSocketSessionPresence = {
  sessionId: string;
  nodeId: string;
  namespace: string;
  active: boolean;
  rooms: Set<WebSocketRoomId>;
  connectedAt: Date;
  lastSeenAt: Date;
  userId?: WebSocketUserId;
};

export interface WebSocketPresenceStore {
  register(input: {
    sessionId: string;
    nodeId: string;
    namespace: string;
    active?: boolean;
  }): WebSocketSessionPresence;
  activate(sessionId: string): void;
  unregister(sessionId: string): WebSocketSessionPresence | undefined;
  touch(sessionId: string): void;
  setUserId(sessionId: string, userId: WebSocketUserId): void;
  clearUserId(sessionId: string): void;
  join(sessionId: string, roomId: WebSocketRoomId): void;
  leave(sessionId: string, roomId: WebSocketRoomId): void;
  getConnection(sessionId: string): WebSocketSessionPresence | undefined;
  getConnectionCount(namespace?: string): number;
  getRoomMembers(roomId: WebSocketRoomId, namespace?: string): WebSocketSessionPresence[];
  getStats(): WebSocketRegistryStats;
  queryAudience(audience: WebSocketAudience): WebSocketSessionPresence[];
}

export class InMemoryWebSocketPresenceStore implements WebSocketPresenceStore {
  private readonly connections = new Map<string, WebSocketSessionPresence>();
  private readonly rooms = new Map<string, Set<string>>();
  private readonly users = new Map<string, Set<string>>();

  register(input: {
    sessionId: string;
    nodeId: string;
    namespace: string;
    active?: boolean;
  }): WebSocketSessionPresence {
    const meta: WebSocketSessionPresence = {
      sessionId: input.sessionId,
      nodeId: input.nodeId,
      namespace: input.namespace,
      active: input.active ?? true,
      rooms: new Set(),
      connectedAt: new Date(),
      lastSeenAt: new Date(),
    };
    this.connections.set(input.sessionId, meta);
    return meta;
  }

  activate(sessionId: string): void {
    const meta = this.connections.get(sessionId);
    if (!meta) {
      return;
    }

    meta.active = true;
  }

  unregister(sessionId: string): WebSocketSessionPresence | undefined {
    const meta = this.connections.get(sessionId);
    if (!meta) {
      return undefined;
    }

    if (meta.userId !== undefined) {
      this.removeUserBinding(meta.namespace, meta.userId, sessionId);
    }

    for (const roomId of meta.rooms) {
      this.removeRoomBinding(meta.namespace, roomId, sessionId);
    }

    this.connections.delete(sessionId);
    return meta;
  }

  touch(sessionId: string): void {
    const meta = this.connections.get(sessionId);
    if (!meta) {
      return;
    }

    meta.lastSeenAt = new Date();
  }

  setUserId(sessionId: string, userId: WebSocketUserId): void {
    const meta = this.connections.get(sessionId);
    if (!meta) {
      return;
    }

    if (meta.userId !== undefined) {
      this.removeUserBinding(meta.namespace, meta.userId, sessionId);
    }

    meta.userId = userId;
    const key = getBindingKey(meta.namespace, String(userId));
    const bound = this.users.get(key) ?? new Set<string>();
    bound.add(sessionId);
    this.users.set(key, bound);
  }

  clearUserId(sessionId: string): void {
    const meta = this.connections.get(sessionId);
    if (!meta || meta.userId === undefined) {
      return;
    }

    this.removeUserBinding(meta.namespace, meta.userId, sessionId);
    delete meta.userId;
  }

  join(sessionId: string, roomId: WebSocketRoomId): void {
    const meta = this.connections.get(sessionId);
    if (!meta) {
      return;
    }

    meta.rooms.add(roomId);
    const key = getBindingKey(meta.namespace, roomId);
    const members = this.rooms.get(key) ?? new Set<string>();
    members.add(sessionId);
    this.rooms.set(key, members);
  }

  leave(sessionId: string, roomId: WebSocketRoomId): void {
    const meta = this.connections.get(sessionId);
    if (!meta) {
      return;
    }

    meta.rooms.delete(roomId);
    this.removeRoomBinding(meta.namespace, roomId, sessionId);
  }

  getConnection(sessionId: string): WebSocketSessionPresence | undefined {
    return this.connections.get(sessionId);
  }

  getConnectionCount(namespace?: string): number {
    let count = 0;

    for (const meta of this.connections.values()) {
      if (!meta.active || (namespace && meta.namespace !== namespace)) {
        continue;
      }

      count += 1;
    }

    return count;
  }

  getRoomMembers(roomId: WebSocketRoomId, namespace?: string): WebSocketSessionPresence[] {
    return this.getBoundConnections(this.rooms, roomId, namespace);
  }

  getStats(): WebSocketRegistryStats {
    const byNamespace: Record<string, number> = {};

    for (const meta of this.connections.values()) {
      if (!meta.active) {
        continue;
      }
      byNamespace[meta.namespace] = (byNamespace[meta.namespace] ?? 0) + 1;
    }

    return {
      totalConnections: Object.values(byNamespace).reduce((sum, count) => sum + count, 0),
      totalRooms: this.rooms.size,
      byNamespace,
    };
  }

  queryAudience(audience: WebSocketAudience): WebSocketSessionPresence[] {
    switch (audience.type) {
      case "all":
        return this.getActiveConnections(audience.namespace);
      case "room":
        return this.getBoundConnections(this.rooms, audience.roomId, audience.namespace);
      case "user":
        return this.getBoundConnections(this.users, String(audience.userId), audience.namespace);
      case "connections": {
        const metas: WebSocketSessionPresence[] = [];

        for (const connectionId of audience.connectionIds) {
          const meta = this.connections.get(connectionId);
          if (!meta?.active) {
            continue;
          }
          if (audience.namespace && meta.namespace !== audience.namespace) {
            continue;
          }
          metas.push(meta);
        }

        return metas;
      }
      case "union": {
        const seen = new Set<string>();
        const metas: WebSocketSessionPresence[] = [];

        for (const item of audience.audiences) {
          for (const meta of this.queryAudience(item)) {
            if (seen.has(meta.sessionId)) {
              continue;
            }

            seen.add(meta.sessionId);
            metas.push(meta);
          }
        }

        return metas;
      }
    }
  }

  private getActiveConnections(namespace?: string): WebSocketSessionPresence[] {
    const metas: WebSocketSessionPresence[] = [];

    for (const meta of this.connections.values()) {
      if (!meta.active || (namespace && meta.namespace !== namespace)) {
        continue;
      }

      metas.push(meta);
    }

    return metas;
  }

  private getBoundConnections(
    bindings: Map<string, Set<string>>,
    id: string,
    namespace?: string,
  ): WebSocketSessionPresence[] {
    const metas: WebSocketSessionPresence[] = [];
    const seen = new Set<string>();

    for (const members of this.getScopedBindings(bindings, id, namespace)) {
      for (const connectionId of members) {
        if (seen.has(connectionId)) {
          continue;
        }
        seen.add(connectionId);

        const meta = this.connections.get(connectionId);
        if (meta?.active) {
          metas.push(meta);
        }
      }
    }

    return metas;
  }

  private getScopedBindings(
    bindings: Map<string, Set<string>>,
    id: string,
    namespace?: string,
  ): Set<string>[] {
    if (namespace) {
      const exact = bindings.get(getBindingKey(namespace, id));
      return exact ? [exact] : [];
    }

    const matches: Set<string>[] = [];
    for (const [key, members] of bindings) {
      const parsed = parseBindingKey(key);
      if (parsed.id === id) {
        matches.push(members);
      }
    }

    return matches;
  }

  private removeRoomBinding(namespace: string, roomId: WebSocketRoomId, sessionId: string): void {
    const key = getBindingKey(namespace, roomId);
    const members = this.rooms.get(key);
    if (!members) {
      return;
    }

    members.delete(sessionId);
    if (members.size === 0) {
      this.rooms.delete(key);
    }
  }

  private removeUserBinding(namespace: string, userId: WebSocketUserId, sessionId: string): void {
    const key = getBindingKey(namespace, String(userId));
    const members = this.users.get(key);
    if (!members) {
      return;
    }

    members.delete(sessionId);
    if (members.size === 0) {
      this.users.delete(key);
    }
  }
}

function getBindingKey(namespace: string, id: string): string {
  return `${namespace}::${id}`;
}

interface PresenceBinding {
  namespace: string;
  id: string;
}

function parseBindingKey(key: string): PresenceBinding {
  const [namespace, ...rest] = key.split("::");
  return {
    namespace,
    id: rest.join("::"),
  };
}
