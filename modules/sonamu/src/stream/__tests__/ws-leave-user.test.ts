import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createWebSocketRuntime, type WebSocketRuntime } from "../ws";
import {
  type WebSocketClusterEnvelopeHandler,
  type WebSocketClusterSubscribeOptions,
  type WebSocketClusterLeaveUserEnvelope,
  type WebSocketClusterPublishEnvelope,
} from "../ws-cluster-bus";
import { InMemoryWebSocketPresenceStore } from "../ws-presence-store";
import {
  asWebSocket,
  createDeferred,
  FakeWebSocket,
  flushAsync,
  InProcessClusterNetwork,
  isSettled,
  RecordingClusterBus,
  ScriptedPresenceStore,
} from "./ws-test-helpers";

const outEvents = z.object({ message: z.object({ text: z.string() }) });
const runtimes: WebSocketRuntime[] = [];

function createRuntime(options: Parameters<typeof createWebSocketRuntime>[0] = {}) {
  const runtime = createWebSocketRuntime({ telemetry: true, ...options });
  runtime.registerRoute("/chat", { outEvents });
  runtimes.push(runtime);
  return runtime;
}

async function connect(
  runtime: WebSocketRuntime,
  userId: number | string,
  namespace = "chat",
  active = true,
) {
  const socket = new FakeWebSocket();
  const connection = await runtime.registerConnection(asWebSocket(socket), {
    routeKey: "/chat",
    namespace,
    active,
    heartbeat: 0,
    outEvents,
    inEvents: z.object({}),
  });
  await connection.setUserId(userId);
  await connection.join("room");
  return { socket, connection };
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
});

