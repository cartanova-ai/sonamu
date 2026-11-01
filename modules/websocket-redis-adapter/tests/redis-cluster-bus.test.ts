import { type WebSocketClusterEnvelope, WebSocketAudience } from "sonamu";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createRedisWebSocketAdapter, type RedisWebSocketAdapter } from "../src/index";
import {
  createRawClient,
  eventually,
  type RawRedisClient,
  sleep,
  type StartedRedis,
  startRedis,
  uniqueName,
} from "./helpers/redis-container";
import { FAST_ADAPTER_OPTIONS, shutdownAdapters } from "./helpers/runtime-harness";

function createEnvelope(input: {
  id: string;
  sourceNodeId: string;
  targetNodeIds: string[];
  frames?: Record<string, string>;
}): WebSocketClusterEnvelope {
  return {
    kind: "publish",
    id: input.id,
    sourceNodeId: input.sourceNodeId,
    targetNodeIds: input.targetNodeIds,
    audience: WebSocketAudience.union(
      WebSocketAudience.room("room-1", "chat"),
      WebSocketAudience.user(42, "chat"),
    ),
    event: "message",
    frames: input.frames ?? { "/chat": '{"event":"message","data":{"seq":1,"text":"hi"}}' },
    emittedAt: 1_767_225_600_000,
  };
}

async function subscribeCollect(adapter: RedisWebSocketAdapter) {
  const received: WebSocketClusterEnvelope[] = [];
  const subscription = adapter.clusterBus.subscribe((envelope) => {
    received.push(envelope);
  });
  // 구독 완료를 promise로 알린다
  expect(subscription).toBeInstanceOf(Promise);
  const unsubscribe = await subscription;
  expect(unsubscribe).toBeInstanceOf(Function);
  return { received, unsubscribe };
}

