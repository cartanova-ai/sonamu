---
name: sonamu-testing-devrunner
description: DevRunner (sonamu test) 및 sonamu.config.ts 테스트 설정. HMR 연동, Naite trace CLI, 병렬 테스트, vitest.config.ts 구성. Use when configuring test execution, DevRunner setup, or parallel testing.
---

# DevRunner 및 테스트 설정

## 테스트 실행

**원칙: 개발 중에는 `pnpm sonamu test`를 사용한다.** dev 서버는 항상 실행 중이라고 가정한다. 만약 dev 서버가 내려가 있다면 `pnpm sonamu dev`로 먼저 띄운 뒤 테스트한다. `pnpm test`는 CI 환경에서만 사용한다.

```bash
# dev 서버 확인 (내려가 있으면 먼저 실행)
pnpm sonamu dev

# 개발 중 테스트 (기본)
pnpm sonamu test
pnpm sonamu test user.model
pnpm sonamu test user.model -p "findMany"

# CI 환경에서만
pnpm test
```

---

## DevRunner — `sonamu test` (기본 테스트 실행 방식)

`sonamu test`는 `sonamu dev` 프로세스 내부에 상주하는 Vitest Node API 인스턴스를 통해 테스트를 실행한다. 매번 Vitest를 새로 기동하는 대신 이미 초기화된 인스턴스를 재사용하므로 실행 속도가 3.2x 빠르고, HMR과 연동되어 소스 변경 즉시 최신 코드로 테스트된다.

### 사전 준비

**1. sonamu.config.ts에서 devRunner 활성화:**

```typescript
export default defineConfig({
  test: {
    devRunner: {
      enabled: true,
      // routePrefix: "/__test__",   // optional, 기본값
      // vitestConfigPath: undefined, // optional, 기본값: vitest.config.ts (api-root 상대경로)
    },
  },
});
```

설정 타입 (`SonamuDevRunnerConfig`):
- `enabled: boolean` — DevRunner 활성화 여부 (기본: false)
- `routePrefix?: string` — 테스트 엔드포인트 경로 접두사 (기본: `/__test__`)
- `vitestConfigPath?: string` — vitest.config.ts 경로 (api-root 상대경로)

**2. dev 서버 실행:**

```bash
sonamu dev  # 또는 pnpm dev
```

dev 서버 기동 시 `isLocal() && devRunner.enabled` 조건에서 `DevVitestManager`가 자동 초기화되고, Fastify에 테스트 엔드포인트가 등록된다.

### CLI 사용법

```bash
# 전체 테스트
sonamu test

# 파일 지정 (파일명 일부로 매칭 — globTestSpecifications 사용)
sonamu test user.model

# 여러 파일
sonamu test user.model order.model

# 특정 테스트 케이스만 (테스트명 패턴)
sonamu test user.model --pattern "findMany"
sonamu test user.model -p "findMany"

# Naite trace 출력
sonamu test user.model --traces
sonamu test user.model -t

# 파일 + 패턴 + trace 조합
sonamu test user.model -p "findMany" -t
```

인자 처리 규칙:
- `--pattern` / `-p`: 테스트명 문자열 필터 (`setGlobalTestNamePattern` → 실행 후 `resetGlobalTestNamePattern`)
- `--traces` / `-t`: boolean 플래그, Naite trace 출력 활성화
- `-`로 시작하지 않는 인자: 파일 목록으로 처리
- 다중 파일 전달 허용
- 서버 응답의 `ok: false`는 exit code 1로 반영

### Naite trace 출력

`--traces` / `-t` 플래그로 테스트 코드의 `Naite.t(key, data)` 기록을 CLI에서 확인할 수 있다:

```
Tests: 5 passed, 0 failed, 5 total
Duration: 791ms

Traces:

  UserModel > BaseModel 기본 기능 확인 > Model.findMany() with num = 0
  user.model.test.ts

    [esq-query] user.model.ts:113
    select "users"."id" as "id", ...

    [puri:executed-query] puri.ts:1349
    select COUNT(*)::integer as "total" from "users" limit 1
```

`--traces` 플래그 없이 실행하면 trace는 출력되지 않는다. API 응답(`POST /__test__/run`)에는 항상 `traces` 필드가 포함되므로 외부 도구에서 활용할 수 있다.

