---
name: sonamu
description: Entry point for any work in a Sonamu project. Routes to the specific Sonamu skill for the task at hand, and carries the conventions that apply to every change. Use at the start of Sonamu work, or whenever it is unclear which Sonamu skill covers the problem.
---

# Sonamu

Sonamu is a TypeScript full-stack framework. Work is split across focused skills — find yours
below and invoke it rather than working from memory.

## Skill index

<!-- SKILL-INDEX:START -->

| Situation | Skill |
| --- | --- |
| building AI agents with tool-use capabilities | `sonamu-ai-agents` |
| exposing Model methods as API endpoints | `sonamu-api` |
| setting up authentication or implementing auth-related features | `sonamu-auth` |
| editing .env or sonamu.config.ts, setting up auth/guards/storage/cache/logging options, starting the Docker DB, resolving port conflicts, or managing the 3-tier development/test/fixture databases | `sonamu-config` |
| creating or editing entity.json, choosing field types, setting up BelongsToOne/HasMany/ManyToMany/parentId relationships, defining subsets, or resolving entity schema validation and sync errors | `sonamu-entity` |
| running fixture gen/fetch/explore, writing cone.note metadata for LLM-based generation, resolving fixture FK or unique-constraint failures, or syncing between the development, test, and fixture databases | `sonamu-fixture` |
| calling generated Services, wiring TanStack Query hooks, building forms with useTypeForm, list views with useListParams, Sonamu UI components, or fixing scaffolding errors in generated views | `sonamu-frontend` |
| implementing internationalization | `sonamu-i18n` |
| creating a new Sonamu project or wiring one to a local Sonamu checkout | `sonamu-init` |
| modifying database schema | `sonamu-migration` |
| tracing/debugging Model internals, verifying queries, or inspecting UpsertBuilder behavior | `sonamu-naite` |
| implementing Model CRUD methods, writing Puri SELECT/WHERE/JOIN queries, running full-text or pgvector search, batch-saving relation data with UpsertBuilder, or when a query returns unexpected results | `sonamu-query` |
| implementing background workflows, scheduled tasks, or multi-step async processes | `sonamu-tasks` |
| authoring Model/API test files, calling bootstrap/test/testAs, asserting with Naite.get or expectQuery/expectUB, mocking, or running `sonamu test` | `sonamu-testing` |
| implementing vector search, semantic search, or text embedding features | `sonamu-vector` |

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
