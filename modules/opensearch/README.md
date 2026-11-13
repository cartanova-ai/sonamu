# @sonamu-kit/opensearch

Sonamu 애플리케이션의 PostgreSQL 데이터를 OpenSearch에 색인하고 검색하는 선택 패키지입니다. 도메인 트랜잭션 안에서 바뀐 문서를 PostgreSQL에 표시하고, 별도 워커가 그 표시를 OpenSearch에 반영합니다. 검색은 PostgreSQL 카탈로그의 읽기 포인터가 가리키는 인덱스에서만 하며, 결과는 애플리케이션이 권한과 현재 상태를 다시 확인해야 하는 후보입니다. 인덱스 생성, 재구축, 전환, 은퇴는 운영자가 실행하는 관리 명령입니다.

테이블 변경을 감지하지 않습니다(CDC, 트리거 없음). 색인에 영향을 주는 쓰기 경로마다 애플리케이션이 `markChanged`를 호출해야 합니다. 분석기와 매핑을 제공하지 않고, 권한도 판단하지 않습니다.

## 보장하는 것과 보장하지 않는 것

- 도메인 쓰기와 색인 표시는 같은 트랜잭션에서 기록됩니다. 표시하지 못하면 트랜잭션이 커밋되지 않습니다.
- 전달은 최소 한 번입니다. 정확히 한 번은 보장하지 않으며, 같은 리비전이 두 번 보내질 수 있습니다.
- 문서마다 원장 리비전을 외부 버전으로 보내므로 늦게 도착한 옛 리비전이 새 리비전을 덮어쓰지 않습니다.
- 검색은 결과적 일관성입니다. 커밋한 변경이 바로 검색된다고 가정하면 안 됩니다.
- 검색 결과는 후보입니다. 권한과 현재 상태는 애플리케이션이 primary에서 다시 확인해야 합니다.
- OpenSearch가 멈춰도 도메인 쓰기는 계속되고, 의도는 PostgreSQL에 쌓였다가 복구 뒤 반영됩니다.
- 패키지는 원장 행과 tombstone을 지우지 않습니다.
- 복사하거나 복원한 데이터베이스는 원점 기록으로 감지해 원격 작업을 멈춥니다. 물리 복사(base backup, 스냅샷 복원, 시점 복구, replica 승격)는 원점 기록으로 구별되지 않으며, 두 쪽이 같은 인덱스에 보낼 때 대상 fence가 감지합니다. fence는 감지할 뿐 막지 않습니다. 진 쪽이 감지 전후에 보낸 쓰기는 인덱스에 남고, 복사본이 먼저 전진하면 운영 쪽이 집니다.

## 설치

```bash
pnpm add @sonamu-kit/opensearch @opensearch-project/opensearch knex
```

| 구성 요소 | 범위 | 비고 |
| --- | --- | --- |
| PostgreSQL | 18 | |
| OpenSearch | 3.5.0 이상 4.0.0 미만 | AWS OpenSearch Service 같은 관리형 서비스는 테스트하지 않았습니다 |
| `@opensearch-project/opensearch` | `^3.9.0` | peer 의존성. 클라이언트는 애플리케이션이 만들어 주입합니다 |
| `knex` | `^3.3.0` | peer 의존성 |
| `sonamu` | `>=0.13.9` | 선택 peer 의존성. `/sonamu` 진입점에서만 필요합니다 |
| Node.js | 24 이상 | |

설치하는 것만으로는 아무것도 켜지지 않습니다. 모든 팩토리는 연결, 타이머, 스키마 접근 없이 만들어지고, 명시적인 작업이나 `start()` 호출 때만 연결합니다.

## 최소 예제

채팅 메시지를 색인하는 흐름입니다. 코드는 모두 컴파일되는 예제(`examples/`)에서 그대로 가져왔습니다.

1. 애플리케이션 마이그레이션에서 패키지 스키마를 설치합니다.

```typescript title="migrations/20260101000000_install_search_schema.ts"
import { installSearchSchema } from "@sonamu-kit/opensearch/admin";
import { type Knex } from "knex";

/** Role privileges are not part of the schema; grant them with grantSearchRoles (administration.ts). */
export async function up(knex: Knex): Promise<void> {
  await installSearchSchema(knex);
}

export async function down(): Promise<void> {
  // Never dropped automatically: the index ledger and intents cannot be recovered.
  throw new Error(
    "sonamu_search 스키마는 자동으로 지우지 않습니다. 운영자가 직접 DROP SCHEMA sonamu_search CASCADE를 실행하세요.",
  );
}
```