trace 데이터 상세: `naite.md` 참고

### HMR 연동 — 소스 변경 시 Vitest 모듈 그래프 자동 무효화

소스 파일을 수정하면 syncer의 `syncFromWatcher`에서 다음이 동시에 일어난다:
1. 서버 HMR 캐시 무효화 (`hot.invalidateFile`)
2. Vitest 모듈 그래프 무효화 (`Sonamu.devVitestManager.invalidateFiles([filePath])`)

```
user.model.ts 수정 → 저장
서버 로그: "Test invalidated: src/application/user/user.model.ts"
sonamu test user.model  ← 최신 코드로 실행됨
```

Vite의 `moduleGraph.invalidateModule()`이 importer 방향으로 재귀적 cascade하므로, 소스 파일 하나만 무효화하면 이를 import하는 테스트 파일도 자동으로 무효화된다. 별도의 재시작이 필요 없다.

**전이적 의존 관계 예시:**
- `utils.ts` 변경 → `user.model.ts` (utils import) → `user.model.test.ts` 모두 자동 무효화

### HTTP API 직접 호출

CLI 대신 HTTP API를 직접 호출할 수 있다:

```bash
# 테스트 실행
curl -X POST http://localhost:3000/__test__/run \
  -H "Content-Type: application/json" \
  -d '{"files": ["user.model"], "pattern": "findMany"}'

# 상태 확인
curl http://localhost:3000/__test__/status
```

**POST `/__test__/run`** 요청:
```json
{ "files": ["src/user/user.model.test.ts"], "pattern": "should create user" }
```

응답 (성공):
```json
{
  "ok": true,
  "summary": { "total": 12, "passed": 11, "failed": 1, "skipped": 0, "durationMs": 842 },
  "failed": [
    { "file": "src/user/user.model.test.ts", "name": "UserModel > should create user", "error": "Expected ..." }
  ],
  "traces": [
    {
      "testName": "UserModel > should create user",
      "file": "src/user/user.model.test.ts",
      "traces": [
        { "key": "esq-query", "value": "select ...", "filePath": "user.model.ts", "lineNumber": 113, "at": "2026-02-23T14:51:35+09:00" }
      ]
    }
  ]
}
```

**GET `/__test__/status`** 응답:
```json
{ "ready": true, "running": false, "lastRunAt": "2026-02-13T12:34:56.000Z" }
```

### 내부 아키텍처

**DevVitestManager** (`testing/dev-vitest-manager.ts`):
- `createVitest('test', cliOptions, viteOverrides)`로 상주 인스턴스 생성
- `watch: true, standalone: true`로 설정하되, 자동 재실행은 차단:
  - `forceRerunTriggers: []`
  - `server.watch: null` (chokidar 미생성)
  - `onFilterWatchedSpecification(() => false)`
- 워커 프로세스가 테스트 DB를 사용하도록 `env: { NODE_ENV: "test" }` 명시
- **queue 기반 순차 실행**: 동시 요청 시 결과 꼬임 방지, 요청 순서대로 처리 후 각각 응답
- **결과 집계**: `specModuleIds`로 실행 요청된 모듈만 필터링 (standalone 모드에서 `testModules`가 전체 모듈을 포함하는 문제 대응)
- 프로젝트의 `vitest.config.ts` 로딩 유지 (기존 sequencer/reporter/globalSetup 재사용)

**Fastify 통합** (`testing/dev-test-routes.ts`):
- `registerDevTestRoutes(server, config)`로 라우트 등록
- `Sonamu.devVitestManager`에 매니저 인스턴스 저장
- `server.addHook('onClose')`에서 `shutdown()` 보장

**CLI** (`bin/test-command.ts`):
- `tsicli` 매칭 전에 `testCommand()` 직접 호출 (가변 인자 처리)
- `bootstrap()`의 `notToInit` 목록에 포함 (HTTP 호출만 하므로 `Sonamu.init` 불필요)
- 서버 포트/호스트는 `sonamu.config.ts`의 `server.listen`에서 읽음

### 성능 비교 (miomock 기준)

단일 파일 (`user.model.test.ts`):

| 항목 | `vitest run` | `sonamu test` | 차이 |
|---|---|---|---|
| 테스트 실행 시간 | 2,610ms | 823ms | 3.2x 빠름 |
| 전체 소요 시간 (wall clock) | 4,118ms | 1,907ms | 2.2x 빠름 |

