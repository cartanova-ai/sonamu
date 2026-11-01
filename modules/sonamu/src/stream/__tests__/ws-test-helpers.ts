import { EventEmitter } from "node:events";

import { type WebSocketTransport } from "../ws";
import { type WebSocketAudience } from "../ws-audience";
import {
  type WebSocketClusterBus,
  type WebSocketClusterEnvelope,
  type WebSocketClusterEnvelopeHandler,
} from "../ws-cluster-bus";
import { type WebSocketRoomId, type WebSocketUserId } from "../ws-core";
import { InMemoryWebSocketPresenceStore } from "../ws-presence-store";

// setImmediate 단위로 큐를 비워 fan-out/outbound flush/cluster 전달이 끝나기를 기다린다
export async function flushAsync(rounds: number = 5): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// 조건이 만족될 때까지 setImmediate 단위로 기다린다. 끝내 만족하지 않으면 그대로 반환해 assertion에서 실패하게 한다
export async function flushUntil(predicate: () => boolean, maxRounds: number = 50): Promise<void> {
  for (let index = 0; index < maxRounds && !predicate(); index += 1) {
    await flushAsync(1);
  }
}

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

// promise가 아직 settle되지 않았는지 확인한다
export async function isSettled<T>(promise: Promise<T>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await flushAsync(2);
  return settled;
}

export class FakeWebSocket extends EventEmitter {
  readyState: 0 | 1 | 2 | 3 = 1;
  bufferedAmount = 0;
  sentMessages: string[] = [];
  pingCount = 0;
  closedWith: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
    this.emit("close", code ?? 1000, Buffer.from(reason ?? "", "utf-8"));
  }

  ping(): void {
    this.pingCount += 1;
  }

  terminate(): void {
    this.readyState = 3;
    this.emit("close", 1006, Buffer.alloc(0));
  }
}

export function asWebSocket(socket: FakeWebSocket): WebSocketTransport {
  return {
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    get readyState() {
      return socket.readyState;
    },
    close(code, reason) {
      socket.close(code, reason?.toString());
    },
    off(...args) {
      socket.off(...args);
    },
    on(...args) {
      socket.on(...args);
    },
    ping() {
      socket.ping();
    },
    send(data) {
      socket.send(data.toString());
    },
    terminate() {
      socket.terminate();
    },
  };
}

// 테스트 데이터 직렬화 결과를 되돌린다. 깨진 JSON이면 원문을 포함한 에러로 테스트를 실패시킨다
function parseTestJson<T>(raw: string): T {
  try {
    return /* SAFETY: 테스트가 직접 직렬화했거나 runtime이 직렬화한 값만 넘긴다. */ JSON.parse(
      raw,
    ) as T;
  } catch (error) {
    throw new Error(`테스트 JSON 파싱 실패: ${raw}`, { cause: error });
  }
}

export function parseFrames(socket: FakeWebSocket): Array<{ event: string; data: object }> {
  return socket.sentMessages.map((message) =>
    parseTestJson<{ event: string; data: object }>(message),
  );
}

type ScriptedMethod =
  | "register"
  | "activate"
  | "unregister"
  | "setUserId"
  | "clearUserId"
  | "join"
  | "leave"
  | "getLiveNodeIds"
  | "resolveRoute"
  | "getRoomMemberCount"
  | "shutdown";

// 다음 호출 직전에 끼워넣을 동작. 동기 throw, reject, 지연된 promise를 그대로 흉내낸다
type ScriptedInterceptor = () => void | Promise<void>;

/**
 * InMemoryWebSocketPresenceStore를 감싸 호출 순서를 기록하고, 메서드별로 다음 호출의 동작을 스크립트할 수 있는 store.
 * 호출 기록은 store가 호출을 "받은" 시점에 남긴다.
 */
export class ScriptedPresenceStore {
  readonly calls: string[] = [];
  readonly inner: InMemoryWebSocketPresenceStore;
  nodeId?: string;
  private readonly interceptors = new Map<ScriptedMethod, ScriptedInterceptor[]>();

  constructor(inner: InMemoryWebSocketPresenceStore = new InMemoryWebSocketPresenceStore()) {
    this.inner = inner;
  }

  next(method: ScriptedMethod, interceptor: ScriptedInterceptor): this {
    const queue = this.interceptors.get(method) ?? [];
    queue.push(interceptor);
    this.interceptors.set(method, queue);
    return this;
  }

  // 이후 모든 호출에 같은 동작을 적용한다
  always(method: ScriptedMethod, interceptor: ScriptedInterceptor): this {
    for (let index = 0; index < 1_000; index += 1) {
      this.next(method, interceptor);
    }
    return this;
  }

  register(input: {
    sessionId: string;
    nodeId: string;
    namespace: string;
    active: boolean;
    connectedAt: Date;
  }): void | Promise<void> {
    this.calls.push(`register:${input.sessionId}`);
    return this.run("register", () => this.inner.register(input));
  }

  activate(sessionId: string): void | Promise<void> {
    this.calls.push(`activate:${sessionId}`);
    return this.run("activate", () => this.inner.activate(sessionId));
  }

  unregister(sessionId: string): void | Promise<void> {
    this.calls.push(`unregister:${sessionId}`);
    return this.run("unregister", () => this.inner.unregister(sessionId));
  }

  setUserId(sessionId: string, userId: WebSocketUserId): void | Promise<void> {
    this.calls.push(`setUserId:${sessionId}:${JSON.stringify(userId)}`);
    return this.run("setUserId", () => this.inner.setUserId(sessionId, userId));
  }

  clearUserId(sessionId: string): void | Promise<void> {
    this.calls.push(`clearUserId:${sessionId}`);
    return this.run("clearUserId", () => this.inner.clearUserId(sessionId));
  }

