# Quick Start — Getting Started with Tests Quickly

## Vitest setup and import order

The generated API layout uses three distinct stages:

```typescript
// vitest.config.ts
import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  test: await getSonamuTestConfig({
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
    includeTaskLocation: true,
  }),
}));
```

```typescript
// src/testing/global.ts
export { setup } from "sonamu/test";
```

```typescript
// src/testing/setup-mocks.ts
import { vi } from "vitest";

vi.mock("./dependency", () => ({
  dependency: vi.fn(),
}));
```

The effective order is:

1. Vitest evaluates `vitest.config.ts`; `getSonamuTestConfig` loads `sonamu.config.ts` and merges
   Sonamu's parallel settings with the supplied Vitest options.
2. The exported global setup creates worker databases when `test.parallel` is enabled.
3. Vitest executes `setupFiles` before importing each test module, so global mocks are registered
   before application imports.
4. A test module imports its dependencies and calls `bootstrap(vi)` at module scope, registering
   `beforeAll`, `beforeEach`, and `afterEach` hooks.
5. At runtime, `beforeAll` initializes Sonamu; each test gets a transaction, then `afterEach`
   restores real timers, rolls the transaction back, and reports the test result.

Do not move test-environment or mock setup into the body of a test: dependency imports have already
run by then.

### Step 1: Extend test-helpers.ts

This step is optional. Add a project helper only when it expresses a repeated, real dependency
chain. Keep data creation inside the running test transaction; do not hide fixture synchronization
or external side effects in a helper that appears rollback-safe.

### Step 2: Write the test file

```typescript
import { bootstrap, test } from "sonamu/test";
import { assert, describe, expect, vi } from "vitest";

import { loadFixtures } from "../../testing/fixture";
import { UserModel } from "./user.model";

bootstrap(vi);

describe("UserModel", () => {
  test("사용자 이름을 수정한다", async () => {
    const { user01 } = await loadFixtures(["user01"]);
    assert(user01);

    await UserModel.save([{ id: user01.id, username: "changed" }]);

    const saved = await UserModel.findById("A", user01.id);
    expect(saved.username).toBe("changed");
  });
});
```

Use the live generated subset and project-owned save schema for field names, relation shape,
nullability, and enum values. `bootstrap` supplies DB hooks but does not create fixture rows.

### Distinguishing Required vs Optional Fields

The entity definition describes database nullability and defaults; the project-owned `*.types.ts`
defines the actual `SaveParams` accepted by the model. Construct the smallest object that satisfies
that current schema. A fetched subset can contain nested relation objects that are not save fields,
so avoid spreading an entire subset back into `save()` unless the project already provides a
conversion helper.

### Step 3: Run tests

Inspect `package.json` before choosing the command:

```bash
pnpm test
pnpm exec vitest run src/application/user/user.model.test.ts
pnpm sonamu test user.model
```

- `pnpm test` runs the declared package lifecycle, including `pretest` if one exists.
- direct `vitest run` bypasses package lifecycle preparation.
- `sonamu test` requires an enabled, ready DevRunner in a local dev server.

If the package's `pretest` runs `sonamu fixture sync`, it drops and recreates the test DB before
Vitest. The stock generated API package has no `pretest`, so fixture preparation is project-specific.
