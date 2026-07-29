# Test Patterns

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
  await expect(ub.upsert(wdb, "departments")).rejects.toThrow(/unresolved reference/);
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
