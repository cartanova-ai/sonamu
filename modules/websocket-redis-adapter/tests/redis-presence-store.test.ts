import { createClient } from "redis";
import { InMemoryWebSocketPresenceStore, WebSocketAudience } from "sonamu";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createRedisWebSocketAdapter, type RedisWebSocketAdapter } from "../src/index";
import {
  clientAddressOf,
  createRawClient,
  eventually,
  nodeKeys,
  type RawRedisClient,
  readCommandStats,
  settleWithin,
  sleep,
  type StartedRedis,
  startRedis,
  startMonitor,
  statOf,
  uniqueName,
} from "./helpers/redis-container";
import { FAST_ADAPTER_OPTIONS, shutdownAdapters } from "./helpers/runtime-harness";
import {
  createGate,
  FIXED_CONNECTED_AT,
  hashFields,
  readSession,
  registerSession,
} from "./helpers/store-helpers";

// heartbeat가 검증 구간에 끼어들지 않도록 아주 긴 주기를 쓴다
const QUIET_HEARTBEAT_OPTIONS = {
  heartbeatIntervalMs: 600_000,
  nodeTimeoutMs: 1_800_000,
  keyTtlMs: 3_600_000,
  commandDeadlineMs: 2_000,
  readyTimeoutMs: 2_000,
  drainTimeoutMs: 1_000,
};

/**
 * rebuild 대기 상태를 만든 뒤, rebuild의 첫 EVALSHA가 NOSCRIPT를 받고 SCRIPT LOAD에서 멈추게 한다.
 * 그 사이에 실행할 mutation을 넘기면, mutation이 Redis에 반영된 뒤(또는 0.5초 뒤) rebuild를 이어서 실행한다.
 */
async function raceMutationWithRebuildReload(input: {
  raw: RawRedisClient;
  caller: RawRedisClient;
  adapter: RedisWebSocketAdapter;
  mutation: () => Promise<void>;
}): Promise<void> {
  const store = input.adapter.presenceStore;
  const gate = createGate();
  const originalScriptLoad = input.caller.scriptLoad.bind(input.caller);
  vi.spyOn(input.caller, "scriptLoad").mockImplementationOnce(async (source) => {
    gate.markReached();
    await gate.released;
    return originalScriptLoad(source);
  });
  // 쓰기 실패 1회로 rebuild 대기를 만든다 (메모리에는 반영된다)
  vi.spyOn(input.caller, "evalSha").mockRejectedValueOnce(new Error("테스트용 쓰기 실패"));
  await store.join("s1", "room-failed-write").catch(() => {});
  expect(store.getStatus().rebuildPending).toBe(true);
  // 다음 heartbeat가 예약할 rebuild의 EVALSHA가 NOSCRIPT를 받게 한다
  await input.raw.scriptFlush();

  expect(await settleWithin(gate.reached, 5_000)).toBe("fulfilled");
  // rebuild가 SCRIPT LOAD에서 멈춘 사이에 mutation을 보낸다
  const mutating = input.mutation();
  await settleWithin(mutating, 500);
  gate.release();
  expect(await settleWithin(mutating, 5_000)).toBe("fulfilled");
}

// 라우팅이 세션 목록을 읽지 않음을 확인할 때 보는 명령들
const SESSION_LIST_READ_COMMANDS = ["hgetall", "hkeys", "hvals", "hscan", "scan", "keys"];

