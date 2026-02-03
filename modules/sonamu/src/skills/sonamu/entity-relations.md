---
name: sonamu-entity-relations
description: Sonamu Entity 관계 정의 시 참조. BelongsToOne, HasMany, OneToOne, ManyToMany 설정과 흔한 실수 방지. Use when defining entity relationships.
---

# Entity 관계 정의

**실제 동작 코드 참고:**
- `sonamu/examples/miomock/api/src/application/project/` - ManyToMany 관계 전체 예시
- `sonamu/examples/miomock/api/src/application/employee/` - BelongsToOne 관계 예시
- `sonamu/examples/miomock/api/src/application/company/` - HasMany 관계 예시

## 관계 선택 가이드

### 1:N vs N:M 판단 기준

| 질문 | 1:N (BelongsToOne) | N:M (ManyToMany 또는 중간 엔티티) |
|------|-------------------|----------------------------------|
| A 하나가 B 여러 개에 속할 수 있나? | 아니오 | 예 |
| 관계에 추가 정보가 필요한가? | 아니오 | 예 → 중간 엔티티 |
| "A는 B에 속한다"로 표현 가능한가? | 예 | 아니오 |

**예시:**
- 게시글 → 작성자: 1:N (게시글 하나는 작성자 한 명)
- 게시글 ↔ 태그: N:M (게시글 여러 개에 태그 여러 개)
- 연구원 ↔ 과제: N:M + 중간 엔티티 (참여율, 역할 등 추가 정보)

### 중간 엔티티가 필요한 경우

N:M 관계에 **추가 정보**가 있으면 ManyToMany 대신 **중간 엔티티**를 사용합니다.

| 상황 | ManyToMany | 중간 엔티티 |
|------|-----------|------------|
| 단순 연결만 필요 | ✓ | |
| 관계에 날짜/기간 필요 | | ✓ |
| 관계에 역할/상태 필요 | | ✓ |
| 관계에 수량/비율 필요 | | ✓ |
| 관계 이력 관리 필요 | | ✓ |

**중간 엔티티 예시:**
```
연구원 ↔ 과제
  └─ 참여연구원 (중간 엔티티)
       - researcher: BelongsToOne → User
       - task: BelongsToOne → Task
       - role: enum (책임자/참여자)
       - participation_rate: integer (참여율)
       - begin_at, end_at: date (참여기간)
```

### 공동 소유/공동 성과 패턴

하나의 결과물에 여러 사람이 연결되는 경우:

```
성과 ↔ 연구원
  └─ 성과참여자 (중간 엔티티)
       - achievement: BelongsToOne → Achievement
       - researcher: BelongsToOne → User
       - is_primary: boolean (최초 등록자 여부)
       - contribution_rate: integer (기여율, 선택)
```

**핵심**: 성과는 한 번만 등록되고, 참여자들이 연결됨 (중복 방지)

### 상태 이력 패턴

상태 변경 이력을 관리해야 하는 경우:

```
신청서 (ApplyDeliberation)
  └─ 신청이력 (ApplyDeliberationHistory)
       - apply_deliberation: BelongsToOne → ApplyDeliberation
       - status: enum (이전 상태 또는 변경된 상태)
       - changed_at: date
       - changed_by: BelongsToOne → User
       - reason: string (사유)
```

### 변경 신청 패턴

데이터 변경에 승인 프로세스가 필요한 경우:

```
과제 (Task)
  └─ 과제변경신청 (TaskChangeRequest)
       - task: BelongsToOne → Task
       - status: enum (신청/승인/반려)
       - reason: string (변경 사유)
       - requested_by: BelongsToOne → User
       - requested_at: date
       - approved_by: BelongsToOne → User (nullable)
       - approved_at: date (nullable)

  └─ 변경이력 (TaskChangeHistory)
       - change_request: BelongsToOne → TaskChangeRequest
       - change_type: enum (추가/삭제/수정)
       - target_user: BelongsToOne → User (변경 대상)
       - before_value: json (변경 전, 선택)
       - after_value: json (변경 후, 선택)
```

---

## 흔한 도메인 패턴

