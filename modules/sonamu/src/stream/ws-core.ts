export type WebSocketUserId = number | string;
export type WebSocketRoomId = string;

export interface ManagedWebSocketConnection {
  id: string;
  namespace: string;
  closed: boolean;
  // setUserId/clearUserId 호출로 갱신됨. telemetry emit 사이트에서 hot path lookup을 피하기 위해 connection에 캐싱한다
  readonly userId?: string;
  publishUntyped<Data>(event: string, data: Data): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketRegistryStats = {
  totalConnections: number;
  totalRooms: number;
  byNamespace: Record<string, number>;
};
