# DevRunner and Test Configuration

## Running Tests

Choose the execution path that matches the target:

```bash
pnpm test
pnpm exec vitest run src/application/user/user.model.test.ts
pnpm sonamu test user.model
```

- the package script runs its `pretest` lifecycle when declared;
- direct Vitest skips package lifecycle preparation;
- `sonamu test` calls a resident Vitest instance in a running local dev server.

## DevRunner — Optional Resident `sonamu test` Runner

DevRunner is an optional development path. When `test.devRunner.enabled` is true and Sonamu is in a
local environment, `sonamu dev` starts a resident Vitest instance and registers HTTP routes. The CLI
only reads config and makes HTTP requests; it does not initialize Sonamu or start the server.

### Prerequisites

```typescript
export default defineConfig({
  test: {
    devRunner: {
      enabled: true,
      // routePrefix: "/__test__",
      // vitestConfigPath: "vitest.config.ts",
    },
  },
});
```

`routePrefix` defaults to `/__test__`. `vitestConfigPath`, when supplied, is passed to Vitest; the
normal project config is otherwise discovered. The CLI uses `server.listen.host`/`port` with
`localhost`/`3000` defaults.

### CLI Usage

```bash
pnpm sonamu test
pnpm sonamu test user.model order.model
pnpm sonamu test user.model --pattern "findMany"
pnpm sonamu test user.model -p "findMany"
pnpm sonamu test user.model --traces
pnpm sonamu test user.model -t
pnpm sonamu test --status
pnpm sonamu test -s
```

- positional arguments are forwarded as Vitest file filters;
- `--pattern`/`-p` sets a global test-name pattern for that run and resets it afterward;
- `--traces`/`-t` prints captured Naite traces;
- `--status`/`-s` queries readiness without running tests;
- a run with `ok: false` exits with status 1.

### Naite Trace Output

DevRunner prints only traces captured in each Vitest task's metadata. Sonamu `test`/`testAs` attach
those traces. `runWithMockContext`/`runWithContext` let a raw Vitest or Sonamu `test.each` callback
record and assert on Naite values inside that callback, but they do not copy those values to task
metadata, so `--traces` cannot print them. Trace values exported by `test`/`testAs` must survive JSON
serialization.

### HMR Integration — Automatic Vitest Module Graph Invalidation on Source Changes

When Sonamu's dev syncer observes a changed source file, it invalidates both the server HMR cache and
the resident Vitest module graph. Importers are invalidated transitively for the next requested run.
DevRunner disables Vitest's own automatic watch reruns; tests run only when requested.

If a change is stale, confirm the dev process observed the file. A direct `vitest run` provides a
fresh-process comparison and separates HMR invalidation from the assertion failure.

### Direct HTTP API Calls

The default routes are:

```text
POST /__test__/run
GET  /__test__/status
GET  /__test__/events   # only when the server SSE plugin is enabled
```

The run body accepts `{ "files": [...], "pattern": "..." }`. Status reports `ready`, `running`,
`lastRunAt`, and `sseAvailable`. Runs are queued and executed sequentially so concurrent HTTP
requests do not mix result state.

### Internal Architecture

The resident instance uses Vitest's Node API with `watch: true`, `standalone: true`, no automatic
watch filters, and `NODE_ENV: "test"`. It still loads the project's Vitest configuration, including
global setup, setup files, reporters, and sequencer.

### Performance Comparison (miomock baseline)

No fixed speed multiplier is part of the DevRunner contract. Reusing a process avoids repeated
Vitest startup and transform work, but project config, changed modules, worker DB setup, and test
selection determine the actual difference.

### `pnpm sonamu test` vs `pnpm test` Comparison

| Behavior | `pnpm sonamu test` | `pnpm test` |
| --- | --- | --- |
| Process | Resident instance in local dev server | Package-declared command, normally fresh Vitest |
| Package `pretest` | Not run by this CLI | Run when declared |
| Source freshness | Explicit HMR graph invalidation | Fresh process/import graph |
| Requirement | enabled, ready local DevRunner | package script and its dependencies |

### Troubleshooting

Use `pnpm sonamu test --status` first. A disabled route, unreachable server, not-ready Vitest
instance, global-setup failure, and failed test body are different stages; keep their evidence
separate.

## Complete Map of Test-Related Settings in sonamu.config.ts

```typescript
type SonamuTestConfig = {
  parallel?: boolean;
  maxWorkers?: number;
  devRunner?: {
    enabled: boolean;
    routePrefix?: string;
    vitestConfigPath?: string;
  };
};
```

### Configuration Type Definition (SonamuTestConfig)

`parallel` defaults to false. `maxWorkers` defaults to 4 when parallel mode is enabled. DevRunner
defaults to disabled because its object is absent unless the project config supplies it.

### Parallel Test Configuration (Optional)

```typescript
export default defineConfig({
  test: {
    parallel: true,
    maxWorkers: 4,
  },
});
```

`getSonamuTestConfig()` injects `pool: "forks"`, `maxWorkers`, `isolate: false`, and
`env.SONAMU_WORKER_DB = "true"`, then spreads the Vitest options passed by the project. A project
override of `pool`, `maxWorkers`, `isolate`, or the whole `env` object therefore replaces Sonamu's
value and can break the worker-DB assumptions.

### Configuration for `sonamu test`

The `devRunner` block is needed only when using `sonamu test`, not for direct Vitest. Routes are
registered only while the local Sonamu server is running.

### Source Code Reference Locations per Setting

Consumer code should rely on `sonamu/test` and `sonamu.config.ts`, not repository-internal paths. The
observable boundaries are `getSonamuTestConfig`, exported `setup`, `sonamu test`, and the configured
HTTP prefix.

### Activation Conditions

- Direct Vitest: project Vitest config is evaluated.
- Parallel worker DBs: `test.parallel` is true and the exported global setup is configured.
- DevRunner: local Sonamu server plus `test.devRunner.enabled: true`.

### Parallel Test DB Flow

1. `getSonamuTestConfig` selects fork workers and exposes `SONAMU_WORKER_DB=true`.
2. Exported global setup reads the test connection and treats its database as the template.
3. It terminates connections to the template/old worker DBs, drops old workers, and clones
   `<template>_1...N` with PostgreSQL `STRATEGY FILE_COPY`.
4. A Vitest worker selects `<template>_<VITEST_POOL_ID>` for ordinary `"r"`/`"w"` access.
5. `bootstrap` opens and rolls back a transaction on that worker DB for each test.
6. Global teardown terminates connections and drops the worker DBs.

This isolates workers at the database level. `isolate: false` deliberately shares the module cache
within each worker, so mock isolation is a separate concern.

## Configuration Files

### vitest.config.ts

Call `await getSonamuTestConfig({...})`, register `globalSetup`, and place import-sensitive mocks in
`setupFiles`. Include `NaiteVitestReporter` when the local Naite extension run lifecycle is wanted.

### global.ts

```typescript
export { setup } from "sonamu/test";
```

The export is required for Sonamu's worker-DB creation. Without it, parallel configuration can point
workers at database names that were never cloned.

### sonamu.config.ts (test configuration)

Keep parallel worker count and DevRunner settings here. Vitest-specific include/exclude, reporters,
setup files, and timeouts remain in `vitest.config.ts`.

## References

- `quick-start.md` — config/import/hook order
- `patterns.md` — wrappers, context, and module-cache-safe mocks
- `pitfalls.md` — stage-based failure diagnosis
