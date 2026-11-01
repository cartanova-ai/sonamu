import { type WebSocketAudience } from "./ws-audience";
import { type MaybePromise, type WebSocketRoomId, type WebSocketUserId } from "./ws-core";
import { WebSocketPresenceIndex } from "./ws-presence-index";

/**
 * 세션 presence snapshot. live 객체가 아니므로 값을 바꿔도 registry나 store 상태에 영향을 주지 않는다.
 */
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

export type WebSocketPresenceRegistration = {
  sessionId: string;
  nodeId: string;
  namespace: string;
  active: boolean;
  connectedAt: Date;
};

export type WebSocketRoutingPlan = {
  localSessionIds: string[];
  remoteNodeIds: string[];
};

/**
 * 클러스터 presence replica 계약. 각 노드의 registry가 자기 세션의 mutation을 세션별 호출 순서대로 전달한다.
 * 모든 메서드는 값이나 promise를 반환할 수 있고, registry는 동기 throw도 rejection으로 바꿔 처리한다.
 * userId는 타입까지 일치해야 매칭된다(1과 "1"은 다르다).
 */
export interface WebSocketPresenceStore {
  // 설정하면 runtime nodeId와 같아야 한다. 다르면 runtime 생성이 실패한다
  readonly nodeId?: string;
  register(input: WebSocketPresenceRegistration): MaybePromise<void>;
  activate(sessionId: string): MaybePromise<void>;
  unregister(sessionId: string): MaybePromise<void>;
  setUserId(sessionId: string, userId: WebSocketUserId): MaybePromise<void>;
  clearUserId(sessionId: string): MaybePromise<void>;
  join(sessionId: string, roomId: WebSocketRoomId): MaybePromise<void>;
  leave(sessionId: string, roomId: WebSocketRoomId): MaybePromise<void>;
  // nodeId 관점에서 audience를 로컬 세션 ID와 중복 없는 원격 노드 ID로 나눈다. 비활성 세션은 제외한다
  resolveRoute(audience: WebSocketAudience, nodeId: string): MaybePromise<WebSocketRoutingPlan>;
  // 클러스터 전체의 활성 방 인원수
  getRoomMemberCount(roomId: WebSocketRoomId, namespace?: string): MaybePromise<number>;
  // 사용자 제어 메시지는 해당 사용자의 replica 유무와 무관하게 모든 live 노드에 전송한다
  getLiveNodeIds?(): MaybePromise<string[]>;
  shutdown?(): MaybePromise<void>;
}

/**
 * 프로세스 메모리에 presence를 두는 store. 단일 노드의 기본값이며, 같은 프로세스의 여러 runtime이 공유하면 클러스터 replica로도 동작한다.
 */
export class InMemoryWebSocketPresenceStore implements WebSocketPresenceStore {
  private readonly index = new WebSocketPresenceIndex();

  register(input: WebSocketPresenceRegistration): void {
    this.index.register(input);
  }

  activate(sessionId: string): void {
    this.index.activate(sessionId);
  }

  unregister(sessionId: string): void {
    this.index.unregister(sessionId);
  }

  setUserId(sessionId: string, userId: WebSocketUserId): void {
    this.index.setUserId(sessionId, userId);
  }

  clearUserId(sessionId: string): void {
    this.index.clearUserId(sessionId);
  }

  join(sessionId: string, roomId: WebSocketRoomId): void {
    this.index.join(sessionId, roomId);
  }

  leave(sessionId: string, roomId: WebSocketRoomId): void {
    this.index.leave(sessionId, roomId);
  }

  resolveRoute(audience: WebSocketAudience, nodeId: string): WebSocketRoutingPlan {
    const localSessionIds: string[] = [];
    const remoteNodeIds = new Set<string>();

    for (const session of this.index.queryAudience(audience)) {
      if (session.nodeId === nodeId) {
        localSessionIds.push(session.sessionId);
      } else {
        remoteNodeIds.add(session.nodeId);
      }
    }

    return { localSessionIds, remoteNodeIds: [...remoteNodeIds] };
  }

  getLiveNodeIds(): string[] {
    return this.index.getLiveNodeIds();
  }

  getRoomMemberCount(roomId: WebSocketRoomId, namespace?: string): number {
    return this.index.getRoomMemberCount(roomId, namespace);
  }

  // 복사본을 반환하므로 호출자가 값을 바꿔도 store 상태는 그대로다
  getConnection(sessionId: string): WebSocketSessionPresence | undefined {
    return this.index.getConnection(sessionId);
  }
}