describe("RedisWebSocketPresenceStore", () => {
  let redis: StartedRedis;
  let raw: RawRedisClient;
  const adapters: RedisWebSocketAdapter[] = [];

  function createAdapter(
    options: Partial<Parameters<typeof createRedisWebSocketAdapter>[0]> & {
      prefix: string;
      nodeId: string;
    },
  ): RedisWebSocketAdapter {
    const adapter = createRedisWebSocketAdapter({
      redis: { url: redis.url },
      ...FAST_ADAPTER_OPTIONS,
      ...options,
    });
    adapters.push(adapter);
    return adapter;
  }

  beforeAll(async () => {
    redis = await startRedis();
    raw = await createRawClient(redis.url);
  });

  afterEach(async () => {
    await redis.ensureUnpaused();
    await shutdownAdapters(adapters);
  });

  afterAll(async () => {
    await raw?.close().catch(() => {});
    await redis?.stop();
  });

  describe("데이터 모델", () => {
    it("mutation 결과를 <prefix>:{node}:sessions|rooms|users|namespaces 해시와 <prefix>:nodes 정렬 집합에 저장한다", async () => {
      const prefix = uniqueName("model");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const adapter = createAdapter({ prefix, nodeId, ...QUIET_HEARTBEAT_OPTIONS });
      const store = adapter.presenceStore;
      const before = Date.now();

      await registerSession(store, { sessionId: "s1", nodeId, namespace: "chat" });
      await registerSession(store, { sessionId: "s2", nodeId, namespace: "chat", active: false });
      await store.join("s1", "room-1");
      await store.setUserId("s1", 7);

      expect(await raw.type(keys.sessions)).toBe("hash");
      expect(await raw.type(keys.rooms)).toBe("hash");
      expect(await raw.type(keys.users)).toBe("hash");
      expect(await raw.type(keys.namespaces)).toBe("hash");
      expect(await raw.type(keys.nodes)).toBe("zset");

      // 이 노드의 키는 해시태그 {nodeId}를 공유하는 4개뿐이다
      expect((await raw.keys(`*${nodeId}*`)).toSorted()).toEqual(
        [keys.namespaces, keys.rooms, keys.sessions, keys.users].toSorted(),
      );

      expect((await raw.hKeys(keys.sessions)).toSorted()).toEqual(["s1", "s2"]);
      const session = await readSession(raw, keys.sessions, "s1");
      expect(session).toMatchObject({
        namespace: "chat",
        active: true,
        rooms: ["room-1"],
        // 날짜는 epoch ms로 저장한다
        connectedAt: FIXED_CONNECTED_AT.getTime(),
      });
      expect(session?.userId).toBeDefined();
      expect(await readSession(raw, keys.sessions, "s2")).toMatchObject({
        active: false,
        rooms: [],
      });

      // namespace → 활성 세션 수 (비활성 s2는 세지 않는다)
      expect(await raw.hGet(keys.namespaces, "chat")).toBe("1");
      expect(Object.values(await hashFields(raw, keys.rooms))).toEqual(["1"]);
      expect(Object.values(await hashFields(raw, keys.users))).toEqual(["1"]);

      const score = await raw.zScore(keys.nodes, nodeId);
      expect(score).not.toBeNull();
      expect(Number(score)).toBeGreaterThanOrEqual(before - 1_000);
      expect(Number(score)).toBeLessThanOrEqual(Date.now() + 1_000);

      await store.activate("s2");
      expect(await raw.hGet(keys.namespaces, "chat")).toBe("2");
      expect((await readSession(raw, keys.sessions, "s2"))?.active).toBe(true);
    });

    it("같은 방에 두 세션이 들어오면 rooms 해시 count가 2가 되고, namespace가 다르면 다른 필드로 센다", async () => {
      const prefix = uniqueName("rooms");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const store = createAdapter({ prefix, nodeId, ...QUIET_HEARTBEAT_OPTIONS }).presenceStore;

      await registerSession(store, { sessionId: "c1", nodeId, namespace: "chat" });
      await registerSession(store, { sessionId: "c2", nodeId, namespace: "chat" });
      await registerSession(store, { sessionId: "a1", nodeId, namespace: "admin" });
      await store.join("c1", "room-1");
      await store.join("c2", "room-1");
      await store.join("a1", "room-1");

      expect(Object.values(await hashFields(raw, keys.rooms)).toSorted()).toEqual(["1", "2"]);
      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(2);
      expect(await store.getRoomMemberCount("room-1", "admin")).toBe(1);
      expect(await store.getRoomMemberCount("room-1")).toBe(3);
      expect(await store.getRoomMemberCount("room-404", "chat")).toBe(0);
    });

    it("getRoomMemberCount는 활성 세션만 세고, 활성화되면 포함한다", async () => {
      const prefix = uniqueName("inactive");
      const nodeId = uniqueName("node-a");
      const store = createAdapter({ prefix, nodeId, ...QUIET_HEARTBEAT_OPTIONS }).presenceStore;

      await registerSession(store, { sessionId: "s1", nodeId });
      await registerSession(store, { sessionId: "s2", nodeId, active: false });
      await store.join("s1", "room-1");
      await store.join("s2", "room-1");

      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(1);

      await store.activate("s2");

      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(2);
    });

    it("leave/clearUserId/unregister 뒤에는 세션·방·사용자·namespace 엔트리가 남지 않는다", async () => {
      const prefix = uniqueName("cleanup");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const store = createAdapter({ prefix, nodeId, ...QUIET_HEARTBEAT_OPTIONS }).presenceStore;

      await registerSession(store, { sessionId: "s1", nodeId });
      await registerSession(store, { sessionId: "s2", nodeId });
      await store.join("s1", "room-1");
      await store.join("s2", "room-2");
      await store.setUserId("s1", "user-1");
      await store.setUserId("s2", 2);

      await store.leave("s1", "room-1");
      await store.clearUserId("s1");
      expect((await readSession(raw, keys.sessions, "s1"))?.rooms).toEqual([]);
      expect((await readSession(raw, keys.sessions, "s1"))?.userId ?? null).toBeNull();
      expect(Object.values(await hashFields(raw, keys.rooms))).toEqual(["1"]);
      expect(Object.values(await hashFields(raw, keys.users))).toEqual(["1"]);

      await store.unregister("s1");
      await store.unregister("s2");

      expect(await raw.hLen(keys.sessions)).toBe(0);
      expect(await raw.hLen(keys.rooms)).toBe(0);
      expect(await raw.hLen(keys.users)).toBe(0);
      const namespaceCount = await raw.hGet(keys.namespaces, "chat");
      expect(namespaceCount === null || namespaceCount === undefined).toBe(true);
    });
  });

  describe("userId 타입 구분", () => {
    it('숫자 1과 문자열 "1"을 다른 사용자로 저장하고 라우팅한다', async () => {
      const prefix = uniqueName("typed");
      const nodeA = uniqueName("node-a");
      const nodeB = uniqueName("node-b");
      const nodeC = uniqueName("node-c");
      const keysA = nodeKeys(prefix, nodeA);
      const storeA = createAdapter({
        prefix,
        nodeId: nodeA,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;
      const storeB = createAdapter({
        prefix,
        nodeId: nodeB,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;
      const storeC = createAdapter({
        prefix,
        nodeId: nodeC,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;

      await registerSession(storeA, { sessionId: "numeric", nodeId: nodeA });
      await registerSession(storeA, { sessionId: "string", nodeId: nodeA });
      await registerSession(storeB, { sessionId: "only-string", nodeId: nodeB });
      await storeA.setUserId("numeric", 1);
      await storeA.setUserId("string", "1");
      await storeB.setUserId("only-string", "1");
      await registerSession(storeC, { sessionId: "observer", nodeId: nodeC });

      // users 해시는 타입 태그가 포함된 필드를 쓰므로 1과 "1"이 두 필드가 된다
      expect(Object.keys(await hashFields(raw, keysA.users))).toHaveLength(2);
      const numeric = await readSession(raw, keysA.sessions, "numeric");
      const string = await readSession(raw, keysA.sessions, "string");
      expect(numeric?.userId).toBeDefined();
      expect(string?.userId).toBeDefined();
      expect(JSON.stringify(numeric?.userId)).not.toBe(JSON.stringify(string?.userId));

      expect(
        (await storeC.resolveRoute(WebSocketAudience.user(1, "chat"), nodeC)).remoteNodeIds,
      ).toEqual([nodeA]);
      expect(
        [
          ...(await storeC.resolveRoute(WebSocketAudience.user("1", "chat"), nodeC)).remoteNodeIds,
        ].toSorted(),
      ).toEqual([nodeA, nodeB].toSorted());
      expect(
        (await storeC.resolveRoute(WebSocketAudience.user(2, "chat"), nodeC)).remoteNodeIds,
      ).toEqual([]);

      await storeA.clearUserId("numeric");

      expect(
        (await storeC.resolveRoute(WebSocketAudience.user(1, "chat"), nodeC)).remoteNodeIds,
      ).toEqual([]);
      expect(
        [
          ...(await storeC.resolveRoute(WebSocketAudience.user("1", "chat"), nodeC)).remoteNodeIds,
        ].toSorted(),
      ).toEqual([nodeA, nodeB].toSorted());
    });
  });

  describe("라우팅", () => {
    it("audience별로 count가 있는 원격 노드만 돌려주고 자기 노드는 원격에 넣지 않는다", async () => {
      const prefix = uniqueName("route");
      const nodeA = uniqueName("node-a");
      const nodeB = uniqueName("node-b");
      const storeA = createAdapter({
        prefix,
        nodeId: nodeA,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;
      const storeB = createAdapter({
        prefix,
        nodeId: nodeB,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;

      await registerSession(storeA, { sessionId: "a-chat", nodeId: nodeA, namespace: "chat" });
      await registerSession(storeB, { sessionId: "b-admin", nodeId: nodeB, namespace: "admin" });
      await registerSession(storeB, {
        sessionId: "b-inactive",
        nodeId: nodeB,
        namespace: "chat",
        active: false,
      });
      await storeA.join("a-chat", "room-1");
      await storeB.join("b-admin", "room-1");
      await storeB.join("b-inactive", "room-2");
      await storeB.setUserId("b-admin", "user-9");

      const remoteOf = async (audience: WebSocketAudience, nodeId: string) =>
        [
          ...(await (nodeId === nodeA ? storeA : storeB).resolveRoute(audience, nodeId))
            .remoteNodeIds,
        ].toSorted();

      expect(await remoteOf(WebSocketAudience.room("room-1", "chat"), nodeB)).toEqual([nodeA]);
      expect(await remoteOf(WebSocketAudience.room("room-1", "chat"), nodeA)).toEqual([]);
      expect(await remoteOf(WebSocketAudience.room("room-1"), nodeA)).toEqual([nodeB]);
      expect(await remoteOf(WebSocketAudience.all("admin"), nodeA)).toEqual([nodeB]);
      expect(await remoteOf(WebSocketAudience.all("chat"), nodeA)).toEqual([]);
      expect(await remoteOf(WebSocketAudience.all(), nodeA)).toEqual([nodeB]);
      // 비활성 세션만 있는 방은 라우팅하지 않는다
      expect(await remoteOf(WebSocketAudience.room("room-2", "chat"), nodeA)).toEqual([]);
      expect(
        await remoteOf(
          WebSocketAudience.union(
            WebSocketAudience.room("room-1", "admin"),
            WebSocketAudience.user("user-9", "admin"),
          ),
          nodeA,
        ),
      ).toEqual([nodeB]);
    });

    it("라우팅은 세션 목록을 읽지 않는다", async () => {
      const prefix = uniqueName("no-session-read");
      const nodeA = uniqueName("node-a");
      const nodeB = uniqueName("node-b");
      const storeA = createAdapter({
        prefix,
        nodeId: nodeA,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;
      const storeB = createAdapter({
        prefix,
        nodeId: nodeB,
        ...QUIET_HEARTBEAT_OPTIONS,
      }).presenceStore;
      for (let index = 0; index < 20; index += 1) {
        await registerSession(storeB, { sessionId: `b-${index}`, nodeId: nodeB });
        await storeB.join(`b-${index}`, "room-1");
      }
      await registerSession(storeA, { sessionId: "a-1", nodeId: nodeA });

      const before = await readCommandStats(raw);
      expect(
        (await storeA.resolveRoute(WebSocketAudience.room("room-1", "chat"), nodeA)).remoteNodeIds,
      ).toEqual([nodeB]);
      expect(
        (await storeA.resolveRoute(WebSocketAudience.all("chat"), nodeA)).remoteNodeIds,
      ).toEqual([nodeB]);
      const after = await readCommandStats(raw);

      for (const command of SESSION_LIST_READ_COMMANDS) {
        expect(statOf(after, command).calls - statOf(before, command).calls, command).toBe(0);
      }
    });
  });

  describe("Lua 스크립트", () => {
    it("join/leave/unregister mutation은 클라이언트가 EVALSHA 하나만 보내고, 키 쓰기는 모두 스크립트 안에서 일어난다", async () => {
      const prefix = uniqueName("evalsha");
      const nodeId = uniqueName("node-a");
      // 어댑터 명령 client의 주소를 알기 위해 호출자 client를 넘긴다
      const caller = createClient({ url: redis.url });
      caller.on("error", () => {});
      await caller.connect();
      const monitor = await startMonitor(redis.url);
      try {
        const callerAddress = await clientAddressOf(caller);
        const store = createAdapter({
          prefix,
          nodeId,
          redis: caller,
          ...QUIET_HEARTBEAT_OPTIONS,
        }).presenceStore;
        await registerSession(store, { sessionId: "s1", nodeId });
        await store.join("s1", "room-0");
        // 첫 사용 시 heartbeat/스크립트 로드가 끝나도록 잠시 기다린다
        await sleep(300);

        const mutations: Array<[string, () => Promise<void>]> = [
          ["join", () => store.join("s1", "room-1")],
          ["leave", () => store.leave("s1", "room-1")],
          ["unregister", () => store.unregister("s1")],
        ];
        for (const [name, mutation] of mutations) {
          const commands = await monitor.capture(mutation);
          const sentByAdapter = commands.filter((entry) => entry.source === callerAddress);
          const insideScript = commands.filter((entry) => entry.source === "lua");
          const sentByOthers = commands.filter(
            (entry) => entry.source !== callerAddress && entry.source !== "lua",
          );

          // 클라이언트가 보낸 명령은 EVALSHA 정확히 하나다 (스크립트 내부의 HSET/HINCRBY/HDEL 등은 허용)
          expect(
            sentByAdapter.map((entry) => entry.command),
            name,
          ).toEqual(["evalsha"]);
          // 이 노드 키를 실제로 바꾼 명령이 스크립트 안에 있어야 한다
          expect(insideScript.length, name).toBeGreaterThan(0);
          // 스크립트 밖에서 다른 연결이 키를 쓰지 않는다 (MONITOR 표식 ECHO만 있다)
          expect(
            sentByOthers.map((entry) => entry.command),
            name,
          ).toEqual([]);
        }
      } finally {
        await monitor.close();
        await shutdownAdapters(adapters);
        await caller.close().catch(() => {});
      }
    });

    it("SCRIPT FLUSH 뒤 NOSCRIPT를 받으면 SCRIPT LOAD 후 한 번 재시도해 mutation을 완료한다", async () => {
      const prefix = uniqueName("noscript");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const adapter = createAdapter({ prefix, nodeId, ...QUIET_HEARTBEAT_OPTIONS });
      const store = adapter.presenceStore;
      await registerSession(store, { sessionId: "s1", nodeId });

      await raw.scriptFlush();
      const before = await readCommandStats(raw);
      await store.join("s1", "room-1");
      const after = await readCommandStats(raw);

      expect((await readSession(raw, keys.sessions, "s1"))?.rooms).toEqual(["room-1"]);
      expect(Object.values(await hashFields(raw, keys.rooms))).toEqual(["1"]);
      // NOSCRIPT로 실패한 EVALSHA 1회 + SCRIPT LOAD + 성공한 재시도 1회
      expect(statOf(after, "evalsha").failedCalls - statOf(before, "evalsha").failedCalls).toBe(1);
      expect(statOf(after, "evalsha").calls - statOf(before, "evalsha").calls).toBe(2);
      expect(
        statOf(after, "script|load").calls - statOf(before, "script|load").calls,
      ).toBeGreaterThanOrEqual(1);
      expect(statOf(after, "eval").calls - statOf(before, "eval").calls).toBe(0);
      expect(adapter.presenceStore.getStatus().rebuildPending).toBe(false);
    });
  });

  describe("heartbeat", () => {
    it("heartbeat가 노드 키 4개의 TTL과 nodes score를 계속 갱신해 keyTtlMs가 지나도 키가 남는다", async () => {
      const prefix = uniqueName("heartbeat");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const store = createAdapter({
        prefix,
        nodeId,
        heartbeatIntervalMs: 200,
        nodeTimeoutMs: 800,
        keyTtlMs: 1_500,
      }).presenceStore;

      await registerSession(store, { sessionId: "s1", nodeId });
      await store.join("s1", "room-1");
      await store.setUserId("s1", "user-1");

      const firstScore = Number(await raw.zScore(keys.nodes, nodeId));
      await eventually(async () => {
        expect(Number(await raw.zScore(keys.nodes, nodeId))).toBeGreaterThan(firstScore);
      });

      for (const key of [keys.sessions, keys.rooms, keys.users, keys.namespaces]) {
        const ttl = await raw.pTTL(key);
        expect(ttl, key).toBeGreaterThan(0);
        expect(ttl, key).toBeLessThanOrEqual(1_500);
      }

      // keyTtlMs보다 오래 기다려도 heartbeat가 TTL을 연장하므로 키가 남아 있어야 한다
      await sleep(2_500);

      for (const key of [keys.sessions, keys.rooms, keys.users, keys.namespaces]) {
        expect(await raw.exists(key), key).toBe(1);
        expect(await raw.pTTL(key), key).toBeGreaterThan(0);
      }
      expect(Number(await raw.zScore(keys.nodes, nodeId))).toBeGreaterThan(Date.now() - 1_000);
    });

    it("heartbeat가 ZREMRANGEBYSCORE로 오래된 nodes 멤버를 정리하고 최근 멤버는 남긴다", async () => {
      const prefix = uniqueName("prune");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const store = createAdapter({
        prefix,
        nodeId,
        heartbeatIntervalMs: 200,
        nodeTimeoutMs: 800,
        keyTtlMs: 1_600,
      }).presenceStore;
      await registerSession(store, { sessionId: "s1", nodeId });

      await raw.zAdd(keys.nodes, [
        { score: 1, value: "ghost-node" },
        { score: Date.now() + 600_000, value: "future-node" },
      ]);

      await eventually(async () => {
        expect(await raw.zScore(keys.nodes, "ghost-node")).toBeNull();
      });
      expect(await raw.zScore(keys.nodes, "future-node")).not.toBeNull();
      expect(await raw.zScore(keys.nodes, nodeId)).not.toBeNull();
    });

    it("heartbeat가 멈춘(crash) 노드는 nodeTimeoutMs 뒤 라우팅에서 빠지고, 키는 TTL로 만료된다", async () => {
      const prefix = uniqueName("crash");
      const nodeA = uniqueName("node-a");
      const nodeB = uniqueName("node-b");
      const keysB = nodeKeys(prefix, nodeB);
      const crashOptions = { heartbeatIntervalMs: 200, nodeTimeoutMs: 1_000, keyTtlMs: 3_000 };
      const storeA = createAdapter({ prefix, nodeId: nodeA, ...crashOptions }).presenceStore;
      // 노드 B는 호출자 소유 client를 쓴다. 이 client를 강제로 끊어 B의 crash를 흉내낸다
      const callerClientB = createClient({ url: redis.url });
      callerClientB.on("error", () => {});
      await callerClientB.connect();
      const storeB = createAdapter({
        prefix,
        nodeId: nodeB,
        redis: callerClientB,
        ...crashOptions,
      }).presenceStore;

      await registerSession(storeA, { sessionId: "a-1", nodeId: nodeA });
      await registerSession(storeB, { sessionId: "b-1", nodeId: nodeB });
      await storeB.join("b-1", "room-1");
      expect(
        (await storeA.resolveRoute(WebSocketAudience.room("room-1", "chat"), nodeA)).remoteNodeIds,
      ).toEqual([nodeB]);

      callerClientB.destroy();
      const crashedAt = Date.now();

      await eventually(
        async () => {
          expect(
            (await storeA.resolveRoute(WebSocketAudience.room("room-1", "chat"), nodeA))
              .remoteNodeIds,
          ).toEqual([]);
        },
        { timeoutMs: 5_000 },
      );
      // 라우팅 제외는 키 만료가 아니라 nodes score로 판단한다 (키는 아직 남아 있다)
      expect(Date.now() - crashedAt).toBeLessThan(3_000);
      expect(await raw.exists(keysB.sessions)).toBe(1);

      await eventually(
        async () => {
          expect(await raw.exists([keysB.sessions, keysB.rooms, keysB.namespaces])).toBe(0);
        },
        { timeoutMs: 8_000, intervalMs: 200 },
      );
      // 살아 있는 노드 A의 heartbeat가 B를 nodes에서도 정리한다
      await eventually(async () => {
        expect(await raw.zScore(keysB.nodes, nodeB)).toBeNull();
      });
    });
  });

  describe("호출자 keyPrefix 규칙", () => {
    it("호출자 client의 keyPrefix는 모든 어댑터 키 앞에 한 번만 붙고, 채널에는 어댑터 prefix만 붙는다", async () => {
      const prefix = uniqueName("caller-prefix");
      const nodeA = uniqueName("node-a");
      const nodeB = uniqueName("node-b");
      const callerA = createClient({ url: redis.url, keyPrefix: "app:" });
      const callerB = createClient({ url: redis.url, keyPrefix: "app:" });
      callerA.on("error", () => {});
      callerB.on("error", () => {});
      await callerA.connect();
      await callerB.connect();
      try {
        const adapterA = createAdapter({
          prefix,
          nodeId: nodeA,
          redis: callerA,
          ...QUIET_HEARTBEAT_OPTIONS,
        });
        const adapterB = createAdapter({
          prefix,
          nodeId: nodeB,
          redis: callerB,
          ...QUIET_HEARTBEAT_OPTIONS,
        });
        const received: string[] = [];
        const unsubscribe = await adapterA.clusterBus.subscribe((envelope) => {
          received.push(envelope.id);
        });

        await registerSession(adapterA.presenceStore, { sessionId: "s1", nodeId: nodeA });
        await adapterA.presenceStore.join("s1", "room-1");
        await adapterA.presenceStore.setUserId("s1", 1);

        const prefixedKeys = nodeKeys(`app:${prefix}`, nodeA);
        const bareKeys = nodeKeys(prefix, nodeA);
        for (const name of ["sessions", "rooms", "users", "namespaces"] as const) {
          expect(await raw.exists(prefixedKeys[name]), prefixedKeys[name]).toBe(1);
          expect(await raw.exists(bareKeys[name]), bareKeys[name]).toBe(0);
        }
        expect(await raw.zScore(prefixedKeys.nodes, nodeA)).not.toBeNull();
        expect(await raw.exists(bareKeys.nodes)).toBe(0);
        expect(await raw.keys("app:app:*")).toEqual([]);
        expect(
          (await raw.keys(`*${prefix}*`)).every((key) => key.startsWith(`app:${prefix}:`)),
        ).toBe(true);

        // 같은 keyPrefix를 쓰는 다른 노드가 prefix된 키로 라우팅할 수 있다
        expect(
          (
            await adapterB.presenceStore.resolveRoute(
              WebSocketAudience.room("room-1", "chat"),
              nodeB,
            )
          ).remoteNodeIds,
        ).toEqual([nodeA]);

        const channels = await raw.pubSubChannels(`*${prefix}*`);
        expect(channels.length).toBeGreaterThanOrEqual(1);
        for (const channel of channels) {
          expect(channel.startsWith(`${prefix}:`), channel).toBe(true);
        }
        expect(await raw.pubSubChannels("app:*")).toEqual([]);

        // duplicate()로 만든 pub/sub 연결로도 envelope이 오간다
        await adapterB.clusterBus.publish({
          kind: "publish",
          id: "prefixed-envelope",
          sourceNodeId: nodeB,
          targetNodeIds: [nodeA],
          audience: WebSocketAudience.all("chat"),
          event: "message",
          frames: { "/chat": '{"event":"message","data":{"seq":1,"text":"hi"}}' },
          emittedAt: Date.now(),
        });
        await eventually(() => {
          expect(received).toEqual(["prefixed-envelope"]);
        });
        unsubscribe();
      } finally {
        await shutdownAdapters(adapters);
        await callerA.close().catch(() => {});
        await callerB.close().catch(() => {});
      }
    });
  });

  describe("rebuild와 동시 mutation 경합, 대기 rebuild 실행", () => {
    const callers: RawRedisClient[] = [];

    // 어댑터 명령 client를 테스트가 감쌀 수 있도록 호출자 소유 client를 쓴다
    async function connectedCaller(): Promise<RawRedisClient> {
      const caller = createClient({ url: redis.url });
      caller.on("error", () => {});
      await caller.connect();
      callers.push(caller);
      return caller;
    }

    afterEach(async () => {
      vi.restoreAllMocks();
      await shutdownAdapters(adapters);
      for (const caller of callers.splice(0)) {
        await caller.close().catch(() => {});
      }
    });

    const RACE_OPTIONS = {
      heartbeatIntervalMs: 300,
      nodeTimeoutMs: 5_000,
      keyTtlMs: 10_000,
      commandDeadlineMs: 3_000,
      readyTimeoutMs: 2_000,
      drainTimeoutMs: 1_000,
    };

    it("rebuild의 NOSCRIPT 재로드 중에 성공한 unregister를 오래된 snapshot이 되살리지 않는다", async () => {
      const prefix = uniqueName("rebuild-race-unregister");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const caller = await connectedCaller();
      const adapter = createAdapter({ prefix, nodeId, redis: caller, ...RACE_OPTIONS });
      const store = adapter.presenceStore;
      await registerSession(store, { sessionId: "s1", nodeId });
      await registerSession(store, { sessionId: "s2", nodeId });
      await store.join("s1", "room-1");
      await store.join("s2", "room-1");

      await raceMutationWithRebuildReload({
        raw,
        caller,
        adapter,
        mutation: () => store.unregister("s2"),
      });

      await eventually(() => {
        expect(store.getStatus().rebuildPending).toBe(false);
      });
      // rebuild 대기가 풀렸다면 Redis는 메모리(s1만 존재)와 같아야 한다
      expect(await raw.hKeys(keys.sessions)).toEqual(["s1"]);
      expect(await raw.hGet(keys.namespaces, "chat")).toBe("1");
      expect(Object.values(await hashFields(raw, keys.rooms)).toSorted()).toEqual(["1", "1"]);
      expect(await store.getRoomMemberCount("room-1", "chat")).toBe(1);
      // 이후 heartbeat가 돌아도 그대로다
      await sleep(800);
      expect(await raw.hKeys(keys.sessions)).toEqual(["s1"]);
    });

    it("rebuild의 NOSCRIPT 재로드 중에 성공한 join을 오래된 snapshot이 지우지 않는다", async () => {
      const prefix = uniqueName("rebuild-race-join");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const caller = await connectedCaller();
      const adapter = createAdapter({ prefix, nodeId, redis: caller, ...RACE_OPTIONS });
      const store = adapter.presenceStore;
      await registerSession(store, { sessionId: "s1", nodeId });
      await store.join("s1", "room-1");

      await raceMutationWithRebuildReload({
        raw,
        caller,
        adapter,
        mutation: () => store.join("s1", "room-late"),
      });

      await eventually(() => {
        expect(store.getStatus().rebuildPending).toBe(false);
      });
      expect((await readSession(raw, keys.sessions, "s1"))?.rooms.toSorted()).toEqual([
        "room-1",
        "room-failed-write",
        "room-late",
      ]);
      expect(await store.getRoomMemberCount("room-late", "chat")).toBe(1);
      await sleep(800);
      expect(await store.getRoomMemberCount("room-late", "chat")).toBe(1);
    });

    it("heartbeatIntervalMs가 rebuild debounce보다 짧아도 대기 중인 rebuild가 1초 안에 실행된다", async () => {
      const prefix = uniqueName("rebuild-starvation");
      const nodeId = uniqueName("node-a");
      const keys = nodeKeys(prefix, nodeId);
      const caller = await connectedCaller();
      const store = createAdapter({
        prefix,
        nodeId,
        redis: caller,
        heartbeatIntervalMs: 50,
        nodeTimeoutMs: 5_000,
        keyTtlMs: 10_000,
        commandDeadlineMs: 1_000,
        readyTimeoutMs: 2_000,
        drainTimeoutMs: 500,
      }).presenceStore;
      await registerSession(store, { sessionId: "s1", nodeId });
      // rebuild만 고칠 수 있는 고스트 세션
      await raw.hSet(
        keys.sessions,
        "ghost-session",
        '{"namespace":"chat","active":true,"rooms":[]}',
      );

      vi.spyOn(caller, "evalSha").mockRejectedValueOnce(new Error("테스트용 쓰기 실패"));
      await store.join("s1", "room-1").catch(() => {});
      expect(store.getStatus().rebuildPending).toBe(true);

      // Redis는 정상이므로 50ms마다 heartbeat가 성공한다. 그래도 rebuild가 밀리지 않아야 한다
      await eventually(
        async () => {
          expect(store.getStatus().rebuildPending).toBe(false);
          expect(await raw.hKeys(keys.sessions)).toEqual(["s1"]);
        },
        { timeoutMs: 1_000, intervalMs: 20 },
      );
    });
  });

  describe("빈 문자열 namespace", () => {
    it('namespace ""는 core InMemoryWebSocketPresenceStore처럼 모든 namespace로 라우팅하고 센다', async () => {
      const prefix = uniqueName("empty-namespace");
      const nodeA = uniqueName("node-a");
      const nodeB = uniqueName("node-b");
      const nodeC = uniqueName("node-c");
      const stores = new Map([
        [nodeA, createAdapter({ prefix, nodeId: nodeA, ...QUIET_HEARTBEAT_OPTIONS }).presenceStore],
        [nodeB, createAdapter({ prefix, nodeId: nodeB, ...QUIET_HEARTBEAT_OPTIONS }).presenceStore],
        [nodeC, createAdapter({ prefix, nodeId: nodeC, ...QUIET_HEARTBEAT_OPTIONS }).presenceStore],
      ]);
      const memory = new InMemoryWebSocketPresenceStore();
      const sessions = [
        { sessionId: "a-chat", nodeId: nodeA, namespace: "chat", rooms: ["room-1"], userId: 1 },
        { sessionId: "b-admin", nodeId: nodeB, namespace: "admin", rooms: ["room-1"], userId: 1 },
        {
          sessionId: "b-chat",
          nodeId: nodeB,
          namespace: "chat",
          rooms: ["room-2"],
          userId: undefined,
        },
        { sessionId: "c-ops", nodeId: nodeC, namespace: "ops", rooms: [], userId: undefined },
      ];
      // 같은 세션 집합을 어댑터(각 노드 store)와 core in-memory store에 똑같이 등록한다
      for (const session of sessions) {
        const registration = {
          sessionId: session.sessionId,
          nodeId: session.nodeId,
          namespace: session.namespace,
          active: true,
          connectedAt: FIXED_CONNECTED_AT,
        };
        const store = stores.get(session.nodeId);
        await store?.register(registration);
        memory.register(registration);
        for (const roomId of session.rooms) {
          await store?.join(session.sessionId, roomId);
          memory.join(session.sessionId, roomId);
        }
        if (session.userId !== undefined) {
          await store?.setUserId(session.sessionId, session.userId);
          memory.setUserId(session.sessionId, session.userId);
        }
      }

      const audiences = [
        WebSocketAudience.room("room-1", ""),
        WebSocketAudience.room("room-2", ""),
        WebSocketAudience.user(1, ""),
        WebSocketAudience.all(""),
        WebSocketAudience.union(
          WebSocketAudience.room("room-2", ""),
          WebSocketAudience.user(1, "admin"),
        ),
      ];
      for (const [viewer, store] of stores) {
        for (const audience of audiences) {
          const adapterPlan = await store.resolveRoute(audience, viewer);
          const memoryPlan = memory.resolveRoute(audience, viewer);
          expect(
            {
              localSessionIds: adapterPlan.localSessionIds.toSorted(),
              remoteNodeIds: adapterPlan.remoteNodeIds.toSorted(),
            },
            `${viewer} ${JSON.stringify(audience)}`,
          ).toEqual({
            localSessionIds: memoryPlan.localSessionIds.toSorted(),
            remoteNodeIds: memoryPlan.remoteNodeIds.toSorted(),
          });
        }
      }
      for (const roomId of ["room-1", "room-2"]) {
        expect(await stores.get(nodeC)?.getRoomMemberCount(roomId, ""), roomId).toBe(
          memory.getRoomMemberCount(roomId, ""),
        );
      }
      // 기준값 확인: ""는 namespace 생략과 같다
      expect(memory.getRoomMemberCount("room-1", "")).toBe(2);
    });
  });
});
