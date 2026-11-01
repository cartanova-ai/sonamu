import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketRegistryStats, type WebSocketRoomId, type WebSocketUserId } from "./ws-core";
import {
  type WebSocketPresenceRegistration,
  type WebSocketSessionPresence,
} from "./ws-presence-store";

type PresenceRecord = WebSocketSessionPresence;
// namespace → 바인딩 id → 세션 ID 집합. userId는 Map 키로 그대로 써서 1과 "1"을 구분한다
type BindingIndex<Id> = Map<string, Map<Id, Set<string>>>;

/**
 * 동기 presence 인덱스. registry의 노드 로컬 메모리와 in-memory store가 함께 쓴다.
 * 외부로 내보내는 presence는 항상 복사본이다.
 */
export class WebSocketPresenceIndex {
  private readonly sessions = new Map<string, PresenceRecord>();
  private readonly rooms: BindingIndex<WebSocketRoomId> = new Map();
  private readonly users: BindingIndex<WebSocketUserId> = new Map();

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  register(input: WebSocketPresenceRegistration): void {
    // 같은 세션을 다시 등록하면 이전 바인딩을 먼저 정리해 고아 바인딩이 남지 않게 한다
    this.unregister(input.sessionId);
    this.sessions.set(input.sessionId, {
      sessionId: input.sessionId,
      nodeId: input.nodeId,
      namespace: input.namespace,
      active: input.active,
      rooms: new Set(),
      connectedAt: new Date(input.connectedAt.getTime()),
      lastSeenAt: new Date(input.connectedAt.getTime()),
    });
  }

