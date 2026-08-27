import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createWebSocketRuntime, type WebSocketTransport } from "../ws";
import { WebSocketAudience } from "../ws-audience";
import {
  type WebSocketClusterBus,
  type WebSocketClusterEnvelope,
  type WebSocketClusterEnvelopeHandler,
} from "../ws-cluster-bus";
import { InMemoryWebSocketPresenceStore } from "../ws-presence-store";

async function waitForAsyncQueue(rounds: number = 3): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

class FakeWebSocket extends EventEmitter {
  readyState: 0 | 1 | 2 | 3 = 1;
  bufferedAmount = 0;
  sentMessages: string[] = [];
  pingCount = 0;
  closedWith: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
    this.emit("close", code ?? 1000, Buffer.from(reason ?? "", "utf-8"));
  }

  ping(): void {
    this.pingCount += 1;
  }

  terminate(): void {
    this.readyState = 3;
    this.emit("close", 1006, Buffer.alloc(0));
  }
}

function asWebSocket(socket: FakeWebSocket): WebSocketTransport {
  return {
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    get readyState() {
      return socket.readyState;
    },
    close(code, reason) {
      socket.close(code, reason?.toString());
    },
    off(...args) {
      socket.off(...args);
    },
    on(...args) {
      socket.on(...args);
    },
    ping() {
      socket.ping();
    },
    send(data) {
      socket.send(data.toString());
    },
    terminate() {
      socket.terminate();
    },
  };
}

class FakeClusterBus implements WebSocketClusterBus {
  readonly published: WebSocketClusterEnvelope[] = [];
  private readonly handlers = new Set<WebSocketClusterEnvelopeHandler>();

  publish(envelope: WebSocketClusterEnvelope): void {
    this.published.push(envelope);
  }

  subscribe(handler: WebSocketClusterEnvelopeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  shutdown(): void {}
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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

  it("records ok status for normal close codes", () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { recordConnectionLifetimeSpan: true } },
    });
    const socket = new FakeWebSocket();
    const connection = runtime.registerConnection(asWebSocket(socket), {
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

  it("records error status for non-normal close codes", () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { recordConnectionLifetimeSpan: true } },
    });
    const socket = new FakeWebSocket();
    const connection = runtime.registerConnection(asWebSocket(socket), {
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

  it("records unset status when close code is unknown", () => {
    const runtime = createWebSocketRuntime({
      telemetry: { trace: { recordConnectionLifetimeSpan: true } },
    });
    const socket = new FakeWebSocket();
    const connection = runtime.registerConnection(asWebSocket(socket), {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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

  it("emits skipped registry mutation telemetry for missing connections", () => {
    const runtime = createWebSocketRuntime({ telemetry: true });

    runtime.activateConnection("missing-connection");
    runtime.registry.join("missing-connection", "room-1");
    runtime.registry.leave("missing-connection", "room-1");
    runtime.registry.setUserId("missing-connection", "user-1");
    runtime.registry.clearUserId("missing-connection");

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
    const connection = runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      active: false,
    });

    runtime.broadcast("onReady", {
      ok: true,
    });
    await waitForAsyncQueue();

    expect(socket.sentMessages).toHaveLength(0);
    expect(runtime.registry.getConnectionCount("chat")).toBe(0);

    runtime.activateConnection(connection.id);
    runtime.broadcast("onReady", {
      ok: true,
    });
    await waitForAsyncQueue();

    expect(socket.sentMessages).toHaveLength(1);
    expect(runtime.registry.getConnectionCount("chat")).toBe(1);
  });

  it("manages rooms and user fan-out through the registry", async () => {
    const runtime = createWebSocketRuntime();
    const socketA = new FakeWebSocket();
    const socketB = new FakeWebSocket();
    const connectionA = runtime.registerConnection(asWebSocket(socketA), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });
    const connectionB = runtime.registerConnection(asWebSocket(socketB), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    connectionA.join("room-1");
    connectionB.join("room-1");
    connectionA.setUserId("user-1");

    runtime.registry.publishToRoom("room-1", "onRoomMessage", {
      roomId: "room-1",
      text: "hello",
    });
    runtime.registry.publishToUser("user-1", "onReady", {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
    });

    connection.join("room-1");
    connection.leave("room-1");
    connection.setUserId("user-1");
    connection.clearUserId();

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
    const chatConnection = runtime.registerConnection(asWebSocket(chatSocket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });
    const otherConnection = runtime.registerConnection(asWebSocket(otherSocket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "other",
    });

    chatConnection.join("room-1");
    otherConnection.join("room-1");

    runtime.registry.publishToRoom(
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
      outEvents: OutEvents,
      inEvents: InEvents,
      namespace: "chat",
    });

    connection.join("room-1");
    connection.setUserId("user-1");

    runtime.publishToAudience(
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

  it("publishes a cluster envelope for remote-node audiences", () => {
    const presenceStore = new InMemoryWebSocketPresenceStore();
    const clusterBus = new FakeClusterBus();
    const runtime = createWebSocketRuntime({
      nodeId: "local-node",
      presenceStore,
      clusterBus,
    });

    presenceStore.register({
      sessionId: "remote-1",
      nodeId: "remote-node",
      namespace: "chat",
      active: true,
    });
    presenceStore.join("remote-1", "room-remote");

    runtime.publishToRoom(
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
  });

  it("closes invalid inbound payloads", async () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    runtime.registerConnection(asWebSocket(socket), {
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

  it("still closes and unregisters when onClose callbacks throw", () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    const connection = runtime.registerConnection(asWebSocket(socket), {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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

  it("closes the transport when the socket emits an error", () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    runtime.registerConnection(asWebSocket(socket), {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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

  it("closes slow consumers when outbound backpressure keeps growing", () => {
    const runtime = createWebSocketRuntime();
    const socket = new FakeWebSocket();
    socket.bufferedAmount = 2_000_000;
    const connection = runtime.registerConnection(asWebSocket(socket), {
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
    const connection = runtime.registerConnection(asWebSocket(socket), {
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
    runtime.broadcast("onReady", { ok: true }, "chat");

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
      runtime.registerConnection(asWebSocket(socket), {
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
});
