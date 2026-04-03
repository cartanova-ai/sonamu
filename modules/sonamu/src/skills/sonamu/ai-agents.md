---
name: sonamu-ai-agents
description: AI Agent framework. Extend BaseAgentClass, define tools with @tools decorator, ToolLoopAgent integration, AsyncLocalStorage-based state management. Use when building AI agents with tool-use capabilities.
---

# AI Agent Guide

Sonamu provides a framework that wraps Vercel AI SDK's `ToolLoopAgent` to build class-based AI Agents.

**Source code:** `modules/sonamu/src/ai/agents/`

---

## Structure

| File | Role |
|------|------|
| `agent.ts` | `BaseAgentClass`, `tools` decorator |
| `types.ts` | `AgentConfig`, `ToolDecoratorOptions`, `RegisteredToolDefinition`, etc. |

---

## BaseAgentClass

The base class for Agents. Extend it to create a custom Agent.

```typescript
import { BaseAgentClass, tools } from "sonamu/ai/agents";
import { z } from "zod/v4";

class MyAgentClass extends BaseAgentClass<{ count: number }> {
  constructor() {
    super("MyAgent");  // agentName (used as logger category)
  }

  @tools({
    description: "Adds two numbers",
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

### Key Features

| Feature | Description |
|------|------|
| `this.logger` | LogTape logger (agent category) |
| `this.store` | AsyncLocalStorage-based state access |
| `this.tools` | Registered toolset (ToolSet) |
| `this.use()` | Run the Agent (ALS context + ToolLoopAgent) |

---

## @tools Decorator

Registers a method as an AI tool. Define input/output using Zod v4 schema.

```typescript
@tools({
  name?: string,           // Tool name (default: "className.methodName" format)
  description?: string,    // Description shown to the LLM
  schema: {
    input: z.ZodType,      // Input schema (required)
    output?: z.ZodType,    // Output schema (optional)
  },
  needsApproval?: boolean | function,  // Whether user approval is required
  toModelOutput?: function,            // Transform output returned to the model
  providerOptions?: ProviderOptions,   // Provider-specific options
})
```

### Automatic Name Generation Rule

If `name` is omitted, it is auto-generated as `{ModelName(camelCase)}.{methodName(camelCase)}`.

```typescript
class SearchAgentClass extends BaseAgentClass<...> {
  @tools({ ... })
  async findDocuments(input: ...) { ... }
  // → Tool name: "searchAgent.findDocuments"
}
```

The suffixes `Class`, `Model`, and `Frame` are automatically stripped from the class name.

---

## Running an Agent (use)

Run the Agent with the `use()` method. ToolLoopAgent operates within the AsyncLocalStorage context.

```typescript
import { anthropic } from "@ai-sdk/anthropic";

const result = await MyAgent.use(
  // AgentConfig
  {
    model: anthropic("claude-sonnet-4-5-20250514"),
    instructions: "You are a math assistant.",
    toolChoice: "auto",     // "auto" | "none" | "required"
    maxOutputTokens: 1000,
    temperature: 0.7,
  },
  // Initial state (stored in AsyncLocalStorage)
  { count: 0 },
  // Callback (receives Agent instance)
  async (agent) => {
    // agent is a ToolLoopAgent instance
    // Use Vercel AI SDK's agent API
    return agent;
  },
);
```

### AgentConfig Options

| Option | Type | Description |
|------|------|------|
| `model` | `LanguageModel` | AI SDK model (required) |
| `instructions` | `string` | System prompt |
| `toolChoice` | `"auto" \| "none" \| "required"` | Tool selection strategy |
| `stopWhen` | `StopCondition` | Stop condition |
| `activeTools` | `string[]` | List of tool names to activate |
| `maxOutputTokens` | `number` | Maximum output tokens |
| `temperature` | `number` | Temperature |
| `topP` / `topK` | `number` | Sampling parameters |
| `presencePenalty` / `frequencyPenalty` | `number` | Penalties |
| `seed` | `number` | Seed for reproducibility |
| `stopSequences` | `string[]` | Generation stop sequences |
| `providerOptions` | `ProviderOptions` | Additional provider-specific options |
| `headers` | `Record<string, string>` | Custom HTTP headers |

---

## State Management (AsyncLocalStorage)

`BaseAgentClass` defines the state type with the generic `TStore`. When you pass the initial state to `use()`, it can be accessed via `this.store` during tool execution.

```typescript
class StatefulAgentClass extends BaseAgentClass<{ processedItems: string[] }> {
  @tools({ ... })
  async processItem(input: { item: string }) {
    // Access state
    this.store?.processedItems.push(input.item);
    return { ok: true };
  }
}
```

**Note:** `this.store` is `undefined` outside of a `use()` context.

---

## Tool Isolation

Tools for each Agent class are isolated per class. The `toolSet` getter filters by `def.from === this.constructor.name`.

```typescript
class AgentA extends BaseAgentClass<void> {
  @tools({ ... }) async toolX() { ... }
}
class AgentB extends BaseAgentClass<void> {
  @tools({ ... }) async toolY() { ... }
}

// AgentA.tools → { contains only toolX }
// AgentB.tools → { contains only toolY }
```

---

## Logging

`this.logger` uses LogTape. The category is generated with `convertDomainToCategory(agentName, "agent")`.

Debug logs are automatically recorded on tool execution:
```
tools: {model}.{method} with args: {args}
```

---

## Related Packages

- `ai`: Vercel AI SDK (`ToolLoopAgent`, `Agent`, `ToolSet`)
- `@ai-sdk/provider-utils`: `tool()`, `Tool`, `ToolExecutionOptions`
- `zod/v4`: Schema definitions
- `@logtape/logtape`: Logging

---

## References

- **Source code**: `modules/sonamu/src/ai/agents/`
- **Vercel AI SDK**: https://sdk.vercel.ai/docs
- **Vector search**: `vector.md`
