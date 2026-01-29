---
name: sonamu-puri
description: Sonamu Puri 타입 안전 쿼리 빌더. SELECT, WHERE, JOIN, 집계함수, FTS, 벡터검색, 트랜잭션. Use when writing database queries in Model.
---

# Puri 쿼리 빌더

## 쿼리 시작

```typescript
// 읽기
const users = await this.getPuri("r").table("users").select({ id: "id", name: "username" });

// 쓰기
await this.getPuri("w").table("users").where("id", 1).update({ is_active: false });

// Alias 사용
const users = await db.table({ u: "users" }).select({ id: "u.id" });
```

## SELECT

```typescript
// 기본 select
const users = await db.table("users").select({ id: "id", name: "username" });

// 모든 컬럼
const users = await db.table("users").selectAll();

// 중첩 객체 (hydrate 시 자동 변환)
db.select({
  id: "users.id",
  parent: {
    id: "parent.id",
    name: "parent.name",
  }
});

// 기존 select에 추가
db.select({ id: "id" }).appendSelect({ name: "username" });
```

## Static 함수 (SELECT용)

### 집계 함수

```typescript
// COUNT
const [{ total }] = await db.table("users").select({ total: Puri.count() });
const [{ cnt }] = await db.table("users").select({ cnt: Puri.count("id") });

// SUM / AVG / MAX / MIN
db.select({
  totalAmount: Puri.sum("amount"),
  avgPrice: Puri.avg("price"),
  maxScore: Puri.max("score"),
  minAge: Puri.min("age"),
});
```

### 문자열 함수

```typescript
db.select({
  fullName: Puri.concat("first_name", "' '", "last_name"),
  upperName: Puri.upper("name"),
  lowerEmail: Puri.lower("email"),
});
```

### Raw SQL 표현식

```typescript
// 타입별 raw 헬퍼 (반환 타입 추론)
db.select({
  custom: Puri.rawString("COALESCE(nickname, username)"),
  total: Puri.rawNumber("price * quantity"),
  isActive: Puri.rawBoolean("status = 'active'"),
  expireAt: Puri.rawDate("created_at + INTERVAL '30 days'"),
  tags: Puri.rawStringArray("string_to_array(tags, ',')"),
});
```

## WHERE

```typescript
// 기본
db.where("role", "admin")
db.where("age", ">=", 18)
db.where("deleted_at", null)           // IS NULL
db.where("deleted_at", "!=", null)     // IS NOT NULL

// 복수 조건 (AND)
db.where("role", "admin").where("is_active", true)

// IN / NOT IN
db.whereIn("role", ["admin", "moderator"])
db.whereNotIn("status", ["deleted", "banned"])

// LIKE
db.where("email", "like", `%${keyword}%`)

// Raw WHERE
db.whereRaw("EXTRACT(YEAR FROM created_at) = ?", [2024])
```

### WHERE 그룹핑 (괄호)

```typescript
// (role = 'admin' OR role = 'moderator') AND is_active = true
db.whereGroup((g) => {
  g.where("role", "admin").orWhere("role", "moderator");
}).where("is_active", true);

// OR 그룹
db.where("status", "active")
  .orWhereGroup((g) => {
    g.where("role", "admin").where("is_verified", true);
  });
```

## JOIN

```typescript
// INNER JOIN
db.table("employees")
  .join("users", "employees.user_id", "users.id")
  .select({ empId: "employees.id", userName: "users.username" })

// LEFT JOIN
db.table("employees")
  .leftJoin("departments", "employees.department_id", "departments.id")

// Alias 사용
db.table({ e: "employees" })
  .join({ u: "users" }, "e.user_id", "u.id")
  .leftJoin({ d: "departments" }, "e.department_id", "d.id")

// 콜백으로 복잡한 JOIN 조건
db.table("orders")
  .join("products", (j) => {
    j.on("orders.product_id", "products.id")
     .on("orders.store_id", "products.store_id");
  })

// 서브쿼리 JOIN
const subquery = db.table("order_items")
  .select({ order_id: "order_id", total: Puri.sum("amount") })
  .groupBy("order_id");

db.table("orders")
  .join({ oi: subquery }, "orders.id", "oi.order_id")
  .select({ id: "orders.id", total: "oi.total" });
```