describe("RedisWebSocketClusterBus", () => {
  let redis: StartedRedis;
  let raw: RawRedisClient;
  const adapters: RedisWebSocketAdapter[] = [];

  function createAdapter(prefix: string, nodeId: string): RedisWebSocketAdapter {
    const adapter = createRedisWebSocketAdapter({
      redis: { url: redis.url },
      prefix,
      nodeId,
      ...FAST_ADAPTER_OPTIONS,
    });
    adapters.push(adapter);
    return adapter;
  }

  beforeAll(async () => {
    redis = await startRedis();
    raw = await createRawClient(redis.url);
  });

  afterEach(async () => {
    await shutdownAdapters(adapters);
  });

  afterAll(async () => {
    await raw?.close().catch(() => {});
    await redis?.stop();
  });

  it("잘못된 JSON과 알 수 없는 kind는 거절 콜백에만 전달한다", async () => {
    const prefix = uniqueName("bus-rejected");
    const nodeId = uniqueName("node");
    const adapter = createAdapter(prefix, nodeId);
    const received: WebSocketClusterEnvelope[] = [];
    const rejected: string[] = [];
    await adapter.clusterBus.subscribe(
      (envelope) => {
        received.push(envelope);
      },
      {
        onRejected: ({ reason }) => {
          rejected.push(reason);
        },
      },
    );
    await raw.publish(`${prefix}:node:${nodeId}`, "{");
    await raw.publish(
      `${prefix}:node:${nodeId}`,
      JSON.stringify({
        ...createEnvelope({ id: "unknown", sourceNodeId: "other", targetNodeIds: [nodeId] }),
        kind: "unknown",
      }),
    );
    await eventually(() => {
      expect(rejected).toEqual(["invalidEnvelope", "invalidEnvelope"]);
    });
    expect(received).toEqual([]);
  });

  it("store와 bus는 어댑터 nodeId를 노출한다 (runtime의 nodeId 불일치 검사용)", () => {
    const prefix = uniqueName("bus-node-id");
    const nodeId = uniqueName("node-a");
    const adapter = createAdapter(prefix, nodeId);

    expect(adapter.nodeId).toBe(nodeId);
    expect(adapter.presenceStore.nodeId).toBe(nodeId);
    expect(adapter.clusterBus.nodeId).toBe(nodeId);
  });

  it("노드마다 어댑터 prefix로 시작하는 채널 하나를 구독한다", async () => {
    const prefix = uniqueName("bus-channel");
    const nodeIds = [uniqueName("node-a"), uniqueName("node-b"), uniqueName("node-c")];
    for (const nodeId of nodeIds) {
      await subscribeCollect(createAdapter(prefix, nodeId));
    }

    const channels = await raw.pubSubChannels(`${prefix}:*`);

    expect(channels).toHaveLength(3);
    for (const nodeId of nodeIds) {
      const owned = channels.filter((channel) => channel.includes(nodeId));
      expect(owned, nodeId).toHaveLength(1);
      expect(owned[0].startsWith(`${prefix}:`)).toBe(true);
    }
    const counts = await raw.pubSubNumSub(channels);
    expect(Object.values(counts)).toEqual([1, 1, 1]);
  });

  it("targetNodeIds에 있는 노드만 envelope을 받고, frame 문자열은 바이트 그대로 전달된다", async () => {
    const prefix = uniqueName("bus-target");
    const nodeA = uniqueName("node-a");
    const nodeB = uniqueName("node-b");
    const nodeC = uniqueName("node-c");
    const adapterA = createAdapter(prefix, nodeA);
    const busA = adapterA.clusterBus;
    const a = await subscribeCollect(adapterA);
    const b = await subscribeCollect(createAdapter(prefix, nodeB));
    const c = await subscribeCollect(createAdapter(prefix, nodeC));
    const trickyFrame =
      '{"data":{"text":"따옴표 \\" 와 유니코드 ✓","at":"2026-01-01T00:00:00.000Z"},  "event":"message"}';
    const envelope = createEnvelope({
      id: "only-b",
      sourceNodeId: nodeA,
      targetNodeIds: [nodeB],
      frames: { "/chat": trickyFrame, "/chat-alt": '{"event":"message","data":{"seq":1}}' },
    });

    await busA.publish(envelope);

    await eventually(() => {
      expect(b.received).toHaveLength(1);
    });
    expect(b.received[0]).toEqual(envelope);
    expect(b.received[0].kind === "publish" && b.received[0].frames["/chat"]).toBe(trickyFrame);
    // 다른 노드에 늦게 도착하지 않는지 잠시 확인한다
    await sleep(300);
    expect(a.received).toEqual([]);
    expect(c.received).toEqual([]);

    await busA.publish(
      createEnvelope({ id: "b-and-c", sourceNodeId: nodeA, targetNodeIds: [nodeB, nodeC] }),
    );

    await eventually(() => {
      expect(b.received.map((item) => item.id)).toEqual(["only-b", "b-and-c"]);
      expect(c.received.map((item) => item.id)).toEqual(["b-and-c"]);
    });
    await sleep(300);
    expect(b.received).toHaveLength(2);
    expect(c.received).toHaveLength(1);
    expect(a.received).toEqual([]);
  });

  it("한 노드에서 연속으로 보낸 envelope은 보낸 순서대로 도착한다", async () => {
    const prefix = uniqueName("bus-order");
    const nodeA = uniqueName("node-a");
    const nodeB = uniqueName("node-b");
    const busA = createAdapter(prefix, nodeA).clusterBus;
    const b = await subscribeCollect(createAdapter(prefix, nodeB));

    const publishing: Array<void | Promise<void>> = [];
    for (let index = 0; index < 30; index += 1) {
      publishing.push(
        busA.publish(
          createEnvelope({ id: `e-${index}`, sourceNodeId: nodeA, targetNodeIds: [nodeB] }),
        ),
      );
    }
    await Promise.all(publishing);

    await eventually(() => {
      expect(b.received).toHaveLength(30);
    });
    expect(b.received.map((item) => item.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => `e-${index}`),
    );
  });

  it("unsubscribe 뒤에는 envelope을 받지 않고 채널 구독도 해제된다", async () => {
    const prefix = uniqueName("bus-unsubscribe");
    const nodeA = uniqueName("node-a");
    const nodeB = uniqueName("node-b");
    const busA = createAdapter(prefix, nodeA).clusterBus;
    const b = await subscribeCollect(createAdapter(prefix, nodeB));

    b.unsubscribe();

    await eventually(async () => {
      expect(await raw.pubSubChannels(`*${nodeB}*`)).toEqual([]);
    });
    await busA.publish(
      createEnvelope({ id: "after-unsubscribe", sourceNodeId: nodeA, targetNodeIds: [nodeB] }),
    );
    await sleep(300);
    expect(b.received).toEqual([]);
  });

  it("shutdown은 구독을 해제하고, 수신자가 없는 노드로 publish해도 reject하지 않는다", async () => {
    const prefix = uniqueName("bus-shutdown");
    const nodeA = uniqueName("node-a");
    const nodeB = uniqueName("node-b");
    const adapterA = createAdapter(prefix, nodeA);
    const adapterB = createAdapter(prefix, nodeB);
    const b = await subscribeCollect(adapterB);

    await adapterB.clusterBus.shutdown();

    await eventually(async () => {
      expect(await raw.pubSubChannels(`*${nodeB}*`)).toEqual([]);
    });
    await expect(
      Promise.resolve(
        adapterA.clusterBus.publish(
          createEnvelope({ id: "nobody", sourceNodeId: nodeA, targetNodeIds: [nodeB] }),
        ),
      ),
    ).resolves.toBeUndefined();
    await sleep(300);
    expect(b.received).toEqual([]);
  });
});
