# Subset — Response Field Scope

## Basic Structure

```json
{
  "subsets": {
    "A": ["id", "created_at", "username", "email", "role"],
    "P": ["id", "username", "employee.department.name"],
    "SS": ["id", "username"]
  }
}
```

## Naming Conventions

The names are fixed, not free-form — generated code and scaffolded views look up `A`, `P`, and `SS`
by name, so an invented name like `S`, `D`, or `L` produces a subset nothing consumes.

| Subset     | Purpose                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `A`        | All - all fields (detail view, admin). Required                            |
| `P`        | Partial/Profile - partial fields including relations (for list views)          |
| `SS`       | Super Simple/Summary - minimal fields, just ID + name (for dropdowns, selects) |
| `P2`, `P3` | Additional profiles (only for special cases)                                   |

`A` is the base subset and is required; `P` and `SS` exist only where a list view or a dropdown
needs them, so a single-subset entity is `{ "subsets": { "A": [...] } }`.

### Subset A covers every prop

`A` backs the detail view and the admin form, so a prop missing from it is a prop those screens
cannot show. Include every regular field, and for each BelongsToOne relation at least `.id` plus a
display field. HasMany relations are optional — include them only where the detail view needs them.

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

## Relation Fields (Dot Notation)

```json
{
  "subsets": {
    "P": ["id", "username", "employee.salary", "employee.department.name"]
  }
}
```

- BelongsToOne/OneToOne: automatic LEFT JOIN
- HasMany/ManyToMany: automatically optimized with DataLoader

## FK columns go through the relation

A BelongsToOne FK column is referenced as `user.id`, never as `user_id` — that form is what Sonamu
recognises, and when a relation is referenced by `.id` alone it reads the FK column directly and
skips the JOIN. So the relation form is both the valid one and the cheaper one.

```json
{ "A": ["id", "user.id", "title"] }   // reads the user_id column directly, no JOIN
{ "A": ["id", "user_id", "title"] }   // not a FieldExpr — unrecognised
```

(`indexes` are the opposite: they take the real DB column name, `user_id`. See
`references/design-guides.md`.)

## Internal Fields

```json
{
  "subsets": {
    "A": ["id", "username", { "field": "password_hash", "internal": true }]
  }
}
```

- Included in the query but excluded from the API response type

## Usage in Models

```typescript
// findById
const user = await UserModel.findById("P", 1);

// findMany
const { rows } = await UserModel.findMany("P", { num: 20, page: 1 });

// getSubsetQueries + executeSubsetQuery
const { qb } = UserModel.getSubsetQueries("P");
qb.where("users.role", "admin");

const result = await UserModel.executeSubsetQuery({
  subset: "P",
  qb,
  params: { num: 20, page: 1 },
});
```

## Notes

- Nesting beyond 3 levels of dot notation gets expensive to resolve and hard to read
- Relations left out of a list-purpose subset are relations the list query does not have to join

Working code references:

- `sonamu/examples/miomock/api/src/application/project/project.entity.json` - Subset definition examples
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json` - BelongsToOne relation examples
