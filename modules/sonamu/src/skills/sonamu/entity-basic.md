---
name: sonamu-entity-basic
description: Sonamu Entity 생성/수정 시 참조. 필드 타입, 요구사항 분석, 부모-자식 관계, OrderBy/Enum 규칙. Use when creating or modifying entities. 검증 체크리스트는 entity-validation-checklist.md 참조.
---

# Entity 기본 구조

**실제 동작 코드 참고:**

- `sonamu/examples/miomock/api/src/application/user/user.entity.json` - 기본 Entity 예시
- `sonamu/examples/miomock/api/src/application/project/project.entity.json` - 복잡한 Entity 예시
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json` - BelongsToOne 관계 예시

## 사용자 요청 시작 시나리오

사용자가 시스템 구축을 요청하면 다음 순서로 진행:

**1. 요구사항 분석** (누락된 Entity 확인)

- "사용자(User) Entity가 필요한가요?"
- "추가로 필요한 Entity가 있나요?"

**2. Entity 간 관계 확인** (한 번에 하나씩 질문)

- "A와 B는 1:N인가요, N:M인가요?"
- "챕터는 강좌의 자식으로 함께 관리할까요?"

**3. parentId 사용 여부 결정**

- "부모 없이 존재 불가한가요?"
- "부모와 함께 생성/삭제되나요?"

**4. 사용자 최종 확인**

- Entity 목록 확정
- 관계 다이어그램 또는 명확한 설명 제공

### 엔티티 설계 완료 체크리스트

- [ ] 모든 필수 Entity 식별 완료
- [ ] Entity 간 관계 정의 완료
- [ ] parentId 사용 여부 결정
- [ ] 사용자 확인 완료

**완료 시:** 다음 단계 "Entity 생성 워크플로우" 시작

**전체 워크플로우 참조:** `workflow.md` - 5단계 전체 가이드

---

## Entity 생성 워크플로우

**사전 준비: CRITICAL!**

**반드시 `/packages/api`에서 `pnpm dev`를 먼저 실행하세요!**

```bash
cd packages/api
pnpm dev  # 이 상태로 유지하면서 작업
```

> **이유**: dev 모드에서 syncer가 entity.json 변경을 감지하여 types.ts를 자동 생성합니다.
>
> auth 엔티티뻐만 아니라 **모든 엔티티 생성 시 dev 모드가 필수**입니다.

### 1단계: stub 생성

**CRITICAL: EntityId는 반드시 대문자로 시작해야 합니다!**

```bash
pnpm sonamu stub entity {EntityId}
```

**올바른 예시:**

- `pnpm sonamu stub entity Course` ✅
- `pnpm sonamu stub entity User` ✅
- `pnpm sonamu stub entity ConsultationHistory` ✅

**잘못된 예시:**

- `pnpm sonamu stub entity course` ❌ (소문자로 시작)
- `pnpm gen stub entity Course` ❌ (잘못된 명령어)

생성되는 파일: `api/src/application/{entity}/{entity}.entity.json`

### 2단계: stub 파일 수정

생성된 entity.json 파일에 props, relations, subsets 추가

### 3단계: 검증 및 필수 파일 생성

**CRITICAL: sync 실행 전에 반드시 검증하세요!**

**A. entity.json 검증** (`entity-validation-checklist.md` PHASE 1 참조)

- [ ] 인덱스에 type 필드 있는가?
- [ ] Subset에서 FK를 직접 참조하지 않고 relation.id 형식 사용?
- [ ] Boolean dbDefault가 "true"/"false" 문자열?
- [ ] OrderBy enum은 id-desc만 있는가?
- [ ] Enum dbDefault는 이스케이프된 큰따옴표? (예: `"\"pending\""`)

**B. model.ts (수동 생성 필수)**

- 반드시 수동 생성 필요
- 다른 entity의 model.ts 참고하여 작성
- 필수 메서드: findById, findOne, findMany, save, del
- 템플릿은 `entity-validation-checklist.md` PHASE 2 참조

**C. types.ts (자동 생성 - 대기 필요)**

- **pnpm dev 실행 중이면** syncer가 2-3초 내 자동 생성
- 확인: `ls packages/api/src/application/{entity}/{entity}.types.ts`
- 생성 안 되면:
  1. pnpm dev가 실행 중인지 확인
  2. 여전히 안 되면 수동 생성 (템플릿은 `entity-validation-checklist.md` PHASE 2 참조)

**완료 확인:**

- [ ] entity.json 검증 통과
- [ ] model.ts 존재
- [ ] types.ts 존재 (자동 생성 또는 수동 생성)

### 4단계: sync

```bash
pnpm sonamu sync
```

**주의:** Entity JSON을 직접 작성하지 말고, 반드시 stub 명령어로 생성 후 수정할 것.

### 5단계: Migration 및 Scaffolding

1. Migration 생성 및 apply
2. Scaffolding 실행
3. Build 테스트

**전체 워크플로우:** `entity-validation-checklist.md`에서 단계별 체크리스트 확인

### 6단계: types.ts nullable 필드 처리 (필수)

**CRITICAL: 테스트 작성 전 즉시 처리하세요!**

scaffolding 완료 후 생성된 `*.types.ts` 파일에서 nullable 필드를 처리해야 합니다.

```typescript
// 자동 생성된 types.ts
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
});

