import {
  parseWebSocketSessionNodeId,
  type WebSocketAudience,
  type WebSocketPresenceRegistration,
  type WebSocketPresenceStore,
  type WebSocketRoomId,
  type WebSocketRoutingPlan,
  type WebSocketUserId,
} from "sonamu";
import { z } from "zod";

import { type RedisWebSocketConnection } from "./connection";
import { APPLY_SESSION_SCRIPT, COUNT_AUDIENCE_SCRIPT, REBUILD_NODE_SCRIPT } from "./scripts";

export type RedisWebSocketPresenceStoreStatus = {
  // 명령용 연결이 지금 ready인지
  ready: boolean;
  // 쓰기 실패나 deadline 초과로 노드 키를 메모리 상태로 다시 써야 하는지
  rebuildPending: boolean;
};

type LocalSession = {
  sessionId: string;
  namespace: string;
  active: boolean;
  rooms: Set<WebSocketRoomId>;
  connectedAt: number;
  lastSeenAt: number;
  userId?: WebSocketUserId;
};

// countAudience 스크립트 조건. namespace가 없으면 스크립트가 그 노드의 활성 namespace로 펼친다
type CountLeaf = { k: "all"; ns?: string } | { k: "room" | "user"; ns?: string; id: string };

type NodeKeys = {
  sessions: string;
  rooms: string;
  users: string;
  namespaces: string;
};

// MASTER_CHANGE가 짧은 간격으로 여러 번 와도 rebuild를 한 번만 하도록 모으는 창
const REBUILD_DEBOUNCE_MS = 200;

/**
 * 노드별 키는 해시태그 `{nodeId}`를 공유해 Redis Cluster에서도 한 slot에 놓인다.
 */
export function nodeKeysOf(prefix: string, nodeId: string): NodeKeys {
  return {
    sessions: `${prefix}:{${nodeId}}:sessions`,
    rooms: `${prefix}:{${nodeId}}:rooms`,
    users: `${prefix}:{${nodeId}}:users`,
    namespaces: `${prefix}:{${nodeId}}:namespaces`,
  };
}

// 타입 태그를 붙여 1과 "1"을 다른 사용자로 다룬다
const TaggedUserIdSchema = z.union([
  z.number().transform((userId) => `n:${String(userId)}`),
  z.string().transform((userId) => `s:${userId}`),
]);

function tagUserId(userId: WebSocketUserId): string {
  return TaggedUserIdSchema.parse(userId);
}

function serializeSession(session: LocalSession, nodeId: string): string {
  return JSON.stringify({
    sessionId: session.sessionId,
    nodeId,
    namespace: session.namespace,
    active: session.active,
    rooms: [...session.rooms],
    userId: session.userId === undefined ? null : tagUserId(session.userId),
    connectedAt: session.connectedAt,
    lastSeenAt: session.lastSeenAt,
  });
}

// core와 같이 namespace가 없거나 빈 문자열이면 모든 namespace를 본다
function scopedNamespace(namespace: string | undefined): string | undefined {
  return namespace === "" ? undefined : namespace;
}

function matchesNamespace(session: LocalSession, namespace: string | undefined): boolean {
  const scoped = scopedNamespace(namespace);
  return scoped === undefined || session.namespace === scoped;
}

function matchesAudience(session: LocalSession, audience: WebSocketAudience): boolean {
  if (audience.type === "union") {
    return audience.audiences.some((child) => matchesAudience(session, child));
  }
  if (!matchesNamespace(session, audience.namespace)) {
    return false;
  }
  if (audience.type === "room") {
    return session.rooms.has(audience.roomId);
  }
  if (audience.type === "user") {
    // userId는 타입까지 같아야 한다
    return session.userId === audience.userId;
  }
  if (audience.type === "connections") {
    return audience.connectionIds.includes(session.sessionId);
  }
  return true;
}

/**
 * audience를 count 조건과 세션 ID로 라우팅할 노드로 나눈다. connections는 세션 ID에 든 노드 ID만으로 라우팅한다.
 */
