import { type WebSocketRoomId, type WebSocketUserId } from "./ws-core";

export type WebSocketAudience =
  | {
      type: "all";
      namespace?: string;
    }
  | {
      type: "room";
      roomId: WebSocketRoomId;
      namespace?: string;
    }
  | {
      type: "user";
      userId: WebSocketUserId;
      namespace?: string;
    }
  | {
      type: "connections";
      connectionIds: string[];
      namespace?: string;
    }
  | {
      type: "union";
      audiences: WebSocketAudience[];
    };

export const WebSocketAudience = {
  all(namespace?: string): WebSocketAudience {
    return {
      type: "all",
      namespace,
    };
  },
  room(roomId: WebSocketRoomId, namespace?: string): WebSocketAudience {
    return {
      type: "room",
      roomId,
      namespace,
    };
  },
  user(userId: WebSocketUserId, namespace?: string): WebSocketAudience {
    return {
      type: "user",
      userId,
      namespace,
    };
  },
  connections(connectionIds: string[], namespace?: string): WebSocketAudience {
    return {
      type: "connections",
      connectionIds,
      namespace,
    };
  },
  union(...audiences: WebSocketAudience[]): WebSocketAudience {
    return {
      type: "union",
      audiences,
    };
  },
};
