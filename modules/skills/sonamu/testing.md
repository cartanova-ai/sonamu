---
name: sonamu-testing
description: Sonamu Naite 테스트 시스템. bootstrap, test/testAs 함수, Fixture 사용법. Use when writing tests for Models and APIs.
---

# Naite 테스트 시스템

## 기본 패턴

```typescript
import { bootstrap, test, testAs } from "sonamu/test";
import { expect, vi } from "vitest";

bootstrap(vi);

test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{
    email: "john@test.com",
    username: "john",
    password: "password",
    role: "normal",
  }]);

  expect(userId).toBeGreaterThan(0);
});
```

## testAs (인증 테스트)

```typescript
testAs(
  { id: 1, username: "admin", role: "admin" },
  "관리자는 모든 게시글을 삭제할 수 있다",
  async () => {
    // Context.user가 위의 사용자로 설정됨
    const count = await PostModel.del([1, 2, 3]);
    expect(count).toBe(3);
  }
);

testAs(
  { id: 2, username: "user", role: "normal" },
  "일반 사용자는 타인의 게시글을 삭제할 수 없다",
  async () => {
    await expect(PostModel.del([999])).rejects.toThrow("권한이 없습니다");
  }
);
```

## vitest.config.ts

```typescript
import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  test: await getSonamuTestConfig({
    include: ["src/**/*.test.ts"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    reporters: ["default", NaiteVitestReporter],
  }),
}));
```

## global.ts

```typescript
import dotenv from "dotenv";
dotenv.config();
export { setup } from "sonamu/test";
```

## Fixture

```typescript
// api/src/testing/fixture.ts
import { Fixture } from "sonamu/test";

export const userFixture: Fixture<"users"> = {
  table: "users",
  data: [
    { id: 1, email: "admin@test.com", username: "admin", role: "admin" },
    { id: 2, email: "user@test.com", username: "testuser", role: "normal" },
  ],
};

export const fixtures = [userFixture];
```

## test.each

```typescript
test.each([
  { input: "user@example.com", expected: true },
  { input: "invalid-email", expected: false },
])("이메일 검증: $input → $expected", async ({ input, expected }) => {
  expect(validateEmail(input)).toBe(expected);
});
```

## Rules

- MUST call `bootstrap(vi)` in every test file
- Each test auto-rollbacks (test isolation)
- Use `test` for unauthenticated tests, `testAs` for authenticated tests with specific user
