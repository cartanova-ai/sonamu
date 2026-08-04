# Situation-Specific Design Guides

## Situation-Specific Guides

### Adding a string field

```json
{ "name": "title", "type": "string", "length": 255, "desc": "Title" }
```

- Omitting `length` → stored as `text` type (for long text)

### Adding an enum field

```json
// 1. Add to props
{ "name": "status", "type": "enum", "id": "ProductStatus", "desc": "Status" }

// 2. Define in enums (MUST — missing this causes errors)
"ProductStatus": { "draft": "Draft", "published": "Published", "archived": "Archived" }
```

### Fixed-value fields: enum over string

A fixed set of choices typed as `string` leaves the DB with no constraint on the value, and the
generated form with a free-text input where a select belongs.

The question that separates them: can this value be entered freely from outside the code? No → enum.
Yes → string. Fields that turn out to be enums usually read as "one of the following", a type, or a
category — and show up as select boxes or radio buttons in the UI, or as
`faker.helpers.arrayElement([...])` in a fixture generator.

```json
{ "name": "budget_item", "type": "string", "desc": "Budget item" }                        // unconstrained
{ "name": "budget_item", "type": "enum", "id": "BudgetItem", "desc": "Budget item" }      // constrained
```

### Adding a nullable field

```json
{ "name": "deleted_at", "type": "date", "nullable": true, "desc": "Deleted at" }
```

A prop without `nullable: true` is required, and that reaches further than the column definition:
`ubUpsert` uses PostgreSQL `ON CONFLICT ... DO UPDATE`, so every required field has to be supplied on
updates as well as inserts — a partial update that omits one fails.

```json
{
  "props": [
    { "name": "title", "type": "string" },                      // required
    { "name": "content", "type": "string" },                    // required
    { "name": "category", "type": "string", "nullable": true }  // optional
  ]
}
```

Which way each prop goes is a modelling decision, and the cost of getting it wrong lands on every
test helper and API call that has to fill the field. Details: "Required fields must be included" in
`sonamu-query`.

### Adding a JSON field

```json
{
  "name": "metadata",
  "type": "json",
  "id": "ProductMetadata",
  "desc": "Metadata"
}
```

- `id` is required (used as the type name)
- A separate TypeScript type definition is needed

### Adding a searchText field (for pg_trgm Fuzzy Search)

A dedicated prop type that consolidates multiple columns into a single generated column. Used with a GIN index.

```json
{
  "props": [
    { "name": "title_ko", "type": "string" },
    { "name": "title_en", "type": "string" },
    { "name": "tags", "type": "string[]" },
    {
      "name": "search_text",
      "type": "searchText",
      "sourceColumns": [
        { "name": "title_ko" },
        { "name": "title_en", "caseInsensitive": true },
        { "name": "tags" }
      ]
    }
  ],
  "indexes": [
    {
      "name": "idx_items_search_text",
      "type": "index",
      "columns": [{ "name": "search_text", "opclass": "gin_trgm_ops" }],
      "using": "gin"
    }
  ]
}
```

SQL expressions per source column type:

| source type                  | caseInsensitive: true         | caseInsensitive: false (default)     |
| ---------------------------- | ----------------------------- | ------------------------------------ |
| `string`                     | `lower(COALESCE(col, ''))`    | `COALESCE(col, '')`                  |
| `string[]`                   | `sonamu_text_array_agg(col)`  | `sonamu_text_array_agg(col, false)`  |
| `json` (z.array(z.string())) | `sonamu_jsonb_array_agg(col)` | `sonamu_jsonb_array_agg(col, false)` |

- If a `string[]` or `json(string[])` source is present, helper function DDL is automatically inserted in the migration
- `searchText` columns are generated columns and are excluded from SaveParams — INSERT/UPDATE is not allowed
- For query usage: see the "pg_trgm Fuzzy Search" section in `sonamu-query`

### Adding a unique constraint

```json
{
  "name": "products_sku_unique",
  "type": "unique",
  "columns": [{ "name": "sku" }]
}
```

### Composite unique constraint

```json
{
  "name": "cart_items_unique",
  "type": "unique",
  "columns": [{ "name": "user_id" }, { "name": "product_id" }]
}
```

### Partial index (`where`)

`where` declares a PostgreSQL partial index predicate. Provide a raw SQL condition without the `WHERE` keyword; it is appended to the generated `CREATE INDEX`. Works for every index type (`index`, `unique`, `hnsw`, `ivfflat`, pgroonga).

```json
{
  "name": "uniq_users_email_active",
  "type": "unique",
  "columns": [{ "name": "email" }],
  "where": "deleted_at IS NULL"
}
```

→ `CREATE UNIQUE INDEX uniq_users_email_active ON users (email) WHERE deleted_at IS NULL;`
(Enforces email uniqueness only among non-deleted rows.)

### `nullsNotDistinct` (unique only)

By default PostgreSQL treats `NULL`s as distinct, so a unique index allows multiple `NULL` rows. Set `nullsNotDistinct: true` to emit `NULLS NOT DISTINCT`, treating `NULL`s as equal (at most one `NULL` allowed).

```json
{
  "name": "uniq_accounts_external_id",
  "type": "unique",
  "columns": [{ "name": "external_id" }],
  "nullsNotDistinct": true
}
```

→ `CREATE UNIQUE INDEX uniq_accounts_external_id ON accounts (external_id) NULLS NOT DISTINCT;`

### FK columns: DB column name in indexes, FieldExpr in subsets

Indexes are DDL, so they name real columns; subsets are query expressions, so they name relations.
The two forms are not interchangeable and `role.id` in an index errors.

| Location  | Format                     | Example                               |
| --------- | -------------------------- | ------------------------------------- |
| `indexes` | Actual DB column name      | `role_id`, `user_id`, `department_id` |
| `subsets` | FieldExpr (relation.field) | `role.id`, `user.id`, `department.id` |

```json
"indexes": [{ "name": "ix_role_id", "type": "index", "columns": [{ "name": "role_id" }] }],
"subsets": { "A": ["id", "role.id", "role.name"] }
```

### Unique vs index

The domain decides this one, not the schema: what should happen if the same combination is inserted
twice? An error → `unique`. Allowed → plain `index`.

Combinations that usually want a composite unique: per-year settings (`type, dept_id, year`),
user-role mappings, per-year budgets (`project_id, year, budget_item`), likes and bookmarks
(`user_id, entity_id`).

## Easily missed declarations

| Missing                             | Effect                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| `id` prop                           | Most Model logic assumes it — findById, save, del                   |
| `created_at` prop                   | No creation timestamp; add with `dbDefault: "CURRENT_TIMESTAMP"`    |
| `{EntityId}OrderBy` enum            | `findMany` has nothing to sort by                                   |
| `{EntityId}SearchField` enum        | Search has no field to search                                       |
| enum prop's `id` absent from `enums` | Sync fails — the prop references a type that was never defined      |
| `id` on a json prop                 | Sync fails — `id` is the generated TypeScript type's name           |

`"type": "text"` is not a valid prop type. Long text is `"type": "string"` with `length` omitted.

The full pre-sync validation list is in `references/creation-workflow.md`, Step 2.