## ORDER BY & LIMIT

```typescript
db.orderBy("created_at", "desc")
  .limit(20)
  .offset(40)  // 3페이지
```

## GROUP BY & HAVING

```typescript
db.table("orders")
  .select({
    userId: "user_id",
    total: Puri.sum("amount"),
    count: Puri.count(),
  })
  .groupBy("user_id")
  .having("COUNT(*) > 5");

// 컬럼, 연산자, 값 형태
db.groupBy("user_id").having("count", ">", 10);
```

## INSERT

```typescript
// 기본 INSERT
await db.table("users").insert({ username: "john", email: "john@test.com" });

// RETURNING
const [{ id }] = await db.table("users")
  .insert({ username: "john" })
  .returning("id");

// 복수 컬럼 RETURNING
const [row] = await db.table("users")
  .insert({ username: "john" })
  .returning(["id", "created_at"]);

// 전체 컬럼 RETURNING
const [user] = await db.table("users")
  .insert({ username: "john" })
  .returning("*");
```

### INSERT onConflict (Upsert)

```typescript
// DO NOTHING
await db.table("users")
  .insert({ id: 1, username: "john" })
  .onConflict("id");  // 또는 .onConflict("id", "nothing")

// DO UPDATE - 특정 컬럼만
await db.table("users")
  .insert({ id: 1, username: "john", email: "new@test.com" })
  .onConflict("id", { update: ["username", "email"] });

// DO UPDATE - 값 지정
await db.table("users")
  .insert({ id: 1, username: "john" })
  .onConflict("id", {
    update: {
      username: "updated_john",
      updated_at: Puri.rawDate("NOW()"),
    }
  });

// 복합 키 충돌
await db.table("user_settings")
  .insert({ user_id: 1, key: "theme", value: "dark" })
  .onConflict(["user_id", "key"], { update: ["value"] });
```

## UPDATE

```typescript
await db.table("users").where("id", 1).update({ username: "updated" });

// INCREMENT / DECREMENT
await db.table("users").where("id", 1).increment("points", 10);
await db.table("users").where("id", 1).decrement("credit", 100);
```

## DELETE

```typescript
await db.table("users").where("id", 1).delete();
```

## 결과 메서드

| 메서드 | 반환 | 설명 |
|--------|------|------|
| `await query` | `T[]` | 배열 결과 (Puri는 Thenable) |
| `first()` | `Promise<T \| undefined>` | 첫 번째 레코드 |
| `pluck("col")` | `Promise<V[]>` | 특정 컬럼만 배열 |

```typescript
const users = await db.table("users").select({ id: "id" });           // T[]
const user = await db.table("users").where("id", 1).first();          // T | undefined
const ids = await db.table("users").where("role", "admin").pluck("id"); // number[]
```

## 유틸리티

```typescript
// 쿼리 문자열 확인
const sql = db.table("users").where("id", 1).toQuery();

// 디버그 로그 출력 (콘솔에 쿼리 출력 후 체이닝 계속)
await db.table("users").where("id", 1).debug().first();

// 쿼리 복제
const baseQuery = db.table("users").where("is_active", true);
const query1 = baseQuery.clone().where("role", "admin");
const query2 = baseQuery.clone().where("role", "user");

// 쿼리 부분 초기화
db.clear("select")   // SELECT 절 초기화
db.clear("order")    // ORDER BY 초기화
db.clear("limit")    // LIMIT 초기화
db.clear("offset")   // OFFSET 초기화

// 특정 JOIN 제거
db.clearJoin("alias")
```

## 트랜잭션

```typescript
await this.getPuri("w").transaction(async (trx) => {
  await trx.table("users").where("id", fromId).decrement("points", amount);
  await trx.table("users").where("id", toId).increment("points", amount);
  await trx.table("point_logs").insert({ from_id: fromId, to_id: toId, amount });
});
```

---

## PostgreSQL Full-Text Search (tsvector)

### whereTsSearch

