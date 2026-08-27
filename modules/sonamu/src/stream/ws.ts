import { randomUUID } from "node:crypto";
import { type EventEmitter } from "node:events";
import { hostname } from "node:os";

import { type RawData, type WebSocket } from "ws";
import { z } from "zod";

import { runtimeTypeOf } from "../runtime-type";
import { isStringValue } from "../utils/runtime-value";
import { type WebSocketAudience } from "./ws-audience";
import { type WebSocketClusterBus } from "./ws-cluster-bus";
import { type WebSocketPresenceStore } from "./ws-presence-store";
import {
  type ManagedWebSocketConnection,
  WebSocketRegistry,
  type WebSocketRegistryOptions,
  type WebSocketRoomId,
  type WebSocketUserId,
} from "./ws-registry";
import {
  type TelemetryContextProvider,
  type WebSocketTelemetryConnectionSnapshot,
  type WebSocketTelemetryConnectionContext,
  type WebSocketTelemetryController,
  type WebSocketTelemetryOptions,
  type TelemetryInspectableConnection,
  createWebSocketTelemetryController,
  isPromiseLike,
} from "./ws-telemetry";
import { parseTraceParent, generateSpanId } from "./ws-telemetry-trace";

// transport-level 상수와 queue threshold를 한 파일에 모아 lifecycle/backpressure 정책을 중앙화함
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;
// RFC 6455 close codes used by Sonamu's WebSocket runtime.
const WS_CLOSE_CODE_GOING_AWAY = 1001;
const WS_CLOSE_CODE_INVALID_FRAME_PAYLOAD_DATA = 1007;
const WS_CLOSE_CODE_POLICY_VIOLATION = 1008;
const WS_CLOSE_CODE_INTERNAL_ERROR = 1011;
const WS_CLOSE_CODE_TRY_AGAIN_LATER = 1013;
const MAX_PENDING_MESSAGES = 100;
const MAX_PENDING_OUTBOUND_MESSAGES = 1_000;
const MAX_SOCKET_BUFFERED_AMOUNT = 1_048_576;
const OUTBOUND_BATCH_SIZE = 50;
const OUTBOUND_RETRY_DELAY_MS = 5;

// envelope을 `{event, data}` 형태로 고정해 server handler와 generated client가 같은 framing contract를 쓰게 함
// meta는 optional이므로 기존 `{event, data}` 메시지도 그대로 파싱됨 (backward-compatible)
const WebSocketEnvelopeSchema = z.object({
  event: z.string(),
  data: z.json(),
  meta: z
    .object({
      traceparent: z.string().optional(),
      tracestate: z.string().optional(),
    })
    .optional(),
});

type MessageHandler<T> = (
  data: T,
  telemetryContext?: WebSocketTelemetryConnectionContext,
) => void | Promise<void>;
type CloseHandler = () => void | Promise<void>;

export type WebSocketEventMap<EventPayload = never> = Record<string, EventPayload>;
export type WebSocketTransport = Pick<
  WebSocket,
  "bufferedAmount" | "close" | "ping" | "readyState" | "send" | "terminate"
> & {
  off: (...args: Parameters<EventEmitter["off"]>) => void;
  on: (...args: Parameters<EventEmitter["on"]>) => void;
};

type WebSocketEventFields = Record<string, z.ZodType>;
type InferWebSocketEventMap<TSchema extends WebSocketEventFields> = z.infer<z.ZodObject<TSchema>>;

export type WebSocketOutEvents<TOut extends object = WebSocketEventMap> = TOut;

export type WebSocketInEvents<TIn extends object = WebSocketEventMap> = TIn;

export interface WebSocketConnection<
  TOut extends object = WebSocketEventMap,
  TIn extends object = WebSocketEventMap,
> extends ManagedWebSocketConnection {
  transport: "ws";
  onClose(callback: CloseHandler): void;
  onMessage<K extends keyof WebSocketInEvents<TIn>>(
    event: K,
    handler: MessageHandler<WebSocketInEvents<TIn>[K]>,
  ): void;
  publish<K extends keyof WebSocketOutEvents<TOut>>(
    event: K,
    data: WebSocketOutEvents<TOut>[K],
  ): void;
  waitForClose(): Promise<void>;
  join(roomId: WebSocketRoomId): void;
  leave(roomId: WebSocketRoomId): void;
  setUserId(userId: WebSocketUserId): void;
  clearUserId(): void;
}

