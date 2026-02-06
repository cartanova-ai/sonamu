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

Sonamu Model은 다음 기본 메서드를 제공한다:

| 메서드 | 용도 | 비고 |
|--------|------|------|
| `findById` | 단건 조회 | |
| `findMany` | 목록 조회 | |
| `save` | 생성/수정 | upsert 동작 |
| `del` | 삭제 | `delete` 아님 주의 |

**JavaScript 예약어 회피:** `delete`는 JS 예약어이므로 `del`로 명명. TypeScript에서는 컴파일 오류 없이 `delete`를 메서드명으로 사용할 수 있지만, 런타임에서 문제가 발생할 수 있어 Sonamu는 `del`을 사용한다.

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

## 검증 패턴

### 단계별 검증

비즈니스 규칙을 단계별로 검증하는 패턴:

```typescript
async enroll(courseId: number, userId: number): Promise<Enrollment> {
  // 1단계: 중복 체크
  const existing = await this.findOne("A", {
    course_id: courseId,
    user_id: userId,
  });
  
  if (existing) {
    throw new Error("이미 등록된 강좌입니다");
  }
  
  // 2단계: 정원 확인
  const course = await CourseModel.findById("A", courseId);
  const { total } = await this.findMany({ course_id: courseId });
  
  if (total >= course.max_students) {
    throw new Error("정원이 가듍 찼습니다");
  }
  
  // 3단계: 실행
  const [id] = await this.save([{ course_id: courseId, user_id: userId }]);
  return this.findById("A", id);
}
```

### 조건부 검증

조건에 따라 다른 검증 수행:

```typescript
async save(spa: TaskSaveParams[]): Promise<number[]> {
  for (const sp of spa) {
    // 상태가 완료일 때만 완료일 필수
    if (sp.status === "completed" && !sp.completed_at) {
      throw new Error("완료 상태는 완료일이 필요합니다");
    }
    
    // 예산이 있을 때만 금액 범위 체크
    if (sp.budget !== null && sp.budget < 0) {
      throw new Error("예산은 0 이상이어야 합니다");
    }
  }
  
  // 검증 통과 후 저장
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("tasks", sp));
  
  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("tasks");
  });
}
```

### 관련 데이터 검증

다른 테이블과의 관계를 검증:

```typescript
async save(spa: ResponseSaveParams[]): Promise<number[]> {
  for (const sp of spa) {
    // 설문이 아직 열려있는지 확인
    const collection = await CollectionModel.findById("A", sp.collection_id);
    
    if (collection.status === "closed") {
      throw new Error("이미 종료된 설문입니다");
    }
    
    // 응답 기간 확인
    const now = new Date();
    if (now < collection.begin_date || now > collection.end_date) {
      throw new Error("응답 가능 기간이 아닙니다");
    }
  }
  
  // 검증 통과 후 저장
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("responses", sp));
  
  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("responses");
  });
}
```

**핵심 포인트:**
- 검증 실패 시 명확한 에러 메시지
- 검증을 모두 통과한 후에만 저장
- 비즈니스 규칙을 코드로 강제

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

---

## 코드 품질과 일관성

### DRY 원칙: this.modelName 사용

에러 메시지에서 모델명을 하드코딩하지 않고 `this.modelName`을 사용합니다.

**BAD: 모델명 하드코딩**
```typescript
// department.model.ts
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")("Department", id));
}

// user.model.ts
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")("User", id));
}
```

**GOOD: this.modelName 활용**
```typescript
// 모든 Model 공통
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")(this.modelName, id));
}
```

**장점:**
- 복붙 실수 방지: 다른 모델 코드 복사 시 모델명 수정 불필요
- 일관성: 모든 모델이 동일한 패턴 사용
- 유지보수: constructor의 modelName만 변경하면 모든 에러 메시지 자동 반영

### 일관된 i18n 키 사용

프로젝트 전체에서 동일한 목적의 i18n 키를 일관되게 사용합니다.

