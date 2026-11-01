import { WebSocketAudience } from "sonamu";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { framesOf, parseFrame } from "./helpers/fake-socket";
import {
  createRawClient,
  eventually,
  nodeKeys,
  type RawRedisClient,
  settleWithin,
  sleep,
  type StartedRedis,
  startRedis,
  timeSettle,
  uniqueName,
} from "./helpers/redis-container";
import {
  createTestNode,
  FAST_ADAPTER_OPTIONS,
  shutdownAll,
  type TestNode,
} from "./helpers/runtime-harness";
import { hashFields, readSession } from "./helpers/store-helpers";

describe("멀티 노드 전달 (Redis 공유)", () => {
  let redis: StartedRedis;
  let raw: RawRedisClient;
  const nodes: TestNode[] = [];

  function startNode(
    prefix: string,
    overrides: {
      adapter?: Partial<Parameters<typeof createTestNode>[0]["adapterOptions"]>;
      runtime?: Parameters<typeof createTestNode>[0]["runtimeOptions"];
    } = {},
  ): TestNode {
    const node = createTestNode({
      adapterOptions: {
        redis: { url: redis.url },
        prefix,
        nodeId: uniqueName("node"),
        ...FAST_ADAPTER_OPTIONS,
        ...overrides.adapter,
      },
      runtimeOptions: overrides.runtime,
    });
    nodes.push(node);
    return node;
  }

  // 두 노드를 띄우고 각 노드의 첫 연결을 맺어 구독/heartbeat가 시작되게 한다
  async function startPair(prefix: string) {
    const nodeA = startNode(prefix);
    const nodeB = startNode(prefix);
    return { nodeA, nodeB };
  }

  beforeAll(async () => {
    redis = await startRedis();
    raw = await createRawClient(redis.url);
  });

  afterEach(async () => {
    await redis.ensureUnpaused();
    await shutdownAll(nodes);
  });

  afterAll(async () => {
    await raw?.close().catch(() => {});
    await redis?.stop();
  });

  it("사용자 퇴장은 원격 방 바인딩만 제거하고 사용자 바인딩은 보존한다", async () => {
    const prefix = uniqueName("leave-user");
    const { nodeA, nodeB } = await startPair(prefix);
    const target = await nodeB.connect();
    const other = await nodeB.connect();
    await target.connection.setUserId(1);
    await other.connection.setUserId("1");
    await target.connection.join("room");
    await other.connection.join("room");
    await eventually(async () => {
      expect((await nodeA.runtime.registry.getRoomMemberCount("room")).count).toBe(2);
    });
    await expect(nodeA.runtime.leaveUser(1, "room", "chat")).resolves.toEqual({
      localLeftCount: 0,
      targetNodeCount: 1,
      partial: false,
    });
    await nodeA.runtime.publishToRoom("room", "message", { seq: 1, text: "after" }, "chat");
    await eventually(async () => {
      expect(other.socket.sentMessages).toHaveLength(1);
      expect((await nodeA.runtime.registry.getRoomMemberCount("room")).count).toBe(1);
    });
    expect(target.socket.sentMessages).toEqual([]);
    await nodeA.runtime.publishToUser(1, "message", { seq: 2, text: "user" }, "chat");
    await eventually(() => {
      expect(target.socket.sentMessages).toHaveLength(1);
    });
    const userRoute = await nodeA.adapter.presenceStore.resolveRoute(
      WebSocketAudience.user(1, "chat"),
      nodeA.nodeId,
    );
    expect(userRoute.remoteNodeIds).toEqual([nodeB.nodeId]);
  });

  it("살아 있는 노드만 반환하고 heartbeat 기한이 지난 노드는 제외한다", async () => {
    const prefix = uniqueName("live-nodes");
    const { nodeA, nodeB } = await startPair(prefix);
    await nodeA.connect();
    await nodeB.connect();
    await raw.zAdd(`${prefix}:nodes`, { score: Date.now() - 10_000, value: "expired" });
    await eventually(async () => {
      expect((await nodeA.adapter.presenceStore.getLiveNodeIds()).toSorted()).toEqual(
        [nodeA.nodeId, nodeB.nodeId].toSorted(),
      );
    });
  });

  it("어댑터를 spread한 runtime은 어댑터와 같은 nodeId를 쓴다", () => {
    const prefix = uniqueName("spread");
    const node = startNode(prefix);

    expect(node.adapter.presenceStore.nodeId).toBe(node.nodeId);
    expect(node.adapter.clusterBus.nodeId).toBe(node.nodeId);
  });

  it("다른 노드의 방 멤버에게 room publish가 전달되고, 방 밖의 연결은 받지 않는다", async () => {
    const prefix = uniqueName("room");
    const { nodeA, nodeB } = await startPair(prefix);
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    const b2 = await nodeB.connect();
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");

    await nodeA.runtime.publishToRoom("room-1", "message", { seq: 1, text: "안녕" }, "chat");

    await eventually(() => {
      expect(b1.socket.sentMessages).toHaveLength(1);
      expect(a1.socket.sentMessages).toHaveLength(1);
    });
    expect(parseFrame(b1.socket.sentMessages[0])).toEqual({
      event: "message",
      data: { seq: 1, text: "안녕" },
    });
    // 같은 route의 로컬/원격 수신자는 같은 frame 바이트를 받는다
    expect(b1.socket.sentMessages[0]).toBe(a1.socket.sentMessages[0]);
    await sleep(200);
    expect(b2.socket.sentMessages).toEqual([]);
  });

  it("await 없이 join한 직후에도 원격 노드에서 보낸 room publish를 받는다", async () => {
    const prefix = uniqueName("room-no-await");
    const { nodeA, nodeB } = await startPair(prefix);
    const a1 = await nodeA.connect();
    await nodeB.connect();

    // join promise를 기다리지 않는다. store 쓰기 순서가 보장되면 원격 라우팅에도 곧 반영된다
    a1.connection.join("room-1");
    await eventually(async () => {
      await nodeB.runtime.publishToRoom("room-1", "message", { seq: 1, text: "x" }, "chat");
      expect(a1.socket.sentMessages.length).toBeGreaterThan(0);
    });
  });

  it('publishToUser는 타입까지 같은 userId에만 전달된다 (42와 "42"는 다르다)', async () => {
    const prefix = uniqueName("user");
    const { nodeA, nodeB } = await startPair(prefix);
    await nodeA.connect();
    const b1 = await nodeB.connect();
    const b2 = await nodeB.connect();
    await b1.connection.setUserId(42);
    await b2.connection.setUserId("42");

    await nodeA.runtime.publishToUser(42, "message", { seq: 1, text: "number" }, "chat");
    await eventually(() => {
      expect(framesOf(b1.socket).map((frame) => frame.data.text)).toEqual(["number"]);
    });

    await nodeA.runtime.publishToUser("42", "message", { seq: 2, text: "string" }, "chat");
    await eventually(() => {
      expect(framesOf(b2.socket).map((frame) => frame.data.text)).toEqual(["string"]);
    });
    await sleep(200);
    expect(framesOf(b1.socket).map((frame) => frame.data.text)).toEqual(["number"]);

    await b1.connection.clearUserId();
    await nodeA.runtime.publishToUser(42, "message", { seq: 3, text: "cleared" }, "chat");
    await sleep(300);
    expect(framesOf(b1.socket).map((frame) => frame.data.text)).toEqual(["number"]);
  });

  it("connections audience는 store 라우팅 조회 없이 세션 ID에 담긴 노드로 전달된다", async () => {
    const prefix = uniqueName("connections");
    const { nodeA, nodeB } = await startPair(prefix);
    await nodeA.connect();
    const b1 = await nodeB.connect();
    const b2 = await nodeB.connect();
    const resolveRoute = vi.spyOn(nodeA.adapter.presenceStore, "resolveRoute");

    await nodeA.runtime.publishToAudience(
      WebSocketAudience.connections([b2.connection.id], "chat"),
      "message",
      { seq: 1, text: "direct" },
    );

    await eventually(() => {
      expect(framesOf(b2.socket).map((frame) => frame.data.text)).toEqual(["direct"]);
    });
    expect(resolveRoute).not.toHaveBeenCalled();
    await sleep(200);
    expect(b1.socket.sentMessages).toEqual([]);
  });

  it("all audience는 namespace를 지키고, namespace 없이 보내면 모든 namespace에 전달된다", async () => {
    const prefix = uniqueName("all");
    const { nodeA, nodeB } = await startPair(prefix);
    const bChat = await nodeB.connect({ namespace: "chat" });
    const bAdmin = await nodeB.connect({ namespace: "admin" });
    await nodeA.connect({ namespace: "chat" });

    await nodeA.runtime.broadcast("message", { seq: 1, text: "chat-only" }, "chat");
    await eventually(() => {
      expect(framesOf(bChat.socket).map((frame) => frame.data.text)).toEqual(["chat-only"]);
    });
    await sleep(200);
    expect(bAdmin.socket.sentMessages).toEqual([]);

    await nodeA.runtime.broadcast("message", { seq: 2, text: "everyone" });
    await eventually(() => {
      expect(framesOf(bChat.socket).map((frame) => frame.data.text)).toEqual([
        "chat-only",
        "everyone",
      ]);
      expect(framesOf(bAdmin.socket).map((frame) => frame.data.text)).toEqual(["everyone"]);
    });
  });

  it("같은 roomId라도 namespace가 다르면 원격 노드에서 격리된다", async () => {
    const prefix = uniqueName("ns-isolation");
    const { nodeA, nodeB } = await startPair(prefix);
    await nodeA.connect();
    const bChat = await nodeB.connect({ namespace: "chat" });
    const bAdmin = await nodeB.connect({ namespace: "admin" });
    await bChat.connection.join("room-1");
    await bAdmin.connection.join("room-1");

    await nodeA.runtime.publishToRoom("room-1", "message", { seq: 1, text: "admin" }, "admin");

    await eventually(() => {
      expect(framesOf(bAdmin.socket).map((frame) => frame.data.text)).toEqual(["admin"]);
    });
    await sleep(200);
    expect(bChat.socket.sentMessages).toEqual([]);
  });

  it("union audience는 원격 노드에서도 한 연결에 한 번만 전달된다", async () => {
    const prefix = uniqueName("union");
    const { nodeA, nodeB } = await startPair(prefix);
    await nodeA.connect();
    const b1 = await nodeB.connect();
    await b1.connection.join("room-1");
    await b1.connection.setUserId(7);

    await nodeA.runtime.publishToAudience(
      WebSocketAudience.union(
        WebSocketAudience.room("room-1", "chat"),
        WebSocketAudience.user(7, "chat"),
      ),
      "message",
      { seq: 1, text: "once" },
    );

    await eventually(() => {
      expect(b1.socket.sentMessages).toHaveLength(1);
    });
    await sleep(300);
    expect(b1.socket.sentMessages).toHaveLength(1);
  });

  it("비활성 연결은 activateConnection 전까지 원격 publish를 받지 않는다", async () => {
    const prefix = uniqueName("inactive");
    const { nodeA, nodeB } = await startPair(prefix);
    await nodeA.connect();
    const pending = await nodeB.connect({ active: false });
    await pending.connection.join("room-1");

    await nodeA.runtime.publishToRoom("room-1", "message", { seq: 1, text: "early" }, "chat");
    await sleep(300);
    expect(pending.socket.sentMessages).toEqual([]);

    await nodeB.runtime.activateConnection(pending.connection.id);
    await nodeA.runtime.publishToRoom("room-1", "message", { seq: 2, text: "late" }, "chat");

    await eventually(() => {
      expect(framesOf(pending.socket).map((frame) => frame.data.text)).toEqual(["late"]);
    });
  });

  it("getRoomMemberCount는 클러스터 전체 활성 멤버 수를 partial: false로 돌려준다", async () => {
    const prefix = uniqueName("member-count");
    const { nodeA, nodeB } = await startPair(prefix);
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    const b2 = await nodeB.connect();
    const b3 = await nodeB.connect({ active: false });
    for (const item of [a1, b1, b2, b3]) {
      await item.connection.join("room-1");
    }

    expect(await nodeA.runtime.registry.getRoomMemberCount("room-1", "chat")).toEqual({
      count: 3,
      partial: false,
    });
    expect(await nodeB.runtime.registry.getRoomMemberCount("room-1")).toEqual({
      count: 3,
      partial: false,
    });
    // getRoomMembers는 노드 로컬 멤버만 돌려준다
    expect(nodeA.runtime.registry.getRoomMembers("room-1", "chat")).toHaveLength(1);
  });

  it("같은 namespace의 route마다 자기 스키마로 인코딩한 frame을 받고, 이벤트를 선언하지 않은 route는 건너뛴다", async () => {
    const prefix = uniqueName("per-route");
    const { nodeA, nodeB } = await startPair(prefix);
    const aChat = await nodeA.connect({ route: "chat" });
    const aAlt = await nodeA.connect({ route: "chatAlt" });
    const bChat = await nodeB.connect({ route: "chat" });
    const bAlt = await nodeB.connect({ route: "chatAlt" });
    const bAudit = await nodeB.connect({ route: "audit" });
    for (const item of [aChat, aAlt, bChat, bAlt, bAudit]) {
      await item.connection.join("room-1");
    }

    await nodeA.runtime.publishToRoom("room-1", "message", { seq: 1, text: "per-route" }, "chat");

    await eventually(() => {
      for (const item of [aChat, aAlt, bChat, bAlt]) {
        expect(item.socket.sentMessages).toHaveLength(1);
      }
    });
    expect(parseFrame(bChat.socket.sentMessages[0]).data).toEqual({ seq: 1, text: "per-route" });
    // alt route 스키마에는 text가 없으므로 그 route의 frame에서 빠진다
    expect(parseFrame(bAlt.socket.sentMessages[0]).data).toEqual({ seq: 1 });
    expect(bChat.socket.sentMessages[0]).toBe(aChat.socket.sentMessages[0]);
    expect(bAlt.socket.sentMessages[0]).toBe(aAlt.socket.sentMessages[0]);
    await sleep(300);
    expect(bAudit.socket.sentMessages).toEqual([]);
    expect(bAudit.socket.closedWith).toBeNull();
  });

  it("z.date() 필드는 원격 노드에서도 로컬과 같은 ISO 문자열 frame으로 도착하고 연결을 닫지 않는다", async () => {
    const prefix = uniqueName("date");
    const { nodeA, nodeB } = await startPair(prefix);
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");
    const at = new Date("2026-03-04T05:06:07.890Z");

    await nodeA.runtime.publishToRoom("room-1", "stamped", { at, label: "시각" }, "chat");

    await eventually(() => {
      expect(a1.socket.sentMessages).toHaveLength(1);
      expect(b1.socket.sentMessages).toHaveLength(1);
    });
    expect(b1.socket.sentMessages[0]).toBe(a1.socket.sentMessages[0]);
    expect(parseFrame(b1.socket.sentMessages[0]).data).toEqual({
      at: at.toISOString(),
      label: "시각",
    });
    expect(a1.socket.closedWith).toBeNull();
    expect(b1.socket.closedWith).toBeNull();
  });

  it("잘못된 payload의 registry publish는 resolve되고 어느 노드에도 전달하거나 연결을 닫지 않는다", async () => {
    const prefix = uniqueName("invalid");
    const { nodeA, nodeB } = await startPair(prefix);
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");

    await expect(
      nodeA.runtime.publishToRoom("room-1", "message", { seq: "not-a-number", text: 1 }, "chat"),
    ).resolves.toBeUndefined();
    await expect(
      nodeA.runtime.publishToRoom("room-1", "unknownEvent", { any: true }, "chat"),
    ).resolves.toBeUndefined();

    await sleep(400);
    expect(a1.socket.sentMessages).toEqual([]);
    expect(b1.socket.sentMessages).toEqual([]);
    expect(a1.socket.closedWith).toBeNull();
    expect(b1.socket.closedWith).toBeNull();
  });

  it("한 노드의 publish A, B는 로컬과 원격 모두에서 A, B 순서로 도착한다 (라우팅이 느린 room 뒤의 connections도 앞지르지 않는다)", async () => {
    const prefix = uniqueName("order");
    const { nodeA, nodeB } = await startPair(prefix);
    const a1 = await nodeA.connect();
    const b1 = await nodeB.connect();
    await a1.connection.join("room-1");
    await b1.connection.join("room-1");

    const publishing: Array<Promise<void>> = [];
    for (let seq = 0; seq < 20; seq += 1) {
      // 짝수는 store 라우팅이 필요한 room, 홀수는 라우팅 조회가 없는 connections audience
      publishing.push(
        seq % 2 === 0
          ? nodeA.runtime.publishToRoom("room-1", "message", { seq, text: "room" }, "chat")
          : nodeA.runtime.publishToAudience(
              WebSocketAudience.connections([b1.connection.id, a1.connection.id], "chat"),
              "message",
              { seq, text: "direct" },
            ),
      );
    }
    await Promise.all(publishing);

    const expected = Array.from({ length: 20 }, (_, seq) => seq);
    await eventually(() => {
      expect(framesOf(b1.socket).map((frame) => frame.data.seq)).toEqual(expected);
    });
    expect(framesOf(a1.socket).map((frame) => frame.data.seq)).toEqual(expected);
  });

  it("등록이 끝나기 전에 소켓이 닫히면 큐가 정리된 뒤 Redis에 세션·방·사용자·namespace 엔트리가 남지 않는다", async () => {
    const prefix = uniqueName("close-early");
    const { nodeB } = await startPair(prefix);
    const keys = nodeKeys(prefix, nodeB.nodeId);
    // 다른 연결 하나로 노드 키가 실제로 쓰이는지 기준을 만든다
    const keeper = await nodeB.connect();

    const { socket, registering } = nodeB.startConnect();
    socket.simulateRemoteClose();
    await settleWithin(registering, 5_000);

    await eventually(async () => {
      expect(await raw.hKeys(keys.sessions)).toEqual([keeper.connection.id]);
      expect(await raw.hGet(keys.namespaces, "chat")).toBe("1");
    });
    expect(nodeB.runtime.registry.getConnectionCount()).toBe(1);
  });

  it("Redis가 멈춘 동안 등록과 close가 겹쳐도 unregister가 register 뒤에 실행되어 고스트 엔트리가 남지 않는다", async () => {
    const prefix = uniqueName("close-early-paused");
    const nodeB = startNode(prefix, { adapter: { commandDeadlineMs: 3_000 } });
    const keys = nodeKeys(prefix, nodeB.nodeId);
    const keeper = await nodeB.connect();
    await keeper.connection.join("room-keep");

    await redis.pause();
    const { socket, registering } = nodeB.startConnect();
    socket.simulateRemoteClose();
    await sleep(300);
    await redis.unpause();
    await settleWithin(registering, 10_000);

    await eventually(
      async () => {
        expect(await raw.hKeys(keys.sessions)).toEqual([keeper.connection.id]);
        expect(await raw.hGet(keys.namespaces, "chat")).toBe("1");
        expect(Object.values(await hashFields(raw, keys.rooms))).toEqual(["1"]);
      },
      { timeoutMs: 10_000 },
    );
    expect(nodeB.runtime.registry.getConnectionCount()).toBe(1);
  });

  it("정상 shutdown은 노드 키를 지우고 nodes에서 제거해 다른 노드의 라우팅에서 빠진다", async () => {
    const prefix = uniqueName("shutdown");
    const { nodeA, nodeB } = await startPair(prefix);
    const keysB = nodeKeys(prefix, nodeB.nodeId);
    await nodeA.connect();
    const b1 = await nodeB.connect();
    await b1.connection.join("room-1");
    expect(await raw.exists(keysB.sessions)).toBe(1);

    await nodeB.shutdown();

    expect(await raw.exists([keysB.sessions, keysB.rooms, keysB.users, keysB.namespaces])).toBe(0);
    expect(await raw.zScore(keysB.nodes, nodeB.nodeId)).toBeNull();
    expect(
      (
        await nodeA.adapter.presenceStore.resolveRoute(
          WebSocketAudience.room("room-1", "chat"),
          nodeA.nodeId,
        )
      ).remoteNodeIds,
    ).toEqual([]);
    expect(await nodeA.runtime.registry.getRoomMemberCount("room-1", "chat")).toEqual({
      count: 0,
      partial: false,
    });
    // shutdown 뒤 늦게 도착한 쓰기가 키를 되살리지 않는다
    await sleep(500);
    expect(await raw.exists([keysB.sessions, keysB.rooms, keysB.users, keysB.namespaces])).toBe(0);
  });

  it("drain timeout을 넘겨도 shutdown은 노드 키를 지우고 nodes에서 제거하며, 늦은 쓰기가 키를 되살리지 않는다", async () => {
    const prefix = uniqueName("drain-timeout");
    const nodeB = startNode(prefix, {
      adapter: { commandDeadlineMs: 20_000, drainTimeoutMs: 300 },
      runtime: { drainTimeoutMs: 300 },
    });
    const keysB = nodeKeys(prefix, nodeB.nodeId);
    const b1 = await nodeB.connect();
    await b1.connection.join("room-1");
    expect(await raw.exists(keysB.sessions)).toBe(1);

    await redis.pause();
    // Redis가 멈춘 동안 보낸 mutation은 deadline(20초) 전까지 끝나지 않아 drain을 막는다
    b1.connection.join("room-2");
    b1.connection.setUserId("late-user");
    const shutdown = timeSettle(nodeB.shutdown());
    await sleep(1_500);
    await redis.unpause();
    const result = await shutdown;

    expect(result.status).toBe("fulfilled");
    // 명령 deadline까지 기다리지 않는다
    expect(result.elapsedMs).toBeLessThan(10_000);
    await eventually(async () => {
      expect(await raw.exists([keysB.sessions, keysB.rooms, keysB.users, keysB.namespaces])).toBe(
        0,
      );
      expect(await raw.zScore(keysB.nodes, nodeB.nodeId)).toBeNull();
    });
    await sleep(800);
    expect(await raw.exists([keysB.sessions, keysB.rooms, keysB.users, keysB.namespaces])).toBe(0);
    expect(await raw.zScore(keysB.nodes, nodeB.nodeId)).toBeNull();
  });

  it("Redis가 끝까지 응답하지 않아도 shutdown은 drainTimeoutMs와 commandDeadlineMs 안에 끝난다", async () => {
    const prefix = uniqueName("drain-never");
    const nodeB = startNode(prefix, {
      adapter: { commandDeadlineMs: 1_000, drainTimeoutMs: 300 },
      runtime: { drainTimeoutMs: 300 },
    });
    const b1 = await nodeB.connect();
    await b1.connection.join("room-1");

    await redis.pause();
    b1.connection.join("room-2");
    const result = await timeSettle(nodeB.shutdown());
    await redis.unpause();

    expect(result.status).toBe("fulfilled");
    // runtime drain 300 + adapter drain 300 + 키 삭제 deadline 1000 + 여유
    expect(result.elapsedMs).toBeLessThan(4_500);
  });

  it("세션 JSON의 rooms는 노드 메모리와 같은 배열이다", async () => {
    const prefix = uniqueName("session-json");
    const nodeB = startNode(prefix);
    const keys = nodeKeys(prefix, nodeB.nodeId);
    const b1 = await nodeB.connect();
    await b1.connection.join("room-1");
    await b1.connection.join("room-2");
    await b1.connection.leave("room-1");

    expect((await readSession(raw, keys.sessions, b1.connection.id))?.rooms).toEqual(["room-2"]);
  });
});
