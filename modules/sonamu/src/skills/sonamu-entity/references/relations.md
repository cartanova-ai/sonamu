# Relations

Relations are declared as props with `"type": "relation"`, never in a separate `"relations"` key.

| Situation | relationType | Column created |
| --- | --- | --- |
| "A belongs to B" (N:1) | `BelongsToOne` | `{name}_id` on A |
| "A has many Bs" (1:N) | `HasMany` | none |
| "A and B are 1:1" | `OneToOne` | `{name}_id`, on the `hasJoinColumn` side only |
| "A and B are many-to-many" | `ManyToMany` | none — a join table instead |

## BelongsToOne (N:1)

```json
{
  "type": "relation",
  "name": "author",
  "with": "User",
  "relationType": "BelongsToOne",
  "nullable": true,
  "onUpdate": "CASCADE",
  "onDelete": "SET NULL",
  "desc": "작성자"
}
```

This generates an `author_id` column. Do not also declare `author_id` as a prop — validation accepts
both, and the generated migration then defines the same column twice.

The FK column's type follows the **referenced** entity's PK: an integer PK yields `z.int()`, a string
or uuid PK yields `z.string()`, and a string PK's `length` is carried over. A polymorphic
`entity_id` column therefore needs one type that fits every entity it can point at.

`onUpdate` and `onDelete` both default to `RESTRICT`, so a parent row cannot be deleted while
children reference it. State them explicitly for cascade or null-out behavior.

- `useConstraint` — default `true`. With `false` the FK column is created but no DB constraint is
  emitted, which is how you point at a table Sonamu does not manage.
- `customJoinClause` — a JOIN condition SQL string used instead of the FK equality.

No index is created on the FK column; declare one in `indexes` when the relation is joined or
filtered — `references/indexes.md`.

### Three names for one relation

| Layer | Name |
| --- | --- |
| `props` declaration | `author` |
| Puri writes and `indexes` | `author_id` |
| `subsets` | `author.id` |

Puri's row type is keyed by column names, so `author: 1` is a type error rather than a silently
unset FK. A subset entry is not type-checked that way — `author_id` there fails at sync;
see `references/subset.md`.

## HasMany (1:N)

```json
{
  "type": "relation",
  "name": "posts",
  "with": "Post",
  "relationType": "HasMany",
  "joinColumn": "author_id",
  "desc": "작성한 게시물"
}
```

`joinColumn` is the FK column name in the **related** table and is required. `fromColumn` names the
matching column on your own table and defaults to `id`.

No DB column is created, so a HasMany can be added or removed later without a migration. Declare one
only where a subset needs the reverse lookup.

A HasMany or ManyToMany inside a subset generates a separate loader query, not a JOIN: the parent ids
from the main query are collected and the child rows fetched with one `whereIn` over all of them. The
count of queries is therefore per relation, not per row.

## OneToOne (1:1)

The FK exists only on the side that sets `hasJoinColumn: true`. Omitting it on both sides means
neither table gets a column and the relation resolves to nothing.

```json
{
  "type": "relation",
  "name": "user",
  "with": "User",
  "relationType": "OneToOne",
  "hasJoinColumn": true,
  "onUpdate": "CASCADE",
  "onDelete": "CASCADE",
  "desc": "사용자"
}
```

The reverse side declares the same relation without `hasJoinColumn`, usually with
`"nullable": true`. `customJoinClause` and `useConstraint` apply on the `hasJoinColumn` side, as in
BelongsToOne.

## ManyToMany (N:M)

```json
{
  "type": "relation",
  "name": "tags",
  "with": "Tag",
  "relationType": "ManyToMany",
  "joinTable": "posts__tags",
  "onUpdate": "CASCADE",
  "onDelete": "CASCADE",
  "desc": "태그"
}
```

`joinTable`, `onUpdate`, and `onDelete` are all required here — unlike BelongsToOne, where the last
two are optional.

The join table name takes a **double** underscore between the two table names (`posts__tags`); its
columns take a single one (`post_id`, `tag_id`).

When the link itself needs data — a date range, a role, a quantity, a status — a join table cannot
carry it. Replace the ManyToMany with an intermediate entity holding its own id and two
BelongsToOne relations, reached through `HasMany`. Converting later means a data migration.

## Self-reference

A BelongsToOne pointing at its own entity needs `nullable: true`, or every row requires a parent and
no row can be inserted first.

```json
{
  "type": "relation",
  "name": "manager",
  "with": "Employee",
  "relationType": "BelongsToOne",
  "nullable": true,
  "onUpdate": "CASCADE",
  "onDelete": "SET NULL",
  "desc": "직속 상사"
}
```

## SaveParams shapes

