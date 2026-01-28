---
name: sonamu-testing
description: Sonamu 테스트 시스템. bootstrap, test/testAs 함수, Fixture, Naite 추적, Mock 패턴. Use when writing tests for Models and APIs.
---

# Sonamu 테스트 시스템

Sonamu는 Vitest 기반 테스트 환경을 제공한다. 각 테스트는 트랜잭션으로 격리되어 자동 롤백된다.

## 테스트 실행

```bash
# watch 모드로 테스트 실행 (개발 중 권장)
pnpm test:watch

# 특정 파일만 테스트
# 1. pnpm test:watch 실행
# 2. p 키 입력
# 3. 파일명 입력 (예: user.model.test.ts)

# 전체 테스트 한 번 실행 (CI용)
pnpm test

# 커버리지 포함 실행
pnpm test:coverage
```

**watch 모드 단축키:**
- `p` - 파일명으로 필터
- `t` - 테스트명으로 필터
- `a` - 전체 테스트 실행
- `q` - 종료

## 설정 파일

### vitest.config.ts

```typescript
import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  test: await getSonamuTestConfig({
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
  }),
}));
```

`getSonamuTestConfig`는 `sonamu.config.ts`의 `test` 설정을 읽어 병렬 테스트 환경을 자동 구성한다.

### global.ts

```typescript
import dotenv from "dotenv";
dotenv.config();
export { setup } from "sonamu/test";
```

### sonamu.config.ts (test 설정)

```typescript
export default defineConfig({
  // ...
  test: {
    parallel: true,   // 병렬 테스트 활성화
    maxWorkers: 4,    // Worker 수 (기본값: 4)
  },
});
```

병렬 테스트 활성화 시 Worker별로 별도 DB가 생성된다 (`{dbname}_1`, `{dbname}_2`, ...).

## 테스트 기본 패턴

### bootstrap

모든 테스트 파일에서 `bootstrap(vi)`를 호출해야 한다. 이 함수는:
- Sonamu 초기화
- 테스트별 트랜잭션 생성/롤백
- Naite trace 수집

```typescript
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);

describe("MyTest", () => {
  test("테스트 케이스", async () => {
    // ...
  });
});
```

#### bootstrap 옵션

```typescript
bootstrap(vi, { forTesting: false });
```

- `forTesting: true` (기본값): 빠른 테스트 모드 (Syncer/Task 생략)
- `forTesting: false`: 전체 초기화 (migrator, syncer, template 테스트용)

### test

비인증 테스트용. Context.user가 null로 설정된다.

```typescript
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

### testAs

인증된 사용자로 테스트. Context.user가 지정된 사용자로 설정된다.

```typescript
import { testAs } from "sonamu/test";
import type { UserSubsetSS } from "../sonamu.generated";

const adminUser: UserSubsetSS = {
  id: 1,
  created_at: new Date(),
  email: "admin@test.com",
  username: "admin",
  role: "admin",
};

testAs(adminUser, "관리자 권한 테스트", async () => {
  // Context.user가 adminUser로 설정됨
  const me = await UserModel.me();
  expect(me?.role).toBe("admin");
});
```

### test.skip / test.only / test.todo

```typescript
test.skip("스킵할 테스트", async () => {
  // 실행되지 않음
});

test.only("이 테스트만 실행", async () => {
  // 이 파일에서 이 테스트만 실행
});

test.todo("나중에 구현할 테스트");
```

`testAs`도 동일하게 지원:

```typescript
testAs.skip(user, "스킵", async () => {});
testAs.only(user, "이것만", async () => {});
testAs.todo("나중에");
```

### test.each

여러 케이스를 반복 테스트:

```typescript
test.each([
  { input: "user@example.com", expected: true },
  { input: "invalid-email", expected: false },
  { input: "", expected: false },
])("이메일 검증: $input → $expected", async ({ input, expected }) => {
  expect(validateEmail(input)).toBe(expected);
});
```

## Fixture

### createFixtureLoader

테스트에서 사용할 fixture를 로드하는 함수를 생성한다.

```typescript
// api/src/testing/fixture.ts
import { createFixtureLoader } from "sonamu/test";
import { CompanyModel } from "../application/company/company.model";
import { UserModel } from "../application/user/user.model";

export const loadFixtures = createFixtureLoader({
  company01: async () => CompanyModel.findById("A", 1),
  user01: async () => UserModel.findById("A", 1),
  user02: async () => UserModel.findById("A", 2),
});
```

### 테스트에서 사용

```typescript
import { loadFixtures } from "../../testing/fixture";

test("회사 정보 수정", async () => {
  const { company01 } = await loadFixtures(["company01"]);

  await CompanyModel.save([{
    ...company01,
    name: "Updated Company",
  }]);

  const updated = await loadFixtures(["company01"]);
  expect(updated.company01.name).toBe("Updated Company");
});
```

## Naite (테스트 추적 시스템)

Naite는 테스트 중 발생하는 이벤트를 추적하는 시스템이다.

### Naite.t() - 값 기록

```typescript
import { Naite } from "sonamu";