  activate(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.active = true;
    }
  }

  unregister(sessionId: string): WebSocketSessionPresence | undefined {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return undefined;
    }

    if (record.userId !== undefined) {
      removeBinding(this.users, record.namespace, record.userId, sessionId);
    }
    for (const roomId of record.rooms) {
      removeBinding(this.rooms, record.namespace, roomId, sessionId);
    }
    this.sessions.delete(sessionId);
    return copyPresence(record);
  }

  touch(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.lastSeenAt = new Date();
    }
  }

  setUserId(sessionId: string, userId: WebSocketUserId): void {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    if (record.userId !== undefined) {
      removeBinding(this.users, record.namespace, record.userId, sessionId);
    }
    record.userId = userId;
    addBinding(this.users, record.namespace, userId, sessionId);
  }

  clearUserId(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (!record || record.userId === undefined) {
      return;
    }

    removeBinding(this.users, record.namespace, record.userId, sessionId);
    delete record.userId;
  }

  join(sessionId: string, roomId: WebSocketRoomId): void {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    record.rooms.add(roomId);
    addBinding(this.rooms, record.namespace, roomId, sessionId);
  }

  leave(sessionId: string, roomId: WebSocketRoomId): void {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    record.rooms.delete(roomId);
    removeBinding(this.rooms, record.namespace, roomId, sessionId);
  }

  getConnection(sessionId: string): WebSocketSessionPresence | undefined {
    const record = this.sessions.get(sessionId);
    return record ? copyPresence(record) : undefined;
  }

  getConnectionCount(namespace?: string): number {
    let count = 0;
    for (const record of this.sessions.values()) {
      if (record.active && matchesNamespace(record, namespace)) {
        count += 1;
      }
    }
    return count;
  }

  getRoomMembers(roomId: WebSocketRoomId, namespace?: string): WebSocketSessionPresence[] {
    return this.getBoundSessions(this.rooms, roomId, namespace).map(copyPresence);
  }

  getRoomMemberCount(roomId: WebSocketRoomId, namespace?: string): number {
    return this.getBoundSessions(this.rooms, roomId, namespace).length;
  }

  getLiveNodeIds(): string[] {
    return [...new Set([...this.sessions.values()].map((session) => session.nodeId))];
  }

  getUserSessions(userId: WebSocketUserId, namespace?: string): WebSocketSessionPresence[] {
    return this.getBoundSessions(this.users, userId, namespace, true).map(copyPresence);
  }

  getStats(): WebSocketRegistryStats {
    const byNamespace: Record<string, number> = {};
    let totalConnections = 0;

    for (const record of this.sessions.values()) {
      if (!record.active) {
        continue;
      }
      byNamespace[record.namespace] = (byNamespace[record.namespace] ?? 0) + 1;
      totalConnections += 1;
    }

    let totalRooms = 0;
    for (const bindings of this.rooms.values()) {
      totalRooms += bindings.size;
    }

    return { totalConnections, totalRooms, byNamespace };
  }

  /**
   * audience에 해당하는 활성 세션을 중복 없이 반환한다. 반환값은 내부 상태를 노출하지 않도록 ID와 노드 ID만 담는다.
   */
  queryAudience(audience: WebSocketAudience): Array<{ sessionId: string; nodeId: string }> {
    const seen = new Set<string>();
    const results: Array<{ sessionId: string; nodeId: string }> = [];

    for (const record of this.collectAudience(audience)) {
      if (seen.has(record.sessionId)) {
        continue;
      }
      seen.add(record.sessionId);
      results.push({ sessionId: record.sessionId, nodeId: record.nodeId });
    }

    return results;
  }

  private collectAudience(audience: WebSocketAudience): PresenceRecord[] {
    switch (audience.type) {
      case "all":
        return [...this.sessions.values()].filter(
          (record) => record.active && matchesNamespace(record, audience.namespace),
        );
      case "room":
        return this.getBoundSessions(this.rooms, audience.roomId, audience.namespace);
      case "user":
        return this.getBoundSessions(this.users, audience.userId, audience.namespace);
      case "connections": {
        const records: PresenceRecord[] = [];
        for (const sessionId of audience.connectionIds) {
          const record = this.sessions.get(sessionId);
          if (record?.active && matchesNamespace(record, audience.namespace)) {
            records.push(record);
          }
        }
        return records;
      }
      case "union":
        return audience.audiences.flatMap((item) => this.collectAudience(item));
    }
  }

  private getBoundSessions<Id>(
    index: BindingIndex<Id>,
    id: Id,
    namespace?: string,
    includeInactive = false,
  ): PresenceRecord[] {
    // namespace가 없으면(빈 문자열 포함) 모든 namespace의 바인딩을 본다
    const namespaces = namespace ? [index.get(namespace)] : [...index.values()];
    const seen = new Set<string>();
    const records: PresenceRecord[] = [];

    for (const bindings of namespaces) {
      for (const sessionId of bindings?.get(id) ?? []) {
        if (seen.has(sessionId)) {
          continue;
        }
        seen.add(sessionId);

        const record = this.sessions.get(sessionId);
        if (record && (record.active || includeInactive)) {
          records.push(record);
        }
      }
    }

    return records;
  }
}

function matchesNamespace(record: PresenceRecord, namespace: string | undefined): boolean {
  return namespace === undefined || namespace === "" || record.namespace === namespace;
}

function copyPresence(record: PresenceRecord): WebSocketSessionPresence {
  const copy: WebSocketSessionPresence = {
    sessionId: record.sessionId,
    nodeId: record.nodeId,
    namespace: record.namespace,
    active: record.active,
    rooms: new Set(record.rooms),
    connectedAt: new Date(record.connectedAt.getTime()),
    lastSeenAt: new Date(record.lastSeenAt.getTime()),
  };
  if (record.userId !== undefined) {
    copy.userId = record.userId;
  }
  return copy;
}

function addBinding<Id>(index: BindingIndex<Id>, namespace: string, id: Id, sessionId: string) {
  const bindings = index.get(namespace) ?? new Map<Id, Set<string>>();
  const members = bindings.get(id) ?? new Set<string>();
  members.add(sessionId);
  bindings.set(id, members);
  index.set(namespace, bindings);
}

function removeBinding<Id>(
  index: BindingIndex<Id>,
  namespace: string,
  id: Id,
  sessionId: string,
): void {
  const bindings = index.get(namespace);
  const members = bindings?.get(id);
  if (!bindings || !members) {
    return;
  }

  members.delete(sessionId);
  if (members.size === 0) {
    bindings.delete(id);
  }
  if (bindings.size === 0) {
    index.delete(namespace);
  }
}
