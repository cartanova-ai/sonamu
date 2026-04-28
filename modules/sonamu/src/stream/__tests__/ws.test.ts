import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";
import { type WebSocket } from "ws";
import { z } from "zod";

import { createWebSocketRuntime } from "../ws";
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

function asWebSocket(socket: FakeWebSocket): WebSocket {
  return socket as unknown as WebSocket;
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

    expect(handler).toHaveBeenCalledWith({ roomId: "alpha" });
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
      maxPayload: 128,
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

    let unhandled: unknown = null;
    const handleUnhandledRejection = (reason: unknown) => {
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
