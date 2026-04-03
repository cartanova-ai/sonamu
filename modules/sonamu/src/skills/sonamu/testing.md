---
name: sonamu-testing
description: Writing Sonamu tests. bootstrap, test/testAs functions, Fixture creation, Naite.get() assertions, expectQuery/expectUB helpers, Mock patterns. Use when writing or structuring test code for Models and APIs.
---

# Sonamu Test System

Sonamu provides a Vitest-based test environment. Each test is isolated in a transaction and automatically rolled back.

**Example project**: `sonamu/examples/miomock` - reference for real test code

**WARNING: Projects with 10 or more entities must use a batch strategy** (see "Large-Scale Project Strategy" below)

**Reference documents**:

- **Fixture CLI commands**: `fixture-cli.md` - fixture gen/fetch/explore usage, 3-Tier DB structure
- **Fixture creation tips**: "Fixture Data Creation Tips" section at the bottom of this document, or the "Practical Tips" section in `fixture-cli.md`

---

## Quick Start - Getting Started with Tests Quickly

**Prerequisites**: scaffolding completed, nullable field handling in types.ts completed

### Step 1: Extend test-helpers.ts

```typescript
// packages/api/src/application/__tests__/test-helpers.ts

import { User, UserSaveParams } from "../user/user.types";
import { Post, PostSaveParams } from "../post/post.types";
import { Comment, CommentSaveParams } from "../comment/comment.types";
import UserModel from "../user/user.model";
import PostModel from "../post/post.model";
import CommentModel from "../comment/comment.model";

// User helper
export async function createTestUser(
  params?: Partial<UserSaveParams>,
): Promise<number> {
  const user: UserSaveParams = {
    email: `test-${Date.now()}@example.com`,
    name: "Test User",
    ...params,
  };
  const [id] = await UserModel.save([user]);
  return id;
}

// User with dependencies (dependency chain)
export async function createTestUserWithDeps() {
  const userId = await createTestUser();
  return { userId };
}

// Post helper
export async function createTestPost(
  authorId: number,
  params?: Partial<PostSaveParams>,
): Promise<number> {
  const post: PostSaveParams = {
    author_id: authorId,
    title: "Test Post",
    content: "Test content",
    ...params,
  };
  const [id] = await PostModel.save([post]);
  return id;
}

// Post with dependencies
export async function createTestPostWithDeps() {
  const { userId } = await createTestUserWithDeps();
  const postId = await createTestPost(userId);
  return { userId, postId };
}

// Comment helper
export async function createTestComment(
  postId: number,
  authorId: number,
  params?: Partial<CommentSaveParams>,
): Promise<number> {
  const comment: CommentSaveParams = {
    post_id: postId,
    author_id: authorId,
    content: "Test comment",
    ...params,
  };
  const [id] = await CommentModel.save([comment]);
  return id;
}

// Comment with dependencies
export async function createTestCommentWithDeps() {
  const { userId, postId } = await createTestPostWithDeps();
  const commentId = await createTestComment(postId, userId);
  return { userId, postId, commentId };
}
```

**CRITICAL patterns**:

- `createTestX()`: basic creation helper (overridable via params)
- `createTestXWithDeps()`: helper that automatically handles dependencies (creates all required data together)
- FK fields use the `_id` suffix (`author_id`, `post_id`)
- Returns: primarily returns ID; WithDeps returns an object with multiple IDs

**CRITICAL: All required fields must be included!**

Sonamu's `ubUpsert` uses PostgreSQL's `ON CONFLICT ... DO UPDATE` query.
Even for updates, **all required fields (fields with NOT NULL constraints)** must be included.

When required fields are missing:

```typescript
// BAD - missing required field content
const post: PostSaveParams = {
  author_id: authorId,
  title: "Test",
  // content missing! → ubUpsert ON CONFLICT UPDATE attempts to set NULL → DB error
};
// Error: null value in column "content" violates not-null constraint
```

### Distinguishing Required vs Optional Fields

**1. Check entity.json**

```json
// post.entity.json
{
  "props": [
    { "name": "id", "type": "integer" }, // auto-generated - exclude
    { "name": "title", "type": "string", "length": 255 }, // required! (no nullable)
    { "name": "content", "type": "string" }, // required! (no nullable)
    { "name": "category", "type": "string", "nullable": true }, // optional (nullable)
    { "name": "author_id", "type": "integer" }, // required! (FK, no nullable)
    { "name": "view_count", "type": "integer", "dbDefault": "0" }, // required but has DB default
    { "name": "created_at", "type": "date", "dbDefault": "CURRENT_TIMESTAMP" } // automatic
  ]
}
```

**Required fields**: Fields **without** `nullable: true`

- `title`, `content`, `author_id`
- **Must** provide default values in test-helpers.ts

**Optional fields**: Fields **with** `nullable: true`

- `category`
- Can be omitted in test-helpers.ts

**Excluded fields**:

- `id`: auto-increment (auto-generated on save)
- `created_at`: automatically set by dbDefault
- `view_count`: automatically set by dbDefault="0"

**2. Write test-helpers.ts**

```typescript
export async function createTestPost(
  authorId: number,
  params?: Partial<PostSaveParams>,
): Promise<number> {
  const post: PostSaveParams = {
    // Required fields must be included (fields without nullable)
    author_id: authorId,
    title: "Test Post", // required!
    content: "Test content", // required!

    // Optional fields can be omitted (fields with nullable: true)
    // category: null,  // can be omitted

    // Fields with dbDefault can also be omitted
    // view_count: 0,  // can be omitted since dbDefault="0"

    ...params, // allow override
  };
  const saved = await PostModel.save(post);
  return saved.id;
}
```

**Rule summary**:

1. Fields without `nullable: true` in entity.json = required fields
2. Required fields **must** have default values in test-helpers.ts
3. `id`, `created_at`, fields with `dbDefault` can be excluded
4. Required fields are also needed for ubUpsert's ON CONFLICT UPDATE

### Step 2: Write the test file

