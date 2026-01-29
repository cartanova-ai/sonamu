---
name: sonamu-testing
description: Sonamu 테스트 시스템. bootstrap, test/testAs 함수, Fixture, Naite 추적, expectQuery/expectUB 헬퍼, Mock 패턴. Use when writing tests for Models and APIs.
---

# Sonamu 테스트 시스템

Sonamu는 Vitest 기반 테스트 환경을 제공한다. 각 테스트는 트랜잭션으로 격리되어 자동 롤백된다.

**예시 프로젝트**: `sonamu/examples/miomock` - 실제 테스트 코드 참고

## 테스트 작성 전 체크리스트

- [ ] **Seed Data 준비** - FK 제약으로 인한 기본 데이터 필요 (→ database.md "최소 seed data" 참고)
- [ ] **SaveParams partial 설정** - nullable/dbDefault 필드 partial 처리 확인
- [ ] **테스트 헬퍼 함수** - 복잡한 엔티티 의존성 처리용 헬퍼 준비

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

**bootstrap 옵션:**

```typescript
// 기본값: forTesting: true (빠름, Syncer/Task 생략)
bootstrap(vi);

// forTesting: false - 전체 초기화 (Syncer, Task, EntityManager 등 모두 로드)
// migrator, syncer, template 등의 테스트에서 사용
bootstrap(vi, { forTesting: false });
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
// 기본 조회
Naite.get("key").first()     // 첫 번째 데이터
Naite.get("key").last()      // 마지막 데이터
Naite.get("key").at(2)       // n번째 데이터
Naite.get("key").result()    // 전체 데이터 배열
Naite.get("key").getTraces() // 원본 trace 배열 (콜스택 포함)

// wildcard 패턴
Naite.get("puri:*").result()           // puri: 접두사 모두
Naite.get("syncer:*:user").result()    // syncer:XXX:user 패턴
```

### Naite 체이닝 필터

```typescript
// 파일명으로 필터링
Naite.get("esq-query")
  .fromFile("user.model.ts")  // 해당 파일에서 기록된 것만
  .result();

// 함수명으로 필터링
Naite.get("puri:executed-query")
  .fromFunction("findById")                    // 해당 함수에서 호출된 것만
  .result();

// fromFunction 옵션
Naite.get("key")
  .fromFunction("save", { from: "direct" })    // 직접 호출만 (stack[0])
  .fromFunction("save", { from: "indirect" })  // 간접 호출만 (stack[1+])
  .fromFunction("save", { from: "both" })      // 모두 (기본값)

// 데이터 경로 기반 필터링 (radash get 경로)
Naite.get("puri:ub-register")
  .where("data.tableName", "=", "users")    // tableName이 users인 것만
  .where("data.rowCount", ">", 5)           // rowCount > 5
  .result();

// where 연산자: ">", "<", ">=", "<=", "=", "!=", "includes"
Naite.get("key")
  .where("data.query", "includes", "WHERE")  // 문자열 포함 체크
  .result();

// 체이닝 조합
Naite.get("puri:executed-query")
  .fromFunction("findMany")
  .where("data", "includes", "users")
  .first();
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

## 타입 안전성 주의사항

### SaveParams의 partial 설정 확인

`Model.save()` 테스트 시 `*.types.ts`의 `SaveParams` partial 설정을 확인해야 함:

```typescript
// user.types.ts
export const UserSaveParams = baseSchema.partial({
  id: true,           // 자동 생성
  created_at: true,   // 자동 생성
  updated_at: true,   // 자동 생성
});
```

partial로 설정되지 않은 필드는 모두 필수이므로, 테스트에서 누락하면 타입 에러 발생:

```typescript
// WRONG: email, password 등 필수 필드 누락
await UserModel.save([{ username: "test" }]);

// CORRECT: 필수 필드 모두 포함
await UserModel.save([{
  username: "test",
  email: "test@test.com",
  password: "pw",
  role: "normal",
}]);
```

### Nullish Coalescing 사용

변수가 `T | undefined` 타입일 수 있는 경우 nullish coalescing 필수:

```typescript
// WRONG: userId가 number | undefined일 수 있음
const user = await UserModel.findById("A", userId);

// CORRECT: nullish coalescing으로 undefined 방어
const user = await UserModel.findById("A", userId ?? 0);
```

특히 이전 단계에서 생성한 ID를 사용할 때 주의:

```typescript
const [userId] = await UserModel.save([{ ... }]);

