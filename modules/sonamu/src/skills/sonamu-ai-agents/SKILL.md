---
name: sonamu-ai-agents
description: Builds tool-using AI agents on Sonamu. Use when implementing an agent class, decorating tools, invoking an agent, or carrying state through tool execution. Covers BaseAgentClass, @tools, use(), agent.generate(), agent.stream(), and default tool names.
---

# AI agents

Extend `BaseAgentClass`, decorate the methods the model may call with `@tools`, and invoke the
resulting AI SDK agent inside `use()`.

```typescript
import { openai } from "@ai-sdk/openai";
import { BaseAgentClass, tools } from "sonamu/ai";
import { z } from "zod/v4";

type SearchState = {
  queries: string[];
};

class SearchAgentClass extends BaseAgentClass<SearchState> {
  @tools({
    description: "Searches documents by query",
    schema: {
      input: z.object({ query: z.string() }),
      output: z.object({ titles: z.array(z.string()) }),
    },
  })
  async search(input: { query: string }) {
    const state = this.store;
    if (state === undefined) {
      throw new Error("SearchAgent.search must run inside SearchAgent.use()");
    }

    state.queries.push(input.query);
    return { titles: await searchDocuments(input.query) };
  }
}

export const SearchAgent = new SearchAgentClass();

const text = await SearchAgent.use(
  {
    model: openai.chat("gpt-4.1-mini"),
    instructions: "Answer with help from document search.",
    toolChoice: "auto",
  },
  { queries: [] },
  async (agent) => {
    const result = await agent.generate({ prompt: "Find the deployment guide" });
    return result.text;
  },
);
```

The public import is `sonamu/ai`. `sonamu/ai/agents` is not a package export.

## Invoke inside `use()`

`use(config, initialState, callback)` creates a `ToolLoopAgent`, passes it the tools selected for
this instance's constructor name, and returns the callback's result. Call
`agent.generate({ prompt })` for a complete result or `agent.stream({ prompt })` for streaming:

```typescript
await SearchAgent.use(config, { queries: [] }, async (agent) => {
  const result = await agent.stream({ prompt: "Find the deployment guide" });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      sendToken(part.text);
    }
  }
});
```

The `initialState` is active through the async callback and tool executions started by
`generate()` or `stream()` in that callback. `this.store` returns that state inside the context and
`undefined` outside it. A tool that requires state should be reached through `use()` and should
explicitly reject a missing store as in the first example; optional chaining would silently skip
the intended state update.

`AgentConfig` requires `model`. It also accepts `instructions`, `toolChoice`, `stopWhen`,
`activeTools`, provider options, headers, and the standard token and sampling settings exposed by
the type. The callback receives the AI SDK `Agent`, so its call input is either `prompt` or
`messages`.

## Define tools

Every decorated method needs an input schema. The output schema is optional but, when supplied, is
forwarded to the AI SDK together with the remaining tool options.

```typescript
@tools({
  name: "documentSearch",
  description: "Searches documents by query",
  schema: {
    input: z.object({ query: z.string() }),
    output: z.object({ titles: z.array(z.string()) }),
  },
  needsApproval: false,
  toModelOutput: ({ output }) => ({ type: "text", value: output.titles.join("\n") }),
  providerOptions: {},
})
async search(input: { query: string }) {
  return { titles: await searchDocuments(input.query) };
}
```

When `needsApproval` is omitted, Sonamu passes `false`. `description`, `toModelOutput`, and
`providerOptions` are optional.

### Default tool names

Set `name` when the model-facing identifier must be explicit. Without it, Sonamu derives the key
from the decorated class and method names:

1. The class name must end in `Class` to contribute a prefix.
2. Sonamu removes that trailing `Class`.
3. It then removes a trailing `Model` or `Frame` from the remainder. It does not remove `Agent`.
4. It camel-cases the prefix and method name and joins them with `.`.
5. Without a trailing `Class`, the key is only the camel-cased method name.

| Decorated class and method | Default tool key |
| --- | --- |
| `SearchAgentClass.findDocuments` | `searchAgent.findDocuments` |
| `SearchModelClass.findDocuments` | `search.findDocuments` |
| `SearchFrameClass.findDocuments` | `search.findDocuments` |
| `SearchAgent.findDocuments` | `findDocuments` |

The `agentName` passed to `super(agentName)` selects the logging category; it does not change this
tool-name derivation.

## Tool visibility

Decorated definitions are stored in a shared module-level registry and selected by the exact
`this.constructor.name` string, not by class identity. Distinct agent classes therefore need
distinct constructor names; classes with the same name receive the same filtered definitions.
Within that set, definitions are reduced into the public `tools` object in registration order, so a
later explicit or generated tool key overwrites an earlier duplicate key.

The public `tools` getter is useful when building instructions or inspecting the available
descriptions. The logger is protected implementation state, not an outside-callable property.
