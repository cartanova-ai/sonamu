# Indexes and Unique Constraints

Indexes are DDL, so every column here is a **real DB column name** — `role_id`, not `role.id`.
Subsets are the opposite; that split is in `subset.md`.

## Shape

```json
"indexes": [
  { "name": "ix_users_email", "type": "index", "columns": [{ "name": "email" }] }
]
```

`name`, `type`, and `columns` are all required. `type` is one of `"index"`, `"unique"`, `"hnsw"`,
`"ivfflat"` — nothing else; a value like `"pgroonga"` or `"gin"` fails with
`Invalid option: expected one of "index"|"unique"|"hnsw"|"ivfflat"`, because those are access methods
and belong in `using`.

`name` is capped at 63 characters (`Too big: expected string to have <=63 characters`). A composite
name built from a long table name and several columns crosses that easily, so shorten the prefix
rather than dropping columns from the name.

## Index-level options

| Option | Values | Emitted as |
| --- | --- | --- |
| `using` | `btree`, `hash`, `gin`, `gist`, `pgroonga` | `USING <method>`. Default btree |
| `where` | raw SQL predicate, non-empty | `WHERE <predicate>` |
| `nullsNotDistinct` | boolean | `NULLS NOT DISTINCT` — `unique` only |
| `m`, `efConstruction` | number | HNSW `WITH (m, ef_construction)` |
| `lists` | number | IVFFlat `WITH (lists)` |

## Column-level options

| Option | Values | Emitted as |
| --- | --- | --- |
| `opclass` | a known opclass, or any string | the opclass after the column name |
| `sortOrder` | `ASC`, `DESC` | ` ASC` / ` DESC` after the column |
| `nullsFirst` | boolean | ` NULLS FIRST` / ` NULLS LAST` |
| `vectorOps` | `vector_cosine_ops`, `vector_ip_ops`, `vector_l2_ops` | same slot as `opclass`; kept for backward compatibility |

`sortOrder` and `nullsFirst` are **dropped** for any `using` other than btree — the generator emits
only the column name and its opclass there, with no error.

Known `opclass` values: `gin_trgm_ops`, `gist_trgm_ops`, `gin_bigm_ops`, `vector_cosine_ops`,
`vector_ip_ops`, `vector_l2_ops`, `pgroonga_varchar_full_text_search_ops_v2`,
`pgroonga_jsonb_full_text_search_ops_v2`. Any other non-empty string is passed through to the DDL, so
an unknown opclass surfaces as a PostgreSQL error at migration time rather than at validation.

## Unique vs index

What should happen if the same combination is inserted twice? An error → `unique`. Allowed → plain
`index`.

```json
{
  "name": "cart_items_unique",
  "type": "unique",
  "columns": [{ "name": "user_id" }, { "name": "product_id" }]
}
```

Column order in a composite index is the index's column order.

## Partial index (`where`)

`where` is a raw SQL predicate without the `WHERE` keyword, appended to the generated `CREATE INDEX`.
It works with all four index types. An empty or whitespace-only value fails validation rather than
being ignored.

```json
{
  "name": "uniq_users_email_active",
  "type": "unique",
  "columns": [{ "name": "email" }],
  "where": "deleted_at IS NULL"
}
```

→ `CREATE UNIQUE INDEX uniq_users_email_active ON users (email) WHERE deleted_at IS NULL;`

That enforces email uniqueness only among non-deleted rows, which is what soft delete needs: a plain
unique index on `email` blocks re-registering an address whose old row is still present.

## `nullsNotDistinct` (unique only)

PostgreSQL treats NULLs as distinct by default, so a unique index allows any number of NULL rows.
`nullsNotDistinct: true` emits `NULLS NOT DISTINCT`, allowing at most one.

```json
{
  "name": "uniq_accounts_external_id",
  "type": "unique",
  "columns": [{ "name": "external_id" }],
  "nullsNotDistinct": true
}
```

→ `CREATE UNIQUE INDEX uniq_accounts_external_id ON accounts (external_id) NULLS NOT DISTINCT;`

## GIN index for a searchText column

The pg_trgm search helpers in `sonamu-query` use trigram operators, which read a GIN index declared
with a trigram opclass. The prop declaration is in `field-types.md`.

```json
{
  "name": "idx_items_search_text",
  "type": "index",
  "columns": [{ "name": "search_text", "opclass": "gin_trgm_ops" }],
  "using": "gin"
}
```

## Vector indexes

`hnsw` and `ivfflat` index a `vector` column and take their build parameters at the index level.

```json
{
  "name": "idx_docs_embedding",
  "type": "hnsw",
  "columns": [{ "name": "embedding", "opclass": "vector_cosine_ops" }],
  "m": 16,
  "efConstruction": 64
}
```

All three parameters are emitted with defaults when omitted — `m = 16`, `ef_construction = 64`,
`lists = 100` — so the generated DDL is explicit either way. Query-side usage is in `sonamu-query`.

## FK columns

A BelongsToOne relation generates a `{name}_id` column and a foreign key constraint, but no index.
Declare one when the relation is joined or filtered:

```json
{ "name": "ix_posts_author_id", "type": "index", "columns": [{ "name": "author_id" }] }
```