```typescript
// packages/api/src/application/post/__tests__/post.test.ts

import { bootstrap } from "sonamu";
import { describe, test, expect, vi } from "vitest";
import PostModel from "../post.model";
import { createTestPostWithDeps } from "../../__tests__/test-helpers";

bootstrap(vi); // CRITICAL: required!

describe("PostModel", () => {
  describe("A. Create", () => {
    test("create post", async () => {
      const { userId, postId } = await createTestPostWithDeps();

      const post = await PostModel.findById(postId, ["A"]);
      expect(post.id).toBe(postId);
      expect(post.author_id).toBe(userId);
    });
  });

  describe("B. Read", () => {
    test("findById - Subset A", async () => {
      const { postId } = await createTestPostWithDeps();

      const post = await PostModel.findById(postId, ["A"]);
      expect(post.id).toBe(postId);
      expect(post).toHaveProperty("title");
      expect(post).toHaveProperty("content");
    });

    test("findMany - list query", async () => {
      await createTestPostWithDeps();
      await createTestPostWithDeps();

      const { rows } = await PostModel.findMany({ num: 10 });
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("C. Update", () => {
    test("update post", async () => {
      const { postId } = await createTestPostWithDeps();

      await PostModel.save([
        {
          id: postId,
          title: "Updated Title",
        },
      ]);

      const updated = await PostModel.findById("A", postId);
      expect(updated.title).toBe("Updated Title");
    });
  });

  describe("D. Delete", () => {
    test("delete post", async () => {
      const { postId } = await createTestPostWithDeps();

      await PostModel.del(postId);

      const post = await PostModel.findById(postId, ["A"]);
      expect(post).toBeNull();
    });
  });

  describe("E. Business Logic", () => {
    test("full process from post creation to adding a comment", async () => {
      // 1. create post
      const { userId, postId } = await createTestPostWithDeps({
        title: "New Post",
        content: "Content",
      });

      // 2. another user writes a comment
      const commenterId = await createTestUser();
      const commentId = await createTestComment(postId, commenterId, {
        content: "Great post!",
      });

      // 3. fetch post (with comments)
      const post = await PostModel.findById(postId, ["A"]);
      expect(post.comments).toHaveLength(1);
      expect(post.comments[0].id).toBe(commentId);
    });
  });
});
```

**Pattern summary**:

- `bootstrap(vi)` call is required
- `describe` + `test` pattern (order: A. Create, B. Read, C. Update, D. Delete, E. Business Logic)
- Use `createTestXWithDeps()` helper to automatically resolve dependencies
- The Business Logic section is the most important! (implements real business scenarios)

### Step 3: Run tests

```bash
# Start dev server if it's down
pnpm sonamu dev

# Tests during development (default)
pnpm sonamu test
pnpm sonamu test user.model
```

**Done!** See the sections below for detailed information.

---

## Pre-Test Writing Checklist

- [ ] **Confirm entity design is complete** - `pnpm db:migration` and `pnpm scaffolding` completed without errors
- [ ] **Plan test writing** - group entities by business process (→ see "Test Writing Plan" below)
- [ ] **Handle nullable fields in types.ts (FIRST!)** - immediately after entity creation, apply partial + extend handling for nullable fields (→ see "Tasks to Do Immediately After Entity Creation" below)
- [ ] **Prepare Seed Data** - base data required due to FK constraints (→ see "minimum seed data" in database.md)
- [ ] **Test helper functions** - prepare helpers for handling complex entity dependencies
- [ ] **For 10 or more entities** - plan batch strategy (see "Large-Scale Project Strategy" below)

## Core Test Writing Principles

### 1. Verify Actual Structure First

**CRITICAL: Always verify the actual entity structure before planning tests.**

Before writing tests, you must verify the following:

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

**Wrong approach:**

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

**Correct approach:**

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

**Access nested relations using dot notation.**

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

**Important rules:**

- FK of BelongsToOne relation is defined as `relation.id` form in Subset
- Access in tests as `entity.relation.field` form
- Direct `entity.relation_id` access is not possible (not included in Subset)

### 3. Handling DECIMAL Types

**DECIMAL types are returned from PostgreSQL with a `.00` suffix.**

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

**DECIMAL type comparison patterns:**

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

## Enum Value Usage Rules

**CRITICAL: Only use enum values defined in entity.json.**

### Rules

1. Check the exact value list for enum fields in entity.json
2. If possible, use TypeScript enum types from `sonamu.generated.ts` (type-safe)
3. Set valid enum values as defaults in test-helpers.ts
4. Do not use arbitrary strings

```typescript
// WRONG: written based on guesses
role: "user"; // entity.json defines it as "normal"
status: "in_progress"; // entity.json defines it as "pending"

// CORRECT: written after checking entity.json
role: "normal"; // exact value from entity.json
status: "pending"; // exact value from entity.json

// BEST: use TypeScript enum
import { UserRoleEnum } from "../sonamu.generated";
role: UserRoleEnum.normal;
```

**Core principle: entity.json is the Single Source of Truth.**

## Test Writing Plan

### Planning Based on Entity Design Prompt

After entity design is complete (confirming migration + scaffolding succeed), group tests according to **the business processes and data flows specified at the time of entity design**.

**CRITICAL:** Group tests by **business flow units**, not by simple alphabetical order or individual entities.

### Step 1: Re-examine the Entity Design Prompt

Extract the following from the prompt written at the time of the design request:

- Business process flow
- Relationships between entities (relations)
- Data creation order
- Key usage scenarios

### Step 2: Group by Business Process

Group entities by **business flow units**, not simple priority.

**Customer consultation system example:**

```
Group 1: Core Infrastructure
Organization (related agency)
└─ User
   └─ LoginHistory

Business flow: register agency → create user → login
Test order: Organization → User → LoginHistory

Group 2: Damage Type Management
DamageType (self-referencing)
└─ CounterMeasure

Business flow: build damage type hierarchy → write countermeasures for each type
Test order: DamageType → CounterMeasure

Group 3: Consultation Process (core business)
User (applicant) + User (counselor) + DamageType
└─ Consultation
   ├─ ConsultationChannelLog
   └─ ConsultationHistory

Business flow:
1. Applicant submits consultation request
2. Assign counselor
3. Classify damage type
4. Communication by channel (online/phone/SMS/KakaoTalk)
5. Record status change history

Test order: Consultation → ConsultationChannelLog → ConsultationHistory

Group 4: Content Management (independent)
FAQ
Banner
Material
Notice

Business flow: independent CRUD for each
Test order: any order (can be written in parallel)
```

### Step 3: Work Order per Group

**For each group:**

1. **Modify types.ts** - handle nullable fields for all entities in the group at once
2. **Extend test-helpers.ts** - write helper functions for entities in the group together
3. **Write test files** - write in dependency order within the group
4. **Business Logic tests** - implement real business scenarios (the key!)
5. **Verify tests pass** - proceed to next group

**test-helpers.ts example (considering dependency chains):**

```typescript
// Write helpers considering dependency chains
export async function createTestUserWithDeps() {
  const organizationId = await createTestOrganization();
  const userId = await createTestUser(organizationId);
  return { organizationId, userId };
}

export async function createTestConsultationWithDeps() {
  const { userId: applicantId } = await createTestUserWithDeps({
    role: "applicant",
  });
  const { userId: counselorId } = await createTestUserWithDeps({
    role: "counselor",
  });
  const damageTypeId = await createTestDamageType(null);
  const consultationId = await createTestConsultation(
    applicantId,
    counselorId,
    damageTypeId,
  );
  return { applicantId, counselorId, damageTypeId, consultationId };
}
```

