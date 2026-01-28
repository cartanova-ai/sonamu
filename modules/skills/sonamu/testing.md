---
name: sonamu-testing
description: Sonamu 테스트 시스템. bootstrap, test/testAs 함수, Fixture, Naite 추적, expectQuery/expectUB 헬퍼, Mock 패턴. Use when writing tests for Models and APIs.
---

# Sonamu 테스트 시스템

Sonamu는 Vitest 기반 테스트 환경을 제공한다. 각 테스트는 트랜잭션으로 격리되어 자동 롤백된다.

**예시 프로젝트**: `sonamu/examples/miomock` - 실제 테스트 코드 참고

## 테스트 실행

```bash
# watch 모드로 테스트 실행 (개발 중 권장)
pnpm test:watch

# 특정 파일만 테스트 (watch 모드에서 p 키 → 파일명 입력)
# 전체 테스트 한 번 실행 (CI용)
pnpm test
```

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

### global.ts

```typescript
import dotenv from "dotenv";
dotenv.config();
export { setup } from "sonamu/test";
```

### sonamu.config.ts (test 설정)

```typescript
export default defineConfig({
  test: {
    parallel: true,   // 병렬 테스트 활성화
    maxWorkers: 4,    // Worker 수 (기본값: 4)
  },
});
```

## 테스트 기본 패턴

### bootstrap

모든 테스트 파일에서 `bootstrap(vi)` 호출 필수:

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

### test vs testAs

```typescript
// 비인증 테스트 - Context.user가 null
test("비인증 테스트", async () => {
  const me = await UserModel.me();
  expect(me).toBeNull();
});

// 인증 테스트 - Context.user 설정됨
import type { UserSubsetSS } from "../sonamu.generated";

const adminUser: UserSubsetSS = {
  id: 1,
  created_at: new Date(),
  email: "admin@test.com",
  username: "admin",
  role: "admin",
};

testAs(adminUser, "관리자 권한 테스트", async () => {
  const me = await UserModel.me();
  expect(me?.role).toBe("admin");
});
```

### test.each

```typescript
test.each([
  { input: "user@example.com", expected: true },
  { input: "invalid-email", expected: false },
])("이메일 검증: $input → $expected", async ({ input, expected }) => {
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

### 테스트에서 사용

```typescript
import { loadFixtures } from "../../testing/fixture";

test("회사 정보 수정", async () => {
  const f0 = await loadFixtures(["company01"]);

  await CompanyModel.save([{
    ...f0.company01,
    name: "Updated Company",
  }]);

  const f1 = await loadFixtures(["company01"]);
  expect(f1.company01.name).toBe("Updated Company");
});
```

## Naite (테스트 추적 시스템)

Naite는 소스 코드에서 값을 기록하고, 테스트에서 검증하는 추적 시스템이다.

**동작 원리:**
1. **소스 코드**: `Naite.t("key", value)` 로 값 기록
2. **테스트 코드**: `Naite.get("key")` 로 기록된 값 조회/검증

### 소스 코드에서 기록 (Naite.t)

```typescript
// Model 또는 라이브러리 코드에서
import { Naite } from "sonamu";

// 쿼리 기록
Naite.t("esq-query", qb.toQuery());

// UpsertBuilder 내부
Naite.t("puri:ub-register", { tableName, uuid, isUuidReused, row });
Naite.t("puri:ub-upserted", { tableName, mode, rowCount, returnedIds });
```

### 테스트에서 검증 (Naite.get)

```typescript
// 테스트 코드에서
import { Naite } from "sonamu";

// 기록된 쿼리 검증
expect(Naite.get("esq-query").first()).not.contain("limit");

