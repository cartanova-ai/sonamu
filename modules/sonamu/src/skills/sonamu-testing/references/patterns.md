# Test Patterns

## Enum values in tests

Use the generated enum or the literal value declared by the current entity. A plausible string can
typecheck only when the surrounding object has widened, then fail at parse or persistence time.

```typescript
import { UserRoleEnum } from "../sonamu.generated";

await UserModel.save([{ username: "tester", role: UserRoleEnum.normal }]);
```

## Test Basic Patterns

### bootstrap

`bootstrap(vi)` registers hooks in the current Vitest file:

| Hook | Behavior |
| --- | --- |
| `beforeAll` | Calls `Sonamu.init(true, false, undefined, forTesting)` |
| `beforeEach` | Opens `DB.createTestTransaction()` |
| `afterEach` | Restores real timers, rolls back the test transaction, then reports the result |

The default `{ forTesting: true }` initializes config, DB, entities, cache/auth test state, then
stops before workflows and Syncer autoload. Framework tests that need the full initialization path
can opt into `bootstrap(vi, { forTesting: false })`; this still does not create a Fastify server or
server-owned storage.

Call it once at module scope, before declaring suites:

```typescript
import { bootstrap, test } from "sonamu/test";
import { describe, vi } from "vitest";

bootstrap(vi);

describe("Model", () => {
  test("동작한다", async () => {});
});
```

### test vs testAs

Sonamu's `test` and `testAs` wrap the callback in `Sonamu.asyncLocalStorage` with a fresh mock
context and Naite store. The mock context has `transport: "http"`, empty headers, null session,
null request/reply placeholders, and no SSE implementation.

```typescript
import { test, testAs } from "sonamu/test";

test("비로그인 요청", async () => {
  expect(Sonamu.getContext().user).toBeNull();
});

testAs(admin, "관리자 요청", async () => {
  expect(Sonamu.getContext().user?.id).toBe(admin.id);
});
```

Both wrappers capture Naite traces on success and failure. `test.only` and `testAs.only` preserve
that behavior. `skip` delegates to Vitest without running the callback; `todo` only declares the
case. `testAs` is a declaration replacement for `test`, not a function to call inside a running
test.

For a callback that needs a custom request/reply/session context, use `runWithContext(context, fn)`.
Use `runWithMockContext(fn)` when a raw Vitest callback only needs Sonamu context and a Naite store.

### test.each

`test.each` is Vitest's bound `test.each`; Sonamu does not wrap each row. `bootstrap` hooks still
create and roll back the DB transaction, but the callback has no Sonamu mock context or trace store
unless it adds one explicitly.

```typescript
import { runWithMockContext, test } from "sonamu/test";

test.each([
  ["a@example.com", true],
  ["invalid", false],
])("이메일 %s", async (input, expected) => {
  await runWithMockContext(async () => {
    expect(validateEmail(input)).toBe(expected);
  });
});
```

The explicit context makes `Naite.t`/`Naite.get` usable inside the callback. It does not attach
traces to the Vitest task, so DevRunner `--traces` has nothing to print for this row. Use separately
declared Sonamu `test`/`testAs` cases when reported traces are part of the task.

There is no `testAs.each`. Declare separate `testAs` cases when each row needs an authenticated
user, or use Vitest `test.each` plus `runWithContext` inside the row callback.

## Mock Patterns

### setup-mocks.ts

Put mocks that must apply before application imports in the configured `setupFiles` module. This is
especially important when `test.parallel: true`, because Sonamu sets Vitest `isolate: false`; an
import cached by an earlier file in the same worker is not re-evaluated for a later mock.

```typescript
// src/testing/setup-mocks.ts
import { vi } from "vitest";

vi.mock("../application/mail/send-mail", () => ({
  sendMail: vi.fn(),
}));
```

Use `vi.spyOn` for behavior selected after import when the target function is called through the
spied object. `restoreMocks: true` restores spies between tests; it does not invalidate ESM modules.

### test-helpers.ts

Project helpers are useful for expressing a stable dependency chain or building a complete custom
context. Keep framework initialization in `bootstrap`, and call data-creating helpers inside the
test transaction so their writes roll back with the test.

## CRUD Test Patterns

### Create & Read

Assert the behavior under test through the public model path. Guard generated IDs before passing
them to a method expecting a definite ID.

```typescript
test("사용자를 저장하고 조회한다", async () => {
  const [id] = await UserModel.save([{ username: "tester", role: UserRoleEnum.normal }]);
  expect(id).toBeDefined();
  if (id === undefined) throw new Error("사용자 ID가 생성되지 않았다");

  const user = await UserModel.findById("A", id);
  expect(user.username).toBe("tester");
});
```

### Update

Pass fields accepted by the current save schema. A relation object from a read subset is not a
foreign-key field.

### Error Tests

Assert the stable error contract available to the caller: error class, code, or a durable message
fragment. Do not replace a missing error with a loose assertion merely to accommodate fixture data.

## Test Structuring Patterns

Suite naming and coverage depth are project policy. Sonamu only requires the module-level bootstrap
when its DB hooks are needed and a context wrapper when code reads `Sonamu.getContext()` or Naite.

## File Structure

The generated API keeps these portable project paths:

```text
api/src/testing/
├── fixture.ts
├── global.ts
└── setup-mocks.ts
```

Projects may add `test-helpers.ts`, `expect-query.ts`, or `expect-ub.ts`; those are project-owned,
not Sonamu exports.
