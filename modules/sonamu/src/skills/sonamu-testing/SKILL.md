---
name: sonamu-testing
description: Configures and diagnoses Sonamu Vitest tests. Use when writing a Model or API test, setting up fixtures or mocks, running sonamu test, enabling parallel workers, or diagnosing startup, database, context, trace, or module-cache failures. Covers bootstrap, test, testAs, getSonamuTestConfig, createFixtureLoader, Naite, and DevRunner.
---

# Sonamu Test System

Sonamu's public test APIs are exported from `sonamu/test`. A normal test file combines
`bootstrap(vi)` for framework and transaction hooks with Sonamu's `test` wrapper for request-like
context and Naite trace capture.

```typescript
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { UserModel } from "./user.model";

bootstrap(vi);

describe("UserModel", () => {
  test("사용자를 조회한다", async () => {
    const user = await UserModel.findById("A", 1);
    expect(user.id).toBe(1);
  });
});
```

## Reference Map

| Task | Read |
| --- | --- |
| Configure Vitest or add the first test | `references/quick-start.md` |
| Choose `test`, `testAs`, `test.each`, context, or mock placement | `references/patterns.md` |
| Load fixtures, inspect Naite traces, or use query/UB assertions | `references/helpers.md` |
| Diagnose startup, DB, fixture, mock-cache, context, or trace failures | `references/pitfalls.md` |
| Run DevRunner or configure worker databases | `references/devrunner.md` |
| Resolve test-only TypeScript errors | `references/type-safety.md` |
| Arrange a larger fixture-backed test pass by data dependency | `references/writing-plan.md` |

Fixture generation and the destructive `fixture sync` operation belong to the `sonamu-fixture`
skill. Detailed Naite key/query behavior belongs to `sonamu-naite`.

## Running Tests

Use the package's declared scripts as the source of truth. A generated API package has a `test`
script that runs `vitest run`; a project can add lifecycle scripts such as `pretest`, which package
managers run before `pnpm test` but a direct `pnpm exec vitest run` bypasses.

```bash
pnpm test                         # package script, including pretest when declared
pnpm exec vitest run path/to/test # direct Vitest, no package pretest
pnpm sonamu test user.model       # resident DevRunner, when enabled and running
pnpm sonamu test --status         # inspect DevRunner readiness
```

`sonamu test` is an HTTP client for the resident Vitest instance in a local `sonamu dev` process.
It is optional; it does not replace the package's direct Vitest command. See
`references/devrunner.md` for its flags and activation conditions.

## What a Model test needs in place

- `vitest.config.ts` calls `getSonamuTestConfig(...)` and registers the exported global setup.
- `bootstrap(vi)` is called once at test-module scope before test declarations.
- Tests that need Sonamu context or Naite use `test`/`testAs`, or explicitly call
  `runWithMockContext`/`runWithContext`.
- The test database already has the schema and fixture baseline the test expects. Neither
  `bootstrap` nor `createFixtureLoader` migrates or synchronizes it.
- Mocks that must win before a dependency is imported live in Vitest `setupFiles` or are hoisted at
  the top of the test module.

## Core Test Writing Principles

### 1. Verify Actual Structure First

Read the entity's generated subset and project-owned `SaveParams` before constructing data.
Relation objects exposed by a subset are not automatically valid save fields, and enum values
should come from the generated enum rather than a guessed string.

### 2. Understanding Subset Structure

A subset is a read projection. Nested relation fields such as `company.id` appear as relation
objects in the result; that does not imply that `company` or a direct `company_id` is present in
every subset or accepted by the save schema. Assert and persist the fields actually declared by the
current generated mapping.

### 3. Handling DECIMAL Types

PostgreSQL `numeric`/`decimal` values can reach a model as strings unless the project casts them.
Assert the public model result: use the exact string when formatting is part of the contract, or
convert with `Number(...)` when the behavior is explicitly numeric. Do not make snapshots accept
both shapes without tracing which layer owns the conversion.

### 4. Know which isolation you are using

`bootstrap` opens one transaction before each test and rolls it back afterward. In test mode,
ordinary `"r"`/`"w"` model access uses that transaction, so writes are immediately visible inside
the same test and are removed afterward. Explicit concrete presets such as `DB.getDB("test")`, a
separate Knex instance, external services, and filesystem writes are outside that rollback.

Parallel mode adds database isolation between Vitest workers; it does not add module isolation.
Sonamu configures `isolate: false`, so imports remain cached within a worker and late per-file mocks
can lose to an earlier import.

### 5. Distinguish fixtures from fixture synchronization

`createFixtureLoader` only runs the supplied loader functions concurrently and returns a typed
object. It does not insert data or run `fixture sync`. If a package uses fixture synchronization in
`pretest`, reproduce the package script when validating that path; direct Vitest is a different
preparation path.

## Rules

- Import Sonamu testing APIs from `sonamu/test`; import `Naite` and production APIs from `sonamu`.
- Call `bootstrap(vi)` at module scope in DB-backed Sonamu test files.
- Use `testAs(user, title, fn)` as a test declaration, not from inside another test.
- `test.each` is Vitest's bound implementation and does not install Sonamu context; wrap the body
  explicitly for context or in-callback Naite assertions. That does not attach traces to Vitest task
  metadata; use `test`/`testAs` when DevRunner `--traces` output is required. There is no
  `testAs.each`.
- Treat `expectQuery` and `expectUB` as optional project-local helpers, not `sonamu/test` exports.
- Report a fixture/global-setup/transaction bootstrap failure separately from a failing test body.
- A passing typecheck, build, or root check is static evidence, not proof that DB-backed tests ran.