`{Entity}BaseSchema` is generated from **every** prop, including ones the database refuses writes to.
Two adjustments are therefore made by hand in `{entity}.types.ts`, which sync writes once and never
overwrites.

### `.omit()` for non-writable props

`virtual` props (no column at all), `generated` props, and `searchText` props are all in BaseSchema.
The BaseSchema **type** lists them under `__virtual__`, `__virtual_query__`, and `__generated__`,
which is how Puri rejects writes at the table level — but nothing strips them from a `SaveParams`
derived from BaseSchema.

```typescript
export const ProductSaveParams = ProductBaseSchema.partial({
  id: true,
  created_at: true,
}).omit({
  display_name: true, // virtual
  review_count: true, // virtual, virtualType: "query"
  total_amount: true, // generated column
  search_text: true, // searchText
});
```

Without it, a form or fixture is typed as if those fields were writable.

### `.extend()` for ManyToMany

BaseSchema has no field for a ManyToMany relation — the link lives in the join table — so add an id
array:

```typescript
export const ProductSaveParams = ProductBaseSchema.partial({
  id: true,
  created_at: true,
}).extend({
  tag_ids: z.array(z.number().int().positive()),
});
```

Name it `{relation_name}_ids` — `tags` → `tag_ids`. `positive()` rejects `0`, which catches an unset
id passed through by accident. A bidirectional ManyToMany — both entities declaring a relation over
the same join table — gets the id array on one side only, so there is a single writer for the join
table while reads work from both directions.

Whether the array is required or optional is the decision that matters on update. Required means
every save must resupply the full set, including a save built from a row loaded through a subset:

```typescript
const { tags, ...rest } = product;
const tag_ids = tags?.map((t) => t.id) ?? [];
await ProductModel.save([{ ...rest, tag_ids, title: "Updated" }]);
```

Writing the join table and removing links the request no longer contains is `ubUpsert`'s
`cleanOrphans` option — see `sonamu-query`'s `references/upsert.md`.

## parentId — a child managed through its parent

`parentId` is a top-level key naming the **EntityId** of the parent:

```json
{
  "id": "OrderItem",
  "title": "주문 항목",
  "table": "order_items",
  "parentId": "Order",
  "props": [],
  "indexes": [],
  "subsets": {},
  "enums": {}
}
```

A child with `parentId` has no independent CRUD — it is created, updated, and deleted through the
parent. Adding or removing `parentId` later rewrites the child's model and views.

### Creating one

`sonamu stub entity` takes only an EntityId, so `parentId` cannot be passed to it. Stub the child,
add `"parentId": "<ParentEntityId>"` by hand, then move the file to the derived path.

### Derived folder location

The path comes from the **direct** parent, one level up — not from the root of the chain:

| Entity | parentId | Derived path |
| --- | --- | --- |
| `Course` | — | `course/course.entity.json` |
| `Chapter` | `Course` | `course/chapter.entity.json` |
| `Lesson` | `Chapter` | `chapter/lesson.entity.json` |

Autoload globs `src/application/**/*.entity.json`, so a file in the wrong folder still registers.
What breaks is everything else resolved by the derived path: the entity editor saves there, and the
child's types module resolves to `<direct-parent>/<direct-parent>.types`.

That bounds how deep a chain is useful. `Lesson` resolves its types module to `chapter/chapter.types`,
and `Chapter` — having a parentId itself — never gets a `types.ts`, so nothing is there to resolve.
Keep parentId one level deep, or make the middle entity independent.

### What parentId costs

| Generated for a child with `parentId` | |
| --- | --- |
| `{Entity}BaseSchema` and its table entry in `DatabaseSchemaExtend` | Yes |
| `{Entity}BaseListParams` | No |
| `{Entity}Subset*`, `SubsetKey`, `SubsetMapping` | No |
| `{entity}.types.ts` | No |

So the child's table and columns stay queryable through Puri, but it has no list params and no subset
of its own — the parent's subset is the only place its fields are selected. An entity that needs to be
listed or filtered independently should not have `parentId`.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| A separate `"relations": [...]` key | Declare relations as props with `"type": "relation"` |
| Declaring `{name}_id` next to a BelongsToOne | Remove it — the FK column is derived |
| `user_id` inside a subset | Use `user.id`; the column name is for `indexes` only |
| Neither OneToOne side sets `hasJoinColumn` | Set it on the side that holds the FK |
| HasMany without `joinColumn` | Name the FK column in the related table |
| ManyToMany without `joinTable` / `onUpdate` / `onDelete` | All three are required |
| Self-reference with `nullable: false` | Use `nullable: true` |
| `parentId` set to a column name | It takes an EntityId |