### 조직 구조 (기관-부서-사용자)

```
Institution (기관)
  └─ departments: HasMany → Department

Department (부서)
  └─ institution: BelongsToOne → Institution
  └─ employees: HasMany → User

User (사용자)
  └─ institution: BelongsToOne → Institution
  └─ department: BelongsToOne → Department
```

### 프로젝트 참여 (프로젝트-참여자)

```
Project (프로젝트)
  └─ participants: HasMany → ProjectParticipant
  └─ owner: BelongsToOne → User

ProjectParticipant (참여자) [중간 엔티티]
  └─ project: BelongsToOne → Project
  └─ user: BelongsToOne → User
  └─ role: enum
  └─ participation_rate: integer
  └─ begin_at, end_at: date
```

### 위원회-위원

```
Committee (위원회)
  └─ members: HasMany → CommitteeMember

CommitteeMember (위원) [중간 엔티티]
  └─ committee: BelongsToOne → Committee
  └─ user: BelongsToOne → User
  └─ member_type: enum (내부/외부)
  └─ participate_year: string
```

### 심사/평가 (대상-심사위원-결과)

```
EvaluationTarget (평가대상)
  └─ committee: BelongsToOne → Committee
  └─ target_entity: BelongsToOne → Task (또는 다형성)

EvaluationResult (평가결과)
  └─ target: BelongsToOne → EvaluationTarget
  └─ evaluator: BelongsToOne → CommitteeMember
  └─ score: integer 또는 enum (가결/부결)
  └─ opinion: string
```

### 단계별 데이터 흐름 (신청 → 확정)

데이터가 단계별로 넘어가는 경우:

```
ApplyDeliberation (심의신청)
  └─ task: OneToOne → Task (가결 시 생성된 과제 참조)

Task (과제)
  └─ apply_deliberation: BelongsToOne → ApplyDeliberation (원본 신청 참조)
```

**핵심**: 양방향 참조로 어느 쪽에서든 조회 가능

---

## 어떤 관계를 사용해야 하나?

| 상황 | 관계 타입 | 예시 |
|------|----------|------|
| "A는 B에 속한다" (N:1) | `BelongsToOne` | Post → User (작성자) |
| "A는 여러 B를 가진다" (1:N) | `HasMany` | User → Posts |
| "A와 B는 1:1이다" | `OneToOne` | User ↔ Employee |
| "A와 B는 다대다다" | `ManyToMany` | Post ↔ Tag |

## BelongsToOne (N:1) - 가장 흔함

**상황**: Post가 User에 속할 때 (작성자)

```json
{
  "type": "relation",
  "name": "author",
  "with": "User",
  "relationType": "BelongsToOne",
  "nullable": true,
  "onUpdate": "CASCADE",
  "onDelete": "SET NULL",
  "desc": "작성자"
}
```

**자동 생성**: `author_id` 컬럼 (FK)

**주의**: `author_id`를 props에 직접 정의하지 말 것 (자동 생성됨)

## HasMany (1:N) - 역방향 조회용

**상황**: User의 Posts를 조회하고 싶을 때

```json
{
  "type": "relation",
  "name": "posts",
  "with": "Post",
  "relationType": "HasMany",
  "joinColumn": "author_id",
  "desc": "작성한 게시글"
}
```

**필수**: `joinColumn` = 상대 테이블의 FK 컬럼명

**중요**: `joinColumn` 필드가 정의되지 않으면 Zod 스키마 검증 오류가 발생합니다.

**DB 컬럼 생성 안 됨** (virtual)

**언제 필요한가?**
- Subset에서 `user.posts.title` 같은 역방향 조회가 필요할 때
- 필요 없으면 생략해도 됨

### HasMany 성능 최적화

HasMany 관계는 자동으로 **DataLoader 패턴**으로 최적화됩니다:
- 부모 레코드 ID들을 배치(batch)로 수집
- 단일 `whereIn` 쿼리로 모든 자식 레코드 조회
- **N+1 쿼리 문제 발생하지 않음**

이 최적화는 자동으로 적용되므로 추가 설정이 필요 없습니다.

