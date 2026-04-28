export type WebSocketUserId = number | string;
export type WebSocketRoomId = string;

export interface ManagedWebSocketConnection {
  id: string;
  namespace: string;
  closed: boolean;
  publishUntyped(event: string, data: unknown): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketRegistryStats = {
  totalConnections: number;
  totalRooms: number;
  byNamespace: Record<string, number>;
};
