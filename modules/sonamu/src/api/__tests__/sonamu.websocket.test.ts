import { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { type WebSocket } from "ws";
import { z } from "zod";

import {
  type AnyWebSocketConnection,
  type WebSocketConnection,
  WebSocketRuntime,
} from "../../stream/ws";
import { type WebSocketTelemetryConnectionContext } from "../../stream/ws-telemetry";
import { type SonamuFastifyConfig } from "../../types/types";
import { type WebSocketContext } from "../context";
import { type ExtendedApi } from "../decorators";
import { Sonamu } from "../sonamu";

interface TestWebSocketMessage {
  roomId?: string;
}

interface TestWebSocketEvents {
  joinRoom: TestWebSocketMessage;
}

describe("Sonamu websocket context scoping", () => {
  it("웹소켓 컨텍스트를 생성한 뒤 해당 컨텍스트 안에서 guard를 실행한다", async () => {
    const executionOrder: string[] = [];
    const rawWs: AnyWebSocketConnection = {
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
    };
    const runtime = new WebSocketRuntime({ nodeId: "websocket-guard-test" });
    const originalState = Sonamu.captureTestingSnapshot();
    let contextCreated: WebSocketContext | null = null;
    let guardContext: WebSocketContext | null = null;
    let guardTransport: WebSocketContext["transport"] | null = null;

    vi.spyOn(runtime, "registerConnection").mockReturnValue(rawWs);
    vi.spyOn(runtime, "activateConnection").mockImplementation(() => {
      executionOrder.push("activate");
    });
    vi.spyOn(Sonamu, "createWebSocketContext").mockImplementation(async (_config, request, ws) => {
      executionOrder.push("context");
      const context: WebSocketContext = {
        transport: "ws",
        request,
        headers: request.headers,
        ws,
        naiteStore: new Map(),
        locale: "ko",
        user: null,
        session: null,
      };
      contextCreated = context;
      return context;
    });
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async () => {
      executionOrder.push("handler");
    });

    const config = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      guardHandler() {
        executionOrder.push("guard");
        guardContext = Sonamu.getContext<WebSocketContext>();
        guardTransport = guardContext.transport;
      },
      contextProvider(defaultContext) {
        return defaultContext;
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
    const request = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      headers: {},
      query: {},
    } as FastifyRequest;
    try {
      Sonamu.websocketRuntime = runtime;
      Reflect.set(Sonamu, "syncerValue", { types: {} });

      await Sonamu.createWebSocketHandlerForTesting(api, config)(
        {
          socket:
            /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {} as WebSocket,
        },
        request,
      );

      expect(executionOrder).toEqual(["context", "guard", "activate", "handler"]);
      expect(guardContext).toBe(contextCreated);
      expect(guardTransport).toBe("ws");
    } finally {
      Sonamu.restoreTestingSnapshot(originalState);
      vi.restoreAllMocks();
    }
  });

  it("restores websocket context inside deferred message handlers", async () => {
    const messageHandlers = new Map<
      string,
      (
        data: TestWebSocketMessage,
        telemetryContext?: WebSocketTelemetryConnectionContext,
      ) => void | Promise<void>
    >();

    const rawWs: WebSocketConnection<TestWebSocketEvents, TestWebSocketEvents> = {
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
    };

    let context: WebSocketContext<TestWebSocketEvents, TestWebSocketEvents> | null = null;
    const scopedWs = Sonamu.createScopedWebSocketConnectionForTesting(rawWs, () => context);

    context = {
      transport: "ws",
      request:
        /* SAFETY: 테스트는 request 속성을 읽지 않고 websocket 컨텍스트 복원만 검증합니다. */ {} as WebSocketContext["request"],
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
        data: TestWebSocketMessage,
        telemetryContext?: WebSocketTelemetryConnectionContext,
      ) => void | Promise<void>
    >();

    const rawWs: WebSocketConnection<TestWebSocketEvents, TestWebSocketEvents> = {
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
    };

    let context: WebSocketContext<TestWebSocketEvents, TestWebSocketEvents> | null = null;
    const scopedWs = Sonamu.createScopedWebSocketConnectionForTesting(rawWs, () => context);

    context = {
      transport: "ws",
      request:
        /* SAFETY: 테스트는 request 속성을 읽지 않고 websocket 컨텍스트 복원만 검증합니다. */ {} as WebSocketContext["request"],
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
