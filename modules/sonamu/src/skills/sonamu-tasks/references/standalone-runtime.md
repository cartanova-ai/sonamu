# Standalone Runtime

## Install and initialize

Install the queue and its peer dependencies in the process that produces or consumes tasks:

```bash
pnpm add @sonamu-kit/tasks @logtape/logtape knex
```

The only concrete backend exported from the package root is `BackendPostgres`. It accepts a Knex
PostgreSQL configuration. `initialize()` must finish before any queue operation; otherwise backend
methods throw `Backend not initialized`.

```typescript
import { BackendPostgres, OpenWorkflow } from "@sonamu-kit/tasks";
import type { Knex } from "knex";

const database: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL,
};

const backend = new BackendPostgres(database, {
  namespaceId: "billing",
  runMigrations: true,
  usePubSub: true,
});

await backend.initialize();
const tasks = new OpenWorkflow({ backend });
```

`namespaceId` defaults to `"default"` and isolates every backend query. Producers and workers for
the same queue must use the same PostgreSQL database and namespace. `runMigrations` defaults to
`true`; initialization applies the packaged migrations to the `sonamu_tasks` schema, which contains
`workflow_runs` and `step_attempts`. Set it to `false` only when deployment applies those migrations
elsewhere.

## Config objects do not bootstrap a runtime

`defineConfig()` is a type-preserving identity helper. Its public shape is `{ backend, worker? }`,
and `worker` currently accepts only `concurrency`. Exporting an `openworkflow.config.ts` does not,
by itself, initialize the backend, create an `OpenWorkflow`, register workflows, or start a worker.
The package root does not export a config loader or CLI bootstrap, so runtime startup remains
explicit.

```typescript
import { defineConfig } from "@sonamu-kit/tasks";

export default defineConfig({
  backend,
  worker: { concurrency: 4 },
});
```

Pass `usePubSub` and `listenDelay` to `newWorker()` rather than the config object's `worker` field.

## Start and stop workers

Every `OpenWorkflow` owns an in-memory registry. Register every implementation on the same client
that creates its worker, then start that worker:

```typescript
const worker = tasks.newWorker({
  concurrency: 4,
  usePubSub: true,
  listenDelay: 500,
});

await worker.start();
```

Standalone concurrency defaults to one and is floored at one. It limits active workflow runs per
`Worker` instance, not across all processes; four workers configured with concurrency four can run
up to sixteen workflows at once. Steps inside one handler remain ordinary JavaScript and only run
in parallel when the handler does so, for example with `Promise.all`.

The worker always polls for available work. Pub/Sub is an additional wake-up path, not the delivery
mechanism: `usePubSub` defaults to `true`, and a successful notification triggers another claim
attempt after `listenDelay` (default 500 ms). Enqueueing publishes only when the run option
`publishToChannel` is explicitly `true`; polling still discovers runs when it is omitted or Pub/Sub
is disabled.

On shutdown, stop the worker before the backend:

```typescript
await worker.stop();
await backend.stop();
```

`worker.stop()` stops new claims and waits for delayed subscription callbacks and active executions.
It does not impose a timeout or force-kill a handler, so the process's shutdown policy must decide
how long to wait for user code.

## Providers, context, events, and observation

The public package currently ships PostgreSQL only. It does not expose a root `Backend` type or a
documented provider/plugin registry, so do not promise interchangeable storage providers.

Standalone handlers receive only `{ input, step, version }`. Public enqueue methods store run
`context` as `null`; there is no public context-provider hook. There is also no public workflow
lifecycle event API. PostgreSQL `NOTIFY` traffic is an internal wake signal, not a domain-event
stream.

For operational inspection, `BackendPostgres` exposes `getWorkflowRun`, `listWorkflowRuns`,
`getStepAttempt`, and `listStepAttempts`. Backend activity is logged through LogTape under the
`sonamu.internal.tasks` category hierarchy, while worker-loop and unexpected execution-wrapper
failures go to `console.error`. The package does not emit built-in metrics or traces.
