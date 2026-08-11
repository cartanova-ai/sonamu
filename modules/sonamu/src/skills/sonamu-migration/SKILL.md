---
name: sonamu-migration
description: Manages Sonamu database migrations. Use when a schema or data-only change needs a migration, generated DDL needs manual data handling, generation, status, apply, deletion, or rollback fails, an applied file is missing, the migration table is locked, or an id type or length changes. Covers migrate generate/run/apply/status, src/migrations, up/down, and alter_<table>_pk_type.
---

# Database migrations

Sonamu compares the entity definitions under `src/application` with one database that has every
existing migration applied, then writes Knex migration files under `src/migrations`. The entity
definition is the target schema; a direct database change that is absent from the entity definition
can appear as a difference on the next generation when it affects the columns, indexes, or FKs that
Sonamu models.

Run migration commands from the API package root: the directory that contains
`src/sonamu.config.ts` and the package's `sonamu` script. Do not assume a repository-specific
directory name.

## Route by task

- To generate, inspect status, choose apply targets, or understand config loading and file order,
  read [generate-and-apply.md](references/generate-and-apply.md).
- Before applying any generated file, read
  [review-generated-migrations.md](references/review-generated-migrations.md). It explains when to
  keep generated DDL and when a rename, backfill, cast, or data-only change needs a manual edit.
- When status, generation, apply, deletion, or rollback fails, read
  [failure-and-recovery.md](references/failure-and-recovery.md).
- Before changing the `id` prop's type or string length, read
  [pk-type-change.md](references/pk-type-change.md). This path has PostgreSQL-specific casts and
  generates a consolidated file that overlaps some ordinary alter files from the same run.

## Schema and generated TypeScript are separate outputs

`pnpm sonamu migrate generate` reads `entity.json` directly; it does not require or run
`pnpm sonamu sync`. Run sync separately when generated TypeScript artifacts need to reflect the
entity change. Migration generation and sync both load the Sonamu config, so a standalone CLI
process normally needs the built `dist/sonamu.config.js` described in the generation reference.