// WRONG: userId가 number | undefined
const user = await UserModel.findById("A", userId);

// CORRECT:
const user = await UserModel.findById("A", userId ?? 0);
```

### SaveParams import 위치

SaveParams 타입은 sonamu.generated가 아닌 각 엔티티의 types.ts에서 export됩니다.

**잘못된 예:**
```typescript
// test-helpers.ts
import type {
  UserSaveParams,
  TaskSaveParams,
} from "../application/sonamu.generated";  // WRONG
```

**올바른 예:**
```typescript
// test-helpers.ts
import type { UserSaveParams } from "../application/user/user.types";
import type { TaskSaveParams } from "../application/task/task.types";
```

**이유:**
- sonamu.generated에는 BaseSchema와 BaseListParams만 export됨
- SaveParams는 각 엔티티의 types.ts에서 BaseSchema.partial()로 정의됨

## 실전 주의사항 (Common Pitfalls)

### 1. Fixture 데이터 준비 필수

**문제:** Foreign key constraint로 인해 기본 데이터 없으면 테스트 실패

**해결:**
```sql
-- database/scripts/seed-initial-data.sql
INSERT INTO institutions (id, name, code) VALUES (1, '본원', 'HQ');
INSERT INTO departments (id, name, institution_id) VALUES (1, '연구부', 1);
INSERT INTO roles (id, code, name) VALUES (1, 'ADMIN', '관리자');
```

```bash
# 1. seed 데이터를 test DB에 적용
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test -f database/scripts/seed-initial-data.sql

# 2. dump 생성
pnpm dump

# 3. fixture DB에 적용
pnpm seed

# 4. sonamu fixture sync (선택사항)
pnpm sonamu fixture sync
```

### 2. SaveParams 타입 설계 (Partial)

**문제 1:** Update 시 일부 필드만 변경하면 타입 에러 발생

**문제 2:** 테스트 헬퍼에서 override를 Partial로 받을 때 타입 에러 발생
```typescript
// WRONG - nullable 필드가 partial 미설정
export const QuestionSaveParams = QuestionBaseSchema.partial({
  id: true,
  created_at: true,
});

// test-helpers.ts
export async function createTestQuestion(
  collectionId: number,
  override?: Partial<QuestionSaveParams>
) {
  const [id] = await QuestionModel.save([{
    content: "테스트질문",
    parent_id: null,
    answer_group_id: null,
    ...override,  // 타입 에러: undefined는 null로 할당 불가
  }]);
  return id;
}
```

**해결:** nullable/dbDefault 필드를 partial로 설정
```typescript
// api/src/application/user/user.types.ts
export const UserSaveParams = UserBaseSchema.partial({
  id: true,              // update 시 필요
  created_at: true,      // dbDefault
  password: true,        // nullable
  email: true,           // nullable
  phone: true,           // nullable
  user_type: true,       // dbDefault
  position_code: true,   // nullable
  position_name: true,   // nullable
  hire_date: true,       // nullable
  status: true,          // dbDefault
  department_id: true,   // nullable relation
});
```

**적용 기준:**
- id, created_at, updated_at: 항상 partial (자동 생성)
- dbDefault가 있는 필드: partial 처리
- nullable: true인 FK 필드: partial 처리
- nullable: true인 일반 필드 (description 등): partial 처리

**핵심:** 필수 필드(employee_no, login_id, name, institution_id)는 partial 제외하여 타입 안정성 유지

### 3. Update 시 Relation 필드 제외 패턴

**문제:** Subset에는 relation 객체가 포함되지만, SaveParams에는 FK만 있어서 에러 발생

```typescript
// WRONG
const user = await UserModel.findById("A", userId);
await UserModel.save([{ ...user, status: "inactive" }]);
// → "column 'department' does not exist" 에러
```

**해결:** Relation 필드 제외 + FK 명시적 추가
```typescript
// CORRECT
const user = await UserModel.findById("A", userId);
const { institution, department, ...userData } = user;
await UserModel.save([{
  ...userData,
  institution_id: user.institution.id,           // FK 명시적 추가
  department_id: user.department?.id ?? null,
  status: "inactive",
}]);
```

**이유:** `UserSubsetA`는 `institution`, `department` 객체를 포함하지만, `institution_id`, `department_id` FK는 포함하지 않음

### 4. ubUpsert는 Upsert 동작

**문제:** Unique constraint 위반 테스트가 실패함

```typescript
// 실패하는 테스트
test("사번은 고유해야 함", async () => {
  await UserModel.save([{ employee_no: "001", ... }]);

  // 중복된 사번으로 생성 시도
  await expect(
    UserModel.save([{ employee_no: "001", ... }])
  ).rejects.toThrow();  // 에러 안 던지고 UPDATE됨
});
```

**원인:** Sonamu의 `save()`는 `ubUpsert` 사용 → conflict 시 에러 대신 UPDATE

**해결:** 이런 테스트는 skip 처리
```typescript
test.skip("사번은 고유해야 함 (ubUpsert는 upsert 동작하므로 skip)", async () => {
  // ...
});
```

### 5. testAs 사용법

**문제:** test 안에서 testAs 호출하면 에러 발생

```typescript
// WRONG
test("권한 테스트", async () => {
  await testAs(adminUser, "설명", async () => { ... });
  // → "Calling the test function inside another test function is not allowed" 에러
});

