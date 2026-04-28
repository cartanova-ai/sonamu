import { describe, expect, it } from "vitest";

import { type AnyWebSocketConnection } from "../../stream/ws";
import { type WebSocketContext } from "../context";
import { Sonamu } from "../sonamu";

describe("Sonamu websocket context scoping", () => {
  it("restores websocket context inside deferred message handlers", async () => {
    const messageHandlers = new Map<string, (data: unknown) => void | Promise<void>>();

    const rawWs = {
      id: "ws-1",
      namespace: "chat",
      transport: "ws" as const,
      closed: false,
      publishUntyped() {},
      close() {},
      onClose() {},
      onMessage(event, handler) {
        messageHandlers.set(String(event), handler as (data: unknown) => void | Promise<void>);
      },
      publish() {},
      waitForClose() {
        return Promise.resolve();
      },
      join() {},
      leave() {},
      setUserId() {},
      clearUserId() {},
    } satisfies AnyWebSocketConnection;

    let context: WebSocketContext | null = null;
    const scopedWs = (
      Sonamu as unknown as {
        createScopedWebSocketConnection(
          ws: AnyWebSocketConnection,
          getContext: () => WebSocketContext | null,
        ): AnyWebSocketConnection;
      }
    ).createScopedWebSocketConnection(rawWs, () => context);

    context = {
      transport: "ws",
      request: {} as WebSocketContext["request"],
      headers: {},
      ws: scopedWs,
      naiteStore: new Map(),
      locale: "ko",
      user: null,
      session: null,
    };

    let seenTransport: WebSocketContext["transport"] | null = null;
    scopedWs.onMessage("joinRoom", async () => {
      seenTransport = Sonamu.getContext<WebSocketContext>().transport;
    });

    await messageHandlers.get("joinRoom")?.({
      roomId: "room-1",
    });

    expect(seenTransport).toBe("ws");
  });
});
