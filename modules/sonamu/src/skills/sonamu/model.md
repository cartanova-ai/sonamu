---
name: sonamu-model
description: Writing Sonamu Model classes. BaseModelClass inheritance, CRUD method patterns, business logic, executeSubsetQuery options. Use when implementing Model classes with business logic.
---

# Model Class

**Reference working code:**
- `sonamu/examples/miomock/api/src/application/project/project.model.ts` - ManyToMany save implementation
- `sonamu/examples/miomock/api/src/application/employee/employee.model.ts` - basic CRUD pattern
- `sonamu/examples/miomock/api/src/application/project/project.model.test.ts` - test examples

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

| Method | Purpose | Notes |
|--------|------|------|
| `findById` | Retrieve single record | |
| `findMany` | Retrieve list | |
| `save` | Create/update | upsert behavior |
| `del` | Delete | Note: not `delete` |

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

| Method | Description |
|--------|------|
| `getPuri("r")` | Read query builder |
| `getPuri("w")` | Write query builder |
| `getSubsetQueries(subset)` | Subset query builder (returns `{ qb, onSubset }`) |
| `executeSubsetQuery(options)` | Execute subset query |
| `createEnhancers(enhancers)` | Enhancer object creation helper (type inference) |

## getSubsetQueries

```typescript
const { qb, onSubset } = this.getSubsetQueries(subset);

// qb: query builder for adding conditions
qb.where("users.status", "active");

// onSubset: when you need the type for a specific subset
const typedQb = onSubset("A");  // infers as subset A's type
```

## executeSubsetQuery Options

```typescript
return this.executeSubsetQuery({
  subset,           // subset key
  qb,               // query builder
  params,           // ListParams (num, page, queryMode, sonamuFilter, etc.)
  debug: true,      // print query log (default: false)
  optimizeCountQuery: true,  // COUNT query optimization - removes unnecessary LEFT JOINs (default: false)
  enhancers,        // Enhancer function object (optional)
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
    status: "active",              // eq (default)
    age: { gte: 18 },              // >=
    role: { in: ["admin", "user"] },
    email: { contains: "@test" },  // LIKE %...%
  }
};

// Automatically applied in the Model
return this.executeSubsetQuery({ subset, qb, params });
```

**Allowed operators by type:**

| Type | Operators |
|------|--------|
| `string` | eq, ne, contains, startsWith, endsWith, in, notIn, isNull, isNotNull |
| `integer` | eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull |
| `numeric` | eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull |
| `boolean` | eq, ne, isNull, isNotNull |
| `date`/`datetime` | eq, ne, before, after, between, isNull, isNotNull |
| `enum` | eq, ne, in, notIn, isNull, isNotNull |
| `json` | isNull, isNotNull |

**Operator examples:**

| Operator | SQL | Example |
|--------|-----|------|
| `eq` (default) | `=` | `{ status: "active" }` |
| `ne` | `!=` | `{ status: { ne: "deleted" } }` |
| `gt`, `gte` | `>`, `>=` | `{ age: { gte: 18 } }` |
| `lt`, `lte` | `<`, `<=` | `{ price: { lte: 1000 } }` |
| `in`, `notIn` | `IN`, `NOT IN` | `{ role: { in: ["a", "b"] } }` |
| `contains` | `LIKE %...%` | `{ name: { contains: "kim" } }` |
| `startsWith` | `LIKE ...%` | `{ code: { startsWith: "A" } }` |
| `endsWith` | `LIKE %...` | `{ ext: { endsWith: ".pdf" } }` |
| `isNull`, `isNotNull` | `IS NULL` | `{ deleted_at: { isNull: true } }` |
| `before`, `after` | `<`, `>` (date) | `{ created_at: { after: "2024-01-01" } }` |
| `between` | `BETWEEN` | `{ price: { between: [100, 500] } }` |

**Type definition (`ApplySonamuFilter`):**