// CORRECT: 즉시 수정 - nullable 필드 추가
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  category: true, // nullable 추가
  order_num: true, // nullable 추가
}).extend({
  category: z.string().nullish(),
  order_num: z.number().nullish(),
  updated_at: z.date().nullish(),
});
```

**상세 가이드:** `testing.md`의 "엔티티 생성 후 즉시 해야 할 작업" 참조

## 새 Entity 생성 시 체크리스트

1. **id**: PascalCase (예: `User`, `BlogPost`)
2. **table**: snake_case 복수형 (예: `users`, `blog_posts`) - 생략 가능
3. **title**: 한글 표시명
4. **props 권장**: `id`, `created_at` (스키마에서 강제되지 않으나 Best Practice)
5. **enums 권장**: `{EntityId}OrderBy`, `{EntityId}SearchField` (스키마에서 강제되지 않으나 Best Practice)

## IMPORTANT: Analyze Requirements Before Creating Entity

**STOP! Entity를 만들기 전에 질문을 하나씩 하세요.**

### 누락된 Entity 확인

사용자가 명시적으로 언급한 Entity만 생성하지 말 것. **한 번에 하나씩 질문:**

- "사용자(User) Entity가 필요한가요?" → 응답 대기
- "User의 역할이 여러 개인가요?" → 응답 대기
- "추가로 필요한 Entity가 있나요?" → 응답 대기

**User Entity 주의**: `id`는 자동 증가 시퀀스(PK)이며 로그인 아이디가 아님. better-auth 사용 시 별도 `login_id` 불필요 (auth 테이블이 관리).

**자주 누락되는 Entity**: 컨텐츠(Comment, Like, Tag, Category), 커머스(Review, Cart, Payment), 예약(Reservation, Schedule), 교육(Enrollment, Progress)

### 여러 Entity 요청 시 - 관계 확인

2개 이상 Entity 요청 시 **코드 작성 전에 관계를 하나씩 질문**:

- BelongsToOne, HasMany, ManyToMany, parentId 중 어떤 관계인지
- 부모-자식 종속(삭제 시 함께 삭제)인지 독립적인지

### 설계 전 반드시 확인

**1. Polymorphic Association** (`entity_type + entity_id` 패턴):

- string PK 엔티티(better-auth User 등)가 있으면 → `entity_id`를 `string` 타입으로 통일
- 없으면 → `integer` 사용 가능

**2. 도메인 용어 ↔ 엔티티 영문 ID 매핑**: 코드 작성 전에 사용자와 확정 (예: "위탁연구과제" → `ResearchContract`). 중간에 바뀌면 전체 rename 필요.

## 부모-자식 관계 (parentId)

### parentId란?

자식 Entity가 부모 Entity에 종속되어 함께 관리될 때 사용하는 최상위 옵션.

- parentId 설정 시: 자식은 독립 CRUD 없이 부모를 통해 생성/수정/삭제
- parentId 미설정 시: 독립 Entity로 별도 CRUD 가능

### 언제 parentId를 사용하나?

| 상황                     | parentId | 예시                       |
| ------------------------ | -------- | -------------------------- |
| 부모 없이 존재 불가      | O        | 주문아이템 → 주문          |
| 부모와 함께 생성/삭제    | O        | 챕터 → 강좌, 레슨 → 챕터   |
| 독립적으로 CRUD 가능     | X        | 댓글 → 게시글              |
| 여러 부모에 속할 수 있음 | X        | 태그 → 게시글 (ManyToMany) |

### parentId 사용 예시

```json
{
  "id": "OrderItem",
  "table": "order_items",
  "title": "주문아이템",
  "parentId": "Order",
  "props": [...]
}
```

### parentId 엔티티는 types.ts가 생성되지 않음

parentId가 설정된 자식 엔티티(예: Chapter, Lesson)는 독립적인 `types.ts` 파일이 생성되지 않습니다. 이는 정상 동작이며, 자식 엔티티는 부모 엔티티를 통해 함께 관리되기 때문입니다. 독립 CRUD와 types.ts가 필요한 경우 parentId를 사용하지 않아야 합니다.

### parentId 자식 엔티티 폴더 위치

parentId가 설정된 자식 엔티티는 **루트 부모 엔티티와 같은 폴더**에 위치해야 합니다.

| 구조                         | 설명                                        |
| ---------------------------- | ------------------------------------------- |
| `course/course.entity.json`  | 루트 엔티티                                 |
| `course/chapter.entity.json` | parentId: "Course" → 같은 폴더              |
| `course/lesson.entity.json`  | parentId: "Chapter" → 같은 폴더 (루트 기준) |
| `course/course.types.ts`     | types.ts는 루트만 생성됨                    |

**주의**: 자식 엔티티를 별도 폴더(`chapter/chapter.entity.json`)에 생성하면 안 됩니다.

### IMPORTANT: When Uncertain - Ask User (Never Guess)

**추측하지 말고 질문하세요.** 다음과 같은 상황에서는 사용자에게 직접 물어볼 것:

- "챕터를 강좌의 자식으로 함께 관리할까요, 아니면 독립 Entity로 만들까요?"
- "주문아이템을 주문과 함께 저장할까요, 아니면 별도로 관리할까요?"

**확신이 없으면 질문하세요. 틀린 설계보다 질문 한 번이 낫습니다.**

**판단에 도움이 되는 질문들 (사용자에게 물어볼 것):**

- "이 데이터를 부모 없이 단독으로 조회/수정할 일이 있나요?"
- "부모가 삭제되면 이 데이터도 함께 삭제되어야 하나요?"
- "관리자 화면에서 별도 목록 페이지가 필요한가요?"

## 최소 템플릿

```json
{
  "id": "Product",
  "table": "products",
  "title": "상품",
  "props": [
    { "name": "id", "type": "integer", "desc": "ID" },
    {
      "name": "created_at",
      "type": "date",
      "dbDefault": "CURRENT_TIMESTAMP",
      "desc": "등록일시"
    },
    { "name": "name", "type": "string", "length": 255, "desc": "상품명" }
  ],
  "indexes": [],
  "subsets": { "A": ["id", "name", "created_at"] },
  "enums": {
    "ProductOrderBy": { "id-desc": "ID최신순" },
    "ProductSearchField": { "id": "ID", "name": "상품명" }
  }
}
```

## 상황별 가이드

### 문자열 필드 추가할 때

```json
{ "name": "title", "type": "string", "length": 255, "desc": "제목" }
```

- `length` 생략 시 → `text` 타입으로 저장 (긴 텍스트용)

### Enum 필드 추가할 때

```json
// 1. props에 추가
{ "name": "status", "type": "enum", "id": "ProductStatus", "desc": "상태" }