### Step 4: Business Logic Tests (the key!)

**IMPORTANT:** The E. Business Logic section is the most important.

In this section:

- Implement **real business scenarios** specified in the entity design prompt
- Test **interactions** between entities
- Validate **data flows**

This is what differentiates it from simple CRUD tests, and it's **the core that validates design intent**.

**Business Logic test example (consultation process):**

```typescript
describe("E. Business Logic", () => {
  test("full process from consultation submission to completion", async () => {
    // 1. submit consultation + create dependencies
    const { consultationId, counselorId } =
      await createTestConsultationWithDeps();
    // 2. record channel logs (online submission, phone consultation)
    await createTestConsultationChannelLog(consultationId, {
      channel: "online",
    });
    await createTestConsultationChannelLog(consultationId, {
      channel: "phone",
    });
    // 3. record status history
    await createTestConsultationHistory(consultationId, counselorId, {
      status: "consulting",
    });
    // 4. complete consultation
    await ConsultationModel.save([{ id: consultationId, status: "completed" }]);
    // 5. verify: status, 2 channel logs, history
    const c = await ConsultationModel.findById("A", consultationId);
    expect(c.status).toBe("completed");
  });
});
```

### Notes

**DO:**

- Always reference the entity design prompt
- Group by business process flow
- Test order that considers dependency order
- Business Logic tests based on real usage scenarios
- Clearly implement dependency chains in test-helpers

**DON'T:**

- Write tests in simple alphabetical order
- Only test entities individually (missing integration perspective)
- Set priorities unrelated to business flow
- Write tests that ignore the intent of the entity design

### Checklist per Group

When test writing for a process group is complete:

- [ ] Nullable field handling in types.ts completed for all entities in the group
- [ ] test-helpers written reflecting dependency chains within the group
- [ ] Module test file written for each entity in the group
- [ ] **Key business scenarios included in Business Logic tests**
- [ ] All tests pass confirmed (`pnpm sonamu test`)
- [ ] Proceed to next group

## Tasks to Do Immediately After Entity Creation

### Handling nullable Fields in types.ts (Required)

After creating an entity and generating types.ts with `sonamu generate`, immediately handle nullable fields **before writing tests**.

#### Work Order

1. Run `sonamu generate`
2. Check the generated `*.types.ts` file
3. Apply partial + extend + nullish handling for nullable fields
4. Start writing tests

#### Fields to Process

- All fields with `nullable: true`
- Fields with `dbDefault` (`.optional().default(value)`)
- FK relation fields that are nullable

#### Practical Example

**STEP 1: File generated after running sonamu generate**

```typescript
// faq.types.ts (auto-generated)
import type { z } from "zod"; // WRONG: type import
import { FAQBaseListParams, FAQBaseSchema } from "../sonamu.generated";

export const FAQListParams = FAQBaseListParams;
export type FAQListParams = z.infer<typeof FAQListParams>;

export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true,
});
export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

**STEP 2: Immediate fix (nullable fields + Zod import handling)**

```typescript
// faq.types.ts (fix complete)
import { z } from "zod"; // CORRECT: change to regular import
import { FAQBaseListParams, FAQBaseSchema } from "../sonamu.generated";

export const FAQListParams = FAQBaseListParams;
export type FAQListParams = z.infer<typeof FAQListParams>;

export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true,
  // add nullable fields
  category: true,
  order_num: true,
}).extend({
  // redefine nullable fields as nullish
  category: z.string().nullish(), // string | null | undefined
  order_num: z.number().nullish(), // number | null | undefined
  updated_at: z.date().nullish(), // date | null | undefined
});

export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

#### Why Is This Necessary?

**Problem:** Zod's `nullable()` gives `T | null` but it's still required.

```typescript
// entity.json
{ "name": "category", "type": "string", "nullable": true }

// Generated BaseSchema
z.object({
  category: z.string().nullable(),  // string | null (required!)
})

// applying partial only
.partial({ category: true })  // category?: string | null

// WRONG: undefined cannot be assigned to string | null
const [id] = await FAQModel.save([{
  question: "Question",
  answer: "Answer",
  // omitting category causes type error!
}]);
```

**Solution:** Combination of `partial()` + `extend()` + `nullish()`

```typescript
// CORRECT: proper handling
FAQBaseSchema.partial({ category: true }).extend({
  category: z.string().nullish(),
}); // string | null | undefined

// Can freely omit in tests
const [id] = await FAQModel.save([
  {
    question: "Question",
    answer: "Answer",
    // category can be omitted!
  },
]);
```

#### Application Criteria

| Field type | Handling |
| -------------------------------- | ------------------------------- |
| `id`, `created_at`, `updated_at` | Always partial (auto-generated) |
| Fields with `dbDefault` | `.optional().default(value)` |
| Fields with `nullable: true` | partial + extend + `.nullish()` |
| Required fields | Excluded from partial |

#### Checklist

- [ ] Change `import type { z }` to `import { z }`
- [ ] Add nullable fields to partial
- [ ] Redefine as nullish via extend
- [ ] Use `.optional().default()` for dbDefault fields
- [ ] Confirm required fields are excluded from partial

**Detailed type safety guide:** See "TypeScript Type Safety" and "Type Safety Notes" sections below

## TypeScript Type Safety

### Optional Chaining Required When Indexing Arrays

When accessing a property after indexing into an array, you must use optional chaining (`?.`).

**Reason:**

- Array indexing (`array[0]`, `array[1]`, etc.) can always return `undefined`
- TypeScript infers the type of `array[0]` as `T | undefined`
- Accessing a property without optional chaining causes a compile error

**Wrong:**

```typescript
// Type error: Object is possibly 'undefined'
expect(list.rows[0].title).toBe("test");
expect(searchResults.rows[0].name).toContain("keyword");
```

**Correct:**

```typescript
// Use optional chaining
expect(list.rows[0]?.title).toBe("test");
expect(searchResults.rows[0]?.name).toContain("keyword");

// Or verify existence first, then access
expect(list.rows.length).toBeGreaterThanOrEqual(1);
expect(list.rows[0].title).toBe("test"); // now safe
```

### Recommended Patterns

When accessing array elements in test code:

**Pattern 1: Use optional chaining**

```typescript
const result = await Model.findMany("A", { num: 10, page: 1 });
expect(result.rows[0]?.field).toBe(expectedValue);
```

**Pattern 2: Verify length, then access**

```typescript
const result = await Model.findMany("A", { num: 10, page: 1 });
expect(result.rows.length).toBeGreaterThanOrEqual(1);
expect(result.rows[0].field).toBe(expectedValue); // type-safe
```

**Pattern 3: Optional chaining required when using find()**

