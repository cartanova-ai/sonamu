import { hostname } from "node:os";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AnyWebSocketConnection,
  createWebSocketNodeId,
  createWebSocketRuntime,
  createWebSocketSessionId,
  InMemoryWebSocketPresenceStore,
  parseWebSocketSessionNodeId,
  WebSocketAudience,
  type WebSocketRuntime,
} from "../index";
import {
  FakeWebSocket,
  InProcessClusterNetwork,
  ScriptedPresenceStore,
  asWebSocket,
  flushAsync,
  flushUntil,
  parseFrames,
} from "./ws-test-helpers";

const ChatEvents = z.object({
  onMessage: z.object({ text: z.string() }),
  onSeq: z.object({ seq: z.number() }),
});
const StampEvents = z.object({
  onStamp: z.object({ at: z.date(), label: z.string() }),
});
const InEvents = z.object({});

type ClusterNode = {
  nodeId: string;
  runtime: WebSocketRuntime;
  store: ScriptedPresenceStore;
  connect: (input?: { routeKey?: "/chat" | "/stamp"; namespace?: string }) => Promise<{
    socket: FakeWebSocket;
    connection: AnyWebSocketConnection;
  }>;
};

// 같은 InMemory store와 in-process bus를 공유하는 두 노드 클러스터를 만든다
function createCluster(nodeIds: string[] = ["node-a", "node-b"]) {
  const shared = new InMemoryWebSocketPresenceStore();
  const network = new InProcessClusterNetwork();
  const nodes = nodeIds.map((nodeId): ClusterNode => {
    const store = new ScriptedPresenceStore(shared);
    const runtime = createWebSocketRuntime({
      nodeId,
      presenceStore: store,
      clusterBus: network.bus(nodeId),
      telemetry: true,
    });
    // 모든 노드는 같은 route 집합을 시작 시점에 등록한다
    runtime.registerRoute("/chat", { outEvents: ChatEvents });
    runtime.registerRoute("/stamp", { outEvents: StampEvents });
    return {
      nodeId,
      runtime,
      store,
      async connect(input = {}) {
        const socket = new FakeWebSocket();
        const namespace = input.namespace ?? "chat";
        if (input.routeKey === "/stamp") {
          const connection = await runtime.registerConnection(asWebSocket(socket), {
            routeKey: "/stamp",
            outEvents: StampEvents,
            inEvents: InEvents,
            namespace,
            heartbeat: 0,
          });
          return { socket, connection };
        }
        const connection = await runtime.registerConnection(asWebSocket(socket), {
          routeKey: "/chat",
          outEvents: ChatEvents,
          inEvents: InEvents,
          namespace,
          heartbeat: 0,
        });
        return { socket, connection };
      },
    };
  });
  return { shared, network, nodes };
}

// 원격 구독이 비동기로 완료될 시간을 준다
async function settleSubscriptions(): Promise<void> {
  await flushAsync(5);
}

