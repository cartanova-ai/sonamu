---
name: sonamu-tasks
description: Sonamu Tasks 워크플로우 시스템. 백그라운드 작업, 스케줄링, durable step 실행. Use when implementing background workflows, scheduled tasks, or multi-step async processes.
---

# Tasks (워크플로우 시스템)

PostgreSQL 기반 durable workflow engine. `@sonamu-kit/tasks` 패키지를 사용한다.

**소스코드:**
- 데코레이터: `modules/sonamu/src/tasks/decorator.ts`
- StepWrapper: `modules/sonamu/src/tasks/step-wrapper.ts`
- WorkflowManager: `modules/sonamu/src/tasks/workflow-manager.ts`
- @sonamu-kit/tasks: `modules/tasks/`

## 워크플로우 정의

`workflow()` 함수로 정의한다. export하면 syncer가 자동 수집하여 WorkflowManager에 등록한다.

```typescript
import { workflow } from "sonamu";

// 방법 1: 데코레이터 + 함수 분리
export const myTask = workflow({
  version: "1",
})(async ({ input, step, logger, version }) => {
  // ...
});

// 방법 2: 데코레이터 + 함수 인라인
export const myTask = workflow({
  version: "1",
}, async ({ input, step, logger, version }) => {
  // ...
});
```

### DefineWorkflowOptions

| 옵션 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `version` | `string` | Y | 워크플로우 버전 (변경 시 기존 실행과 구분) |
| `name` | `string` | N | 워크플로우 이름 (기본: 함수명을 underscore 변환) |
| `schema` | `StandardSchemaV1` | N | input 검증 스키마 (Zod 등) |
| `schedules` | `Schedule[]` | N | cron 스케줄 배열 |
| `retryPolicy` | `RetryPolicy` | N | 재시도 정책 |

### 워크플로우 함수 파라미터

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `input` | `Input` | 워크플로우 실행 시 전달된 입력값 |
| `step` | `StepWrapper` | Step 정의/실행 도구 |
| `logger` | `Logger` | @logtape/logtape 로거 |
| `version` | `string \| null` | 현재 워크플로우 버전 |

## Step

워크플로우 내의 원자적 실행 단위. 실패 시 해당 Step부터 재시도된다.

### step.define — 인라인 함수

```typescript
const result = await step.define({ name: "fetch-data" }, async () => {
  const data = await fetchSomething();
  return data;
}).run();
```

### step.get — 기존 메서드 래핑

```typescript
// Model 메서드를 Step으로 감싸기
const result = await step.get(MyModel, "processData").run(inputData);

// 커스텀 이름 지정
const result = await step.get({ name: "custom_step" }, MyService, "execute").run(params);
```

`step.get`의 오버로드:
- `step.get(object, methodName)` — Step 이름은 methodName을 underscore 변환
- `step.get({ name }, object, methodName)` — Step 이름 직접 지정

### step.sleep — Durable 대기

```typescript
await step.sleep("wait-before-retry", "30m");
await step.sleep("daily-delay", "1d");
```

서버가 재시작되어도 대기 시간이 유지된다.

**DurationString 형식:** `{숫자}{단위}` — 예: `"5s"`, `"30m"`, `"2h"`, `"7d"`, `"1w"`, `"1y"`

## 스케줄링 (cron)

```typescript
export const dailyReport = workflow({
  version: "1",
  schedules: [{
    expression: "0 9 * * *",    // 매일 오전 9시
    name: "daily-report",        // 선택 (기본: 워크플로우명[expression])
    input: () => ({ date: new Date().toISOString() }),  // 선택
  }],
}, async ({ input, step }) => {
  // ...
});
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `expression` | `string` | Y | cron 표현식 |
| `name` | `string` | N | 스케줄 이름 (기본: `워크플로우명[expression]`) |
| `input` | `Executable<Input>` | N | 실행 시 전달할 입력값 (함수 또는 값) |

타임존은 `sonamu.config.ts`의 `api.timezone` 설정을 따른다.

## 재시도 정책

### 정적 정책 (기본)

```typescript
export const reliableTask = workflow({
  version: "1",
  retryPolicy: {
    maxAttempts: 5,           // 최대 재시도 횟수 (기본: 5)
    initialIntervalMs: 1000,  // 첫 재시도 대기 (기본: 1000ms)
    backoffCoefficient: 2,    // 대기 시간 배수 (기본: 2)
    maximumIntervalMs: 60000, // 최대 대기 시간
  },
}, async ({ step }) => {
  // ...
});
```

### 동적 정책

```typescript
retryPolicy: {
  maxAttempts: 10,
  shouldRetry: (error, attempt) => ({
    shouldRetry: error.message !== "FATAL",
    delayMs: attempt * 2000,
  }),
}
```

## sonamu.config.ts 설정

```typescript
export default defineConfig({
  tasks: {
    enableWorker: true,
    workerOptions: {
      concurrency: 4,       // 동시 실행 수 (기본: CPU 코어 - 1)
      usePubSub: true,      // DB pub/sub 사용 (기본: true)
      listenDelay: 500,      // pub/sub 수신 후 실행 지연 ms (기본: 500)
    },
    contextProvider: (defaultContext) => {
      // 워크플로우 내에서 사용할 Context 구성
      return { ...defaultContext };
    },
  },
});
```

| 옵션 | 타입 | 설명 |
|------|------|------|
| `enableWorker` | `boolean` | Worker 활성화 여부 (daemon 모드에서만 사용) |
| `workerOptions.concurrency` | `number` | 동시 실행 태스크 수 |
| `workerOptions.usePubSub` | `boolean` | PostgreSQL pub/sub 사용 |
| `workerOptions.listenDelay` | `number` | pub/sub 수신 후 실행 지연 (ms) |
| `contextProvider` | `(ctx) => Context` | 워크플로우 실행 시 Context 생성 함수 |

## 수동 실행

```typescript
import { Sonamu } from "sonamu";

// WorkflowManager를 통해 실행
const handle = await Sonamu.workflowManager.run(
  { name: "my-task", version: "1" },
  { target: "manual" }
);

// 결과 대기
const result = await handle.result();
```

## 파일 배치

```
packages/api/src/application/
├── {domain}/
│   ├── {domain}.model.ts
│   ├── {domain}.types.ts
│   └── {domain}.workflow.ts    ← 워크플로우 파일
```

워크플로우 파일에서 `workflow()`로 정의하고 export하면 syncer가 자동 수집한다.

## 아키텍처

```
Dev Server 시작
  → WorkflowManager 초기화 (BackendPostgres)
  → Worker 시작 (enableWorker: true일 때)
  → syncer가 .workflow.ts 파일 수집
  → WorkflowManager.synchronize()로 등록
  → cron 스케줄 자동 시작

HMR 시
  → 변경된 파일의 워크플로우 재등록 (synchronize)

실행 흐름
  → run() 호출 → DB에 워크플로우 실행 레코드 생성
  → Worker가 pub/sub으로 수신 → Step 순차 실행
  → 각 Step 완료 시 DB에 체크포인트 저장
  → 실패 시 retryPolicy에 따라 해당 Step부터 재시도
  → 서버 재시작 시 미완료 워크플로우를 DB에서 복구하여 계속 실행
```
