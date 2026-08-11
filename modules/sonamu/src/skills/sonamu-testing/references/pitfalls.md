# Pitfalls and Complex Scenarios

## Practical Notes (Common Pitfalls)

### 1. Fixture Data Preparation Required

`bootstrap` initializes Sonamu and opens per-test transactions; it does not migrate, seed, or sync
the test DB. `createFixtureLoader` only reads through the loader functions supplied by the project.

Check `package.json` before reproducing a failure. If it declares, for example,
`"pretest": "VITEST=true sonamu fixture sync"`, `pnpm test` runs that state-changing preparation
before Vitest. `pnpm exec vitest run` skips it. The generated API template has no `pretest`, so this
behavior is project-specific.

`fixture sync` drops and recreates the configured test DB from the fixture DB. Use the
`sonamu-fixture` skill before changing that workflow.

### 2. SaveParams Type Design (Partial)

A type error in a test is not evidence that every nullable/defaulted field should become partial.
Read the current entity-owned save schema and distinguish database nullability, optional input,
defaults, and relation FKs. Schema changes affect application callers and need their own validation.

### 3. Excluding Relation Fields on Update

A read subset can contain `department: { id, ... }` while save input accepts `department_id`.
Spreading the subset into `save()` can send a non-column object or fail parsing. Build the save input
from accepted fields or use an existing project conversion helper.

### 4. ubUpsert is an Upsert Operation

Do not assume a duplicate unique key must throw. Inspect the model's actual `save`/UpsertBuilder
conflict configuration and assert the resulting insert, update, or error contract. Skipping a test is
not a substitute for identifying which behavior is public.

### 5. testAs Usage

`testAs(user, title, fn)` declares a Vitest case with `Context.user` set. Calling it inside another
test attempts to declare a nested test at runtime and Vitest rejects it. There is no `testAs.each`.

### 6. Validating Model Queries with Naite

Naite only records in test mode with a context store. Use Sonamu's `test`/`testAs`, or wrap a raw
callback in `runWithMockContext`. `bootstrap` by itself does not provide the store.

### 7. Consider Multilingual Error Messages

Prefer a stable error class or code. When only localized text is public, assert the locale-aware
contract the caller receives rather than an English phrase copied from another project.

### 8. pnpm Workspace and Vitest Instance Conflicts

`Vitest failed to access its internal state` usually means the code imported a different Vitest
instance from the runner. Inspect dependency resolution and linked/workspace package boundaries; do
not fix it by changing assertions or DB setup.

### 9. assert() for Truthy Checks

An assertion is useful when the test requires a generated ID:

```typescript
const [id] = await UserModel.save([input]);
expect(id).toBeDefined();
if (id === undefined) throw new Error("사용자 ID가 생성되지 않았다");
```

Avoid `id ?? 0`: it hides the failed save behind a later not-found error.

### 10. Create Test Data Directly

Choose existing fixtures or transactional writes according to the behavior. Stable reference rows
fit `loadFixtures`; data whose exact values matter to this case can be created inside the test and is
rolled back. This is a project data choice, not a Sonamu requirement.

## Complex Entity Test Strategy

### Defining Test Helper Functions

Use a helper when it expresses a real dependency chain. Call it inside the test so ordinary model
writes share the test transaction. Do not hide fixture synchronization, external side effects, or a
separate Knex connection inside a helper that appears rollback-safe.

### Using in Tests

`beforeEach` registered after `bootstrap(vi)` runs after the bootstrap transaction hook and can write
inside that transaction. `beforeAll` runs before per-test transactions, so DB writes there persist
for the file/suite unless explicitly cleaned up. Put mutable case data in each test or a per-test
hook when rollback isolation matters.

### Subset → SaveParams Conversion Helper

A conversion helper is appropriate only when its relation-to-FK mapping matches the current subset
and save schema. Generic `relation -> relation_id` conversion is unsafe for custom joins, plural
relations, virtual props, and renamed fields.

