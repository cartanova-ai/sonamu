import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createWebSocketRuntime } from "../ws";
import { WebSocketAudience } from "../ws-audience";
import { InMemoryWebSocketPresenceStore } from "../ws-presence-store";
import {
  FakeWebSocket,
  RecordingClusterBus,
  asWebSocket,
  collectUnhandledRejections,
  flushAsync,
  parseFrames,
} from "./ws-test-helpers";

async function waitForAsyncQueue(rounds: number = 3): Promise<void> {
  await flushAsync(rounds);
}

describe("WebSocketRuntime", () => {
  const OutEvents = z.object({
    onReady: z.object({
      ok: z.boolean(),
    }),
    onRoomMessage: z.object({
      roomId: z.string(),
      text: z.string(),
    }),
  });
  const InEvents = z.object({
    joinRoom: z.object({
      roomId: z.string(),
    }),
    sendMessage: z.object({
      roomId: z.string(),
      text: z.string(),
    }),
  });

  it("buffers early messages until handlers are attached", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "joinRoom",
        data: { roomId: "alpha" },
      }),
    );

    const handler = vi.fn();
    connection.onMessage("joinRoom", handler);

    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledWith({ roomId: "alpha" }, expect.any(Object));
  });

  it("passes message trace context from meta.traceparent to handlers", async () => {
    const runtime = createWebSocketRuntime({ telemetry: true });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });
    let capturedTrace:
      | {
          traceId?: string;
          parentSpanId?: string;
          sampled?: boolean;
        }
      | undefined;

    connection.onMessage("joinRoom", (_data, telemetryContext) => {
      capturedTrace = telemetryContext;
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "joinRoom",
        data: { roomId: "alpha" },
        meta: {
          traceparent: "00-4bf92f3577b16d8a2e3e24ff02e6c998-00f067aa0ba902b7-01",
        },
      }),
    );

    await waitForAsyncQueue();

    expect(capturedTrace).toMatchObject({
      traceId: "4bf92f3577b16d8a2e3e24ff02e6c998",
      parentSpanId: "00f067aa0ba902b7",
      sampled: true,
    });
  });

  it("falls back to connection trace when message trace propagation is disabled", async () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { propagateMessageTrace: false } },
    });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      sampled: false,
    });
    let capturedTrace:
      | {
          traceId?: string;
          parentSpanId?: string;
          sampled?: boolean;
        }
      | undefined;

    connection.onMessage("joinRoom", (_data, telemetryContext) => {
      capturedTrace = telemetryContext;
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "joinRoom",
        data: { roomId: "alpha" },
        meta: {
          traceparent: "00-4bf92f3577b16d8a2e3e24ff02e6c998-00f067aa0ba902b7-01",
        },
      }),
    );

    await waitForAsyncQueue();

    expect(capturedTrace).toMatchObject({
      traceId: "11111111111111111111111111111111",
      parentSpanId: "2222222222222222",
      sampled: false,
    });
  });

  it("records ok status for normal close codes", async () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { recordConnectionLifetimeSpan: true } },
    });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: "3333333333333333",
      sampled: true,
    });

    connection.close(1000, "done");

    const spanStore = runtime.telemetryController.getSpanStore();
    const lifetimeSpans = spanStore?.query({ operationName: "ws.connection.lifetime" }) ?? [];

    expect(lifetimeSpans).toHaveLength(1);
    expect(lifetimeSpans[0]).toMatchObject({
      operationName: "ws.connection.lifetime",
      kind: "server",
      status: "ok",
      connectionId: connection.id,
      namespace: "chat",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: "3333333333333333",
      sampled: true,
    });
    expect(lifetimeSpans[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records error status for non-normal close codes", async () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { recordConnectionLifetimeSpan: true } },
    });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    connection.close(1011, "internal error");

    const spanStore = runtime.telemetryController.getSpanStore();
    const lifetimeSpans = spanStore?.query({ operationName: "ws.connection.lifetime" }) ?? [];

    expect(lifetimeSpans).toHaveLength(1);
    expect(lifetimeSpans[0]).toMatchObject({
      operationName: "ws.connection.lifetime",
      kind: "server",
      status: "error",
      connectionId: connection.id,
      namespace: "chat",
    });
    expect(lifetimeSpans[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records unset status when close code is unknown", async () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { recordConnectionLifetimeSpan: true } },
    });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    // Peer-initiated close without a code reaches handleClose with code=undefined.
    socket.emit("close");

    const spanStore = runtime.telemetryController.getSpanStore();
    const lifetimeSpans = spanStore?.query({ operationName: "ws.connection.lifetime" }) ?? [];

    expect(lifetimeSpans).toHaveLength(1);
    expect(lifetimeSpans[0]).toMatchObject({
      operationName: "ws.connection.lifetime",
      kind: "server",
      status: "unset",
      connectionId: connection.id,
      namespace: "chat",
    });
    expect(lifetimeSpans[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("uses extracted handshake parent when connection span generation is disabled", async () => {
    const runtime = createWebSocketRuntime({
      telemetry: {
        trace: {
          generateConnectionTrace: false,
          propagateMessageTrace: false,
        },
      },
    });
    const socket = new FakeWebSocket();
    const handshakeContext = runtime.telemetryController.createConnectionContext({
      headers: {
        traceparent: "00-4bf92f3577b16d8a2e3e24ff02e6c998-00f067aa0ba902b7-01",
      },
    });
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      ...handshakeContext,
    });
    let capturedTrace:
      | {
          traceId?: string;
          spanId?: string;
          parentSpanId?: string;
          sampled?: boolean;
        }
      | undefined;

    connection.onMessage("joinRoom", (_data, telemetryContext) => {
      capturedTrace = telemetryContext;
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "joinRoom",
        data: { roomId: "alpha" },
      }),
    );

    await waitForAsyncQueue();

    expect(handshakeContext).toMatchObject({
      traceId: "4bf92f3577b16d8a2e3e24ff02e6c998",
      parentSpanId: "00f067aa0ba902b7",
      sampled: true,
    });
    expect(handshakeContext.spanId).toBeUndefined();
    expect(capturedTrace).toMatchObject({
      traceId: "4bf92f3577b16d8a2e3e24ff02e6c998",
      parentSpanId: "00f067aa0ba902b7",
      sampled: true,
    });
    expect(capturedTrace?.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("emits skipped registry mutation telemetry for missing connections", async () => {
    const runtime = createWebSocketRuntime({ telemetry: true });

    await expect(runtime.activateConnection("missing-connection")).resolves.toBeUndefined();
    await expect(runtime.registry.join("missing-connection", "room-1")).resolves.toBeUndefined();
    await expect(runtime.registry.leave("missing-connection", "room-1")).resolves.toBeUndefined();
    await expect(
      runtime.registry.setUserId("missing-connection", "user-1"),
    ).resolves.toBeUndefined();
    await expect(runtime.registry.clearUserId("missing-connection")).resolves.toBeUndefined();

    const store = runtime.telemetryController.getEventStore();
    const skippedEvents = store?.query({ name: "ws.registry.mutation.skipped" }) ?? [];

    expect(skippedEvents).toHaveLength(5);
    expect(skippedEvents.map((record) => record.detail)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "activate",
          reason: "connectionMissing",
        }),
        expect.objectContaining({
          operation: "join",
          reason: "connectionMissing",
          roomId: "room-1",
        }),
        expect.objectContaining({
          operation: "leave",
          reason: "connectionMissing",
          roomId: "room-1",
        }),
        expect.objectContaining({
          operation: "setUserId",
          reason: "connectionMissing",
          userId: "user-1",
        }),
        expect.objectContaining({
          operation: "clearUserId",
          reason: "connectionMissing",
        }),
      ]),
    );
    expect(
      skippedEvents.every(
        (record) => record.connectionId === "missing-connection" && record.level === "debug",
      ),
    ).toBe(true);
    expect(store?.query({ name: "ws.connection.activated" })).toHaveLength(0);
    expect(store?.query({ name: "ws.room.joined" })).toHaveLength(0);
    expect(store?.query({ name: "ws.room.left" })).toHaveLength(0);
    expect(store?.query({ name: "ws.user.bound" })).toHaveLength(0);
    expect(store?.query({ name: "ws.user.cleared" })).toHaveLength(0);
  });

  it("keeps inactive connections out of registry fan-out until activated", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      active: false,
    });

    await runtime.broadcast("onReady", {
      ok: true,
    });
    await waitForAsyncQueue();

    expect(socket.sentMessages).toHaveLength(0);
    expect(runtime.registry.getConnectionCount("chat")).toBe(0);

    await runtime.activateConnection(connection.id);
    await runtime.broadcast("onReady", {
      ok: true,
    });
    await waitForAsyncQueue();

    expect(socket.sentMessages).toHaveLength(1);
    expect(runtime.registry.getConnectionCount("chat")).toBe(1);
  });

  it("활성화 전에 도착한 프레임은 파싱하지 않고 보관했다가 활성화 뒤 순서대로 처리한다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      active: false,
    });
    const handler = vi.fn();
    connection.onMessage("joinRoom", handler);

    socket.emit("message", JSON.stringify({ event: "joinRoom", data: { roomId: "alpha" } }));
    socket.emit(
      "message",
      Buffer.from(JSON.stringify({ event: "joinRoom", data: { roomId: "beta" } })),
    );
    await waitForAsyncQueue();

    expect(handler).not.toHaveBeenCalled();

    await runtime.activateConnection(connection.id);
    await waitForAsyncQueue();

    expect(handler.mock.calls.map(([data]) => data)).toEqual([
      { roomId: "alpha" },
      { roomId: "beta" },
    ]);
    expect(socket.closedWith).toBeNull();
  });

  it("가드가 끝나기 전 잘못된 프레임은 파싱하지 않으며, 가드 거부로 닫히면 그대로 버린다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      active: false,
    });
    const handler = vi.fn();
    connection.onMessage("joinRoom", handler);

    socket.emit("message", "{not-json");
    socket.emit("message", JSON.stringify({ event: "joinRoom", data: { roomId: "alpha" } }));
    await waitForAsyncQueue();

    // 파싱했다면 1007로 닫혔을 것이다
    expect(socket.closedWith).toBeNull();

    // 가드 거부를 흉내 내 1008로 닫는다
    connection.close(1008, "Unauthorized websocket connection");
    await runtime.activateConnection(connection.id);
    await waitForAsyncQueue();

    expect(socket.closedWith).toEqual({ code: 1008, reason: "Unauthorized websocket connection" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("활성화 전 보관 프레임은 개수 상한을 넘으면 오래된 것부터 버린다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      active: false,
    });
    const handler = vi.fn();
    connection.onMessage("joinRoom", handler);

    for (let index = 0; index < 101; index += 1) {
      socket.emit("message", JSON.stringify({ event: "joinRoom", data: { roomId: `r${index}` } }));
    }
    await runtime.activateConnection(connection.id);
    await waitForAsyncQueue(10);

    expect(handler).toHaveBeenCalledTimes(100);
    expect(handler.mock.calls[0]?.[0]).toEqual({ roomId: "r1" });
    expect(handler.mock.calls[99]?.[0]).toEqual({ roomId: "r100" });
  });

  it("manages rooms and user fan-out through the registry", async () => {
    const runtime = createWebSocketRuntime();
    const socketA = new FakeWebSocket();
    const socketB = new FakeWebSocket();
    const connectionA = await runtime.registerConnection(asWebSocket(socketA), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });
    const connectionB = await runtime.registerConnection(asWebSocket(socketB), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    await connectionA.join("room-1");
    await connectionB.join("room-1");
    await connectionA.setUserId("user-1");

    await runtime.registry.publishToRoom("room-1", "onRoomMessage", {
      roomId: "room-1",
      text: "hello",
    });
    await runtime.registry.publishToUser("user-1", "onReady", {
      ok: true,
    });

    await waitForAsyncQueue();

    expect(socketA.sentMessages).toHaveLength(2);
    expect(socketB.sentMessages).toHaveLength(1);
    expect(runtime.registry.getRoomMembers("room-1")).toHaveLength(2);
    expect(runtime.registry.getConnectionCount("chat")).toBe(2);

    connectionA.close(1000, "done");

    expect(runtime.registry.getRoomMembers("room-1")).toHaveLength(1);
    expect(runtime.registry.getConnectionCount("chat")).toBe(1);
  });

  it("emits runtime telemetry for room/user bindings and outbound queue flow", async () => {
    const runtime = createWebSocketRuntime({ telemetry: true });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
    });

    await connection.join("room-1");
    await connection.leave("room-1");
    await connection.setUserId("user-1");
    await connection.clearUserId();

    expect(() => connection.publishUntyped("missing", {})).toThrow("Unknown websocket event");
    expect(() => connection.publishUntyped("onReady", { ok: "nope" })).toThrow(
      "Invalid websocket event payload",
    );

    connection.publish("onReady", { ok: true });

    const store = runtime.telemetryController.getEventStore();
    const events = store?.query({}) ?? [];
    const names = events.map((record) => record.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "ws.room.joined",
        "ws.room.left",
        "ws.user.bound",
        "ws.user.cleared",
        "ws.publish.rejected",
        "ws.publish.queued",
      ]),
    );
    expect(events.find((record) => record.name === "ws.room.joined")).toMatchObject({
      connectionId: connection.id,
      namespace: "chat",
      traceId: "11111111111111111111111111111111",
    });
  });

  it("keeps room fan-out isolated by namespace", async () => {
    const runtime = createWebSocketRuntime();
    const chatSocket = new FakeWebSocket();
    const otherSocket = new FakeWebSocket();
    const chatConnection = await runtime.registerConnection(asWebSocket(chatSocket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });
    const otherConnection = await runtime.registerConnection(asWebSocket(otherSocket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "other",
    });

    await chatConnection.join("room-1");
    await otherConnection.join("room-1");

    await runtime.registry.publishToRoom(
      "room-1",
      "onRoomMessage",
      {
        roomId: "room-1",
        text: "hello",
      },
      "chat",
    );

    await waitForAsyncQueue();

    expect(chatSocket.sentMessages).toHaveLength(1);
    expect(otherSocket.sentMessages).toHaveLength(0);
    expect(runtime.registry.getRoomMembers("room-1", "chat")).toHaveLength(1);
  });

  it("dedupes union audiences before delivery", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    await connection.join("room-1");
    await connection.setUserId("user-1");

    await runtime.publishToAudience(
      WebSocketAudience.union(
        WebSocketAudience.room("room-1", "chat"),
        WebSocketAudience.user("user-1", "chat"),
      ),
      "onReady",
      {
        ok: true,
      },
    );

    await waitForAsyncQueue();

    expect(socket.sentMessages).toHaveLength(1);
  });

  it("publishes a cluster envelope for remote-node audiences", async () => {
    const presenceStore = new InMemoryWebSocketPresenceStore();
    const clusterBus = new RecordingClusterBus();
    const runtime = createWebSocketRuntime({
      nodeId: "local-node",
      presenceStore,
      clusterBus,
    });
    runtime.registerRoute("/chat", { outEvents: OutEvents });

    await presenceStore.register({
      sessionId: "remote-1",
      nodeId: "remote-node",
      namespace: "chat",
      active: true,
      connectedAt: new Date(),
    });
    await presenceStore.join("remote-1", "room-remote");

    await runtime.publishToRoom(
      "room-remote",
      "onRoomMessage",
      {
        roomId: "room-remote",
        text: "hello remote",
      },
      "chat",
    );

    expect(clusterBus.published).toHaveLength(1);
    expect(clusterBus.published[0]).toMatchObject({
      sourceNodeId: "local-node",
      targetNodeIds: ["remote-node"],
      event: "onRoomMessage",
    });
    expect(JSON.parse(clusterBus.published[0].frames["/chat"])).toEqual({
      event: "onRoomMessage",
      data: { roomId: "room-remote", text: "hello remote" },
    });
  });

  it("closes invalid inbound payloads", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "sendMessage",
        data: { roomId: "alpha", text: 123 },
      }),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(socket.closedWith?.code).toBe(1007);
  });

  it("data 키가 없는 envelope은 계속 잘못된 payload로 닫는다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    socket.emit("message", JSON.stringify({ event: "joinRoom" }));
    await waitForAsyncQueue();

    expect(socket.closedWith).toEqual({ code: 1007, reason: "Invalid message payload" });
  });

  it("still closes and unregisters when onClose callbacks throw", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    connection.onClose(() => {
      throw new Error("close callback failed");
    });

    connection.close(1000, "done");

    expect(socket.closedWith).toEqual({
      code: 1000,
      reason: "done",
    });
    expect(runtime.registry.getConnectionCount("chat")).toBe(0);
  });

  it("swallows rejected async onClose callbacks without leaking unhandled rejections", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    let unhandled: Error | null = null;
    const handleUnhandledRejection = (reason: Error) => {
      unhandled = reason;
    };
    process.once("unhandledRejection", handleUnhandledRejection);

    connection.onClose(async () => {
      throw new Error("async close callback failed");
    });

    connection.close(1000, "done");
    await waitForAsyncQueue(2);
    process.off("unhandledRejection", handleUnhandledRejection);

    expect(unhandled).toBeNull();
    expect(runtime.registry.getConnectionCount("chat")).toBe(0);
  });

  it("closes the transport when the socket emits an error", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    socket.emit("error", new Error("broken transport"));

    expect(socket.closedWith).toEqual({
      code: 1011,
      reason: "WebSocket transport error",
    });
    expect(runtime.registry.getConnectionCount("chat")).toBe(0);
  });

  it("closes the connection when a buffered handler rejects after registration", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "joinRoom",
        data: { roomId: "alpha" },
      }),
    );

    connection.onMessage("joinRoom", async () => {
      throw new Error("handler failed");
    });

    await waitForAsyncQueue();

    expect(socket.closedWith?.code).toBe(1011);
  });

  it("closes slow consumers when outbound backpressure keeps growing", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    socket.bufferedAmount = 2_000_000;
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    for (let index = 0; index <= 1_000; index += 1) {
      connection.publish("onReady", {
        ok: true,
      });
    }

    expect(socket.closedWith?.code).toBe(1013);
  });

  it("reports local connection and delivery pending gauge sources", async () => {
    const runtime = createWebSocketRuntime({ telemetry: true });
    const socket = new FakeWebSocket();
    socket.bufferedAmount = 2_000_000;
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    socket.emit(
      "message",
      JSON.stringify({
        event: "joinRoom",
        data: { roomId: "alpha" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    connection.publish("onReady", { ok: true });
    await runtime.broadcast("onReady", { ok: true }, "chat");

    const snapshot = runtime.telemetryController.getMetricsSnapshot();

    expect(snapshot.pendingInboundMessages).toBe(1);
    expect(snapshot.pendingOutboundMessages).toBeGreaterThanOrEqual(1);
    expect(snapshot.socketBufferedBytes).toBe(2_000_000);
    expect(snapshot.pendingFanOutJobs).toBe(1);
    expect(snapshot.pendingFanOutTargets).toBe(1);
  });

  it("preserves broadcast order across chunked fan-out batches", async () => {
    const runtime = createWebSocketRuntime();
    const sockets = Array.from({ length: 300 }, () => new FakeWebSocket());

    for (const socket of sockets) {
      await runtime.registerConnection(asWebSocket(socket), {
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
      });
    }

    runtime.broadcast("onReady", {
      ok: true,
    });
    runtime.broadcast("onReady", {
      ok: false,
    });

    await waitForAsyncQueue(6);

    expect(sockets[0].sentMessages).toHaveLength(2);
    expect(sockets.at(-1)?.sentMessages).toHaveLength(2);
    expect(JSON.parse(sockets[0].sentMessages[0]).data).toEqual({ ok: true });
    expect(JSON.parse(sockets[0].sentMessages[1]).data).toEqual({ ok: false });
    expect(JSON.parse(sockets.at(-1)!.sentMessages[0]).data).toEqual({ ok: true });
    expect(JSON.parse(sockets.at(-1)!.sentMessages[1]).data).toEqual({ ok: false });
  });

  it("await 없이 join한 직후의 publish도 해당 연결에 전달된다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });

    // 메모리 갱신은 호출 시점에 동기로 일어나야 한다
    void connection.join("room-1");
    expect(runtime.registry.getRoomMembers("room-1", "chat").map((meta) => meta.sessionId)).toEqual(
      [connection.id],
    );
    await runtime.publishToRoom(
      "room-1",
      "onRoomMessage",
      { roomId: "room-1", text: "hi" },
      "chat",
    );
    await waitForAsyncQueue();

    expect(parseFrames(socket)).toEqual([
      { event: "onRoomMessage", data: { roomId: "room-1", text: "hi" } },
    ]);
  });

  it("mutation과 publish 메서드는 Promise<void>를 반환한다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const registering = runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      active: false,
      heartbeat: 0,
    });
    expect(registering).toBeInstanceOf(Promise);
    const connection = await registering;

    const results = [
      runtime.activateConnection(connection.id),
      connection.join("room-1"),
      connection.leave("room-1"),
      connection.setUserId(1),
      connection.clearUserId(),
      runtime.broadcast("onReady", { ok: true }),
      runtime.publishToRoom("room-1", "onReady", { ok: true }),
      runtime.publishToUser(1, "onReady", { ok: true }),
      runtime.publishToAudience(WebSocketAudience.all(), "onReady", { ok: true }),
      runtime.registry.broadcast("onReady", { ok: true }),
      runtime.registry.publishToRoom("room-1", "onReady", { ok: true }),
      runtime.registry.publishToUser(1, "onReady", { ok: true }),
      runtime.registry.publishToAudience(WebSocketAudience.all(), "onReady", { ok: true }),
    ];

    for (const result of results) {
      expect(result).toBeInstanceOf(Promise);
    }
    await expect(Promise.all(results)).resolves.toEqual(results.map(() => undefined));
  });

  it("userId는 타입까지 일치해야 publishToUser 대상이 된다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });
    await connection.setUserId(1);

    await runtime.publishToUser("1", "onReady", { ok: false });
    await waitForAsyncQueue();
    expect(socket.sentMessages).toHaveLength(0);

    await runtime.publishToUser(1, "onReady", { ok: true });
    await waitForAsyncQueue();
    expect(parseFrames(socket)).toEqual([{ event: "onReady", data: { ok: true } }]);
    expect(runtime.registry.getConnection(connection.id)?.userId).toBe(1);
  });

  it("registry/runtime publish의 잘못된 payload와 모르는 이벤트는 resolve하고 아무도 닫지 않는다", async () => {
    const runtime = createWebSocketRuntime({ telemetry: true });
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });
    await connection.join("room-1");
    await connection.setUserId("user-1");
    const collect = collectUnhandledRejections();

    await expect(
      runtime.publishToRoom("room-1", "onReady", { ok: "not-a-boolean" }, "chat"),
    ).resolves.toBeUndefined();
    await expect(runtime.broadcast("onUnknown", { ok: true }, "chat")).resolves.toBeUndefined();
    await expect(
      runtime.registry.publishToUser("user-1", "onReady", { ok: "still-wrong" }),
    ).resolves.toBeUndefined();
    await waitForAsyncQueue(6);
    const unhandled = collect();

    expect(unhandled).toEqual([]);
    expect(socket.sentMessages).toHaveLength(0);
    expect(socket.closedWith).toBeNull();
    expect(connection.closed).toBe(false);
    const events = runtime.telemetryController.getEventStore()?.query({}) ?? [];
    const rejected = events.filter((record) => record.name === "ws.publish.rejected");
    expect(rejected.map((record) => record.detail)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "onReady", reason: "invalidPayload" }),
        expect.objectContaining({ event: "onUnknown", reason: "unknownEvent" }),
      ]),
    );
    expect(events.some((record) => record.name === "ws.fanout.publish.failed")).toBe(false);

    // 잘못된 publish 뒤에도 정상 publish는 그대로 전달된다
    await runtime.publishToRoom("room-1", "onReady", { ok: true }, "chat");
    await waitForAsyncQueue();
    expect(parseFrames(socket)).toEqual([{ event: "onReady", data: { ok: true } }]);
  });

  it("직접 connection.publish는 잘못된 payload와 모르는 이벤트에 동기로 throw한다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });

    expect(() => connection.publishUntyped("onReady", { ok: "nope" })).toThrow(
      "Invalid websocket event payload",
    );
    expect(() => connection.publishUntyped("missing", {})).toThrow("Unknown websocket event");
  });

  it("같은 namespace의 두 route가 같은 이벤트를 다른 스키마로 선언하면 각 연결은 자기 route의 frame을 받고, 선언하지 않은 route는 건너뛴다", async () => {
    const runtime = createWebSocketRuntime({ telemetry: true });
    const RouteAEvents = z.object({ onNotice: z.object({ value: z.number() }) });
    const RouteBEvents = z.object({
      onNotice: z.object({ value: z.number().max(10), label: z.string().default("route-b") }),
    });
    const RouteCEvents = z.object({ onOther: z.object({ value: z.number() }) });
    runtime.registerRoute("/a", { outEvents: RouteAEvents });
    runtime.registerRoute("/b", { outEvents: RouteBEvents });
    runtime.registerRoute("/c", { outEvents: RouteCEvents });
    const sockets = { a: new FakeWebSocket(), b: new FakeWebSocket(), c: new FakeWebSocket() };
    const connectionA = await runtime.registerConnection(asWebSocket(sockets.a), {
      routeKey: "/a",
      outEvents: RouteAEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });
    const connectionB = await runtime.registerConnection(asWebSocket(sockets.b), {
      routeKey: "/b",
      outEvents: RouteBEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });
    const connectionC = await runtime.registerConnection(asWebSocket(sockets.c), {
      routeKey: "/c",
      outEvents: RouteCEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });

    await runtime.broadcast("onNotice", { value: 1, extra: "stripped" }, "chat");
    await waitForAsyncQueue();

    expect(parseFrames(sockets.a)).toEqual([{ event: "onNotice", data: { value: 1 } }]);
    expect(parseFrames(sockets.b)).toEqual([
      { event: "onNotice", data: { value: 1, label: "route-b" } },
    ]);
    expect(sockets.c.sentMessages).toEqual([]);
    for (const connection of [connectionA, connectionB, connectionC]) {
      expect(connection.closed).toBe(false);
    }

    // route B의 스키마만 거부하는 payload: route A에는 전달되고 route B는 건너뛰며 아무도 닫히지 않는다
    await runtime.broadcast("onNotice", { value: 100 }, "chat");
    await waitForAsyncQueue();

    expect(parseFrames(sockets.a)).toEqual([
      { event: "onNotice", data: { value: 1 } },
      { event: "onNotice", data: { value: 100 } },
    ]);
    expect(sockets.b.sentMessages).toHaveLength(1);
    expect(sockets.c.sentMessages).toHaveLength(0);
    for (const socket of Object.values(sockets)) {
      expect(socket.closedWith).toBeNull();
    }
    const rejected =
      runtime.telemetryController.getEventStore()?.query({ name: "ws.publish.rejected" }) ?? [];
    expect(rejected.map((record) => record.detail)).toEqual([
      expect.objectContaining({ event: "onNotice", reason: "invalidPayload" }),
    ]);
  });

  it("같은 route의 연결들은 바이트가 동일한 frame을 받는다", async () => {
    const runtime = createWebSocketRuntime();
    const StampEvents = z.object({ onStamp: z.object({ at: z.date() }) });
    runtime.registerRoute("/stamp", { outEvents: StampEvents });
    const sockets = [new FakeWebSocket(), new FakeWebSocket()];
    for (const socket of sockets) {
      await runtime.registerConnection(asWebSocket(socket), {
        routeKey: "/stamp",
        outEvents: StampEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
    }

    await runtime.broadcast("onStamp", { at: new Date("2026-01-02T03:04:05.000Z") }, "chat");
    await waitForAsyncQueue();

    expect(sockets[0].sentMessages).toHaveLength(1);
    expect(sockets[1].sentMessages).toEqual(sockets[0].sentMessages);
    expect(parseFrames(sockets[0])).toEqual([
      { event: "onStamp", data: { at: "2026-01-02T03:04:05.000Z" } },
    ]);
  });

  it("registry 읽기 API는 내부 상태와 분리된 snapshot을 반환한다", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = await runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      heartbeat: 0,
    });
    await connection.join("room-1");

    const meta = runtime.registry.getConnection(connection.id);
    meta!.rooms.add("room-hacked");
    meta!.rooms.delete("room-1");
    meta!.active = false;
    const [member] = runtime.registry.getRoomMembers("room-1", "chat");
    member.rooms.clear();
    const stats = runtime.registry.getStats();
    stats.byNamespace.chat = 999;

    const fresh = runtime.registry.getConnection(connection.id);
    expect([...fresh!.rooms]).toEqual(["room-1"]);
    expect(fresh!.active).toBe(true);
    expect(runtime.registry.getRoomMembers("room-hacked")).toHaveLength(0);
    expect(runtime.registry.getRoomMembers("room-1", "chat")).toHaveLength(1);
    expect(runtime.registry.getConnectionCount("chat")).toBe(1);
    expect(runtime.registry.getStats().byNamespace).toEqual({ chat: 1 });

    await runtime.publishToRoom("room-1", "onReady", { ok: true }, "chat");
    await waitForAsyncQueue();
    expect(socket.sentMessages).toHaveLength(1);
  });
});