**구현 위치**: `modules/sonamu/src/database/base-model.ts`의 `processLoaders` 메서드

## OneToOne (1:1)

**상황**: User와 Employee가 1:1일 때

**FK를 가지는 쪽** (Employee):
```json
{
  "type": "relation",
  "name": "user",
  "with": "User",
  "relationType": "OneToOne",
  "hasJoinColumn": true,
  "onUpdate": "CASCADE",
  "onDelete": "CASCADE",
  "desc": "사용자"
}
```

**FK가 없는 쪽** (User):
```json
{
  "type": "relation",
  "name": "employee",
  "with": "Employee",
  "relationType": "OneToOne",
  "nullable": true,
  "desc": "직원정보"
}
```

**핵심**: `hasJoinColumn: true`인 쪽에만 FK 생성 (생략 시 FK 없음, optional 옵션)

## ManyToMany (N:M)

**상황**: Post와 Tag가 다대다일 때

```json
{
  "type": "relation",
  "name": "tags",
  "with": "Tag",
  "relationType": "ManyToMany",
  "joinTable": "posts__tags",
  "onUpdate": "CASCADE",
  "onDelete": "CASCADE",
  "desc": "태그"
}
```

**필수**: `joinTable`, `onUpdate`, `onDelete`

**joinTable 권장 규칙**: 알파벳 순 (`posts__tags` 권장, `tags__posts`도 작동함)

## 자기 참조

**상황**: Employee의 manager도 Employee일 때

```json
{
  "type": "relation",
  "name": "manager",
  "with": "Employee",
  "relationType": "BelongsToOne",
  "nullable": true,
  "onUpdate": "CASCADE",
  "onDelete": "SET NULL",
  "desc": "상위 매니저"
}
```

**필수**: `nullable: true` (최상위는 manager 없음)

## IMPORTANT: parentId and Parent Subset HasMany Cannot Be Used Together

### 문제 상황

parentId를 설정하면 자식 엔티티의 **BaseSchema에서 FK 컬럼이 제거**됩니다.
이 상태에서 부모의 subset에 자식을 HasMany로 포함시키면 SSO LoaderQuery가
`whereIn("child.parent_fk", fromIds)`를 실행하는데, FK가 없어서 TypeScript 오류 발생.

```
오류: '{child_table}.{parent_fk}' is not assignable to type 'AvailableColumns'
```

### 해결: 둘 중 하나 선택

| 요구사항 | 선택 | parentId | 부모 subset에서 HasMany |
|---------|------|----------|------------------------|
| 부모 상세에서 자식 목록 함께 조회 | 독립 엔티티 | ✗ 미사용 | ✓ 가능 |
| 자식은 부모 통해서만 CRUD | parentId 사용 | ✓ 사용 | ✗ 불가 |

### 판단 기준

| 질문 | 예 → 독립 엔티티 | 아니오 → parentId |
|------|-----------------|------------------|
| 자식만 단독 조회/수정할 일이 있나? | ✓ | |
| 관리자 화면에 자식 별도 목록 페이지 필요? | ✓ | |
| 부모 상세에서 자식 목록을 subset으로 조회? | ✓ | |

### 예시

```json
// DO NOT - Incorrect (오류 발생)
// entity: ApplyDeliberationResearcher
{ "parentId": "apply_deliberation_id" }  // FK가 BaseSchema에서 제거됨

// entity: ApplyDeliberation subset
{ "A": ["*", { "researchers": ["*"] }] }  // SSO LoaderQuery 오류

// DO - Correct (독립 엔티티로 변경, parentId 제거)
// entity: ApplyDeliberationResearcher - parentId 없음, FK가 BaseSchema에 유지됨
// entity: ApplyDeliberation subset
{ "A": ["*", { "researchers": ["*"] }] }  // 정상 작동
```

---

## FK 참조 규칙 (FieldExpr)

BelongsToOne 관계를 정의하면 `{name}_id` 컨럼이 자동 생성되지만, **Entity 정의 내에서는 `{name}.id` 형태로 참조**해야 합니다.

### 적용 대상

