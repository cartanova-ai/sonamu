# Model — Structure, CRUD, Subset Queries

## Basic Structure

```typescript
import { api, BaseModelClass, ListResult, NotFoundException } from "sonamu";
import type { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userLoaderQueries, userSubsetQueries } from "../sonamu.generated.sso";
import type { UserListParams, UserSaveParams } from "./user.types";

class UserModelClass extends BaseModelClass<
  UserSubsetKey,
  UserSubsetMapping,
  typeof userSubsetQueries,
  typeof userLoaderQueries
> {
  constructor() {
    super("User", userSubsetQueries, userLoaderQueries);
  }
}

export const UserModel = new UserModelClass();
```

## CRUD Pattern

Sonamu Model provides the following basic methods:

| Method     | Purpose                | Notes              |
| ---------- | ---------------------- | ------------------ |
| `findById` | Retrieve single record |                    |
| `findMany` | Retrieve list          |                    |
| `save`     | Create/update          | upsert behavior    |
| `del`      | Delete                 | Note: not `delete` |

**Avoiding JavaScript reserved words:** `delete` is a JS reserved word, so it is named `del`. While TypeScript allows `delete` as a method name without a compile error, it can cause runtime issues, so Sonamu uses `del`.

### findById

```typescript
@api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "User" })
async findById<T extends UserSubsetKey>(subset: T, id: number): Promise<UserSubsetMapping[T]> {
  const { rows } = await this.findMany(subset, { id, num: 1, page: 1 });
  if (!rows[0]) throw new NotFoundException(`User ID ${id} not found`);
  return rows[0];
}
```

### findMany

```typescript
@api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Users" })
async findMany<T extends UserSubsetKey>(
  subset: T,
  params: UserListParams = { num: 10, page: 1 }
): Promise<ListResult<UserListParams, UserSubsetMapping[T]>> {
  const { qb } = this.getSubsetQueries(subset);

  if (params.id) qb.whereIn("users.id", asArray(params.id));
  if (params.keyword) qb.where("users.email", "like", `%${params.keyword}%`);
  if (params.orderBy === "id-desc") qb.orderBy("users.id", "desc");

  return this.executeSubsetQuery({ subset, qb, params });
}
```

### save

```typescript
@api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
async save(spa: UserSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("users", sp));

  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("users");
  });
}
```

### del

```typescript
@api({ httpMethod: "POST", guards: ["admin"] })
async del(ids: number[]): Promise<number> {
  const wdb = this.getPuri("w");
  await wdb.transaction(async (trx) => {
    return trx.table("users").whereIn("id", ids).delete();
  });
  return ids.length;
}
```

## BaseModel Methods

| Method                        | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `getPuri("r")`                | Read query builder                                |
| `getPuri("w")`                | Write query builder                               |
| `getSubsetQueries(subset)`    | Subset query builder (returns `{ qb, onSubset }`) |
| `executeSubsetQuery(options)` | Execute subset query                              |
| `createEnhancers(enhancers)`  | Enhancer object creation helper (type inference)  |

## getSubsetQueries

```typescript
const { qb, onSubset } = this.getSubsetQueries(subset);

// qb: query builder for adding conditions
qb.where("users.status", "active");

// onSubset: when you need the type for a specific subset
const typedQb = onSubset("A"); // infers as subset A's type
```

## executeSubsetQuery Options

```typescript
return this.executeSubsetQuery({
  subset, // subset key
  qb, // query builder
  params, // ListParams (num, page, queryMode, sonamuFilter, etc.)
  debug: true, // print query log (default: false)
  optimizeCountQuery: true, // COUNT query optimization - removes unnecessary LEFT JOINs (default: false)
  enhancers, // Enhancer function object (optional)
});
```

> **CRITICAL: Do not directly mutate the object returned by `executeSubsetQuery()`.**
>
> Replacing rows via `result.rows = result.rows.map(...)` or `(result as any).rows = ...`
> will break the `total` count and cause pagination to malfunction.
>
> Use the `enhancers` pattern for virtual fields that require additional computation:
>
> ```typescript
> // WRONG — breaks pagination
> const result = await this.executeSubsetQuery({ subset, qb, params });
> (result as any).rows = result.rows.map((row) => ({ ...row, extra: "value" }));
> return result as any;
>
> // CORRECT — enhancers pattern
> const enhancers = this.createEnhancers({
>   A: (row) => ({ ...row, extra: "value" }),
> });
> return this.executeSubsetQuery({ subset, qb, params, enhancers });
> ```

### queryMode

Pass queryMode in params to control the return value:

```typescript
// List only (skip COUNT query) - performance optimization
const { rows } = await this.findMany(subset, { ...params, queryMode: "list" });

// Count only (skip list)
const { total } = await this.findMany(subset, { ...params, queryMode: "count" });

// Both (default)
const { rows, total } = await this.findMany(subset, { ...params, queryMode: "both" });
```

### sonamuFilter (FilterQuery)

Automatically apply filter conditions via params.sonamuFilter:

**Prerequisite:** The corresponding prop in entity.json must have `"toFilter": true` set. Fields without this setting are excluded from filtering.

```typescript
// Filter passed from the client
const params = {
  num: 10,
  page: 1,
  sonamuFilter: {
    status: "active", // eq (default)
    age: { gte: 18 }, // >=
    role: { in: ["admin", "user"] },
    email: { contains: "@test" }, // LIKE %...%
  },
};

// Automatically applied in the Model
return this.executeSubsetQuery({ subset, qb, params });
```

