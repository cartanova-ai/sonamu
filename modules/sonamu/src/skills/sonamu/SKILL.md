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
| implementing an agent class, decorating tools, invoking an agent, or carrying state through tool execution | `sonamu-ai-agents` |
| adding an endpoint, choosing httpMethod or clients options, implementing a file upload, streaming SSE events, opening a WebSocket channel, restricting an endpoint, or mapping a thrown error to a status or close code | `sonamu-api` |
| running auth generate, configuring server.auth, adding an auth plugin, reading user or session from the Context, typing a custom User field, or when sign-in fails or user is always null | `sonamu-auth` |
| editing .env, .env.<environment>, or sonamu.config.ts, wiring database, storage, cache, logging, or tasks options, starting the Docker DB, resolving a port conflict, or on an Invalid NODE_ENV, Missing Sonamu dotenv file, or removed database.name error | `sonamu-config` |
| creating or editing an entity.json, adding a prop or enum, wiring BelongsToOne/HasMany/ManyToMany/parentId, defining a subset or index, or resolving an entity.json validation or sync error | `sonamu-entity` |
| running fixture gen/fetch/explore/sync/init/import, writing cone.note or fixtureCompanions metadata, seeding sign-in-capable users, or when generated data is unrealistic, a relation fails with "데이터가 없습니다", or fixture rows land in the wrong database | `sonamu-fixture` |
| consuming services.generated.ts, wiring generated TanStack Query helpers, configuring SonamuProvider, building forms or lists with useTypeForm or useListParams, using IdAsyncSelect or FileInput, or repairing view_list or view_form output | `sonamu-frontend` |
| adding a locale, key, entity or enum label, switching locale, diagnosing a raw-key fallback, selecting localized columns, pluralizing counts, choosing Korean particles, or formatting locale-aware numbers or dates | `sonamu-i18n` |
| a schema or data-only change needs a migration, generated DDL needs manual data handling, generation, status, apply, deletion, or rollback fails, an applied file is missing, the migration table is locked, or an id type or length changes | `sonamu-migration` |
| instrumenting a failing path, asserting on Puri/UpsertBuilder internals, filtering traces, diagnosing missing or non-serializable output, or checking LogTape, Vitest metadata, CLI, and extension-socket exposure before recording sensitive data | `sonamu-naite` |
| implementing findById/findOne/findMany, pagination, filters, joins, sorting, transactions, relation/batch saves, standalone PostgreSQL text search, PGroonga, pg_trgm, or pgvector query composition, or diagnosing row/TS2589 errors | `sonamu-query` |
| setting up @sonamu-kit/tasks, defining or enqueuing workflows, starting workers, adding a Sonamu cron workflow, or diagnosing retries, deadlines, leases, duplicate effects, cancellation, and recovery | `sonamu-tasks` |
| writing a Model or API test, setting up fixtures or mocks, running sonamu test, enabling parallel workers, or diagnosing startup, database, context, trace, or module-cache failures | `sonamu-testing` |
| calling Embedding.embed/embedOne, configuring Voyage/OpenAI keys, splitting text with Chunking, persisting embeddings, or handing vectors to Puri vectorSimilarity | `sonamu-vector` |

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