  join(sessionId: string, roomId: WebSocketRoomId): void | Promise<void> {
    this.calls.push(`join:${sessionId}:${roomId}`);
    return this.run("join", () => this.inner.join(sessionId, roomId));
  }

  leave(sessionId: string, roomId: WebSocketRoomId): void | Promise<void> {
    this.calls.push(`leave:${sessionId}:${roomId}`);
    return this.run("leave", () => this.inner.leave(sessionId, roomId));
  }

  resolveRoute(
    audience: WebSocketAudience,
    nodeId: string,
  ):
    | { localSessionIds: string[]; remoteNodeIds: string[] }
    | Promise<{ localSessionIds: string[]; remoteNodeIds: string[] }> {
    this.calls.push(`resolveRoute:${nodeId}:${audience.type}`);
    return this.run("resolveRoute", () => this.inner.resolveRoute(audience, nodeId));
  }

  getLiveNodeIds(): string[] | Promise<string[]> {
    this.calls.push("getLiveNodeIds");
    return this.run("getLiveNodeIds", () => this.inner.getLiveNodeIds());
  }

  getRoomMemberCount(roomId: WebSocketRoomId, namespace?: string): number | Promise<number> {
    this.calls.push(`getRoomMemberCount:${roomId}`);
    return this.run("getRoomMemberCount", () => this.inner.getRoomMemberCount(roomId, namespace));
  }

  shutdown(): void | Promise<void> {
    this.calls.push("shutdown");
    return this.run("shutdown", () => undefined);
  }

  callsOf(prefix: string): string[] {
    return this.calls.filter((call) => call.startsWith(prefix));
  }

  private run<T>(method: ScriptedMethod, delegate: () => T | Promise<T>): T | Promise<T> {
    const interceptor = this.interceptors.get(method)?.shift();
    if (!interceptor) {
      return delegate();
    }

    const result = interceptor();
    if (result instanceof Promise) {
      return result.then(() => delegate());
    }
    return delegate();
  }
}

/**
 * 한 프로세스 안에서 targetNodeIds 기준으로 envelope을 라우팅하는 fake cluster 네트워크.
 * 전송 구간을 흉내내기 위해 envelope을 JSON 직렬화/역직렬화한 뒤 다음 tick에 전달한다.
 */
export class InProcessClusterNetwork {
  readonly published: WebSocketClusterEnvelope[] = [];
  private readonly handlers = new Map<string, Set<WebSocketClusterEnvelopeHandler>>();

  bus(nodeId: string): InProcessClusterBus {
    return new InProcessClusterBus(nodeId, this);
  }

  subscribe(nodeId: string, handler: WebSocketClusterEnvelopeHandler): () => void {
    const handlers = this.handlers.get(nodeId) ?? new Set();
    handlers.add(handler);
    this.handlers.set(nodeId, handlers);
    return () => {
      handlers.delete(handler);
    };
  }

  deliver(envelope: WebSocketClusterEnvelope): void {
    const wire = JSON.stringify(envelope);
    this.published.push(parseTestJson<WebSocketClusterEnvelope>(wire));
    setImmediate(() => {
      for (const targetNodeId of envelope.targetNodeIds ?? []) {
        for (const handler of this.handlers.get(targetNodeId) ?? []) {
          const received = parseTestJson<WebSocketClusterEnvelope>(wire);
          void Promise.resolve(handler(received)).catch(() => {});
        }
      }
    });
  }
}

export class InProcessClusterBus implements WebSocketClusterBus {
  shutdownCalls = 0;
  unsubscribeCalls = 0;

  constructor(
    readonly nodeId: string,
    private readonly network: InProcessClusterNetwork,
  ) {}

  publish(envelope: WebSocketClusterEnvelope): void {
    this.network.deliver(envelope);
  }

  // 실제 adapter처럼 구독 완료를 promise로 알린다
  async subscribe(handler: WebSocketClusterEnvelopeHandler): Promise<() => void> {
    const unsubscribe = this.network.subscribe(this.nodeId, handler);
    return () => {
      this.unsubscribeCalls += 1;
      unsubscribe();
    };
  }

  shutdown(): void {
    this.shutdownCalls += 1;
  }
}

// 발행된 envelope을 기록하고 테스트가 직접 수신 envelope을 주입할 수 있는 bus
export class RecordingClusterBus implements WebSocketClusterBus {
  readonly published: WebSocketClusterEnvelope[] = [];
  readonly handlers = new Set<WebSocketClusterEnvelopeHandler>();
  shutdownCalls = 0;
  unsubscribeCalls = 0;
  nodeId?: string;

  publish(envelope: WebSocketClusterEnvelope): void | Promise<void> {
    this.published.push(envelope);
  }

  subscribe(handler: WebSocketClusterEnvelopeHandler): (() => void) | Promise<() => void> {
    this.handlers.add(handler);
    return () => {
      this.unsubscribeCalls += 1;
      this.handlers.delete(handler);
    };
  }

  async emit(envelope: WebSocketClusterEnvelope): Promise<void> {
    for (const handler of this.handlers) {
      await handler(envelope);
    }
  }

  shutdown(): void | Promise<void> {
    this.shutdownCalls += 1;
  }
}

// 전역 unhandledRejection을 수집한다. 반환한 함수로 해제하고 수집 결과를 받는다
export function collectUnhandledRejections(): () => Error[] {
  const collected: Error[] = [];
  const listener = (reason: Error) => {
    collected.push(reason);
  };
  process.on("unhandledRejection", listener);
  return () => {
    process.off("unhandledRejection", listener);
    return collected;
  };
}
