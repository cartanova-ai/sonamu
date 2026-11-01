import {
  type WebSocketAudience,
  type WebSocketClusterBus,
  type WebSocketClusterEnvelope,
  type WebSocketClusterEnvelopeHandler,
  type WebSocketClusterSubscribeOptions,
} from "sonamu";
import { z } from "zod";

import {
  type RedisPubSubListener,
  type RedisSubscriberTarget,
  type RedisWebSocketConnection,
} from "./connection";
import { withDeadline } from "./deadline";

/**
 * 노드별 pub/sub 채널. 채널에는 client keyPrefix가 붙지 않으므로 어댑터 prefix만으로 앱을 구분한다.
 */
export function nodeChannelOf(prefix: string, nodeId: string): string {
  return `${prefix}:node:${nodeId}`;
}

// 수신한 envelope은 다른 노드가 보낸 외부 입력이므로 형식을 검증한 뒤에만 핸들러에 넘긴다
const AudienceSchema: z.ZodType<WebSocketAudience> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("all"), namespace: z.string().optional() }),
    z.object({ type: z.literal("room"), roomId: z.string(), namespace: z.string().optional() }),
    z.object({
      type: z.literal("user"),
      userId: z.union([z.number(), z.string()]),
      namespace: z.string().optional(),
    }),
    z.object({
      type: z.literal("connections"),
      connectionIds: z.array(z.string()),
      namespace: z.string().optional(),
    }),
    z.object({ type: z.literal("union"), audiences: z.array(AudienceSchema) }),
  ]),
);

const CommonEnvelopeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  targetNodeIds: z.array(z.string()),
  emittedAt: z.number(),
});

const ClusterEnvelopeSchema = z.union([
  CommonEnvelopeSchema.extend({
    kind: z.literal("publish").default("publish"),
    audience: AudienceSchema,
    event: z.string(),
    frames: z.record(z.string(), z.string()),
  }),
  CommonEnvelopeSchema.extend({
    kind: z.literal("leaveUser"),
    userId: z.union([z.number(), z.string()]),
    roomId: z.string(),
    namespace: z.string().optional(),
  }),
]);

const ClusterMessageSchema = z
  .string()
  .transform((message, context) => {
    try {
      return /* SAFETY: 결과는 바로 아래 pipe의 ClusterEnvelopeSchema로 검증한다. */ JSON.parse(
        message,
      ) as z.input<typeof ClusterEnvelopeSchema>;
    } catch {
      context.addIssue({ code: "custom", message: "envelope JSON을 파싱할 수 없습니다." });
      return z.NEVER;
    }
  })
  .pipe(ClusterEnvelopeSchema);

/**
 * 채널로 받은 envelope JSON을 검증한다. 형식이 맞지 않으면 undefined를 돌려 버린다.
 */
export function parseClusterEnvelope(message: string): WebSocketClusterEnvelope | undefined {
  const parsed = ClusterMessageSchema.safeParse(message);
  return parsed.success ? parsed.data : undefined;
}

function ignoreError(): void {}

/**
 * node-redis pub/sub 기반 cluster bus. 노드마다 채널 하나를 구독하고, envelope을 대상 노드 채널에만 publish한다.
 * 한 노드의 publish는 같은 명령 연결로 순서대로 나가므로 수신 노드에도 보낸 순서대로 도착한다.
 */
export class RedisWebSocketClusterBus implements WebSocketClusterBus {
  readonly nodeId: string;
  private readonly connection: RedisWebSocketConnection;
  private readonly channel: string;
  private readonly handlers = new Map<
    WebSocketClusterEnvelopeHandler,
    WebSocketClusterSubscribeOptions
  >();
  private subscribed = false;
  private subscribing: Promise<void> | undefined;
  // node-redis에 보냈지만 아직 끝나지 않은 SUBSCRIBE 수. 어댑터 deadline이 지나도 node-redis 쪽 구독은 늦게 끝날 수 있다
  private pendingSubscribes = 0;
  private closed = false;
  private shutdownPromise: Promise<void> | undefined;

  private readonly listener: RedisPubSubListener = (message) => {
    const envelope = parseClusterEnvelope(message.toString());
    if (!envelope) {
      for (const options of this.handlers.values()) {
        Promise.resolve()
          .then(() => options.onRejected?.({ reason: "invalidEnvelope" }))
          .catch(ignoreError);
      }
      return;
    }
    for (const handler of this.handlers.keys()) {
      // 핸들러 실패가 다른 핸들러나 구독 연결로 번지지 않게 한다
      Promise.resolve()
        .then(() => handler(envelope))
        .catch(ignoreError);
    }
  };

  /** @internal createRedisWebSocketAdapter가 생성한다. */
  constructor(connection: RedisWebSocketConnection) {
    this.connection = connection;
    this.nodeId = connection.options.nodeId;
    this.channel = nodeChannelOf(connection.options.prefix, this.nodeId);
    // Sentinel 입력에서 연결 전에 구독이 실패했으면 ready 때 다시 시도한다
    connection.onConnectionReady(() => {
      this.retrySubscription();
    });
  }

