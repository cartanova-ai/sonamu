---
name: sonamu-entity-basic
description: Reference for creating or modifying Sonamu entities. Field types, requirements analysis, parent-child relationships, OrderBy/Enum rules. Use when creating or modifying entities. See entity-validation-checklist.md for the validation checklist.
---

# Entity Basics

**Working code references:**

- `sonamu/examples/miomock/api/src/application/user/user.entity.json` — basic entity example
- `sonamu/examples/miomock/api/src/application/project/project.entity.json` — complex entity example
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json` — BelongsToOne relationship example

## When a User Requests a New System

When the user requests a system to be built, proceed in the following order:

**1. Analyze requirements** (identify missing entities)

- "Do you need a User entity?"
- "Are there any other entities needed?"

**2. Confirm relationships between entities** (one question at a time)

- "Is A to B a 1:N or N:M relationship?"
- "Should chapters be managed as children of courses?"

**3. Decide whether to use parentId**

- "Can it exist without a parent?"
- "Should it be created and deleted together with the parent?"

**4. Final confirmation with the user**

- Finalize entity list
- Provide a relationship diagram or clear description

### Entity Design Done Checklist

- [ ] All required entities identified
- [ ] Relationships between entities defined
- [ ] parentId usage decided
- [ ] User confirmation complete

**When done:** proceed to "Entity Creation Workflow"

**Full workflow reference:** `.claude/workflow/project_init.md`

---

## Entity Creation Workflow

**Prerequisite: CRITICAL!**

**Always run `pnpm dev` in `/packages/api` before starting!**

```bash
cd packages/api
pnpm dev  # keep this running during all work
```

> **Why**: In dev mode, the syncer detects changes to entity.json and auto-generates types.ts.
>
> Dev mode is required **for all entity creation**, not just auth entities.

### Step 1: Generate stub

**CRITICAL: EntityId must always start with an uppercase letter!**

```bash
pnpm sonamu stub entity {EntityId}
```

**Correct examples:**

- `pnpm sonamu stub entity Course` (correct)
- `pnpm sonamu stub entity User` (correct)
- `pnpm sonamu stub entity ConsultationHistory` (correct)

**Incorrect examples:**

- `pnpm sonamu stub entity course` (wrong — starts with lowercase)
- `pnpm gen stub entity Course` (wrong — incorrect command)

Generated file: `api/src/application/{entity}/{entity}.entity.json`

### Step 2: Edit the stub file

Add props, relations, and subsets to the generated entity.json file.

### Step 3: Validate and generate required files

**CRITICAL: Always validate before running sync!**

**A. Validate entity.json** (see `entity-validation-checklist.md` PHASE 1)

- [ ] Does every index have a `type` field?
- [ ] Does the subset use `relation.id` format instead of directly referencing FK columns?
- [ ] Is the Boolean `dbDefault` a string (`"true"` / `"false"`)?
- [ ] Does the OrderBy enum contain only `id-desc`?
- [ ] Is the Enum `dbDefault` using escaped double quotes? (e.g., `"\"pending\""`)

**B. model.ts (must be created manually)**

- Must be created manually
- Reference another entity's model.ts as a template
- Required methods: findById, findOne, findMany, save, del
- See `entity-validation-checklist.md` PHASE 2 for template

**C. types.ts (auto-generated — wait for it)**

- **If `pnpm dev` is running**, the syncer will auto-generate it within 2–3 seconds
- Check: `ls packages/api/src/application/{entity}/{entity}.types.ts`
- If not generated:
  1. Verify `pnpm dev` is running
  2. If still not generated, create manually (see `entity-validation-checklist.md` PHASE 2 for template)

**Done criteria:**

- [ ] entity.json validation passed
- [ ] model.ts exists
- [ ] types.ts exists (auto-generated or manually created)

### Step 4: Sync

```bash
pnpm sonamu sync
```

**Note:** Do not write entity JSON by hand. Always generate using the stub command, then edit.

### Step 5: Migration and Scaffolding

1. Generate and apply migration
2. Run scaffolding
3. Test the build

**Full workflow:** see step-by-step checklist in `entity-validation-checklist.md`

### Step 6: Handle nullable fields in types.ts (required)

**CRITICAL: Do this immediately after scaffolding, before writing tests!**

After scaffolding completes, nullable fields in the generated `*.types.ts` must be handled.

```typescript
// Auto-generated types.ts
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
});