```typescript
import type { ApplySonamuFilter } from "sonamu";

// Define sonamuFilter type in ListParams
type ProjectListParams = {
  num: number;
  page: number;
  sonamuFilter?: ApplySonamuFilter<
    ProjectSubsetA,       // entity type
    "id" | "created_at",   // fields to exclude (TOmitKeys)
    "budget"              // fields to treat as numeric (TNumericKeys)
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
import { UserOrderBy, UserSearchField, UserBaseSchema, UserBaseListParams } from "../sonamu.generated";

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
  updated_at: true,  // also make timestamp fields partial
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
    institution_id: institution?.id ?? null,  // explicitly add FK
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

## Transactions

```typescript
await this.getPuri("w").transaction(async (trx) => {
  await trx.table("users").where("id", fromId).decrement("points", amount);
  await trx.table("users").where("id", toId).increment("points", amount);
});
```

## Validation Patterns

### Step-by-step Validation

A pattern for validating business rules step by step:

```typescript
async enroll(courseId: number, userId: number): Promise<Enrollment> {
  // Step 1: Duplicate check
  const existing = await this.findOne("A", {
    course_id: courseId,
    user_id: userId,
  });
  
  if (existing) {
    throw new Error("Already enrolled in this course");
  }
  
  // Step 2: Capacity check
  const course = await CourseModel.findById("A", courseId);
  const { total } = await this.findMany({ course_id: courseId });
  
  if (total >= course.max_students) {
    throw new Error("The course is full");
  }
  
  // Step 3: Execute
  const [id] = await this.save([{ course_id: courseId, user_id: userId }]);
  return this.findById("A", id);
}
```

### Conditional Validation

Perform different validations depending on conditions:

```typescript
async save(spa: TaskSaveParams[]): Promise<number[]> {
  for (const sp of spa) {
    // completion date is required only when status is completed
    if (sp.status === "completed" && !sp.completed_at) {
      throw new Error("A completion date is required for completed status");
    }
    
    // Check amount range only when budget is present
    if (sp.budget !== null && sp.budget < 0) {
      throw new Error("Budget must be 0 or greater");
    }
  }
  
  // Save after validation passes
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("tasks", sp));
  
  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("tasks");
  });
}
```

### Validating Against Related Data

Validate relationships with other tables:

```typescript
async save(spa: ResponseSaveParams[]): Promise<number[]> {
  for (const sp of spa) {
    // Check if the survey is still open
    const collection = await CollectionModel.findById("A", sp.collection_id);
    
    if (collection.status === "closed") {
      throw new Error("This survey has already ended");
    }
    
    // Check response period
    const now = new Date();
    if (now < collection.begin_date || now > collection.end_date) {
      throw new Error("This is not within the response period");
    }
  }
  
  // Save after validation passes
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("responses", sp));
  
  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("responses");
  });
}
```

**Key points:**
- Clear error messages when validation fails
- Only save after all validations pass
- Enforce business rules through code

---

## IMPORTANT: Verify orderBy After Scaffolding

### Problem

When scaffolding is run from Sonamu UI, the model file is **regenerated**, leaving only the default value (`id-desc`) and losing any custom orderBy cases.

```
Error: Argument of type 'xxx-asc' is not assignable to parameter of type 'never'
```

### Fix

After scaffolding, you must exhaustively handle **all orderBy enum cases** from entity.json in the model file.

```typescript
// entity.json orderBy enum
{ "TaskOrderBy": { "id-desc": "ID Latest", "created_at-desc": "By Date", "title-asc": "By Title" } }

// model - must verify/add after scaffolding
if (params.orderBy) {
  if (params.orderBy === "id-desc") {
    qb.orderBy("tasks.id", "desc");
  } else if (params.orderBy === "created_at-desc") {
    qb.orderBy("tasks.created_at", "desc");
  } else if (params.orderBy === "title-asc") {
    qb.orderBy("tasks.title", "asc");
  } else {
    exhaustive(params.orderBy);  // compile error if any case is missing
  }
}
```

### Checklist

- Verify orderBy cases in model after scaffolding
- Confirm they match the orderBy enum in entity.json
- Also check other custom logic such as search cases and enhancers

---

## Code Quality and Consistency

### DRY principle: use this.modelName

Use `this.modelName` instead of hardcoding the model name in error messages.

**BAD: hardcoded model name**
```typescript
// department.model.ts
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")("Department", id));
}

// user.model.ts
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")("User", id));
}
```

**GOOD: use this.modelName**
```typescript
// Common to all Models
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")(this.modelName, id));
}
```

**Benefits:**
- Prevents copy-paste mistakes: no need to update the model name when copying from another model
- Consistency: all models use the same pattern
- Maintainability: changing modelName in the constructor automatically reflects in all error messages

### Consistent i18n Key Usage

Use the same i18n keys consistently for the same purpose across the entire project.

**BAD: duplicate i18n keys**
```typescript
// Different keys used across models
throw new NotFoundException(SD("error.entityNotFound")(this.modelName, id));
throw new NotFoundException(SD("error.notFound")(this.modelName, id));
throw new NotFoundException(SD("notFound")(this.modelName, id));

// Search field error
throw new BadRequestException(SD("error.unknownSearchField")(params.search));
throw new BadRequestException(SD("error.invalidSearchField")(params.search));
```

**GOOD: use standard i18n keys**
```typescript
// Entity lookup failure - short and clear
throw new NotFoundException(SD("notFound")(this.modelName, id));

