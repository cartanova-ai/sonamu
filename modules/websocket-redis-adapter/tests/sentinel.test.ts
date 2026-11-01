import { type RedisSentinelType } from "redis";
import { type WebSocketClusterEnvelope, WebSocketAudience } from "sonamu";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createRedisWebSocketAdapter, type RedisWebSocketAdapter } from "../src/index";
import {
  eventually,
  nodeKeys,
  type RawRedisClient,
  readCommandStats,
  settleWithin,
  sleep,
  statOf,
  timeSettle,
  uniqueName,
} from "./helpers/redis-container";
import { shutdownAdapters } from "./helpers/runtime-harness";
import { startSentinelTopology, type SentinelTopology } from "./helpers/sentinel-topology";
import { createGate, readSession, registerSession } from "./helpers/store-helpers";

// MASTER_CHANGE 외에는 rebuild 계기가 없도록 heartbeat를 아주 길게 둔다
const QUIET_OPTIONS = {
  heartbeatIntervalMs: 600_000,
  nodeTimeoutMs: 1_800_000,
  keyTtlMs: 3_600_000,
  commandDeadlineMs: 2_000,
  readyTimeoutMs: 3_000,
  drainTimeoutMs: 1_000,
};

function createEnvelope(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): WebSocketClusterEnvelope {
  return {
    kind: "publish",
    id,
    sourceNodeId,
    targetNodeIds: [targetNodeId],
    audience: WebSocketAudience.room("room-1", "chat"),
    event: "message",
    frames: { "/chat": `{"event":"message","data":{"seq":1,"text":"${id}"}}` },
    emittedAt: Date.now(),
  };
}

function successfulEvalSha(stats: Awaited<ReturnType<typeof readCommandStats>>): number {
  const stat = statOf(stats, "evalsha");
  return stat.calls - stat.failedCalls;
}

// durationMs 동안 master에 이 노드의 채널 구독이 하나도 없는지 반복해서 확인한다
async function expectNoChannelFor(
  master: RawRedisClient,
  nodeId: string,
  durationMs: number,
): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    expect(await master.pubSubChannels(`*${nodeId}*`)).toEqual([]);
    await sleep(200);
  }
}

