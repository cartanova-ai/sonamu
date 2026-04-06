---
name: sonamu-subset
description: Define API response field scope with Sonamu Subsets. Include relation fields using dot notation. Use when defining which fields to return in API responses.
---

# Subset Definition

**Working code references:**

- `sonamu/examples/miomock/api/src/application/project/project.entity.json` - complex Subset example
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json` - basic Subset example

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

**WARNING: Only use A, P, and SS as Subset names. Do not use arbitrary names like S, D, or L.**

| Subset     | Purpose                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `A`        | All - all fields (detail view, admin). **Required**                            |
| `P`        | Partial/Profile - partial fields including relations (for list views)          |
| `SS`       | Super Simple/Summary - minimal fields, just ID + name (for dropdowns, selects) |
| `P2`, `P3` | Additional profiles (only for special cases)                                   |

### IMPORTANT: Subset A Must Include All Fields

**Subset A must include all regular fields and major relation fields of the Entity.**

**DO:**

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

**DO NOT:**

```json
{
  "subsets": {
    "A": ["id", "title"] // created_at, status, author omitted - incorrect
  }
}
```

**Rules:**

- Include all regular fields (id, created_at, business fields, etc.)
- For BelongsToOne relations, include at least `.id` and a display field (`.name`, `.title`, etc.)
- HasMany relations are optional (include only when needed)

### When Only a Single Subset Is Needed

```json
// DO - Correct: create only A
{ "subsets": { "A": ["id", "name", "created_at"] } }
```

### DO NOT - Incorrect Subset Names

```json
// Incorrect: do not use S, D, L, etc.
{
  "subsets": {
    "A": [...],
    "S": [...],  // NEVER - use SS instead
    "D": [...],  // NEVER - do not use
    "L": [...]   // NEVER - use P instead
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

## ID-Only Reference Optimization

```json
{ "SS": ["id", "title", "user.id"] }
```

- Referencing only `user.id` reads the `user_id` column directly without a JOIN

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

- The base Subset `A` is required
- Nesting depth of 3 or fewer levels is recommended
- Exclude unnecessary relations from list-purpose Subsets
- **Use relation notation for FK columns**: FK columns for BelongsToOne relations (e.g. `user_id`) must be accessed in Subsets using the `user.id` form. This is because Sonamu recognizes the relation notation and automatically optimizes by reading the FK column directly when only `.id` is referenced.

```json
// DO NOT - Incorrect: using FK column directly
{ "A": ["id", "user_id", "title"] }

// DO - Correct: use relation.field format (auto-optimized)
{ "A": ["id", "user.id", "title"] }
// → Sonamu reads the user_id column directly (no JOIN)
```

**Working code references:**

- `sonamu/examples/miomock/api/src/application/project/project.entity.json` - Subset definition examples
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json` - BelongsToOne relation examples
