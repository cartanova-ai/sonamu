---
name: sonamu-testing-devrunner
description: DevRunner (sonamu test) execution and test environment configuration. sonamu test execution errors, HMR integration, Naite trace CLI, parallel testing, vitest.config.ts/sonamu.config.ts setup. Use when 'sonamu test' fails, configuring DevRunner, or setting up parallel testing.
---

# DevRunner and Test Configuration

## Running Tests

**Principle: Use `pnpm sonamu test` during development.** Assume the dev server is always running. If the dev server is down, start it first with `pnpm sonamu dev`, then run tests. Use `pnpm test` only in CI environments.

```bash
# Check dev server (start if it's down)
pnpm sonamu dev

# Tests during development (default)
pnpm sonamu test
pnpm sonamu test user.model
pnpm sonamu test user.model -p "findMany"

# CI environments only
pnpm test
```

---

## DevRunner — `sonamu test` (Default Test Execution Method)

`sonamu test` runs tests through a Vitest Node API instance that resides inside the `sonamu dev` process. Instead of starting Vitest fresh each time, it reuses an already-initialized instance, making execution 3.2x faster, and it integrates with HMR so tests always run against the latest code immediately after source changes.

### Prerequisites

**1. Enable devRunner in sonamu.config.ts:**

```typescript
export default defineConfig({
  test: {
    devRunner: {
      enabled: true,
      // routePrefix: "/__test__",   // optional, default value
      // vitestConfigPath: undefined, // optional, default: vitest.config.ts (relative to api-root)
    },
  },
});
```

Configuration type (`SonamuDevRunnerConfig`):

- `enabled: boolean` — Whether to enable DevRunner (default: false)
- `routePrefix?: string` — Test endpoint path prefix (default: `/__test__`)
- `vitestConfigPath?: string` — vitest.config.ts path (relative to api-root)

**2. Start the dev server:**

```bash
sonamu dev  # or pnpm dev
```

When the dev server starts, `DevVitestManager` is automatically initialized under the `isLocal() && devRunner.enabled` condition, and test endpoints are registered with Fastify.

### CLI Usage

```bash
# Run all tests
sonamu test

# Specify file (matched by partial filename — uses globTestSpecifications)
sonamu test user.model

# Multiple files
sonamu test user.model order.model

# Run specific test cases only (test name pattern)
sonamu test user.model --pattern "findMany"
sonamu test user.model -p "findMany"

# Print Naite traces
sonamu test user.model --traces
sonamu test user.model -t

# Combine file + pattern + trace
sonamu test user.model -p "findMany" -t
```

Argument processing rules:

- `--pattern` / `-p`: test name string filter (`setGlobalTestNamePattern` → `resetGlobalTestNamePattern` after execution)
- `--traces` / `-t`: boolean flag, enables Naite trace output
- Arguments not starting with `-`: treated as file list
- Multiple files allowed
- `ok: false` in server response is reflected as exit code 1

### Naite Trace Output

The `--traces` / `-t` flag lets you view `Naite.t(key, data)` records from test code in the CLI:

```
Tests: 5 passed, 0 failed, 5 total
Duration: 791ms

Traces:

  UserModel > BaseModel basic functionality check > Model.findMany() with num = 0
  user.model.test.ts

    [esq-query] user.model.ts:113
    select "users"."id" as "id", ...

    [puri:executed-query] puri.ts:1349
    select COUNT(*)::integer as "total" from "users" limit 1
```

Without the `--traces` flag, traces are not printed. The API response (`POST /__test__/run`) always includes a `traces` field, so external tools can make use of it.

For trace data details: see `naite.md`

### HMR Integration — Automatic Vitest Module Graph Invalidation on Source Changes

When a source file is modified, `hmrAndSync` in the syncer triggers both of the following simultaneously:

1. Server HMR cache invalidation (`hot.invalidateFile`)
2. Vitest module graph invalidation (`Sonamu.devVitestManager.invalidateFiles([filePath])`)

```
Modify user.model.ts → save
Server log: "Test invalidated: src/application/user/user.model.ts"
sonamu test user.model  ← runs with latest code
```

Because Vite's `moduleGraph.invalidateModule()` recursively cascades in the importer direction, invalidating a single source file automatically invalidates any test files that import it. No restart is needed.

**Transitive dependency example:**

- Change `utils.ts` → `user.model.ts` (imports utils) → `user.model.test.ts` all automatically invalidated

### Direct HTTP API Calls

You can call the HTTP API directly instead of using the CLI:

```bash
# Run tests
curl -X POST http://localhost:3000/__test__/run \
  -H "Content-Type: application/json" \
  -d '{"files": ["user.model"], "pattern": "findMany"}'

# Check status
curl http://localhost:3000/__test__/status
```

**POST `/__test__/run`** request:

```json
{ "files": ["src/user/user.model.test.ts"], "pattern": "should create user" }
```

Response (success):