```typescript
// 기본 검색 (websearch_to_tsquery, simple config)
db.whereTsSearch("search_vector", "검색어")

// config 지정
db.whereTsSearch("search_vector", "검색어", "korean")

// 상세 옵션
db.whereTsSearch("search_vector", "검색어", {
  parser: "plainto_tsquery",  // websearch_to_tsquery | plainto_tsquery | phraseto_tsquery
  config: "korean",
})
```

### tsHighlight (검색어 하이라이팅)

```typescript
db.select({
  title: "title",
  highlighted: Puri.tsHighlight("content", "검색어"),
});

// 옵션
db.select({
  highlighted: Puri.tsHighlight("content", "검색어", {
    config: "korean",
    startSel: "<mark>",
    stopSel: "</mark>",
    maxFragments: 3,
    maxWords: 35,
    minWords: 15,
  }),
});
```

### tsRank / tsRankCd (검색 순위)

```typescript
db.select({
  rank: Puri.tsRank("search_vector", "검색어"),
})
.whereTsSearch("search_vector", "검색어")
.orderBy("rank", "desc");

// 옵션
db.select({
  rank: Puri.tsRank("search_vector", "검색어", {
    config: "korean",
    normalization: 1,  // 문서 길이 정규화
    weights: [0.1, 0.2, 0.4, 1.0],  // D, C, B, A 가중치
  }),
});

// tsRankCd (Cover Density)
db.select({
  rank: Puri.tsRankCd("search_vector", "검색어"),
});
```

---

## PGroonga Full-Text Search

### whereSearch

```typescript
// 단일 컬럼 검색
db.whereSearch("title", "검색어")

// 복합 컬럼 검색 (인덱스와 동일한 컬럼 구성 필요)
db.whereSearch(["title", "content"], "검색어")

// 가중치 옵션
db.whereSearch(["title", "content"], "검색어", {
  weights: [10, 1],  // title에 10배 가중치
})
```

### score (검색 점수)

```typescript
db.select({
  id: "id",
  title: "title",
  score: Puri.score(),
})
.whereSearch("title", "검색어")
.orderBy("score", "desc");
```

### highlight (하이라이팅)

```typescript
// 단일 컬럼
db.select({
  highlighted: Puri.highlight("title", "검색어"),
});

// 복합 컬럼 (배열 반환)
db.select({
  highlighted: Puri.highlight(["title", "content"], "검색어"),
});

// 검색어 배열
db.select({
  highlighted: Puri.highlight("title", ["검색어1", "검색어2"]),
});
```

---

## Vector Search (pgvector)

### vectorSimilarity

```typescript
const embedding = await getEmbedding("검색 쿼리");

// 기본 (cosine similarity)
const results = await db.table("documents")
  .select({ id: "id", title: "title" })
  .vectorSimilarity("embedding", embedding);
// → SELECT *, 1 - (embedding <=> '[...]'::vector) as similarity
//   ORDER BY embedding <=> '[...]'::vector

// L2 distance
db.vectorSimilarity("embedding", embedding, { method: "l2" });

// Inner product
db.vectorSimilarity("embedding", embedding, { method: "inner_product" });

// threshold 필터
db.vectorSimilarity("embedding", embedding, {
  method: "cosine",
  threshold: 0.7,  // similarity >= 0.7 만
});

// distinctOn (중복 제거)
db.vectorSimilarity("embedding", embedding, {
  distinctOn: "document_id",  // document_id별 최고 유사도만
});
```

**반환값**: `similarity` 컬럼이 자동 추가됨

| method | similarity 의미 | 정렬 |
|--------|----------------|------|
| cosine | 1 - distance (높을수록 유사) | desc |
| l2 | distance (낮을수록 유사) | asc |
| inner_product | -distance (높을수록 유사) | desc |

---

## Rules

- MUST use `getPuri("r")` for read queries, `getPuri("w")` for write queries
- MUST include WHERE condition for UPDATE/DELETE operations
- MUST use `transaction()` for multiple write operations
- JSON/JSONB 컬럼은 insert/update 시 자동으로 JSON.stringify 처리됨