describe("Sentinel 입력", () => {
  let topology: SentinelTopology;
  const adapters: RedisWebSocketAdapter[] = [];
  const sentinels: RedisSentinelType[] = [];
  const rawClients: RawRedisClient[] = [];

  async function connectedSentinel(): Promise<RedisSentinelType> {
    const sentinel = topology.createSentinelClient();
    sentinels.push(sentinel);
    await sentinel.connect();
    return sentinel;
  }

  function createAdapter(
    sentinel: RedisSentinelType,
    prefix: string,
    nodeId: string,
    overrides: Partial<typeof QUIET_OPTIONS> = {},
  ): RedisWebSocketAdapter {
    const adapter = createRedisWebSocketAdapter({
      redis: sentinel,
      prefix,
      nodeId,
      ...QUIET_OPTIONS,
      ...overrides,
    });
    adapters.push(adapter);
    return adapter;
  }

  async function masterClient(): Promise<RawRedisClient> {
    const client = await topology.connectToCurrentMaster();
    rawClients.push(client);
    return client;
  }

  beforeAll(async () => {
    topology = await startSentinelTopology();
  });

  afterEach(async () => {
    await shutdownAdapters(adapters);
    for (const sentinel of sentinels.splice(0)) {
      if (sentinel.isOpen) {
        await sentinel.close().catch(() => {});
      }
    }
    for (const client of rawClients.splice(0)) {
      await client.close().catch(() => {});
    }
  });

  afterAll(async () => {
    await topology?.stop();
  });

  it("duplicate()를 만들지 않고 인스턴스 subscribe로 envelope을 주고받으며, shutdown 뒤에도 호출자 Sentinel은 열려 있다", async () => {
    const prefix = uniqueName("sentinel-owner");
    const nodeA = uniqueName("node-a");
    const nodeB = uniqueName("node-b");
    const sentinelA = await connectedSentinel();
    const sentinelB = await connectedSentinel();
    const duplicateA = vi.spyOn(sentinelA, "duplicate");
    const duplicateB = vi.spyOn(sentinelB, "duplicate");
    const adapterA = createAdapter(sentinelA, prefix, nodeA);
    const adapterB = createAdapter(sentinelB, prefix, nodeB);
    const received: string[] = [];
    await adapterB.clusterBus.subscribe((envelope) => {
      received.push(envelope.id);
    });
    await registerSession(adapterA.presenceStore, { sessionId: "a-1", nodeId: nodeA });

    await adapterA.clusterBus.publish(createEnvelope("hello-b", nodeA, nodeB));

    await eventually(() => {
      expect(received).toEqual(["hello-b"]);
    });
    const master = await masterClient();
    expect(await master.exists(nodeKeys(prefix, nodeA).sessions)).toBe(1);
    expect(duplicateA).not.toHaveBeenCalled();
    expect(duplicateB).not.toHaveBeenCalled();

    await shutdownAdapters(adapters);

    expect(sentinelA.isOpen).toBe(true);
    expect(sentinelB.isOpen).toBe(true);
    expect(await sentinelA.ping()).toBe("PONG");
    vi.restoreAllMocks();
  });

  it("연결되지 않은 호출자 Sentinel은 어댑터가 연결하지 않는다", async () => {
    const sentinel = topology.createSentinelClient();
    sentinels.push(sentinel);
    const nodeId = uniqueName("node");
    const adapter = createAdapter(sentinel, uniqueName("sentinel-unconnected"), nodeId, {
      readyTimeoutMs: 500,
      commandDeadlineMs: 500,
    });

    const registered = await timeSettle(
      registerSession(adapter.presenceStore, { sessionId: "s1", nodeId }),
    );

    expect(registered.elapsedMs).toBeLessThan(500 + 500 + 1_500);
    expect(sentinel.isOpen).toBe(false);
    expect(adapter.presenceStore.getStatus()).toEqual({ ready: false, rebuildPending: true });
  });

  describe("bus shutdown 뒤 호출자 Sentinel 구독 정리", () => {
    it("준비 대기 중인 subscribe가 있을 때 shutdown하면, 이후 Sentinel이 ready가 돼도 어댑터 채널을 구독하지 않는다", async () => {
      const prefix = uniqueName("sentinel-bus-ready-wait");
      const nodeId = uniqueName("node");
      const publisherNodeId = uniqueName("publisher");
      // 아직 연결하지 않은 호출자 Sentinel: subscribe는 readiness를 기다린다
      const sentinel = topology.createSentinelClient();
      sentinels.push(sentinel);
      const adapter = createAdapter(sentinel, prefix, nodeId, {
        readyTimeoutMs: 5_000,
        commandDeadlineMs: 1_000,
      });
      const publisher = createAdapter(await connectedSentinel(), prefix, publisherNodeId);
      const master = await masterClient();
      const received: string[] = [];

      const subscribing = adapter.clusterBus.subscribe((envelope) => {
        received.push(envelope.id);
      });
      const subscribeResult = timeSettle(subscribing);
      await sleep(100);
      await adapter.clusterBus.shutdown();

      // shutdown이 끝난 뒤 호출자가 Sentinel을 연결해 ready가 된다
      await sentinel.connect();
      await subscribeResult;
      // 늦은 완료와 그 뒤 정리가 끝날 시간을 준 뒤 계속 비어 있는지 본다
      await sleep(1_500);
      await expectNoChannelFor(master, nodeId, 2_000);

      await publisher.clusterBus.publish(createEnvelope("after-shutdown", publisherNodeId, nodeId));
      await sleep(300);
      expect(received).toEqual([]);
    });

    it("subscribe deadline이 지난 뒤 node-redis subscribe가 늦게 끝나도, shutdown 뒤에는 어댑터 채널 구독이 남지 않는다", async () => {
      const prefix = uniqueName("sentinel-bus-late-subscribe");
      const nodeId = uniqueName("node");
      const controlNodeId = uniqueName("control");
      const sentinel = await connectedSentinel();
      const master = await masterClient();

      // 대조군: 정상 구독은 master의 PUBSUB CHANNELS에 보인다
      const control = createAdapter(await connectedSentinel(), prefix, controlNodeId);
      await control.clusterBus.subscribe(() => {});
      await eventually(async () => {
        expect(await master.pubSubChannels(`*${controlNodeId}*`)).toHaveLength(1);
      });

      /**
       * 호출자 Sentinel 인스턴스의 subscribe만 감싸 실제 SUBSCRIBE 전송을 gate까지 늦춘다.
       * 실제 클래스와 연결은 그대로이므로, gate를 열면 node-redis가 진짜로 채널을 구독한다.
       */
      const gate = createGate();
      const originalSubscribe = sentinel.subscribe.bind(sentinel);
      vi.spyOn(sentinel, "subscribe").mockImplementationOnce(async (channels, listener) => {
        gate.markReached();
        await gate.released;
        return originalSubscribe(channels, listener);
      });
      const adapter = createAdapter(sentinel, prefix, nodeId, { commandDeadlineMs: 300 });
      const received: string[] = [];

      const subscribed = await timeSettle(
        adapter.clusterBus.subscribe((envelope) => {
          received.push(envelope.id);
        }),
      );
      // commandDeadlineMs(300ms) 안에 끝나지 않아 subscribe는 reject된다
      expect(subscribed.status).toBe("rejected");
      expect(await settleWithin(gate.reached, 1_000)).toBe("fulfilled");

      await adapter.clusterBus.shutdown();
      // shutdown이 끝난 뒤 node-redis subscribe가 늦게 완료된다
      gate.release();
      await sleep(1_500);
      await expectNoChannelFor(master, nodeId, 2_000);

      await control.clusterBus.publish(createEnvelope("after-shutdown", controlNodeId, nodeId));
      await sleep(300);
      expect(received).toEqual([]);
      vi.restoreAllMocks();
    });
  });

  /**
   * 합성 MASTER_CHANGE 이벤트로 rebuild 계기를 검증하는 노드를 띄운다.
   * - 이벤트 주소는 실제 node-redis 이벤트와 같은 Sentinel 발표(컨테이너 내부) 주소를 쓴다.
   * - nodeAddressMap을 쓰면 node-redis는 scan마다 현재 master로 실제 MASTER_CHANGE를 다시 보내므로,
   *   합성 이벤트와 경합하지 않도록 이 Sentinel client는 scanInterval을 0으로 꺼 둔다.
   * - 어댑터는 연결 시점의 첫 이벤트를 보지 못하므로, 현재 master(A) 이벤트를 한 번 보내 마지막 master를 A로 맞춘다.
   */
  async function startSyntheticEventNode(prefixLabel: string) {
    const prefix = uniqueName(prefixLabel);
    const nodeId = uniqueName("node");
    const keys = nodeKeys(prefix, nodeId);
    const sentinel = topology.createSentinelClient({ scanInterval: 0 });
    sentinels.push(sentinel);
    await sentinel.connect();
    const adapter = createAdapter(sentinel, prefix, nodeId);
    await registerSession(adapter.presenceStore, { sessionId: "s1", nodeId });
    await adapter.presenceStore.join("s1", "room-1");
    const master = await masterClient();
    const { current: masterA, other: masterB } = await topology.announcedAddresses();

    const emitMasterChange = (node: { host: string; port: number }) => {
      sentinel.emit("topology-change", { type: "MASTER_CHANGE", node });
    };
    // rebuild만 지울 수 있는 고스트 세션을 넣는다
    const corrupt = () =>
      master.hSet(keys.sessions, "ghost-session", '{"namespace":"chat","active":true,"rooms":[]}');
    const expectRebuilt = async (label: string) => {
      await eventually(
        async () => {
          expect(await master.hKeys(keys.sessions), label).toEqual(["s1"]);
        },
        { timeoutMs: 3_000, intervalMs: 50 },
      );
      expect((await readSession(master, keys.sessions, "s1"))?.rooms, label).toEqual(["room-1"]);
    };
    // debounce(200ms)와 rebuild 왕복보다 충분히 기다린 뒤에도 고스트가 남아 있으면 rebuild가 없었던 것이다
    const expectNotRebuilt = async (label: string) => {
      await sleep(1_500);
      expect((await master.hKeys(keys.sessions)).toSorted(), label).toEqual([
        "ghost-session",
        "s1",
      ]);
    };
    const successfulRebuildsSince = async (before: Awaited<ReturnType<typeof readCommandStats>>) =>
      successfulEvalSha(await readCommandStats(master)) - successfulEvalSha(before);

    // 마지막으로 관찰한 master를 A로 맞춘다 (처음 관찰이므로 rebuild가 한 번 일어날 수 있다)
    emitMasterChange(masterA);
    await sleep(800);
    expect(adapter.presenceStore.getStatus().rebuildPending).toBe(false);

    return {
      adapter,
      master,
      masterA,
      masterB,
      emitMasterChange,
      corrupt,
      expectRebuilt,
      expectNotRebuilt,
      successfulRebuildsSince,
    };
  }

  it("현재 master에 대한 반복 MASTER_CHANGE는 rebuild하지 않고, debounce 안의 연속 변경은 rebuild 한 번으로 모은다", async () => {
    const node = await startSyntheticEventNode("sentinel-debounce");

    // 현재 master(A)를 다시 알리는 이벤트는 몇 번이 와도 rebuild 0회
    await node.corrupt();
    const beforeRepeats = await readCommandStats(node.master);
    for (let index = 0; index < 5; index += 1) {
      node.emitMasterChange(node.masterA);
    }
    await node.expectNotRebuilt("현재 master 반복");
    expect(await node.successfulRebuildsSince(beforeRepeats)).toBe(0);

    // 200ms debounce 안에 B, A, B, A, B로 실제 변경이 연달아 오면 rebuild는 정확히 한 번
    const beforeBurst = await readCommandStats(node.master);
    for (const target of [node.masterB, node.masterA, node.masterB, node.masterA, node.masterB]) {
      node.emitMasterChange(target);
    }
    await node.expectRebuilt("연속 변경");
    // debounce 창이 끝난 뒤에도 추가 rebuild가 없어야 한다
    await sleep(1_500);
    expect(await node.successfulRebuildsSince(beforeBurst)).toBe(1);
    expect(node.adapter.presenceStore.getStatus().rebuildPending).toBe(false);

    // 연속 변경의 마지막 master(B)를 반복해도 rebuild하지 않는다
    await node.corrupt();
    node.emitMasterChange(node.masterB);
    await node.expectNotRebuilt("연속 변경 뒤 B 반복");
  });

  it("10초 안의 A→B→A→B master 변경은 debounce보다 간격이 길면 매번 rebuild하고, 현재 master 반복은 rebuild하지 않는다", async () => {
    const node = await startSyntheticEventNode("sentinel-flapping");

    const steps: Array<[string, { host: string; port: number }]> = [
      ["A → B", node.masterB],
      ["B → A", node.masterA],
      ["A → B (10초 안의 두 번째 변경)", node.masterB],
    ];
    for (const [label, target] of steps) {
      await node.corrupt();
      const before = await readCommandStats(node.master);
      node.emitMasterChange(target);
      await node.expectRebuilt(label);
      await sleep(300);
      expect(await node.successfulRebuildsSince(before), label).toBe(1);
    }

    // 현재 master(B)에 대한 반복 이벤트는 rebuild를 일으키지 않는다
    await node.corrupt();
    for (let index = 0; index < 3; index += 1) {
      node.emitMasterChange(node.masterB);
    }
    await node.expectNotRebuilt("B 반복");

    // 그 뒤 다시 A로 바뀌면 rebuild한다
    node.emitMasterChange(node.masterA);
    await node.expectRebuilt("B → A (10초 안의 두 번째 되돌림)");
  });

  it("failover 뒤에도 구독이 유지되고, 새 master의 NOSCRIPT를 SCRIPT LOAD로 넘겨 mutation과 rebuild가 반영된다", async () => {
    const prefix = uniqueName("sentinel-failover");
    const nodeA = uniqueName("node-a");
    const nodeB = uniqueName("node-b");
    const keysA = nodeKeys(prefix, nodeA);
    const sentinelA = await connectedSentinel();
    const sentinelB = await connectedSentinel();
    const adapterA = createAdapter(sentinelA, prefix, nodeA, {
      heartbeatIntervalMs: 1_000,
      nodeTimeoutMs: 30_000,
      keyTtlMs: 60_000,
    });
    const adapterB = createAdapter(sentinelB, prefix, nodeB, {
      heartbeatIntervalMs: 1_000,
      nodeTimeoutMs: 30_000,
      keyTtlMs: 60_000,
    });
    const received: string[] = [];
    await adapterB.clusterBus.subscribe((envelope) => {
      received.push(envelope.id);
    });
    await registerSession(adapterA.presenceStore, { sessionId: "a-1", nodeId: nodeA });
    await registerSession(adapterB.presenceStore, { sessionId: "b-1", nodeId: nodeB });
    await adapterA.presenceStore.join("a-1", "room-1");
    await adapterB.presenceStore.join("b-1", "room-1");

    // failover 뒤 rebuild만 지울 수 있는 고스트 세션을 넣고 replica까지 복제되기를 기다린다
    const oldMaster = await masterClient();
    await oldMaster.hSet(
      keysA.sessions,
      "ghost-session",
      '{"namespace":"chat","active":true,"rooms":["room-1"]}',
    );
    expect(Number(await oldMaster.sendCommand(["WAIT", "1", "5000"]))).toBe(1);

    const { next } = await topology.failover();
    const newMaster = await masterClient();
    const newMasterAddress = await topology.currentMaster();
    expect(newMasterAddress).toEqual(next);

    // failover 전 구독이 새 master의 publish도 받는다
    await eventually(
      async () => {
        await adapterA.clusterBus.publish(
          createEnvelope(`after-failover-${received.length}`, nodeA, nodeB),
        );
        expect(received.some((id) => id.startsWith("after-failover"))).toBe(true);
      },
      { timeoutMs: 30_000, intervalMs: 500 },
    );

    // 새 master에는 스크립트 캐시가 없으므로 NOSCRIPT → SCRIPT LOAD → 재시도가 일어난다
    await eventually(
      async () => {
        await adapterA.presenceStore.join("a-1", "room-after-failover");
        expect((await readSession(newMaster, keysA.sessions, "a-1"))?.rooms.toSorted()).toEqual([
          "room-1",
          "room-after-failover",
        ]);
      },
      { timeoutMs: 30_000, intervalMs: 500 },
    );
    const stats = await readCommandStats(newMaster);
    expect(statOf(stats, "evalsha").failedCalls).toBeGreaterThanOrEqual(1);
    expect(statOf(stats, "script|load").calls).toBeGreaterThanOrEqual(1);
    expect(statOf(stats, "eval").calls).toBe(0);

    // 실제 failover의 MASTER_CHANGE가 rebuild를 일으켜 새 master의 노드 키가 메모리와 같아진다
    await eventually(
      async () => {
        expect(await newMaster.hKeys(keysA.sessions)).toEqual(["a-1"]);
      },
      { timeoutMs: 30_000, intervalMs: 200 },
    );

    await eventually(
      () => {
        expect(adapterA.presenceStore.getStatus()).toEqual({ ready: true, rebuildPending: false });
        expect(adapterB.presenceStore.getStatus()).toEqual({ ready: true, rebuildPending: false });
      },
      { timeoutMs: 30_000, intervalMs: 200 },
    );
    expect(
      (await adapterA.presenceStore.resolveRoute(WebSocketAudience.room("room-1", "chat"), nodeA))
        .remoteNodeIds,
    ).toEqual([nodeB]);
  });
});
