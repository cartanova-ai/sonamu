---
name: sonamu-model
description: Sonamu Model 클래스 작성. BaseModelClass 상속, CRUD 메서드 패턴, 비즈니스 로직. Use when implementing Model classes with business logic.
---

# Model 클래스

## 기본 구조

```typescript
import { api, BaseModelClass, ListResult, NotFoundException } from "sonamu";
import type { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userLoaderQueries, userSubsetQueries } from "../sonamu.generated.sso";
import type { UserListParams, UserSaveParams } from "./user.types";

class UserModelClass extends BaseModelClass<
  UserSubsetKey,
  UserSubsetMapping,
  typeof userSubsetQueries,
  typeof userLoaderQueries
> {
  constructor() {
    super("User", userSubsetQueries, userLoaderQueries);
  }
}

export const UserModel = new UserModelClass();
```

## CRUD 패턴

### findById

```typescript
@api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "User" })
async findById<T extends UserSubsetKey>(subset: T, id: number): Promise<UserSubsetMapping[T]> {
  const { rows } = await this.findMany(subset, { id, num: 1, page: 1 });
  if (!rows[0]) throw new NotFoundException(`User ID ${id} not found`);
  return rows[0];
}
```

### findMany

```typescript
@api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Users" })
async findMany<T extends UserSubsetKey>(
  subset: T,
  params?: UserListParams
): Promise<ListResult<UserListParams, UserSubsetMapping[T]>> {
  const { qb } = this.getSubsetQueries(subset);

  if (params?.id) qb.whereIn("users.id", asArray(params.id));
  if (params?.keyword) qb.whereLike("users.email", `%${params.keyword}%`);
  if (params?.orderBy === "id-desc") qb.orderBy("users.id", "desc");

  return this.executeSubsetQuery({ subset, qb, params });
}
```

### save

```typescript
@api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
async save(spa: UserSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("users", sp));

  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("users");
  });
}
```

### del

```typescript
@api({ httpMethod: "POST", guards: ["admin"] })
async del(ids: number[]): Promise<number> {
  const wdb = this.getPuri("w");
  await wdb.transaction(async (trx) => {
    return trx.table("users").whereIn("id", ids).delete();
  });
  return ids.length;
}
```

## BaseModel 메서드

| 메서드 | 설명 |
|--------|------|
| `getPuri("r")` | 읽기 쿼리 빌더 |
| `getPuri("w")` | 쓰기 쿼리 빌더 |
| `getSubsetQueries(subset)` | Subset 쿼리 빌더 |
| `executeSubsetQuery({ subset, qb, params })` | Subset 쿼리 실행 |

## Types 파일

```typescript
// user.types.ts
import { z } from "zod";
import { UserOrderBy, UserSearchField } from "../sonamu.generated";

export const UserListParams = z.object({
  num: z.number().optional(),
  page: z.number().optional(),
  search: UserSearchField.optional(),
  keyword: z.string().optional(),
  orderBy: UserOrderBy.optional(),
  id: z.union([z.number(), z.array(z.number())]).optional(),
});
export type UserListParams = z.infer<typeof UserListParams>;

export const UserSaveParams = z.object({
  id: z.number().optional(),
  email: z.string().email(),
  username: z.string().min(2),
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

## 트랜잭션

```typescript
await this.getPuri("w").transaction(async (trx) => {
  await trx.table("users").where("id", fromId).decrement("points", amount);
  await trx.table("users").where("id", toId).increment("points", amount);
});
```

## IMPORTANT: Verify orderBy After Scaffolding

### 문제

Sonamu UI에서 스캐폴딩 실행 시 model 파일이 **재생성**되면서 기본값(`id-desc`)만 남고 커스텀 orderBy 케이스가 사라집니다.

```
오류: Argument of type 'xxx-asc' is not assignable to parameter of type 'never'
```

### 해결

스캐폴딩 후 model 파일에서 entity.json의 **모든 orderBy enum 케이스**를 exhaustive() 처리해야 합니다.

```typescript
// entity.json의 orderBy enum
{ "TaskOrderBy": { "id-desc": "ID최신순", "created_at-desc": "등록일순", "title-asc": "제목순" } }

// model - 스캐폴딩 후 반드시 확인/추가
if (params.orderBy) {
  if (params.orderBy === "id-desc") {
    qb.orderBy("tasks.id", "desc");
  } else if (params.orderBy === "created_at-desc") {
    qb.orderBy("tasks.created_at", "desc");
  } else if (params.orderBy === "title-asc") {
    qb.orderBy("tasks.title", "asc");
  } else {
    exhaustive(params.orderBy);  // 누락 시 컴파일 오류
  }
}
```

### 체크리스트

- 스캐폴딩 후 model의 orderBy 케이스 확인
- entity.json의 orderBy enum과 일치하는지 확인
- search 케이스, enhancers 등 다른 커스텀 로직도 확인