function collectRouting(
  audience: WebSocketAudience,
  leaves: CountLeaf[],
  connectionNodeIds: Set<string>,
): void {
  switch (audience.type) {
    case "all":
      leaves.push({ k: "all", ns: scopedNamespace(audience.namespace) });
      return;
    case "room":
      leaves.push({ k: "room", ns: scopedNamespace(audience.namespace), id: audience.roomId });
      return;
    case "user":
      leaves.push({
        k: "user",
        ns: scopedNamespace(audience.namespace),
        id: tagUserId(audience.userId),
      });
      return;
    case "connections":
      for (const sessionId of audience.connectionIds) {
        const nodeId = parseWebSocketSessionNodeId(sessionId);
        if (nodeId !== undefined) {
          connectionNodeIds.add(nodeId);
        }
      }
      return;
    case "union":
      for (const child of audience.audiences) {
        collectRouting(child, leaves, connectionNodeIds);
      }
  }
}

/**
 * node-redis 기반 presence store. 자기 노드 세션의 replica를 Redis에 두고, 다른 노드로의 라우팅과 클러스터 인원수를 제공한다.
 *
 * - 각 mutation은 메모리 snapshot을 즉시 갱신하고, 세션 상태 JSON을 Lua 스크립트 하나(EVALSHA)로 Redis에 반영한다.
 * - 모든 Redis 호출은 commandDeadlineMs 안에 끝난다. 쓰기가 실패하거나 deadline을 넘기면 rebuild 대기가 되고,
 *   standalone `ready`, Sentinel `MASTER_CHANGE`, 다음 성공한 heartbeat 중 먼저 오는 시점에 노드 키 전체를 메모리로 다시 쓴다.
 * - heartbeat는 노드 키 TTL과 `<prefix>:nodes` score를 갱신하고 오래된 노드를 정리한다.
 */
export class RedisWebSocketPresenceStore implements WebSocketPresenceStore {
  readonly nodeId: string;
  private readonly connection: RedisWebSocketConnection;
  private readonly keys: NodeKeys;
  private readonly nodesKey: string;
  private readonly sessions = new Map<string, LocalSession>();
  private readonly inFlight = new Set<Promise<void>>();

  private started = false;
  private closing = false;
  private shutdownPromise: Promise<void> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatRunning = false;
  private rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  private rebuildRunning = false;
  private rebuildRequested = false;
  private rebuildPending = false;
  // 세션 JSON 쓰기가 한 번이라도 성공해 sessions 키가 있어야 하는지. 첫 쓰기보다 먼저 나간 heartbeat를 키 유실로 오인하지 않게 한다
  private sessionsPersisted = false;
  // 아직 끝나지 않은 세션 쓰기 수. 진행 중인 쓰기가 있으면 메모리가 Redis보다 앞서 있을 수 있어 키 유실 판정을 하지 않는다
  private pendingWrites = 0;
  // rebuild 도중 새 쓰기 실패가 생겼는지 구분하기 위한 세대 번호
  private failureGeneration = 0;

  /** @internal createRedisWebSocketAdapter가 생성한다. */
  constructor(connection: RedisWebSocketConnection) {
    this.connection = connection;
    this.nodeId = connection.options.nodeId;
    this.keys = nodeKeysOf(connection.options.prefix, this.nodeId);
    this.nodesKey = `${connection.options.prefix}:nodes`;
    connection.onConnectionReady(() => {
      // 재연결 직후 heartbeat를 보내고, 성공하면 대기 중인 rebuild가 이어진다
      this.runHeartbeat();
    });
    connection.onMasterChange(() => {
      // 아직 쓰기 전이면 다시 쓸 키도 없다
      if (!this.started) {
        return;
      }
      // failover에서는 비동기 복제로 직전 쓰기가 유실될 수 있으므로 매번 rebuild를 예약한다
      this.markRebuildPending();
      this.scheduleRebuild();
    });
  }

  getStatus(): RedisWebSocketPresenceStoreStatus {
    return { ready: this.connection.isReady, rebuildPending: this.rebuildPending };
  }

  register(input: WebSocketPresenceRegistration): Promise<void> {
    if (input.nodeId !== this.nodeId) {
      return Promise.reject(
        new Error(
          `Redis presence store for node ${this.nodeId} cannot register a session of node ${input.nodeId}.`,
        ),
      );
    }
    if (this.closing) {
      return Promise.resolve();
    }
    const connectedAt = input.connectedAt.getTime();
    this.sessions.set(input.sessionId, {
      sessionId: input.sessionId,
      namespace: input.namespace,
      active: input.active,
      rooms: new Set(),
      connectedAt,
      lastSeenAt: connectedAt,
    });
    return this.applySession(input.sessionId);
  }

