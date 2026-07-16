import { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { type WebSocket } from "ws";
import { z } from "zod";

import { type AnyWebSocketConnection, WebSocketRuntime } from "../../stream/ws";
import { type WebSocketTelemetryConnectionContext } from "../../stream/ws-telemetry";
import { type SonamuFastifyConfig } from "../config";
import { type WebSocketContext } from "../context";
import { type ExtendedApi } from "../decorators";
import { Sonamu } from "../sonamu";

describe("Sonamu websocket context scoping", () => {
  it("웹소켓 컨텍스트를 생성한 뒤 해당 컨텍스트 안에서 guard를 실행한다", async () => {
    const executionOrder: string[] = [];
    const rawWs = {
      id: "ws-guard",
      namespace: "chat",
      transport: "ws" as const,
      closed: false,
      publishUntyped() {},
      close() {},
      onClose() {},
      onMessage() {},
      publish() {},
      waitForClose() {
        return Promise.resolve();
      },
      join() {},
      leave() {},
      setUserId() {},
      clearUserId() {},
    } satisfies AnyWebSocketConnection;
    const runtime = new WebSocketRuntime({ nodeId: "websocket-guard-test" });
    const originalRuntime = Reflect.get(Sonamu, "_websocketRuntime");
    const originalSyncer = Reflect.get(Sonamu, "_syncer");
    let contextCreated: WebSocketContext | null = null;
    let guardContext: WebSocketContext | null = null;

    vi.spyOn(runtime, "registerConnection").mockReturnValue(rawWs);
    vi.spyOn(runtime, "activateConnection").mockImplementation(() => {
      executionOrder.push("activate");
    });
    vi.spyOn(Sonamu, "createWebSocketContext").mockImplementation(async (_config, request, ws) => {
      executionOrder.push("context");
      contextCreated = {
        transport: "ws",
        request,
        headers: request.headers,
        ws,
        naiteStore: new Map(),
        locale: "ko",
        user: null,
        session: null,
      };
      return contextCreated;
    });
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async () => {
      executionOrder.push("handler");
    });

    const config = {
      guardHandler() {
        executionOrder.push("guard");
        guardContext = Sonamu.getContext<WebSocketContext>();
      },
    } as SonamuFastifyConfig;
    const api: ExtendedApi = {
      modelName: "ChatFrame",
      methodName: "subscribe",
      path: "/chat/subscribe",
      options: { guards: ["user"] },
      websocketOptions: {
        outEvents: z.object({}),
        inEvents: z.object({}),
      },
      typeParameters: [],
      parameters: [],
      returnType: "void",
    };
    const request = {
      headers: {},
      query: {},
    } as FastifyRequest;
    const createWebSocketHandler: (
      api: ExtendedApi,
      config: SonamuFastifyConfig,
    ) => (connection: { socket: WebSocket }, request: FastifyRequest) => Promise<void> =
      Reflect.get(Sonamu, "createWebSocketHandler");

    try {
      Sonamu.websocketRuntime = runtime;
      Reflect.set(Sonamu, "_syncer", { types: {} });

      await createWebSocketHandler.call(Sonamu, api, config)({ socket: {} as WebSocket }, request);

      expect(executionOrder).toEqual(["context", "guard", "activate", "handler"]);
      expect(guardContext).toBe(contextCreated);
      expect(guardContext?.transport).toBe("ws");
    } finally {
      Reflect.set(Sonamu, "_websocketRuntime", originalRuntime);
      Reflect.set(Sonamu, "_syncer", originalSyncer);
      vi.restoreAllMocks();
    }
  });

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