describe("WebSocket 멀티 노드 전달", () => {
  it("room publish는 로컬과 원격 수신자에게 같은 바이트의 frame을 전달하고, 수신 노드는 store를 조회하지 않는다", async () => {
    const { network, nodes } = createCluster();
    const [nodeA, nodeB] = nodes;
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    const b2 = await nodeB.connect();
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");
    await settleSubscriptions();
    const nodeBCallsBefore = nodeB.store.calls.length;

    await nodeA.runtime.publishToRoom("room-1", "onMessage", { text: "hello" }, "chat");
    await flushUntil(() => a1.socket.sentMessages.length > 0 && b1.socket.sentMessages.length > 0);
    await flushAsync();

    expect(parseFrames(a1.socket)).toEqual([{ event: "onMessage", data: { text: "hello" } }]);
    expect(b1.socket.sentMessages).toEqual(a1.socket.sentMessages);
    expect(b2.socket.sentMessages).toEqual([]);
    expect(network.published).toHaveLength(1);
    expect(network.published[0].targetNodeIds).toEqual(["node-b"]);
    expect(network.published[0].kind === "publish" && network.published[0].frames["/chat"]).toBe(
      a1.socket.sentMessages[0],
    );
    expect(nodeB.store.calls.slice(nodeBCallsBefore)).toEqual([]);
    expect(nodeA.store.callsOf("resolveRoute")).toEqual(["resolveRoute:node-a:room"]);
  });

  it("user publish는 노드를 넘어 typed userId로만 매칭된다", async () => {
    const { nodes } = createCluster();
    const [nodeA, nodeB] = nodes;
    const b1 = await nodeB.connect();
    await b1.connection.setUserId(1);
    await settleSubscriptions();

    await nodeA.runtime.publishToUser("1", "onMessage", { text: "string-id" }, "chat");
    await flushAsync(10);
    expect(b1.socket.sentMessages).toEqual([]);

    await nodeA.runtime.publishToUser(1, "onMessage", { text: "numeric-id" }, "chat");
    await flushUntil(() => b1.socket.sentMessages.length > 0);
    expect(parseFrames(b1.socket)).toEqual([{ event: "onMessage", data: { text: "numeric-id" } }]);
  });

  it("connections audience는 resolveRoute 없이 세션 ID의 노드로만 라우팅한다", async () => {
    const { network, nodes } = createCluster(["node-a", "node-b", "node-c"]);
    const [nodeA, nodeB, nodeC] = nodes;
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    const c1 = await nodeC.connect();
    await settleSubscriptions();

    await nodeA.runtime.publishToAudience(
      WebSocketAudience.connections([a1.connection.id, b1.connection.id]),
      "onMessage",
      { text: "direct" },
    );
    await flushUntil(() => a1.socket.sentMessages.length > 0 && b1.socket.sentMessages.length > 0);
    await flushAsync();

    expect(a1.socket.sentMessages).toHaveLength(1);
    expect(b1.socket.sentMessages).toEqual(a1.socket.sentMessages);
    expect(c1.socket.sentMessages).toEqual([]);
    for (const node of nodes) {
      expect(node.store.callsOf("resolveRoute")).toEqual([]);
    }
    expect(network.published.map((envelope) => envelope.targetNodeIds)).toEqual([["node-b"]]);
  });

  it("all audience는 namespace를 지키며 모든 노드에 전달되고, union은 노드를 넘어 중복 없이 전달된다", async () => {
    const { nodes } = createCluster();
    const [nodeA, nodeB] = nodes;
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    const bAdmin = await nodeB.connect({ namespace: "admin" });
    await b1.connection.join("room-1");
    await b1.connection.setUserId("user-1");
    await settleSubscriptions();

    await nodeA.runtime.broadcast("onSeq", { seq: 1 }, "chat");
    await flushUntil(() => b1.socket.sentMessages.length >= 1);
    await flushAsync();
    expect(a1.socket.sentMessages).toHaveLength(1);
    expect(b1.socket.sentMessages).toHaveLength(1);
    expect(bAdmin.socket.sentMessages).toHaveLength(0);

    await nodeA.runtime.broadcast("onSeq", { seq: 2 });
    await flushUntil(() => bAdmin.socket.sentMessages.length >= 1);
    await flushAsync();
    expect(a1.socket.sentMessages).toHaveLength(2);
    expect(b1.socket.sentMessages).toHaveLength(2);
    expect(bAdmin.socket.sentMessages).toHaveLength(1);

    await nodeA.runtime.publishToAudience(
      WebSocketAudience.union(
        WebSocketAudience.room("room-1", "chat"),
        WebSocketAudience.user("user-1", "chat"),
      ),
      "onSeq",
      { seq: 3 },
    );
    await flushUntil(() => b1.socket.sentMessages.length >= 3);
    await flushAsync(10);
    expect(parseFrames(b1.socket).map((frame) => frame.data)).toEqual([
      { seq: 1 },
      { seq: 2 },
      { seq: 3 },
    ]);
    expect(a1.socket.sentMessages).toHaveLength(2);
  });

  it("z.date() 필드는 원격 소켓에도 로컬과 같은 ISO 문자열로 도착하고 아무 연결도 닫히지 않는다", async () => {
    const { nodes } = createCluster();
    const [nodeA, nodeB] = nodes;
    const a1 = await nodeA.connect({ routeKey: "/stamp" });
    const b1 = await nodeB.connect({ routeKey: "/stamp" });
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");
    await settleSubscriptions();

    await nodeA.runtime.publishToRoom(
      "room-1",
      "onStamp",
      { at: new Date("2026-03-04T05:06:07.890Z"), label: "now" },
      "chat",
    );
    await flushUntil(() => b1.socket.sentMessages.length > 0);
    await flushAsync();

    expect(parseFrames(a1.socket)).toEqual([
      { event: "onStamp", data: { at: "2026-03-04T05:06:07.890Z", label: "now" } },
    ]);
    expect(b1.socket.sentMessages).toEqual(a1.socket.sentMessages);
    expect(a1.socket.closedWith).toBeNull();
    expect(b1.socket.closedWith).toBeNull();
    expect(
      nodeB.runtime.telemetryController
        .getEventStore()
        ?.query({ name: "ws.fanout.publish.failed" }),
    ).toEqual([]);
  });

  it("한 노드의 연속 publish는 원격 수신자에게도 발행 순서대로 도착한다", async () => {
    const { nodes } = createCluster();
    const [nodeA, nodeB] = nodes;
    const b1 = await nodeB.connect();
    await b1.connection.join("room-1");
    await settleSubscriptions();

    const publishes = [1, 2, 3, 4, 5].map((seq) =>
      nodeA.runtime.publishToRoom("room-1", "onSeq", { seq }, "chat"),
    );
    await Promise.all(publishes);
    await flushUntil(() => b1.socket.sentMessages.length >= 5);

    expect(parseFrames(b1.socket).map((frame) => frame.data)).toEqual([
      { seq: 1 },
      { seq: 2 },
      { seq: 3 },
      { seq: 4 },
      { seq: 5 },
    ]);
  });

  it("getRoomMemberCount는 클러스터 전체를 세고, 원격 연결이 닫히면 더 이상 그 노드로 라우팅하지 않는다", async () => {
    const { network, nodes } = createCluster();
    const [nodeA, nodeB] = nodes;
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");
    await settleSubscriptions();

    await expect(nodeA.runtime.registry.getRoomMemberCount("room-1", "chat")).resolves.toEqual({
      count: 2,
      partial: false,
    });
    expect(nodeA.runtime.registry.getRoomMembers("room-1", "chat")).toHaveLength(1);

    b1.connection.close(1000, "bye");
    await flushUntil(() => nodeB.store.callsOf("unregister").length > 0);
    await flushAsync();

    await expect(nodeA.runtime.registry.getRoomMemberCount("room-1", "chat")).resolves.toEqual({
      count: 1,
      partial: false,
    });
    await nodeA.runtime.publishToRoom("room-1", "onMessage", { text: "after-close" }, "chat");
    await flushAsync();
    expect(network.published).toEqual([]);
  });
});