// 2. enums에 정의 (MUST - 누락 시 오류 발생)
"ProductStatus": { "draft": "임시저장", "published": "공개", "archived": "보관" }
```

### IMPORTANT: 고정값 필드는 반드시 enum으로

선택지가 정해진 필드를 `string`으로 정의하면 DB 정합성이 깨진다.

**판단: "이 값이 코드 외부에서 자유롭게 입력될 수 있는가?"** No → enum, Yes → string

**enum 후보 식별**: `faker.helpers.arrayElement([...])` 형태의 string, "다음 중 하나/구분/유형" 나열, 셀렉트박스/라디오버튼 표시 필드

```json
// WRONG: string으로 정의
{ "name": "budget_item", "type": "string", "desc": "비목명" }
// CORRECT: enum으로 정의
{ "name": "budget_item", "type": "enum", "id": "BudgetItem", "desc": "비목" }
```

### nullable 필드 추가할 때

```json
{ "name": "deleted_at", "type": "date", "nullable": true, "desc": "삭제일시" }
```

**CRITICAL: nullable 속성의 중요성**

`nullable: true`가 **없는** 필드는 **필수 필드**로 간주됩니다.

Sonamu의 `ubUpsert`는 PostgreSQL의 `ON CONFLICT ... DO UPDATE`를 사용하므로,
업데이트 시에도 **모든 필수 필드**를 포함해야 합니다.

```json
// 예시
{
  "props": [
    { "name": "title", "type": "string" }, // 필수! (nullable 없음)
    { "name": "content", "type": "string" }, // 필수! (nullable 없음)
    { "name": "category", "type": "string", "nullable": true } // 선택 (nullable 있음)
  ]
}
```

**규칙**:

- 선택 필드가 아니면 `nullable: true` 추가 금지
- 선택 필드라면 반드시 `nullable: true` 명시
- 테스트/API에서 필수 필드는 항상 값 제공 필요

**상세**: `testing.md` "Quick Start" 및 `upsert.md` "CRITICAL: 필수 필드 포함 필수" 참조

### JSON 필드 추가할 때

```json
{
  "name": "metadata",
  "type": "json",
  "id": "ProductMetadata",
  "desc": "메타데이터"
}
```

- `id` 필수 (타입명으로 사용)
- 별도로 TypeScript 타입 정의 필요

### 유니크 제약 추가할 때

```json
{
  "name": "products_sku_unique",
  "type": "unique",
  "columns": [{ "name": "sku" }]
}
```

### 복합 유니크 제약

```json
{
  "name": "cart_items_unique",
  "type": "unique",
  "columns": [{ "name": "user_id" }, { "name": "product_id" }]
}
```

### IMPORTANT: indexes에서 FK 컨럼명은 실제 DB 컨럼명을 사용한다

**indexes와 subsets에서 FK 컨럼을 참조하는 방식이 다르다. 혼동하지 않는다.**

| 위치      | 사용 형식                  | 예시                                  |
| --------- | -------------------------- | ------------------------------------- |
| `indexes` | 실제 DB 컨럼명             | `role_id`, `user_id`, `department_id` |
| `subsets` | FieldExpr (relation.field) | `role.id`, `user.id`, `department.id` |

**DO NOT:**

```json
// indexes에서 FieldExpr 사용 → 오류
"indexes": [
  { "name": "ix_role", "type": "index", "columns": [{ "name": "role.id" }] }
]
```

**DO:**

```json
// indexes는 실제 DB 컨럼명
"indexes": [
  { "name": "ix_role_id", "type": "index", "columns": [{ "name": "role_id" }] }
]

