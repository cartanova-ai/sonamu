# Recording, Context, and Storage

## When `Naite.t()` records

All of these must be true for a record to persist:

1. `process.env.NODE_ENV` is exactly `"test"`.
2. `Sonamu.getContext()` resolves to the active async-local context.
3. That context has a `naiteStore`.

`Naite.t(name, value)` catches failures and returns `void`, so a missing context or store does not
fail the code under test. Outside the test environment it returns before resolving a context.

The `test` and `testAs` exports from `sonamu/test` run each callback inside a fresh mock context
whose `naiteStore` is created with `Naite.createStore()`. `bootstrap(vi)` initializes Sonamu and
the database hooks, but does not itself install the per-test async-local context. Use the Sonamu
test wrappers when production instrumentation must be visible to the assertion:

```typescript
import { Naite } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { expect, vi } from "vitest";

bootstrap(vi);

test("같은 테스트 컨텍스트의 기록을 조회한다", async () => {
  await runInstrumentedCode();
  expect(Naite.get("job:complete").last()).toEqual({ count: 2 });
});
```

In test mode, `Sonamu.getContext()` called without an active async-local context creates a new empty
fallback context on each call. A `Naite.t()` made there is therefore not visible to a later
`Naite.get()`. For custom execution, keep both operations inside `runWithMockContext()` or a single
`runWithContext()` callback from `sonamu/test`.

`test.each` currently delegates directly to Vitest instead of the Sonamu context wrapper. Put traced
work inside `runWithMockContext()` when a parameterized test needs Naite records.

## Context ownership

HTTP, WebSocket, and workflow contexts each receive their own in-memory `naiteStore`. A custom
`contextProvider`, `websocketContextProvider`, or task `contextProvider` receives the default store;
preserve it in the returned context. Recording in one context is not visible from another.

The store is a `Map<string, NaiteTrace[]>`. Repeated names append in call order. Naite stores the
original value reference rather than a clone, so mutating an object after `Naite.t()` also changes
what `result()`, `first()`, and `last()` later return. Clone a value before recording when the
assertion needs a point-in-time snapshot.

## Store operations

```typescript
Naite.t("worker:state", { state: "queued" });
Naite.t("worker:state", { state: "done" });

Naite.get("worker:state").result(); // [{ state: "queued" }, { state: "done" }]
Naite.del("worker:state"); // deletes that exact key and all of its records
```

`del()` does not interpret wildcards. There is no public clear-all operation. A new Sonamu test
context starts with a new store, so ordinary `test` and `testAs` callbacks do not need cleanup.

`Naite.get()`, `getAll()`, `getAllTraces()`, and `del()` resolve the current context without the
test-only early return used by `t()`. With no context outside test mode, they propagate
`Sonamu cannot find context`. Inside a non-test request they can read the request store, but
`Naite.t()` has recorded nothing because recording is disabled.
