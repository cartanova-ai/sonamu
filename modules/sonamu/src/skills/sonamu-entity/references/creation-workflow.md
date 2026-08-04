# Entity Creation Workflow

Each step consumes the previous step's output, so the order is fixed by the pipeline rather than by
convention. All commands run from `packages/api`.

| # | Command / edit                                        | Produces                                          |
| - | ----------------------------------------------------- | ------------------------------------------------- |
| 1 | `pnpm sonamu stub entity {EntityId}`                  | `application/{entity}/{entity}.entity.json`       |
| 2 | Edit that entity.json — props, relations, subsets      | the schema everything below is derived from        |
| 3 | Write `{entity}.model.ts` by hand                      | findById / findOne / findMany / save / del         |
| 4 | `pnpm sonamu sync`                                     | `{entity}.types.ts`, `sonamu.generated.ts`, web    |
| 5 | Handle nullable fields in the generated `types.ts`     | `SaveParams` that accepts `null`                   |
| 6 | `pnpm sonamu migrate generate` → `migrate run`          | migration file, then the table                     |
| 7 | `pnpm sonamu scaffold model\|model_test\|view_* {EntityId}` | model body and admin UI                       |
| 8 | `pnpm build` in `packages/api` and `packages/web`       | confirms the generated code type-checks            |

A running `pnpm dev` performs step 4 automatically through its file watcher, so no separate command
is needed while it is up.

## Step 1: Stub

`EntityId` must start with an uppercase letter — `Course`, `ConsultationHistory`. A lowercase id
produces a table and type names that no later step can correct without a rename.

```bash
pnpm sonamu stub entity Course
```

Editing the stub is the intended path; a hand-written entity.json tends to omit fields the stub
supplies.

## Step 2: entity.json validation

An invalid entity.json fails at sync, so these are worth checking before running it.

Every index needs a `type` (`"index"` | `"unique"` | `"hnsw"` | `"ivfflat"`):

```json
"indexes": [{ "name": "ix_user_email", "type": "index", "columns": [{ "name": "email" }] }]
```

Indexes use DB column names, subsets use FieldExpr. `role_id` in `indexes`, `role.id` in
`subsets` — the two are not interchangeable, and swapping them errors.

Subsets reference FKs through the relation, not the FK column: `user.id`, not `user_id`.
Sonamu reads the FK column directly and skips the JOIN when only `.id` is referenced, so the
relation form costs nothing.

Subset A includes every prop, plus at least `.id` for each relation. See `references/subset.md`.

A BelongsToOne relation and its FK column are not both declared. Declare the relation only —
the FK column is derived from it. Declaring `user_id` alongside a `user` relation produces a
duplicate column.

Boolean `dbDefault` is the string `"true"` or `"false"`, not `"1"` / `"0"`.

Enum `dbDefault` is wrapped in escaped double quotes — `"\"pending\""`. Unquoted, PostgreSQL
reads it as a column reference and rejects the DEFAULT expression.

OrderBy enum holds only `id-desc` until scaffolding is done. Scaffolded model code handles that
one case, so extra values type-error in `exhaustive()`. See `references/field-types.md`.

## Step 3: model.ts

Not generated — write it, using another entity's model.ts as the template. Required methods:
`findById`, `findOne`, `findMany`, `save`, `del`. Templates and per-method patterns live in
`sonamu-query`'s `references/model.md`.

## Step 4: Sync

```bash
pnpm sonamu sync
```

`sync` generates `{entity}.types.ts` and never overwrites it afterwards, so extending that file is
your job. Expected shape:

```typescript
import { z } from "zod";
import { YourEntityBaseListParams, YourEntityBaseSchema } from "../sonamu.generated";

export const YourEntityListParams = YourEntityBaseListParams;
export type YourEntityListParams = z.infer<typeof YourEntityListParams>;

export const YourEntitySaveParams = YourEntityBaseSchema.partial({
  id: true,
  created_at: true,
});
export type YourEntitySaveParams = z.infer<typeof YourEntitySaveParams>;
```

With a ManyToMany relation, add the id array:

```typescript
export const YourEntitySaveParams = YourEntityBaseSchema.partial({
  id: true,
  created_at: true,
}).extend({
  relation_name_ids: z.array(z.number().int().positive()),
});
```

Working examples: `examples/miomock/api/src/application/project/project.types.ts` (ManyToMany),
`.../employee/employee.types.ts` (basic).

No `types.ts` after a sync? The syncer generates it only when the entity has no `parentId` and
the file does not already exist — so it is one of those two conditions, not a timing lag. Child
entities with `parentId` are typed through their parent. Substituting a hand-written file for a
sync drifts from the template; `pnpm sonamu sync --force` re-runs the full sync, ignoring
`sonamu.lock`.

Sync writes across both packages, so these are the places to look when something downstream is
missing:

```bash
grep "your-entity" packages/api/sonamu.lock                          # entity.json, model.ts, types.ts
grep "YourEntityService" packages/web/src/services/services.generated.ts
grep "entity.YourEntity" packages/web/src/i18n/sd.generated.ts       # FK field labels
ls packages/web/src/components/your-entity/ packages/web/src/routes/admin/your-entities/
```

## Step 5: Nullable fields in types.ts

Generated `SaveParams` does not mark nullable props as `partial`, so until this is done `SaveParams`
rejects `null` for every nullable field and any code path that saves one — a test helper, a form
submit, a fixture — fails to type-check.

```typescript
// generated
export const FAQSaveParams = FAQBaseSchema.partial({ id: true, created_at: true });

// after handling the nullable props
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  category: true,
  order_num: true,
}).extend({
  category: z.string().nullish(),
  order_num: z.number().nullish(),
  updated_at: z.date().nullish(),
});
```

Full treatment: "Tasks to Do Immediately After Entity Creation" in `sonamu-testing`.

## Step 6: Migration

```bash
pnpm sonamu migrate generate
pnpm sonamu migrate status
pnpm sonamu migrate run
```

`migrate generate` refuses to run while any earlier migration is unapplied — see `sonamu-migration`
for that error and how to clear it. There is no dry-run flag; the generated file is the SQL preview.
Reading it before applying catches:

- A wrong table name (expected: plural, snake_case)
- Missing columns, FK constraints, or indexes
- Duplicate column definitions
- Boolean defaults emitted as strings rather than `true` / `false`

## Step 7: Scaffolding

```bash
pnpm sonamu scaffold model YourEntity
pnpm sonamu scaffold model_test YourEntity
pnpm sonamu scaffold view_list YourEntity
pnpm sonamu scaffold view_form YourEntity
```

Each type is a separate command taking the EntityId. What each produces, and what the generated
output leaves for you to finish, is in `sonamu-frontend`'s `references/scaffolding.md`.
