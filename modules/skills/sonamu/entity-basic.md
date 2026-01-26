---
name: sonamu-entity-basic
description: Sonamu Entity 생성/수정 시 참조. 필수 항목, 타입별 설정, 흔한 실수 방지. Use when creating or modifying entities.
---

# Entity 기본 구조

## CRITICAL: Ask One Question at a Time

**MUST ask questions one at a time. NEVER overwhelm users with multiple questions.**

### MUST DO
1. **질문은 한 번에 하나씩만**: 사용자가 overwhelmed 되지 않도록
2. **Entity 생성 요청 → 즉시 질문**: 코드나 JSON을 작성하기 **전에** 확인
3. **추측 금지**: 사용자가 명시하지 않은 것은 추측하지 말고 질문

### NEVER DO
- 여러 질문을 한꺼번에 나열
- 질문 없이 바로 Entity JSON 작성
- "아마 이렇겠지"하고 추측해서 설계
- 사용자가 언급한 Entity만 만들고 관련 Entity 누락

### 질문 순서 (한 번에 하나씩!)
```
1. 누락된 Entity 확인 → 응답 대기
2. Entity 간 관계 확인 → 응답 대기
3. 특수 필드 확인 → 응답 대기
4. 다음 Entity로 이동...
```

### 예외: 질문 생략 가능한 경우
- 사용자가 **현재 대화에서** 이미 모든 세부사항을 명시한 경우
- 사용자가 "질문하지 말고 바로 만들어"라고 명시적으로 요청한 경우

---

## Entity 생성 워크플로우

### 1단계: stub 생성
```bash
pnpm sonamu stub entity {EntityId}
```
예: `pnpm sonamu stub entity Course`

생성되는 파일: `api/src/application/{entity}/{entity}.entity.json`

### 2단계: stub 파일 수정
생성된 entity.json 파일에 props, relations, subsets 추가

### 3단계: 검증 및 필수 파일 생성
**⚠️ CRITICAL: sync 실행 전에 반드시 검증하세요!**

1. entity.json 검증 (indexes, subsets, enums 등)
2. model.ts 생성
3. types.ts 생성

**상세 가이드:** `entity-validation-checklist.md` 참조

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

## 새 Entity 생성 시 체크리스트

1. **id**: PascalCase (예: `User`, `BlogPost`)
2. **table**: snake_case 복수형 (예: `users`, `blog_posts`) - 생략 가능
3. **title**: 한글 표시명
4. **props 권장**: `id`, `created_at` (스키마에서 강제되지 않으나 Best Practice)
5. **enums 권장**: `{EntityId}OrderBy`, `{EntityId}SearchField` (스키마에서 강제되지 않으나 Best Practice)

## IMPORTANT: Analyze Requirements Before Creating Entity

**STOP! Entity를 만들기 전에 질문을 하나씩 하세요.**

사용자가 시스템을 요청할 때, 명시적으로 언급한 Entity만 생성하지 말 것.

### 누락된 Entity 확인 (필수 질문)

**한 번에 하나씩 질문할 것:**
- "사용자(User) Entity가 필요한가요?" → 응답 대기
- (필요하다면) "User의 역할이 여러 개인가요? (예: 관리자, 일반회원)" → 응답 대기
- "추가로 필요한 Entity가 있나요?" → 응답 대기

### User Entity 생성 시 확인필수

Entity의 `id` prop은 자동 증가 시퀀스(auto-increment PK)입니다. 로그인 아이디가 아닙니다.

**예시 (한 번에 하나씩):**
```
사용자: "회원 기능이 있는 시스템을 만들려고 해요."

Claude: "로그인 아이디가 필요한가요? (id는 자동증가 시퀀스라 로그인용으로 쓰기 어렵습니다)"

사용자: "네"

Claude: "로그인 아이디는 문자열(username)인가요, 이메일인가요?"

사용자: "이메일로 할게요"

Claude: "알겠습니다. 다음 질문으로 넘어갈게요..."
```

**User Entity 예시 (로그인 아이디 포함):**
```json
{
  "props": [
    { "name": "id", "type": "integer", "desc": "ID" },
    { "name": "login_id", "type": "string", "length": 50, "desc": "로그인 아이디" },
    { "name": "email", "type": "string", "length": 255, "desc": "이메일" },
    { "name": "created_at", "type": "date", "dbDefault": "CURRENT_TIMESTAMP", "desc": "가입일시" }
  ],
  "indexes": [
    { "name": "users_login_id_unique", "type": "unique", "columns": [{ "name": "login_id" }] }
  ]
}
```

### 여러 Entity 요청 시 - 관계 확인 필수 (필수 질문)

사용자가 2개 이상의 Entity를 요청하면, **코드 작성 전에 Entity 간 관계를 하나씩 질문**할 것.

**확인할 관계 유형:**
- BelongsToOne: A가 B에 속함 (FK 생성)
- HasMany: A가 여러 B를 가짐 (B에 FK)
- ManyToMany: 다대다 관계 (중간 테이블 필요)
- parentId: 부모-자식 종속 관계

