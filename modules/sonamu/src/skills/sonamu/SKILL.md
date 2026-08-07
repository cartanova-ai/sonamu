---
name: sonamu
description: Routes Sonamu work to the right skill and states how these skills relate to a project's own rules. Use when starting work in a Sonamu project, or when no specific Sonamu skill obviously covers the problem. Covers the skill index, the packages/api command path, and sonamu sync for regenerating stale generated output.
---

# Sonamu

Sonamu is a TypeScript full-stack framework. Work is split across focused skills — find yours
below and invoke it rather than working from memory.

Where a Sonamu skill and the project's `AGENTS.md` disagree, `AGENTS.md` wins.

## Skill index

<!-- SKILL-INDEX:START -->

| Situation | Skill |
| --- | --- |
| implementing an agent class, defining its tools, or managing per-request agent state | `sonamu-ai-agents` |
| adding an endpoint, choosing httpMethod or clients options, implementing a file upload, streaming SSE events, opening a WebSocket channel, restricting an endpoint, or mapping a thrown error to a status or close code | `sonamu-api` |
| running auth generate, configuring server.auth, adding an auth plugin, reading user or session from the Context, typing a custom User field, or when sign-in fails or user is always null | `sonamu-auth` |
| editing .env, .env.<environment>, or sonamu.config.ts, wiring database, storage, cache, logging, or tasks options, starting the Docker DB, resolving a port conflict, or on an Invalid NODE_ENV, Missing Sonamu dotenv file, or removed database.name error | `sonamu-config` |
| creating or editing an entity.json, adding a prop or enum, wiring BelongsToOne/HasMany/ManyToMany/parentId, defining a subset or index, or resolving an entity.json validation or sync error | `sonamu-entity` |
| running fixture gen/fetch/explore, writing cone.note metadata, generating a row with its dependent child rows, syncing between the fixture, test, and development databases, or when a fixture fails on a foreign key or unique constraint | `sonamu-fixture` |
| calling a generated Service, wiring a TanStack Query hook, building a form or list view, or when a scaffolded view fails to compile | `sonamu-frontend` |
| registering labels for a new entity or enum, adding a language, or a UI string renders as a raw key | `sonamu-i18n` |
| a schema change needs a migration, a migration fails or conflicts, FK ordering breaks an apply, or a primary key type must change | `sonamu-migration` |
| a query or save produces the wrong result and the cause is unclear, or when a test needs to assert on internal state | `sonamu-naite` |
| implementing a Model CRUD method, writing a SELECT/WHERE/JOIN query, batch-saving relation data, or when a query returns unexpected rows or an excessively deep type error | `sonamu-query` |
| implementing a background job, scheduling recurring work, or building a multi-step process that must survive a restart | `sonamu-tasks` |
| authoring a Model or API test, asserting on query behaviour, mocking a dependency, or when sonamu test fails to run | `sonamu-testing` |
| generating embeddings, chunking documents, or combining vector similarity with full-text search | `sonamu-vector` |

<!-- SKILL-INDEX:END -->

## Command execution path

All `pnpm` commands are run from the `packages/api` directory.

```bash
cd packages/api
pnpm dev
pnpm sonamu sync
pnpm sonamu test
pnpm sonamu migrate run
```

## Regenerating Sonamu artifacts

Editing a truth source — `entity.json`, an API file, a `.types.ts` — leaves generated output
stale until a sync runs. Run it from `packages/api`:

```bash
pnpm sonamu sync          # regenerate what changed
pnpm sonamu sync --force  # full re-sync, ignores sonamu.lock
```

A running `pnpm dev` does the same thing automatically through its file watcher, so no separate
command is needed while it is up. That is a convenience, not a requirement — `sonamu sync` runs
the identical sync path on demand.

The standalone command reads the built config, `dist/sonamu.config.js`, so it needs the API package
built at least once. Without it:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../api/dist/sonamu.config.js'
```

Fix with `pnpm build` in `packages/api`. (`pnpm dev` sets `HOT=yes`, which switches the loader to
`src/sonamu.config.ts` — that is why the watcher path never needs a build.)