export type AnyWebSocketConnection = WebSocketConnection<object, object>;

type ParsedEnvelope = z.infer<typeof WebSocketEnvelopeSchema>;

type WebSocketConnectionOptions<
  TOut extends WebSocketEventFields,
  TIn extends WebSocketEventFields,
> = {
  namespace?: string;
  heartbeat?: number;
  active?: boolean;
  outEvents: z.ZodObject<TOut>;
  inEvents: z.ZodObject<TIn>;
  registry: WebSocketRegistry;
  telemetryController: WebSocketTelemetryController;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
};

export type WebSocketRuntimeOptions = {
  nodeId?: string;
  presenceStore?: WebSocketPresenceStore;
  clusterBus?: WebSocketClusterBus;
  telemetry?: boolean | WebSocketTelemetryOptions;
};

// registry를 소유하고 connection 생성/shutdown을 담당함. Sonamu 애플리케이션 수명주기와 같이 움직이도록 설계함
export class WebSocketRuntime {
  readonly registry: WebSocketRegistry;
  readonly telemetryController: WebSocketTelemetryController;

  constructor(options: WebSocketRuntimeOptions = {}) {
    // 분산 환경에서 노드 간 충돌을 막기 위해 hostname + pid로 디폴트 식별자를 만든다.
    // 같은 호스트에 여러 프로세스가 떠 있어도 pid로 구분되며, 로그/메트릭에서도 식별이 쉬움
    const resolvedNodeId = options.nodeId ?? `${hostname()}-${process.pid}`;
    this.telemetryController = createWebSocketTelemetryController(options.telemetry, {
      runtimeId: randomUUID(),
      nodeId: resolvedNodeId,
    });
    const registryOptions: WebSocketRegistryOptions = {
      nodeId: resolvedNodeId,
      presenceStore: options.presenceStore,
      clusterBus: options.clusterBus,
      telemetryController: this.telemetryController,
    };
    this.registry = new WebSocketRegistry(registryOptions);
  }

  registerConnection<
    TOutSchema extends WebSocketEventFields,
    TInSchema extends WebSocketEventFields,
  >(
    socket: WebSocketTransport,
    options: Omit<
      WebSocketConnectionOptions<TOutSchema, TInSchema>,
      "registry" | "telemetryController"
    >,
  ): WebSocketConnection<InferWebSocketEventMap<TOutSchema>, InferWebSocketEventMap<TInSchema>> {
    return new WebSocketConnectionImpl(socket, {
      ...options,
      registry: this.registry,
      telemetryController: this.telemetryController,
    });
  }

  activateConnection(connectionId: string): void {
    this.registry.activate(connectionId);
  }

  broadcast<Data>(event: string, data: Data, namespace?: string): void {
    this.registry.broadcast(event, data, namespace);
  }

  publishToRoom<Data>(
    roomId: WebSocketRoomId,
    event: string,
    data: Data,
    namespace?: string,
  ): void {
    this.registry.publishToRoom(roomId, event, data, namespace);
  }

  publishToUser<Data>(
    userId: WebSocketUserId,
    event: string,
    data: Data,
    namespace?: string,
  ): void {
    this.registry.publishToUser(userId, event, data, namespace);
  }

  publishToAudience<Data>(audience: WebSocketAudience, event: string, data: Data): void {
    this.registry.publishToAudience(audience, event, data);
  }

  // 프로세스 종료 시 살아있는 연결이 남지 않도록 registry를 순회해 일괄 종료함
  async shutdown(
    code: number = WS_CLOSE_CODE_GOING_AWAY,
    reason = "Server shutting down",
  ): Promise<void> {
    await this.registry.shutdown(code, reason);
    await this.telemetryController.shutdown();
  }
}

export function createWebSocketRuntime(options: WebSocketRuntimeOptions = {}): WebSocketRuntime {
  return new WebSocketRuntime(options);
}

class WebSocketConnectionImpl<
  TOutSchema extends WebSocketEventFields,
  TInSchema extends WebSocketEventFields,
