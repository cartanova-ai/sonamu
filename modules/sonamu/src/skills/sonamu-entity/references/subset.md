# Subsets — Response Field Scope

A subset names a set of fields to select. Every key in `subsets` generates its own schema, so the
keys are the API's response shapes.

```json
{
  "subsets": {
    "A": ["id", "created_at", "username", "email", "role"],
    "P": ["id", "username", "employee.department.name"],
    "SS": ["id", "username"]
  }
}
```

## What each key generates

For a key `K` on entity `Product`, sync writes `ProductSubsetK` (schema + type) into
`sonamu.generated.ts`, adds `K` to `ProductSubsetMapping`, and adds `"K"` to the
`ProductSubsetKey` enum. The scaffolded Model's `findById`/`findOne`/`findMany` are generic over
`ProductSubsetKey`, so any key you declare is callable — there is no fixed list of allowed names.

Two things are not free-form:

- **Scaffolded views only ever request `A`.** `view_list` and `view_form` hardcode `subset="A"`,
  and `view_list` derives its columns from `A`. `P`, `SS`, and anything else exist for code you
  write; the admin UI never reads them.
- **Keys must be uppercase.** The generated schema uses the key verbatim (`ProductSubsetp` for
  `"p"`), while module-path registration uppercases it (`ProductSubsetP`). A lowercase key
  therefore generates a schema under one name and registers the import under another, and the
  generated file fails to resolve it.

## Conventional keys

| Key | Convention | Consumed by |
| --- | --- | --- |
| `A` | Every prop — detail view and admin form | Scaffolded views, hardcoded |
| `P` | Partial/Profile — list-view fields, including relations | Code you write |
| `SS` | Super Simple — id plus a label, for dropdowns | Code you write |
| `P2`, `P3` | Further profiles for special cases | Code you write |

`A` is the one to always declare, since the scaffolded views break without it. A single-subset
entity is `{ "subsets": { "A": [...] } }`.

### Subset A covers every prop

`A` backs the detail view and the admin form, so a prop missing from it is a prop those screens
cannot show, and `view_list`'s generated columns skip it too. Include every regular field, and for
each BelongsToOne relation at least `.id` plus a display field. HasMany relations are optional —
include them only where the detail view needs them.

```json
{
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "created_at", "type": "date" },
    { "name": "title", "type": "string" },
    { "name": "status", "type": "enum", "id": "Status" },
    { "type": "relation", "name": "author", "with": "User", "relationType": "BelongsToOne" }
  ],
  "subsets": {
    "A": ["id", "created_at", "title", "status", "author.id", "author.name"]
  }
}
```

## FieldExpr: subsets take `user.id`, indexes take `user_id`

This is the one rule that decides every field reference in an entity.json. A `subsets` entry is a
**FieldExpr** — prop names and relation paths, dot-separated. An `indexes` column is a **real DB
column name**.

| Location | Form | Example |
| --- | --- | --- |
| `subsets` | FieldExpr | `"user.id"` |
| `indexes` (any type, including `unique`) | DB column name | `"user_id"` |

`{ "A": ["id", "user.id", "title"] }` is valid and reads the `user_id` column directly, with no JOIN.
`{ "A": ["id", "user_id", "title"] }` is not a FieldExpr and is rejected at sync, with the prop list
attached so the message names what is available:

```
Product -- 잘못된 FieldExpr 'user_id' (사용 가능한 props: id, created_at, title, user)
```

A dotted path whose leading segment is not a relation fails as `잘못된 FieldExpr user.name`.

Referencing a BelongsToOne by `.id` alone reads the FK column directly and skips the JOIN, so the
relation form is both the valid one and the cheaper one. Index columns are in
`references/indexes.md`.

## Relation fields (dot notation)

```json
{
  "subsets": {
    "P": ["id", "username", "employee.salary", "employee.department.name"]
  }
}
```

- BelongsToOne / OneToOne — LEFT JOIN, generated automatically.
- HasMany / ManyToMany — a separate loader query, not a JOIN. The parent ids from the main query are
  collected and the child rows fetched with one `whereIn` over all of them, so the query count is per
  relation, not per row.

Nesting is unlimited in the schema but each level adds a JOIN; past three levels the generated
query is hard to reason about. Relations left out of a list-purpose subset are relations the list
query does not have to join at all.

## Internal fields

```json
{
  "subsets": {
    "A": ["id", "username", { "field": "password_hash", "internal": true }]
  }
}
```

Selected by the query but excluded from the API response type — used when the Model needs the value
and the client must not receive it.

## Object form with cone metadata

`subsets` accepts both the plain array and an object carrying `cone`, the same pair as `enums`.
`sonamu stub entity` generates the object form by default, so an entity.json you open may already
look like this. Both validate identically.

```json
"subsets": {
  "A": ["id", "title"],
  "P": { "fields": ["id", "title"], "cone": { "note": "목록용" } }
}
```

Cone metadata itself belongs to `sonamu-fixture`.

## Usage in Models

```typescript
const user = await UserModel.findById("P", 1);
const { rows } = await UserModel.findMany("P", { num: 20, page: 1 });

const { qb } = UserModel.getSubsetQueries("P");
qb.where("users.role", "admin");

const result = await UserModel.executeSubsetQuery({
  subset: "P",
  qb,
  params: { num: 20, page: 1 },
});
```

Query-side detail is in `sonamu-query`'s `references/model.md`.
