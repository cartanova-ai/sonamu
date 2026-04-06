# PostgreSQL UpsertBuilder: Multiple Unique Constraints 문제 해결

## 문제 상황

### MySQL vs PostgreSQL의 근본적 차이

**MySQL `ON DUPLICATE KEY UPDATE`:**

```sql
INSERT INTO departments (id, company_id, name, parent_id)
VALUES (1, 100, '개발팀', NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  parent_id = VALUES(parent_id);
```

- 모든 PRIMARY KEY와 UNIQUE KEY를 **자동으로 체크**
- `id=1`이 중복이든, `(company_id, name)` 조합이 중복이든 자동으로 감지하여 UPDATE

**PostgreSQL `ON CONFLICT`:**

```sql
INSERT INTO departments (id, company_id, name, parent_id)
VALUES (1, 100, '개발팀', NULL)
ON CONFLICT (company_id, name)  -- 명시적으로 하나만 지정 가능
DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id;
```

- **명시적으로 지정한 constraint만** 체크
- 여러 constraint를 OR로 연결 불가능
- `ON CONFLICT (id) OR ON CONFLICT (company_id, name)` 같은 문법 지원 안 함

### 현재 UpsertBuilder의 문제

```typescript
// upsert-builder.ts의 현재 로직
const conflictColumns = table.uniqueIndexes[0]?.columns.map((c) => c.name) ?? ["id"];

await wdb
  .insert(dataForDb)
  .into(tableName)
  .onConflict(conflictColumns) // 첫 번째 unique index만 사용
  .merge(updateColumns)
  .returning(selectFields);
```

**발생하는 에러:**

```
insert into "departments" ("company_id", "created_at", "id", "name", "parent_id")
values ($1, $2, $3, $4, $5)
on conflict ("company_id", "name")
do update set "created_at" = excluded."created_at", "parent_id" = excluded."parent_id"
returning "id"
- duplicate key value violates unique constraint "departments_pkey"
```

**에러 발생 시나리오:**

1. 기존 row: `id=1, company_id=100, name="개발팀"`
2. 수정 요청: `id=1, company_id=100, name="개발팀 수정"`
3. INSERT 시도 → `id=1`이 PRIMARY KEY 중복
4. ON CONFLICT는 `(company_id, name)`으로 설정됨
5. PRIMARY KEY 충돌은 이 constraint에 매치 안됨 → **에러 발생**

### 재현 테스트 케이스

**테스트 파일:** `examples/miomock/api/src/application/company/company.model.test.ts`

```typescript
test("Save - Update", async () => {
  const f0 = await loadFixtures(["company01"]);

  // id가 포함된 기존 row 수정 시도
  await CompanyModel.save([
    {
      ...f0.company01, // id 포함
      name: "Updated Company",
    },
  ]);

  const f1 = await loadFixtures(["company01"]);
  expect(f1.company01.name).toBe("Updated Company");
});
```

**departments 테이블 구조:**

- PRIMARY KEY: `(id)`
- UNIQUE: `(company_id, name)`

수정 케이스에서 `id`가 포함된 데이터를 save하면 위 에러가 발생함.

### 복잡한 케이스: 독립적인 Multiple Unique Constraints

바이슈코 `product_items` 테이블 예시:

```sql
CREATE TABLE product_items (
  id SERIAL PRIMARY KEY,
  ref_no VARCHAR UNIQUE,              -- 단독 unique
  product_id INT,
  title VARCHAR,
  UNIQUE (product_id, title)          -- 조합 unique
);
```

이런 경우:

- `UNIQUE (ref_no, product_id, title)`로 합치는 것은 불가능
- ref_no 단독 unique 조건이 깨짐
- PostgreSQL의 ON CONFLICT로는 근본적으로 처리 불가능

## 해결 방안

### 핵심 아이디어

**"id 없는 row들을 모든 unique constraints로 사전 조회하여 id를 채운 후, ON CONFLICT (id)로 단일 upsert"**

### 로직 플로우

```
1. rows 준비
   ├─ id 있는 row → 그대로 유지
   └─ id 없는 row → 다음 단계로

2. id 없는 row들 처리
   └─ 각 unique constraint로 배치 SELECT
      ├─ WHERE (col1, col2) IN ((val1, val2), ...)
      ├─ 커버링 인덱스 활용 (빠름!)
      ├─ 결과를 Map으로 변환
      └─ 매칭되는 row에 id 채우기

3. 최종 upsert
   └─ INSERT ... ON CONFLICT (id) DO UPDATE
      ├─ id 있는 것 → UPDATE
      └─ id 없는 것 → INSERT
```

### 구현 상세

#### Phase 1: id 없는 row 필터링

```typescript
const rowsWithoutId = rows.filter((r) => !r.id);
if (rowsWithoutId.length === 0) {
  // 모든 row가 id 있음 → 기존 로직 진행
}
```