```json
{
  "ok": true,
  "summary": { "total": 12, "passed": 11, "failed": 1, "skipped": 0, "durationMs": 842 },
  "failed": [
    {
      "file": "src/user/user.model.test.ts",
      "name": "UserModel > should create user",
      "error": "Expected ..."
    }
  ],
  "traces": [
    {
      "testName": "UserModel > should create user",
      "file": "src/user/user.model.test.ts",
      "traces": [
        {
          "key": "esq-query",
          "value": "select ...",
          "filePath": "user.model.ts",
          "lineNumber": 113,
          "at": "2026-02-23T14:51:35+09:00"
        }
      ]
    }
  ]
}
```

**GET `/__test__/status`** response:

```json
{ "ready": true, "running": false, "lastRunAt": "2026-02-13T12:34:56.000Z" }
```

### Internal Architecture

**DevVitestManager** (`testing/dev-vitest-manager.ts`):

- Creates a resident instance with `createVitest('test', cliOptions, viteOverrides)`
- Configured with `watch: true, standalone: true`, but blocks automatic re-runs:
  - `forceRerunTriggers: []`
  - `server.watch: null` (chokidar not created)
  - `onFilterWatchedSpecification(() => false)`
- Explicitly sets `env: { NODE_ENV: "test" }` so worker processes use the test DB
- **Queue-based sequential execution**: prevents result mixing on concurrent requests, processes in order and responds to each
- **Result aggregation**: filters only the modules requested for execution using `specModuleIds` (works around the issue where `testModules` includes all modules in standalone mode)
- Keeps loading the project's `vitest.config.ts` (reuses existing sequencer/reporter/globalSetup)

**Fastify integration** (`testing/dev-test-routes.ts`):

- Registers routes with `registerDevTestRoutes(server, config)`
- Stores manager instance in `Sonamu.devVitestManager`
- Ensures `shutdown()` is called in `server.addHook('onClose')`

**CLI** (`bin/test-command.ts`):

- Calls `testCommand()` directly before `tsicli` matching (to handle variadic arguments)
- Included in `bootstrap()`'s `notToInit` list (no need for `Sonamu.init` since it only makes HTTP calls)
- Server port/host read from `server.listen` in `sonamu.config.ts`

### Performance Comparison (miomock baseline)

Single file (`user.model.test.ts`):

| Item                            | `vitest run` | `sonamu test` | Difference  |
| ------------------------------- | ------------ | ------------- | ----------- |
| Test execution time             | 2,610ms      | 823ms         | 3.2x faster |
| Total elapsed time (wall clock) | 4,118ms      | 1,907ms       | 2.2x faster |

Multiple files (puri tests, 4 files 147 tests):

| Item                            | `vitest run` | `sonamu test` | Difference  |
| ------------------------------- | ------------ | ------------- | ----------- |
| Test execution time             | 5,740ms      | 1,774ms       | 3.2x faster |
| Total elapsed time (wall clock) | 7,035ms      | 2,673ms       | 2.6x faster |

Speed difference reason: `vitest run` requires process boot (~1.5s) + module transform (~400ms) on every execution, whereas `sonamu test` reuses an already-initialized instance and avoids this overhead.

### `pnpm sonamu test` vs `pnpm test` Comparison

|                     | `pnpm sonamu test` (default)                  | `pnpm test` (CI/fallback)   |
| ------------------- | --------------------------------------------- | --------------------------- |
| Execution method    | Resident instance inside dev server           | Independent Vitest process  |
| Initialization cost | None (already initialized)                    | Initialization on every run |
| HMR integration     | Source changes reflected immediately          | Not applicable              |
| Naite trace         | CLI output via `--traces` flag                | Available through reporter  |
| Use case            | **Default test execution during development** | CI environments             |
| Prerequisite        | `sonamu dev` running (assumed always running) | None                        |

### Troubleshooting

**"Cannot connect to dev server"**
→ Check that `sonamu dev` is running. The CLI sends HTTP requests to `config.server.listen.port`.

**"devRunner is not enabled" (or 404 response)**
→ `test.devRunner.enabled: true` must be set in `sonamu.config.ts`. DevRunner is only activated in `isLocal()` environments.

**"Vitest instance is not ready yet" (500 response)**
→ Request was made before Vitest initialization completed immediately after dev server startup. Check `GET /__test__/status` for `ready: true` before running.

**Tests running against old code**
→ After saving a source file, check whether a `"Test invalidated: ..."` log appears. If not, verify that `devRunner.enabled` is `true` and that the syncer is working correctly.

---

## Complete Map of Test-Related Settings in sonamu.config.ts

Both `pnpm sonamu test` (DevRunner, default) and `pnpm test` (direct Vitest execution, CI) reference settings from `sonamu.config.ts`.

### Configuration Type Definition (SonamuTestConfig)

