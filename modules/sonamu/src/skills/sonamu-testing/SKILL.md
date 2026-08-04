---
name: sonamu-testing
description: Writes and runs Sonamu Vitest tests. Use when authoring a Model or API test, asserting on query behaviour, mocking a dependency, or when sonamu test fails to run. Covers bootstrap, test and testAs, createFixtureLoader, Naite.get assertions, expectQuery, expectUB, DevRunner, HMR integration, and parallel workers.
---

# Sonamu Test System

Sonamu provides a Vitest-based test environment. Each test is isolated in a transaction and automatically rolled back.

Example project: `sonamu/examples/miomock` — reference for real test code

Writing tests across many entities at once? `references/writing-plan.md` covers grouping them by
data dependency so fixtures and FK order do not fight you.

## Reference Map

| Need | Read |
| --- | --- |
| First test in a new project, end-to-end | `references/quick-start.md` |
| Planning what to test, order, batching for 10+ entities | `references/writing-plan.md` |
| bootstrap / test / testAs, CRUD, mocks, file structure, enum values | `references/patterns.md` |
| expectQuery, expectUB, Naite assertions, createFixtureLoader | `references/helpers.md` |
| Type errors in test code, nullable handling, partial/extend | `references/type-safety.md` |
| Failing for a non-obvious reason, complex entity graphs | `references/pitfalls.md` |
| `sonamu test` itself fails, HMR, parallel workers, vitest/sonamu config | `references/devrunner.md` |

Fixture generation via CLI (`fixture gen/fetch/explore`) and the 3-Tier DB structure live in the
`sonamu-fixture` skill, not here.

## Running Tests

Use `pnpm sonamu test` during development. It reuses a Vitest instance living inside the
`sonamu dev` process, so it is roughly 3.2x faster than a cold start and picks up source changes
through HMR. Assume the dev server is running; start it first if it is down. `pnpm test` is for CI.

```bash
# Start dev server if it's down
pnpm sonamu dev

# Tests during development (default)
pnpm sonamu test
pnpm sonamu test user.model
pnpm sonamu test user.model -p "findMany"   # filter by test name
pnpm sonamu test user.model -t              # print Naite traces

# CI environments only
pnpm test
```

Requires `test.devRunner.enabled: true` in `sonamu.config.ts`:

```typescript
export default defineConfig({
  test: {
    devRunner: { enabled: true }, // required for `pnpm sonamu test`
    // parallel: true,            // optional: separate DB per worker
    // maxWorkers: 4,
  },
});
```

## What a Model test needs in place

These are what make a test runnable, not a checklist to complete before you are allowed to write
one:

- The table exists — the entity's migration has been applied to the test DB, or `save` fails on
  a missing relation
- Nullable fields are handled in `types.ts` — generated `SaveParams` does not mark nullable
  props as `partial`, so omitting them is a type error until you add `partial` + `extend`
  (→ "Tasks to Do Immediately After Entity Creation" in `references/writing-plan.md`)