// subsets는 FieldExpr
"subsets": {
  "A": ["id", "role.id", "role.name"]
}
```

### IMPORTANT: unique 제약은 비즈니스 규칙 기준으로

기술적 판단이 아니라 **"같은 조합이 두 번 insert되면?"** → 오류여야 하면 unique, 허용이면 index만.

**복합 unique가 필요한 패턴**: 연도별 설정(`type, dept_id, year`), 사용자-역할 매핑, 연차별 예산(`project_id, year, budget_item`), 좋아요/북마크(`user_id, entity_id`)

## 흔한 실수

| 실수                                 | 해결                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `id` prop 누락                       | 추가 권장 (대부분의 Model 로직에서 필요)                                 |
| `created_at` prop 누락               | 추가 권장, `dbDefault: "CURRENT_TIMESTAMP"`                              |
| `OrderBy` enum 누락                  | `{EntityId}OrderBy` 추가 권장 (findMany 정렬에 필요)                     |
| `SearchField` enum 누락              | `{EntityId}SearchField` 추가 권장 (검색 기능에 필요)                     |
| enum prop의 `id`가 enums에 없음      | enums 섹션에 정의 추가                                                   |
| json prop에 `id` 누락                | `id` 필드 추가                                                           |
| `"type": "text"` 직접 사용           | `text`는 유효하지 않음. `"type": "string"` + length 생략으로 사용        |
| `OrderBy` enum에 여러 값 추가        | **기본은 `id-desc`만 생성** (아래 참조)                                  |
| 고정 선택지 필드를 `string`으로 정의 | enum으로 변환 (fixtureGenerator가 arrayElement인 필드 확인)              |
| unique 제약 없는 연도별/매핑 테이블  | 비즈니스 규칙 기준으로 복합 unique 추가                                  |
| 정수 필드에 `number` 타입 사용       | `integer` 사용 (소수점 필요 시 `numeric`)                                |
| indexes에서 `role.id` 형식 사용      | indexes는 실제 DB 컨럼명(`role_id`), subsets만 FieldExpr(`role.id`) 사용 |

## Entity 스키마 검증 오류 해결

**→ `entity-validation-checklist.md` PHASE 1 참조** (인덱스 type 누락, Subset FieldExpr, 중복 컬럼, Boolean dbDefault 등)

**빠른 체크리스트:**

- [ ] 모든 인덱스에 `type` 필드 있는가? (`"index"` | `"unique"` | `"hnsw"` | `"ivfflat"`)
- [ ] Subset에서 FK를 `relation.id` 형식으로 참조하는가? (`user_id` ✗ → `user.id` ✓)
- [ ] BelongsToOne relation과 FK 컬럼을 중복 정의하지 않았는가?
- [ ] Boolean dbDefault가 `"true"` / `"false"` 문자열인가? (0, 1 ✗)
- [ ] Subset A에 모든 필드가 포함되어 있는가?
- [ ] indexes의 columns에 실제 DB 컬럼명(`role_id`)을 사용했는가? (FieldExpr `role.id` ✗)

## IMPORTANT: OrderBy Enum Generation Rule

**IMPORTANT: Scaffolding 시에는 `id-desc`만 사용하는 것을 강력히 권장합니다.**

```json
// RECOMMENDED - 초기 Scaffolding용
"ProductOrderBy": { "id-desc": "ID최신순" }

