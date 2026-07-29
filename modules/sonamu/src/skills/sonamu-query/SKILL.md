---
name: sonamu-query
description: Reads and writes data through Sonamu Models and the Puri query builder. Use when implementing a Model CRUD method, writing a SELECT/WHERE/JOIN query, batch-saving relation data, or when a query returns unexpected rows or an excessively deep type error. Covers BaseModelClass, findMany, executeSubsetQuery, getPuri, transactions, UpsertBuilder, tsvector and PGroonga full-text search, pgvector, and pg_trgm.
---

# Sonamu Data Access

**Working code references:**

- `sonamu/examples/miomock/api/src/application/employee/employee.model.ts` — basic CRUD
- `sonamu/examples/miomock/api/src/application/project/project.model.ts` — ManyToMany save
- `sonamu/examples/miomock/api/src/application/project/project.model.test.ts` — tests

## Reference Map

| Need | Read |
| --- | --- |
| Model class structure, CRUD methods, getSubsetQueries, executeSubsetQuery options, enhancers, types file | `references/model.md` |
| Transactions, validation patterns, orderBy after scaffolding, code conventions | `references/model-patterns.md` |
| SELECT, WHERE, JOIN, GROUP BY, INSERT/UPDATE/DELETE, result methods | `references/puri.md` |
| tsvector / PGroonga full-text search, pgvector, pg_trgm fuzzy search | `references/search.md` |
| Batch-saving relations, save order, ManyToMany, bulk insert, UpsertOptions | `references/upsert.md` |

Embedding generation and chunking live in the `sonamu-vector` skill.
Subset definition lives in `sonamu-entity`.

---

## Non-negotiable rules

**Puri**

- Puri is the standard for BOTH reads and writes in ALL contexts (Model, Frame, scripts) — do NOT run queries on a raw `DB.getDB()` handle (exceptions: migration files, `db.ts`, tests, and the `.knex` escape hatch)
- MUST use `getPuri("r")` for read queries, `getPuri("w")` for write queries
- MUST include a WHERE condition for UPDATE/DELETE
- MUST use `transaction()` for multiple write operations
- Inside a Frame, use the associated Model's `getPuri` (Frame exposes only `getDB` / `getUpsertBuilder`)
- Outside a Model, wrap knex with `new PuriWrapper(DB.getDB(which), new UpsertBuilder())`
- Use the `puri.knex` escape hatch only for non-entity / framework-internal tables (e.g. `workflow_runs`)
- JSON/JSONB columns are automatically JSON.stringify'd on insert/update

**UpsertBuilder**

- MUST use inside `transaction()`
- MUST call `ubUpsert()` for FK-referenced tables first (correct order)
- `UBRef` can ONLY be used inside `ubRegister`, never for direct DB queries
- Self-reference is auto-handled by level-based insertion
- Unique index conflicts are auto-resolved by pre-fetching existing IDs