| 위치 | 잘못된 예 | 올바른 예 |
|------|----------|----------|
| subsets | `"user_id"` | `"user.id"` |
| indexes | `"user_id"` | `"user.id"` |
| unique | `["user_id", "date"]` | `["user.id", "date"]` |
| search | `"user_id"` | `"user.id"` |

### 예시

```json
// WRONG - "user_id"를 직접 사용하면 에러 발생
{
  "id": "ApiLog",
  "props": [
    { "type": "relation", "name": "user", "with": "User", "relationType": "BelongsToOne" }
  ],
  "subsets": {
    "A": ["id", "user_id", "api_path"]  // WRONG: user_id
  },
  "indexes": [
    ["user_id"]  // WRONG: user_id
  ]
}

// CORRECT - "user.id" 형태로 참조
{
  "id": "ApiLog",
  "props": [
    { "type": "relation", "name": "user", "with": "User", "relationType": "BelongsToOne" }
  ],
  "subsets": {
    "A": ["id", "user.id", "api_path"]  // CORRECT: user.id
  },
  "indexes": [
    ["user.id"]  // CORRECT: user.id
  ]
}
```

### 에러 메시지

```
Error: ApiLog -- 잘못된 FieldExpr 'user_id' (사용 가능한 props: id, created_at, ..., user)
```

이 에러가 보이면 `user_id` → `user.id`로 변경하세요.

---

## 흔한 실수

| 실수 | 해결 |
|------|------|
| 별도 `"relations": [...]` 섹션 사용 | `props` 안에 `"type": "relation"`으로 정의 |
| BelongsToOne에서 `{name}_id` 직접 정의 | 삭제 (자동 생성됨) |
| Subset에서 `user_id` 직접 사용 | `user.id` 형태로 변경 |
| OneToOne에서 FK 의도와 불일치 | FK 가지는 쪽에 `hasJoinColumn: true` 명시 (optional, 생략 시 FK 없음) |
| HasMany에서 `joinColumn` 누락 | 상대 테이블의 FK 컬럼명 지정 |
| ManyToMany에서 `onUpdate/onDelete` 누락 | 필수로 추가 |
| joinTable 이름 불일치 | 일관된 네이밍 권장 (알파벳 순) |
| 자기참조에서 `nullable: false` | `nullable: true`로 변경 |

## Subset에서 관계 사용
- `subset.md` 참조
```json
{
  "subsets": {
    "A": [
      "id",
      "title",
      "author.id",
      "author.username",
      "author.department.name"
    ]
  }
}
```

- dot notation으로 중첩 가능
- JOIN 자동 생성

---

## ManyToMany 관계의 타입 정의

ManyToMany 관계는 Entity JSON에서 정의하지만, SaveParams에는 join 테이블 데이터를 배열로 전달해야 합니다.

참고: sonamu/examples/miomock/api/src/application/project

### SaveParams에서 ManyToMany 처리

**패턴: BaseSchema.partial().extend() 사용**

```typescript
// project.types.ts (miomock 예시)
import { z } from "zod";
import { ProjectBaseSchema } from "../sonamu.generated";

export const ProjectSaveParams = ProjectBaseSchema
  .partial({
    id: true,
    created_at: true,
  })
  .extend({
    employee_ids: z.array(z.number().int().positive()),  // ManyToMany: employee
    tag_ids: z.array(z.number().int().positive()),       // ManyToMany: tags
  })
  .omit({
    virtual_test: true,           // virtual 필드 제거
    virtual_query_test: true,
    textsearchable_index_col: true,  // generated 필드 제거
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;
```

**중요:**
- BaseSchema에는 ManyToMany 관계 필드가 없으므로 `.extend()`로 추가
- 필드명은 `{relation_name}_ids` 형태 (예: employee → employee_ids, tags → tag_ids)
- 타입 검증: `z.array(z.number().int().positive())` - 양수 정수만 허용
- virtual/generated 필드는 `.omit()`으로 제거
- 양방향 ManyToMany는 한쪽에서만 관리 (Project만, Employee는 관리 안함)

### Model.save()에서 처리 (권장 패턴)

**효율적인 패턴: whereNotIn으로 변경분만 삭제**

