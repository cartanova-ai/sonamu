import { describe, expect, it } from "vitest";

import { WebSocketAudience } from "../ws-audience";
import { WebSocketAudienceResolver } from "../ws-audience-resolver";
import {
  NoopWebSocketClusterBus,
  type WebSocketClusterBus,
  type WebSocketClusterEnvelope,
  type WebSocketClusterEnvelopeHandler,
} from "../ws-cluster-bus";
import { type ManagedWebSocketConnection } from "../ws-core";
import { WebSocketDeliveryEngine } from "../ws-delivery";
import { WebSocketLocalConnectionStore } from "../ws-local-connection-store";
import { InMemoryWebSocketPresenceStore } from "../ws-presence-store";

type PublishedData = Parameters<ManagedWebSocketConnection["publishUntyped"]>[1];

async function waitForAsyncQueue(rounds: number = 3): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

class ContractClusterBus implements WebSocketClusterBus {
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

  emit(envelope: WebSocketClusterEnvelope): void {
    for (const handler of this.handlers) {
      handler(envelope);
    }
  }

  shutdown(): void {
    this.handlers.clear();
  }
}

class ContractConnection implements ManagedWebSocketConnection {
  readonly sent: Array<{ event: string; data: PublishedData }> = [];
  closed = false;

  constructor(
    readonly id: string,
    readonly namespace: string,
  ) {}

  publishUntyped<Data>(event: string, data: Data): void {
    this.sent.push({ event, data });
  }

  close(): void {
    this.closed = true;
  }
}

