# Workflows and Run Handles

`tasks` below is an initialized `OpenWorkflow`; create it as shown in
`standalone-runtime.md`.

## Define and register on a worker

`OpenWorkflow.defineWorkflow()` combines a specification and implementation, registers the exact
`name` plus `version`, and returns a runnable workflow:

```typescript
import { z } from "zod";

const resizeImage = tasks.defineWorkflow(
  {
    name: "resize-image",
    version: "v1",
    schema: z.object({ source: z.url() }),
    retryPolicy: { maxAttempts: 5 },
  },
  async ({ input, step, version }) => {
    return await step.run({ name: "resize" }, () => resize(input.source, version));
  },
);
```

`version` is optional; omitted versions are stored and registered as `null`. Registration is local
to one `OpenWorkflow` instance. A duplicate `name`/`version` pair throws, while the same name with a
different version is allowed. `unregisterWorkflow()` only removes the local implementation; it does
not remove queued or historical runs.

For separate producer and worker modules, share a public `declareWorkflow()` specification. A
producer can enqueue it without registering an implementation, and every worker that may claim it
must call `implementWorkflow()` with the same name and version.

```typescript
import { declareWorkflow } from "@sonamu-kit/tasks";

export const resizeImageSpec = declareWorkflow<
  { source: string },
  { location: string }
>({
  name: "resize-image",
  version: "v1",
});

await tasks.runWorkflow(resizeImageSpec, input);

tasks.implementWorkflow(resizeImageSpec, async ({ input, step }) => {
  return await step.run({ name: "resize" }, () => resize(input));
});
```

A worker that claims a run without the matching registration records
`Workflow "<name>" (version: <version>) is not registered` and applies the run's retry policy. Keep
old implementations registered until no queued or sleeping run still targets that version.

## Input and output

A workflow specification can use any Standard Schema v1 implementation, including Zod. Enqueueing
validates before inserting the run and stores the schema's transformed output, not necessarily the
raw input. Without a schema, input passes through unchanged.

```typescript
import { z } from "zod";

const importRows = tasks.defineWorkflow(
  {
    name: "import-rows",
    schema: z.object({ source: z.url(), limit: z.coerce.number().int().positive() }),
  },
  async ({ input }) => ({ accepted: input.limit }),
);

const handle = await importRows.run({ source: "https://example.com/data", limit: "10" });
```

The public workflow, input, output, and step generics are unconstrained, so TypeScript does not
enforce JSON-compatible values. Persistence still writes input and results to JSONB, where values
can be rejected or transformed instead of round-tripping unchanged. A top-level `undefined` input,
step result, or workflow result becomes `null`. Step and workflow results are passed through
`JSON.stringify`; cyclic objects and `bigint` make that call throw, so the execution enters retry
handling.

## Enqueue and await

Use either `runnable.run(input, options)` or `tasks.runWorkflow(spec, input, options)`. Both insert a
new pending run and return a handle. The supported options are:

- `deadlineAt`: queue deadline semantics described in `reliability-and-recovery.md`.
- `publishToChannel`: publish a PostgreSQL wake notification only when explicitly `true`.

Every call creates a new run. The public methods always store `idempotencyKey: null`; see the
idempotency boundary in `reliability-and-recovery.md`.

`handle.workflowRun` is the insertion-time snapshot. `handle.result()` polls current state every
second, returns the stored output for `completed`, and throws for `failed` or `canceled`. Its fixed
five-minute timeout only stops that caller from waiting: it does not cancel, pause, fail, or time out
the workflow. Call `result()` again or inspect the backend to observe a longer run.

## Cancel, pause, and resume

The handle delegates state changes to PostgreSQL:

| Call | Accepted current states | Result |
| --- | --- | --- |
| `cancel()` | `pending`, `running`, `sleeping`, `paused` | `canceled`, terminal; a repeated cancel is idempotent |
| `pause()` | `pending`, `running`, `sleeping` | `paused`; a repeated pause is idempotent |
| `resume()` | `paused` | `pending` and immediately claimable; `pending`/`running` are returned unchanged |

Completed, failed, or canceled runs reject unsupported transitions. Canceling or pausing a running
workflow changes durable ownership; it does not synchronously interrupt arbitrary user code. The
next step boundary or lease heartbeat prevents the stale worker from committing further progress,
but an in-flight external call can continue until that function returns.
