---
name: sonamu-ai-agents
description: AI Agent 프레임워크. BaseAgentClass 상속, @tools 데코레이터로 도구 정의, ToolLoopAgent 통합, AsyncLocalStorage 기반 상태 관리. Use when building AI agents with tool-use capabilities.
---

# AI Agent 가이드

Sonamu는 Vercel AI SDK의 `ToolLoopAgent`를 래핑하여 클래스 기반 AI Agent를 구성할 수 있는 프레임워크를 제공합니다.

**소스코드:** `modules/sonamu/src/ai/agents/`

---

## 구조

| 파일 | 역할 |
|------|------|
| `agent.ts` | `BaseAgentClass`, `tools` 데코레이터 |
| `types.ts` | `AgentConfig`, `ToolDecoratorOptions`, `RegisteredToolDefinition` 등 |

---

## BaseAgentClass

Agent의 베이스 클래스. 상속하여 커스텀 Agent를 만듭니다.

```typescript
import { BaseAgentClass, tools } from "sonamu/ai/agents";
import { z } from "zod/v4";

class MyAgentClass extends BaseAgentClass<{ count: number }> {
  constructor() {
    super("MyAgent");  // agentName (로거 카테고리로 사용)
  }

  @tools({
    description: "두 수를 더합니다",
    schema: {
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ result: z.number() }),
    },
  })
  async add(input: { a: number; b: number }) {
    return { result: input.a + input.b };
  }
}

export const MyAgent = new MyAgentClass();
```

### 주요 기능

| 기능 | 설명 |
|------|------|
| `this.logger` | LogTape 로거 (agent 카테고리) |
| `this.store` | AsyncLocalStorage 기반 상태 접근 |
| `this.tools` | 등록된 도구셋 (ToolSet) |
| `this.use()` | Agent 실행 (ALS 컨텍스트 + ToolLoopAgent) |

---

## @tools 데코레이터

메서드를 AI 도구로 등록합니다. Zod v4 스키마로 입출력을 정의합니다.

```typescript
@tools({
  name?: string,           // 도구 이름 (기본: "className.methodName" 형태)
  description?: string,    // LLM에게 보여줄 설명
  schema: {
    input: z.ZodType,      // 입력 스키마 (필수)
    output?: z.ZodType,    // 출력 스키마 (선택)
  },
  needsApproval?: boolean | function,  // 사용자 승인 필요 여부
  toModelOutput?: function,            // 모델에게 반환할 출력 변환
  providerOptions?: ProviderOptions,   // 프로바이더별 옵션
})
```

### 이름 자동 생성 규칙

`name`을 생략하면 `{ModelName(camelCase)}.{methodName(camelCase)}`로 자동 생성됩니다.

```typescript
class SearchAgentClass extends BaseAgentClass<...> {
  @tools({ ... })
  async findDocuments(input: ...) { ... }
  // → 도구 이름: "searchAgent.findDocuments"
}
```

클래스명에서 `Class`, `Model`, `Frame` 접미사는 자동 제거됩니다.

---

## Agent 실행 (use)

`use()` 메서드로 Agent를 실행합니다. AsyncLocalStorage 컨텍스트 내에서 ToolLoopAgent가 동작합니다.

```typescript
import { anthropic } from "@ai-sdk/anthropic";

const result = await MyAgent.use(
  // AgentConfig
  {
    model: anthropic("claude-sonnet-4-5-20250514"),
    instructions: "당신은 수학 도우미입니다.",
    toolChoice: "auto",     // "auto" | "none" | "required"
    maxOutputTokens: 1000,
    temperature: 0.7,
  },
  // 초기 상태 (AsyncLocalStorage에 저장)
  { count: 0 },
  // 콜백 (Agent 인스턴스 받음)
  async (agent) => {
    // agent는 ToolLoopAgent 인스턴스
    // Vercel AI SDK의 agent API 사용
    return agent;
  },
);
```

### AgentConfig 옵션

| 옵션 | 타입 | 설명 |
|------|------|------|
| `model` | `LanguageModel` | AI SDK 모델 (필수) |
| `instructions` | `string` | 시스템 프롬프트 |
| `toolChoice` | `"auto" \| "none" \| "required"` | 도구 선택 방식 |
| `stopWhen` | `StopCondition` | 중단 조건 |
| `activeTools` | `string[]` | 활성화할 도구 이름 목록 |
| `maxOutputTokens` | `number` | 최대 출력 토큰 |
| `temperature` | `number` | 온도 |
| `topP` / `topK` | `number` | 샘플링 파라미터 |
| `presencePenalty` / `frequencyPenalty` | `number` | 페널티 |
| `seed` | `number` | 재현성용 시드 |
| `stopSequences` | `string[]` | 생성 중단 시퀀스 |
| `providerOptions` | `ProviderOptions` | 프로바이더별 추가 옵션 |
| `headers` | `Record<string, string>` | 커스텀 HTTP 헤더 |

---

## 상태 관리 (AsyncLocalStorage)

`BaseAgentClass`는 제네릭 `TStore`로 상태 타입을 정의합니다. `use()` 호출 시 초기 상태를 전달하면, 도구 실행 중 `this.store`로 접근할 수 있습니다.

```typescript
class StatefulAgentClass extends BaseAgentClass<{ processedItems: string[] }> {
  @tools({ ... })
  async processItem(input: { item: string }) {
    // 상태 접근
    this.store?.processedItems.push(input.item);
    return { ok: true };
  }
}
```

**주의:** `this.store`는 `use()` 컨텍스트 밖에서는 `undefined`입니다.

---

## 도구 격리

각 Agent 클래스의 도구는 클래스별로 격리됩니다. `toolSet` getter가 `def.from === this.constructor.name`으로 필터링합니다.

```typescript
class AgentA extends BaseAgentClass<void> {
  @tools({ ... }) async toolX() { ... }
}
class AgentB extends BaseAgentClass<void> {
  @tools({ ... }) async toolY() { ... }
}

// AgentA.tools → { toolX만 포함 }
// AgentB.tools → { toolY만 포함 }
```

---

## 로깅

`this.logger`는 LogTape를 사용합니다. 카테고리는 `convertDomainToCategory(agentName, "agent")`로 생성됩니다.

도구 실행 시 자동으로 debug 로그가 기록됩니다:
```
tools: {model}.{method} with args: {args}
```

---

## 관련 패키지

- `ai`: Vercel AI SDK (`ToolLoopAgent`, `Agent`, `ToolSet`)
- `@ai-sdk/provider-utils`: `tool()`, `Tool`, `ToolExecutionOptions`
- `zod/v4`: 스키마 정의
- `@logtape/logtape`: 로깅

---

## 참고

- **소스코드**: `modules/sonamu/src/ai/agents/`
- **Vercel AI SDK**: https://sdk.vercel.ai/docs
- **벡터 검색**: `vector.md`