  activate(sessionId: string): Promise<void> {
    return this.mutate(sessionId, (session) => {
      session.active = true;
    });
  }

  unregister(sessionId: string): Promise<void> {
    if (this.closing || !this.sessions.delete(sessionId)) {
      return Promise.resolve();
    }
    return this.applySession(sessionId);
  }

  setUserId(sessionId: string, userId: WebSocketUserId): Promise<void> {
    return this.mutate(sessionId, (session) => {
      session.userId = userId;
    });
  }

  clearUserId(sessionId: string): Promise<void> {
    return this.mutate(sessionId, (session) => {
      delete session.userId;
    });
  }

  join(sessionId: string, roomId: WebSocketRoomId): Promise<void> {
    return this.mutate(sessionId, (session) => {
      session.rooms.add(roomId);
    });
  }

  leave(sessionId: string, roomId: WebSocketRoomId): Promise<void> {
    return this.mutate(sessionId, (session) => {
      session.rooms.delete(roomId);
    });
  }

  /** heartbeat 기한 안에 있는 노드 ID만 반환한다. */
  async getLiveNodeIds(): Promise<string[]> {
    if (this.closing) {
      throw new Error("Redis presence store is shut down.");
    }
    this.start();
    const wait = this.connection.whenUsable();
    if (wait) {
      await wait;
    }
    if (this.closing) {
      throw new Error("Redis presence store is shut down.");
    }
    return this.connection.run((commands) =>
      commands.zRangeByScore(
        this.nodesKey,
        Date.now() - this.connection.options.nodeTimeoutMs,
        "+inf",
      ),
    );
  }

  /**
   * nodeId 관점의 라우팅 계획. 원격 노드는 heartbeat가 nodeTimeoutMs 안인 노드 중 audience count가 있는 노드다.
   * 세션 목록은 읽지 않고, 노드별 count 조회를 한 번의 pipeline으로 보낸다.
   */
  async resolveRoute(audience: WebSocketAudience, nodeId: string): Promise<WebSocketRoutingPlan> {
    const localSessionIds =
      nodeId === this.nodeId
        ? [...this.sessions.values()]
            .filter((session) => session.active && matchesAudience(session, audience))
            .map((session) => session.sessionId)
        : [];

    const leaves: CountLeaf[] = [];
    const remoteNodeIds = new Set<string>();
    collectRouting(audience, leaves, remoteNodeIds);

    if (leaves.length > 0) {
      const counts = await this.countOnLiveNodes(leaves, nodeId);
      for (const [candidate, count] of counts) {
        if (count > 0) {
          remoteNodeIds.add(candidate);
        }
      }
    }
    remoteNodeIds.delete(nodeId);

    return { localSessionIds, remoteNodeIds: [...remoteNodeIds].toSorted() };
  }

  /** 살아 있는 모든 노드의 활성 방 인원수 합계. 자기 노드는 메모리, 원격 노드는 Redis count로 센다. */
  async getRoomMemberCount(roomId: WebSocketRoomId, namespace?: string): Promise<number> {
    // 자기 노드는 메모리에서 센다. Redis 반영이 늦거나(rebuild 대기) 키가 사라져도 자기 노드 인원은 정확하다
    const audience: WebSocketAudience = { type: "room", roomId, namespace };
    let total = 0;
    for (const session of this.sessions.values()) {
      if (session.active && matchesAudience(session, audience)) {
        total += 1;
      }
    }
    // 원격 노드만 Redis에서 센다
    const counts = await this.countOnLiveNodes(
      [{ k: "room", ns: scopedNamespace(namespace), id: roomId }],
      this.nodeId,
    );
    for (const count of counts.values()) {
      total += count;
    }
    return total;
  }