**BAD: 중복된 i18n 키**
```typescript
// 여러 모델에서 서로 다른 키 사용
throw new NotFoundException(SD("error.entityNotFound")(this.modelName, id));
throw new NotFoundException(SD("error.notFound")(this.modelName, id));
throw new NotFoundException(SD("notFound")(this.modelName, id));

// 검색 필드 오류
throw new BadRequestException(SD("error.unknownSearchField")(params.search));
throw new BadRequestException(SD("error.invalidSearchField")(params.search));
```

**GOOD: 표준 i18n 키 사용**
```typescript
// Entity 조회 실패 - 짧고 명확
throw new NotFoundException(SD("notFound")(this.modelName, id));

// 검색 필드 오류 - search 네임스페이스
throw new BadRequestException(SD("search.invalidField")(params.search));
```

**권장 i18n 키 패턴:**
| 상황 | i18n 키 | 사용처 |
|------|---------|--------|
| Entity 조회 실패 | `notFound` | findById |
| 잘못된 검색 필드 | `search.invalidField` | findMany search |
| 필수 필드 누락 | `validation.required` | save 검증 |
| 권한 없음 | `error.forbidden` | guards 실패 |
| 로그인 필요 | `error.loginRequired` | Context.user null |

### 벌크 리팩토링 전략

여러 모델 파일을 일관되게 수정할 때 sed를 활용한 자동화:

**1단계: 패턴 확인**
```bash
# 수정 대상 파일 찾기
grep -r 'SD("error.entityNotFound")' packages/api/src/application/*/
```

**2단계: 변경 검증 (dry-run)**
```bash
# 변경될 내용 미리 확인
sed -n 's/SD("error.entityNotFound")(\(.*\), id)/SD("notFound")(this.modelName, id)/p' file.ts
```

**3단계: 일괄 적용**
```bash
# 모든 model 파일 수정
find packages/api/src/application -name "*.model.ts" -exec sed -i '' \
  's/SD("error.entityNotFound")(\(.*\), id)/SD("notFound")(this.modelName, id)/g' {} \;
```

**4단계: 빌드로 검증**
```bash
# TypeScript 타입 체크
pnpm typecheck

# 전체 빌드
pnpm build
```

**주의사항:**
- 반드시 git commit 후 실행 (롤백 가능하도록)
- dry-run으로 변경 내용 먼저 확인
- 빌드로 타입 오류 체크
- 테스트 실행으로 동작 검증

### 타입 체크 패턴

**satisfies vs as const:**

```typescript
// BAD: 타입 단언으로 타입 체크 우회
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "wrong-value" as const,  // 오류 감지 안 됨
  ...rawParams,
} as RoleListParams;

// GOOD: satisfies로 컴파일 타임 검증
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "wrong-value" as const,  // 컴파일 오류 발생!
  ...rawParams,
} satisfies RoleListParams;
```

**적용 권장 위치:**
- findMany의 params 기본값
- 복잡한 객체 리터럴 (타입 체크가 중요한 경우)

### 코드 리뷰 체크리스트

새로운 Model 작성 시:
- [ ] `this.modelName` 사용 (하드코딩 금지)
- [ ] 표준 i18n 키 사용 (`notFound`, `search.invalidField`)
- [ ] satisfies 키워드 활용 (타입 안전성)
- [ ] debug 옵션 불필요하게 명시하지 않음
- [ ] orderBy 모든 케이스 exhaustive 처리
- [ ] ManyToMany relation이 있으면 _ids 배열 SaveParams에 추가

20개 Model 일괄 수정 시:
- [ ] miomock 같은 레퍼런스 코드와 패턴 비교
- [ ] 불일치하는 패턴 우선순위 정리
- [ ] sed 등으로 자동화 스크립트 작성
- [ ] 변경 전 git commit
- [ ] dry-run으로 변경 내용 검증
- [ ] pnpm typecheck로 타입 오류 확인
- [ ] pnpm test로 동작 검증
