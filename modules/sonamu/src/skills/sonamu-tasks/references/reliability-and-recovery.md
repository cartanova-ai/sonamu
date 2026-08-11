# Reliability and Recovery

## Steps are replay checkpoints

`step.run({ name }, fn)` records a function attempt and its JSON output. When a workflow is claimed
again, the handler starts from the top; a previously completed step with the same name returns its
stored output without calling `fn`. Failed and unfinished function steps execute again.

Choose names that are stable and unique within one workflow run. Reusing a completed name returns
the earlier output even if the new closure or arguments differ. A code change that renames or
reorders checkpoints changes replay behavior for existing runs.

```typescript
const customer = await step.run({ name: "load-customer" }, () => loadCustomer(input.customerId));
const receipt = await step.run({ name: "charge-card" }, () => chargeCard(customer));
```

The database checkpoint follows the function. If `chargeCard()` succeeds but the process loses its
lease or crashes before completion is saved, recovery can charge again. Use the downstream system's
idempotency key or an application-owned unique record for non-repeatable effects. Step caching is a
replay optimization, not an exactly-once guarantee.

`step.sleep(name, duration)` creates a persisted sleep attempt and releases the worker slot. A later
claim replays the handler, completes the sleep after its stored resume time, and reuses prior
completed steps. Duration strings accept numeric values (milliseconds when unitless) and
millisecond, second, minute, hour, day, week, month, or year units such as `"250ms"`, `"30m"`, and
`"2 days"`.

## Retry policy

An uncaught handler or step error fails the current attempt. The default static policy has
`maxAttempts: 5`: an error is terminal when the persisted attempt count reaches five; earlier
failures schedule exponential delays of 1, 2, 4, and 8 seconds. The delay is capped at 60 seconds
when a larger attempt limit permits later retries. Override the stored policy on the workflow
specification:

```typescript
retryPolicy: {
  maxAttempts: 8,
  initialIntervalMs: 2_000,
  backoffCoefficient: 2,
  maximumIntervalMs: 30_000,
}
```

`maxAttempts` is compared with the persisted workflow `attempts` counter. That counter increments
on every claim, including a lease reclaim or wake-up after `step.sleep`; it is not exclusively a
count of failures. A workflow with several sleeps can therefore reach the limit before its first
error.

A dynamic policy runs on the worker with the serialized error and current attempt count:

```typescript
retryPolicy: {
  maxAttempts: 5,
  shouldRetry: (error, attempt) => ({
    shouldRetry: error.message !== "invalid-input",
    delayMs: attempt * 2_000,
  }),
}
```

Returning `shouldRetry: false` makes the failure terminal. A true decision uses a positive
`delayMs`; the current PostgreSQL backend treats `0` as unset and falls back to default exponential
backoff. The function itself is not serialized into the run, so every worker must register the same
workflow code. Only the maximum-attempt marker is stored for a dynamic policy.

## Claiming, leases, and crash recovery

Workers claim eligible rows transactionally with row locks and `SKIP LOCKED`. Pending runs are
preferred over expired running or sleeping runs. The standalone worker assigns a fixed 30-second
lease and extends it every 15 seconds; these durations are not public worker options.

If heartbeat extension fails, the worker aborts at a safe execution boundary without recording a
workflow failure. After the lease timestamp passes, another worker can reclaim the run. Reclaiming
an expired running workflow marks its unfinished function attempts failed with
`Workflow run lease expired`; completed checkpoints remain reusable. A long-running function is not
preempted by `AbortSignal`, so external effects may overlap with the new owner, but worker-id and
status checks reject the stale owner's later checkpoint writes.

Recovery therefore requires all of the following operational conditions:

- another worker is running against the same database and namespace;
- the exact workflow name and version is registered there;
- the database remains available long enough to reclaim the expired lease;
- side effects that can happen before checkpoint persistence are independently idempotent.

## Deadlines and idempotency boundaries

`deadlineAt` is not a JavaScript execution timeout. During a claim, the backend marks expired
pending, running, or sleeping rows failed with `Workflow run deadline exceeded` and excludes them
from claiming. When an error schedules a retry, the backend also fails the run if its next retry time
would reach or pass the deadline. It does not stop a currently executing function at the deadline;
use a timeout or abort facility in the called library when the operation itself needs a time limit.

The schema contains an `idempotency_key` column and a non-unique lookup index, but public
`OpenWorkflow` enqueue methods always write `null`. Even direct backend insertion merely stores a
key; it does not deduplicate or enforce uniqueness. Treat each enqueue as distinct unless the
application uses an application-owned unique record or transactional deduplication mechanism.