// CORRECT - test를 대체
testAs(adminUser, "권한 테스트", async () => {
  const result = await UserModel.del([userId]);
  expect(result).toBe(1);
});
```

### 6. Naite로 Model 쿼리 검증

**Model에 Naite 기록 추가:**
```typescript
// user.model.ts
import { Naite } from "sonamu";

async findMany(...) {
  // ... qb 구성 ...

  // 테스트를 위한 쿼리 기록
  Naite.t("esq-query", qb.toQuery());

  return this.executeSubsetQuery({ ... });
}
```

**Test에서 검증:**
```typescript
test("num: 0일 때 limit 없어야 함", async () => {
  await UserModel.findMany("A", { num: 0, page: 1 });

  expect(Naite.get("esq-query").first()).not.contain("limit");
  expect(Naite.get("esq-query").first()).not.contain("offset");
});
```

### 7. 에러 메시지는 다국어 고려

```typescript
// WRONG: 영어 메시지만 검증
await expect(UserModel.findById("A", 99999))
  .rejects.toThrow("not found");

// CORRECT: 한글 메시지 부분 매칭
await expect(UserModel.findById("A", 99999))
  .rejects.toThrow("존재하지 않는");
```

### 8. pnpm Workspace와 Vitest 인스턴스 충돌

**문제:** "Vitest failed to access its internal state" 에러

**원인:** sonamu가 `link:`로 연결되어 있으면, sonamu와 프로젝트의 vitest가 다른 peer dependency 조합으로 별도 경로에 설치됨

**임시 해결 (테스트용):**
```json
// packages/api/package.json
{
  "dependencies": {
    "sonamu": "0.7.50"  // link 대신 버전 명시
  }
}
```

**근본 해결:** sonamu 개발자에게 문의 (프레임워크 내부 이슈)

### 9. assert() for Truthy Checks

```typescript
import assert from "assert";

test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{ ... }]);

  // truthy 체크
  assert(userId);

  // 이후 userId는 number로 확실히 타입 추론됨
  const user = await UserModel.findById("A", userId);
});
```

### 10. 테스트 데이터는 직접 생성

**miomock 컨벤션:** Fixture 최소화, 데이터는 테스트 내에서 직접 생성

```typescript
// 권장 패턴
test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{
    employee_no: "2026001",
    login_id: "testuser",
    name: "테스트유저",
    institution_id: 1,
    // ... 필요한 필드들
  }]);

  const user = await UserModel.findById("A", userId);
  expect(user.name).toBe("테스트유저");
});

// Fixture는 공통 데이터에만 사용
const f = await loadFixtures(["institution01"]);  // 기관 같은 공통 데이터만
```

## 복잡한 엔티티 테스트 전략

엔티티 간 의존성이 복잡한 경우 (Institution → Department → User → Task → TaskParticipant) 테스트 헬퍼 함수를 활용한다.

### 테스트 헬퍼 함수 정의

```typescript
// api/src/testing/test-helpers.ts
import assert from "assert";
import { InstitutionModel } from "../application/institution/institution.model";
import { DepartmentModel } from "../application/department/department.model";
import { UserModel } from "../application/user/user.model";
import { TaskModel } from "../application/task/task.model";