**Allowed operators by type:**

| Type              | Operators                                                            |
| ----------------- | -------------------------------------------------------------------- |
| `string`          | eq, ne, contains, startsWith, endsWith, in, notIn, isNull, isNotNull |
| `integer`         | eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull      |
| `numeric`         | eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull      |
| `boolean`         | eq, ne, isNull, isNotNull                                            |
| `date`/`datetime` | eq, ne, before, after, between, isNull, isNotNull                    |
| `enum`            | eq, ne, in, notIn, isNull, isNotNull                                 |
| `json`            | isNull, isNotNull                                                    |

**Operator examples:**

| Operator              | SQL             | Example                                   |
| --------------------- | --------------- | ----------------------------------------- |
| `eq` (default)        | `=`             | `{ status: "active" }`                    |
| `ne`                  | `!=`            | `{ status: { ne: "deleted" } }`           |
| `gt`, `gte`           | `>`, `>=`       | `{ age: { gte: 18 } }`                    |
| `lt`, `lte`           | `<`, `<=`       | `{ price: { lte: 1000 } }`                |
| `in`, `notIn`         | `IN`, `NOT IN`  | `{ role: { in: ["a", "b"] } }`            |
| `contains`            | `LIKE %...%`    | `{ name: { contains: "kim" } }`           |
| `startsWith`          | `LIKE ...%`     | `{ code: { startsWith: "A" } }`           |
| `endsWith`            | `LIKE %...`     | `{ ext: { endsWith: ".pdf" } }`           |
| `isNull`, `isNotNull` | `IS NULL`       | `{ deleted_at: { isNull: true } }`        |
| `before`, `after`     | `<`, `>` (date) | `{ created_at: { after: "2024-01-01" } }` |
| `between`             | `BETWEEN`       | `{ price: { between: [100, 500] } }`      |

**Type definition (`ApplySonamuFilter`):**

```typescript
import type { ApplySonamuFilter } from "sonamu";

// Define sonamuFilter type in ListParams
type ProjectListParams = {
  num: number;
  page: number;
  sonamuFilter?: ApplySonamuFilter<
    ProjectSubsetA, // entity type
    "id" | "created_at", // fields to exclude (TOmitKeys)
    "budget" // fields to treat as numeric (TNumericKeys)
  >;
};
```

## Enhancers

Post-query processing for virtual field computation and similar needs:

```typescript
// Define enhancer
const enhancers = this.createEnhancers({
  A: async (row) => ({
    ...row,
    fullName: `${row.first_name} ${row.last_name}`,
  }),
  D: async (row) => ({
    ...row,
    age: calculateAge(row.birth_date),
  }),
});

// Use in executeSubsetQuery
return this.executeSubsetQuery({ subset, qb, params, enhancers });
```

## Types File

```typescript
// user.types.ts
import { z } from "zod";
import {
  UserOrderBy,
  UserSearchField,
  UserBaseSchema,
  UserBaseListParams,
} from "../sonamu.generated";

export const UserListParams = UserBaseListParams;
export type UserListParams = z.infer<typeof UserListParams>;

// Basic pattern: partial from BaseSchema
export const UserSaveParams = UserBaseSchema.partial({
  id: true,
  created_at: true,
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

### SaveParams Patterns

**Basic pattern (no relations):**

```typescript
import { UserBaseSchema, UserBaseListParams } from "../sonamu.generated";

export const UserListParams = UserBaseListParams;
export type UserListParams = z.infer<typeof UserListParams>;

export const UserSaveParams = UserBaseSchema.partial({
  id: true,
  created_at: true,
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

**If a ManyToMany relation exists:**

```typescript
// ManyToMany relation: add {relation_name}_ids array
export const ProjectSaveParams = ProjectBaseSchema.partial({
  id: true,
  created_at: true,
})
  .extend({
    employee_ids: z.array(z.number().int().positive()),
    tag_ids: z.array(z.number().int().positive()),
  })
  .omit({
    // omit virtual fields, system-generated fields, etc.
    virtual_test: true,
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;
```

**Handling nullable fields in BelongsToOne relations:**

```typescript
// Nullable relations are automatically optional, so no extra partial is needed
export const ResponseSaveParams = ResponseBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true, // also make timestamp fields partial
});
export type ResponseSaveParams = z.infer<typeof ResponseSaveParams>;
```

**Reference working code:**

- `sonamu/examples/miomock/api/src/application/project/project.types.ts` - ManyToMany SaveParams example
- `sonamu/examples/miomock/api/src/application/employee/employee.types.ts` - BelongsToOne SaveParams example

### Handling Relations in the Model

**Removing relation objects on update:**

```typescript
// Pattern used in tests for updates
const original = await UserModel.findById("A", userId);

// Remove relation object and extract FK only
const { institution, ...userData } = original;

await UserModel.save([
  {
    ...userData,
    institution_id: institution?.id ?? null, // explicitly add FK
    name: "Updated Name",
  },
]);
```

**ManyToMany save:**

```typescript
// ManyToMany is passed as an _ids array
await ProjectModel.save([
  {
    id: projectId,
    title: "Updated",
    employee_ids: [1, 2, 3],
    tag_ids: [4, 5],
  },
]);
```

**Reference working code:**

- `sonamu/examples/miomock/api/src/application/project/project.model.ts` - ManyToMany save implementation
- `sonamu/examples/miomock/api/src/application/project/project.model.test.ts` - Save test example