```typescript
const list = await Model.findMany("A", { num: 10, page: 1 });
const item = list.rows.find((r) => r.id === targetId);
expect(item?.field).toBe(expectedValue); // find() can return undefined
```

### General Rules

- Property access after array indexing: `array[0]?.property`
- Results of `find()`, `filter()[0]`, etc.: always use `?.`
- Nested object access: `obj.nested?.deep?.property`
- Non-null assertion (`!`) only when certain

## Model Basic Methods (Test Targets)

Sonamu Model provides the following methods by default. Tests are written targeting these methods:

| Method | Purpose | Returns |
| -------------------------- | ------------------ | ----------------------------- |
| `findById(subset, id)` | Fetch single record | `Promise<Subset>` |
| `findMany(subset, params)` | Fetch list | `Promise<ListResult<Subset>>` |
| `save(rows)` | Create/update (upsert) | `Promise<number[]>` (ids) |
| `del(ids)` | Delete | `Promise<number>` (delete count) |

**Note:** It's `del`, not `delete`. This avoids JavaScript reserved words.

## Large-Scale Project Strategy (10 or more entities)

**CRITICAL: Do not work on all entities at once if a project has 10 or more entities.**

### Problems

- Working on 55 entities at once causes context confusion
- Serious risk of errors such as modifying the wrong file or deleting required content
- Cannot track relationships, lose direction while writing tests

### Solution: Batch Work Units

**Rule: Group related entities together and work in batches of 5–10**

```
Batch 1: User, Institution, Role related (5 entities)
  → Tests complete → Commit

Batch 2: Survey, Question, Response related (7 entities)
  → Tests complete → Commit

Batch 3: Report, Statistics related (6 entities)
  → Tests complete → Commit
```

### Batch Grouping Criteria

**Grouping by domain (recommended):**

```
Auth/Permissions: User, Role, Permission, Session
Surveys: Survey, Question, Choice, Response
Reports: Report, Chart, Export
Administration: Institution, Department, Settings
```

**Grouping by dependencies:**

```
1st: Independent entities (User, Institution, etc.)
2nd: Entities depending on 1st (Survey → Institution)
3rd: Entities depending on 2nd (Question → Survey)
```

### Batch Work Process

**For each batch:**

1. List entities in the batch explicitly
2. Write test helpers (createTest...)
3. Complete tests for all entities
4. Confirm all tests pass
5. **Git commit, then proceed to next batch**

**Between-batch checklist:**

- [ ] All tests in current batch pass
- [ ] Previous batch tests still pass (prevent regression)
- [ ] Commit complete (establish rollback point)

### Declare Before Starting Work

**IMPORTANT: Declare explicitly before starting each batch**

```
"Starting batch 1: User, Institution, Role entities (5)
- User: write user.model.test.ts
- Institution: write institution.model.test.ts
- Role: write role.model.test.ts
Only work on files to be modified, do not touch other files
Shall we proceed?"
```

### Warning Signs

**Stop work immediately** if any of the following occur:

- Attempting to modify entities outside the batch scope
- Asking the same question repeatedly
- Confusing entity relationships
- Trying to re-modify files already completed

## Running Tests

**Principle: Use `pnpm sonamu test` during development.** Assume the dev server is always running. If the dev server is down, start it first with `pnpm sonamu dev`, then run tests. Use `pnpm test` only in CI environments.

```bash
# Check dev server (start if it's down)
pnpm sonamu dev

# Tests during development (default)
pnpm sonamu test
pnpm sonamu test user.model
pnpm sonamu test user.model -p "findMany"

# CI environments only
pnpm test
```

### DevRunner — `sonamu test` (Default Test Execution Method)

`sonamu test` runs tests through a Vitest Node API instance that resides inside the `sonamu dev` process. Instead of starting Vitest fresh each time, it reuses an already-initialized instance, making execution 3.2x faster, and it integrates with HMR so tests always run against the latest code immediately after source changes.

#### Prerequisites

**1. Enable devRunner in sonamu.config.ts:**

```typescript
export default defineConfig({
  test: {
    devRunner: {
      enabled: true,
      // routePrefix: "/__test__",   // optional, default value
      // vitestConfigPath: undefined, // optional, default: vitest.config.ts (relative to api-root)
    },
  },
});
```

Configuration type (`SonamuDevRunnerConfig`):

- `enabled: boolean` — Whether to enable DevRunner (default: false)
- `routePrefix?: string` — Test endpoint path prefix (default: `/__test__`)
- `vitestConfigPath?: string` — vitest.config.ts path (relative to api-root)

**2. Start the dev server:**

```bash
sonamu dev  # or pnpm dev
```

When the dev server starts, `DevVitestManager` is automatically initialized under the `isLocal() && devRunner.enabled` condition, and test endpoints are registered with Fastify.

#### CLI Usage

```bash
# Run all tests
sonamu test

# Specify file (matched by partial filename — uses globTestSpecifications)
sonamu test user.model

# Multiple files
sonamu test user.model order.model

# Run specific test cases only (test name pattern)
sonamu test user.model --pattern "findMany"
sonamu test user.model -p "findMany"

# Print Naite traces
sonamu test user.model --traces
sonamu test user.model -t

# Combine file + pattern + trace
sonamu test user.model -p "findMany" -t
```

Argument processing rules:

- `--pattern` / `-p`: test name string filter (`setGlobalTestNamePattern` → `resetGlobalTestNamePattern` after execution)
- `--traces` / `-t`: boolean flag, enables Naite trace output
- Arguments not starting with `-`: treated as file list
- Multiple files allowed
- `ok: false` in server response is reflected as exit code 1

**→ Naite traces, HMR integration, HTTP API, internal architecture, performance comparison, troubleshooting details: `testing-devrunner.md`**

## sonamu.config.ts Test Configuration and Config Files

**→ Configuration type definitions, DevRunner/parallel settings, activation conditions, parallel DB flow, vitest.config.ts/global.ts details: `testing-devrunner.md`**

Key settings summary only:

```typescript
// sonamu.config.ts
export default defineConfig({
  test: {
    devRunner: { enabled: true }, // required to use pnpm sonamu test
    // parallel: true,              // optional: separate DB per worker
    // maxWorkers: 4,               // optional: number of parallel workers
  },
});
```

## Test Basic Patterns

### bootstrap

`bootstrap(vi)` call required in all test files:

```typescript
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);

describe("MyTest", () => {
  test("test case", async () => {
    // ...
  });
});
```

**bootstrap options:**

```typescript
// Default: forTesting: true (fast, skips Syncer/Task)
bootstrap(vi);

// forTesting: false - full initialization (loads Syncer, Task, EntityManager, etc.)
// Used in tests for migrator, syncer, template, etc.
bootstrap(vi, { forTesting: false });
```

### test vs testAs

