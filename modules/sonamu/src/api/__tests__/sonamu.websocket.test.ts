import { describe, expect, it } from "vitest";

import { type AnyWebSocketConnection } from "../../stream/ws";
import { type WebSocketTelemetryConnectionContext } from "../../stream/ws-telemetry";
import { type WebSocketContext } from "../context";
import { Sonamu } from "../sonamu";

describe("Sonamu websocket context scoping", () => {
  it("restores websocket context inside deferred message handlers", async () => {
    const messageHandlers = new Map<
      string,
      (
        data: unknown,
        telemetryContext?: WebSocketTelemetryConnectionContext,
      ) => void | Promise<void>
    >();

    const rawWs = {
      id: "ws-1",
      namespace: "chat",
      transport: "ws" as const,
      closed: false,
      publishUntyped() {},
      close() {},
      onClose() {},
      onMessage(event, handler) {
        messageHandlers.set(String(event), handler);
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
    const createScopedWebSocketConnection: (
      ws: AnyWebSocketConnection,
      getContext: () => WebSocketContext | null,
    ) => AnyWebSocketConnection = Reflect.get(Sonamu, "createScopedWebSocketConnection");
    const scopedWs = createScopedWebSocketConnection.call(Sonamu, rawWs, () => context);

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

  it("passes message trace context to scoped websocket message handlers", async () => {
    const messageHandlers = new Map<
      string,
      (
        data: unknown,
        telemetryContext?: WebSocketTelemetryConnectionContext,
      ) => void | Promise<void>
    >();

    const rawWs = {
      id: "ws-1",
      namespace: "chat",
      transport: "ws" as const,
      closed: false,
      publishUntyped() {},
      close() {},
      onClose() {},
      onMessage(event, handler) {
        messageHandlers.set(String(event), handler);
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
    const createScopedWebSocketConnection: (
      ws: AnyWebSocketConnection,
      getContext: () => WebSocketContext | null,
    ) => AnyWebSocketConnection = Reflect.get(Sonamu, "createScopedWebSocketConnection");
    const scopedWs = createScopedWebSocketConnection.call(Sonamu, rawWs, () => context);

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

    const messageTraceContext: WebSocketTelemetryConnectionContext = {
      traceId: "trace-1",
      spanId: "span-1",
      parentSpanId: "parent-1",
      sampled: true,
    };
    let seenTraceContext: WebSocketTelemetryConnectionContext | undefined;

    scopedWs.onMessage("joinRoom", async (_data, telemetryContext) => {
      seenTraceContext = telemetryContext;
    });

    await messageHandlers.get("joinRoom")?.(
      {
        roomId: "room-1",
      },
      messageTraceContext,
    );

    expect(seenTraceContext).toEqual(messageTraceContext);
  });
});