// UpsertBuilder 동작 검증
const trace = Naite.get("puri:ub-upserted").first();
expect(trace).toMatchObject({ tableName: "users", rowCount: 3 });
```

### 주요 Naite 키 (Sonamu 내장)

| 키 | 설명 | 데이터 |
|---|---|---|
| `esq-query` | 실행된 SQL 쿼리 | 쿼리 문자열 |
| `puri:executed-query` | Puri에서 실행된 쿼리 | 쿼리 문자열 |
| `puri:ub-register` | UpsertBuilder register 호출 | `{ tableName, uuid, isUuidReused, row }` |
| `puri:ub-upserted` | UpsertBuilder upsert 완료 | `{ tableName, mode, rowCount, returnedIds }` |
| `puri:ub-ref-resolved` | UBRef → 실제 ID 치환 | `{ tableName, field, from, to }` |
| `puri:ub-batch-updated` | updateBatch 완료 | `{ tableName, rowCount, whereColumns }` |
| `puri:ub-clean-orphans` | cleanOrphans 실행 | `{ tableName, cleanOrphans, deletedCount }` |
| `puri:ub-inherit` | inherit 옵션 적용 | `{ tableName, inheritColumns, excludedFromUpdate }` |
| `mock:fs/promises:virtualFileSystem` | 가상 파일 시스템 경로 | 파일 경로 문자열 |
| `fs/promises:writeFile` | writeFile 호출 | `{ path, data }` |
| `fs/promises:rm` | rm 호출 | `{ path, options }` |

### 커스텀 키로 기록

```typescript
// 소스 코드에서 커스텀 키로 기록
Naite.t("user:created", { userId: 1, email: "test@test.com" });

// Mock용 가상 파일 시스템
Naite.t("mock:fs/promises:virtualFileSystem", "/path/to/virtual/file.ts");
```

### Naite.get() 조회 메서드

```typescript
Naite.get("key").first()    // 첫 번째 데이터
Naite.get("key").last()     // 마지막 데이터
Naite.get("key").at(2)      // n번째 데이터
Naite.get("key").result()   // 전체 데이터 배열

// wildcard 패턴
Naite.get("puri:*").result()

// 체이닝 필터
Naite.get("esq-query")
  .where("data.table", "=", "users")
  .fromFunction("findById")
  .result();
```

### 테스트 예시

```typescript
test("쿼리에 limit이 없어야 함", async () => {
  await UserModel.findMany("A", { num: 0, page: 1 });

  expect(Naite.get("esq-query").first()).not.contain("limit");
  expect(Naite.get("esq-query").first()).not.contain("offset");
});

test("UpsertBuilder register 추적", async () => {
  const ub = new UpsertBuilder();
  const ref = ub.register("users", { email: "test@test.com", username: "test" });

  const trace = Naite.get("puri:ub-register").first();
  expect(trace).toMatchObject({
    tableName: "users",
    uuid: ref.uuid,
    isUuidReused: false,
  });
});

test("upsert 완료 추적", async () => {
  // ... upsert 실행 ...
  
  const trace = Naite.get("puri:ub-upserted").first();
  expect(trace).toMatchObject({
    tableName: "users",
    mode: "upsert",
    rowCount: 3,
  });
});
```

### Naite.del() - 값 삭제

```typescript
Naite.t("mock:fs/promises:virtualFileSystem", "/virtual/path");
// ... 테스트 ...
Naite.del("mock:fs/promises:virtualFileSystem");
```

## 테스트 헬퍼: expectQuery

SQL 쿼리의 특정 부분만 검증하는 헬퍼 (miomock 참고):

```typescript
// api/src/testing/expect-query.ts
import { type AST, Parser } from "node-sql-parser";
import { expect } from "vitest";

export type QueryPart = "type" | "table" | "columns" | "set" | "where" | "join" | "orderBy" | "pagination" | "groupBy" | "having";

export function expectQuery(query: string, part?: QueryPart) {
  if (!part) return expect(query);
  const ast = parseQuery(query);
  const extractedSql = extractors[part](ast);
  return expect(extractedSql);
}
```

### 사용 예시

```typescript
import { expectQuery } from "../testing/expect-query";

test("select 쿼리 검증", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").select({ id: "users.id" });
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "type").toBe("select");
  expectQuery(query, "table").toBe("users");
  expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS \`id\`"`);
});

test("where 조건 검증", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").where("users.id", 1);
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
});

test("join 검증", async () => {
  const db = UserModel.getPuri("r");
  await db.table("employees").leftJoin("departments", "employees.department_id", "departments.id");
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "join").toMatchInlineSnapshot(
    `"LEFT JOIN departments ON "employees"."department_id" = "departments"."id""`
  );
});
```

## 테스트 헬퍼: expectUB

UpsertBuilder 상태 검증 헬퍼 (miomock 참고):

```typescript
// api/src/testing/expect-ub.ts
import type { UpsertBuilder } from "sonamu";
import { expect } from "vitest";

