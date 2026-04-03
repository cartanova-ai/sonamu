---
name: sonamu-tasks
description: Sonamu Tasks workflow system. Background jobs, scheduling, durable step execution. Use when implementing background workflows, scheduled tasks, or multi-step async processes.
---

# Tasks (Workflow System)

PostgreSQL-based durable workflow engine. Uses the `@sonamu-kit/tasks` package.

**Source code:**
- Decorator: `modules/sonamu/src/tasks/decorator.ts`
- StepWrapper: `modules/sonamu/src/tasks/step-wrapper.ts`
- WorkflowManager: `modules/sonamu/src/tasks/workflow-manager.ts`
- @sonamu-kit/tasks: `modules/tasks/`

## Workflow Definition

Define with the `workflow()` function. When exported, the syncer automatically collects and registers it with WorkflowManager.

```typescript
import { workflow } from "sonamu";

// Method 1: decorator + function separated
export const myTask = workflow({
  version: "1",
})(async ({ input, step, logger, version }) => {
  // ...
});

// Method 2: decorator + function inlined
export const myTask = workflow({
  version: "1",
}, async ({ input, step, logger, version }) => {
  // ...
});
```

### DefineWorkflowOptions

| Option | Type | Required | Description |
|------|------|------|------|
| `version` | `string` | Y | Workflow version (distinguishes from existing runs when changed) |
| `name` | `string` | N | Workflow name (default: function name converted to underscore case) |
| `schema` | `StandardSchemaV1` | N | Input validation schema (Zod, etc.) |
| `schedules` | `Schedule[]` | N | Array of cron schedules |
| `retryPolicy` | `RetryPolicy` | N | Retry policy |

### Workflow Function Parameters

| Parameter | Type | Description |
|---------|------|------|
| `input` | `Input` | Input value passed when the workflow runs |
| `step` | `StepWrapper` | Tool for defining/executing steps |
| `logger` | `Logger` | @logtape/logtape logger |
| `version` | `string \| null` | Current workflow version |

## Step

An atomic unit of execution within a workflow. On failure, retry begins from that step.

### step.define — Inline Function

```typescript
const result = await step.define({ name: "fetch-data" }, async () => {
  const data = await fetchSomething();
  return data;
}).run();
```

### step.get — Wrapping an Existing Method

```typescript
// Wrap a Model method as a Step
const result = await step.get(MyModel, "processData").run(inputData);

// Specify a custom name
const result = await step.get({ name: "custom_step" }, MyService, "execute").run(params);
```

Overloads for `step.get`:
- `step.get(object, methodName)` — Step name is the methodName converted to underscore case
- `step.get({ name }, object, methodName)` — Step name specified directly

### step.sleep — Durable Wait

```typescript
await step.sleep("wait-before-retry", "30m");
await step.sleep("daily-delay", "1d");
```

The wait time is preserved even if the server restarts.

**DurationString format:** `{number}{unit}` — e.g. `"5s"`, `"30m"`, `"2h"`, `"7d"`, `"1w"`, `"1y"`

## Scheduling (cron)

```typescript
export const dailyReport = workflow({
  version: "1",
  schedules: [{
    expression: "0 9 * * *",    // every day at 9am
    name: "daily-report",        // optional (default: workflowName[expression])
    input: () => ({ date: new Date().toISOString() }),  // optional
  }],
}, async ({ input, step }) => {
  // ...
});
```

| Field | Type | Required | Description |
|------|------|------|------|
| `expression` | `string` | Y | cron expression |
| `name` | `string` | N | Schedule name (default: `workflowName[expression]`) |
| `input` | `Executable<Input>` | N | Input value to pass on execution (function or value) |

The timezone follows the `api.timezone` setting in `sonamu.config.ts`.

## Retry Policy

### Static Policy (Default)

```typescript
export const reliableTask = workflow({
  version: "1",
  retryPolicy: {
    maxAttempts: 5,           // maximum retry attempts (default: 5)
    initialIntervalMs: 1000,  // first retry wait time (default: 1000ms)
    backoffCoefficient: 2,    // wait time multiplier (default: 2)
    maximumIntervalMs: 60000, // maximum wait time
  },
}, async ({ step }) => {
  // ...
});
```

### Dynamic Policy

```typescript
retryPolicy: {
  maxAttempts: 10,
  shouldRetry: (error, attempt) => ({
    shouldRetry: error.message !== "FATAL",
    delayMs: attempt * 2000,
  }),
}
```

## sonamu.config.ts Configuration

```typescript
export default defineConfig({
  tasks: {
    enableWorker: true,
    workerOptions: {
      concurrency: 4,       // concurrent execution count (default: CPU cores - 1)
      usePubSub: true,      // use DB pub/sub (default: true)
      listenDelay: 500,      // execution delay after pub/sub receive in ms (default: 500)
    },
    contextProvider: (defaultContext) => {
      // build Context to use within workflows
      return { ...defaultContext };
    },
  },
});
```

| Option | Type | Description |
|------|------|------|
| `enableWorker` | `boolean` | Whether to enable Worker (use only in daemon mode) |
| `workerOptions.concurrency` | `number` | Number of concurrently executing tasks |
| `workerOptions.usePubSub` | `boolean` | Use PostgreSQL pub/sub |
| `workerOptions.listenDelay` | `number` | Execution delay after pub/sub receive (ms) |
| `contextProvider` | `(ctx) => Context` | Context creation function when workflow runs |

## Manual Execution

```typescript
import { Sonamu } from "sonamu";

// Run via WorkflowManager
const handle = await Sonamu.workflowManager.run(
  { name: "my-task", version: "1" },
  { target: "manual" }
);

// Wait for result
const result = await handle.result();
```

## File Placement

```
packages/api/src/application/
├── {domain}/
│   ├── {domain}.model.ts
│   ├── {domain}.types.ts
│   └── {domain}.workflow.ts    ← workflow file
```

Define with `workflow()` and export in the workflow file; the syncer will collect it automatically.

## Architecture

```
Dev Server startup
  → WorkflowManager initialization (BackendPostgres)
  → Worker startup (when enableWorker: true)
  → syncer collects .workflow.ts files
  → registers via WorkflowManager.synchronize()
  → cron schedules start automatically

On HMR
  → re-register workflows from changed files (synchronize)

Execution flow
  → run() called → workflow execution record created in DB
  → Worker receives via pub/sub → steps executed sequentially
  → checkpoint saved to DB on each step completion
  → on failure: retry from that step according to retryPolicy
  → on server restart: incomplete workflows recovered from DB and continue
```