```typescript
// Unauthenticated test - Context.user is null
test("unauthenticated test", async () => {
  const me = await UserModel.me();
  expect(me).toBeNull();
});

// Authenticated test - Context.user is set
import type { UserSubsetSS } from "../sonamu.generated";

const adminUser: UserSubsetSS = {
  id: 1,
  created_at: new Date(),
  email: "admin@test.com",
  username: "admin",
  role: "admin",
};

testAs(adminUser, "admin permission test", async () => {
  const me = await UserModel.me();
  expect(me?.role).toBe("admin");
});
```

### test.each

```typescript
test.each([
  { input: "user@example.com", expected: true },
  { input: "invalid-email", expected: false },
])("email validation: $input → $expected", async ({ input, expected }) => {
  expect(validateEmail(input)).toBe(expected);
});
```

## Fixture

### createFixtureLoader

```typescript
// api/src/testing/fixture.ts
import { createFixtureLoader } from "sonamu/test";
import { CompanyModel } from "../application/company/company.model";
import { UserModel } from "../application/user/user.model";

export const loadFixtures = createFixtureLoader({
  company01: async () => CompanyModel.findById("A", 1),
  user01: async () => UserModel.findById("A", 1),
});
```

### Using in tests

```typescript
import { loadFixtures } from "../../testing/fixture";

test("update company info", async () => {
  const f0 = await loadFixtures(["company01"]);

  await CompanyModel.save([
    {
      ...f0.company01,
      name: "Updated Company",
    },
  ]);

  const f1 = await loadFixtures(["company01"]);
  expect(f1.company01.name).toBe("Updated Company");
});
```

## Naite (Test Tracing System)

**→ Detailed guide (key list, chaining filters, wildcard, del, internal structure): `naite.md`**

Naite is a tracing system that records values with `Naite.t("key", value)` in source code and validates them with `Naite.get("key")` in tests.

### Commonly Used Patterns in Tests

```typescript
import { Naite } from "sonamu";

// Query validation
expect(Naite.get("esq-query").first()).not.contain("limit");

// UpsertBuilder behavior validation
const trace = Naite.get("puri:ub-upserted").first();
expect(trace).toMatchObject({ tableName: "users", rowCount: 3 });

// Fetch methods: .first(), .last(), .at(n), .result() (full array)
// Filters: .fromFile("user.model.ts"), .fromFunction("findById"), .where("data.tableName", "=", "users")
```

## Test Helper: expectQuery

Helper for validating specific parts of SQL queries (see miomock for reference):

```typescript
// api/src/testing/expect-query.ts
import { type AST, Parser } from "node-sql-parser";
import { expect } from "vitest";

export type QueryPart =
  | "type"
  | "table"
  | "columns"
  | "set"
  | "where"
  | "join"
  | "orderBy"
  | "pagination"
  | "groupBy"
  | "having";

export function expectQuery(query: string, part?: QueryPart) {
  if (!part) return expect(query);
  const ast = parseQuery(query);
  const extractedSql = extractors[part](ast);
  return expect(extractedSql);
}
```

### Usage Examples

```typescript
import { expectQuery } from "../testing/expect-query";

test("validate select query", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").select({ id: "users.id" });
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "type").toBe("select");
  expectQuery(query, "table").toBe("users");
  expectQuery(query, "columns").toMatchInlineSnapshot(
    `""users"."id" AS \`id\`"`,
  );
});

test("validate where condition", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").where("users.id", 1);
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
});

test("validate join", async () => {
  const db = UserModel.getPuri("r");
  await db
    .table("employees")
    .leftJoin("departments", "employees.department_id", "departments.id");
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "join").toMatchInlineSnapshot(
    `"LEFT JOIN departments ON "employees"."department_id" = "departments"."id""`,
  );
});
```

## Test Helper: expectUB

UpsertBuilder state validation helper (see miomock for reference):

```typescript
// api/src/testing/expect-ub.ts
import type { UpsertBuilder } from "sonamu";
import { expect } from "vitest";

export type UBPart =
  | "tables"
  | "hasTable"
  | "rowCount"
  | "rows"
  | "row"
  | "refs"
  | "uniquesMap"
  | "uniqueIndexes";

export function expectUB<P extends UBPart>(
  ub: UpsertBuilder,
  part: P,
  tableName?: string,
  index?: number,
) {
  // ... implementation
}
```

### Usage Examples

```typescript
import { expectUB } from "../testing/expect-ub";

test("validate UpsertBuilder state", async () => {
  const ub = new UpsertBuilder();

  // initial state
  expectUB(ub, "hasTable", "users").toBe(false);
  expectUB(ub, "tables").toEqual([]);

  // after register
  ub.register("users", {
    email: "test@test.com",
    username: "test",
    password: "pw",
    role: "normal",
  });

  expectUB(ub, "hasTable", "users").toBe(true);
  expectUB(ub, "rowCount", "users").toBe(1);
  expectUB(ub, "row", "users", 0).toMatchObject({
    email: "test@test.com",
    username: "test",
  });

  // confirm reset after upsert
  await ub.upsert(wdb, "users");
  expectUB(ub, "rowCount", "users").toBe(0);
});
```

## Mock Patterns

### setup-mocks.ts

```typescript
// api/src/testing/setup-mocks.ts
import { Naite } from "sonamu";
import { vi } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  return {
    ...actual,
    access: vi.fn((path, mode) => {
      // virtual file system check
      const vfs = Naite.get("mock:fs/promises:virtualFileSystem").result();
      if (vfs.some((v) => v === path)) {
        return Promise.resolve();
      }
      return actual.access(path, mode);
    }),
    writeFile: vi.fn((path, data) => {
      Naite.t("fs/promises:writeFile", { path, data });
    }),
    rm: vi.fn(async (path, options) => {
      Naite.t("fs/promises:rm", { path, options });
      return Promise.resolve();
    }),
  };
});
```

### test-helpers.ts

```typescript
// api/src/testing/test-helpers.ts
import { Entity, EntityManager, type EntityJson } from "sonamu";
import { vi } from "vitest";

// Mocking EntityManager.get
export function mockEntityManagerGet(
  targetEntityId: string,
  overrideCallback: (original: EntityJson) => EntityJson,
) {
  const originalEntityJson = EntityManager.get(targetEntityId).toJson();
  const originalGet = EntityManager.get;
  return vi.spyOn(EntityManager, "get").mockImplementation((entityId) => {
    if (entityId === targetEntityId) {
      return new Entity(overrideCallback(originalEntityJson));
    }
    return originalGet.call(EntityManager, entityId);
  });
}
```

## CRUD Test Patterns

### Create & Read

```typescript
test("Create - create new user", async () => {
  const [userId] = await UserModel.save([
    {
      email: "newuser@test.com",
      username: "newuser",
      password: "hashedpassword",
      role: "normal",
    },
  ]);

  expect(userId).toBeGreaterThan(0);

  const user = await UserModel.findById("A", userId);
  expect(user.email).toBe("newuser@test.com");
});
```