>
  implements
    WebSocketConnection<InferWebSocketEventMap<TOutSchema>, InferWebSocketEventMap<TInSchema>>,
    TelemetryInspectableConnection,
    TelemetryContextProvider
{
  readonly id = randomUUID();
  readonly transport = "ws";
  readonly namespace: string;

  private readonly closeCallbacks: CloseHandler[] = [];
  private readonly messageHandlers = new Map<string, Array<MessageHandler<unknown>>>();
  private readonly pendingMessages: ParsedEnvelope[] = [];
  private readonly pendingOutboundMessages: Array<{ payload: string; event: string }> = [];
  private readonly closePromise: Promise<void>;
  private readonly resolveClosePromise: () => void;
  private readonly heartbeatMs: number;
  private readonly eventSchemasIn: Record<string, z.ZodTypeAny>;
  private readonly eventSchemasOut: Record<string, z.ZodTypeAny>;

  private readonly connectionTraceId?: string;
  private readonly connectionSpanId?: string;
  private readonly connectionParentSpanId?: string;
  private readonly connectionSampled?: boolean;
  private readonly connectionStartedAt = performance.now();

  // connection 수명 동안 유지되는 식별자. setUserId/clearUserId로 업데이트되며 emit hot path에서 매번 registry lookup하지 않도록 캐시함
  private currentUserId?: string;

  get userId(): string | undefined {
    return this.currentUserId;
  }

  private closedInternal = false;
  private closeStarted = false;
  private awaitingPong = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: Promise<void> = Promise.resolve();
  private outboundFlushScheduled = false;

  constructor(
    private readonly socket: WebSocketTransport,
    private readonly options: WebSocketConnectionOptions<TOutSchema, TInSchema>,
  ) {
    this.namespace = options.namespace ?? "default";
    this.heartbeatMs = options.heartbeat ?? 30000;
    this.connectionTraceId = options.traceId;
    this.connectionSpanId = options.spanId;
    this.connectionParentSpanId = options.parentSpanId;
    this.connectionSampled = options.sampled;
    this.eventSchemasIn = options.inEvents["shape"];
    this.eventSchemasOut = options.outEvents["shape"];

    let resolveClosePromise!: () => void;
    this.closePromise = new Promise<void>((resolve) => {
      resolveClosePromise = resolve;
    });
    this.resolveClosePromise = resolveClosePromise;

    this.options.registry.register(this, options.active ?? true);
    this.socket.on("message", this.handleMessage);
    this.socket.on("close", this.handleClose);
    this.socket.on("error", this.handleError);
    this.socket.on("pong", this.handlePong);
    this.startHeartbeat();
  }

  get closed(): boolean {
    return this.closedInternal;
  }

  onClose(callback: CloseHandler): void {
    this.closeCallbacks.push(callback);
  }

  onMessage<K extends keyof InferWebSocketEventMap<TInSchema>>(
    event: K,
    handler: MessageHandler<InferWebSocketEventMap<TInSchema>[K]>,
  ): void {
    const eventKey = String(event);
    const handlers = this.messageHandlers.get(eventKey) ?? [];
    handlers.push(
      /* SAFETY: 등록된 WebSocket 이벤트 스키마가 이 값의 타입을 보장한다. */ handler as MessageHandler<unknown>,
    );
    this.messageHandlers.set(eventKey, handlers);
    this.flushPendingMessages(eventKey);
  }

  publish<K extends keyof InferWebSocketEventMap<TOutSchema>>(
    event: K,
    data: InferWebSocketEventMap<TOutSchema>[K],
  ): void {
    this.publishValidated(String(event), data);
  }

  publishUntyped<Data>(event: string, data: Data): void {
    this.publishValidated(event, data);
  }

  waitForClose(): Promise<void> {
    return this.closePromise;
  }

  join(roomId: WebSocketRoomId): void {
    this.options.registry.join(this.id, roomId);
  }

  leave(roomId: WebSocketRoomId): void {
    this.options.registry.leave(this.id, roomId);
  }

  setUserId(userId: WebSocketUserId): void {
    this.currentUserId = String(userId);
    this.options.registry.setUserId(this.id, userId);
  }

  clearUserId(): void {
    this.currentUserId = undefined;
    this.options.registry.clearUserId(this.id);
  }

  getTelemetrySnapshot(): WebSocketTelemetryConnectionSnapshot {
    return {
      pendingInboundMessages: this.pendingMessages.length,
      pendingOutboundMessages: this.pendingOutboundMessages.length,
      socketBufferedBytes: this.socket.readyState === WS_OPEN ? this.socket.bufferedAmount : 0,
    };
  }

  getTelemetryContext(): WebSocketTelemetryConnectionContext {
    return {
      traceId: this.connectionTraceId,
      spanId: this.connectionSpanId,
      parentSpanId: this.connectionParentSpanId,
      sampled: this.connectionSampled,
    };
  }

  // 모든 telemetry emit site가 공유하는 connection-level field 묶음.
  // 향후 connection-scoped 식별자(e.g. tenantId)가 추가될 때 한 곳만 손대면 됨
  private telemetryFields() {
    return {
      connectionId: this.id,
      namespace: this.namespace,
      userId: this.currentUserId,
      traceId: this.connectionTraceId,
      spanId: this.connectionSpanId,
      parentSpanId: this.connectionParentSpanId,
      sampled: this.connectionSampled,
    };
  }

  private emitInboundRejected(reason: string, event?: string): void {
    const fields = this.telemetryFields();
    this.options.telemetryController.emit({
      name: "ws.message.rejected",
      level: "warn",
      ...fields,
      detail: event !== undefined ? { reason, event } : { reason },
    });
    this.options.telemetryController.recordMetric({
      name: "sonamu.ws.messages",
      kind: "counter",
      value: 1,
      unit: "1",
      tags: { direction: "inbound", outcome: "rejected" },
      ...fields,
    });
  }

  // transport 종료 도중 예외가 나도 markClosed가 반드시 실행되도록 try/finally로 감쌈
  close(code?: number, reason?: string): void {
    if (this.closedInternal || this.closeStarted || this.socket.readyState === WS_CLOSED) {
      return;
    }

    this.closeStarted = true;
    try {
      this.closeTransport(code, reason);
    } finally {
      this.markClosed(code, reason);
    }
  }

  // 인바운드 메시지를 순차 처리 큐에 올림. Sonamu envelope 검증 수행
  private readonly handleMessage = (raw: RawData) => {
    this.enqueueMessageTask(async () => {
      const text = normalizeMessage(raw);
      const parsedEnvelope = safeParseEnvelope(text);
      if (!parsedEnvelope) {
        this.emitInboundRejected("invalidPayload");
        this.close(WS_CLOSE_CODE_INVALID_FRAME_PAYLOAD_DATA, "Invalid message payload");
        return;
      }

      this.options.telemetryController.emit({
        name: "ws.message.received",
        level: "debug",
        ...this.telemetryFields(),
        detail: { event: parsedEnvelope.event },
        payload: parsedEnvelope.data,
      });
      this.options.registry.touch(this.id);
      await this.dispatchEnvelope(parsedEnvelope);
    });
  };

  private readonly handleClose = (code?: number, reason?: Buffer | string) => {
    const reasonText = isStringValue(reason) ? reason : reason?.toString();
    this.markClosed(code, reasonText);
  };

  // 소켓이 transport error를 emit하면 즉시 1011 close로 수렴시켜 상태 누락을 막음
  private readonly handleError = () => {
    this.close(WS_CLOSE_CODE_INTERNAL_ERROR, "WebSocket transport error");
  };

  private readonly handlePong = () => {
    this.awaitingPong = false;
    this.options.registry.touch(this.id);
  };

  // envelope의 meta.traceparent로부터 trace context를 추출함
  // invalid traceparent는 연결을 거부하지 않고 debug 레벨 경고만 emit함
  private resolveMessageTraceContext(
    envelope: ParsedEnvelope,
  ): WebSocketTelemetryConnectionContext {
    const messageSpanId = generateSpanId();

    if (
      this.options.telemetryController.getTraceOptions().propagateMessageTrace &&
      envelope.meta?.traceparent
    ) {
      const parsed = parseTraceParent(envelope.meta.traceparent);
      if (parsed) {
        return {
          traceId: parsed.traceId,
          spanId: messageSpanId,
          parentSpanId: parsed.parentId,
          sampled: parsed.sampled,
        };
      }
      // invalid traceparent: warn but do not reject
      this.options.telemetryController.emit({
        name: "ws.trace.invalid",
        level: "debug",
        ...this.telemetryFields(),
        detail: { source: "message", traceparent: envelope.meta.traceparent },
      });
    }

    return {
      traceId: this.connectionTraceId,
      spanId: messageSpanId,
      parentSpanId: this.connectionSpanId ?? this.connectionParentSpanId,
      sampled: this.connectionSampled,
    };
  }

  // event 존재 여부 → schema 검증 → handler 실행 순으로 분기함
  // handler가 아직 등록되지 않은 초기 메시지는 버퍼에 보관했다가 onMessage 등록 시 flush함
  // handler는 `await`으로 순차 실행해 한 connection 안의 메시지 순서를 보장함
  private async dispatchEnvelope(envelope: ParsedEnvelope): Promise<void> {
    const handlers = this.messageHandlers.get(envelope.event);
    const schema = this.eventSchemasIn[envelope.event];

    if (!schema) {
      this.emitInboundRejected("unknownEvent", envelope.event);
      this.close(WS_CLOSE_CODE_POLICY_VIOLATION, "Unknown event");
      return;
    }

    const parsed = schema.safeParse(envelope.data);
    if (!parsed.success) {
      this.emitInboundRejected("invalidData", envelope.event);
      this.close(WS_CLOSE_CODE_INVALID_FRAME_PAYLOAD_DATA, "Invalid event data");
      return;
    }

    if (!handlers || handlers.length === 0) {
      if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
        this.options.telemetryController.emit({
          name: "ws.message.buffer.dropped",
          level: "warn",
          ...this.telemetryFields(),
          detail: { event: envelope.event },
        });
        this.pendingMessages.shift();
      }
      this.pendingMessages.push(envelope);
      this.options.telemetryController.emit({
        name: "ws.message.buffered",
        level: "debug",
        ...this.telemetryFields(),
        detail: { event: envelope.event },
      });
      return;
    }

    const traceCtx = this.resolveMessageTraceContext(envelope);
    // message-level trace는 connection-level trace를 override함. userId / connectionId / namespace는 그대로 유지
    const messageTraceFields = {
      connectionId: this.id,
      namespace: this.namespace,
      userId: this.currentUserId,
      traceId: traceCtx.traceId,
      spanId: traceCtx.spanId,
      parentSpanId: traceCtx.parentSpanId,
      sampled: traceCtx.sampled,
    };
    try {
      for (const handler of handlers) {
        await handler(parsed.data, traceCtx);
      }
      this.options.telemetryController.emit({
        name: "ws.message.dispatched",
        level: "debug",
        ...messageTraceFields,
        detail: { event: envelope.event },
      });
      this.options.telemetryController.recordMetric({
        name: "sonamu.ws.messages",
        kind: "counter",
        value: 1,
        unit: "1",
        tags: { direction: "inbound", event: envelope.event, outcome: "accepted" },
        ...messageTraceFields,
      });
    } catch (error) {
      this.options.telemetryController.emit({
        name: "ws.message.failed",
        level: "error",
        ...messageTraceFields,
        detail: { event: envelope.event },
      });
      throw error;
    }
  }

  private flushPendingMessages(event: string): void {
    const remaining: ParsedEnvelope[] = [];
    const toFlush: ParsedEnvelope[] = [];

    for (const message of this.pendingMessages) {
      if (message.event !== event) {
        remaining.push(message);
        continue;
      }

      toFlush.push(message);
    }

    this.pendingMessages.length = 0;
    this.pendingMessages.push(...remaining);

    for (const message of toFlush) {
      this.enqueueMessageTask(async () => {
        await this.dispatchEnvelope(message);
      });
    }
  }

  private publishValidated<Data>(event: string, data: Data): void {
    const schema = this.eventSchemasOut[event];
    if (!schema) {
      this.options.telemetryController.emit({
        name: "ws.publish.rejected",
        level: "error",
        ...this.telemetryFields(),
        detail: { event, reason: "unknownEvent" },
      });
      throw new Error(`Unknown websocket event: ${event}`);
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      this.options.telemetryController.emit({
        name: "ws.publish.rejected",
        level: "error",
        ...this.telemetryFields(),
        detail: { event, reason: "invalidPayload" },
      });
      throw new Error(`Invalid websocket event payload: ${event}`);
    }

    if (this.closedInternal || this.socket.readyState !== WS_OPEN) {
      this.options.telemetryController.emit({
        name: "ws.publish.dropped",
        level: "debug",
        ...this.telemetryFields(),
        detail: { event, reason: "connectionClosed" },
      });
      return;
    }

    this.enqueueOutboundMessage(
      JSON.stringify({
        event,
        data: parsed.data,
      }),
      event,
    );
  }

  // listener 해제 / heartbeat 중단 / pending queue 비움 / registry unregister / onClose 실행 / waitForClose resolve 을 한 곳에 모아 원자적으로 처리함
  // async onClose가 reject해도 unhandled rejection으로 새지 않도록 catch로 격리함
  private markClosed(code?: number, _reason?: string): void {
    if (this.closedInternal) {
      return;
    }

    this.closedInternal = true;
    this.closeStarted = false;
    this.stopHeartbeat();
    const fields = this.telemetryFields();
    this.options.telemetryController.emit({
      name: "ws.connection.closed",
      level: "info",
      ...fields,
    });
    if (this.options.telemetryController.getTraceOptions().recordConnectionLifetimeSpan) {
      this.options.telemetryController.recordSpan({
        operationName: "ws.connection.lifetime",
        kind: "server",
        durationMs: performance.now() - this.connectionStartedAt,
        status: deriveLifetimeStatus(code),
        ...fields,
      });
    }
    this.socket.off("message", this.handleMessage);
    this.socket.off("close", this.handleClose);
    this.socket.off("error", this.handleError);
    this.socket.off("pong", this.handlePong);
    this.awaitingPong = false;
    this.pendingMessages.length = 0;
    this.pendingOutboundMessages.length = 0;
    this.options.registry.unregister(this.id);
    for (const callback of this.closeCallbacks.splice(0)) {
      try {
        const result = callback();
        if (isPromiseLike(result)) {
          void result.catch(() => {
            // async close callbacks must not escape as unhandled rejections
          });
        }
      } catch {
        // close callbacks must not block transport cleanup
      }
    }
    this.resolveClosePromise();
  }

  // pong이 오지 않은 상태에서 다음 tick이 오면 timeout close로 처리해 zombie connection을 정리함
  private startHeartbeat(): void {
    if (this.heartbeatMs <= 0) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.closedInternal || this.socket.readyState !== WS_OPEN) {
        return;
      }

      if (this.awaitingPong) {
        this.options.telemetryController.emit({
          name: "ws.heartbeat.timeout",
          level: "warn",
          ...this.telemetryFields(),
        });
        this.close(WS_CLOSE_CODE_GOING_AWAY, "Heartbeat timeout");
        return;
      }

      this.awaitingPong = true;
      this.socket.ping();
    }, this.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // close가 실패해도 terminate 폴백까지 시도하고, 끝내 실패하면 markClosed에 상태 정리를 위임함
  private closeTransport(code?: number, reason?: string): void {
    try {
      if (this.socket.readyState === WS_OPEN || this.socket.readyState === WS_CONNECTING) {
        this.socket.close(code, truncateCloseReason(reason));
        return;
      }

      this.socket.terminate();
    } catch {
      try {
        this.socket.terminate();
      } catch {
        // transport is already broken; state cleanup is handled by markClosed()
      }
    }
  }

  // 인바운드 handler를 promise chain으로 serialize 하고, handler 예외는 connection-local 1011 close로 축소함
  private enqueueMessageTask(task: () => Promise<void>): void {
    this.messageQueue = this.messageQueue
      .then(async () => {
        if (this.closedInternal) {
          return;
        }

        await task();
      })
      .catch(() => {
        this.close(WS_CLOSE_CODE_INTERNAL_ERROR, "Message handling failed");
      });
  }

  // queue가 한계에 도달하면 1013으로 닫아 느린 소비자가 메모리를 끝없이 잡아먹지 못하게 함
  // telemetry preview는 직렬화된 payload에서 복원해 전송 데이터와 같은 JSON 계약을 유지함
  private enqueueOutboundMessage(payload: string, event: string): void {
    if (this.pendingOutboundMessages.length >= MAX_PENDING_OUTBOUND_MESSAGES) {
      this.options.telemetryController.emit({
        name: "ws.backpressure.overflow",
        level: "error",
        ...this.telemetryFields(),
      });
      this.close(WS_CLOSE_CODE_TRY_AGAIN_LATER, "WebSocket backpressure overflow");
      return;
    }

    this.pendingOutboundMessages.push({ payload, event });
    this.options.telemetryController.emit({
      name: "ws.publish.queued",
      level: "debug",
      ...this.telemetryFields(),
      detail: { event },
      payload: safeParseEnvelope(payload)?.data,
    });
    this.scheduleOutboundFlush();
  }

  private scheduleOutboundFlush(delayMs: number = 0): void {
    if (this.outboundFlushScheduled || this.closedInternal) {
      return;
    }

    this.outboundFlushScheduled = true;
    const flush = () => {
      this.outboundFlushScheduled = false;
      this.flushOutboundMessages();
    };

    if (delayMs > 0) {
      setTimeout(flush, delayMs);
      return;
    }

    setImmediate(flush);
  }

  // bufferedAmount가 임계치를 넘으면 flush를 미뤄 socket 내부 큐가 터지지 않도록 backpressure를 존중함
  // 한 번에 배치 단위로만 send해 동기 루프가 이벤트 루프를 장시간 점유하지 않게 함
  private flushOutboundMessages(): void {
    if (this.closedInternal || this.socket.readyState !== WS_OPEN) {
      return;
    }

    if (this.socket.bufferedAmount > MAX_SOCKET_BUFFERED_AMOUNT) {
      this.options.telemetryController.emit({
        name: "ws.backpressure.delayed",
        level: "warn",
        ...this.telemetryFields(),
      });
      this.scheduleOutboundFlush(OUTBOUND_RETRY_DELAY_MS);
      return;
    }

    let sent = 0;
    while (
      sent < OUTBOUND_BATCH_SIZE &&
      this.pendingOutboundMessages.length > 0 &&
      this.socket.readyState === WS_OPEN
    ) {
      const next = this.pendingOutboundMessages.shift();
      if (!next) {
        break;
      }
      const { payload, event } = next;

      const startedAt = performance.now();
      const fields = this.telemetryFields();
      try {
        this.socket.send(payload);
        const durationMs = performance.now() - startedAt;
        this.options.telemetryController.emit({
          name: "ws.publish.sent",
          level: "debug",
          ...fields,
          detail: { event },
        });
        this.options.telemetryController.recordSpan({
          operationName: "ws.publish.send",
          kind: "producer",
          durationMs,
          status: "unset",
          ...fields,
          attributes: { event },
        });
        this.options.telemetryController.recordMetric({
          name: "sonamu.ws.publishes",
          kind: "counter",
          value: 1,
          unit: "1",
          tags: { outcome: "sent", event },
          ...fields,
        });
      } catch (error) {
        const durationMs = performance.now() - startedAt;
        this.options.telemetryController.emit({
          name: "ws.publish.failed",
          level: "error",
          ...fields,
          detail: { event },
        });
        this.options.telemetryController.recordSpan({
          operationName: "ws.publish.send",
          kind: "producer",
          durationMs,
          status: "error",
          ...fields,
          attributes: { event },
          errorType: error instanceof Error ? error.name : runtimeTypeOf(error),
        });
        this.close(WS_CLOSE_CODE_INTERNAL_ERROR, "Outbound publish failed");
        return;
      }

      sent += 1;
      if (this.socket.bufferedAmount > MAX_SOCKET_BUFFERED_AMOUNT) {
        break;
      }
    }

    if (this.pendingOutboundMessages.length > 0) {
      this.scheduleOutboundFlush(
        this.socket.bufferedAmount > MAX_SOCKET_BUFFERED_AMOUNT ? OUTBOUND_RETRY_DELAY_MS : 0,
      );
    }
  }
}