**예시 (한 번에 하나씩):**
```
사용자: "온라인 강의 플랫폼을 만들 거야. 강좌, 챕터, 레슨이 필요해."

Claude: "사용자(User) Entity가 필요한가요? (수강생, 강사 등)"

사용자: "네, 강사랑 수강생 둘 다요"

Claude: "챕터는 강좌의 자식으로 함께 관리할까요? (parentId 사용 - 강좌 삭제 시 챕터도 삭제)"

사용자: "네"

Claude: "레슨도 챕터의 자식으로 함께 관리할까요?"
```

**일반적으로 빠지기 쉬운 Entity:**
| 도메인 | 자주 누락되는 Entity |
|--------|------------------------|
| 컨텐츠 시스템 | User, Comment, Like, Tag, Category |
| 커머스 | User, Review, Cart, Payment |
| 예약 시스템 | User, Reservation, Schedule |
| 교육 플랫폼 | User(Student/Instructor), Enrollment, Review, Progress |

## 부모-자식 관계 (parentId)

### parentId란?
자식 Entity가 부모 Entity에 종속되어 함께 관리될 때 사용하는 최상위 옵션.
- parentId 설정 시: 자식은 독립 CRUD 없이 부모를 통해 생성/수정/삭제
- parentId 미설정 시: 독립 Entity로 별도 CRUD 가능

### 언제 parentId를 사용하나?

| 상황 | parentId | 예시 |
|------|----------|------|
| 부모 없이 존재 불가 | O | 주문아이템 → 주문 |
| 부모와 함께 생성/삭제 | O | 챕터 → 강좌, 레슨 → 챕터 |
| 독립적으로 CRUD 가능 | X | 댓글 → 게시글 |
| 여러 부모에 속할 수 있음 | X | 태그 → 게시글 (ManyToMany) |

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

| 구조 | 설명 |
|------|------|
| `course/course.entity.json` | 루트 엔티티 |
| `course/chapter.entity.json` | parentId: "Course" → 같은 폴더 |
| `course/lesson.entity.json` | parentId: "Chapter" → 같은 폴더 (루트 기준) |
| `course/course.types.ts` | types.ts는 루트만 생성됨 |

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
    { "name": "created_at", "type": "date", "dbDefault": "CURRENT_TIMESTAMP", "desc": "등록일시" },
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

### nullable 필드 추가할 때
```json
{ "name": "deleted_at", "type": "date", "nullable": true, "desc": "삭제일시" }
```

### JSON 필드 추가할 때
```json
{ "name": "metadata", "type": "json", "id": "ProductMetadata", "desc": "메타데이터" }
```
- `id` 필수 (타입명으로 사용)
- 별도로 TypeScript 타입 정의 필요

### 유니크 제약 추가할 때
```json
{ "name": "products_sku_unique", "type": "unique", "columns": [{ "name": "sku" }] }
```

### 복합 유니크 제약
```json
{ "name": "cart_items_unique", "type": "unique", "columns": [{ "name": "user_id" }, { "name": "product_id" }] }
```

## 흔한 실수

| 실수 | 해결 |
|------|------|
| `id` prop 누락 | 추가 권장 (대부분의 Model 로직에서 필요) |
| `created_at` prop 누락 | 추가 권장, `dbDefault: "CURRENT_TIMESTAMP"` |
| `OrderBy` enum 누락 | `{EntityId}OrderBy` 추가 권장 (findMany 정렬에 필요) |
| `SearchField` enum 누락 | `{EntityId}SearchField` 추가 권장 (검색 기능에 필요) |
| enum prop의 `id`가 enums에 없음 | enums 섹션에 정의 추가 |
| json prop에 `id` 누락 | `id` 필드 추가 |
| `"type": "text"` 직접 사용 | `text`는 유효하지 않음. `"type": "string"` + length 생략으로 사용 |
| `OrderBy` enum에 여러 값 추가 | **기본은 `id-desc`만 생성** (아래 참조) |

## Entity 스키마 검증 오류 해결

### 1. 인덱스 타입 누락

**오류:**
```
Invalid option: expected one of "index"|"unique"|"hnsw"|"ivfflat"
  → at indexes[N].type
```

**원인**: indexes 배열의 각 인덱스 정의에 type 필드가 누락되었습니다.

**DO NOT:**
```json
"indexes": [
  { "name": "ix_user_email", "columns": [{ "name": "email" }] }
]
```

**DO:**
```json
"indexes": [
  { "name": "ix_user_email", "type": "index", "columns": [{ "name": "email" }] }
]
```

**타입 종류:**
- 일반 인덱스: `"type": "index"`
- 유니크 인덱스: `"type": "unique"`
- 벡터 인덱스: `"type": "hnsw"` 또는 `"type": "ivfflat"`

### 2. Subset에서 잘못된 FieldExpr 참조

