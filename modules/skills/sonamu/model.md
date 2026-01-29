---
name: sonamu-model
description: Sonamu Model 클래스 작성. BaseModelClass 상속, CRUD 메서드 패턴, 비즈니스 로직, executeSubsetQuery 옵션. Use when implementing Model classes with business logic.
---

# Model 클래스

**실제 동작 코드 참고:**
- `sonamu/examples/miomock/api/src/application/project/project.model.ts` - ManyToMany save 구현
- `sonamu/examples/miomock/api/src/application/employee/employee.model.ts` - 기본 CRUD 패턴
- `sonamu/examples/miomock/api/src/application/project/project.model.test.ts` - 테스트 예시

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
  params: UserListParams = { num: 10, page: 1 }
): Promise<ListResult<UserListParams, UserSubsetMapping[T]>> {
  const { qb } = this.getSubsetQueries(subset);

  if (params.id) qb.whereIn("users.id", asArray(params.id));
  if (params.keyword) qb.where("users.email", "like", `%${params.keyword}%`);
  if (params.orderBy === "id-desc") qb.orderBy("users.id", "desc");

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
| `getSubsetQueries(subset)` | Subset 쿼리 빌더 (`{ qb, onSubset }` 반환) |
| `executeSubsetQuery(options)` | Subset 쿼리 실행 |
| `createEnhancers(enhancers)` | Enhancer 객체 생성 헬퍼 (타입 추론) |

## getSubsetQueries

```typescript
const { qb, onSubset } = this.getSubsetQueries(subset);

// qb: 조건 추가용 쿼리 빌더
qb.where("users.status", "active");

// onSubset: 특정 서브셋 전용 타입이 필요할 때
const typedQb = onSubset("A");  // 서브셋 A의 타입으로 추론
```

## executeSubsetQuery 옵션

```typescript
return this.executeSubsetQuery({
  subset,           // 서브셋 키
  qb,               // 쿼리 빌더
  params,           // ListParams (num, page, queryMode, sonamuFilter 등)
  debug: true,      // 쿼리 로그 출력 (기본값: false)
  optimizeCountQuery: true,  // COUNT 쿼리 최적화 - 불필요한 LEFT JOIN 제거 (기본값: false)
  enhancers,        // Enhancer 함수 객체 (옵션)
});
```

### queryMode

params에 queryMode를 전달하여 반환값 제어:

```typescript
// 리스트만 (COUNT 쿼리 스킵) - 성능 최적화
const { rows } = await this.findMany(subset, { ...params, queryMode: "list" });

// 카운트만 (리스트 스킵)
const { total } = await this.findMany(subset, { ...params, queryMode: "count" });

// 둘 다 (기본값)
const { rows, total } = await this.findMany(subset, { ...params, queryMode: "both" });
```

### sonamuFilter (FilterQuery)

params.sonamuFilter로 필터 조건 자동 적용:

```typescript
// 클라이언트에서 전달된 필터
const params = {
  num: 10,
  page: 1,
  sonamuFilter: {
    status: "active",              // eq (기본)
    age: { gte: 18 },              // >=
    role: { in: ["admin", "user"] },
    email: { contains: "@test" },  // LIKE %...%
  }
};

// Model에서 자동 적용됨
return this.executeSubsetQuery({ subset, qb, params });
```

**지원 연산자:**

| 연산자 | SQL | 예시 |
|--------|-----|------|
| `eq` (기본) | `=` | `{ status: "active" }` |
| `ne` | `!=` | `{ status: { ne: "deleted" } }` |
| `gt`, `gte` | `>`, `>=` | `{ age: { gte: 18 } }` |
| `lt`, `lte` | `<`, `<=` | `{ price: { lte: 1000 } }` |
| `in`, `notIn` | `IN`, `NOT IN` | `{ role: { in: ["a", "b"] } }` |
| `contains` | `LIKE %...%` | `{ name: { contains: "kim" } }` |
| `startsWith` | `LIKE ...%` | `{ code: { startsWith: "A" } }` |
| `endsWith` | `LIKE %...` | `{ ext: { endsWith: ".pdf" } }` |
| `isNull`, `isNotNull` | `IS NULL` | `{ deleted_at: { isNull: true } }` |
| `before`, `after` | `<`, `>` (날짜) | `{ created_at: { after: "2024-01-01" } }` |
| `between` | `BETWEEN` | `{ price: { between: [100, 500] } }` |

## Enhancers

virtual 필드 계산 등 쿼리 후 가공:

```typescript
// Enhancer 정의
const enhancers = this.createEnhancers({
  A: async (row) => ({
    ...row,
    fullName: `${row.first_name} ${row.last_name}`,
  }),
  D: async (row) => ({
    ...row,
    age: calculateAge(row.birth_date),
  }),
});

// executeSubsetQuery에서 사용
return this.executeSubsetQuery({ subset, qb, params, enhancers });
```

## Types 파일

```typescript
// user.types.ts
import { z } from "zod";
import { UserOrderBy, UserSearchField, UserBaseSchema, UserBaseListParams } from "../sonamu.generated";

export const UserListParams = UserBaseListParams;
export type UserListParams = z.infer<typeof UserListParams>;

// 기본 패턴: BaseSchema에서 partial 처리
export const UserSaveParams = UserBaseSchema.partial({
  id: true,
  created_at: true,
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

### SaveParams 패턴

**기본 패턴 (relation 없음):**
```typescript
import { UserBaseSchema, UserBaseListParams } from "../sonamu.generated";

export const UserListParams = UserBaseListParams;
export type UserListParams = z.infer<typeof UserListParams>;

export const UserSaveParams = UserBaseSchema.partial({
  id: true,
  created_at: true,
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

**ManyToMany relation이 있는 경우:**
```typescript
// ManyToMany 관계: {relation_name}_ids 배열 추가
export const ProjectSaveParams = ProjectBaseSchema.partial({
  id: true,
  created_at: true,
})
  .extend({
    employee_ids: z.array(z.number().int().positive()),
    tag_ids: z.array(z.number().int().positive()),
  })
  .omit({
    // virtual 필드, 시스템 생성 필드 등은 omit
    virtual_test: true,
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;
```

**BelongsToOne relation의 nullable 필드 처리:**
```typescript
// nullable relation은 자동으로 optional이므로 추가 partial 불필요
export const ResponseSaveParams = ResponseBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true,  // timestamp 필드도 partial 처리
});
export type ResponseSaveParams = z.infer<typeof ResponseSaveParams>;
```

**실제 동작 코드 참고:**
- `sonamu/examples/miomock/api/src/application/project/project.types.ts` - ManyToMany SaveParams 예시
- `sonamu/examples/miomock/api/src/application/employee/employee.types.ts` - BelongsToOne SaveParams 예시

### Model에서 Relation 처리

**Update 시 relation 객체 제거:**
```typescript
// Test에서 Update 시 사용하는 패턴
const original = await UserModel.findById("A", userId);

// Relation 객체 제거하고 FK만 추출
const { institution, ...userData } = original;

await UserModel.save([
  {
    ...userData,
    institution_id: institution?.id ?? null,  // FK 명시적 추가
    name: "수정된이름",
  },
]);
```

**ManyToMany save 시:**
```typescript
// ManyToMany는 _ids 배열로 전달
await ProjectModel.save([
  {
    id: projectId,
    title: "Updated",
    employee_ids: [1, 2, 3],
    tag_ids: [4, 5],
  },
]);
```

**실제 동작 코드 참고:**
- `sonamu/examples/miomock/api/src/application/project/project.model.ts` - ManyToMany save 구현
- `sonamu/examples/miomock/api/src/application/project/project.model.test.ts` - Save 테스트 예시

## 트랜잭션

```typescript
await this.getPuri("w").transaction(async (trx) => {
  await trx.table("users").where("id", fromId).decrement("points", amount);
  await trx.table("users").where("id", toId).increment("points", amount);
});
```

---

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