// CORRECT: update immediately — add nullable fields
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  category: true, // nullable added
  order_num: true, // nullable added
}).extend({
  category: z.string().nullish(),
  order_num: z.number().nullish(),
  updated_at: z.date().nullish(),
});
```

**Detailed guide:** see "Actions to take immediately after entity creation" in `testing.md`

## Checklist for New Entity Creation

1. **id**: PascalCase (e.g., `User`, `BlogPost`)
2. **table**: snake_case plural (e.g., `users`, `blog_posts`) — can be omitted
3. **title**: display name
4. **Recommended props**: `id`, `created_at` (not enforced by schema but best practice)
5. **Recommended enums**: `{EntityId}OrderBy`, `{EntityId}SearchField` (not enforced but best practice)

## IMPORTANT: Analyze Requirements Before Creating Entity

**STOP! Ask questions one at a time before creating any entity.**

### Identify missing entities

Do not only create entities explicitly mentioned by the user. **Ask one at a time:**

- "Do you need a User entity?" → wait for response
- "Does the User have multiple roles?" → wait for response
- "Are there any other entities needed?" → wait for response

**Note on User entity**: `id` is an auto-increment sequence (PK) and is not a login ID. When using better-auth, a separate `login_id` is not needed (managed by the auth table).

**Commonly missed entities**: Content (Comment, Like, Tag, Category), Commerce (Review, Cart, Payment), Reservation (Reservation, Schedule), Education (Enrollment, Progress)

### When multiple entities are requested — confirm relationships

When 2+ entities are requested, **ask about relationships one at a time before writing any code**:

- Which relationship type: BelongsToOne, HasMany, ManyToMany, or parentId
- Whether it is a parent-child dependency (delete together) or independent

### Always confirm before designing

**1. Polymorphic Association** (`entity_type + entity_id` pattern):

- If there is a string PK entity (e.g., better-auth User) → use `string` type for `entity_id` uniformly
- Otherwise → `integer` is fine

**2. Domain term ↔ entity English ID mapping**: finalize with the user before writing any code (e.g., "위탁연구과제" → `ResearchContract`). Changing this later requires a full rename.

## Parent-Child Relationships (parentId)

### What is parentId?

A top-level option used when a child entity is managed as a dependent of a parent entity.

- With parentId: the child has no independent CRUD — it is created, updated, and deleted through the parent
- Without parentId: an independent entity with its own CRUD

### When to use parentId

| Situation                                | parentId | Example                            |
| ---------------------------------------- | -------- | ---------------------------------- |
| Cannot exist without a parent            | Yes      | OrderItem → Order                  |
| Created and deleted together with parent | Yes      | Chapter → Course, Lesson → Chapter |
| Can be independently CRUD'd              | No       | Comment → Post                     |
| Can belong to multiple parents           | No       | Tag → Post (ManyToMany)            |

### parentId usage example

```json
{
  "id": "OrderItem",
  "table": "order_items",
  "title": "Order Item",
  "parentId": "Order",
  "props": [...]
}
```

### Child entities with parentId do not generate types.ts

Child entities with parentId set (e.g., Chapter, Lesson) do not get their own `types.ts` file. This is expected behavior — child entities are managed through the parent. If you need independent CRUD and types.ts, do not use parentId.

### Folder location for parentId child entities

Child entities with parentId must be placed **in the same folder as the root parent entity**.

| Structure                    | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `course/course.entity.json`  | Root entity                                       |
| `course/chapter.entity.json` | parentId: "Course" → same folder                  |
| `course/lesson.entity.json`  | parentId: "Chapter" → same folder (based on root) |
| `course/course.types.ts`     | types.ts generated only for root                  |

**Note:** Do not create child entities in a separate folder (e.g., `chapter/chapter.entity.json`).

### IMPORTANT: When Uncertain - Ask User (Never Guess)

**Do not guess — ask.** In situations like the following, ask the user directly:

- "Should chapters be managed as children of courses, or created as an independent entity?"
- "Should order items be saved together with the order, or managed separately?"

**When in doubt, ask. One question is better than a wrong design.**

**Helpful questions to ask the user:**

- "Will this data ever need to be queried or updated independently without a parent?"
- "Should this data be deleted when the parent is deleted?"
- "Does the admin UI need a separate list page for this?"

## Minimal Template

```json
{
  "id": "Product",
  "table": "products",
  "title": "Product",
  "props": [
    { "name": "id", "type": "integer", "desc": "ID" },
    {
      "name": "created_at",
      "type": "date",
      "dbDefault": "CURRENT_TIMESTAMP",
      "desc": "Created at"
    },
    { "name": "name", "type": "string", "length": 255, "desc": "Product name" }
  ],
  "indexes": [],
  "subsets": { "A": ["id", "name", "created_at"] },
  "enums": {
    "ProductOrderBy": { "id-desc": "Newest" },
    "ProductSearchField": { "id": "ID", "name": "Name" }
  }
}
```

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

**Details:** see "Quick Start" in `testing.md` and "CRITICAL: Required fields must be included" in `upsert.md`

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
- For query usage: see the "pg_trgm Fuzzy Search" section in `puri.md`

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

**→ See `entity-validation-checklist.md` PHASE 1** (missing index type, Subset FieldExpr, duplicate columns, Boolean dbDefault, etc.)

**Quick checklist:**

- [ ] Does every index have a `type` field? (`"index"` | `"unique"` | `"hnsw"` | `"ivfflat"`)
- [ ] Does the subset reference FK using `relation.id` format? (`user_id` ✗ → `user.id` ✓)
- [ ] No duplicate definition of BelongsToOne relation and FK column?
- [ ] Is Boolean `dbDefault` a string (`"true"` / `"false"`)? (0, 1 ✗)
- [ ] Are all fields included in Subset A?
- [ ] Do index columns use actual DB column names (`role_id`)? (FieldExpr `role.id` ✗)

## IMPORTANT: OrderBy Enum Generation Rule

**IMPORTANT: It is strongly recommended to use only `id-desc` during initial scaffolding.**

```json
// RECOMMENDED — for initial scaffolding
"ProductOrderBy": { "id-desc": "Newest" }