export type UBPart = "tables" | "hasTable" | "rowCount" | "rows" | "row" | "refs" | "uniquesMap" | "uniqueIndexes";

export function expectUB<P extends UBPart>(
  ub: UpsertBuilder,
  part: P,
  tableName?: string,
  index?: number,
) {
  // ... 구현
}
```

### 사용 예시

```typescript
import { expectUB } from "../testing/expect-ub";

test("UpsertBuilder 상태 검증", async () => {
  const ub = new UpsertBuilder();

  // 초기 상태
  expectUB(ub, "hasTable", "users").toBe(false);
  expectUB(ub, "tables").toEqual([]);

  // register 후
  ub.register("users", { email: "test@test.com", username: "test", password: "pw", role: "normal" });

  expectUB(ub, "hasTable", "users").toBe(true);
  expectUB(ub, "rowCount", "users").toBe(1);
  expectUB(ub, "row", "users", 0).toMatchObject({
    email: "test@test.com",
    username: "test",
  });

  // upsert 후 초기화 확인
  await ub.upsert(wdb, "users");
  expectUB(ub, "rowCount", "users").toBe(0);
});
```

## Mock 패턴

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

### test-helpers.ts

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

### Create & Read

```typescript
test("Create - 새 유저 생성", async () => {
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

### Update

```typescript
test("Update - 유저 수정", async () => {
  const f0 = await loadFixtures(["user01"]);

  await UserModel.save([{
    ...f0.user01,
    username: "updated_username",
  }]);

  const f1 = await loadFixtures(["user01"]);
  expect(f1.user01.username).toBe("updated_username");
});
```

### 에러 테스트

```typescript
test("존재하지 않는 유저 조회 시 에러", async () => {
  await expect(UserModel.findById("A", 99999)).rejects.toThrow("not found");
});

test("해결되지 않은 참조 에러", async () => {
  const ub = new UpsertBuilder();
  const companyRef = ub.register("companies", { name: "Test" });
  ub.register("departments", { company_id: companyRef, name: "Dept" });

  // 잘못된 순서로 upsert 시도
  await expect(ub.upsert(wdb, "departments")).rejects.toThrow(/해결되지 않은 참조/);
});
```

## 테스트 구조화 패턴

```typescript
describe("UpsertBuilder", () => {
  describe("A. 기본 등록 (register)", () => {
    test("register() 호출 시 UBRef 반환", async () => { /* ... */ });
    test("여러 번 register() 시 rows 누적", async () => { /* ... */ });
  });

  describe("B. 테이블 관리", () => {
    test("getTable()/hasTable() 기본 동작", async () => { /* ... */ });
  });

  describe("C. Upsert 실행", () => {
    test("upsert() - 새 row 삽입", async () => { /* ... */ });
    test("upsert() - 기존 row 업데이트", async () => { /* ... */ });
    test("insertOnly() - 삽입만 수행", async () => { /* ... */ });
  });

  describe("D. 에러 처리", () => {
    test("존재하지 않는 테이블에 upsert → 빈 배열", async () => { /* ... */ });
    test("해결되지 않은 참조 → 에러", async () => { /* ... */ });
  });
});
```

## 파일 구조

```
api/src/testing/
├── fixture.ts       # createFixtureLoader 정의
├── global.ts        # globalSetup (dotenv, setup export)
├── setup-mocks.ts   # 전역 Mock 설정
├── test-helpers.ts  # 테스트 유틸 함수
├── expect-query.ts  # SQL 쿼리 검증 헬퍼
└── expect-ub.ts     # UpsertBuilder 검증 헬퍼
```

## Rules

- 모든 테스트 파일에서 `bootstrap(vi)` 호출 필수
- 각 테스트는 자동으로 롤백됨 (테스트 격리)
- 비인증 테스트는 `test`, 인증 테스트는 `testAs` 사용
- Fixture는 `createFixtureLoader`로 정의하고 `loadFixtures`로 로드
- Naite로 쿼리/UpsertBuilder 동작 추적 및 검증
- `toMatchInlineSnapshot()` 활용하여 스냅샷 테스트 권장
- Mock은 `setup-mocks.ts`에서 전역 설정하거나 테스트 내에서 `vi.spyOn` 사용
