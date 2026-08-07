---
name: sonamu-entity
description: Defines and modifies Sonamu entities: props, relations, subsets, and indexes. Use when creating or editing an entity.json, adding a prop or enum, wiring BelongsToOne/HasMany/ManyToMany/parentId, defining a subset or index, or resolving an entity.json validation or sync error. Covers sonamu stub entity, sonamu sync, dbDefault, generated columns, searchText, FieldExpr, and SaveParams.
---

# Sonamu Entity

`entity.json` is the source of truth: props, relations, subsets, indexes, and enums.

Syncing after an entity.json change regenerates the Zod schemas and TypeScript types in
`sonamu.generated.ts` and `sonamu.generated.sso.ts`, writes `{entity}.types.ts` once for a new
entity, and refreshes the i18n labels in `sd.generated.ts`. Nothing else follows from the entity file
alone:

| Output | Produced by |
| --- | --- |
| Migration file, then the table | `sonamu migrate generate`, then `migrate run` |
| `model.ts`, model test, admin `view_list` / `view_form` | `sonamu scaffold <type> {EntityId}` |
| `services.generated.ts` in each sync target, plus `queries.generated.ts` and `sonamu.generated.http` in the API | `sonamu sync` after a **model** change, not an entity change |

## Reference Map

| Need | Read |
| --- | --- |
| The order of commands from stub to built code, and what to check before each | `references/creation-workflow.md` |
| Prop types and their options, dbDefault, generated columns, searchText | `references/field-types.md` |
| Indexes and unique constraints, partial indexes, opclass, vector indexes | `references/indexes.md` |
| Relation types, BelongsToOne/HasMany/OneToOne/ManyToMany, parentId, SaveParams shapes | `references/relations.md` |
| Subset keys, response field scope, FieldExpr vs DB column name | `references/subset.md` |

Migration execution and schema-change errors are in `sonamu-migration`. Save and query mechanics are
in `sonamu-query`. Cone metadata and fixtures are in `sonamu-fixture`. The `User` entity and the rest
of the auth schema are in `sonamu-auth`.

## Every top-level key is required

`EntityManager` validates each `*.entity.json` against a strict schema on load, and prints
`Invalid entity.json schema: <path>` when it fails. All seven keys must be present — including
`table`, and including `indexes`, `subsets`, and `enums` even when empty:

```json
{
  "id": "Product",
  "title": "Product",
  "table": "products",
  "props": [{ "name": "id", "type": "integer", "desc": "ID" }],
  "indexes": [],
  "subsets": { "A": ["id"] },
  "enums": {}
}
```

- `id` — must match `^[A-Z][a-zA-Z0-9]*$`. It is also the source of the table name, the generated
  type names, the model, and every scaffolded view, so a rename later touches all of them.
- `table` — snake_case plural. Omitting it fails with
  `table: Invalid input: expected string, received undefined`; the `Entity` class has a
  pluralize-from-id fallback, but a file never reaches it.
- Unknown keys are rejected, at the top level and inside each prop: a typo yields
  `Unrecognized key: "lenght"` rather than being ignored.

`id` and `created_at` props, and the `{EntityId}OrderBy` / `{EntityId}SearchField` enums, are not
enforced by the schema. `sonamu stub entity` writes all four, and the scaffolded model and views
assume them.

## After editing an entity.json

Generated output — `types.ts`, `sonamu.generated.ts` — stays stale until a sync runs:

```bash
cd packages/api
pnpm sonamu sync          # regenerate what changed
pnpm sonamu sync --force  # deletes sonamu.lock, then full re-sync
```

A running `pnpm dev` does the same through its file watcher, so no separate command is needed while
it is up. The standalone command reads `dist/sonamu.config.js` and fails with `ERR_MODULE_NOT_FOUND`
if the API package has never been built — `pnpm build` once fixes it.

Change detection is a SHA-1 of each file's contents, recorded in `sonamu.lock`. A file whose bytes
did not change is not re-synced, regardless of its mtime.

One sync generates `{entity}.types.ts` for at most one new entity, so add entities one at a time —
`references/creation-workflow.md`, Step 3.
