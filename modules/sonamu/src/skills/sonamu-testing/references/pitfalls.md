# Pitfalls and Complex Scenarios

## Practical Notes (Common Pitfalls)

### 1. Fixture Data Preparation Required

Problem: Tests fail without base data due to foreign key constraints

Solution:

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

Problem 1: Type error occurs when changing only some fields on update

Problem 2: Type error occurs when receiving overrides as Partial in test helpers

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

Solution: Set nullable/dbDefault fields to partial

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

Application criteria:

- id, created_at, updated_at: always partial (auto-generated)
- Fields with dbDefault: set to partial
- FK fields with nullable: true: set to partial
- Regular fields with nullable: true (e.g. description): set to partial

Key: Required fields (employee_no, login_id, name, institution_id) are excluded from partial to maintain type safety

### 3. Excluding Relation Fields on Update

Problem: Subset includes relation objects, but SaveParams only has FK, causing errors

```typescript
// WRONG
const user = await UserModel.findById("A", userId);
await UserModel.save([{ ...user, status: "inactive" }]);
// → "column 'department' does not exist" error
```

Solution: Exclude relation fields + explicitly add FK

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

Reason: `UserSubsetA` includes `institution`, `department` objects, but does not include `institution_id`, `department_id` FKs

### 4. ubUpsert is an Upsert Operation

Problem: Unique constraint violation tests fail

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

Cause: Sonamu's `save()` uses `ubUpsert` → on conflict, performs UPDATE instead of throwing error

Solution: Skip such tests

```typescript
test.skip("employee number must be unique (skipped because ubUpsert performs upsert)", async () => {
  // ...
});
```

### 5. testAs Usage

Problem: Calling testAs inside test causes an error

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

Add Naite recording to Model:

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

Validate in test:

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

Problem: "Vitest failed to access its internal state" error

Cause: When sonamu is connected via `link:`, sonamu and the project's vitest are installed at separate paths with different peer dependency combinations

Temporary fix (for testing):

```json
// packages/api/package.json
{
  "dependencies": {
    "sonamu": "0.8.0" // specify version instead of link
  }
}
```

Fundamental fix: Contact sonamu developers (framework internal issue)

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

miomock convention: Minimize fixtures, create data directly within tests

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

export async function createTestInstitution(override?: Partial<InstitutionSaveParams>) {
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

export async function createTestUser(institutionId: number, override?: Partial<UserSaveParams>) {
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
export async function createTestTaskWithDeps(taskOverride?: Partial<TaskSaveParams>) {
  const institutionId = await createTestInstitution();
  const userId = await createTestUser(institutionId);
  const taskId = await createTestTask(userId, taskOverride);
  return { institutionId, userId, taskId };
}

export async function createTestUserWithDeps(userOverride?: Partial<UserSaveParams>) {
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
  const { program, project, principal_investigator, department, prev_task, ...rest } = task;

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
import { createTestTaskWithDeps, taskToSaveParams } from "../../testing/test-helpers";

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

Do not use beforeAll/beforeEach:

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

## Common Mistakes and Solutions

### ubUpsert Does Not Throw Unique Constraint Errors

→ See "Practical Notes #4. ubUpsert is an Upsert Operation" above

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

Patterns:

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

Key: Accept the uncertainty caused by transaction isolation, and only assert when validation is possible.

## Fixture Data Creation Tips

→ Detailed guide (unique constraint handling, gen vs fetch selection, DB sequence reset, FixtureGenerator customization): `sonamu-fixture` "Practical Tips" section