// Search field error - search namespace
throw new BadRequestException(SD("search.invalidField")(params.search));
```

**Recommended i18n key patterns:**
| Situation | i18n key | Used in |
|------|---------|--------|
| Entity lookup failure | `notFound` | findById |
| Invalid search field | `search.invalidField` | findMany search |
| Missing required field | `validation.required` | save validation |
| Unauthorized | `error.forbidden` | guards failure |
| Login required | `error.loginRequired` | Context.user null |

### Bulk Refactoring Strategy

When consistently modifying multiple model files, use sed for automation:

**Step 1: Confirm pattern**
```bash
# Find files to modify
grep -r 'SD("error.entityNotFound")' packages/api/src/application/*/
```

**Step 2: Validate changes (dry-run)**
```bash
# Preview changes before applying
sed -n 's/SD("error.entityNotFound")(\(.*\), id)/SD("notFound")(this.modelName, id)/p' file.ts
```

**Step 3: Apply in bulk**
```bash
# Modify all model files
find packages/api/src/application -name "*.model.ts" -exec sed -i '' \
  's/SD("error.entityNotFound")(\(.*\), id)/SD("notFound")(this.modelName, id)/g' {} \;
```

**Step 4: Validate with build**
```bash
# TypeScript type check
pnpm typecheck

# Full build
pnpm build
```

**Cautions:**
- Always run after a git commit (to allow rollback)
- Confirm changes with dry-run first
- Check for type errors with build
- Verify behavior with tests

### Type Check Patterns

**satisfies vs as const:**

```typescript
// BAD: bypasses type checking with type assertion
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "wrong-value" as const,  // error not detected
  ...rawParams,
} as RoleListParams;

// GOOD: compile-time validation with satisfies
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "wrong-value" as const,  // compile error!
  ...rawParams,
} satisfies RoleListParams;
```

**Recommended usage locations:**
- Default values for params in findMany
- Complex object literals (where type checking is important)

### IMPORTANT: ListParams / findMany / SearchField Synchronization

The following three must always remain consistent. If any one is out of sync, the feature either exists as a declaration only with no behavior, or a runtime error will occur.

1. `SearchField` enum values in `entity.json`
2. `ListParams` field definitions in `types.ts`
3. Filter/search handling code in `findMany` in `model.ts`

**Checklist:**
- [ ] Are all values declared in SearchField implemented in findMany?
- [ ] If any filter branch is commented out, either remove it or implement it
- [ ] Are "filter by ~", "search by ~" features from requirements reflected in ListParams?

**In particular, entities with an approval workflow must always add a status filter.**
(Clicking count by stage → filter to show only that list is a commonly required pattern)

```typescript
// types.ts - approval workflow entity example
export const AchievementListParams = AchievementBaseListParams.extend({
  status: z.nativeEnum(AchievementStatus).optional(),
  achievement_type: z.nativeEnum(AchievementType).optional(),
  submitter_id: z.string().optional(),
});

// model.ts - corresponding filter implementation
if (params.status) qb.where("achievements.status", params.status);
if (params.achievement_type) qb.where("achievements.achievement_type", params.achievement_type);
if (params.submitter_id) qb.where("achievements.submitter_id", params.submitter_id);
```

**DO NOT - declaration/implementation mismatch:**
```typescript
// SearchField "title" declared in entity.json
// model.ts only handles "id" case, "title" is commented out
if (params.search === "id") {
  // ...
} /* else if (params.search === "title") {
  // TODO: not implemented
} */
```

### Code Review Checklist

When writing a new Model:
- [ ] Use `this.modelName` (no hardcoding)
- [ ] Use standard i18n keys (`notFound`, `search.invalidField`)
- [ ] Use the `satisfies` keyword (type safety)
- [ ] Do not unnecessarily specify the debug option
- [ ] Exhaustively handle all orderBy cases
- [ ] If a ManyToMany relation exists, add _ids array to SaveParams
- [ ] Does the `@upload` method have `@api` on it? (`@upload` is used standalone; using both together causes a build error)
- [ ] Do the SearchField enum and findMany implementation match?
- [ ] For entities with approval workflows, are status/type filters present in both ListParams and findMany?

When bulk-modifying 20+ Models:
- [ ] Compare patterns with reference code like miomock
- [ ] Prioritize inconsistent patterns
- [ ] Write an automation script using sed or similar
- [ ] Commit to git before making changes
- [ ] Validate changes with dry-run
- [ ] Check for type errors with pnpm typecheck
- [ ] Verify behavior with pnpm test
- [ ] Check for `any` type usage (prohibited)

### Prohibition on any type

The `any` type neutralizes TypeScript's type safety and must **never be used**.

**BAD: using any**
```typescript
const { category_ids, ...data } = sp as any;
function process(input: any) { ... }
```

**GOOD: use precise types or unknown**
```typescript
// Destructure with a precise type
const { category_ids, ...data } = sp as QuestionCollectionSaveParams;

// Use unknown when the type is not known (instead of any)
function process(input: unknown) {
  if (typeof input === "string") { ... }
}
```

**Rules:**
- `any` is prohibited
- When the type is unknown, use `unknown` and narrow with a type guard
- When a type assertion is needed during destructuring, specify the exact type name (`as ConcreteType`)
- Suppression comments like `eslint-disable @typescript-eslint/no-explicit-any` are also prohibited