```typescript
// config.ts
export type SonamuTestConfig = {
  /** Enable parallel testing (default: false) */
  parallel?: boolean;
  /** Number of parallel execution workers (default: 4) */
  maxWorkers?: number;
  /** Resident Vitest instance settings inside dev server */
  devRunner?: SonamuDevRunnerConfig;
};

export type SonamuDevRunnerConfig = {
  /** Whether to enable DevRunner (default: false) */
  enabled: boolean;
  /** Test endpoint path prefix (default: /__test__) */
  routePrefix?: string;
  /** vitest.config.ts path (relative to api-root) */
  vitestConfigPath?: string;
};
```

### Parallel Test Configuration (Optional)

Both `pnpm sonamu test` and `pnpm test` share the parallel configuration. Only configure this if parallel execution is needed:

```typescript
export default defineConfig({
  test: {
    parallel: true, // Separate DB execution per worker
    maxWorkers: 4, // Number of workers (default: 4)
  },
});
```

When `parallel: true`, `getSonamuTestConfig()` (vitest-helpers.ts) injects `pool: "forks"`, `maxWorkers`, and `env: { SONAMU_WORKER_DB: "true" }` into vitest, and `globalSetup` (global-setup.ts) creates DBs `{database.name}_test_1` through `{database.name}_test_{maxWorkers}` by cloning from the template (`{database.name}_test`).

### DevRunner Configuration (Required)

To use `pnpm sonamu test`, DevRunner must be enabled. Just add `test.devRunner.enabled: true`:

```typescript
export default defineConfig({
  server: {
    listen: {
      port: 3000, // CLI sends HTTP requests to this port
      host: "localhost", // CLI connects to this host (default: localhost)
    },
  },

  test: {
    devRunner: {
      enabled: true, // Required: enable DevRunner
      // routePrefix: "/__test__",       // Optional: endpoint path (default value)
      // vitestConfigPath: undefined,     // Optional: vitest.config.ts path (default: vitest.config.ts in api-root)
    },
    // parallel: true,                   // Optional: independent of DevRunner
    // maxWorkers: 4,                    // Optional: when using parallel
  },
});
```

### Source Code Reference Locations per Setting

| Setting path                      | Default       | Reference location                              | Purpose                                            |
| --------------------------------- | ------------- | ----------------------------------------------- | -------------------------------------------------- |
| `test.devRunner.enabled`          | `false`       | `sonamu.ts` L394, `test-command.ts`             | DevRunner activation condition                     |
| `test.devRunner.routePrefix`      | `"/__test__"` | `dev-test-routes.ts`, `test-command.ts`         | HTTP endpoint path                                 |
| `test.devRunner.vitestConfigPath` | `undefined`   | `dev-vitest-manager.ts` `start()`               | Vitest config file location                        |
| `test.parallel`                   | `false`       | `vitest-helpers.ts` `getSonamuTestConfig()`     | `pool: "forks"` + `SONAMU_WORKER_DB` env injection |
| `test.maxWorkers`                 | `4`           | `vitest-helpers.ts`, `global-setup.ts`          | Vitest maxWorkers + number of worker DBs           |
| `server.listen.port`              | `3000`        | `test-command.ts`                               | CLI → dev server HTTP connection port              |
| `server.listen.host`              | `"localhost"` | `test-command.ts`                               | CLI → dev server HTTP connection host              |
| `database.name`                   | —             | `db.ts` `generateDBConfig()`, `global-setup.ts` | Test DB name (`{name}_test`)                       |

### Activation Conditions

DevRunner is registered in `sonamu.ts` under the condition `isLocal() && config.test?.devRunner?.enabled`. `isLocal()` returns true when `NODE_ENV` is `development` or `test` (`controller.ts`). It works in local development and test environments and is disabled in staging/production environments.

### Parallel Test DB Flow

DB flow when `test.parallel: true` is set:

1. **globalSetup** (`global-setup.ts`): Clones `{database.name}_test_1` through `_test_{maxWorkers}` from `{database.name}_test` as template
2. **getSonamuTestConfig** (`vitest-helpers.ts`): Injects `env: { SONAMU_WORKER_DB: "true" }` into vitest
3. **DB.getDB** (`db.ts`): When `SONAMU_WORKER_DB=true`, selects worker-specific DB using `VITEST_POOL_ID` environment variable (`{database.name}_test_{workerId}`)
4. **globalTeardown**: Deletes all worker DBs

When `test.parallel: false` (default), all tests run sequentially on the single `{database.name}_test` DB.

---

## Configuration Files

### vitest.config.ts

```typescript
import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  test: await getSonamuTestConfig({
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
  }),
}));
```

### global.ts

```typescript
import dotenv from "dotenv";
dotenv.config();
export { setup } from "sonamu/test";
```

### sonamu.config.ts (test configuration)

```typescript
export default defineConfig({
  test: {
    parallel: true, // Enable parallel testing
    maxWorkers: 4, // Number of workers (default: 4)
    devRunner: {
      enabled: true, // Enable DevRunner
    },
  },
});
```

---

## References

- **Test writing guide**: `testing.md`
- **Naite tracing system**: `naite.md`
- **Fixture CLI**: `fixture-cli.md`
