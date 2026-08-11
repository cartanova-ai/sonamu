---
name: sonamu-query
description: Typed Model, Puri, and UpsertBuilder queries. Use when implementing findById/findOne/findMany, pagination, filters, joins, sorting, transactions, relation/batch saves, standalone PostgreSQL text search, PGroonga, pg_trgm, or pgvector query composition, or diagnosing row/TS2589 errors. Covers ListResult, WhereGroup, ensureJoin, UBRef, and cleanOrphans; use sonamu-vector for embedding and chunking.
---

# Sonamu Query and Persistence

Start with the reference for the operation being changed. The generated Model is the baseline for
ordinary CRUD; add only the filters, computed fields, relations, or persistence behavior the task
needs.

## Reference map

| Task | Read |
| --- | --- |
| Implement `findById`, `findOne`, or `findMany`; reason about subsets, loaders, count, pagination, filters, enhancers, or TS2589 | `references/model.md` |
| Compose Puri SELECT/WHERE/JOIN/existence/sort queries, transactions, row locks, or use a typed escape hatch | `references/puri.md` |
| Implement `save`, direct upserts, relation replacement, orphan cleanup, or batch insert/update | `references/upsert.md` |
| Add PostgreSQL, PGroonga, pgvector, or pg_trgm search | `references/search.md` |

Subset declarations and relation shapes belong to `sonamu-entity`. Embedding generation and
chunking belong to `sonamu-vector`; this skill covers only the database query.

## Contract checkpoints

- Import framework symbols from `"sonamu"`; import entity-specific subset, schema, and Model types
  from the consuming project's generated and application modules.
- `getPuri("r")` and `getPuri("w")` are available on Models and Frames. A Puri table is typed from
  the generated `DatabaseSchemaExtend` augmentation.
- `getSubsetQueries(subset)` starts from the generated SELECT/JOIN/loader plan. Add subset fields
  with `appendSelect()` and compute code virtuals with `createEnhancers()`.
- `executeSubsetQuery()` applies `sonamuFilter`, count/list mode, pagination, loaders, hydration,
  enhancers, and internal-field removal. Its result shape follows the literal `queryMode` in the
  `findMany` input type.
- Puri has no public `exists()` or `whereExists()` method. Use `first()` for a standalone existence
  check and a narrow bound raw/Knex boundary for a correlated `EXISTS` predicate.
- `ubRegister()` buffers rows in the wrapper's `UpsertBuilder`; a transaction wrapper shares that
  buffer. Flush referenced tables before rows containing their `UBRef`s.
- Direct Puri `update()` and `delete()` do not require a predicate at runtime. An omitted `where`
  updates or deletes the entire selected table.