describe("WebSocket contract tests", () => {
  describe("PresenceStore", () => {
    it("keeps inactive sessions out of counts and audience queries until activation", () => {
      const store = new InMemoryWebSocketPresenceStore();
      store.register({
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
        active: false,
      });

      expect(store.getConnectionCount("chat")).toBe(0);
      expect(store.queryAudience(WebSocketAudience.all("chat"))).toHaveLength(0);

      store.activate("s1");

      expect(store.getConnectionCount("chat")).toBe(1);
      expect(
        store.queryAudience(WebSocketAudience.all("chat")).map((meta) => meta.sessionId),
      ).toEqual(["s1"]);
    });

    it("isolates room and user bindings by namespace", () => {
      const store = new InMemoryWebSocketPresenceStore();
      store.register({
        sessionId: "chat-1",
        nodeId: "node-a",
        namespace: "chat",
      });
      store.register({
        sessionId: "admin-1",
        nodeId: "node-a",
        namespace: "admin",
      });

      store.join("chat-1", "room-1");
      store.join("admin-1", "room-1");
      store.setUserId("chat-1", "user-1");
      store.setUserId("admin-1", "user-1");

      expect(
        store.queryAudience(WebSocketAudience.room("room-1", "chat")).map((meta) => meta.sessionId),
      ).toEqual(["chat-1"]);
      expect(
        store
          .queryAudience(WebSocketAudience.user("user-1", "admin"))
          .map((meta) => meta.sessionId),
      ).toEqual(["admin-1"]);
    });

    it("cleans room and user bindings when a session is unregistered", () => {
      const store = new InMemoryWebSocketPresenceStore();
      store.register({
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
      });
      store.join("s1", "room-1");
      store.setUserId("s1", "user-1");

      expect(store.unregister("s1")?.sessionId).toBe("s1");

      expect(store.getConnection("s1")).toBeUndefined();
      expect(store.queryAudience(WebSocketAudience.room("room-1", "chat"))).toHaveLength(0);
      expect(store.queryAudience(WebSocketAudience.user("user-1", "chat"))).toHaveLength(0);
      expect(store.getStats()).toMatchObject({
        totalConnections: 0,
        totalRooms: 0,
      });
    });

    it("dedupes union audience results", () => {
      const store = new InMemoryWebSocketPresenceStore();
      store.register({
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
      });
      store.join("s1", "room-1");
      store.setUserId("s1", "user-1");

      const metas = store.queryAudience(
        WebSocketAudience.union(
          WebSocketAudience.room("room-1", "chat"),
          WebSocketAudience.user("user-1", "chat"),
        ),
      );

      expect(metas.map((meta) => meta.sessionId)).toEqual(["s1"]);
    });
  });

  describe("AudienceResolver", () => {
    it("splits local session ids from unique remote node ids", () => {
      const store = new InMemoryWebSocketPresenceStore();
      store.register({
        sessionId: "local-1",
        nodeId: "node-a",
        namespace: "chat",
      });
      store.register({
        sessionId: "remote-1",
        nodeId: "node-b",
        namespace: "chat",
      });
      store.register({
        sessionId: "remote-2",
        nodeId: "node-b",
        namespace: "chat",
      });
      store.join("local-1", "room-1");
      store.join("remote-1", "room-1");
      store.join("remote-2", "room-1");
      const resolver = new WebSocketAudienceResolver({
        nodeId: "node-a",
        presenceStore: store,
      });

      expect(resolver.resolve(WebSocketAudience.room("room-1", "chat"))).toEqual({
        localSessionIds: ["local-1"],
        remoteNodeIds: ["node-b"],
      });
    });
  });

  describe("ClusterBus", () => {
    it("allows subscribers to unsubscribe without affecting later publishes", () => {
      const bus = new ContractClusterBus();
      const received: string[] = [];
      const unsubscribe = bus.subscribe((envelope) => {
        received.push(envelope.id);
      });

      bus.emit(createEnvelope("e1"));
      unsubscribe();
      bus.emit(createEnvelope("e2"));

      expect(received).toEqual(["e1"]);
    });

    it("keeps NoopClusterBus publish, subscribe, and shutdown safe", async () => {
      const bus = new NoopWebSocketClusterBus();
      const unsubscribe = bus.subscribe(() => {
        throw new Error("noop bus must not retain handlers");
      });

      await Promise.resolve(bus.publish(createEnvelope("noop")));
      expect(unsubscribe()).toBeUndefined();
      await Promise.resolve(bus.shutdown());
    });
  });

  describe("DeliveryEngine", () => {
    it("queues local delivery and reports queued local target count", async () => {
      const presenceStore = new InMemoryWebSocketPresenceStore();
      const localConnections = new WebSocketLocalConnectionStore();
      const clusterBus = new ContractClusterBus();
      const connection = new ContractConnection("s1", "chat");
      localConnections.register(connection);
      presenceStore.register({
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
      });
      const engine = createDeliveryEngine({
        nodeId: "node-a",
        presenceStore,
        localConnections,
        clusterBus,
      });

      engine.publishToAudience(WebSocketAudience.all("chat"), "onReady", {
        ok: true,
      });

      expect(connection.sent).toHaveLength(0);

      await waitForAsyncQueue();

      expect(connection.sent).toEqual([
        {
          event: "onReady",
          data: {
            ok: true,
          },
        },
      ]);
    });

    it("publishes one remote envelope per remote-node routing plan", async () => {
      const presenceStore = new InMemoryWebSocketPresenceStore();
      const localConnections = new WebSocketLocalConnectionStore();
      const clusterBus = new ContractClusterBus();
      presenceStore.register({
        sessionId: "remote-1",
        nodeId: "node-b",
        namespace: "chat",
      });
      presenceStore.join("remote-1", "room-1");
      const engine = createDeliveryEngine({
        nodeId: "node-a",
        presenceStore,
        localConnections,
        clusterBus,
      });

      engine.publishToAudience(WebSocketAudience.room("room-1", "chat"), "evt", {
        ok: true,
      });

      await waitForAsyncQueue();

      expect(clusterBus.published).toHaveLength(1);
      expect(clusterBus.published[0]).toMatchObject({
        sourceNodeId: "node-a",
        targetNodeIds: ["node-b"],
        event: "evt",
      });
    });

    it("ignores cluster envelopes from itself or targeted to another node", async () => {
      const presenceStore = new InMemoryWebSocketPresenceStore();
      const localConnections = new WebSocketLocalConnectionStore();
      const clusterBus = new ContractClusterBus();
      const connection = new ContractConnection("s1", "chat");
      localConnections.register(connection);
      presenceStore.register({
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
      });
      createDeliveryEngine({
        nodeId: "node-a",
        presenceStore,
        localConnections,
        clusterBus,
      });

      clusterBus.emit(createEnvelope("self", "node-a", ["node-a"]));
      clusterBus.emit(createEnvelope("other-target", "node-b", ["node-c"]));

      await waitForAsyncQueue();

      expect(connection.sent).toHaveLength(0);
    });

    it("delivers accepted cluster envelopes only to local targets", async () => {
      const presenceStore = new InMemoryWebSocketPresenceStore();
      const localConnections = new WebSocketLocalConnectionStore();
      const clusterBus = new ContractClusterBus();
      const connection = new ContractConnection("s1", "chat");
      localConnections.register(connection);
      presenceStore.register({
        sessionId: "s1",
        nodeId: "node-a",
        namespace: "chat",
      });
      createDeliveryEngine({
        nodeId: "node-a",
        presenceStore,
        localConnections,
        clusterBus,
      });

      clusterBus.emit(createEnvelope("remote", "node-b", ["node-a"]));

      await waitForAsyncQueue();

      expect(connection.sent).toEqual([
        {
          event: "evt",
          data: {
            ok: true,
          },
        },
      ]);
    });
  });
});

function createDeliveryEngine(input: {
  nodeId: string;
  presenceStore: InMemoryWebSocketPresenceStore;
  localConnections: WebSocketLocalConnectionStore;
  clusterBus: WebSocketClusterBus;
}): WebSocketDeliveryEngine {
  return new WebSocketDeliveryEngine({
    nodeId: input.nodeId,
    localConnections: input.localConnections,
    audienceResolver: new WebSocketAudienceResolver({
      nodeId: input.nodeId,
      presenceStore: input.presenceStore,
    }),
    clusterBus: input.clusterBus,
  });
}

function createEnvelope(
  id: string,
  sourceNodeId = "node-b",
  targetNodeIds: string[] | undefined = ["node-a"],
): WebSocketClusterEnvelope {
  return {
    id,
    sourceNodeId,
    targetNodeIds,
    audience: WebSocketAudience.all("chat"),
    event: "evt",
    data: {
      ok: true,
    },
    emittedAt: Date.now(),
  };
}