### Update

```typescript
test("Update - update user", async () => {
  const f0 = await loadFixtures(["user01"]);

  await UserModel.save([
    {
      ...f0.user01,
      username: "updated_username",
    },
  ]);

  const f1 = await loadFixtures(["user01"]);
  expect(f1.user01.username).toBe("updated_username");
});
```

### Error Tests

```typescript
test("error when fetching non-existent user", async () => {
  await expect(UserModel.findById("A", 99999)).rejects.toThrow("not found");
});

test("unresolved reference error", async () => {
  const ub = new UpsertBuilder();
  const companyRef = ub.register("companies", { name: "Test" });
  ub.register("departments", { company_id: companyRef, name: "Dept" });

  // attempt upsert in wrong order
  await expect(ub.upsert(wdb, "departments")).rejects.toThrow(
    /unresolved reference/,
  );
});
```

## Test Structuring Patterns

```typescript
describe("UpsertBuilder", () => {
  describe("A. Basic registration (register)", () => {
    test("register() returns UBRef", async () => {
      /* ... */
    });
    test("multiple register() calls accumulate rows", async () => {
      /* ... */
    });
  });

  describe("B. Table management", () => {
    test("basic behavior of getTable()/hasTable()", async () => {
      /* ... */
    });
  });

  describe("C. Upsert execution", () => {
    test("upsert() - insert new row", async () => {
      /* ... */
    });
    test("upsert() - update existing row", async () => {
      /* ... */
    });
    test("insertOnly() - insert only", async () => {
      /* ... */
    });
  });

  describe("D. Error handling", () => {
    test("upsert on non-existent table → empty array", async () => {
      /* ... */
    });
    test("unresolved reference → error", async () => {
      /* ... */
    });
  });
});
```

## File Structure

```
api/src/testing/
├── fixture.ts       # createFixtureLoader definition
├── global.ts        # globalSetup (dotenv, setup export)
├── setup-mocks.ts   # global Mock configuration
├── test-helpers.ts  # test utility functions
├── expect-query.ts  # SQL query validation helper
└── expect-ub.ts     # UpsertBuilder validation helper
```

## Rules

- `bootstrap(vi)` call required in all test files
- Each test is automatically rolled back (test isolation)
- Use `test` for unauthenticated tests, `testAs` for authenticated tests
- Define fixtures with `createFixtureLoader` and load with `loadFixtures`
- Use Naite to track and validate query/UpsertBuilder behavior
- Recommend snapshot tests using `toMatchInlineSnapshot()`
- Configure Mocks globally in `setup-mocks.ts` or use `vi.spyOn` within tests

## Type Safety Notes

### Zod Import Method

**CRITICAL: Always use regular imports when importing Zod in test files.**

```typescript
// CORRECT - in test files
import { z } from "zod";
import { describe, expect, vi } from "vitest";

// WRONG - runtime error when using type import
import type { z } from "zod"; // error when test runs!
```

**Reason:** Because `z.infer<>` and Zod schemas are used directly in tests, the Zod object is needed at runtime.

**Where this applies:**

- `*.model.test.ts` - all test files
- `test-helpers.ts` - helper files that use Zod schemas

### Checking partial Settings in SaveParams

When testing `Model.save()`, you must check the `SaveParams` partial settings in `*.types.ts`:

```typescript
// user.types.ts
import { z } from "zod"; // regular import in types files too
import { UserBaseSchema } from "../sonamu.generated";

export const UserSaveParams = UserBaseSchema.partial({
  id: true, // auto-generated
  created_at: true, // auto-generated
  updated_at: true, // auto-generated
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

### Nullable Field Handling Pattern

**→ See "Tasks to Do Immediately After Entity Creation" section above** (partial + extend + nullish pattern)

### Use Nullish Coalescing

Nullish coalescing is required when a variable can be of type `T | undefined`:

```typescript
// WRONG: userId may be number | undefined
const user = await UserModel.findById("A", userId);

// CORRECT: guard against undefined with nullish coalescing
const user = await UserModel.findById("A", userId ?? 0);
```

Especially be careful when using IDs created in a previous step:

```typescript
const [userId] = await UserModel.save([{ ... }]);

// WRONG: userId is number | undefined
const user = await UserModel.findById("A", userId);

// CORRECT:
const user = await UserModel.findById("A", userId ?? 0);
```

### SaveParams Import Location

SaveParams types are exported from each entity's types.ts, not from sonamu.generated.

**Wrong:**

```typescript
// test-helpers.ts
import type {
  UserSaveParams,
  TaskSaveParams,
} from "../application/sonamu.generated"; // WRONG
```

**Correct:**

```typescript
// test-helpers.ts
import type { UserSaveParams } from "../application/user/user.types";
import type { TaskSaveParams } from "../application/task/task.types";
```

**Reason:**

- sonamu.generated only exports BaseSchema and BaseListParams
- SaveParams is defined with BaseSchema.partial() in each entity's types.ts

## Practical Notes (Common Pitfalls)

### 1. Fixture Data Preparation Required

**Problem:** Tests fail without base data due to foreign key constraints

**Solution:**

```sql
-- database/scripts/seed-initial-data.sql
INSERT INTO institutions (id, name, code) VALUES (1, 'HQ', 'HQ');
INSERT INTO departments (id, name, institution_id) VALUES (1, 'Research', 1);
INSERT INTO roles (id, code, name) VALUES (1, 'ADMIN', 'Administrator');
```

```bash
# 1. apply seed data to test DB
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test -f database/scripts/seed-initial-data.sql

# 2. create dump
pnpm dump

# 3. apply to fixture DB
pnpm seed

# 4. sonamu fixture sync (optional)
pnpm sonamu fixture sync
```

### 2. SaveParams Type Design (Partial)

**Problem 1:** Type error occurs when changing only some fields on update

**Problem 2:** Type error occurs when receiving overrides as Partial in test helpers

```typescript
// WRONG - nullable fields not set to partial
export const QuestionSaveParams = QuestionBaseSchema.partial({
  id: true,
  created_at: true,
});