// 단순 값 기록
Naite.t("user:created", { userId: 1, email: "test@test.com" });

// 쿼리 기록 (Sonamu 내부에서 자동 기록)
// esq-query, esq-bindings 등

// Mock용 가상 파일 시스템
Naite.t("mock:fs/promises:virtualFileSystem", "/path/to/virtual/file.ts");
```

### Naite.get() - 값 조회

```typescript
// 정확한 키로 조회
const queries = Naite.get("esq-query").result();
const firstQuery = Naite.get("esq-query").first();
const lastQuery = Naite.get("esq-query").last();

// wildcard 패턴
const allSyncer = Naite.get("syncer:*").result();

// 체이닝
const filtered = Naite.get("esq-query")
  .where("data.table", "=", "users")
  .fromFunction("findById")
  .result();
```

### NaiteQuery 메서드

```typescript
const query = Naite.get("key");

query.result()           // 전체 데이터 배열
query.first()            // 첫 번째 데이터
query.last()             // 마지막 데이터
query.at(2)              // n번째 데이터

query.fromFile("user.model.test.ts")   // 파일명으로 필터
query.fromFunction("save")              // 함수명으로 필터
query.where("data.id", ">", 10)         // 조건 필터
```

### 테스트에서 활용

```typescript
test("쿼리에 limit이 없어야 함", async () => {
  await UserModel.findMany("A", { num: 0, page: 1 });

  expect(Naite.get("esq-query").first()).not.contain("limit");
  expect(Naite.get("esq-query").first()).not.contain("offset");
});
```

### Naite.del() - 값 삭제

```typescript
Naite.t("mock:fs/promises:virtualFileSystem", "/virtual/path");
// ... 테스트 ...
Naite.del("mock:fs/promises:virtualFileSystem");
```

## Mock 패턴

### setup-mocks.ts

전역 Mock 설정 파일:

```typescript
// api/src/testing/setup-mocks.ts
import { Naite } from "sonamu";
import { vi } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  return {
    ...actual,
    access: vi.fn((path, mode) => {
      // 가상 파일 시스템 체크
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

### 테스트 헬퍼 함수

```typescript
// api/src/testing/test-helpers.ts
import { Entity, EntityManager, type EntityJson } from "sonamu";
import { vi } from "vitest";

// EntityManager.get 모킹
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

## CRUD 테스트 패턴

### Create

```typescript
test("새 유저 생성", async () => {
  const [userId] = await UserModel.save([{
    email: "newuser@test.com",
    username: "newuser",
    password: "hashedpassword",
    role: "normal",
  }]);

  expect(userId).toBeGreaterThan(0);

  const user = await UserModel.findById("A", userId);
  expect(user.email).toBe("newuser@test.com");
});
```

### Read

```typescript
test("유저 조회", async () => {
  const user = await UserModel.findById("A", 1);
  expect(user).toBeDefined();
  expect(user.id).toBe(1);
});

test("유저 목록 조회", async () => {
  const result = await UserModel.findMany("A", {
    num: 10,
    page: 1,
  });

  expect(result.rows).toBeDefined();
  expect(result.total).toBeGreaterThan(0);
});
```

### Update

```typescript
test("유저 수정", async () => {
  const { user01 } = await loadFixtures(["user01"]);

  await UserModel.save([{
    ...user01,
    username: "updated_username",
  }]);

  const updated = await UserModel.findById("A", user01.id);
  expect(updated.username).toBe("updated_username");
});
```

### Delete

```typescript
test("유저 삭제", async () => {
  const [userId] = await UserModel.save([{
    email: "todelete@test.com",
    username: "todelete",
    password: "password",
    role: "normal",
  }]);

  const count = await UserModel.del([userId]);
  expect(count).toBe(1);

  await expect(UserModel.findById("A", userId))
    .rejects.toThrow();
});
```

## 에러 테스트

```typescript
test("존재하지 않는 유저 조회 시 에러", async () => {
  await expect(UserModel.findById("A", 99999))
    .rejects.toThrow("not found");
});

test("권한 없는 사용자의 삭제 시도", async () => {
  const normalUser = { id: 2, role: "normal" };

  await testAs(normalUser, "삭제 권한 없음", async () => {
    await expect(PostModel.del([1]))
      .rejects.toThrow("권한이 없습니다");
  });
});
```

## 파일 구조

```
api/src/testing/
├── fixture.ts       # createFixtureLoader 정의
├── global.ts        # globalSetup (dotenv, setup export)
├── setup-mocks.ts   # 전역 Mock 설정
└── test-helpers.ts  # 테스트 유틸 함수
```

## Rules

- 모든 테스트 파일에서 `bootstrap(vi)` 호출 필수
- 각 테스트는 자동으로 롤백됨 (테스트 격리)
- 비인증 테스트는 `test`, 인증 테스트는 `testAs` 사용
- Fixture는 `createFixtureLoader`로 정의하고 `loadFixtures`로 로드
- Mock은 `setup-mocks.ts`에서 전역 설정하거나 테스트 내에서 `vi.spyOn` 사용