다중 파일 (puri 테스트, 4파일 147테스트):

| 항목 | `vitest run` | `sonamu test` | 차이 |
|---|---|---|---|
| 테스트 실행 시간 | 5,740ms | 1,774ms | 3.2x 빠름 |
| 전체 소요 시간 (wall clock) | 7,035ms | 2,673ms | 2.6x 빠름 |

속도 차이 원인: `vitest run`은 매 실행마다 프로세스 부팅(~1.5초) + 모듈 transform(~400ms)이 필요하지만, `sonamu test`는 이미 초기화된 인스턴스를 재사용하므로 이 비용이 없다.

### `pnpm sonamu test` vs `pnpm test` 비교

| | `pnpm sonamu test` (기본) | `pnpm test` (CI/대체) |
|---|---|---|
| 실행 방식 | dev 서버 내 상주 인스턴스 | 독립 Vitest 프로세스 |
| 초기화 비용 | 없음 (이미 초기화됨) | 매 실행마다 초기화 |
| HMR 연동 | 소스 변경 즉시 반영 | 해당 없음 |
| Naite trace | `--traces` 플래그로 CLI 출력 | reporter 통해 확인 |
| 용도 | **개발 중 기본 테스트 실행** | CI 환경 |
| 사전 조건 | `sonamu dev` 실행 중 (항상 실행 가정) | 없음 |

### 트러블슈팅

**"dev 서버에 연결할 수 없습니다"**
→ `sonamu dev`가 실행 중인지 확인. CLI는 `config.server.listen.port`로 HTTP 요청을 보낸다.

**"devRunner가 활성화되지 않았습니다" (또는 404 응답)**
→ `sonamu.config.ts`에 `test.devRunner.enabled: true` 설정이 필요. DevRunner는 `isLocal()` 환경에서만 활성화된다.

**"Vitest 인스턴스가 아직 준비되지 않았습니다" (500 응답)**
→ dev 서버 기동 직후 Vitest 초기화가 완료되기 전에 요청한 경우. `GET /__test__/status`에서 `ready: true`를 확인 후 실행.

**테스트가 이전 코드로 실행됨**
→ 소스 파일 저장 후 `"Test invalidated: ..."` 로그가 출력되는지 확인. 로그가 없다면 `devRunner.enabled`가 `true`인지, syncer가 정상 동작 중인지 확인.

---

## sonamu.config.ts 테스트 관련 설정 전체 맵

`pnpm sonamu test` (DevRunner, 기본)와 `pnpm test` (Vitest 직접 실행, CI용) 모두 `sonamu.config.ts`의 설정을 참조한다.

### 설정 타입 정의 (SonamuTestConfig)

```typescript
// config.ts
export type SonamuTestConfig = {
  /** 병렬 테스팅 활성화 (기본: false) */
  parallel?: boolean;
  /** 병렬 실행 워커 수 (기본: 4) */
  maxWorkers?: number;
  /** Dev 서버 내 Vitest 상주 인스턴스 설정 */
  devRunner?: SonamuDevRunnerConfig;
};

export type SonamuDevRunnerConfig = {
  /** DevRunner 활성화 여부 (기본: false) */
  enabled: boolean;
  /** 테스트 엔드포인트 경로 접두사 (기본: /__test__) */
  routePrefix?: string;
  /** vitest.config.ts 경로 (api-root 상대경로) */
  vitestConfigPath?: string;
};
```

### 병렬 테스트 설정 (선택)

`pnpm sonamu test`와 `pnpm test` 모두 병렬 설정을 공유한다. 병렬 실행이 필요한 경우에만 설정한다:

```typescript
export default defineConfig({
  test: {
    parallel: true,   // Worker별 DB 분리 실행
    maxWorkers: 4,    // Worker 수 (기본: 4)
  },
});
```

`parallel: true`이면 `getSonamuTestConfig()`(vitest-helpers.ts)이 vitest에 `pool: "forks"`, `maxWorkers`, `env: { SONAMU_WORKER_DB: "true" }`를 주입하고, `globalSetup`(global-setup.ts)에서 `{database.name}_test_1` ~ `{database.name}_test_{maxWorkers}` DB를 템플릿(`{database.name}_test`)에서 복제 생성한다.

