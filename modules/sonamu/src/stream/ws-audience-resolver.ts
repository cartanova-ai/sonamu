import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketPresenceStore } from "./ws-presence-store";

export type WebSocketRoutingPlan = {
  localSessionIds: string[];
  remoteNodeIds: string[];
};

export class WebSocketAudienceResolver {
  constructor(
    private readonly options: {
      nodeId: string;
      presenceStore: WebSocketPresenceStore;
    },
  ) {}

  resolve(audience: WebSocketAudience): WebSocketRoutingPlan {
    const localSessionIds: string[] = [];
    const remoteNodeIds = new Set<string>();

    for (const meta of this.options.presenceStore.queryAudience(audience)) {
      if (meta.nodeId === this.options.nodeId) {
        localSessionIds.push(meta.sessionId);
        continue;
      }

      remoteNodeIds.add(meta.nodeId);
    }

    return {
      localSessionIds,
      remoteNodeIds: [...remoteNodeIds],
    };
  }
}