- Seed data for non-nullable FKs — a row that cannot exist without its parent needs that parent
  (→ "minimum seed data" in `sonamu-config`'s `references/database.md`)

## Core Test Writing Principles

### 1. Verify Actual Structure First

Tests written against a guessed structure fail on the field name, not on the behavior they meant to
check. Read the actual structure first:

```typescript
// STEP 1: Check entity.json
// - actual field names and types
// - nullable status
// - enum value list
// - relation structure

// STEP 2: Check types.ts
// - partial settings in SaveParams
// - nullish handling for nullable fields
// - _ids arrays for ManyToMany relations

// STEP 3: Check sonamu.generated.ts
// - Enum type definitions
// - Subset type structure
// - BaseSchema structure
```

Wrong approach:

```typescript
// BAD - writing tests based on guesses
test("create user", async () => {
  const [userId] = await UserModel.save([
    {
      name: "Test",
      status: "active", // may actually be "normal"
      role: "user", // may actually be "normal"
    },
  ]);
});
```

Correct approach:

```typescript
// GOOD - write after checking entity.json
// 1. Check user.entity.json:
//    - role: enum ["admin", "normal", "guest"]
//    - status: enum ["active", "inactive"] with dbDefault: "active"
//    - name: string (required)
//    - email: string (nullable)

// 2. Check user.types.ts:
//    - status, email are partial in SaveParams

// 3. Write test
test("create user", async () => {
  const [userId] = await UserModel.save([
    {
      name: "Test",
      role: "normal", // exact enum value from entity.json
      // status can be omitted since it has dbDefault
      // email can be omitted since it's nullable
    },
  ]);
});
```

### 2. Understanding Subset Structure

Access nested relations using dot notation.

```typescript
// Check Subset definition in entity.json
{
  "subsets": {
    "A": [
      "id",
      "title",
      "evaluation_form.id",           // BelongsToOne relation
      "evaluation_form.title",
      "evaluation_form.category.id",  // nested relation
      "evaluation_form.category.name"
    ]
  }
}

// Access in tests
test("fetch evaluation item", async () => {
  const { itemId } = await createTestEvaluationItemWithDeps();

  const item = await EvaluationItemModel.findById("A", itemId);

  // CORRECT - nested access via dot notation
  expect(item.evaluation_form.id).toBe(formId);
  expect(item.evaluation_form.category.name).toBe("Competency Evaluation");

  // WRONG - attempting direct FK access
  // expect(item.evaluation_form_id).toBe(formId);  // type error!
});
```

Rules:

- FK of BelongsToOne relation is defined as `relation.id` form in Subset
- Access in tests as `entity.relation.field` form
- Direct `entity.relation_id` access is not possible (not included in Subset)

### 3. Handling DECIMAL Types

DECIMAL types are returned from PostgreSQL with a `.00` suffix.

```typescript
// entity.json
{
  "props": [
    { "name": "salary", "type": "number", "precision": 10, "scale": 2 }
  ]
}

// Generated in migration
table.decimal("salary", 10, 2);  // DECIMAL(10,2)

// Writing tests
test("fetch salary info", async () => {
  const [userId] = await UserModel.save([{
    name: "Test",
    salary: 75000,  // input: number
  }]);

  const user = await UserModel.findById("A", userId);

  // WRONG - exact comparison may fail
  // expect(user.salary).toBe(75000);  // DB may return "75000.00"

  // CORRECT - pattern matching with toMatch()
  expect(String(user.salary)).toMatch(/^75000(\.00)?$/);

  // Or convert to number and compare
  expect(Number(user.salary)).toBe(75000);

  // Or range check
  expect(user.salary).toBeGreaterThanOrEqual(74999.99);
  expect(user.salary).toBeLessThanOrEqual(75000.01);
});
```

DECIMAL type comparison patterns:

```typescript
// Pattern 1: string pattern matching
expect(String(value)).toMatch(/^1234\.56$/);
expect(String(value)).toMatch(/^1234(\.56)?$/); // .56 optional

// Pattern 2: convert to number and compare
expect(Number(value)).toBe(1234.56);

// Pattern 3: range check (considering floating point errors)
expect(value).toBeCloseTo(1234.56, 2); // up to 2 decimal places

// Pattern 4: toMatchObject (when comparing objects)
expect(result).toMatchObject({
  salary: expect.any(Number), // type check only
});
```

## Rules

- `bootstrap(vi)` call required in all test files
- Each test is automatically rolled back (test isolation)
- Use `test` for unauthenticated tests, `testAs` for authenticated tests
- Define fixtures with `createFixtureLoader` and load with `loadFixtures`
- Use Naite to track and validate query/UpsertBuilder behavior
- `toMatchInlineSnapshot()` writes the expected value into the test file on its first run
- Configure Mocks globally in `setup-mocks.ts` or use `vi.spyOn` within tests