2. 검색 정의를 만듭니다. 문서 스키마, 매핑, 원본 행에서 문서를 만드는 `materialize`를 담습니다.

```typescript title="search/chat-messages.definition.ts"
export const chatMessagesSearch = defineSearch<ChatMessageDocument>({
  key: CHAT_MESSAGES_KEY,
  // Bump whenever the projection's meaning changes, so a rebuild picks it up.
  projectionVersion: "1",
  schema: chatMessageDocumentSchema,
  settings: { index: { number_of_shards: 1 } },
  mappings: {
    properties: {
      room_id: { type: "keyword" },
      author_id: { type: "keyword" },
      body: { type: "text" },
      updated_at: { type: "date" },
    },
  },
  requiredPlugins: [],
```

3. 워커를 서버 수명 주기에 연결합니다.

```typescript title="search/worker.ts"
// Keep the name stable: HMR replaces the lifecycle of the same name, so only one loop runs.
const LIFECYCLE_NAME = "chat-search";

export const searchLifecycle = createSearchLifecycle({
  name: LIFECYCLE_NAME,
  synchronization: searchSynchronization,
  worker: {
    enabled: process.env.SEARCH_WORKER === "1",
    // Worker-only client: the lifecycle creates and closes it.
    client: {
      createClient: () =>
        new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" }),
      ownsClient: true,
      requestTimeoutMs: RECOMMENDED_CLIENT_REQUEST_TIMEOUT_MS,
    },
    definitions: [chatMessagesSearch],
    limits: RECOMMENDED_WORKER_LIMITS,
    pollIntervalMs: RECOMMENDED_WORKER_POLL_INTERVAL_MS,
  },
  // onShutdown does not close these; the application closes them at process exit (shutdownSearch).
  clients: [searchClient],
  stopDeadlineMs: RECOMMENDED_WORKER_STOP_DEADLINE_MS,
});
```

4. 관리 명령으로 첫 대상을 만들고 cutover합니다. 대상이 없으면 표시가 실패해 도메인 쓰기가 커밋되지 않으므로, 표시하는 코드를 배포하기 전에 실행하세요.

```typescript title="search/administration.ts"
export async function buildAndCutover(
  admin: SearchAdmin,
  audit: AdminContext,
): Promise<BuildHandle> {
  const build = await admin.beginRebuild(
    { logicalKey: chatMessagesSearch.key, fingerprint: chatMessagesSearch.fingerprint },
    audit,
  );
  await backfill(admin, build);
  const inspection = await admin.inspectBuild(build.buildId);
  if (!inspection.eligibleForCutover) {
    throw new Error(`cutover 차단: ${inspection.blockers.join(", ")}`);
  }
  await admin.cutover(build.buildId, audit);
  return build;
}
```

같은 관리 작업은 `sonamu` CLI 명령으로도 실행할 수 있습니다. `@sonamu-kit/opensearch/sonamu`의 `createSearchCliPlugin`을 `sonamu.config.ts`의 `cli.plugins`에 등록하면 `pnpm sonamu search init --execute --confirm` 같은 명령이 생깁니다([인덱스 관리](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/index-administration)의 "CLI로 관리 명령 실행하기").

5. 도메인 쓰기와 같은 트랜잭션에서 바뀐 문서를 표시합니다. 표시가 실패하면 도메인 변경도 커밋되지 않습니다.

```typescript title="application/chat-message.model.ts"
  async send(roomId: string, authorId: string, body: string): Promise<string> {
    return this.getPuri("w").transaction(async (trx) => {
      const [row] = await trx
        .trx("messages")
        .insert({ room_id: roomId, author_id: authorId, body })
        .returning<{ id: string }[]>("id");
      await chatSearchSync.markChangedIn(trx, CHAT_MESSAGES_KEY, [String(row.id)]);
      return String(row.id);
    });
  }
```

6. 검색 핸들로 검색하고, 돌아온 후보를 primary에서 다시 확인한 뒤 응답합니다. 권한 재확인과 hydration, 오류 처리까지 담은 전체 예는 [검색](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/searching) 문서에 있습니다.

## 문서

- [개요](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/overview)
- [설치와 설정](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/setup)
- [검색 정의](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/definitions)
- [트랜잭션 색인](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/transactional-indexing)
- [색인 워커](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/worker)
- [검색](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/searching)
- [인덱스 관리](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/index-administration)
- [복구 절차](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/recovery-runbooks)
- [운영](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/operations)
- [miomock 둘러보기](https://sonamu.cartanova.ai/ko/advanced-features/opensearch/miomock-walkthrough)

영어 문서는 같은 경로의 `/en/` 아래에 있습니다.
