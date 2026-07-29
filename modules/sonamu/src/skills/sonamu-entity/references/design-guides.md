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

### IMPORTANT: Always use enum for fixed-value fields

Defining a field with a fixed set of choices as `string` breaks DB integrity.

**Rule: "Can this value be freely entered from outside the code?"** No → enum, Yes → string

**Enum candidates**: strings that look like `faker.helpers.arrayElement([...])`, fields described as "one of the following / type / category", select boxes / radio buttons

```json
// WRONG: defined as string
{ "name": "budget_item", "type": "string", "desc": "Budget item" }
// CORRECT: defined as enum
{ "name": "budget_item", "type": "enum", "id": "BudgetItem", "desc": "Budget item" }
```

### Adding a nullable field

```json
{ "name": "deleted_at", "type": "date", "nullable": true, "desc": "Deleted at" }
```

**CRITICAL: Importance of the nullable attribute**

A field without `nullable: true` is treated as **required**.

Sonamu's `ubUpsert` uses PostgreSQL `ON CONFLICT ... DO UPDATE`, so **all required fields** must be included even on updates.

```json
// example
{
  "props": [
    { "name": "title", "type": "string" }, // required (no nullable)
    { "name": "content", "type": "string" }, // required (no nullable)
    { "name": "category", "type": "string", "nullable": true } // optional
  ]
}
```

**Rules**:

- Do not add `nullable: true` to fields that are not optional
- Always specify `nullable: true` for optional fields
- Required fields must always have a value in tests and API calls

**Details:** see `sonamu-testing` and "CRITICAL: Required fields must be included" in `sonamu-query`

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

`where` declares a PostgreSQL partial index predicate. Provide a raw SQL condition **without** the `WHERE` keyword; it is appended to the generated `CREATE INDEX`. Works for every index type (`index`, `unique`, `hnsw`, `ivfflat`, pgroonga).

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

### IMPORTANT: Use the actual DB column name in indexes

**The way FK columns are referenced differs between indexes and subsets. Do not confuse them.**

| Location  | Format                     | Example                               |
| --------- | -------------------------- | ------------------------------------- |
| `indexes` | Actual DB column name      | `role_id`, `user_id`, `department_id` |
| `subsets` | FieldExpr (relation.field) | `role.id`, `user.id`, `department.id` |

**DO NOT:**

```json
// Using FieldExpr in indexes → error
"indexes": [
  { "name": "ix_role", "type": "index", "columns": [{ "name": "role.id" }] }
]
```

**DO:**

```json
// indexes use actual DB column names
"indexes": [
  { "name": "ix_role_id", "type": "index", "columns": [{ "name": "role_id" }] }
]

// subsets use FieldExpr
"subsets": {
  "A": ["id", "role.id", "role.name"]
}
```

### IMPORTANT: Unique constraints based on business rules

Not a technical decision — ask **"What if the same combination is inserted twice?"** → if it should error, use unique; if it should be allowed, use index only.

**Patterns that need composite unique**: per-year settings (`type, dept_id, year`), user-role mappings, per-year budgets (`project_id, year, budget_item`), likes/bookmarks (`user_id, entity_id`)

## Common Mistakes

| Mistake                                          | Fix                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Missing `id` prop                                | Recommended to add (needed by most Model logic)                                       |
| Missing `created_at` prop                        | Recommended to add with `dbDefault: "CURRENT_TIMESTAMP"`                              |
| Missing `OrderBy` enum                           | Add `{EntityId}OrderBy` (needed for findMany sorting)                                 |
| Missing `SearchField` enum                       | Add `{EntityId}SearchField` (needed for search)                                       |
| enum prop `id` not defined in enums              | Add definition to the enums section                                                   |
| Missing `id` on json prop                        | Add the `id` field                                                                    |
| Using `"type": "text"` directly                  | `text` is invalid. Use `"type": "string"` without a length                            |
| Adding multiple values to `OrderBy` enum         | **Default is `id-desc` only** (see below)                                             |
| Defining fixed-choice fields as `string`         | Convert to enum (check for fields with arrayElement-style fixtureGenerator)           |
| Yearly/mapping tables without unique constraints | Add composite unique based on business rules                                          |
| Using `number` type for integer fields           | Use `integer` (use `numeric` only when decimal precision is needed)                   |
| Using `role.id` format in indexes                | indexes use actual DB column name (`role_id`); only subsets use FieldExpr (`role.id`) |

## Resolving Entity Schema Validation Errors

**→ See `references/creation-workflow.md` PHASE 1** (missing index type, Subset FieldExpr, duplicate columns, Boolean dbDefault, etc.)

**Quick checklist:**

- [ ] Does every index have a `type` field? (`"index"` | `"unique"` | `"hnsw"` | `"ivfflat"`)
- [ ] Does the subset reference FK using `relation.id` format? (`user_id` ✗ → `user.id` ✓)
- [ ] No duplicate definition of BelongsToOne relation and FK column?
- [ ] Is Boolean `dbDefault` a string (`"true"` / `"false"`)? (0, 1 ✗)
- [ ] Are all fields included in Subset A?
- [ ] Do index columns use actual DB column names (`role_id`)? (FieldExpr `role.id` ✗)
