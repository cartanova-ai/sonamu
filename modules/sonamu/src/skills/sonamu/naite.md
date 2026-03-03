---
name: sonamu-naite
description: Naite 추적 시스템. 소스코드에서 Naite.t()로 값 기록, 테스트에서 Naite.get()으로 검증. 체이닝 필터(fromFile, fromFunction, where), wildcard 패턴, DevRunner trace 출력 지원. Use when tracing/debugging Model internals, verifying queries, or inspecting UpsertBuilder behavior.
---

# Naite (추적 시스템)

Naite는 소스 코드에서 값을 기록하고, 테스트에서 검증하는 추적 시스템이다.

**소스코드:** `modules/sonamu/src/naite/naite.ts`

**동작 원리:**
1. **소스 코드**: `Naite.t("key", value)` 로 값 기록
2. **테스트 코드**: `Naite.get("key")` 로 기록된 값 조회/검증

---

## 소스 코드에서 기록 (Naite.t)

```typescript
// Model 또는 라이브러리 코드에서
import { Naite } from "sonamu";

// 쿼리 기록
Naite.t("esq-query", qb.toQuery());

// UpsertBuilder 내부
Naite.t("puri:ub-register", { tableName, uuid, isUuidReused, row });
Naite.t("puri:ub-upserted", { tableName, mode, rowCount, returnedIds });
```

---

## 테스트에서 검증 (Naite.get)

```typescript
// 테스트 코드에서
import { Naite } from "sonamu";

// 기록된 쿼리 검증
expect(Naite.get("esq-query").first()).not.contain("limit");

// UpsertBuilder 동작 검증
const trace = Naite.get("puri:ub-upserted").first();
expect(trace).toMatchObject({ tableName: "users", rowCount: 3 });
```

---

## 주요 Naite 키 (Sonamu 내장)

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

---

## 커스텀 키로 기록

```typescript
// 소스 코드에서 커스텀 키로 기록
Naite.t("user:created", { userId: 1, email: "test@test.com" });

// Mock용 가상 파일 시스템
Naite.t("mock:fs/promises:virtualFileSystem", "/path/to/virtual/file.ts");
```

---

## Naite.get() 조회 메서드

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

---

## 체이닝 필터

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

---

## Naite.del() - 값 삭제

```typescript
Naite.t("mock:fs/promises:virtualFileSystem", "/virtual/path");
// ... 테스트 ...
Naite.del("mock:fs/promises:virtualFileSystem");
```

---

## 테스트 예시

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

---

## DevRunner에서 trace 확인

`sonamu test --traces` 플래그로 CLI에서 Naite trace를 직접 확인할 수 있다:

```bash
sonamu test user.model --traces
sonamu test user.model -t
```

출력 예시:
```
Tests: 5 passed, 0 failed, 5 total
Duration: 791ms

Traces:

  UserModel > BaseModel 기본 기능 확인 > Model.findMany() with num = 0
  user.model.test.ts

    [esq-query] user.model.ts:113
    select "users"."id" as "id", ...

    [puri:executed-query] puri.ts:1349
    select COUNT(*)::integer as "total" from "users" limit 1
```

trace 데이터는 `testCase.meta().traces` (bootstrap.ts의 `afterEach`에서 수집)에서 가져오며, `SerializedTrace` 타입 (`naite.ts`에서 export)으로 직렬화된다.

DevRunner 상세: `testing-devrunner.md` 참고

---

## 내부 구조

### NaiteStore

```typescript
type NaiteStore = Map<string, NaiteTrace[]>;

interface NaiteTrace {
  key: string;
  data: any;
  stack: StackFrame[];  // 콜스택 정보
  at: Date;
}

interface StackFrame {
  functionName: string | null;
  filePath: string;     // TS 파일 기준 경로
  lineNumber: number;   // TS 파일 기준 라인 번호
}
```

### SerializedTrace (API 응답/DevRunner용)

```typescript
type SerializedTrace = {
  key: string;
  value: any;
  filePath: string;
  lineNumber: number;
  at: string;
};
```

---

## 디버깅 활용

Naite는 테스트 외에도 소스코드 동작 분석에 활용할 수 있다:

- **쿼리 추적**: `esq-query`, `puri:executed-query`로 실제 실행되는 SQL 확인
- **UpsertBuilder 분석**: `puri:ub-*` 키들로 register → upsert → ref-resolved → batch-updated 전체 흐름 추적
- **파일 I/O 추적**: `fs/promises:*` 키로 syncer 등이 수행하는 파일 작업 확인
- **특정 함수 격리**: `.fromFunction("findById")` 체이닝으로 특정 메서드 내부에서 발생한 trace만 필터링

---

## 참고

- **테스트 작성 가이드**: `testing.md`
- **DevRunner 상세**: `testing-devrunner.md`
- **expectQuery 헬퍼** (Naite 기반): `testing.md` "테스트 헬퍼: expectQuery" 섹션