// AVOID — do not add these before scaffolding
"ProductOrderBy": { "id-desc": "Newest", "name-asc": "Name (A-Z)", "created_at-desc": "Newest first" }
```

### Why only id-desc?

The model code generated by scaffolding handles only `id-desc` automatically. If the OrderBy enum has other values:

1. Scaffolding succeeds, but a type error occurs in the model's `exhaustive()` function
2. The developer must manually add cases to the model
3. If this is missed, a runtime error may occur

**This is not a technical constraint — it is scaffolding best practice.** Add complex OrderBy values after scaffolding is complete.

### When additional sort options are needed

When sort options are required later:

1. Add values to the OrderBy enum in entity.json
2. Add the corresponding cases to the orderBy branch in the model

```typescript
// model.ts — adding orderBy cases
if (params.orderBy === "id-desc") {
  qb.orderBy("products.id", "desc");
} else if (params.orderBy === "name-asc") {
  // added
  qb.orderBy("products.name", "asc");
} else {
  exhaustive(params.orderBy);
}
```

**Rule**: start with `id-desc` only → add others as needed after scaffolding

## IMPORTANT: integer vs number Type Selection

**CRITICAL: Always follow the criteria below when creating numeric fields. Wrong type choice causes unnecessary ALTER migrations.**

PostgreSQL mapping:

- `integer` → DB `integer` (whole numbers)
- `number` → DB `numeric(p,s)` (precise decimal numbers)

| Use case                                | Entity type                       | Example                          |
| --------------------------------------- | --------------------------------- | -------------------------------- |
| PK, FK, count, order, quantity          | `integer`                         | id, user_id, order_num, quantity |
| Amount, ratio, values requiring decimal | `number` (+ `precision`, `scale`) | price, rate, weight, score       |

**DO NOT:**

```json
{ "name": "order_num", "type": "number", "desc": "Sort order" }
{ "name": "quantity", "type": "number", "desc": "Quantity" }
```

**DO:**

```json
{ "name": "order_num", "type": "integer", "desc": "Sort order" }
{ "name": "quantity", "type": "integer", "desc": "Quantity" }
{ "name": "price", "type": "number", "precision": 12, "scale": 2, "desc": "Price" }
{ "name": "rate", "type": "number", "precision": 5, "scale": 2, "desc": "Rate" }
```

**Decision rule: "Does this value ever need a decimal point?"**

- No → `integer`
- Yes → `number` (always specify `precision` and `scale`)

## Common Options (CommonProp)

Options applicable to all prop types:

| Option     | Type    | Description                                               |
| ---------- | ------- | --------------------------------------------------------- |
| `name`     | string  | Field name (required)                                     |
| `desc`     | string  | Field description                                         |
| `nullable` | boolean | Whether NULL is allowed (default: false)                  |
| `toFilter` | true    | Register as a sonamuFilter filtering target. See model.md |
| `cone`     | Cone    | LLM-based fixture generation metadata. See cone.md        |

## Required Options by Type

| Type         | Required     | Optional                                                           |
| ------------ | ------------ | ------------------------------------------------------------------ |
| `string`     | —            | `length` (text if omitted), `zodFormat` (email, uuid, etc.)        |
| `integer`    | —            | —                                                                  |
| `bigInteger` | —            | —                                                                  |
| `number`     | —            | `precision`, `scale`, `numberType` (real/double precision/numeric) |
| `numeric`    | —            | `precision`, `scale`                                               |
| `enum`       | `id`         | `nullable`, `dbDefault`, `length`                                  |
| `json`       | `id`         | `dbDefault: "{}"`                                                  |
| `date`       | —            | `dbDefault`, `precision`                                           |
| `boolean`    | —            | `dbDefault: "false"`                                               |
| `virtual`    | `id`         | `virtualType` (query/code, default: code)                          |
| `vector`     | `dimensions` | —                                                                  |
| `tsvector`   | —            | —                                                                  |

## IMPORTANT: ENUM Type dbDefault Setting

When setting a default value on an ENUM field, the value must be wrapped in **escaped double quotes**.

### DO NOT - Incorrect Examples

```json
// Incorrect: no quotes — interpreted as a column reference in SQL, causes error
{ "name": "status", "type": "enum", "id": "ApprovalStatus", "dbDefault": "pending" }
// Error: cannot use column reference in DEFAULT expression

// Incorrect: single quotes — causes oxfmt format error
{ "name": "status", "type": "enum", "id": "ApprovalStatus", "dbDefault": "'pending'" }
```

### DO - Correct Example

```json
// Correct: escaped double quotes
{
  "name": "status",
  "type": "enum",
  "id": "ApprovalStatus",
  "dbDefault": "\"pending\"",
  "desc": "Approval status"
}
```

### Generated SQL

```sql
-- Correct output
"status" text not null default 'pending'
```