#### Phase 2: 모든 unique constraints로 사전 조회

```typescript
const uniqueMaps = [];

for (const uniqueIndex of table.uniqueIndexes) {
  // 조회할 조건들 추출
  const conditions = rowsWithoutId.map((row) => uniqueIndex.columns.map((col) => row[col.name]));

  // 배치 SELECT: WHERE (col1, col2) IN ((val1, val2), ...)
  const existingRows = await wdb(tableName)
    .whereIn(
      uniqueIndex.columns.map((c) => c.name),
      conditions,
    )
    .select("id", ...uniqueIndex.columns.map((c) => c.name));

  // Map 생성: unique 컬럼 조합을 키로
  const existingMap = new Map(
    existingRows.map((existing) => {
      const key = uniqueIndex.columns.map((col) => existing[col.name]).join("|||"); // delimiter
      return [key, existing.id];
    }),
  );

  uniqueMaps.push({ uniqueIndex, existingMap });
}
```

**성능 특성:**

- 쿼리 횟수: `uniqueIndexes.length` (대부분 1~2회)
- 각 쿼리: 커버링 인덱스 → Index-Only Scan
- 몇만건도 밀리초 단위 처리 가능

#### Phase 3: id 채우기

```typescript
for (const row of rowsWithoutId) {
  for (const { uniqueIndex, existingMap } of uniqueMaps) {
    const key = uniqueIndex.columns.map((col) => row[col.name]).join("|||");

    const existingId = existingMap.get(key);
    if (existingId) {
      row.id = existingId;
      break; // 하나 찾으면 충분
    }
  }
}
```

**복잡도:** O(rows.length × uniqueIndexes.length)

- uniqueIndexes는 보통 1~2개 → 실질적으로 O(n)

#### Phase 4: 단일 ON CONFLICT (id)로 upsert

```typescript
const resultRows = await wdb
  .insert(dataForDb)
  .into(tableName)
  .onConflict(["id"]) // id만 사용!
  .merge(updateColumns.filter((c) => c !== "id"))
  .returning(selectFields);
```

**결과:**

- id 있는 row → UPDATE
- id 없는 row (신규) → INSERT
- 모든 unique constraints 자동 처리

### 코드 수정 위치

**파일:** `modules/sonamu/src/database/upsert-builder.ts`

**메서드:** `upsertOrInsert()`

**수정 범위:**

1. 기존 conflict columns 결정 로직 변경
2. id 없는 row 사전 조회 로직 추가
3. ON CONFLICT를 id 기준으로 통일

## 구현 계획

### Step 1: 핵심 로직 구현

- [ ] `upsertOrInsert()` 메서드 수정
- [ ] id 없는 row 필터링
- [ ] unique constraints 배치 조회
- [ ] id 매칭 및 채우기
- [ ] ON CONFLICT (id) 단일 upsert

### Step 2: 테스트

- [ ] miomock의 company save 테스트 통과 확인
- [ ] departments 테스트 케이스 추가
- [ ] multiple unique constraints 케이스 테스트

### Step 3: 성능 검증

- [ ] 몇만건 배치 insert 성능 측정
- [ ] EXPLAIN ANALYZE로 쿼리 플랜 확인
- [ ] 커버링 인덱스 활용 검증

### Step 4: 문서화

- [ ] 변경 사항 changelog 작성
- [ ] PostgreSQL 마이그레이션 가이드 업데이트
- [ ] 성능 특성 문서화

## 제약 사항 및 고려사항

### NULL 처리

PostgreSQL의 UNIQUE constraint는 NULL을 무시함:

```sql
-- 이런 row들은 모두 허용됨 (A가 UNIQUE여도)
(A=1, B=null), (A=2, B=null), (A=null, B=3)
```

따라서 NULL을 포함한 unique key로는 정확한 매칭이 안될 수 있음.
→ 이는 정상적인 DB 동작이며, 데이터 무결성은 유지됨

### 에러 케이스

사전 조회로 id를 채워도 다음 경우는 정상적으로 에러:

```typescript
// 기존: ref_no="ABC", product_id=1, title="상품A"
// 시도: ref_no="ABC", product_id=2, title="상품B"
// → ref_no 중복으로 UPDATE 시도
// → 하지만 (product_id, title)이 다른 곳에 존재하면 → 에러!
```

→ 이는 **데이터 무결성 문제**로 정상적인 에러 상황

### 성능 오버헤드

- 추가 SELECT 쿼리: uniqueIndexes 개수만큼 (보통 1~2회)
- 트레이드오프: 정확성을 위한 합리적인 비용
- 커버링 인덱스로 최적화되므로 실제 오버헤드는 미미함

## 참고

- PostgreSQL 공식 문서: [INSERT ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
- 관련 이슈: PostgreSQL 마이그레이션 #XXX
