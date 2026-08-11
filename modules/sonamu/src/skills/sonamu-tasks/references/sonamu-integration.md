# Sonamu Integration

## Define and register

Place exported workflow metadata under `src/application/**/*.workflow.ts`. Sonamu loads those files
and registers each exported `workflow()` value by name and version during synchronization.

```typescript
import { workflow } from "sonamu";
import { z } from "zod";

const RebuildSearchIndexInput = z.object({ index: z.string() });

export const rebuildSearchIndex = workflow(
  {
    name: "rebuild-search-index",
    version: "v1",
    schema: RebuildSearchIndexInput,
    retryPolicy: { maxAttempts: 5 },
  },
  async ({ input, step, logger, version }) => {
    logger.info("Rebuilding index {index}", { index: input.index });

    return await step
      .define({ name: "rebuild" }, () => rebuild(input.index, version))
      .run();
  },
);
```

`name` and `version` are optional in `workflow()`; an omitted version becomes `null`, and an omitted
name applies underscore conversion to `fn.name`. An inline anonymous handler can therefore produce
an empty name. Supplying an explicit stable name avoids silent empty registration and prevents a
symbol rename from changing queued-run routing.

The adapter's `step.define({ name }, fn).run(...args)` wraps an inline function.
`step.get(object, methodName).run(...args)` wraps an object method and derives an underscore-cased
name; its overload with `{ name }` supplies a stable custom name. Both delegate to the same persisted
checkpoint behavior as standalone `step.run`. `step.sleep` is unchanged.

## Configure the worker and context

The `tasks` block in `sonamu.config.ts` controls the framework-managed worker:

```typescript
import { defineConfig } from "sonamu";

export default defineConfig({
  tasks: {
    enableWorker: true,
    workerOptions: {
      concurrency: 4,
      usePubSub: true,
      listenDelay: 500,
    },
    contextProvider: async (defaultContext) => ({
      ...defaultContext,
      user: await loadSystemUser(),
    }),
  },
});
```

When `tasks` is present, `contextProvider` is required by the config type. Sonamu calls it for each
workflow execution with a synthetic HTTP context: `request` and `reply` are null at runtime, headers
are empty, and user/session are null. It does not inherit the request that enqueued the run. The
returned context is installed in Sonamu's async-local storage, so workflow code can use
`Sonamu.getContext()`.

`enableWorker` defaults to true only for Sonamu's daemon server. When enabled, omitted worker
options become CPU count minus one (floored to one), Pub/Sub enabled, and a 500 ms listen delay.
Sonamu initializes the backend and starts the configured worker after the server begins listening;
setting `enableWorker: false` leaves this process able to enqueue while another process consumes.

The handler's `logger` uses the LogTape category `sonamu.workflow.<normalized-name>`. The Sonamu UI
Tasks view reads registered definitions, workflow runs, and step attempts, and exposes
cancel/pause/resume actions. There is no separate public workflow-event callback API.

## Enqueue manually

The exported `workflow()` value is metadata, not a runnable handle. Enqueue by exact name and
version through the initialized manager:

```typescript
import { Sonamu } from "sonamu";

const handle = await Sonamu.workflows.run(
  { name: "rebuild-search-index", version: "v1" },
  { index: "products" },
);

const result = await handle.result();
```

The manager's run path supplies neither the registered schema nor standalone run options. Manual
and scheduled Sonamu enqueues therefore do not run the workflow schema validator, cannot set a
deadline, and do not publish a wake notification; polling workers still claim them. Validate
untrusted manual input before enqueueing.

## Cron schedules are process-local

Sonamu adds cron scheduling around the queue:

```typescript
export const nightlyCleanup = workflow(
  {
    name: "nightly-cleanup",
    schema: z.object({ requestedAt: z.string() }),
    schedules: [
      {
        name: "nightly-cleanup-utc",
        expression: "0 3 * * *",
        input: () => ({ requestedAt: new Date().toISOString() }),
      },
    ],
  },
  async ({ input, step }) => {
    await step.define({ name: "cleanup" }, () => cleanup(input.requestedAt)).run();
  },
);
```

Schedule input may be a value, promise, function, or async function. The timezone comes from
`api.timezone`. Schedules are created only in a process with a configured worker, use in-memory
`node-cron`, and allow overlapping callbacks. They are not persisted or leader-elected: every
worker-enabled process registers the same schedules and can enqueue the same occurrence. Running a
single scheduler process, or deduplicating the scheduled effect in application storage, is an
operational choice when one enqueue per occurrence is required.