  async publish(envelope: WebSocketClusterEnvelope): Promise<void> {
    if (this.closed) {
      return;
    }
    const message = JSON.stringify(envelope);
    const prefix = this.connection.options.prefix;
    const targets = [...new Set(envelope.targetNodeIds)];
    if (targets.length === 0) {
      return;
    }
    const wait = this.connection.whenUsable();
    if (wait) {
      await wait;
      // ready를 기다리는 사이 shutdown됐으면 보내지 않는다
      if (this.closed) {
        return;
      }
    }
    await this.connection.run((commands) =>
      Promise.all(
        targets.map((target) => commands.publish(nodeChannelOf(prefix, target), message)),
      ),
    );
  }

  /**
   * 자기 노드 채널을 구독한다. 구독이 끝나면 resolve하고, readyTimeoutMs와 commandDeadlineMs 안에 끝나지 않으면 reject한다.
   * reject돼도 핸들러는 남아 있어 연결이 ready가 되면 구독이 이어진다(shutdown이나 해제 함수로 정리한다).
   */
  async subscribe(
    handler: WebSocketClusterEnvelopeHandler,
    options: WebSocketClusterSubscribeOptions = {},
  ): Promise<() => void> {
    if (this.closed) {
      throw new Error("Redis WebSocket cluster bus is shut down.");
    }
    this.handlers.set(handler, options);
    const unsubscribe = () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) {
        this.dropSubscription();
      }
    };
    await this.ensureSubscribed();
    return unsubscribe;
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.close();
    return this.shutdownPromise;
  }

  private async close(): Promise<void> {
    this.closed = true;
    this.handlers.clear();
    await Promise.all([this.releaseSubscription(), this.connection.release("bus")]);
  }

  private async releaseSubscription(): Promise<void> {
    if (this.connection.kind === "sentinel") {
      // 호출자 Sentinel은 닫지 않으므로 구독만 해제한다. 아직 끝나지 않은 SUBSCRIBE는 완료 시점에 따로 해제한다
      const wasSubscribed = this.subscribed || this.pendingSubscribes > 0;
      this.subscribed = false;
      this.subscribing = undefined;
      if (wasSubscribed) {
        await this.unsubscribeFrom(this.connection.subscriber(ignoreError)).catch(ignoreError);
      }
      return;
    }
    // 어댑터 소유 duplicate()를 닫으면 구독도 함께 사라진다
    this.subscribed = false;
    this.subscribing = undefined;
    await this.connection.closeSubscriber();
  }

  private ensureSubscribed(): Promise<void> {
    if (this.subscribed) {
      return Promise.resolve();
    }
    if (!this.subscribing) {
      const subscribing = this.subscribeChannel().then(
        () => {
          if (this.subscribing === subscribing) {
            this.subscribed = true;
          }
        },
        (cause: unknown) => {
          if (this.subscribing === subscribing) {
            this.subscribing = undefined;
          }
          throw cause;
        },
      );
      subscribing.catch(ignoreError);
      this.subscribing = subscribing;
    }
    return this.subscribing;
  }

  private async subscribeChannel(): Promise<void> {
    // node-redis는 연결 전 SUBSCRIBE를 큐에 두고 연결 뒤 보내므로, 대기 상한만 어댑터가 정한다
    const { readyTimeoutMs, commandDeadlineMs } = this.connection.options;
    const wait = this.connection.kind === "sentinel" ? this.connection.whenUsable() : undefined;
    if (wait) {
      await wait;
    }
    // ready를 기다리는 사이 shutdown됐으면 호출자 연결에 구독을 남기지 않는다
    if (this.closed) {
      throw new Error("Redis WebSocket cluster bus is shut down.");
    }
    const subscriber = this.connection.subscriber(() => {
      this.retrySubscription();
    });
    const sending = subscriber.subscribe(this.channel, this.listener);
    this.watchLateSubscribe(subscriber, sending);
    await withDeadline(
      () => sending,
      wait ? commandDeadlineMs : readyTimeoutMs + commandDeadlineMs,
    );
  }

  /**
   * deadline과 무관하게 node-redis SUBSCRIBE가 실제로 끝나는 시점을 본다.
   * 그때 bus가 닫혔거나 더 이상 구독할 핸들러가 없으면 같은 연결에서 바로 구독을 해제하고,
   * 아직 구독이 필요하면 늦게 끝난 구독을 그대로 쓴다.
   */
  private watchLateSubscribe(subscriber: RedisSubscriberTarget, sending: Promise<void>): void {
    this.pendingSubscribes += 1;
    sending
      .then(() => {
        if (this.closed || this.handlers.size === 0) {
          this.unsubscribeFrom(subscriber).catch(ignoreError);
          return;
        }
        this.subscribed = true;
      }, ignoreError)
      .finally(() => {
        this.pendingSubscribes -= 1;
      });
  }

  private retrySubscription(): void {
    if (this.closed || this.subscribed || this.subscribing || this.handlers.size === 0) {
      return;
    }
    this.ensureSubscribed().catch(ignoreError);
  }

  private dropSubscription(): void {
    if (this.closed) {
      return;
    }
    // 구독한 적이 없으면 보낼 것이 없다. 진행 중인 SUBSCRIBE는 완료 시점에 해제한다
    const wasSubscribed = this.subscribed;
    this.subscribed = false;
    this.subscribing = undefined;
    if (wasSubscribed) {
      this.unsubscribeFrom(this.connection.subscriber(ignoreError)).catch(ignoreError);
    }
  }

  private unsubscribeFrom(subscriber: RedisSubscriberTarget): Promise<void> {
    return withDeadline(
      () => subscriber.unsubscribe(this.channel, this.listener),
      this.connection.options.commandDeadlineMs,
    );
  }
}
