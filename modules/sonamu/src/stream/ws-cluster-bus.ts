import { type WebSocketAudience } from "./ws-audience";

export type WebSocketClusterEnvelope = {
  id: string;
  sourceNodeId: string;
  targetNodeIds?: string[];
  namespace?: string;
  audience: WebSocketAudience;
  event: string;
  data: unknown;
  emittedAt: number;
};

export type WebSocketClusterEnvelopeHandler = (
  envelope: WebSocketClusterEnvelope,
) => void | Promise<void>;

export interface WebSocketClusterBus {
  publish(envelope: WebSocketClusterEnvelope): void | Promise<void>;
  subscribe(handler: WebSocketClusterEnvelopeHandler): () => void;
  shutdown(): void | Promise<void>;
}

export class NoopWebSocketClusterBus implements WebSocketClusterBus {
  publish(_envelope: WebSocketClusterEnvelope): void {}

  subscribe(_handler: WebSocketClusterEnvelopeHandler): () => void {
    return () => {};
  }

  shutdown(): void {}
}