### DevRunner 설정 (필수)

`pnpm sonamu test`를 사용하려면 DevRunner를 활성화해야 한다. `test.devRunner.enabled: true`만 추가하면 된다:

```typescript
export default defineConfig({
  server: {
    listen: {
      port: 3000,          // CLI가 이 포트로 HTTP 요청을 보냄
      host: "localhost",   // CLI가 이 호스트로 연결 (기본: localhost)
    },
  },

  test: {
    devRunner: {
      enabled: true,                     // 필수: DevRunner 활성화
      // routePrefix: "/__test__",       // 선택: 엔드포인트 경로 (기본값)
      // vitestConfigPath: undefined,     // 선택: vitest.config.ts 경로 (기본: api-root의 vitest.config.ts)
    },
    // parallel: true,                   // 선택: DevRunner와 독립적
    // maxWorkers: 4,                    // 선택: parallel 사용 시
  },
});
```

### 설정별 참조 위치 (소스코드 기준)

| 설정 경로 | 기본값 | 참조 위치 | 용도 |
|---|---|---|---|
| `test.devRunner.enabled` | `false` | `sonamu.ts` L394, `test-command.ts` | DevRunner 활성화 조건 |
| `test.devRunner.routePrefix` | `"/__test__"` | `dev-test-routes.ts`, `test-command.ts` | HTTP 엔드포인트 경로 |
| `test.devRunner.vitestConfigPath` | `undefined` | `dev-vitest-manager.ts` `start()` | Vitest 설정 파일 위치 |
| `test.parallel` | `false` | `vitest-helpers.ts` `getSonamuTestConfig()` | `pool: "forks"` + `SONAMU_WORKER_DB` env 주입 |
| `test.maxWorkers` | `4` | `vitest-helpers.ts`, `global-setup.ts` | Vitest maxWorkers + worker DB 개수 |
| `server.listen.port` | `3000` | `test-command.ts` | CLI → dev 서버 HTTP 연결 포트 |
| `server.listen.host` | `"localhost"` | `test-command.ts` | CLI → dev 서버 HTTP 연결 호스트 |
| `database.name` | — | `db.ts` `generateDBConfig()`, `global-setup.ts` | 테스트 DB 이름 (`{name}_test`) |

### 활성화 조건

DevRunner는 `sonamu.ts`에서 `isLocal() && config.test?.devRunner?.enabled` 조건으로 등록된다. `isLocal()`은 `LR` 환경변수가 undefined이거나 `"local"`인 경우 true를 반환한다 (`controller.ts`). 로컬 개발 환경에서만 동작하며 원격(production/staging) 환경에서는 비활성화된다.

### 병렬 테스트 DB 흐름

`test.parallel: true` 설정 시 DB 흐름:

1. **globalSetup** (`global-setup.ts`): `{database.name}_test`를 템플릿으로 `{database.name}_test_1` ~ `_test_{maxWorkers}` DB 복제
2. **getSonamuTestConfig** (`vitest-helpers.ts`): vitest에 `env: { SONAMU_WORKER_DB: "true" }` 주입
3. **DB.getDB** (`db.ts`): `SONAMU_WORKER_DB=true`이면 `VITEST_POOL_ID` 환경변수로 worker별 DB 선택 (`{database.name}_test_{workerId}`)
4. **globalTeardown**: worker DB 전체 삭제

`test.parallel: false`(기본)이면 모든 테스트가 `{database.name}_test` 단일 DB에서 순차 실행된다.

---

## 설정 파일

### vitest.config.ts

```typescript
import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  test: await getSonamuTestConfig({
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
  }),
}));
```

### global.ts

```typescript
import dotenv from "dotenv";
dotenv.config();
export { setup } from "sonamu/test";
```

### sonamu.config.ts (test 설정)

```typescript
export default defineConfig({
  test: {
    parallel: true,   // 병렬 테스트 활성화
    maxWorkers: 4,    // Worker 수 (기본값: 4)
    devRunner: {
      enabled: true,  // DevRunner 활성화
    },
  },
});
```

---

## 참고

- **테스트 작성 가이드**: `testing.md`
- **Naite 추적 시스템**: `naite.md`
- **Fixture CLI**: `fixture-cli.md`