describe("WebSocket 노드 식별", () => {
  it("세션 ID는 노드 ID를 포함하고 구분자를 포함한 노드 ID도 그대로 복원된다", () => {
    const nodeIds = ["node-a", "host-1234-ab12cd", "weird:node::id", "a|b/c.d_e-f", "노드-1"];

    for (const nodeId of nodeIds) {
      const first = createWebSocketSessionId(nodeId);
      const second = createWebSocketSessionId(nodeId);

      expect(first).not.toBe(second);
      expect(parseWebSocketSessionNodeId(first)).toBe(nodeId);
      expect(parseWebSocketSessionNodeId(second)).toBe(nodeId);
    }
  });

  it("runtime이 만든 연결 ID에서 그 runtime의 nodeId를 복원할 수 있다", async () => {
    const nodeId = "pod:with::separators-1";
    const runtime = createWebSocketRuntime({ nodeId });
    const connection = await runtime.registerConnection(asWebSocket(new FakeWebSocket()), {
      outEvents: ChatEvents,
      inEvents: InEvents,
      heartbeat: 0,
    });

    expect(parseWebSocketSessionNodeId(connection.id)).toBe(nodeId);
  });

  it("기본 nodeId는 hostname-pid-랜덤 형식이고 같은 프로세스의 두 runtime도 서로 다르다", () => {
    const prefix = `${hostname()}-${process.pid}-`;
    const first = createWebSocketRuntime().registry.nodeId;
    const second = createWebSocketRuntime().registry.nodeId;
    const helperIds = [createWebSocketNodeId(), createWebSocketNodeId()];

    for (const nodeId of [first, second, ...helperIds]) {
      expect(nodeId.startsWith(prefix)).toBe(true);
      expect(nodeId.slice(prefix.length)).toMatch(/^[A-Za-z0-9_-]{4,}$/);
    }
    expect(first).not.toBe(second);
    expect(helperIds[0]).not.toBe(helperIds[1]);
  });
});