// AVOID - Scaffolding 전에는 피하세요
"ProductOrderBy": { "id-desc": "ID최신순", "name-asc": "이름순", "created_at-desc": "등록일순" }
```

### 왜 id-desc만 권장하나?

Scaffolding이 생성하는 model 코드는 `id-desc`만 자동 처리합니다. OrderBy enum에 다른 값이 있으면:

1. Scaffolding은 정상 동작하지만, model의 `exhaustive()` 함수에서 타입 오류 발생
2. 개발자가 수동으로 model에 케이스 추가 필요
3. 이 작업이 누락되면 런타임 에러 발생 가능

**이것은 기술적 제약이 아닌 Scaffolding의 best practice입니다.** 복잡한 OrderBy는 Scaffolding 완료 후 추가하는 것이 안전합니다.

### 추가 정렬 옵션이 필요할 때

나중에 정렬 옵션이 필요하면:

1. entity.json의 OrderBy enum에 값 추가
2. model의 orderBy 분기문에 해당 케이스 추가

```typescript
// model.ts - orderBy 케이스 추가 예시
if (params.orderBy === "id-desc") {
  qb.orderBy("products.id", "desc");
} else if (params.orderBy === "name-asc") {
  // 추가
  qb.orderBy("products.name", "asc");
} else {
  exhaustive(params.orderBy);
}
```

**규칙**: 처음에는 `id-desc`만 생성 → scaffolding 완료 후 필요시 추가

## IMPORTANT: integer vs number 타입 선택 기준

**CRITICAL: 숫자 필드 생성 시 반드시 아래 기준을 따른다. 잘못된 타입 선택은 불필요한 ALTER migration을 유발한다.**

PostgreSQL 기준:

- `integer` → DB `integer` (정수)
- `number` → DB `numeric(p,s)` (소수점 포함 정밀 숫자)

| 용도                           | Entity 타입                       | 예시                             |
| ------------------------------ | --------------------------------- | -------------------------------- |
| PK, FK, 카운트, 순서, 수량     | `integer`                         | id, user_id, order_num, quantity |
| 금액, 비율, 소수점이 필요한 값 | `number` (+ `precision`, `scale`) | price, rate, weight, score       |

**DO NOT:**

```json
{ "name": "order_num", "type": "number", "desc": "정렬순서" }
{ "name": "quantity", "type": "number", "desc": "수량" }
```

**DO:**

```json
{ "name": "order_num", "type": "integer", "desc": "정렬순서" }
{ "name": "quantity", "type": "integer", "desc": "수량" }
{ "name": "price", "type": "number", "precision": 12, "scale": 2, "desc": "금액" }
{ "name": "rate", "type": "number", "precision": 5, "scale": 2, "desc": "비율" }
```

**판단 기준: "이 값에 소수점이 필요한가?"**

- No → `integer`
- Yes → `number` (반드시 `precision`, `scale` 명시)

## 타입별 필수 옵션

| 타입      | 필수         | 선택                               |
| --------- | ------------ | ---------------------------------- |
| `string`  | -            | `length` (없으면 text)             |
| `integer` | -            | `numberType` (bigint, smallint)    |
| `number`  | -            | `precision`, `scale`, `numberType` |
| `enum`    | `id`         | `nullable`, `dbDefault`            |
| `json`    | `id`         | `dbDefault: "{}"`                  |
| `date`    | -            | `dbDefault`                        |
| `boolean` | -            | `dbDefault: "false"`               |
| `virtual` | `id`         | -                                  |
| `vector`  | `dimensions` | -                                  |

## IMPORTANT: ENUM Type dbDefault Setting

ENUM 필드에 기본값을 설정할 때는 **이스케이프된 큰따옴표**로 값을 감싸야 합니다.

### DO NOT - Incorrect Examples

```json
// Incorrect: 따옴표 없음 - SQL에서 컬럼 참조로 해석되어 오류 발생
{ "name": "status", "type": "enum", "id": "ApprovalStatus", "dbDefault": "pending" }
// 오류: cannot use column reference in DEFAULT expression

// Incorrect: 작은따옴표 사용 - Biome format error 발생
{ "name": "status", "type": "enum", "id": "ApprovalStatus", "dbDefault": "'pending'" }
```

### DO - Correct Example

```json
// Correct: 이스케이프된 큰따옴표 사용
{
  "name": "status",
  "type": "enum",
  "id": "ApprovalStatus",
  "dbDefault": "\"pending\"",
  "desc": "결재상태"
}
```

### Generated SQL

```sql
-- Correct output
"status" text not null default 'pending'
```