**오류:**
```
Error: EntityName -- 잘못된 FieldExpr 'field_id'
```

**원인**: subsets에서 relation의 foreign key를 직접 참조했습니다. Relation을 통해 접근해야 합니다.

**DO NOT:**
```json
{
  "props": [
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ],
  "subsets": {
    "A": ["id", "user_id", "user.name"]
  }
}
```

**DO:**
```json
{
  "props": [
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ],
  "subsets": {
    "A": ["id", "user.id", "user.name"]
  }
}
```

**규칙**: 모든 relation foreign key는 `relation_name.id` 형식으로 참조
- `user_id` → `user.id`
- `task_id` → `task.id`
- `department_id` → `department.id`

### 3. 중복 컬럼 정의

**오류:**
```
migration failed: column "field_id" specified more than once
```

**원인**: BelongsToOne relation을 정의하면 자동으로 foreign key 컬럼이 생성되는데, props에서 수동으로도 정의하여 중복이 발생했습니다.

**DO NOT:**
```json
{
  "props": [
    { "name": "user_id", "type": "integer", "desc": "사용자ID" },
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ]
}
```

**DO:**
```json
{
  "props": [
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ]
}
```

**규칙**: BelongsToOne relation을 정의할 때는 foreign key 컬럼을 별도로 정의하지 않습니다. Relation이 자동으로 `{relation_name}_id` 컬럼을 생성합니다.

### 4. Boolean 타입 기본값 오류

**오류:**
```
migration failed: column "field_name" is of type boolean but default expression is of type integer
```

**원인**: Boolean 타입 컬럼의 dbDefault에 정수 값(0, 1)을 사용했습니다. PostgreSQL은 boolean 타입에 정수를 허용하지 않습니다.

**DO NOT:**
```json
{ "name": "is_active", "type": "boolean", "dbDefault": "1" }
{ "name": "is_deleted", "type": "boolean", "dbDefault": "0" }
```

**DO:**
```json
{ "name": "is_active", "type": "boolean", "dbDefault": "true" }
{ "name": "is_deleted", "type": "boolean", "dbDefault": "false" }
```

**규칙**: Boolean 타입에는 항상 `"dbDefault": "true"` 또는 `"dbDefault": "false"` 사용. 숫자 0, 1은 사용하지 않습니다.

### Entity 스키마 검증 체크리스트

Entity.json 파일 작성 시 다음 사항을 확인하세요:

- [ ] 모든 인덱스에 type 필드가 있는가?
- [ ] Subsets에서 foreign key를 직접 참조하지 않고 relation을 통해 참조하는가?
- [ ] BelongsToOne relation과 foreign key 컬럼을 중복 정의하지 않았는가?
- [ ] Boolean 타입의 dbDefault가 "true" 또는 "false" 문자열인가?
- [ ] Subset A에 모든 필드가 포함되어 있는가?

## IMPORTANT: OrderBy Enum Generation Rule

**⚠️ CRITICAL: `id-desc` 외에는 절대 추가하지 마세요.**

```json
// DO - Correct (기본 설정)
"ProductOrderBy": { "id-desc": "ID최신순" }

// DO NOT - Incorrect (scaffolding 오류 발생!)
"ProductOrderBy": { "id-desc": "ID최신순", "name-asc": "이름순", "created_at-desc": "등록일순" }
```

### 왜 id-desc만?

Scaffolding이 생성하는 model 코드는 `id-desc`만 처리합니다. OrderBy enum에 다른 값이 있으면:
1. **Scaffolding 시 오류 발생** (model 생성 실패)
2. model의 `exhaustive()` 함수에서 타입 오류 발생
3. 개발자가 수동으로 model에 케이스 추가 필요

**⚠️ Entity 생성 시 반드시 `id-desc`만 포함하고, 다른 정렬 옵션은 추가하지 마세요.**

### 추가 정렬 옵션이 필요할 때

나중에 정렬 옵션이 필요하면:
1. entity.json의 OrderBy enum에 값 추가
2. model의 orderBy 분기문에 해당 케이스 추가

```typescript
// model.ts - orderBy 케이스 추가 예시
if (params.orderBy === "id-desc") {
  qb.orderBy("products.id", "desc");
} else if (params.orderBy === "name-asc") {  // 추가
  qb.orderBy("products.name", "asc");
} else {
  exhaustive(params.orderBy);
}
```

**규칙**: 처음에는 `id-desc`만 생성 → scaffolding 완료 후 필요시 추가

## 타입별 필수 옵션

| 타입 | 필수 | 선택 |
|------|------|------|
| `string` | - | `length` (없으면 text) |
| `integer` | - | `numberType` (bigint, smallint) |
| `number` | - | `precision`, `scale`, `numberType` |
| `enum` | `id` | `nullable`, `dbDefault` |
| `json` | `id` | `dbDefault: "{}"` |
| `date` | - | `dbDefault` |
| `boolean` | - | `dbDefault: "false"` |
| `virtual` | `id` | - |
| `vector` | `dimensions` | - |

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