### Simplifying Update Tests

Prefer an explicit minimal update object when the model accepts it. If the save schema requires a
full row, use a typed project helper and assert that nested relations are translated rather than
silently dropped.

### Notes

`bootstrap` owns one global `DB.testTransaction` per running test process/worker. Avoid Vitest
`test.concurrent` for DB-backed cases unless the project has separately proven that shared
transaction state is safe.

## Common Mistakes and Solutions

### ubUpsert Does Not Throw Unique Constraint Errors

Trace the configured conflict target and assert the actual upsert contract; do not generalize from
the helper name alone.

### Transaction Isolation and Test Isolation

In test mode, ordinary `DB.getDB("r")`/`DB.getDB("w")` and models built on them use the current test
transaction. Writes are immediately visible to reads in the same test and roll back in `afterEach`.

These paths bypass that rollback:

- concrete presets such as `DB.getDB("test")` or `DB.getDB("fixture")`;
- a separately created Knex/client connection;
- filesystem, queues, caches not disabled for testing, and external services;
- DB writes made in `beforeAll`, before the per-test transaction exists.

Parallel mode changes the base DB per worker to `<test_database>_<VITEST_POOL_ID>` before opening the
same per-test transaction. It does not make concurrent tests inside one worker safe.

### Conditional Validation for Sorting Tests

Do not weaken a sort assertion because baseline rows exist. Filter the result to the exact IDs
created for the test, assert both are present, then assert their order. A conditional assertion that
does nothing when data is missing can pass without testing sorting.

## Failure Diagnosis

Locate the stage before editing the test body:

| Symptom | Inspect first | What it proves |
| --- | --- | --- |
| package command fails before Vitest output | `pretest`, fixture-sync command, PostgreSQL tools/DNS | test modules may not have loaded |
| global setup timeout or clone error | template test DB, admin connection, worker count, active connections | worker DBs were not ready |
| `beforeAll` timeout | Sonamu config/env load and `Sonamu.init` | test body did not run |
| `beforeEach` timeout / pool error | `DB.createTestTransaction`, selected worker DB, pool availability | transaction was not acquired |
| assertion stack inside test | test context, fixture values, production call path | body did run |
| failure during `afterEach` | rollback and Naite result/serialization reporting | assertions may have run; cleanup/reporting failed |

### Parallel worker DB failures

With `test.parallel: true`, global setup terminates connections, drops existing worker DBs, and clones
`<test_database>_1...N` from the base test DB using PostgreSQL `STRATEGY FILE_COPY`. Failures here are
harness/setup failures, not test-body regressions. When parallel mode is false, Sonamu does not
disable Vitest file concurrency; files can contend on the shared test DB.

### Mock and module-cache failures

Parallel mode sets `isolate: false`. Within a worker, a dependency imported by an earlier file stays
cached; a later file's mock may not replace the already loaded module. Confirm which implementation
actually ran, move stable mocks into `setupFiles`, or redesign the seam before changing product
logic. Worker DB isolation and module isolation are separate settings.

### Context-only failures

The mock context uses null request/reply placeholders and throws if `createSSE` is called. Default
testing initialization does not create server-owned storage. If real HTTP response, SSE, or storage
code is reached, either provide a realistic context/initialize the dependency for that integration
test or mock the boundary before import.

### DevRunner failures

- `devRunner가 활성화되지 않았습니다...`: enable `test.devRunner.enabled` in the config used by
  the local dev server.
- `dev 서버에 연결할 수 없습니다...`: the CLI could not reach the configured host/port.
- `Vitest 인스턴스가 아직 준비되지 않았습니다`: inspect `pnpm sonamu test --status` and server
  startup/global setup.
- stale behavior after a source edit: verify the dev server observed and invalidated the changed
  module; fall back to a direct Vitest process to separate HMR state from test behavior.

## Fixture Data Creation Tips

See `sonamu-fixture` for generation, import/fetch, sequence reset, and synchronization behavior.
