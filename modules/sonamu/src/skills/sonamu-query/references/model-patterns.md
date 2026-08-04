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

Key points:

- Clear error messages when validation fails
- Only save after all validations pass
- Enforce business rules through code

## orderBy after scaffolding

Scaffolding from Sonamu UI regenerates the model file, leaving only the default `id-desc` case and
dropping any custom orderBy branches. The next build fails on the `exhaustive()` call:

```
Error: Argument of type 'xxx-asc' is not assignable to parameter of type 'never'
```

Every orderBy enum case in entity.json needs its own branch again:

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

Scaffolding overwrites the rest of the method too, so search cases and enhancers go the same way.

## Code Quality and Consistency

### DRY principle: use this.modelName

Use `this.modelName` instead of hardcoding the model name in error messages.

BAD: hardcoded model name

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

GOOD: use this.modelName

```typescript
// Common to all Models
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")(this.modelName, id));
}
```

Benefits:

- Prevents copy-paste mistakes: no need to update the model name when copying from another model
- Consistency: all models use the same pattern
- Maintainability: changing modelName in the constructor automatically reflects in all error messages

### Consistent i18n Key Usage

Use the same i18n keys consistently for the same purpose across the entire project.

BAD: duplicate i18n keys

```typescript
// Different keys used across models
throw new NotFoundException(SD("error.entityNotFound")(this.modelName, id));
throw new NotFoundException(SD("error.notFound")(this.modelName, id));
throw new NotFoundException(SD("notFound")(this.modelName, id));

// Search field error
throw new BadRequestException(SD("error.unknownSearchField")(params.search));
throw new BadRequestException(SD("error.invalidSearchField")(params.search));
```

GOOD: use standard i18n keys

```typescript
// Entity lookup failure - short and clear
throw new NotFoundException(SD("notFound")(this.modelName, id));

// Search field error - search namespace
throw new BadRequestException(SD("search.invalidField")(params.search));
```

Recommended i18n key patterns:
| Situation | i18n key | Used in |
|------|---------|--------|
| Entity lookup failure | `notFound` | findById |
| Invalid search field | `search.invalidField` | findMany search |
| Missing required field | `validation.required` | save validation |
| Unauthorized | `error.forbidden` | guards failure |
| Login required | `error.loginRequired` | Context.user null |

### Type Check Patterns

satisfies vs as const:

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

`satisfies` is what catches a wrong `orderBy` or `search` literal in a findMany default-params object,
where `as` would let it through.

### ListParams / findMany / SearchField synchronization

Three places declare the same search surface, and nothing checks them against each other:

1. `SearchField` enum values in `entity.json`
2. `ListParams` field definitions in `types.ts`
3. Filter/search handling code in `findMany` in `model.ts`

A `SearchField` value with no branch in `findMany` reaches `exhaustive()` and throws at runtime; a
`ListParams` field with no branch is accepted and silently ignored.

Approval-workflow entities are the common gap: the admin UI pattern of clicking a per-stage count to
see only that list needs a `status` filter in both `ListParams` and `findMany`, and scaffolded output
does not add one.

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

DO NOT - declaration/implementation mismatch:

```typescript
// SearchField "title" declared in entity.json
// model.ts only handles "id" case, "title" is commented out
if (params.search === "id") {
  // ...
} /* else if (params.search === "title") {
  // TODO: not implemented
} */
```

### Destructuring SaveParams

Destructuring a `SaveParams` to split off relation id arrays loses type information when the
assertion target is `any`:

```typescript
// The rest object becomes any — a later typo in a column name compiles
const { category_ids, ...data } = sp as any;

// Naming the concrete type keeps `data` checked against the entity's columns
const { category_ids, ...data } = sp as QuestionCollectionSaveParams;
```

The same applies when chaining Puri calls after a cast: an `as any` in the chain disables the check
that catches `.select()`'s string-argument bug (`references/puri.md`, SELECT section).