```typescript
// project.model.ts (miomock 예시)
async save(spa: ProjectSaveParams[]): Promise<number[]> {
  const puri = this.getPuri("w");

  // register
  spa.forEach(({ employee_ids, tag_ids, ...sp }) => {
    const project_id = puri.ubRegister("projects", sp);

    employee_ids.forEach((employee_id) => {
      puri.ubRegister("projects__employees", {
        project_id,
        employee_id,
      });
    });

    tag_ids.forEach((tag_id) => {
      puri.ubRegister("project_tags", {
        project_id,
        tag_id,
      });
    });
  });

  return puri.transaction(async (trx) => {
    const ids = await trx.ubUpsert("projects");
    const peIds = await trx.ubUpsert("projects__employees");
    const ptIds = await trx.ubUpsert("project_tags");

    // 핵심: whereNotIn으로 현재 요청에 없는 관계만 삭제 (효율적)
    await trx
      .table("projects__employees")
      .whereIn("project_id", ids)
      .whereNotIn("id", peIds)  // ubUpsert 결과에 없는 것만 삭제
      .delete();

    await trx
      .table("project_tags")
      .whereIn("project_id", ids)
      .whereNotIn("id", ptIds)
      .delete();

    return ids;
  });
}
```

**기본 패턴: 전체 삭제 후 재등록 (간단하지만 비효율적)**

```typescript
async save(spa: QuestionCollectionSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");

  const categoryIdsList: (number[] | undefined)[] = [];
  spa.forEach((sp) => {
    const { category_ids, ...collectionData } = sp as any;
    categoryIdsList.push(category_ids);
    wdb.ubRegister("question_collections", collectionData);
  });

  return wdb.transaction(async (trx) => {
    const ids = await trx.ubUpsert("question_collections");

    // 전체 삭제 (비효율적이지만 간단)
    await trx
      .table("question_collections__survey_categories")
      .whereIn("question_collection_id", ids)
      .delete();

    // 새 관계 등록
    ids.forEach((collectionId, index) => {
      const categoryIds = categoryIdsList[index];
      if (categoryIds && categoryIds.length > 0) {
        categoryIds.forEach((categoryId) => {
          trx.ubRegister("question_collections__survey_categories", {
            question_collection_id: collectionId,
            survey_category_id: categoryId,
          });
        });
      }
    });

    await trx.ubUpsert("question_collections__survey_categories");
    return ids;
  });
}
```

### Update 시 주의사항

Update 테스트에서 조회한 데이터를 다시 save할 때, ManyToMany 관계 필드를 다시 제공해야 합니다:

```typescript
// WRONG - category_ids 없이 save하면 관계가 모두 삭제됨
const { categories, ...collectionData } = collection;
await QuestionCollectionModel.save([
  { ...collectionData, title: "수정된제목" }
]);

// CORRECT - categories에서 ids 추출하여 전달
const { categories, ...collectionData } = collection;
const category_ids = categories?.map(c => c.id) ?? [];
await QuestionCollectionModel.save([
  { ...collectionData, category_ids, title: "수정된제목" }
]);
```

### 양방향 ManyToMany 관리

**원칙: 한쪽에서만 관리**

```typescript
// Project Entity: employee (ManyToMany)
// Employee Entity: projs (ManyToMany, 같은 join 테이블)

// project.types.ts - employee_ids 관리
export const ProjectSaveParams = ProjectBaseSchema
  .extend({
    employee_ids: z.array(z.number().int().positive()),
  });

// employee.types.ts - proj_ids 관리 안함
export const EmployeeSaveParams = EmployeeBaseSchema
  .partial({ id: true, created_at: true });
// proj_ids를 추가하지 않음
```

**이유:**
- 양쪽에서 관리하면 동기화 문제 발생
- 주 Entity(Project)에서만 관리하는 것이 명확
- Employee 조회 시 projs는 자동으로 join되어 조회됨

**핵심:** ManyToMany 관계는 Entity JSON에서 정의되지만, 코드에서는 `{relation}_ids` 배열로 명시적으로 관리하며, 양방향 관계는 한쪽에서만 관리합니다.
