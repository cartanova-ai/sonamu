# @sonamu-kit/websocket-redis-adapter

[node-redis](https://github.com/redis/node-redis) 기반 `WebSocketPresenceStore`와 `WebSocketClusterBus` 구현입니다. 여러 Sonamu 노드가 하나의 Redis(standalone 또는 Sentinel)를 공유해 room, user, connections, all, union audience 메시지를 노드 간에 전달합니다.

## 설치

```bash
pnpm add @sonamu-kit/websocket-redis-adapter redis
```

| peer dependency | 범위 |
| --- | --- |
| `redis` | `^6` |
| `sonamu` | `>=0.13.9` |

`redis` v6은 Node.js 20 이상이 필요합니다.

## 사용법

`createRedisWebSocketAdapter(...)`의 반환값(`nodeId`, `presenceStore`, `clusterBus`)을 WebSocket 옵션에 그대로 펼쳐 넣습니다. 런타임은 store/bus의 `nodeId`가 자신의 `nodeId`와 다르면 생성 시점에 실패하므로, 펼쳐 넣으면 세 값이 항상 일치합니다.

```ts
// sonamu.config.ts
import { createRedisWebSocketAdapter } from "@sonamu-kit/websocket-redis-adapter";

export default defineConfig({
  server: {
    websocket: {
      ...createRedisWebSocketAdapter({
        redis: { url: process.env.REDIS_URL },
        // Redis를 여러 앱이 공유하면 앱마다 다르게 설정합니다
        prefix: "my-app:ws",
      }),
    },
  },
});
```

`createWebSocketRuntime`을 직접 쓰는 경우도 같습니다.

```ts
const runtime = createWebSocketRuntime({
  ...createRedisWebSocketAdapter({ redis: { url: process.env.REDIS_URL } }),
  drainTimeoutMs: 5000,
});
```

생성만으로는 Redis에 연결하지 않습니다. 첫 등록, 조회, 구독, publish 때 연결합니다(lazy connect).

### Redis 입력과 소유권

| `redis` 입력 | 명령 연결 | pub/sub 연결 | connect/close |
| --- | --- | --- | --- |
| `RedisClientOptions` | 어댑터가 `createClient`로 생성 | 명령 client의 `duplicate()` | 둘 다 어댑터가 연결하고 닫습니다 |
| `RedisClientType` (`createClient(...)`) | 호출자 client | 호출자 client의 `duplicate()` 하나 | 호출자 client는 연결하거나 닫지 않습니다. `duplicate()`만 어댑터가 연결하고 닫습니다 |
| `RedisSentinelType` (`createSentinel(...)`) | 호출자 Sentinel | Sentinel 인스턴스의 `subscribe` | 연결하거나 닫지 않으며 `duplicate()`도 만들지 않습니다 |

호출자 client나 Sentinel은 직접 `connect()`해야 합니다. 연결되지 않은 상태에서 쓰면 아래 실패 규칙에 따라 로컬 전용으로 동작합니다.

어댑터가 만든 client(연결 옵션 입력의 client와 모든 `duplicate()`)는 `disableOfflineQueue: true`와 `commandOptions.timeout = commandDeadlineMs`로 만들고 `error` 리스너를 붙입니다. 처리되지 않은 `error` 이벤트가 프로세스를 종료시키지 않습니다. 호출자 client와 Sentinel의 `error` 리스너는 호출자가 붙여야 합니다.

### Sentinel

```ts
import { createSentinel } from "redis";

const sentinel = createSentinel({
  name: "mymaster",
  sentinelRootNodes: [{ host: "sentinel", port: 26379 }],
});
sentinel.on("error", (error) => logger.error(error));
await sentinel.connect();

const adapter = createRedisWebSocketAdapter({ redis: sentinel, prefix: "my-app:ws" });
```

- 구독은 Sentinel 인스턴스의 `subscribe`를 씁니다. Sentinel이 failover 때 구독을 새 master로 옮깁니다.
- Lua 스크립트 캐시는 복제되지 않으므로 failover 직후 `EVALSHA`가 `NOSCRIPT`로 실패합니다. 어댑터는 `SCRIPT LOAD` 뒤 한 번 재시도합니다.
- `topology-change`의 `MASTER_CHANGE`가 직전에 관찰한 master와 다른 master를 알리면 노드 키 rebuild를 예약합니다. A→B→A처럼 되돌아가는 변경도 매번 rebuild합니다. node-redis는 `nodeAddressMap`을 쓰면 master가 그대로여도 scan마다 같은 master로 `MASTER_CHANGE`를 다시 보내는데, 직전 master와 같은 이벤트는 무시합니다.

Redis Cluster(`createCluster`)와 sharded pub/sub는 아직 지원하지 않습니다. 키 레이아웃은 Cluster에서도 노드별 키가 한 slot에 놓이도록 해시태그를 씁니다.

## 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `redis` | (필수) | 연결 옵션, `RedisClientType`, `RedisSentinelType` 중 하나 |
| `nodeId` | `${hostname()}-${process.pid}-${랜덤}` | sonamu `createWebSocketNodeId()`와 같은 형식. 재시작한 노드가 이전 상태를 물려받지 않습니다 |
| `prefix` | `sonamu:ws` | 모든 키와 pub/sub 채널의 접두사 |
| `heartbeatIntervalMs` | `5000` | 노드 키 TTL과 `<prefix>:nodes` score를 갱신하는 주기 |
| `nodeTimeoutMs` | `15000` | heartbeat score가 이보다 오래된 노드는 라우팅에서 제외합니다(heartbeat 3회 누락) |
| `keyTtlMs` | `30000` | 노드 키의 TTL. crash한 노드의 키는 이 시간 뒤 만료됩니다 |
| `commandDeadlineMs` | `2000` | 모든 Redis 호출의 어댑터 deadline |
| `readyTimeoutMs` | `3000` | 첫 연결이 ready가 되기를 기다리는 상한 |
| `drainTimeoutMs` | `5000` | shutdown 때 진행 중인 쓰기를 기다리는 상한 |

## Redis 데이터 모델

| 키 | 타입 | 내용 |
| --- | --- | --- |
| `<prefix>:{<nodeId>}:sessions` | Hash | sessionId → presence JSON (`namespace`, `active`, `rooms` 배열, 타입 태그가 붙은 `userId`, epoch ms 날짜) |
| `<prefix>:{<nodeId>}:rooms` | Hash | namespace + roomId → 활성 세션 수 |
| `<prefix>:{<nodeId>}:users` | Hash | namespace + 타입 태그 userId → 활성 세션 수 (`1`과 `"1"`은 다른 사용자) |
| `<prefix>:{<nodeId>}:namespaces` | Hash | namespace → 활성 세션 수 |
| `<prefix>:nodes` | Sorted set | nodeId → 마지막 heartbeat 시각 |
| `<prefix>:node:<nodeId>` | pub/sub 채널 | 그 노드로 가는 envelope |

- 각 mutation은 Lua 스크립트 하나를 `EVALSHA`로 실행해 세션과 count를 원자적으로 갱신합니다. 스크립트가 다루는 키는 모두 `KEYS`로 전달합니다.
- 라우팅은 live 노드 목록을 읽고 노드별 count를 pipeline 한 번으로 조회합니다. 세션 목록은 읽지 않습니다.
- audience와 `getRoomMemberCount`의 namespace가 없거나 빈 문자열(`""`)이면 core와 같이 모든 namespace를 대상으로 합니다.
- `getRoomMemberCount`는 live 노드의 활성 방 인원수 합계입니다. 자기 노드 인원은 메모리에서 세고, 원격 노드 인원만 Redis count로 셉니다. 그래서 rebuild 대기 중이거나 자기 노드 키가 사라져도 자기 노드 인원은 정확합니다. `getRoomMembers`, `getConnection` 같은 다른 읽기 API는 노드 로컬입니다.

## `keyPrefix`와 어댑터 `prefix`

격리는 어댑터 `prefix`로 합니다. 호출자 client에 `keyPrefix`가 있으면 어댑터 키 앞에 정확히 한 번 더 붙습니다(`app:` + `sonamu:ws:{node}:sessions`). `EVALSHA`의 `KEYS`와 `duplicate()` 연결도 같은 규칙을 따릅니다.

pub/sub 채널에는 `keyPrefix`가 붙지 않습니다. **하나의 Redis를 여러 앱이 공유하면 앱마다 어댑터 `prefix`를 다르게 설정해야 합니다.** `keyPrefix`만 다르게 하면 키는 분리되지만 채널이 겹쳐 다른 앱의 envelope을 받습니다.

## Control messages

`<prefix>:node:<nodeId>` 채널의 envelope은 `kind`로 구분되는 union입니다. `publish`는 audience로 보내는 메시지이고, `leaveUser`는 `registry.leaveUser`가 다른 노드에 보내는 control 메시지입니다. `kind`가 없는 envelope은 `publish`로 취급합니다. 알 수 없는 `kind`나 스키마 오류 envelope은 버리며, 어댑터는 `subscribe(handler, { onRejected })`의 `onRejected` 콜백으로 알리고 core는 `ws.cluster.envelope.rejected` telemetry를 남깁니다.

control envelope은 publish envelope과 같은 노드별 publish 큐와 같은 Redis 명령 연결을 쓰므로, 한 출발 노드에서 나간 순서(`leaveUser` 다음 `publishToRoom`)가 수신 노드에서도 유지됩니다.

`leaveUser`는 pub/sub의 at-most-once 전달에 의존하므로, 그 시점에 구독이 끊긴 노드는 leave를 놓칩니다. `partial: false`는 publish 성공만 뜻하고 원격 노드의 적용을 보장하지 않습니다. 0.13.9 미만 노드는 control envelope을 스키마 검증으로 거부합니다.

## 실패 동작

어댑터는 node-redis의 timeout에 의존하지 않습니다. node-redis의 `commandOptions.timeout`은 아직 소켓에 쓰지 않은 명령에만 적용되므로, 모든 Redis 호출을 `commandDeadlineMs` deadline으로 감싸고 늦게 도착한 결과는 무시합니다.

| 상황 | 동작 |
| --- | --- |
| mutation(등록, join, setUserId 등)이 실패하거나 deadline을 넘김 | 런타임 메모리는 이미 갱신됐으므로 로컬 전달은 계속됩니다. 서버에서 실행됐을 수 있으므로 노드를 rebuild 대기로 표시합니다 |
| 첫 연결이 `readyTimeoutMs` 안에 ready가 되지 않음 | `registerConnection`은 메모리 전용 등록으로 resolve하고 rebuild 대기가 됩니다 |
| 어댑터 소유 client가 오프라인 | 명령이 deadline을 기다리지 않고 즉시 실패합니다 |
| 라우팅 조회 실패 | 로컬 전달만 하고 원격은 건너뜁니다. publish는 resolve합니다 |
| `getRoomMemberCount` 실패 | 런타임이 로컬 수에 `partial: true`를 붙여 돌려줍니다 |
| 구독이 시간 안에 끝나지 않음 | `subscribe`는 reject하지만 구독 시도는 남아 연결이 ready가 되면 이어집니다 |
| crash한 노드 | heartbeat score가 `nodeTimeoutMs`보다 오래되면 라우팅에서 빠지고, 키는 `keyTtlMs` 뒤 만료됩니다 |

rebuild 대기 상태는 다음 중 먼저 오는 계기에 메모리 상태로 노드 키 전체를 스크립트 하나로 다시 써서 해소합니다. 실패한 `unregister`가 남긴 고스트 엔트리도 이때 사라집니다. 계기가 여러 번 와도 첫 계기부터 200ms 뒤에 한 번만 실행하며, 계기가 계속 와도 실행이 뒤로 밀리지 않습니다.

- standalone client의 `ready` 이벤트(재연결)
- Sentinel `MASTER_CHANGE`
- 다음에 성공한 heartbeat (연결은 유지된 채 응답만 멈췄던 경우)
- heartbeat가 메모리상 있어야 할 노드 키가 없다고 확인한 경우 (명령 실패 없이 키가 eviction이나 `FLUSHDB`로 사라진 경우). heartbeat는 노드 키 4개의 `PEXPIRE` 결과를 메모리와 비교합니다. `sessions`는 세션이 있을 때, `namespaces`는 활성 세션이 있을 때, `rooms`는 방에 들어간 활성 세션이 있을 때, `users`는 userId가 있는 활성 세션이 있을 때 있어야 합니다. 그 밖에 키가 없는 것은 정상이므로 rebuild하지 않습니다. rebuild 직후의 heartbeat가 키 유실을 확인하면 debounce를 거쳐 다시 rebuild합니다

rebuild와 세션별 쓰기는 모두 명령을 보내는 순간의 메모리 상태를 씁니다. `NOSCRIPT` 재시도나 ready 대기 뒤에도 상태를 다시 읽어 보내므로, rebuild가 그 사이에 성공한 mutation을 오래된 상태로 덮어쓰지 않습니다.

`presenceStore.getStatus()`는 `{ ready, rebuildPending }`을 돌려줍니다.

### shutdown

런타임 `shutdown()`이 store와 bus의 `shutdown()`을 호출합니다. store는 진행 중인 쓰기를 `drainTimeoutMs`까지 기다린 뒤 노드 키를 지우고 `<prefix>:nodes`에서 자기 노드를 뺍니다. drain이 시간 안에 끝나지 않아도 키 삭제는 진행합니다. shutdown이 시작된 뒤에는 새 mutation뿐 아니라 ready를 기다리던 쓰기, `NOSCRIPT` 재시도, heartbeat, rebuild도 Redis로 보내지 않으므로 정리한 노드 키가 다시 생기지 않습니다. drain 대기 타이머를 포함해 shutdown이 만든 타이머는 모두 정리되고, 어댑터가 소유한 연결만 닫습니다.

bus는 shutdown 뒤 구독을 새로 시작하지 않습니다. ready를 기다리던 구독은 보내지 않고 버리며, 어댑터 deadline이 지난 뒤 node-redis에서 늦게 끝난 구독은 끝나는 즉시 같은 연결에서 해제합니다. 따라서 호출자 Sentinel에 어댑터 채널 구독이 남지 않습니다.
