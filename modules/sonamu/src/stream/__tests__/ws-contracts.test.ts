import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createWebSocketRuntime } from "../ws";
import { WebSocketAudience } from "../ws-audience";
import { NoopWebSocketClusterBus, type WebSocketClusterEnvelope } from "../ws-cluster-bus";
import { InMemoryWebSocketPresenceStore } from "../ws-presence-store";
import {
  FakeWebSocket,
  RecordingClusterBus,
  ScriptedPresenceStore,
  asWebSocket,
  flushAsync,
  flushUntil,
} from "./ws-test-helpers";

const OutEvents = z.object({
  onReady: z.object({
    ok: z.boolean(),
  }),
});
const InEvents = z.object({});

async function registerSession(
  store: InMemoryWebSocketPresenceStore,
  input: { sessionId: string; nodeId: string; namespace: string; active?: boolean },
): Promise<void> {
  await store.register({
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    namespace: input.namespace,
    active: input.active ?? true,
    connectedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

function createEnvelope(input: {
  id: string;
  sourceNodeId?: string;
  targetNodeIds?: string[];
  audience?: WebSocketAudience;
  event?: string;
  frames: Record<string, string>;
}): WebSocketClusterEnvelope {
  return {
    kind: "publish",
    id: input.id,
    sourceNodeId: input.sourceNodeId ?? "node-b",
    targetNodeIds: input.targetNodeIds ?? ["node-a"],
    audience: input.audience ?? WebSocketAudience.all("chat"),
    event: input.event ?? "onReady",
    frames: input.frames,
    emittedAt: Date.now(),
  };
}

describe("WebSocket contract tests", () => {
  describe("PresenceStore (InMemoryWebSocketPresenceStore)", () => {
    it("활성화 전의 세션은 라우팅과 방 인원수에서 제외한다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, {
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
        active: false,
      });
      await store.join("s1", "room-1");

      expect(await store.resolveRoute(WebSocketAudience.all("chat"), "node-a")).toEqual({
        localSessionIds: [],
        remoteNodeIds: [],
      });
      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(0);

      await store.activate("s1");

      expect(await store.resolveRoute(WebSocketAudience.all("chat"), "node-a")).toEqual({
        localSessionIds: ["s1"],
        remoteNodeIds: [],
      });
      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(1);
    });

    it("방과 사용자 바인딩을 namespace별로 격리한다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "chat-1", nodeId: "node-a", namespace: "chat" });
      await registerSession(store, { sessionId: "admin-1", nodeId: "node-a", namespace: "admin" });

      await store.join("chat-1", "room-1");
      await store.join("admin-1", "room-1");
      await store.setUserId("chat-1", "user-1");
      await store.setUserId("admin-1", "user-1");

      expect(
        (await store.resolveRoute(WebSocketAudience.room("room-1", "chat"), "node-a"))
          .localSessionIds,
      ).toEqual(["chat-1"]);
      expect(
        (await store.resolveRoute(WebSocketAudience.user("user-1", "admin"), "node-a"))
          .localSessionIds,
      ).toEqual(["admin-1"]);
    });

    it("세션을 해제하면 방과 사용자 바인딩도 정리한다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "s1", nodeId: "node-a", namespace: "chat" });
      await store.join("s1", "room-1");
      await store.setUserId("s1", "user-1");

      await store.unregister("s1");

      expect(store.getConnection("s1")).toBeUndefined();
      expect(
        (await store.resolveRoute(WebSocketAudience.room("room-1", "chat"), "node-a"))
          .localSessionIds,
      ).toHaveLength(0);
      expect(
        (await store.resolveRoute(WebSocketAudience.user("user-1", "chat"), "node-a"))
          .localSessionIds,
      ).toHaveLength(0);
      expect(await store.getRoomMemberCount("room-1")).toBe(0);
    });

    it("union audience의 중복 세션과 중복 노드를 제거한다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "s1", nodeId: "node-a", namespace: "chat" });
      await registerSession(store, { sessionId: "r1", nodeId: "node-b", namespace: "chat" });
      await store.join("s1", "room-1");
      await store.setUserId("s1", "user-1");
      await store.join("r1", "room-1");
      await store.setUserId("r1", "user-1");

      const plan = await store.resolveRoute(
        WebSocketAudience.union(
          WebSocketAudience.room("room-1", "chat"),
          WebSocketAudience.user("user-1", "chat"),
        ),
        "node-a",
      );

      expect(plan).toEqual({ localSessionIds: ["s1"], remoteNodeIds: ["node-b"] });
    });

    it("로컬 세션 ID와 중복 없는 원격 노드 ID를 나눠 반환하고 비활성 원격 세션은 제외한다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "local-1", nodeId: "node-a", namespace: "chat" });
      await registerSession(store, { sessionId: "remote-1", nodeId: "node-b", namespace: "chat" });
      await registerSession(store, { sessionId: "remote-2", nodeId: "node-b", namespace: "chat" });
      await registerSession(store, {
        sessionId: "inactive-1",
        nodeId: "node-c",
        namespace: "chat",
        active: false,
      });
      for (const sessionId of ["local-1", "remote-1", "remote-2", "inactive-1"]) {
        await store.join(sessionId, "room-1");
      }

      expect(await store.resolveRoute(WebSocketAudience.room("room-1", "chat"), "node-a")).toEqual({
        localSessionIds: ["local-1"],
        remoteNodeIds: ["node-b"],
      });
      // 같은 store를 다른 노드 관점에서 조회하면 로컬/원격이 뒤바뀐다
      const fromNodeB = await store.resolveRoute(
        WebSocketAudience.room("room-1", "chat"),
        "node-b",
      );
      expect([...fromNodeB.localSessionIds].sort()).toEqual(["remote-1", "remote-2"]);
      expect(fromNodeB.remoteNodeIds).toEqual(["node-a"]);
    });

    it("namespace 없는 audience는 모든 namespace의 세션을 라우팅한다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "chat-1", nodeId: "node-a", namespace: "chat" });
      await registerSession(store, { sessionId: "admin-1", nodeId: "node-b", namespace: "admin" });
      await store.join("chat-1", "room-1");
      await store.join("admin-1", "room-1");

      expect(await store.resolveRoute(WebSocketAudience.room("room-1"), "node-a")).toEqual({
        localSessionIds: ["chat-1"],
        remoteNodeIds: ["node-b"],
      });
      expect(await store.resolveRoute(WebSocketAudience.all(), "node-a")).toEqual({
        localSessionIds: ["chat-1"],
        remoteNodeIds: ["node-b"],
      });
    });

    it("getRoomMemberCount는 활성 세션만 namespace 유무에 따라 클러스터 전체에서 센다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "a1", nodeId: "node-a", namespace: "chat" });
      await registerSession(store, { sessionId: "b1", nodeId: "node-b", namespace: "chat" });
      await registerSession(store, {
        sessionId: "b2",
        nodeId: "node-b",
        namespace: "chat",
        active: false,
      });
      await registerSession(store, { sessionId: "b3", nodeId: "node-b", namespace: "admin" });
      for (const sessionId of ["a1", "b1", "b2", "b3"]) {
        await store.join(sessionId, "room-1");
      }

      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(2);
      expect(await store.getRoomMemberCount("room-1", "admin")).toBe(1);
      expect(await store.getRoomMemberCount("room-1")).toBe(3);
      expect(await store.getRoomMemberCount("room-404")).toBe(0);
    });

    it('userId는 타입까지 일치해야 매칭된다 (1과 "1"은 다르다)', async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "numeric", nodeId: "node-a", namespace: "chat" });
      await registerSession(store, { sessionId: "string", nodeId: "node-a", namespace: "chat" });
      await store.setUserId("numeric", 1);
      await store.setUserId("string", "1");

      expect(
        (await store.resolveRoute(WebSocketAudience.user(1, "chat"), "node-a")).localSessionIds,
      ).toEqual(["numeric"]);
      expect(
        (await store.resolveRoute(WebSocketAudience.user("1", "chat"), "node-a")).localSessionIds,
      ).toEqual(["string"]);
      expect(store.getConnection("numeric")?.userId).toBe(1);
      expect(store.getConnection("string")?.userId).toBe("1");
    });

    it("presence는 snapshot 복사본이라 반환값을 바꿔도 store 상태는 그대로다", async () => {
      const store = new InMemoryWebSocketPresenceStore();
      await registerSession(store, { sessionId: "s1", nodeId: "node-a", namespace: "chat" });
      await store.join("s1", "room-1");

      const snapshot = store.getConnection("s1");
      expect(snapshot).toBeDefined();
      snapshot!.rooms.add("room-hacked");
      snapshot!.rooms.delete("room-1");
      snapshot!.active = false;
      snapshot!.userId = "intruder";

      const fresh = store.getConnection("s1");
      expect(fresh).not.toBe(snapshot);
      expect([...fresh!.rooms]).toEqual(["room-1"]);
      expect(fresh!.active).toBe(true);
      expect(fresh!.userId).toBeUndefined();
      expect(await store.getRoomMemberCount("room-hacked")).toBe(0);
      expect(
        (await store.resolveRoute(WebSocketAudience.user("intruder", "chat"), "node-a"))
          .localSessionIds,
      ).toEqual([]);
      expect(
        (await store.resolveRoute(WebSocketAudience.room("room-1", "chat"), "node-a"))
          .localSessionIds,
      ).toEqual(["s1"]);
    });
  });

  describe("ClusterBus", () => {
    it("구독을 해제하면 이후 envelope을 받지 않는다", async () => {
      const bus = new RecordingClusterBus();
      const received: string[] = [];
      const unsubscribe = await bus.subscribe((envelope) => {
        received.push(envelope.id);
      });

      await bus.emit(createEnvelope({ id: "e1", frames: {} }));
      unsubscribe();
      await bus.emit(createEnvelope({ id: "e2", frames: {} }));

      expect(received).toEqual(["e1"]);
    });

    it("NoopClusterBus의 publish, subscribe, shutdown은 안전하다", async () => {
      const bus = new NoopWebSocketClusterBus();
      const unsubscribe = await bus.subscribe(() => {
        throw new Error("noop bus must not retain handlers");
      });

      await Promise.resolve(bus.publish(createEnvelope({ id: "noop", frames: {} })));
      expect(unsubscribe()).toBeUndefined();
      await Promise.resolve(bus.shutdown());
    });

    it("subscribe가 Promise<unsubscribe>를 반환해도 runtime이 envelope을 받고 shutdown에서 해제한다", async () => {
      const bus = new RecordingClusterBus();
      let unsubscribeCalls = 0;
      bus.subscribe = async (handler) => {
        bus.handlers.add(handler);
        return () => {
          unsubscribeCalls += 1;
          bus.handlers.delete(handler);
        };
      };
      const runtime = createWebSocketRuntime({ nodeId: "node-a", clusterBus: bus });
      runtime.registerRoute("/chat", { outEvents: OutEvents });
      const socket = new FakeWebSocket();
      await runtime.registerConnection(asWebSocket(socket), {
        routeKey: "/chat",
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await flushUntil(() => bus.handlers.size > 0);

      const frame = JSON.stringify({ event: "onReady", data: { ok: true } });
      await bus.emit(createEnvelope({ id: "remote", frames: { "/chat": frame } }));
      await flushUntil(() => socket.sentMessages.length > 0);

      expect(socket.sentMessages).toEqual([frame]);

      await runtime.shutdown();

      expect(unsubscribeCalls).toBe(1);
      expect(bus.shutdownCalls).toBe(1);
    });
  });

  describe("Delivery", () => {
    it("로컬 전달은 큐를 거쳐 비동기로 전송된다", async () => {
      const runtime = createWebSocketRuntime({ nodeId: "node-a" });
      const socket = new FakeWebSocket();
      await runtime.registerConnection(asWebSocket(socket), {
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });

      const publishing = runtime.broadcast("onReady", { ok: true }, "chat");

      expect(socket.sentMessages).toHaveLength(0);

      await publishing;
      await flushAsync();

      expect(socket.sentMessages.map((message) => JSON.parse(message))).toEqual([
        { event: "onReady", data: { ok: true } },
      ]);
    });

    it("원격 노드가 여러 개여도 publish 한 번에 envelope 하나를 보내고, envelope은 원본 data 대신 route별 frame을 싣는다", async () => {
      const presenceStore = new InMemoryWebSocketPresenceStore();
      const clusterBus = new RecordingClusterBus();
      await registerSession(presenceStore, {
        sessionId: "remote-1",
        nodeId: "node-b",
        namespace: "chat",
      });
      await registerSession(presenceStore, {
        sessionId: "remote-2",
        nodeId: "node-c",
        namespace: "chat",
      });
      await presenceStore.join("remote-1", "room-1");
      await presenceStore.join("remote-2", "room-1");
      const runtime = createWebSocketRuntime({ nodeId: "node-a", presenceStore, clusterBus });
      runtime.registerRoute("/chat", { outEvents: OutEvents });

      await runtime.publishToRoom("room-1", "onReady", { ok: true }, "chat");
      await flushAsync();

      expect(clusterBus.published).toHaveLength(1);
      const envelope = clusterBus.published[0];
      expect(envelope).toMatchObject({
        sourceNodeId: "node-a",
        event: "onReady",
        audience: WebSocketAudience.room("room-1", "chat"),
      });
      expect([...envelope.targetNodeIds].sort()).toEqual(["node-b", "node-c"]);
      expect(Object.keys(envelope.frames)).toEqual(["/chat"]);
      expect(JSON.parse(envelope.frames["/chat"])).toEqual({
        event: "onReady",
        data: { ok: true },
      });
      expect(envelope).not.toHaveProperty("data");
    });

    it("자기 자신이 보냈거나 다른 노드를 대상으로 한 envelope은 무시한다", async () => {
      const clusterBus = new RecordingClusterBus();
      const runtime = createWebSocketRuntime({ nodeId: "node-a", clusterBus });
      runtime.registerRoute("/chat", { outEvents: OutEvents });
      const socket = new FakeWebSocket();
      await runtime.registerConnection(asWebSocket(socket), {
        routeKey: "/chat",
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await flushUntil(() => clusterBus.handlers.size > 0);
      const frame = JSON.stringify({ event: "onReady", data: { ok: true } });

      await clusterBus.emit(
        createEnvelope({
          id: "self",
          sourceNodeId: "node-a",
          targetNodeIds: ["node-a"],
          frames: { "/chat": frame },
        }),
      );
      await clusterBus.emit(
        createEnvelope({
          id: "other-target",
          sourceNodeId: "node-b",
          targetNodeIds: ["node-c"],
          frames: { "/chat": frame },
        }),
      );
      await flushAsync();

      expect(socket.sentMessages).toHaveLength(0);
    });

    it("수신한 frame은 재검증·재인코딩 없이 그대로 로컬 대상에게만 보낸다", async () => {
      const presenceStore = new ScriptedPresenceStore();
      const clusterBus = new RecordingClusterBus();
      const runtime = createWebSocketRuntime({ nodeId: "node-a", presenceStore, clusterBus });
      runtime.registerRoute("/chat", { outEvents: OutEvents });
      const roomSocket = new FakeWebSocket();
      const outsiderSocket = new FakeWebSocket();
      const roomConnection = await runtime.registerConnection(asWebSocket(roomSocket), {
        routeKey: "/chat",
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await runtime.registerConnection(asWebSocket(outsiderSocket), {
        routeKey: "/chat",
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await roomConnection.join("room-1");
      await flushUntil(() => clusterBus.handlers.size > 0);
      const callsBefore = presenceStore.calls.length;
      // 수신 노드의 스키마로는 통과할 수 없는 frame이다. 재검증하면 1011로 닫히고, 재인코딩하면 바이트가 달라진다
      const frame = '{"data":{"ok":"not-a-boolean"},  "event":"onReady"}';

      await clusterBus.emit(
        createEnvelope({
          id: "remote",
          audience: WebSocketAudience.room("room-1", "chat"),
          frames: { "/chat": frame },
        }),
      );
      await flushUntil(() => roomSocket.sentMessages.length > 0);
      await flushAsync();

      expect(roomSocket.sentMessages).toEqual([frame]);
      expect(roomSocket.closedWith).toBeNull();
      expect(outsiderSocket.sentMessages).toHaveLength(0);
      // 수신 노드는 store가 아닌 자기 메모리로 audience를 해석한다
      expect(presenceStore.calls.slice(callsBefore)).toEqual([]);
    });

    it("수신 노드는 연결마다 자기 route의 frame을 보내고, frame이 없는 route의 연결은 건너뛴다", async () => {
      const clusterBus = new RecordingClusterBus();
      const runtime = createWebSocketRuntime({ nodeId: "node-a", clusterBus });
      const NoReadyEvents = z.object({ onOther: z.object({ value: z.number() }) });
      runtime.registerRoute("/a", { outEvents: OutEvents });
      runtime.registerRoute("/b", { outEvents: OutEvents });
      runtime.registerRoute("/c", { outEvents: NoReadyEvents });
      const sockets = { a: new FakeWebSocket(), b: new FakeWebSocket(), c: new FakeWebSocket() };
      await runtime.registerConnection(asWebSocket(sockets.a), {
        routeKey: "/a",
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await runtime.registerConnection(asWebSocket(sockets.b), {
        routeKey: "/b",
        outEvents: OutEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await runtime.registerConnection(asWebSocket(sockets.c), {
        routeKey: "/c",
        outEvents: NoReadyEvents,
        inEvents: InEvents,
        namespace: "chat",
        heartbeat: 0,
      });
      await flushUntil(() => clusterBus.handlers.size > 0);
      const frameA = JSON.stringify({ event: "onReady", data: { ok: true, route: "a" } });
      const frameB = JSON.stringify({ event: "onReady", data: { ok: true, route: "b" } });

      await clusterBus.emit(
        createEnvelope({ id: "remote", frames: { "/a": frameA, "/b": frameB } }),
      );
      await flushUntil(
        () => sockets.a.sentMessages.length > 0 && sockets.b.sentMessages.length > 0,
      );
      await flushAsync();

      expect(sockets.a.sentMessages).toEqual([frameA]);
      expect(sockets.b.sentMessages).toEqual([frameB]);
      expect(sockets.c.sentMessages).toEqual([]);
      expect(sockets.c.closedWith).toBeNull();
    });
  });

  describe("Route table", () => {
    const NoticeEventsV1 = z.object({ onNotice: z.object({ level: z.number() }) });
    const NoticeEventsV2 = z.object({
      onNotice: z.object({ level: z.number(), source: z.string().default("v2") }),
    });
    const AlertEvents = z.object({ onAlert: z.object({ message: z.string() }) });

    // 로컬 연결 없이 원격 세션만 room-1에 있는 노드를 만든다
    async function createRemoteOnlyRuntime() {
      const presenceStore = new InMemoryWebSocketPresenceStore();
      await registerSession(presenceStore, {
        sessionId: "remote-1",
        nodeId: "node-b",
        namespace: "chat",
      });
      await presenceStore.join("remote-1", "room-1");
      const clusterBus = new RecordingClusterBus();
      const runtime = createWebSocketRuntime({
        nodeId: "node-a",
        presenceStore,
        clusterBus,
        telemetry: true,
      });
      return { runtime, clusterBus };
    }

    it("로컬 연결이 없어도 등록된 route의 frame을 담은 envelope을 원격 노드로 보낸다", async () => {
      const { runtime, clusterBus } = await createRemoteOnlyRuntime();
      runtime.registerRoute("/x", { outEvents: NoticeEventsV1 });

      await runtime.publishToRoom("room-1", "onNotice", { level: 1 }, "chat");
      await flushAsync();

      expect(clusterBus.published).toHaveLength(1);
      expect(clusterBus.published[0].targetNodeIds).toEqual(["node-b"]);
      expect(Object.keys(clusterBus.published[0].frames)).toEqual(["/x"]);
      expect(JSON.parse(clusterBus.published[0].frames["/x"])).toEqual({
        event: "onNotice",
        data: { level: 1 },
      });
    });

    it("같은 routeKey로 registerRoute를 다시 호출하면 스키마가 교체된다", async () => {
      const { runtime, clusterBus } = await createRemoteOnlyRuntime();
      runtime.registerRoute("/x", { outEvents: NoticeEventsV1 });
      runtime.registerRoute("/x", { outEvents: NoticeEventsV2 });

      await runtime.publishToRoom("room-1", "onNotice", { level: 1 }, "chat");
      await flushAsync();

      expect(Object.keys(clusterBus.published[0].frames)).toEqual(["/x"]);
      expect(JSON.parse(clusterBus.published[0].frames["/x"])).toEqual({
        event: "onNotice",
        data: { level: 1, source: "v2" },
      });
    });

    it("replaceRoutes는 route 집합 전체를 교체해 빠진 route는 제거하고 새 route와 새 스키마를 쓴다", async () => {
      const { runtime, clusterBus } = await createRemoteOnlyRuntime();
      runtime.registerRoute("/x", { outEvents: NoticeEventsV1 });
      runtime.registerRoute("/y", { outEvents: NoticeEventsV1 });

      runtime.replaceRoutes([
        { routeKey: "/y", outEvents: NoticeEventsV2 },
        { routeKey: "/z", outEvents: AlertEvents },
      ]);

      await runtime.publishToRoom("room-1", "onNotice", { level: 3 }, "chat");
      await runtime.publishToRoom("room-1", "onAlert", { message: "fire" }, "chat");
      await flushAsync();

      expect(clusterBus.published).toHaveLength(2);
      expect(Object.keys(clusterBus.published[0].frames)).toEqual(["/y"]);
      expect(JSON.parse(clusterBus.published[0].frames["/y"])).toEqual({
        event: "onNotice",
        data: { level: 3, source: "v2" },
      });
      expect(Object.keys(clusterBus.published[1].frames)).toEqual(["/z"]);
    });

    it("어떤 route도 선언하지 않은 이벤트는 envelope 없이 resolve하고 ws.publish.rejected를 남긴다", async () => {
      const { runtime, clusterBus } = await createRemoteOnlyRuntime();
      runtime.replaceRoutes([{ routeKey: "/z", outEvents: AlertEvents }]);

      await expect(
        runtime.publishToRoom("room-1", "onNotice", { level: 1 }, "chat"),
      ).resolves.toBeUndefined();
      await flushAsync();

      expect(clusterBus.published).toEqual([]);
      expect(
        (
          runtime.telemetryController.getEventStore()?.query({ name: "ws.publish.rejected" }) ?? []
        ).map((record) => record.detail),
      ).toEqual([expect.objectContaining({ event: "onNotice", reason: "unknownEvent" })]);
    });
  });
});