function normalizeMessage(raw: RawData): string {
  if (isStringValue(raw)) {
    return raw;
  }

  if (raw instanceof Buffer) {
    return raw.toString("utf-8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf-8");
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw.filter((chunk): chunk is Buffer => chunk instanceof Buffer)).toString(
      "utf-8",
    );
  }

  return JSON.stringify(raw);
}

function safeParseEnvelope(raw: string): ParsedEnvelope | null {
  try {
    const parsed =
      /* SAFETY: 등록된 WebSocket 이벤트 스키마가 이 값의 타입을 보장한다. */ JSON.parse(
        raw,
      ) as unknown;
    const validated = WebSocketEnvelopeSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

// RFC 6455가 close frame reason을 123 byte로 제한하므로 초과분은 잘라 전송 실패를 방지함
function truncateCloseReason(reason?: string): string | undefined {
  if (!reason) {
    return undefined;
  }

  return Buffer.byteLength(reason, "utf-8") <= 123
    ? reason
    : Buffer.from(reason).subarray(0, 123).toString("utf-8");
}

// connection lifetime span의 status를 close code 기준으로 분기함 (1000/1001 정상 종료, 그 외 known code error, code 미상은 unset)
function deriveLifetimeStatus(code: number | undefined): "ok" | "error" | "unset" {
  if (code === undefined) return "unset";
  if (code === 1000 || code === 1001) return "ok";
  return "error";
}
