# Model — Transactions, Validation, Conventions

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
  orderBy: "wrong-value" as const, // error not detected
  ...rawParams,
} as RoleListParams;

// GOOD: compile-time validation with satisfies
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "wrong-value" as const, // compile error!
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
- [ ] If a ManyToMany relation exists, add \_ids array to SaveParams
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