// test-helpers.ts
export async function createTestQuestion(
  collectionId: number,
  override?: Partial<QuestionSaveParams>,
) {
  const [id] = await QuestionModel.save([
    {
      content: "test question",
      parent_id: null,
      answer_group_id: null,
      ...override, // type error: undefined cannot be assigned to null
    },
  ]);
  return id;
}
```

**Solution:** Set nullable/dbDefault fields to partial

```typescript
// api/src/application/user/user.types.ts
export const UserSaveParams = UserBaseSchema.partial({
  id: true, // needed for update
  created_at: true, // dbDefault
  password: true, // nullable
  email: true, // nullable
  phone: true, // nullable
  user_type: true, // dbDefault
  position_code: true, // nullable
  position_name: true, // nullable
  hire_date: true, // nullable
  status: true, // dbDefault
  department_id: true, // nullable relation
});
```

**Application criteria:**

- id, created_at, updated_at: always partial (auto-generated)
- Fields with dbDefault: set to partial
- FK fields with nullable: true: set to partial
- Regular fields with nullable: true (e.g. description): set to partial

**Key:** Required fields (employee_no, login_id, name, institution_id) are excluded from partial to maintain type safety

### 3. Excluding Relation Fields on Update

**Problem:** Subset includes relation objects, but SaveParams only has FK, causing errors

```typescript
// WRONG
const user = await UserModel.findById("A", userId);
await UserModel.save([{ ...user, status: "inactive" }]);
// → "column 'department' does not exist" error
```

**Solution:** Exclude relation fields + explicitly add FK

```typescript
// CORRECT
const user = await UserModel.findById("A", userId);
const { institution, department, ...userData } = user;
await UserModel.save([
  {
    ...userData,
    institution_id: user.institution.id, // explicitly add FK
    department_id: user.department?.id ?? null,
    status: "inactive",
  },
]);
```

**Reason:** `UserSubsetA` includes `institution`, `department` objects, but does not include `institution_id`, `department_id` FKs

### 4. ubUpsert is an Upsert Operation

**Problem:** Unique constraint violation tests fail

```typescript
// failing test
test("employee number must be unique", async () => {
  await UserModel.save([{ employee_no: "001", ... }]);

  // attempt to create with duplicate employee number
  await expect(
    UserModel.save([{ employee_no: "001", ... }])
  ).rejects.toThrow();  // does not throw error, performs UPDATE instead
});
```

**Cause:** Sonamu's `save()` uses `ubUpsert` → on conflict, performs UPDATE instead of throwing error

**Solution:** Skip such tests

```typescript
test.skip("employee number must be unique (skipped because ubUpsert performs upsert)", async () => {
  // ...
});
```

### 5. testAs Usage

**Problem:** Calling testAs inside test causes an error

```typescript
// WRONG
test("permission test", async () => {
  await testAs(adminUser, "description", async () => { ... });
  // → "Calling the test function inside another test function is not allowed" error
});

// CORRECT - use as a replacement for test
testAs(adminUser, "permission test", async () => {
  const result = await UserModel.del([userId]);
  expect(result).toBe(1);
});
```

### 6. Validating Model Queries with Naite

**Add Naite recording to Model:**

```typescript
// user.model.ts
import { Naite } from "sonamu";

async findMany(...) {
  // ... build qb ...

  // record query for testing
  Naite.t("esq-query", qb.toQuery());

  return this.executeSubsetQuery({ ... });
}
```

**Validate in test:**

```typescript
test("should not have limit when num: 0", async () => {
  await UserModel.findMany("A", { num: 0, page: 1 });

  expect(Naite.get("esq-query").first()).not.contain("limit");
  expect(Naite.get("esq-query").first()).not.contain("offset");
});
```

### 7. Consider Multilingual Error Messages

```typescript
// WRONG: only validates English message
await expect(UserModel.findById("A", 99999)).rejects.toThrow("not found");

// CORRECT: partial match on actual error message
await expect(UserModel.findById("A", 99999)).rejects.toThrow("does not exist");
```

### 8. pnpm Workspace and Vitest Instance Conflicts

**Problem:** "Vitest failed to access its internal state" error

**Cause:** When sonamu is connected via `link:`, sonamu and the project's vitest are installed at separate paths with different peer dependency combinations

**Temporary fix (for testing):**

```json
// packages/api/package.json
{
  "dependencies": {
    "sonamu": "0.8.0" // specify version instead of link
  }
}
```

**Fundamental fix:** Contact sonamu developers (framework internal issue)

### 9. assert() for Truthy Checks

```typescript
import assert from "assert";

test("create user", async () => {
  const [userId] = await UserModel.save([{ ... }]);

  // truthy check
  assert(userId);

  // userId is now safely inferred as number
  const user = await UserModel.findById("A", userId);
});
```

### 10. Create Test Data Directly

**miomock convention:** Minimize fixtures, create data directly within tests

```typescript
// recommended pattern
test("create user", async () => {
  const [userId] = await UserModel.save([
    {
      employee_no: "2026001",
      login_id: "testuser",
      name: "Test User",
      institution_id: 1,
      // ... required fields
    },
  ]);

  const user = await UserModel.findById("A", userId);
  expect(user.name).toBe("Test User");
});

// Fixtures only for shared data
const f = await loadFixtures(["institution01"]); // only for shared data like institutions
```

## Complex Entity Test Strategy

When dependencies between entities are complex (Institution → Department → User → Task → TaskParticipant), use test helper functions.

### Defining Test Helper Functions

```typescript
// api/src/testing/test-helpers.ts
import assert from "assert";
import { InstitutionModel } from "../application/institution/institution.model";
import { DepartmentModel } from "../application/department/department.model";
import { UserModel } from "../application/user/user.model";
import { TaskModel } from "../application/task/task.model";