  /**
   * 진행 중인 쓰기를 drainTimeoutMs까지 기다린 뒤 노드 키를 지우고 nodes에서 자기 노드를 뺀다.
   * 이후 들어오는 mutation은 Redis에 쓰지 않으므로 늦은 쓰기가 키를 되살리지 않는다.
   */
  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.close();
    return this.shutdownPromise;
  }

  private async close(): Promise<void> {
    // 이 시점부터 아직 보내지 않은 쓰기와 heartbeat는 Redis로 나가지 않는다(prepare 단계에서 closing을 확인한다)
    this.closing = true;
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = undefined;

    if (this.started) {
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled(this.inFlight),
          new Promise<void>((resolve) => {
            drainTimer = setTimeout(resolve, this.connection.options.drainTimeoutMs);
          }),
        ]);
      } finally {
        // 빨리 끝난 drain이 event loop를 붙잡지 않게 한다
        clearTimeout(drainTimer);
      }
      // 같은 연결에서 앞서 보낸 늦은 쓰기보다 뒤에 실행되므로 그 쓰기가 만든 키도 함께 지운다
      await this.connection
        .run((commands) =>
          Promise.all([
            commands.del(Object.values(this.keys)),
            commands.zRem(this.nodesKey, this.nodeId),
          ]),
        )
        .catch(() => {});
    }
    this.sessions.clear();
    await this.connection.release("store");
  }

  private mutate(sessionId: string, update: (session: LocalSession) => void): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (this.closing || !session) {
      return Promise.resolve();
    }
    update(session);
    session.lastSeenAt = Date.now();
    return this.applySession(sessionId);
  }

  /**
   * 세션 하나를 Redis에 반영한다.
   *
   * 불변식: 모든 쓰기(세션 반영과 rebuild)는 명령을 보내는 바로 그 tick의 메모리 상태를 절대값으로 쓴다.
   * - 세션 반영 스크립트는 Redis에 있던 이전 JSON과 새 JSON을 비교해 count를 맞추므로, 같은 상태를 두 번 써도 count가 두 번 변하지 않는다.
   * - 한 연결의 명령은 보낸 순서대로 실행되므로, 나중에 보낸 쓰기일수록 더 최신 메모리를 담는다.
   *   rebuild가 먼저 보낸 세션 반영을 덮어써도 rebuild snapshot이 그 변경을 이미 담고 있고,
   *   rebuild 뒤에 보낸 세션 반영은 rebuild 결과 위에 최신 상태를 쓴다.
   * - NOSCRIPT 재시도와 ready 대기 뒤에도 snapshot을 다시 만들므로 오래된 상태를 늦게 보내는 일이 없다.
   * 따라서 마지막 쓰기가 성공하면 Redis는 그 시점의 메모리와 같다.
   */
  private applySession(sessionId: string): Promise<void> {
    const keyTtl = String(this.connection.options.keyTtlMs);
    this.pendingWrites += 1;
    const done = () => {
      this.pendingWrites -= 1;
    };
    const writing = this.write(async (commands, token) => {
      let wroteSession = false;
      await this.connection.evalScript(
        commands,
        token,
        APPLY_SESSION_SCRIPT,
        Object.values(this.keys),
        () => {
          if (this.closing) {
            return undefined;
          }
          const session = this.sessions.get(sessionId);
          wroteSession = session !== undefined;
          return [sessionId, session ? serializeSession(session, this.nodeId) : "", keyTtl];
        },
      );
      if (wroteSession) {
        this.sessionsPersisted = true;
      }
    });
    writing.then(done, done);
    return writing;
  }

  private write(operation: Parameters<RedisWebSocketConnection["run"]>[0]): Promise<void> {
    this.start();
    const wait = this.connection.whenUsable();
    const execute = () =>
      // ready를 기다리는 사이 shutdown이 시작됐으면 정리된 노드 키를 되살리지 않도록 버린다
      this.closing
        ? Promise.resolve()
        : this.connection.run(operation).then(
            () => undefined,
            (cause: unknown) => {
              // 서버에서 실행됐을 수도 있으므로 결과와 무관하게 메모리로 다시 써야 한다
              this.markRebuildPending();
              throw cause;
            },
          );
    return this.track(wait ? wait.then(execute) : execute());
  }

  private async countOnLiveNodes(
    leaves: CountLeaf[],
    excludeNodeId?: string,
  ): Promise<Map<string, number>> {
    const liveNodeIds = await this.getLiveNodeIds();
    const prefix = this.connection.options.prefix;
    const leavesJson = JSON.stringify(leaves);
    return this.connection.run(async (commands, token) => {
      const candidates = liveNodeIds.filter((candidate) => candidate !== excludeNodeId);
      // 같은 tick에 보내므로 node-redis가 한 번의 pipeline으로 묶어 보낸다
      const counts = await Promise.all(
        candidates.map((candidate) => {
          const keys = nodeKeysOf(prefix, candidate);
          return this.connection.evalScript(
            commands,
            token,
            COUNT_AUDIENCE_SCRIPT,
            [keys.rooms, keys.users, keys.namespaces],
            // NOSCRIPT 재시도 전에 shutdown됐으면 보내지 않는다
            () => (this.closing ? undefined : [leavesJson]),
          );
        }),
      );
      return new Map<string, number>(
        candidates.map((candidate, index) => [candidate, counts[index] ?? 0]),
      );
    });
  }

  // 첫 사용 때 연결과 heartbeat를 시작한다
  private start(): void {
    if (this.started || this.closing) {
      return;
    }
    this.started = true;
    this.connection.start();
    this.heartbeatTimer = setInterval(() => {
      this.runHeartbeat();
    }, this.connection.options.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
    // 첫 mutation보다 먼저 보내 nodes에 바로 등록되게 한다
    this.runHeartbeat();
  }

  private runHeartbeat(): void {
    if (!this.started || this.closing || this.heartbeatRunning) {
      return;
    }
    this.heartbeatRunning = true;
    const wait = this.connection.whenUsable();
    const execute = (): Promise<boolean | undefined> =>
      this.closing
        ? Promise.resolve(undefined)
        : this.connection.run((commands) => this.sendHeartbeat(commands));
    const heartbeat = (wait ? wait.then(execute) : execute()).then(
      (keysIntact) => {
        if (this.closing) {
          return;
        }
        // 명령 실패 없이 노드 키가 사라진 경우(eviction, FLUSHDB)는 메모리상 있어야 할 키가 없는 것으로 알아챈다
        // 쓰기 실패가 아니므로 failureGeneration은 올리지 않는다. 이 heartbeat보다 뒤에 보낸 rebuild가 성공하면 키가 복구된 것이고,
        // 앞서 보낸 rebuild였다면 다음 heartbeat가 다시 알아챈다
        if (keysIntact === false) {
          this.rebuildPending = true;
        }
        // 연결은 유지된 채 응답만 멈췄다 돌아오면 ready도 MASTER_CHANGE도 없으므로 heartbeat 성공이 rebuild 계기가 된다
        if (this.rebuildPending) {
          this.scheduleRebuild();
        }
      },
      () => {
        // heartbeat가 실패하면 TTL이 갱신되지 않아 키가 만료될 수 있으므로 복구 뒤 다시 써야 한다
        this.markRebuildPending();
      },
    );
    this.track(
      heartbeat.finally(() => {
        this.heartbeatRunning = false;
      }),
    );
  }

  /**
   * nodes score와 키 TTL을 한 번의 pipeline으로 갱신한다.
   * 노드 키 4개의 PEXPIRE 결과(키가 있었는지)를 메모리상 있어야 할 키와 비교해 키 유실을 별도 왕복 없이 알아챈다.
   * 있어야 할 키가 하나라도 없었으면 false를 돌려준다.
   */
  private async sendHeartbeat(
    commands: Parameters<Parameters<RedisWebSocketConnection["run"]>[0]>[0],
  ): Promise<boolean> {
    const now = Date.now();
    const { keyTtlMs } = this.connection.options;
    // 기대값은 명령을 보내는 시점의 메모리로 정한다. 같은 연결의 앞선 쓰기는 이 PEXPIRE보다 먼저 실행된다
    const expected = this.expectedNodeKeys();
    const [sessions, rooms, users, namespaces] = await Promise.all([
      commands.pExpire(this.keys.sessions, keyTtlMs),
      commands.pExpire(this.keys.rooms, keyTtlMs),
      commands.pExpire(this.keys.users, keyTtlMs),
      commands.pExpire(this.keys.namespaces, keyTtlMs),
      commands.zAdd(this.nodesKey, now, this.nodeId),
      // keyTtlMs가 지난 노드는 키도 만료됐으므로 live-node set에서 정리해 크기를 제한한다
      commands.zRemRangeByScore(this.nodesKey, "-inf", now - keyTtlMs),
      commands.pExpire(this.nodesKey, keyTtlMs),
    ]);
    if (expected === undefined) {
      return true;
    }
    return (
      (sessions || !expected.sessions) &&
      (rooms || !expected.rooms) &&
      (users || !expected.users) &&
      (namespaces || !expected.namespaces)
    );
  }

  /**
   * 메모리 상태에서 Redis에 반드시 있어야 할 노드 키를 Lua 스크립트 규칙대로 계산한다.
   * - sessions: 세션이 하나라도 있으면(비활성 포함) 있다
   * - namespaces: 활성 세션이 하나라도 있으면 있다
   * - rooms: 방에 들어간 활성 세션이 있으면 있다
   * - users: userId가 있는 활성 세션이 있으면 있다
   * 아직 세션을 쓴 적이 없거나 끝나지 않은 쓰기가 있으면 메모리가 Redis보다 앞서 있을 수 있으므로 판정하지 않는다(undefined).
   * 반대 방향(메모리상 없어야 할 키가 있음)은 eviction으로 생기지 않으므로 보지 않는다.
   */
  private expectedNodeKeys():
    | { sessions: boolean; rooms: boolean; users: boolean; namespaces: boolean }
    | undefined {
    if (!this.sessionsPersisted || this.pendingWrites > 0) {
      return undefined;
    }
    const expected = {
      sessions: this.sessions.size > 0,
      rooms: false,
      users: false,
      namespaces: false,
    };
    for (const session of this.sessions.values()) {
      if (!session.active) {
        continue;
      }
      expected.namespaces = true;
      if (session.rooms.size > 0) {
        expected.rooms = true;
      }
      if (session.userId !== undefined) {
        expected.users = true;
      }
    }
    return expected;
  }

  private markRebuildPending(): void {
    if (this.closing) {
      return;
    }
    this.rebuildPending = true;
    this.failureGeneration += 1;
  }

  /**
   * 짧은 간격의 계기를 하나로 모은다. 첫 계기부터 REBUILD_DEBOUNCE_MS 뒤에 실행하고, 그 사이의 계기는 타이머를 다시 걸지 않는다.
   * 계기가 debounce보다 자주 와도(짧은 heartbeat 주기, 반복 이벤트) rebuild가 무한히 밀리지 않는다.
   */
  private scheduleRebuild(): void {
    if (this.closing || this.rebuildTimer !== undefined) {
      return;
    }
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = undefined;
      this.rebuild();
    }, REBUILD_DEBOUNCE_MS);
    this.rebuildTimer.unref();
  }

  /**
   * 노드 키를 메모리 snapshot으로 다시 쓴다. 이미 진행 중이면 끝난 뒤 한 번 더 실행해 마지막 계기를 놓치지 않는다.
   */
  private rebuild(): void {
    if (this.closing) {
      return;
    }
    if (this.rebuildRunning) {
      this.rebuildRequested = true;
      return;
    }
    this.rebuildRunning = true;
    const generation = this.failureGeneration;
    const keyTtl = String(this.connection.options.keyTtlMs);

    const rebuilding = this.connection
      .run(async (commands, token) => {
        let wroteSessions = false;
        // snapshot은 보내기 직전에 만든다(applySession의 불변식 참고)
        await this.connection.evalScript(
          commands,
          token,
          REBUILD_NODE_SCRIPT,
          Object.values(this.keys),
          () => {
            if (this.closing) {
              return undefined;
            }
            const args = [keyTtl];
            for (const session of this.sessions.values()) {
              args.push(session.sessionId, serializeSession(session, this.nodeId));
            }
            wroteSessions = this.sessions.size > 0;
            return args;
          },
        );
        if (wroteSessions) {
          this.sessionsPersisted = true;
        }
        if (this.closing) {
          return true;
        }
        return this.sendHeartbeat(commands);
      })
      .then(
        (keysIntact) => {
          if (!keysIntact) {
            // rebuild 직후 heartbeat가 키 유실을 확인했으면 대기를 유지하고 debounce를 거쳐 다시 rebuild한다
            this.rebuildPending = true;
            this.scheduleRebuild();
            return;
          }
          // rebuild 도중 새 쓰기 실패가 없었을 때만 대기를 해제한다
          if (generation === this.failureGeneration) {
            this.rebuildPending = false;
          }
        },
        () => {
          this.markRebuildPending();
        },
      )
      .finally(() => {
        this.rebuildRunning = false;
        // 진행 중에 들어온 계기는 아직 복구할 것이 남은 경우에만 다시 실행한다
        if (this.rebuildRequested) {
          this.rebuildRequested = false;
          if (this.rebuildPending) {
            this.scheduleRebuild();
          }
        }
      });
    this.track(rebuilding);
  }

  private track(promise: Promise<void>): Promise<void> {
    this.inFlight.add(promise);
    const forget = () => {
      this.inFlight.delete(promise);
    };
    promise.then(forget, forget);
    return promise;
  }
}
