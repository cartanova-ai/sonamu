---
name: sonamu
description: Routes Sonamu work to the right skill and carries the conventions that apply to every change. Use when starting work in a Sonamu project, or when no specific Sonamu skill obviously covers the problem. Covers the skill index, TypeScript type-safety rules, the tsc and pnpm check gate, and the packages/api command path.
---

# Sonamu

Sonamu is a TypeScript full-stack framework. Work is split across focused skills — find yours
below and invoke it rather than working from memory.

## Skill index

<!-- SKILL-INDEX:START -->

| Situation | Skill |
| --- | --- |
| implementing an agent class, defining its tools, or managing per-request agent state | `sonamu-ai-agents` |
| adding or changing an API endpoint, choosing httpMethod/guards/clients options, or implementing a file upload | `sonamu-api` |
| running auth generate, applying Guards to an endpoint, reading the session from Context, adding an auth plugin, or migrating User.id to a string primary key | `sonamu-auth` |
| editing .env or sonamu.config.ts, adjusting auth, guards, storage, cache, or logging options, starting the Docker database, or resolving a port conflict | `sonamu-config` |
| creating or editing an entity.json, adding a field or enum, wiring BelongsToOne/HasMany/ManyToMany/parentId, defining a subset, or resolving a schema validation or sync error | `sonamu-entity` |
| running fixture gen/fetch/explore, writing cone.note metadata for LLM generation, syncing between the development, test, and fixture databases, or when a fixture fails on a foreign key or unique constraint | `sonamu-fixture` |
| calling a generated Service, wiring a TanStack Query hook, building a form or list view, or when a scaffolded view fails to compile | `sonamu-frontend` |
| registering labels for a new entity or enum, adding a language, or a UI string renders as a raw key | `sonamu-i18n` |
| a schema change needs a migration, a migration fails or conflicts, FK ordering breaks an apply, or a primary key type must change | `sonamu-migration` |
| a query or save produces the wrong result and the cause is unclear, or when a test needs to assert on internal state | `sonamu-naite` |
| implementing a Model CRUD method, writing a SELECT/WHERE/JOIN query, batch-saving relation data, or when a query returns unexpected rows or an excessively deep type error | `sonamu-query` |
| implementing a background job, scheduling recurring work, or building a multi-step process that must survive a restart | `sonamu-tasks` |
| authoring a Model or API test, asserting on query behaviour, mocking a dependency, or when sonamu test fails to run | `sonamu-testing` |
| generating embeddings, chunking documents, or combining vector similarity with full-text search | `sonamu-vector` |

<!-- SKILL-INDEX:END -->

Nothing matched? The problem is probably not Sonamu-specific — proceed normally.

---

## Conventions that apply to every change

These are not tied to one task, so no skill will surface them at the right moment. Copy them
into your project's own `AGENTS.md` if you want them enforced on every turn.

### TypeScript type safety

- `as any` and `as unknown as T` are strictly prohibited.
- Resolve type errors through correct type annotations, generic constraints, type narrowing, or
  interface extension.
- Do not use `as any` to work around "excessively deep" or similar TypeScript inference limits —
  find the correct access pattern instead (e.g. use `getPuri("r")` directly rather than casting
  the result).
- Chaining methods after `as any` bypasses all TypeScript signature checks and leads directly to
  runtime bugs.
- Non-null assertion (`!`) is prohibited. Use optional chaining (`?.`) or type guard filters
  instead.

### Code quality gate

After editing any `.ts` or `.tsx` file, run both before considering the task done:

1. `npx tsc --noEmit --skipLibCheck` — type errors
2. `pnpm check` — lint and format (oxlint + oxfmt)

Do not skip lint/format even when tsc passes. oxlint catches `noNonNullAssertion`, import order,
and other issues that tsc does not.

### Command execution path

All `pnpm` commands are run from the **`packages/api`** directory.

```bash
cd packages/api
pnpm dev
pnpm sonamu test
pnpm sonamu migrate run
```
