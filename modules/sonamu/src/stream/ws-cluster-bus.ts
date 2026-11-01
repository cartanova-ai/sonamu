import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketUserId, type MaybePromise } from "./ws-core";

/**
 * 노드 간 publish envelope. 원본 data 대신 발행 노드가 route별로 한 번 검증·인코딩한 frame을 싣는다.
 * 수신 노드는 자기 메모리로 audience를 해석하고, 각 연결의 route frame을 재검증 없이 그대로 보낸다.
 */
export type WebSocketClusterPublishEnvelope = {
  kind: "publish";
  id: string;
  sourceNodeId: string;
  targetNodeIds: string[];
  audience: WebSocketAudience;
  event: string;
  // routeKey → 인코딩된 frame. 이벤트를 선언하지 않았거나 검증에 실패한 route는 빠진다
  frames: Record<string, string>;
  emittedAt: number;
};

export type WebSocketClusterLeaveUserEnvelope = {
  kind: "leaveUser";
  id: string;
  sourceNodeId: string;
  targetNodeIds: string[];
  userId: WebSocketUserId;
  roomId: string;
  namespace?: string;
  emittedAt: number;
};

export type WebSocketClusterEnvelope =
  | WebSocketClusterPublishEnvelope
  | WebSocketClusterLeaveUserEnvelope;

export type WebSocketClusterSubscribeOptions = {
  onRejected?: (info: { reason: string; raw?: string }) => void;
};

export type WebSocketClusterEnvelopeHandler = (
  envelope: WebSocketClusterEnvelope,
) => void | Promise<void>;

export interface WebSocketClusterBus {
  // 설정하면 runtime nodeId와 같아야 한다. 다르면 runtime 생성이 실패한다
  readonly nodeId?: string;
  publish(envelope: WebSocketClusterEnvelope): void | Promise<void>;
  // 구독 완료를 promise로 알릴 수 있다. 반환한 해제 함수는 runtime shutdown에서 한 번 호출된다
  subscribe(
    handler: WebSocketClusterEnvelopeHandler,
    options?: WebSocketClusterSubscribeOptions,
  ): MaybePromise<() => void>;
  shutdown(): void | Promise<void>;
}

export class NoopWebSocketClusterBus implements WebSocketClusterBus {
  publish(_envelope: WebSocketClusterEnvelope): void {}

  subscribe(_handler: WebSocketClusterEnvelopeHandler): () => void {
    return () => {};
  }

  shutdown(): void {}
}