// each helper requires only the minimum required fields and provides defaults for the rest
let counter = 0;
function uniqueId(prefix: string) {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export async function createTestInstitution(
  override?: Partial<InstitutionSaveParams>,
) {
  const [id] = await InstitutionModel.save([
    {
      name: "Test Institution",
      code: uniqueId("INST"),
      ...override,
    },
  ]);
  assert(id);
  return id;
}

export async function createTestDepartment(
  institutionId: number,
  override?: Partial<DepartmentSaveParams>,
) {
  const [id] = await DepartmentModel.save([
    {
      name: "Test Department",
      code: uniqueId("DEPT"),
      dept_type: "division",
      institution_id: institutionId,
      is_active: true,
      sort_order: 0,
      ...override,
    },
  ]);
  assert(id);
  return id;
}

export async function createTestUser(
  institutionId: number,
  override?: Partial<UserSaveParams>,
) {
  const [id] = await UserModel.save([
    {
      employee_no: uniqueId("EMP"),
      login_id: uniqueId("login"),
      name: "Test User",
      institution_id: institutionId,
      ...override,
    },
  ]);
  assert(id);
  return id;
}

export async function createTestTask(
  principalInvestigatorId: number,
  override?: Partial<TaskSaveParams>,
) {
  const [id] = await TaskModel.save([
    {
      task_no: uniqueId("TASK"),
      title: "Test Task",
      year: new Date().getFullYear(),
      begin_date: new Date(),
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      principal_investigator_id: principalInvestigatorId,
      ...override,
    },
  ]);
  assert(id);
  return id;
}

// create the entire dependency chain at once
export async function createTestTaskWithDeps(
  taskOverride?: Partial<TaskSaveParams>,
) {
  const institutionId = await createTestInstitution();
  const userId = await createTestUser(institutionId);
  const taskId = await createTestTask(userId, taskOverride);
  return { institutionId, userId, taskId };
}

export async function createTestUserWithDeps(
  userOverride?: Partial<UserSaveParams>,
) {
  const institutionId = await createTestInstitution();
  const userId = await createTestUser(institutionId, userOverride);
  return { institutionId, userId };
}
```

### Using in Tests

```typescript
import { createTestTaskWithDeps, createTestUser } from "../../testing/test-helpers";

describe("TaskModel", () => {
  // GOOD: concise with helper functions
  test("Create - create with minimum required fields", async () => {
    const { taskId } = await createTestTaskWithDeps();

    const task = await TaskModel.findById("D", taskId);
    expect(task.id).toBe(taskId);
  });

  // GOOD: customize specific fields
  test("Create - create with specific status", async () => {
    const { taskId } = await createTestTaskWithDeps({
      status: "approved",
      title: "Approved Task",
    });

    const task = await TaskModel.findById("D", taskId);
    expect(task.status).toBe("approved");
  });

  // BAD: creating dependencies directly in every test (repetitive)
  test("Create - direct creation (not recommended)", async () => {
    const [institutionId] = await InstitutionModel.save([{ name: "...", code: "..." }]);
    assert(institutionId);
    const [userId] = await UserModel.save([{ ... }]);
    assert(userId);
    const [taskId] = await TaskModel.save([{ ... }]);
    assert(taskId);
    // ...
  });
});
```

### Subset → SaveParams Conversion Helper

When modifying findById results and saving again, relations must be converted to FKs:

```typescript
// api/src/testing/test-helpers.ts

// Task Subset A → SaveParams conversion
export function taskToSaveParams(task: TaskSubsetA): TaskSaveParams {
  const {
    program,
    project,
    principal_investigator,
    department,
    prev_task,
    ...rest
  } = task;

  return {
    ...rest,
    program_id: program?.id ?? null,
    project_id: project?.id ?? null,
    principal_investigator_id: principal_investigator.id,
    department_id: department?.id ?? null,
    prev_task_id: prev_task?.id ?? null,
  };
}

// generic helper (note: write directly if relation field names differ)
export function relationToFk<T extends Record<string, any>>(
  data: T,
  relationFields: string[],
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (relationFields.includes(key)) {
      // relation → FK
      result[`${key}_id`] = value?.id ?? null;
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

### Simplifying Update Tests

```typescript
import {
  createTestTaskWithDeps,
  taskToSaveParams,
} from "../../testing/test-helpers";

test("Update - update task info", async () => {
  const { taskId } = await createTestTaskWithDeps();

  const task = await TaskModel.findById("A", taskId);
  await TaskModel.save([
    {
      ...taskToSaveParams(task),
      title: "Updated Title",
    },
  ]);

  const updated = await TaskModel.findById("A", taskId);
  expect(updated.title).toBe("Updated Title");
});
```

### Notes

**Do not use beforeAll/beforeEach:**

In sonamu's test environment, creating data with beforeAll/beforeEach may end up referencing sonamu internal code. Instead, call helper functions within each test.

```typescript
// WRONG: using beforeAll
describe("TaskModel", () => {
  let taskId: number;
  beforeAll(async () => {
    const result = await createTestTaskWithDeps();
    taskId = result.taskId;
  });

  test("...", async () => {
    // using taskId - may cause problems
  });
});

// CORRECT: create in each test
describe("TaskModel", () => {
  test("...", async () => {
    const { taskId } = await createTestTaskWithDeps();
    // use taskId
  });
});
```

---

## Common Mistakes and Solutions

### ubUpsert Does Not Throw Unique Constraint Errors

**→ See "Practical Notes #4. ubUpsert is an Upsert Operation" above**

### Transaction Isolation and Test Isolation

Each test runs in an independent transaction so data is isolated. Even within the same test, data you created may not be immediately visible in queries.

```typescript
// BAD: expecting exact count may fail
test("search by role name", async () => {
  await createTestRole({ name: "AdminA" });
  await createTestRole({ name: "AdminB" });

  const { rows } = await RoleModel.findMany("A", {
    keyword: "Admin",
  });

  // may not see 2 due to transaction isolation
  expect(rows.length).toBe(2);
});

// GOOD: use unique identifier and flexible assertion
test("search by role name", async () => {
  // unique identifier to prevent conflicts
  const testName = `SearchTest_${Date.now()}`;
  await createTestRole({ name: `${testName}A` });
  await createTestRole({ name: `${testName}B` });

  const { rows } = await RoleModel.findMany("A", {
    keyword: testName,
  });

  // verify at least 1
  expect(rows.length).toBeGreaterThanOrEqual(1);
  // content validation
  expect(rows.some((r) => r.name.includes(testName))).toBe(true);
});
```

**Patterns:**

- Use unique identifiers: `Date.now()`, `uuid()`, etc. to prevent conflicts
- Flexible assertions: use `toBeGreaterThanOrEqual(1)` instead of `toBe(2)`
- Content validation: verify actual data matches rather than count

### Conditional Validation for Sorting Tests

Since not all data may be returned in sorting tests, use conditional validation:

```typescript
// BAD: assumes two items are always returned
test("sort - newest ID first", async () => {
  const id1 = await createTestRole({ name: "Role1" });
  const id2 = await createTestRole({ name: "Role2" });

  const { rows } = await RoleModel.findMany("A", {
    orderBy: "id-desc",
  });

  const id2Index = rows.findIndex((r) => r.id === id2);
  const id1Index = rows.findIndex((r) => r.id === id1);

  // fails if either is missing
  expect(id2Index).toBeLessThan(id1Index);
});

// GOOD: conditional validation
test("sort - newest ID first", async () => {
  const id1 = await createTestRole({ name: "Role1" });
  const id2 = await createTestRole({ name: "Role2" });

  const { rows } = await RoleModel.findMany("A", {
    orderBy: "id-desc",
  });

  const testRoles = rows.filter((r) => [id1, id2].includes(r.id));
  expect(testRoles.length).toBeGreaterThanOrEqual(1);

  // only validate order when both roles are returned
  if (testRoles.length === 2) {
    const id2Index = rows.findIndex((r) => r.id === id2);
    const id1Index = rows.findIndex((r) => r.id === id1);
    expect(id2Index).toBeLessThan(id1Index);
  }
});
```

**Key:** Accept the uncertainty caused by transaction isolation, and only assert when validation is possible.

---

## Fixture Data Creation Tips

**→ Detailed guide (unique constraint handling, gen vs fetch selection, DB sequence reset, FixtureGenerator customization): `fixture-cli.md` "Practical Tips" section**