describe("사용자 방 퇴장", () => {
  it("여러 세션을 동기로 퇴장시키되 다른 방과 사용자 및 namespace를 보존한다", async () => {
    const runtime = createRuntime();
    const first = await connect(runtime, 1);
    const second = await connect(runtime, 1);
    const admin = await connect(runtime, 1, "admin");
    const stringUser = await connect(runtime, "1");
    const other = await connect(runtime, 2);
    const inactive = await connect(runtime, 1, "chat", false);
    await first.connection.join("other");
    const result = runtime.leaveUser(1, "room", "chat");
    for (const member of [first, second, inactive]) {
      expect(runtime.registry.getConnection(member.connection.id)?.rooms.has("room")).toBe(false);
    }
    expect(runtime.registry.getConnection(first.connection.id)?.rooms.has("other")).toBe(true);
    for (const member of [admin, stringUser, other]) {
      expect(runtime.registry.getConnection(member.connection.id)?.rooms.has("room")).toBe(true);
    }
    await expect(result).resolves.toEqual({
      localLeftCount: 3,
      targetNodeCount: 0,
      partial: false,
    });
    await expect(runtime.leaveUser(1, "room")).resolves.toEqual({
      localLeftCount: 1,
      targetNodeCount: 0,
      partial: false,
    });
    await expect(runtime.leaveUser("missing", "room")).resolves.toEqual({
      localLeftCount: 0,
      targetNodeCount: 0,
      partial: false,
    });
    expect(runtime.registry.getConnection(stringUser.connection.id)?.rooms.has("room")).toBe(true);
  });

  it("store 반영을 기다리고 실패하면 로컬 변경을 유지하며 partial을 반환한다", async () => {
    const store = new ScriptedPresenceStore();
    const runtime = createRuntime({ presenceStore: store });
    const member = await connect(runtime, 1);
    const gate = createDeferred();
    store.next("leave", () => gate.promise);
    const pending = runtime.leaveUser(1, "room");
    expect(runtime.registry.getConnection(member.connection.id)?.rooms.has("room")).toBe(false);
    expect(await isSettled(pending)).toBe(false);
    gate.reject(new Error("store"));
    await expect(pending).resolves.toMatchObject({ localLeftCount: 1, partial: true });
  });

  it("세 노드의 제어 메시지가 뒤따르는 방 publish보다 먼저 전달된다", async () => {
    const store = new InMemoryWebSocketPresenceStore();
    const scripted = new ScriptedPresenceStore(store);
    const network = new InProcessClusterNetwork();
    const [a, b, c] = ["a", "b", "c"].map((nodeId) =>
      createRuntime({
        nodeId,
        presenceStore: nodeId === "a" ? scripted : store,
        clusterBus: network.bus(nodeId),
      }),
    );
    const targetB = await connect(b, 1);
    const targetC = await connect(c, 1);
    const otherB = await connect(b, "1");
    const otherC = await connect(c, 2);
    await flushAsync();
    // 노드 조회를 방 publish가 큐에 들어간 뒤에야 끝내, 제어 메시지가 큐를 우회하면 순서가 뒤집히게 한다
    const routeGate = createDeferred();
    scripted.next("getLiveNodeIds", () => routeGate.promise);
    const leaving = a.leaveUser(1, "room");
    const publishing = a.publishToRoom("room", "message", { text: "after" });
    routeGate.resolve();
    await expect(leaving).resolves.toEqual({
      localLeftCount: 0,
      targetNodeCount: 2,
      partial: false,
    });
    await publishing;
    await flushAsync(10);
    expect(network.published.map((envelope) => envelope.kind)).toEqual(["leaveUser", "publish"]);
    expect(targetB.socket.sentMessages).toEqual([]);
    expect(targetC.socket.sentMessages).toEqual([]);
    expect(otherB.socket.sentMessages).toHaveLength(1);
    expect(otherC.socket.sentMessages).toHaveLength(1);
    await expect(a.registry.getRoomMemberCount("room")).resolves.toEqual({
      count: 2,
      partial: false,
    });
  });

  it("사용자 replica가 지연돼도 모든 live 노드에 퇴장을 전달한다", async () => {
    const shared = new InMemoryWebSocketPresenceStore();
    const delayed = new ScriptedPresenceStore(shared);
    const network = new InProcessClusterNetwork();
    const a = createRuntime({ nodeId: "a", presenceStore: shared, clusterBus: network.bus("a") });
    const b = createRuntime({ nodeId: "b", presenceStore: delayed, clusterBus: network.bus("b") });
    const member = await connect(b, "before");
    const gate = createDeferred();
    delayed.next("setUserId", () => gate.promise);
    const binding = member.connection.setUserId(1);
    expect(shared.resolveRoute({ type: "user", userId: 1 }, "a").remoteNodeIds).toEqual([]);
    await expect(a.leaveUser(1, "room")).resolves.toMatchObject({
      targetNodeCount: 1,
      partial: false,
    });
    await flushAsync();
    expect(b.registry.getConnection(member.connection.id)?.rooms.has("room")).toBe(false);
    gate.resolve();
    await binding;
    await flushAsync();
    expect(shared.getRoomMemberCount("room")).toBe(0);
  });

  it("구독 거절 사유는 원문 payload 없이 telemetry에 기록한다", async () => {
    class RejectionBus extends RecordingClusterBus {
      override subscribe(
        handler: WebSocketClusterEnvelopeHandler,
        options?: WebSocketClusterSubscribeOptions,
      ) {
        options?.onRejected?.({ reason: "invalidEnvelope", raw: "sensitive".repeat(100) });
        return super.subscribe(handler);
      }
    }
    const runtime = createRuntime({ clusterBus: new RejectionBus() });
    await flushAsync();
    const event = runtime.telemetryController
      .getEventStore()
      ?.query({ name: "ws.cluster.envelope.rejected" })[0];
    expect(event?.detail).toEqual({ reason: "invalidEnvelope" });
    expect(event?.level).toBe("warn");
  });

  it("노드 조회 실패와 publish 거절을 partial로 반환하고 시도한 노드 수를 보존한다", async () => {
    const store = new ScriptedPresenceStore();
    const bus = new RecordingClusterBus();
    const runtime = createRuntime({ nodeId: "a", presenceStore: store, clusterBus: bus });
    store.next("getLiveNodeIds", () => {
      throw new Error("route");
    });
    await expect(runtime.leaveUser(1, "room")).resolves.toEqual({
      localLeftCount: 0,
      targetNodeCount: 0,
      partial: true,
    });
    await store.register({
      sessionId: "remote",
      nodeId: "b",
      namespace: "chat",
      active: true,
      connectedAt: new Date(),
    });
    bus.publish = () => Promise.reject(new Error("publish"));
    await expect(runtime.leaveUser(1, "room")).resolves.toEqual({
      localLeftCount: 0,
      targetNodeCount: 1,
      partial: true,
    });
    expect(
      runtime.telemetryController
        .getEventStore()
        ?.query({ name: "ws.cluster.control.failed" })
        .map((event) => event.detail?.stage),
    ).toEqual(["route", "publish"]);
  });

  it("선택적 노드 조회가 없는 store는 사용자 라우팅으로 대체한다", async () => {
    const store = new ScriptedPresenceStore();
    Object.defineProperty(store, "getLiveNodeIds", { value: undefined });
    const runtime = createRuntime({ presenceStore: store });
    await runtime.leaveUser(1, "room", "chat");
    expect(store.callsOf("resolveRoute")).toHaveLength(1);
    store.next("resolveRoute", () => Promise.reject(new Error("route")));
    await expect(runtime.leaveUser(1, "room")).resolves.toMatchObject({ partial: true });
  });

  it("알 수 없는 kind의 envelope은 publish로 처리하지 않고 거절한다", async () => {
    const bus = new RecordingClusterBus();
    const runtime = createRuntime({ nodeId: "a", clusterBus: bus });
    await connect(runtime, 1);
    const base: WebSocketClusterPublishEnvelope = {
      kind: "publish",
      id: "x",
      sourceNodeId: "b",
      targetNodeIds: ["a"],
      audience: { type: "room", roomId: "room" },
      event: "message",
      frames: {},
      emittedAt: 0,
    };
    // SAFETY: 미래 버전 wire payload의 알 수 없는 kind를 재현한다
    const future = { ...base, kind: "future" } as WebSocketClusterPublishEnvelope;
    await expect(bus.emit(future)).resolves.toBeUndefined();
    const store = runtime.telemetryController.getEventStore();
    const rejected = store?.query({ name: "ws.cluster.envelope.rejected" });
    expect(rejected).toHaveLength(1);
    expect(rejected?.[0].detail).toEqual({ reason: "unknownKind" });
    expect(store?.query({ name: "ws.cluster.envelope.received" })).toHaveLength(0);
  });

  it("제어 메시지도 자기 노드와 대상 불일치를 무시하고 kind 없는 기존 publish를 수신한다", async () => {
    const bus = new RecordingClusterBus();
    const runtime = createRuntime({ nodeId: "a", clusterBus: bus });
    const target = await connect(runtime, 1);
    const control: WebSocketClusterLeaveUserEnvelope = {
      kind: "leaveUser",
      id: "control",
      sourceNodeId: "a",
      targetNodeIds: ["a"],
      userId: 1,
      roomId: "room",
      emittedAt: 0,
    };
    await bus.emit(control);
    await bus.emit({ ...control, sourceNodeId: "b", targetNodeIds: ["c"] });
    expect(runtime.registry.getConnection(target.connection.id)?.rooms.has("room")).toBe(true);
    const publish: WebSocketClusterPublishEnvelope = {
      kind: "publish",
      id: "legacy",
      sourceNodeId: "b",
      targetNodeIds: ["a"],
      audience: { type: "room", roomId: "room" },
      event: "message",
      frames: { "/chat": '{"event":"message","data":{"text":"legacy"}}' },
      emittedAt: 0,
    };
    const { kind: _kind, ...legacy } = publish;
    // SAFETY: publish 필드는 위에서 구성했고 구버전 wire payload의 누락된 kind만 재현한다
    await bus.emit(legacy as WebSocketClusterPublishEnvelope);
    await flushAsync();
    expect(target.socket.sentMessages).toHaveLength(1);
    await bus.emit({ ...control, sourceNodeId: "b" });
    expect(runtime.registry.getConnection(target.connection.id)?.rooms.has("room")).toBe(false);
    expect(
      runtime.telemetryController.getEventStore()?.query({ name: "ws.cluster.control.received" })[0]
        .detail?.localLeftCount,
    ).toBe(1);
  });
});
