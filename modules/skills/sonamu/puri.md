---
name: sonamu-puri
description: Sonamu Puri 타입 안전 쿼리 빌더. SELECT, WHERE, JOIN, 트랜잭션 사용법. Use when writing database queries in Model.
---

# Puri 쿼리 빌더

## 쿼리 시작

```typescript
// 읽기 (Puri는 Thenable이므로 직접 await 가능)
const users = await this.getPuri("r").table("users").select({ id: "id", name: "username" });

// 쓰기
await this.getPuri("w").table("users").where("id", 1).update({ is_active: false });
```

## SELECT

```typescript
// 배열 결과 (Puri는 Thenable이므로 직접 await)
const users = await db.table("users").select({ id: "id", name: "username" });

// 단일 레코드
const user = await db.table("users").where("id", 1).first();
```

## WHERE

```typescript
// 기본
db.where("role", "admin")
db.where("age", ">=", 18)
db.where("deleted_at", "!=", null)

// 복수 조건 (AND)
db.where("role", "admin").where("is_active", true)

// OR
db.where("role", "admin").orWhere("role", "moderator")

// IN
db.whereIn("role", ["admin", "moderator"])
db.whereNotIn("status", ["deleted", "banned"])

// LIKE (where 메서드에 "like" 연산자 사용)
db.where("email", "like", `%${keyword}%`)
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
```

## ORDER BY & LIMIT

```typescript
db.orderBy("created_at", "desc")
  .limit(20)
  .offset(40)  // 3페이지
```

## INSERT / UPDATE / DELETE

```typescript
// INSERT
await db.table("users").insert({ username: "john", email: "john@test.com" });

// INSERT with RETURNING
const [{ id }] = await db.table("users").insert({ ... }).returning({ id: "id" });

// UPDATE
await db.table("users").where("id", 1).update({ username: "updated" });

// INCREMENT / DECREMENT
await db.table("users").where("id", 1).increment("points", 10);
await db.table("users").where("id", 1).decrement("credit", 100);

// DELETE
await db.table("users").where("id", 1).delete();
```

## 결과 메서드

Puri는 Thenable 인터페이스를 구현하므로 직접 `await`로 배열 결과를 얻습니다.

| 메서드 | 반환 | 설명 |
|--------|------|------|
| `await query` | `T[]` | 배열 결과 (Puri는 Thenable) |
| `first()` | `Promise<T \| undefined>` | 첫 번째 레코드만 반환 |
| `pluck("column")` | `Promise<V[]>` | 특정 컬럼만 배열로 반환 |

```typescript
// 배열 결과 조회 (Puri는 Thenable이므로 직접 await)
const users = await db.table("users").select({ id: "id", name: "username" });

// 단일 레코드 조회
const user = await db.table("users").where("id", 1).first();

// 특정 컬럼만 추출
const userIds = await db.table("users").where("role", "admin").pluck("id");

// COUNT는 SELECT 함수로 사용
const [{ total }] = await db.table("users").select({ total: Puri.count() });
```

## 트랜잭션

```typescript
await this.getPuri("w").transaction(async (trx) => {
  await trx.table("users").where("id", fromId).decrement("points", amount);
  await trx.table("users").where("id", toId).increment("points", amount);
  await trx.table("point_logs").insert({ from_id: fromId, to_id: toId, amount });
});
```

## Rules

- MUST use `getPuri("r")` for read queries, `getPuri("w")` for write queries
- MUST include WHERE condition for UPDATE/DELETE operations
- MUST use `transaction()` for multiple write operations