// 각 헬퍼는 최소 필수 필드만 요구하고, 나머지는 기본값 제공
let counter = 0;
function uniqueId(prefix: string) {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export async function createTestInstitution(override?: Partial<InstitutionSaveParams>) {
  const [id] = await InstitutionModel.save([{
    name: "테스트기관",
    code: uniqueId("INST"),
    ...override,
  }]);
  assert(id);
  return id;
}

export async function createTestDepartment(
  institutionId: number,
  override?: Partial<DepartmentSaveParams>
) {
  const [id] = await DepartmentModel.save([{
    name: "테스트부서",
    code: uniqueId("DEPT"),
    dept_type: "division",
    institution_id: institutionId,
    is_active: true,
    sort_order: 0,
    ...override,
  }]);
  assert(id);
  return id;
}

export async function createTestUser(
  institutionId: number,
  override?: Partial<UserSaveParams>
) {
  const [id] = await UserModel.save([{
    employee_no: uniqueId("EMP"),
    login_id: uniqueId("login"),
    name: "테스트사용자",
    institution_id: institutionId,
    ...override,
  }]);
  assert(id);
  return id;
}

export async function createTestTask(
  principalInvestigatorId: number,
  override?: Partial<TaskSaveParams>
) {
  const [id] = await TaskModel.save([{
    task_no: uniqueId("TASK"),
    title: "테스트과제",
    year: new Date().getFullYear(),
    begin_date: new Date(),
    end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    principal_investigator_id: principalInvestigatorId,
    ...override,
  }]);
  assert(id);
  return id;
}

// 의존성 체인을 한 번에 생성
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

### 테스트에서 사용

```typescript
import { createTestTaskWithDeps, createTestUser } from "../../testing/test-helpers";

describe("TaskModel", () => {
  // GOOD: 헬퍼 함수로 간결하게
  test("Create - 최소 필수 필드로 생성", async () => {
    const { taskId } = await createTestTaskWithDeps();

    const task = await TaskModel.findById("D", taskId);
    expect(task.id).toBe(taskId);
  });

  // GOOD: 특정 필드 커스터마이즈
  test("Create - 특정 상태로 생성", async () => {
    const { taskId } = await createTestTaskWithDeps({
      status: "approved",
      title: "승인된 과제",
    });

    const task = await TaskModel.findById("D", taskId);
    expect(task.status).toBe("approved");
  });

  // BAD: 매 테스트마다 의존성 직접 생성 (반복적)
  test("Create - 직접 생성 (권장하지 않음)", async () => {
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

### Subset → SaveParams 변환 헬퍼

findById 결과를 수정 후 다시 save할 때 relation을 FK로 변환해야 한다:

```typescript
// api/src/testing/test-helpers.ts

// Task Subset D → SaveParams 변환
export function taskToSaveParams(task: TaskSubsetD): TaskSaveParams {
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

// 범용 헬퍼 (주의: relation 필드명이 다른 경우 직접 작성 필요)
export function relationToFk<T extends Record<string, any>>(
  data: T,
  relationFields: string[]
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

### Update 테스트 간소화

```typescript
import { createTestTaskWithDeps, taskToSaveParams } from "../../testing/test-helpers";

test("Update - 과제 정보 수정", async () => {
  const { taskId } = await createTestTaskWithDeps();

  const task = await TaskModel.findById("D", taskId);
  await TaskModel.save([{
    ...taskToSaveParams(task),
    title: "수정된 제목",
  }]);

  const updated = await TaskModel.findById("D", taskId);
  expect(updated.title).toBe("수정된 제목");
});
```

### 주의사항

**beforeAll/beforeEach 사용 금지:**

sonamu의 테스트 환경에서 beforeAll/beforeEach로 데이터를 생성하면 sonamu 내부 코드를 바라보게 될 수 있다. 대신 각 테스트 내에서 헬퍼 함수를 호출한다.

```typescript
// WRONG: beforeAll 사용
describe("TaskModel", () => {
  let taskId: number;
  beforeAll(async () => {
    const result = await createTestTaskWithDeps();
    taskId = result.taskId;
  });

  test("...", async () => {
    // taskId 사용 - 문제 발생 가능
  });
});

// CORRECT: 각 테스트에서 생성
describe("TaskModel", () => {
  test("...", async () => {
    const { taskId } = await createTestTaskWithDeps();
    // taskId 사용
  });
});
```
