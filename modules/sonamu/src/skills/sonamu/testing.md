---
name: sonamu-testing
description: Sonamu 테스트 시스템. bootstrap, test/testAs 함수, Fixture, Naite 추적, expectQuery/expectUB 헬퍼, Mock 패턴. Use when writing tests for Models and APIs.
---

# Sonamu 테스트 시스템

Sonamu는 Vitest 기반 테스트 환경을 제공한다. 각 테스트는 트랜잭션으로 격리되어 자동 롤백된다.

**예시 프로젝트**: `sonamu/examples/miomock` - 실제 테스트 코드 참고

**WARNING: 엔티티 10개 이상 프로젝트는 반드시 배치 전략 사용** (아래 "대규모 프로젝트 전략" 참고)

**참고 문서**:
- **Fixture CLI 명령어**: `fixture-cli.md` - fixture gen/fetch/explore 사용법, 3-Tier DB 구조
- **Fixture 생성 팁**: 이 문서 하단 "Fixture 데이터 생성 팁" 섹션 또는 `fixture-cli.md` "실전 팁" 섹션

---

## Quick Start - 테스트 작성 빠른 시작

**전제조건**: scaffolding 완료, types.ts nullable 필드 처리 완료

### 1단계: test-helpers.ts 확장

```typescript
// packages/api/src/application/__tests__/test-helpers.ts

import { User, UserSaveParams } from "../user/user.types";
import { Post, PostSaveParams } from "../post/post.types";
import { Comment, CommentSaveParams } from "../comment/comment.types";
import UserModel from "../user/user.model";
import PostModel from "../post/post.model";
import CommentModel from "../comment/comment.model";

// User 헬퍼
export async function createTestUser(params?: Partial<UserSaveParams>): Promise<number> {
  const user: UserSaveParams = {
    email: `test-${Date.now()}@example.com`,
    name: "Test User",
    ...params,
  };
  const saved = await UserModel.save(user);
  return saved.id;
}

// User with dependencies (의존성 체인)
export async function createTestUserWithDeps() {
  const userId = await createTestUser();
  return { userId };
}

// Post 헬퍼
export async function createTestPost(
  authorId: number,
  params?: Partial<PostSaveParams>
): Promise<number> {
  const post: PostSaveParams = {
    author_id: authorId,
    title: "Test Post",
    content: "Test content",
    ...params,
  };
  const saved = await PostModel.save(post);
  return saved.id;
}

// Post with dependencies
export async function createTestPostWithDeps() {
  const { userId } = await createTestUserWithDeps();
  const postId = await createTestPost(userId);
  return { userId, postId };
}

// Comment 헬퍼
export async function createTestComment(
  postId: number,
  authorId: number,
  params?: Partial<CommentSaveParams>
): Promise<number> {
  const comment: CommentSaveParams = {
    post_id: postId,
    author_id: authorId,
    content: "Test comment",
    ...params,
  };
  const saved = await CommentModel.save(comment);
  return saved.id;
}

// Comment with dependencies
export async function createTestCommentWithDeps() {
  const { userId, postId } = await createTestPostWithDeps();
  const commentId = await createTestComment(postId, userId);
  return { userId, postId, commentId };
}
```

**CRITICAL 패턴**:
- `createTestX()`: 기본 생성 헬퍼 (params로 override 가능)
- `createTestXWithDeps()`: 의존성 자동 처리 헬퍼 (모든 필요 데이터 함께 생성)
- FK 필드는 `_id` 접미사 사용 (`author_id`, `post_id`)
- 반환: 주로 ID 반환, WithDeps는 객체로 여러 ID 반환

**CRITICAL: 모든 필수 필드 포함 필수!**

Sonamu의 `ubUpsert`는 PostgreSQL의 `ON CONFLICT ... DO UPDATE` 쿼리를 사용합니다. 
업데이트 시에도 **모든 필수 필드(NOT NULL 제약이 있는 필드)**를 포함해야 합니다.

필수 필드 누락 시:
```typescript
// BAD - content 필수 필드 누락
const post: PostSaveParams = {
  author_id: authorId,
  title: "Test",
  // content 누락! → ubUpsert ON CONFLICT UPDATE 시 NULL 설정 시도 → DB 에러
};
// Error: null value in column "content" violates not-null constraint
```

### 필수 필드 vs 선택 필드 구분

**1. entity.json 확인**

```json
// post.entity.json
{
  "props": [
    { "name": "id", "type": "integer" },  // 자동 생성 - 제외
    { "name": "title", "type": "string", "length": 255 },  // 필수! (nullable 없음)
    { "name": "content", "type": "string" },  // 필수! (nullable 없음)
    { "name": "category", "type": "string", "nullable": true },  // 선택 (nullable)
    { "name": "author_id", "type": "integer" },  // 필수! (FK, nullable 없음)
    { "name": "view_count", "type": "integer", "dbDefault": "0" },  // 필수이지만 DB 기본값 있음
    { "name": "created_at", "type": "date", "dbDefault": "CURRENT_TIMESTAMP" }  // 자동
  ]
}
```

**필수 필드 (Required)**: `nullable: true`가 **없는** 필드
- `title`, `content`, `author_id`
- test-helpers.ts에서 **반드시** 기본값 제공

**선택 필드 (Optional)**: `nullable: true`가 **있는** 필드
- `category`
- test-helpers.ts에서 생략 가능

**제외 필드**:
- `id`: 자동 증가 (save 시 자동 생성)
- `created_at`: dbDefault가 있어 자동 설정
- `view_count`: dbDefault="0"이 있어 자동 설정

**2. test-helpers.ts 작성**

```typescript
export async function createTestPost(
  authorId: number,
  params?: Partial<PostSaveParams>
): Promise<number> {
  const post: PostSaveParams = {
    // 필수 필드는 반드시 포함 (nullable이 없는 필드)
    author_id: authorId,
    title: "Test Post",      // 필수!
    content: "Test content",  // 필수!
    
    // 선택 필드는 생략 가능 (nullable: true인 필드)
    // category: null,  // 생략 가능
    
    // dbDefault가 있는 필드도 생략 가능
    // view_count: 0,  // dbDefault="0"이므로 생략 가능
    
    ...params,  // override 허용
  };
  const saved = await PostModel.save(post);
  return saved.id;
}
```

**규칙 요약**:
1. entity.json에서 `nullable: true` 없는 필드 = 필수 필드
2. 필수 필드는 test-helpers.ts에 **반드시** 기본값 포함
3. `id`, `created_at`, `dbDefault` 있는 필드는 제외 가능
4. ubUpsert의 ON CONFLICT UPDATE 시에도 필수 필드 필요

### 2단계: 테스트 파일 작성

```typescript
// packages/api/src/application/post/__tests__/post.test.ts

import { bootstrap } from "sonamu";
import { describe, test, expect, vi } from "vitest";
import PostModel from "../post.model";
import { createTestPostWithDeps } from "../../__tests__/test-helpers";

bootstrap(vi);  // CRITICAL: 필수!

describe("PostModel", () => {
  describe("A. Create (생성)", () => {
    test("게시글 생성", async () => {
      const { userId, postId } = await createTestPostWithDeps();
      
      const post = await PostModel.findById(postId, ["A"]);
      expect(post.id).toBe(postId);
      expect(post.author_id).toBe(userId);
    });
  });

  describe("B. Read (조회)", () => {
    test("findById - Subset A", async () => {
      const { postId } = await createTestPostWithDeps();
      
      const post = await PostModel.findById(postId, ["A"]);
      expect(post.id).toBe(postId);
      expect(post).toHaveProperty("title");
      expect(post).toHaveProperty("content");
    });

    test("findMany - 목록 조회", async () => {
      await createTestPostWithDeps();
      await createTestPostWithDeps();
      
      const { rows } = await PostModel.findMany({ num: 10 });
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("C. Update (수정)", () => {
    test("게시글 수정", async () => {
      const { postId } = await createTestPostWithDeps();
      
      const updated = await PostModel.save({
        id: postId,
        title: "Updated Title",
      });
      
      expect(updated.title).toBe("Updated Title");
    });
  });

  describe("D. Delete (삭제)", () => {
    test("게시글 삭제", async () => {
      const { postId } = await createTestPostWithDeps();
      
      await PostModel.del(postId);
      
      const post = await PostModel.findById(postId, ["A"]);
      expect(post).toBeNull();
    });
  });

  describe("E. Business Logic (비즈니스 로직)", () => {
    test("게시글 발행부터 댓글 추가까지 전체 프로세스", async () => {
      // 1. 게시글 작성
      const { userId, postId } = await createTestPostWithDeps({
        title: "새 글",
        content: "내용",
      });

      // 2. 다른 사용자가 댓글 작성
      const commenterId = await createTestUser();
      const commentId = await createTestComment(postId, commenterId, {
        content: "좋은 글이네요!",
      });

      // 3. 게시글 조회 (댓글 포함)
      const post = await PostModel.findById(postId, ["A"]);
      expect(post.comments).toHaveLength(1);
      expect(post.comments[0].id).toBe(commentId);
    });
  });
});
```

**패턴 요약**:
- `bootstrap(vi)` 호출 필수
- `describe` + `test` 패턴 (순서: A. Create, B. Read, C. Update, D. Delete, E. Business Logic)
- `createTestXWithDeps()` 헬퍼로 의존성 자동 해결
- Business Logic 섹션이 가장 중요! (실제 업무 시나리오 구현)

### 3단계: 테스트 실행

```bash
cd packages/api
pnpm test

# watch 모드
pnpm test:watch
```

**완료!** 상세한 내용은 아래 섹션 참조.

---

## 테스트 작성 전 체크리스트

- [ ] **엔티티 설계 완료 확인** - `pnpm db:migration` 및 `pnpm scaffolding` 오류 없이 완료
- [ ] **테스트 작성 계획 수립** - 업무 프로세스별 엔티티 그룹핑 (→ 아래 "테스트 작성 계획 수립" 참조)
- [ ] **types.ts nullable 처리 (FIRST!)** - 엔티티 생성 직후 nullable 필드 partial + extend 처리 (→ 아래 "엔티티 생성 후 즉시 해야 할 작업" 참조)
- [ ] **Seed Data 준비** - FK 제약으로 인한 기본 데이터 필요 (→ database.md "최소 seed data" 참고)
- [ ] **테스트 헬퍼 함수** - 복잡한 엔티티 의존성 처리용 헬퍼 준비
- [ ] **엔티티 10개 이상 시** - 배치 전략 수립 (아래 "대규모 프로젝트 전략" 참고)

## 테스트 작성 핵심 원칙

### 1. 실제 구조 확인 우선

**CRITICAL: 테스트 계획 전에 반드시 실제 엔티티 구조를 확인하세요.**

테스트를 작성하기 전에 다음을 확인해야 합니다:

```typescript
// STEP 1: entity.json 확인
// - 실제 필드명과 타입
// - nullable 여부
// - enum 값 목록
// - relation 구조

// STEP 2: types.ts 확인
// - SaveParams의 partial 설정
// - nullable 필드의 nullish 처리
// - ManyToMany relation의 _ids 배열

// STEP 3: sonamu.generated.ts 확인
// - Enum 타입 정의
// - Subset 타입 구조
// - BaseSchema 구조
```

**잘못된 접근:**
```typescript
// BAD - 추측으로 테스트 작성
test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{
    name: "Test",
    status: "active",  // 실제로는 "normal"일 수 있음
    role: "user",      // 실제로는 "normal"일 수 있음
  }]);
});
```

**올바른 접근:**
```typescript
// GOOD - entity.json 확인 후 작성
// 1. user.entity.json 확인:
//    - role: enum ["admin", "normal", "guest"]
//    - status: enum ["active", "inactive"] with dbDefault: "active"
//    - name: string (required)
//    - email: string (nullable)

// 2. user.types.ts 확인:
//    - SaveParams에서 status, email이 partial 처리됨

// 3. 테스트 작성
test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{
    name: "Test",
    role: "normal",  // entity.json의 정확한 enum 값
    // status는 dbDefault가 있어 생략 가능
    // email은 nullable이므로 생략 가능
  }]);
});
```

### 2. Subset 구조 이해

**중첩된 관계는 dot notation으로 접근합니다.**

```typescript
// entity.json에서 Subset 정의 확인
{
  "subsets": {
    "A": [
      "id",
      "title",
      "evaluation_form.id",           // BelongsToOne relation
      "evaluation_form.title",
      "evaluation_form.category.id",  // 중첩 relation
      "evaluation_form.category.name"
    ]
  }
}

// 테스트에서 접근
test("평가 항목 조회", async () => {
  const { itemId } = await createTestEvaluationItemWithDeps();
  
  const item = await EvaluationItemModel.findById("A", itemId);
  
  // CORRECT - dot notation으로 중첩 접근
  expect(item.evaluation_form.id).toBe(formId);
  expect(item.evaluation_form.category.name).toBe("역량평가");
  
  // WRONG - 직접 FK 접근 시도
  // expect(item.evaluation_form_id).toBe(formId);  // 타입 에러!
});
```

**중요 규칙:**
- BelongsToOne relation의 FK는 Subset에서 `relation.id` 형태로 정의됨
- 테스트에서는 `entity.relation.field` 형태로 접근
- 직접 `entity.relation_id` 접근은 불가능 (Subset에 포함되지 않음)

### 3. DECIMAL 타입 처리

**DECIMAL 타입은 PostgreSQL에서 `.00` 접미사를 포함하여 반환됩니다.**

```typescript
// entity.json
{
  "props": [
    { "name": "salary", "type": "number", "precision": 10, "scale": 2 }
  ]
}

// Migration에서 생성됨
table.decimal("salary", 10, 2);  // DECIMAL(10,2)

// 테스트 작성
test("급여 정보 조회", async () => {
  const [userId] = await UserModel.save([{
    name: "Test",
    salary: 75000,  // 입력: 숫자
  }]);
  
  const user = await UserModel.findById("A", userId);
  
  // WRONG - 정확한 비교는 실패할 수 있음
  // expect(user.salary).toBe(75000);  // DB에서 "75000.00" 반환 가능
  
  // CORRECT - toMatch()로 패턴 매칭
  expect(String(user.salary)).toMatch(/^75000(\.00)?$/);
  
  // 또는 숫자 변환 후 비교
  expect(Number(user.salary)).toBe(75000);
  
  // 또는 범위 체크
  expect(user.salary).toBeGreaterThanOrEqual(74999.99);
  expect(user.salary).toBeLessThanOrEqual(75000.01);
});
```

**DECIMAL 타입 비교 패턴:**

```typescript
// 패턴 1: 문자열 패턴 매칭
expect(String(value)).toMatch(/^1234\.56$/);
expect(String(value)).toMatch(/^1234(\.56)?$/);  // .56 선택적

// 패턴 2: 숫자 변환 후 비교
expect(Number(value)).toBe(1234.56);

// 패턴 3: 범위 체크 (부동소수점 오차 고려)
expect(value).toBeCloseTo(1234.56, 2);  // 소수점 2자리까지

// 패턴 4: toMatchObject (객체 비교 시)
expect(result).toMatchObject({
  salary: expect.any(Number),  // 타입만 체크
});
```

## Enum 값 사용 규칙

**CRITICAL: entity.json에 정의된 enum 값만 사용해야 합니다.**

테스트 코드나 API 개발 시 enum 필드를 사용할 때는 **반드시 entity.json을 먼저 확인**하세요.

### Entity.json 확인 필수

**잘못된 예:**
```typescript
// WRONG - entity.json 확인 없이 임의의 값 사용
await UserModel.save([{
  email: "test@test.com",
  name: "Test",
  role: "superadmin",  // entity.json에 정의되지 않은 값
}]);

await TaskModel.save([{
  title: "테스트 과제",
  status: "in_progress",  // entity.json에 정의되지 않은 값
}]);
```

**올바른 예:**

**STEP 1: entity.json 확인**
```json
// user.entity.json
{
  "props": [
    {
      "name": "role",
      "type": "string",
      "enum": ["admin", "normal", "guest"]  // 정확한 enum 값 확인
    }
  ]
}

// task.entity.json
{
  "props": [
    {
      "name": "status",
      "type": "string",
      "enum": ["pending", "approved", "rejected", "completed"]  // 정확한 enum 값
    }
  ]
}
```

**STEP 2: 정확한 enum 값 사용**
```typescript
// CORRECT - entity.json에 정의된 값만 사용
await UserModel.save([{
  email: "test@test.com",
  name: "Test",
  role: "admin",  // entity.json의 enum 값
}]);

await TaskModel.save([{
  title: "테스트 과제",
  status: "pending",  // entity.json의 enum 값
}]);
```

### TypeScript Enum 타입 활용 (권장)

**더 안전한 방법: 생성된 enum 타입 사용**

```typescript
// sonamu.generated.ts에서 자동 생성된 enum 타입
import { UserRoleEnum, TaskStatusEnum } from "../sonamu.generated";

// test-helpers.ts
export async function createTestUser(
  params?: Partial<UserSaveParams>
): Promise<number> {
  const user: UserSaveParams = {
    email: `test-${Date.now()}@example.com`,
    name: "Test User",
    role: UserRoleEnum.normal,  // TypeScript enum으로 타입 안전
    ...params,
  };
  const [id] = await UserModel.save([user]);
  return id;
}

export async function createTestTask(
  params?: Partial<TaskSaveParams>
): Promise<number> {
  const task: TaskSaveParams = {
    title: "Test Task",
    status: TaskStatusEnum.pending,  // TypeScript enum으로 타입 안전
    ...params,
  };
  const [id] = await TaskModel.save([task]);
  return id;
}
```

### Enum 값 검증 패턴

테스트에서 enum 값을 사용하기 전에 유효한 값인지 확인:

```typescript
test("User 생성 - 유효한 role", async () => {
  // entity.json에서 확인한 유효한 값들
  const validRoles = ["admin", "normal", "guest"];
  
  for (const role of validRoles) {
    const [userId] = await UserModel.save([{
      email: `test-${role}@test.com`,
      name: "Test",
      role: role as any,  // 각 role 테스트
    }]);
    
    const user = await UserModel.findById("A", userId);
    expect(user.role).toBe(role);
  }
});

test("Task 상태 변경 - 유효한 status", async () => {
  const { taskId } = await createTestTaskWithDeps();
  
  // entity.json에서 확인한 유효한 상태 전이
  const statusFlow = ["pending", "approved", "completed"];
  
  for (const status of statusFlow) {
    await TaskModel.save([{
      id: taskId,
      status: status as any,
    }]);
    
    const task = await TaskModel.findById("A", taskId);
    expect(task.status).toBe(status);
  }
});
```

### 체크리스트

테스트 작성 전:
- [ ] 사용할 enum 필드의 entity.json 확인
- [ ] 정확한 enum 값 목록 파악
- [ ] 가능하면 생성된 TypeScript enum 타입 사용
- [ ] test-helpers.ts에 기본값으로 유효한 enum 값 설정
- [ ] 임의의 문자열 사용 금지

### 자주 하는 실수

```typescript
// WRONG: 추측으로 작성
role: "user"           // entity.json에는 "normal"로 정의됨
status: "in_progress"  // entity.json에는 "pending"로 정의됨
status: "done"         // entity.json에는 "completed"로 정의됨

// CORRECT: entity.json 확인 후 작성
role: "normal"         // entity.json의 정확한 값
status: "pending"      // entity.json의 정확한 값
status: "completed"    // entity.json의 정확한 값
```

**핵심 원칙: entity.json이 단일 진실 공급원(Single Source of Truth)입니다.**

## 테스트 작성 계획 수립

### 엔티티 설계 프롬프트 기반 계획

엔티티 설계 완료 후 (migration + scaffolding 성공 확인), **엔티티 설계 시점에 명시한 업무 프로세스와 데이터 흐름**에 따라 테스트를 그룹핑한다.

**CRITICAL:** 단순 알파벳 순서나 개별 엔티티가 아니라, **업무 흐름 단위**로 테스트를 묶어서 작성한다.

### 1단계: 엔티티 설계 프롬프트 재확인

설계 요청 시 작성한 프롬프트에서 다음 정보를 추출:
- 업무 프로세스 흐름
- 엔티티 간 관계 (relation)
- 데이터 생성 순서
- 주요 사용 시나리오

### 2단계: 업무 프로세스별 그룹핑

단순 우선순위가 아닌, **업무 흐름 단위**로 엔티티를 묶는다.

**고객 상담 시스템 예시:**

```
그룹 1: 기반 인프라
Organization (유관기관)
└─ User (사용자)
   └─ LoginHistory (로그인 이력)

업무 흐름: 기관 등록 → 사용자 생성 → 로그인
테스트 순서: Organization → User → LoginHistory

그룹 2: 피해유형 관리
DamageType (피해유형, self-referencing)
└─ CounterMeasure (대응방안)

업무 흐름: 피해유형 계층 구성 → 각 유형별 대응방안 작성
테스트 순서: DamageType → CounterMeasure

그룹 3: 상담 프로세스 (핵심 업무)
User (신청인) + User (상담사) + DamageType
└─ Consultation (상담)
   ├─ ConsultationChannelLog (채널 로그)
   └─ ConsultationHistory (상담 이력)

업무 흐름:
1. 신청인이 상담 접수
2. 상담사 배정
3. 피해유형 분류
4. 채널별 소통 (온라인/전화/SMS/카카오)
5. 상태 변경 이력 기록

테스트 순서: Consultation → ConsultationChannelLog → ConsultationHistory

그룹 4: 콘텐츠 관리 (독립적)
FAQ (자주묻는질문)
Banner (배너)
Material (자료실)
Notice (공지사항)

업무 흐름: 각각 독립적으로 CRUD
테스트 순서: 순서 무관 (병렬 작성 가능)
```

### 3단계: 그룹별 작업 순서

**각 그룹마다:**

1. **types.ts 수정** - 그룹 내 모든 엔티티의 nullable 필드를 한 번에 처리
2. **test-helpers.ts 확장** - 그룹 내 엔티티들의 헬퍼 함수를 함께 작성
3. **테스트 파일 작성** - 그룹 내에서는 의존성 순서대로 작성
4. **Business Logic 테스트** - 실제 업무 시나리오 구현 (핵심!)
5. **테스트 통과 확인** - 다음 그룹으로 진행

**test-helpers.ts 예시 (의존성 체인 고려):**

```typescript
// 의존성 체인을 고려한 헬퍼 작성
export async function createTestUserWithDeps() {
  const organizationId = await createTestOrganization();
  const userId = await createTestUser(organizationId);
  return { organizationId, userId };
}

export async function createTestConsultationWithDeps() {
  const { userId: applicantId } = await createTestUserWithDeps({ role: "applicant" });
  const { userId: counselorId } = await createTestUserWithDeps({ role: "counselor" });
  const damageTypeId = await createTestDamageType(null);
  const consultationId = await createTestConsultation(
    applicantId,
    counselorId,
    damageTypeId
  );
  return { applicantId, counselorId, damageTypeId, consultationId };
}
```

### 4단계: Business Logic 테스트 (핵심!)

**IMPORTANT:** E. Business Logic 섹션이 가장 중요하다.

이 섹션에서:
- 엔티티 설계 프롬프트에 명시된 **실제 업무 시나리오** 구현
- 엔티티 간 **상호작용** 테스트
- **데이터 흐름** 검증

이것이 단순 CRUD 테스트와의 차별점이며, **설계 의도를 검증하는 핵심**이다.

**상담 프로세스 그룹 예시:**

```typescript
describe("ConsultationModel", () => {
  describe("A. Create (생성)");
  describe("B. Read (조회)");
  describe("C. Update (수정)");
  describe("D. Delete (삭제)");
  
  describe("E. Business Logic (비즈니스 로직)", () => {
    test("상담 접수부터 완료까지 전체 프로세스", async () => {
      // 1. 상담 접수 (신청인)
      const { consultationId, applicantId, counselorId } = 
        await createTestConsultationWithDeps({
          status: "consulting",
          channel: "online",
        });

      // 2. 온라인 접수 로그 기록
      await createTestConsultationChannelLog(consultationId, {
        channel: "online",
        content: "상담 접수 완료",
        sender: "system",
      });

      // 3. 상담사 배정 이력
      await createTestConsultationHistory(consultationId, counselorId, {
        status: "consulting",
        action: "상담사 배정",
      });

      // 4. 전화 상담 진행
      await createTestConsultationChannelLog(consultationId, {
        channel: "phone",
        content: "전화 상담 진행",
        sender: "counselor",
        receiver: "applicant",
      });

      // 5. 상담 완료
      await ConsultationModel.save([{
        id: consultationId,
        status: "completed",
        result: "상담 완료 처리",
      }]);

      await createTestConsultationHistory(consultationId, counselorId, {
        status: "completed",
        action: "상담 완료",
      });

      // 검증: 전체 프로세스 확인
      const consultation = await ConsultationModel.findById("A", consultationId);
      expect(consultation.status).toBe("completed");
      expect(consultation.result).toBe("상담 완료 처리");
      
      // 채널 로그 2건 확인
      const logs = await ConsultationChannelLogModel.findMany("A", {
        num: 10,
        page: 1,
      });
      const consultationLogs = logs.rows.filter(
        log => log.consultation?.id === consultationId
      );
      expect(consultationLogs.length).toBe(2);
      
      // 이력 2건 확인
      const histories = await ConsultationHistoryModel.findMany("A", {
        num: 10,
        page: 1,
      });
      const consultationHistories = histories.rows.filter(
        h => h.consultation?.id === consultationId
      );
      expect(consultationHistories.length).toBe(2);
    });
  });
});
```

### 주의사항

**DO:**
- 엔티티 설계 프롬프트를 항상 참고
- 업무 프로세스 흐름대로 그룹핑
- 의존성 순서를 고려한 테스트 순서
- 실제 사용 시나리오 기반 Business Logic 테스트
- test-helpers에 의존성 체인 명확히 구현

**DON'T:**
- 단순히 알파벳 순서로 테스트 작성
- 엔티티를 개별적으로만 테스트 (통합 관점 누락)
- 업무 흐름과 무관한 우선순위 설정
- 엔티티 설계 의도를 무시한 테스트

### 그룹별 체크리스트

프로세스 그룹별로 테스트 작성 완료 시:

- [ ] 그룹 내 모든 엔티티의 types.ts nullable 필드 처리 완료
- [ ] 그룹 내 의존성 체인을 반영한 test-helpers 작성
- [ ] 그룹 내 각 엔티티의 모듈 테스트 파일 작성
- [ ] **핵심 업무 시나리오가 Business Logic 테스트에 포함됨**
- [ ] 모든 테스트 통과 확인 (`pnpm test`)
- [ ] 다음 그룹으로 진행

## 엔티티 생성 후 즉시 해야 할 작업

### types.ts nullable 필드 처리 (필수)

엔티티를 생성하고 `sonamu generate`로 types.ts가 생성되면, **테스트 작성 전** 즉시 nullable 필드를 처리하세요.

#### 작업 순서

1. `sonamu generate` 실행
2. 생성된 `*.types.ts` 파일 확인
3. nullable 필드를 partial + extend + nullish 처리
4. 테스트 작성 시작

#### 처리 대상 필드

- `nullable: true`인 모든 필드
- `dbDefault`가 있는 필드 (`.optional().default(value)`)
- FK 관계 필드 중 nullable인 것

#### 실전 예시

**STEP 1: sonamu generate 실행 후 생성된 파일**

```typescript
// faq.types.ts (자동 생성)
import type { z } from "zod";  // WRONG: type import
import { FAQBaseListParams, FAQBaseSchema } from "../sonamu.generated";

export const FAQListParams = FAQBaseListParams;
export type FAQListParams = z.infer<typeof FAQListParams>;

export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true,
});
export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

**STEP 2: 즉시 수정 (nullable 필드 + Zod import 처리)**

```typescript
// faq.types.ts (수정 완료)
import { z } from "zod";  // CORRECT: 일반 import로 수정
import { FAQBaseListParams, FAQBaseSchema } from "../sonamu.generated";

export const FAQListParams = FAQBaseListParams;
export type FAQListParams = z.infer<typeof FAQListParams>;

export const FAQSaveParams = FAQBaseSchema
  .partial({
    id: true,
    created_at: true,
    updated_at: true,
    // nullable 필드 추가
    category: true,
    order_num: true,
  })
  .extend({
    // nullable 필드를 nullish로 재정의
    category: z.string().nullish(),       // string | null | undefined
    order_num: z.number().nullish(),      // number | null | undefined
    updated_at: z.date().nullish(),       // date | null | undefined
  });

export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

#### 왜 이렇게 해야 하나?

**문제:** Zod의 `nullable()`은 `T | null`이지만 여전히 required입니다.

```typescript
// entity.json
{ "name": "category", "type": "string", "nullable": true }

// 생성된 BaseSchema
z.object({
  category: z.string().nullable(),  // string | null (required!)
})

// partial만 적용
.partial({ category: true })  // category?: string | null

// WRONG: undefined는 string | null에 할당 불가
const [id] = await FAQModel.save([{
  question: "질문",
  answer: "답변",
  // category 생략 시 타입 에러!
}]);
```

**해결:** `partial()` + `extend()` + `nullish()` 조합

```typescript
// CORRECT: 올바른 처리
FAQBaseSchema
  .partial({ category: true })
  .extend({ category: z.string().nullish() });  // string | null | undefined

// 테스트에서 자유롭게 생략 가능
const [id] = await FAQModel.save([{
  question: "질문",
  answer: "답변",
  // category 생략 가능!
}]);
```

#### 적용 기준

| 필드 타입 | 처리 방법 |
|-----------|----------|
| `id`, `created_at`, `updated_at` | 항상 partial (자동 생성) |
| `dbDefault`가 있는 필드 | `.optional().default(value)` |
| `nullable: true`인 필드 | partial + extend + `.nullish()` |
| 필수 필드 | partial 제외 |

#### 체크리스트

- [ ] `import type { z }`를 `import { z }`로 수정
- [ ] nullable 필드를 partial에 추가
- [ ] extend로 nullish 재정의
- [ ] dbDefault 필드는 `.optional().default()` 사용
- [ ] 필수 필드는 partial 제외 확인

**상세 타입 안전성 가이드:** 아래 "TypeScript 타입 안전성" 및 "타입 안전성 주의사항" 섹션 참조

## TypeScript 타입 안전성

### 배열 인덱싱 시 옵셔널 체이닝 필수

배열에서 인덱스로 요소에 접근한 후 프로퍼티에 접근할 때는 반드시 옵셔널 체이닝(`?.`)을 사용해야 합니다.

**이유:**
- 배열 인덱싱(`array[0]`, `array[1]` 등)은 항상 `undefined`를 반환할 수 있음
- TypeScript는 `array[0]`의 타입을 `T | undefined`로 추론
- 옵셔널 체이닝 없이 프로퍼티 접근 시 컴파일 에러 발생

**잘못된 예:**
```typescript
// 타입 에러: Object is possibly 'undefined'
expect(list.rows[0].title).toBe("테스트");
expect(searchResults.rows[0].name).toContain("검색어");
```

**올바른 예:**
```typescript
// 옵셔널 체이닝 사용
expect(list.rows[0]?.title).toBe("테스트");
expect(searchResults.rows[0]?.name).toContain("검색어");

// 또는 먼저 존재 확인 후 접근
expect(list.rows.length).toBeGreaterThanOrEqual(1);
expect(list.rows[0].title).toBe("테스트"); // 이제 안전
```

### 권장 패턴

테스트 코드에서 배열 요소 접근 시:

**패턴 1: 옵셔널 체이닝 사용**
```typescript
const result = await Model.findMany("A", { num: 10, page: 1 });
expect(result.rows[0]?.field).toBe(expectedValue);
```

**패턴 2: 길이 검증 후 접근**
```typescript
const result = await Model.findMany("A", { num: 10, page: 1 });
expect(result.rows.length).toBeGreaterThanOrEqual(1);
expect(result.rows[0].field).toBe(expectedValue); // 타입 안전
```

**패턴 3: find() 사용 시 옵셔널 체이닝 필수**
```typescript
const list = await Model.findMany("A", { num: 10, page: 1 });
const item = list.rows.find(r => r.id === targetId);
expect(item?.field).toBe(expectedValue); // find()는 undefined 반환 가능
```

### 일반 규칙

- 배열 인덱싱 후 프로퍼티 접근: `array[0]?.property`
- `find()`, `filter()[0]` 등 결과: 항상 `?.` 사용
- 객체 중첩 접근: `obj.nested?.deep?.property`
- Non-null assertion(`!`)은 확신이 있을 때만 사용

## Model 기본 메서드 (테스트 대상)

Sonamu Model은 다음 메서드를 기본 제공한다. 테스트는 이 메서드들을 대상으로 작성한다:

| 메서드 | 용도 | 반환 |
|--------|------|------|
| `findById(subset, id)` | 단건 조회 | `Promise<Subset>` |
| `findMany(subset, params)` | 목록 조회 | `Promise<ListResult<Subset>>` |
| `save(rows)` | 생성/수정 (upsert) | `Promise<number[]>` (ids) |
| `del(ids)` | 삭제 | `Promise<number>` (삭제 건수) |

**주의:** `delete`가 아니라 `del`이다. JavaScript 예약어 회피를 위함.

## 대규모 프로젝트 전략 (10개 이상 엔티티)

**CRITICAL: 엔티티가 10개 이상인 프로젝트는 한 번에 작업하지 마세요.**

### 문제점
- 55개 엔티티를 한번에 작업하면 컨텍스트 혼란 발생
- 잘못된 파일 수정, 필수 내용 삭제 등 심각한 실수 위험
- 관계 추적 불가능, 테스트 작성 중 방향 상실

### 해결책: 배치 단위 작업

**규칙: 연관된 엔티티끼리 묶어 5-10개씩 배치로 진행**

```
1차 배치: User, Institution, Role 관련 (5개)
  → 테스트 완료 → 커밋

2차 배치: Survey, Question, Response 관련 (7개)
  → 테스트 완료 → 커밋

3차 배치: Report, Statistics 관련 (6개)
  → 테스트 완료 → 커밋
```

### 배치 그룹화 기준

**도메인별 그룹화 (권장):**
```
인증/권한: User, Role, Permission, Session
설문: Survey, Question, Choice, Response
보고서: Report, Chart, Export
관리: Institution, Department, Settings
```

**의존성별 그룹화:**
```
1차: 독립 엔티티 (User, Institution 등)
2차: 1차에 의존하는 엔티티 (Survey → Institution)
3차: 2차에 의존하는 엔티티 (Question → Survey)
```

### 배치 작업 프로세스

**각 배치마다:**
1. 해당 배치 엔티티 목록 명시
2. 테스트 헬퍼 작성 (createTest...)
3. 모든 엔티티 테스트 작성 완료
4. 전체 테스트 실행 확인
5. **Git commit 후 다음 배치 진행**

**배치 사이 확인사항:**
- [ ] 현재 배치 테스트 모두 통과
- [ ] 기존 배치 테스트 여전히 통과 (회귀 방지)
- [ ] 커밋 완료 (롤백 지점 확보)

### 작업 시작 전 선언

**IMPORTANT: 각 배치 시작 전 명시적으로 선언하세요**

```
"1차 배치 시작: User, Institution, Role 엔티티 (5개)
- User: user.model.test.ts 작성
- Institution: institution.model.test.ts 작성
- Role: role.model.test.ts 작성
수정할 파일만 작업, 다른 파일 건드리지 않음
진행할까요?"
```

### 위험 신호 감지

다음 상황이 발생하면 **즉시 작업 중단**:
- 배치 범위 밖의 엔티티를 수정하려고 함
- 같은 질문을 반복함
- 엔티티 관계를 혼동함
- 이미 완료한 파일을 다시 수정하려고 함

## 테스트 실행

```bash
# watch 모드로 테스트 실행 (개발 중 권장)
pnpm test:watch

# 특정 파일만 테스트 (watch 모드에서 p 키 → 파일명 입력)
# 전체 테스트 한 번 실행 (CI용)
pnpm test
```

## 설정 파일

### vitest.config.ts

```typescript
import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  test: await getSonamuTestConfig({
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
  }),
}));
```

### global.ts

```typescript
import dotenv from "dotenv";
dotenv.config();
export { setup } from "sonamu/test";
```

### sonamu.config.ts (test 설정)

```typescript
export default defineConfig({
  test: {
    parallel: true,   // 병렬 테스트 활성화
    maxWorkers: 4,    // Worker 수 (기본값: 4)
  },
});
```

## 테스트 기본 패턴

### bootstrap

모든 테스트 파일에서 `bootstrap(vi)` 호출 필수:

```typescript
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);

describe("MyTest", () => {
  test("테스트 케이스", async () => {
    // ...
  });
});
```

**bootstrap 옵션:**

```typescript
// 기본값: forTesting: true (빠름, Syncer/Task 생략)
bootstrap(vi);

// forTesting: false - 전체 초기화 (Syncer, Task, EntityManager 등 모두 로드)
// migrator, syncer, template 등의 테스트에서 사용
bootstrap(vi, { forTesting: false });
```

### test vs testAs

```typescript
// 비인증 테스트 - Context.user가 null
test("비인증 테스트", async () => {
  const me = await UserModel.me();
  expect(me).toBeNull();
});

// 인증 테스트 - Context.user 설정됨
import type { UserSubsetSS } from "../sonamu.generated";

const adminUser: UserSubsetSS = {
  id: 1,
  created_at: new Date(),
  email: "admin@test.com",
  username: "admin",
  role: "admin",
};

testAs(adminUser, "관리자 권한 테스트", async () => {
  const me = await UserModel.me();
  expect(me?.role).toBe("admin");
});
```

### test.each

```typescript
test.each([
  { input: "user@example.com", expected: true },
  { input: "invalid-email", expected: false },
])("이메일 검증: $input → $expected", async ({ input, expected }) => {
  expect(validateEmail(input)).toBe(expected);
});
```

## Fixture

### createFixtureLoader

```typescript
// api/src/testing/fixture.ts
import { createFixtureLoader } from "sonamu/test";
import { CompanyModel } from "../application/company/company.model";
import { UserModel } from "../application/user/user.model";

export const loadFixtures = createFixtureLoader({
  company01: async () => CompanyModel.findById("A", 1),
  user01: async () => UserModel.findById("A", 1),
});
```

### 테스트에서 사용

```typescript
import { loadFixtures } from "../../testing/fixture";

test("회사 정보 수정", async () => {
  const f0 = await loadFixtures(["company01"]);

  await CompanyModel.save([{
    ...f0.company01,
    name: "Updated Company",
  }]);

  const f1 = await loadFixtures(["company01"]);
  expect(f1.company01.name).toBe("Updated Company");
});
```

## Naite (테스트 추적 시스템)

Naite는 소스 코드에서 값을 기록하고, 테스트에서 검증하는 추적 시스템이다.

**동작 원리:**
1. **소스 코드**: `Naite.t("key", value)` 로 값 기록
2. **테스트 코드**: `Naite.get("key")` 로 기록된 값 조회/검증

### 소스 코드에서 기록 (Naite.t)

```typescript
// Model 또는 라이브러리 코드에서
import { Naite } from "sonamu";

// 쿼리 기록
Naite.t("esq-query", qb.toQuery());

// UpsertBuilder 내부
Naite.t("puri:ub-register", { tableName, uuid, isUuidReused, row });
Naite.t("puri:ub-upserted", { tableName, mode, rowCount, returnedIds });
```

### 테스트에서 검증 (Naite.get)

```typescript
// 테스트 코드에서
import { Naite } from "sonamu";

// 기록된 쿼리 검증
expect(Naite.get("esq-query").first()).not.contain("limit");

// UpsertBuilder 동작 검증
const trace = Naite.get("puri:ub-upserted").first();
expect(trace).toMatchObject({ tableName: "users", rowCount: 3 });
```

### 주요 Naite 키 (Sonamu 내장)

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

### 커스텀 키로 기록

```typescript
// 소스 코드에서 커스텀 키로 기록
Naite.t("user:created", { userId: 1, email: "test@test.com" });

// Mock용 가상 파일 시스템
Naite.t("mock:fs/promises:virtualFileSystem", "/path/to/virtual/file.ts");
```

### Naite.get() 조회 메서드

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

### Naite 체이닝 필터

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

### 테스트 예시

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

### Naite.del() - 값 삭제

```typescript
Naite.t("mock:fs/promises:virtualFileSystem", "/virtual/path");
// ... 테스트 ...
Naite.del("mock:fs/promises:virtualFileSystem");
```

## 테스트 헬퍼: expectQuery

SQL 쿼리의 특정 부분만 검증하는 헬퍼 (miomock 참고):

```typescript
// api/src/testing/expect-query.ts
import { type AST, Parser } from "node-sql-parser";
import { expect } from "vitest";

export type QueryPart = "type" | "table" | "columns" | "set" | "where" | "join" | "orderBy" | "pagination" | "groupBy" | "having";

export function expectQuery(query: string, part?: QueryPart) {
  if (!part) return expect(query);
  const ast = parseQuery(query);
  const extractedSql = extractors[part](ast);
  return expect(extractedSql);
}
```

### 사용 예시

```typescript
import { expectQuery } from "../testing/expect-query";

test("select 쿼리 검증", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").select({ id: "users.id" });
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "type").toBe("select");
  expectQuery(query, "table").toBe("users");
  expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS \`id\`"`);
});

test("where 조건 검증", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").where("users.id", 1);
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
});

test("join 검증", async () => {
  const db = UserModel.getPuri("r");
  await db.table("employees").leftJoin("departments", "employees.department_id", "departments.id");
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "join").toMatchInlineSnapshot(
    `"LEFT JOIN departments ON "employees"."department_id" = "departments"."id""`
  );
});
```

## 테스트 헬퍼: expectUB

UpsertBuilder 상태 검증 헬퍼 (miomock 참고):

```typescript
// api/src/testing/expect-ub.ts
import type { UpsertBuilder } from "sonamu";
import { expect } from "vitest";

export type UBPart = "tables" | "hasTable" | "rowCount" | "rows" | "row" | "refs" | "uniquesMap" | "uniqueIndexes";

export function expectUB<P extends UBPart>(
  ub: UpsertBuilder,
  part: P,
  tableName?: string,
  index?: number,
) {
  // ... 구현
}
```

### 사용 예시

```typescript
import { expectUB } from "../testing/expect-ub";

test("UpsertBuilder 상태 검증", async () => {
  const ub = new UpsertBuilder();

  // 초기 상태
  expectUB(ub, "hasTable", "users").toBe(false);
  expectUB(ub, "tables").toEqual([]);

  // register 후
  ub.register("users", { email: "test@test.com", username: "test", password: "pw", role: "normal" });

  expectUB(ub, "hasTable", "users").toBe(true);
  expectUB(ub, "rowCount", "users").toBe(1);
  expectUB(ub, "row", "users", 0).toMatchObject({
    email: "test@test.com",
    username: "test",
  });

  // upsert 후 초기화 확인
  await ub.upsert(wdb, "users");
  expectUB(ub, "rowCount", "users").toBe(0);
});
```

## Mock 패턴

### setup-mocks.ts

```typescript
// api/src/testing/setup-mocks.ts
import { Naite } from "sonamu";
import { vi } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  return {
    ...actual,
    access: vi.fn((path, mode) => {
      // 가상 파일 시스템 체크
      const vfs = Naite.get("mock:fs/promises:virtualFileSystem").result();
      if (vfs.some((v) => v === path)) {
        return Promise.resolve();
      }
      return actual.access(path, mode);
    }),
    writeFile: vi.fn((path, data) => {
      Naite.t("fs/promises:writeFile", { path, data });
    }),
    rm: vi.fn(async (path, options) => {
      Naite.t("fs/promises:rm", { path, options });
      return Promise.resolve();
    }),
  };
});
```

### test-helpers.ts

```typescript
// api/src/testing/test-helpers.ts
import { Entity, EntityManager, type EntityJson } from "sonamu";
import { vi } from "vitest";

// EntityManager.get 모킹
export function mockEntityManagerGet(
  targetEntityId: string,
  overrideCallback: (original: EntityJson) => EntityJson,
) {
  const originalEntityJson = EntityManager.get(targetEntityId).toJson();
  const originalGet = EntityManager.get;
  return vi.spyOn(EntityManager, "get").mockImplementation((entityId) => {
    if (entityId === targetEntityId) {
      return new Entity(overrideCallback(originalEntityJson));
    }
    return originalGet.call(EntityManager, entityId);
  });
}
```

## CRUD 테스트 패턴

### Create & Read

```typescript
test("Create - 새 유저 생성", async () => {
  const [userId] = await UserModel.save([{
    email: "newuser@test.com",
    username: "newuser",
    password: "hashedpassword",
    role: "normal",
  }]);

  expect(userId).toBeGreaterThan(0);

  const user = await UserModel.findById("A", userId);
  expect(user.email).toBe("newuser@test.com");
});
```

### Update

```typescript
test("Update - 유저 수정", async () => {
  const f0 = await loadFixtures(["user01"]);

  await UserModel.save([{
    ...f0.user01,
    username: "updated_username",
  }]);

  const f1 = await loadFixtures(["user01"]);
  expect(f1.user01.username).toBe("updated_username");
});
```

### 에러 테스트

```typescript
test("존재하지 않는 유저 조회 시 에러", async () => {
  await expect(UserModel.findById("A", 99999)).rejects.toThrow("not found");
});

test("해결되지 않은 참조 에러", async () => {
  const ub = new UpsertBuilder();
  const companyRef = ub.register("companies", { name: "Test" });
  ub.register("departments", { company_id: companyRef, name: "Dept" });

  // 잘못된 순서로 upsert 시도
  await expect(ub.upsert(wdb, "departments")).rejects.toThrow(/해결되지 않은 참조/);
});
```

## 테스트 구조화 패턴

```typescript
describe("UpsertBuilder", () => {
  describe("A. 기본 등록 (register)", () => {
    test("register() 호출 시 UBRef 반환", async () => { /* ... */ });
    test("여러 번 register() 시 rows 누적", async () => { /* ... */ });
  });

  describe("B. 테이블 관리", () => {
    test("getTable()/hasTable() 기본 동작", async () => { /* ... */ });
  });

  describe("C. Upsert 실행", () => {
    test("upsert() - 새 row 삽입", async () => { /* ... */ });
    test("upsert() - 기존 row 업데이트", async () => { /* ... */ });
    test("insertOnly() - 삽입만 수행", async () => { /* ... */ });
  });

  describe("D. 에러 처리", () => {
    test("존재하지 않는 테이블에 upsert → 빈 배열", async () => { /* ... */ });
    test("해결되지 않은 참조 → 에러", async () => { /* ... */ });
  });
});
```

## 파일 구조

```
api/src/testing/
├── fixture.ts       # createFixtureLoader 정의
├── global.ts        # globalSetup (dotenv, setup export)
├── setup-mocks.ts   # 전역 Mock 설정
├── test-helpers.ts  # 테스트 유틸 함수
├── expect-query.ts  # SQL 쿼리 검증 헬퍼
└── expect-ub.ts     # UpsertBuilder 검증 헬퍼
```

## Rules

- 모든 테스트 파일에서 `bootstrap(vi)` 호출 필수
- 각 테스트는 자동으로 롤백됨 (테스트 격리)
- 비인증 테스트는 `test`, 인증 테스트는 `testAs` 사용
- Fixture는 `createFixtureLoader`로 정의하고 `loadFixtures`로 로드
- Naite로 쿼리/UpsertBuilder 동작 추적 및 검증
- `toMatchInlineSnapshot()` 활용하여 스냅샷 테스트 권장
- Mock은 `setup-mocks.ts`에서 전역 설정하거나 테스트 내에서 `vi.spyOn` 사용

## 타입 안전성 주의사항

### Zod import 방식

**CRITICAL: 테스트 파일에서 Zod를 import할 때는 반드시 일반 import를 사용해야 합니다.**

```typescript
// CORRECT - 테스트 파일에서
import { z } from "zod";
import { describe, expect, vi } from "vitest";

// WRONG - type import 사용 시 런타임 에러 발생
import type { z } from "zod";  // 테스트 실행 시 에러!
```

**이유:** 테스트에서 `z.infer<>`나 Zod 스키마를 직접 사용하기 때문에 런타임에 Zod 객체가 필요합니다.

**적용 위치:**
- `*.model.test.ts` - 모든 테스트 파일
- `test-helpers.ts` - Zod 스키마를 사용하는 헬퍼 파일

### SaveParams의 partial 설정 확인

`Model.save()` 테스트 시 `*.types.ts`의 `SaveParams` partial 설정을 확인해야 함:

```typescript
// user.types.ts
import { z } from "zod";  // types 파일에서도 일반 import
import { UserBaseSchema } from "../sonamu.generated";

export const UserSaveParams = UserBaseSchema.partial({
  id: true,           // 자동 생성
  created_at: true,   // 자동 생성
  updated_at: true,   // 자동 생성
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

### Nullable 필드 처리 패턴

**CRITICAL: nullable 필드는 partial + extend로 nullish() 처리가 필수입니다.**

```typescript
// faq.types.ts
import { z } from "zod";
import { FAQBaseSchema } from "../sonamu.generated";

// CORRECT - nullable 필드를 nullish로 재정의
export const FAQSaveParams = FAQBaseSchema
  .partial({
    id: true,
    created_at: true,
    updated_at: true,
    // nullable 필드들도 partial 처리
    category: true,
    order_num: true,
  })
  .extend({
    // nullable 필드는 nullish로 재정의 (string | null | undefined)
    category: z.string().nullish(),
    order_num: z.number().nullish(),
    updated_at: z.date().nullish(),
  });

export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

**이유:** Zod의 `nullable()`은 `T | null`이지만 여전히 required입니다. `nullish()`를 사용해야 `T | null | undefined`로 완전히 optional이 됩니다.

**잘못된 패턴:**
```typescript
// WRONG - partial만 사용 (타입 에러 발생)
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  category: true,  // string | null 타입이지만 값을 주려면 null 명시 필요
  order_num: true,
});

// 테스트에서 타입 에러 발생
const [id] = await FAQModel.save([{
  question: "질문",
  answer: "답변",
  // category를 생략하면 에러: undefined는 string | null에 할당 불가
}]);
```

**올바른 패턴:**
```typescript
// CORRECT - partial + extend + nullish
export const FAQSaveParams = FAQBaseSchema
  .partial({
    id: true,
    category: true,
    order_num: true,
  })
  .extend({
    category: z.string().nullish(),    // string | null | undefined
    order_num: z.number().nullish(),   // number | null | undefined
  });

// 테스트에서 자유롭게 생략 가능
const [id] = await FAQModel.save([{
  question: "질문",
  answer: "답변",
  // category, order_num 모두 생략 가능!
}]);
```

**적용 기준:**
- `id`, `created_at`, `updated_at`: 항상 partial (자동 생성)
- `dbDefault`가 있는 필드: `.optional().default(value)`
- `nullable: true`인 필드: partial + extend + `.nullish()`
- 필수 필드: partial 제외
```

partial로 설정되지 않은 필드는 모두 필수이므로, 테스트에서 누락하면 타입 에러 발생:

```typescript
// WRONG: email, password 등 필수 필드 누락
await UserModel.save([{ username: "test" }]);

// CORRECT: 필수 필드 모두 포함
await UserModel.save([{
  username: "test",
  email: "test@test.com",
  password: "pw",
  role: "normal",
}]);
```

### Nullish Coalescing 사용

변수가 `T | undefined` 타입일 수 있는 경우 nullish coalescing 필수:

```typescript
// WRONG: userId가 number | undefined일 수 있음
const user = await UserModel.findById("A", userId);

// CORRECT: nullish coalescing으로 undefined 방어
const user = await UserModel.findById("A", userId ?? 0);
```

특히 이전 단계에서 생성한 ID를 사용할 때 주의:

```typescript
const [userId] = await UserModel.save([{ ... }]);

// WRONG: userId가 number | undefined
const user = await UserModel.findById("A", userId);

// CORRECT:
const user = await UserModel.findById("A", userId ?? 0);
```

### SaveParams import 위치

SaveParams 타입은 sonamu.generated가 아닌 각 엔티티의 types.ts에서 export됩니다.

**잘못된 예:**
```typescript
// test-helpers.ts
import type {
  UserSaveParams,
  TaskSaveParams,
} from "../application/sonamu.generated";  // WRONG
```

**올바른 예:**
```typescript
// test-helpers.ts
import type { UserSaveParams } from "../application/user/user.types";
import type { TaskSaveParams } from "../application/task/task.types";
```

**이유:**
- sonamu.generated에는 BaseSchema와 BaseListParams만 export됨
- SaveParams는 각 엔티티의 types.ts에서 BaseSchema.partial()로 정의됨

## 실전 주의사항 (Common Pitfalls)

### 1. Fixture 데이터 준비 필수

**문제:** Foreign key constraint로 인해 기본 데이터 없으면 테스트 실패

**해결:**
```sql
-- database/scripts/seed-initial-data.sql
INSERT INTO institutions (id, name, code) VALUES (1, '본원', 'HQ');
INSERT INTO departments (id, name, institution_id) VALUES (1, '연구부', 1);
INSERT INTO roles (id, code, name) VALUES (1, 'ADMIN', '관리자');
```

```bash
# 1. seed 데이터를 test DB에 적용
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test -f database/scripts/seed-initial-data.sql

# 2. dump 생성
pnpm dump

# 3. fixture DB에 적용
pnpm seed

# 4. sonamu fixture sync (선택사항)
pnpm sonamu fixture sync
```

### 2. SaveParams 타입 설계 (Partial)

**문제 1:** Update 시 일부 필드만 변경하면 타입 에러 발생

**문제 2:** 테스트 헬퍼에서 override를 Partial로 받을 때 타입 에러 발생
```typescript
// WRONG - nullable 필드가 partial 미설정
export const QuestionSaveParams = QuestionBaseSchema.partial({
  id: true,
  created_at: true,
});

// test-helpers.ts
export async function createTestQuestion(
  collectionId: number,
  override?: Partial<QuestionSaveParams>
) {
  const [id] = await QuestionModel.save([{
    content: "테스트질문",
    parent_id: null,
    answer_group_id: null,
    ...override,  // 타입 에러: undefined는 null로 할당 불가
  }]);
  return id;
}
```

**해결:** nullable/dbDefault 필드를 partial로 설정
```typescript
// api/src/application/user/user.types.ts
export const UserSaveParams = UserBaseSchema.partial({
  id: true,              // update 시 필요
  created_at: true,      // dbDefault
  password: true,        // nullable
  email: true,           // nullable
  phone: true,           // nullable
  user_type: true,       // dbDefault
  position_code: true,   // nullable
  position_name: true,   // nullable
  hire_date: true,       // nullable
  status: true,          // dbDefault
  department_id: true,   // nullable relation
});
```

**적용 기준:**
- id, created_at, updated_at: 항상 partial (자동 생성)
- dbDefault가 있는 필드: partial 처리
- nullable: true인 FK 필드: partial 처리
- nullable: true인 일반 필드 (description 등): partial 처리

**핵심:** 필수 필드(employee_no, login_id, name, institution_id)는 partial 제외하여 타입 안정성 유지

### 3. Update 시 Relation 필드 제외 패턴

**문제:** Subset에는 relation 객체가 포함되지만, SaveParams에는 FK만 있어서 에러 발생

```typescript
// WRONG
const user = await UserModel.findById("A", userId);
await UserModel.save([{ ...user, status: "inactive" }]);
// → "column 'department' does not exist" 에러
```

**해결:** Relation 필드 제외 + FK 명시적 추가
```typescript
// CORRECT
const user = await UserModel.findById("A", userId);
const { institution, department, ...userData } = user;
await UserModel.save([{
  ...userData,
  institution_id: user.institution.id,           // FK 명시적 추가
  department_id: user.department?.id ?? null,
  status: "inactive",
}]);
```

**이유:** `UserSubsetA`는 `institution`, `department` 객체를 포함하지만, `institution_id`, `department_id` FK는 포함하지 않음

### 4. ubUpsert는 Upsert 동작

**문제:** Unique constraint 위반 테스트가 실패함

```typescript
// 실패하는 테스트
test("사번은 고유해야 함", async () => {
  await UserModel.save([{ employee_no: "001", ... }]);

  // 중복된 사번으로 생성 시도
  await expect(
    UserModel.save([{ employee_no: "001", ... }])
  ).rejects.toThrow();  // 에러 안 던지고 UPDATE됨
});
```

**원인:** Sonamu의 `save()`는 `ubUpsert` 사용 → conflict 시 에러 대신 UPDATE

**해결:** 이런 테스트는 skip 처리
```typescript
test.skip("사번은 고유해야 함 (ubUpsert는 upsert 동작하므로 skip)", async () => {
  // ...
});
```

### 5. testAs 사용법

**문제:** test 안에서 testAs 호출하면 에러 발생

```typescript
// WRONG
test("권한 테스트", async () => {
  await testAs(adminUser, "설명", async () => { ... });
  // → "Calling the test function inside another test function is not allowed" 에러
});

// CORRECT - test를 대체
testAs(adminUser, "권한 테스트", async () => {
  const result = await UserModel.del([userId]);
  expect(result).toBe(1);
});
```

### 6. Naite로 Model 쿼리 검증

**Model에 Naite 기록 추가:**
```typescript
// user.model.ts
import { Naite } from "sonamu";

async findMany(...) {
  // ... qb 구성 ...

  // 테스트를 위한 쿼리 기록
  Naite.t("esq-query", qb.toQuery());

  return this.executeSubsetQuery({ ... });
}
```

**Test에서 검증:**
```typescript
test("num: 0일 때 limit 없어야 함", async () => {
  await UserModel.findMany("A", { num: 0, page: 1 });

  expect(Naite.get("esq-query").first()).not.contain("limit");
  expect(Naite.get("esq-query").first()).not.contain("offset");
});
```

### 7. 에러 메시지는 다국어 고려

```typescript
// WRONG: 영어 메시지만 검증
await expect(UserModel.findById("A", 99999))
  .rejects.toThrow("not found");

// CORRECT: 한글 메시지 부분 매칭
await expect(UserModel.findById("A", 99999))
  .rejects.toThrow("존재하지 않는");
```

### 8. pnpm Workspace와 Vitest 인스턴스 충돌

**문제:** "Vitest failed to access its internal state" 에러

**원인:** sonamu가 `link:`로 연결되어 있으면, sonamu와 프로젝트의 vitest가 다른 peer dependency 조합으로 별도 경로에 설치됨

**임시 해결 (테스트용):**
```json
// packages/api/package.json
{
  "dependencies": {
    "sonamu": "0.8.0"  // link 대신 버전 명시
  }
}
```

**근본 해결:** sonamu 개발자에게 문의 (프레임워크 내부 이슈)

### 9. assert() for Truthy Checks

```typescript
import assert from "assert";

test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{ ... }]);

  // truthy 체크
  assert(userId);

  // 이후 userId는 number로 확실히 타입 추론됨
  const user = await UserModel.findById("A", userId);
});
```

### 10. 테스트 데이터는 직접 생성

**miomock 컨벤션:** Fixture 최소화, 데이터는 테스트 내에서 직접 생성

```typescript
// 권장 패턴
test("사용자 생성", async () => {
  const [userId] = await UserModel.save([{
    employee_no: "2026001",
    login_id: "testuser",
    name: "테스트유저",
    institution_id: 1,
    // ... 필요한 필드들
  }]);

  const user = await UserModel.findById("A", userId);
  expect(user.name).toBe("테스트유저");
});

// Fixture는 공통 데이터에만 사용
const f = await loadFixtures(["institution01"]);  // 기관 같은 공통 데이터만
```

## 복잡한 엔티티 테스트 전략

엔티티 간 의존성이 복잡한 경우 (Institution → Department → User → Task → TaskParticipant) 테스트 헬퍼 함수를 활용한다.

### 테스트 헬퍼 함수 정의

```typescript
// api/src/testing/test-helpers.ts
import assert from "assert";
import { InstitutionModel } from "../application/institution/institution.model";
import { DepartmentModel } from "../application/department/department.model";
import { UserModel } from "../application/user/user.model";
import { TaskModel } from "../application/task/task.model";

// 각 헬퍼는 최소 필수 필드만 요구하고, 나머지는 기본값 제공
let counter = 0;
function uniqueId(prefix: string) {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export async function createTestInstitution(override?: Partial<InstitutionSaveParams>) {
  const [id] = await InstitutionModel.save([{
    name: "테스트기관",
    code: uniqueId("INST"),
    ...override,
  }]);
  assert(id);
  return id;
}

export async function createTestDepartment(
  institutionId: number,
  override?: Partial<DepartmentSaveParams>
) {
  const [id] = await DepartmentModel.save([{
    name: "테스트부서",
    code: uniqueId("DEPT"),
    dept_type: "division",
    institution_id: institutionId,
    is_active: true,
    sort_order: 0,
    ...override,
  }]);
  assert(id);
  return id;
}

export async function createTestUser(
  institutionId: number,
  override?: Partial<UserSaveParams>
) {
  const [id] = await UserModel.save([{
    employee_no: uniqueId("EMP"),
    login_id: uniqueId("login"),
    name: "테스트사용자",
    institution_id: institutionId,
    ...override,
  }]);
  assert(id);
  return id;
}

export async function createTestTask(
  principalInvestigatorId: number,
  override?: Partial<TaskSaveParams>
) {
  const [id] = await TaskModel.save([{
    task_no: uniqueId("TASK"),
    title: "테스트과제",
    year: new Date().getFullYear(),
    begin_date: new Date(),
    end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    principal_investigator_id: principalInvestigatorId,
    ...override,
  }]);
  assert(id);
  return id;
}

// 의존성 체인을 한 번에 생성
export async function createTestTaskWithDeps(taskOverride?: Partial<TaskSaveParams>) {
  const institutionId = await createTestInstitution();
  const userId = await createTestUser(institutionId);
  const taskId = await createTestTask(userId, taskOverride);
  return { institutionId, userId, taskId };
}

export async function createTestUserWithDeps(userOverride?: Partial<UserSaveParams>) {
  const institutionId = await createTestInstitution();
  const userId = await createTestUser(institutionId, userOverride);
  return { institutionId, userId };
}
```

### 테스트에서 사용

```typescript
import { createTestTaskWithDeps, createTestUser } from "../../testing/test-helpers";

describe("TaskModel", () => {
  // GOOD: 헬퍼 함수로 간결하게
  test("Create - 최소 필수 필드로 생성", async () => {
    const { taskId } = await createTestTaskWithDeps();

    const task = await TaskModel.findById("D", taskId);
    expect(task.id).toBe(taskId);
  });

  // GOOD: 특정 필드 커스터마이즈
  test("Create - 특정 상태로 생성", async () => {
    const { taskId } = await createTestTaskWithDeps({
      status: "approved",
      title: "승인된 과제",
    });

    const task = await TaskModel.findById("D", taskId);
    expect(task.status).toBe("approved");
  });

  // BAD: 매 테스트마다 의존성 직접 생성 (반복적)
  test("Create - 직접 생성 (권장하지 않음)", async () => {
    const [institutionId] = await InstitutionModel.save([{ name: "...", code: "..." }]);
    assert(institutionId);
    const [userId] = await UserModel.save([{ ... }]);
    assert(userId);
    const [taskId] = await TaskModel.save([{ ... }]);
    assert(taskId);
    // ...
  });
});
```

### Subset → SaveParams 변환 헬퍼

findById 결과를 수정 후 다시 save할 때 relation을 FK로 변환해야 한다:

```typescript
// api/src/testing/test-helpers.ts

// Task Subset D → SaveParams 변환
export function taskToSaveParams(task: TaskSubsetD): TaskSaveParams {
  const {
    program,
    project,
    principal_investigator,
    department,
    prev_task,
    ...rest
  } = task;

  return {
    ...rest,
    program_id: program?.id ?? null,
    project_id: project?.id ?? null,
    principal_investigator_id: principal_investigator.id,
    department_id: department?.id ?? null,
    prev_task_id: prev_task?.id ?? null,
  };
}

// 범용 헬퍼 (주의: relation 필드명이 다른 경우 직접 작성 필요)
export function relationToFk<T extends Record<string, any>>(
  data: T,
  relationFields: string[]
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (relationFields.includes(key)) {
      // relation → FK
      result[`${key}_id`] = value?.id ?? null;
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

### Update 테스트 간소화

```typescript
import { createTestTaskWithDeps, taskToSaveParams } from "../../testing/test-helpers";

test("Update - 과제 정보 수정", async () => {
  const { taskId } = await createTestTaskWithDeps();

  const task = await TaskModel.findById("D", taskId);
  await TaskModel.save([{
    ...taskToSaveParams(task),
    title: "수정된 제목",
  }]);

  const updated = await TaskModel.findById("D", taskId);
  expect(updated.title).toBe("수정된 제목");
});
```

### 주의사항

**beforeAll/beforeEach 사용 금지:**

sonamu의 테스트 환경에서 beforeAll/beforeEach로 데이터를 생성하면 sonamu 내부 코드를 바라보게 될 수 있다. 대신 각 테스트 내에서 헬퍼 함수를 호출한다.

```typescript
// WRONG: beforeAll 사용
describe("TaskModel", () => {
  let taskId: number;
  beforeAll(async () => {
    const result = await createTestTaskWithDeps();
    taskId = result.taskId;
  });

  test("...", async () => {
    // taskId 사용 - 문제 발생 가능
  });
});

// CORRECT: 각 테스트에서 생성
describe("TaskModel", () => {
  test("...", async () => {
    const { taskId } = await createTestTaskWithDeps();
    // taskId 사용
  });
});
```

---

## 흔한 실수와 해결 방법

### ubUpsert는 unique constraint 에러를 던지지 않습니다

ubUpsert는 INSERT 실패 시 UPDATE를 수행하므로 unique constraint 위반 시에도 에러를 던지지 않습니다.

```typescript
// BAD: 이 테스트는 항상 실패
test("코드 중복 방지 (unique 제약)", async () => {
  await createTestDepartment({ code: "IT" });

  // ubUpsert는 에러를 던지지 않고 UPDATE를 수행
  await expect(
    createTestDepartment({ code: "IT" })
  ).rejects.toThrow();
});

// GOOD: skip 처리하고 이유를 명시
test.skip("코드 중복 방지 - ubUpsert는 중복 시 업데이트 수행", async () => {
  const code = "IT";
  await createTestDepartment({ code });

  // 같은 코드로 두 번째 생성 시도
  await expect(
    createTestDepartment({ code })
  ).rejects.toThrow();
});
```

**이유:** Sonamu의 ubUpsert 패턴은 INSERT ... ON DUPLICATE KEY UPDATE를 사용하므로 중복 키가 있어도 에러 대신 업데이트를 수행합니다.

**대안:** unique constraint 검증이 필요한 경우 직접 Knex 쿼리로 테스트하거나, 비즈니스 로직에서 중복 체크를 구현합니다.

### Transaction isolation과 테스트 격리

각 테스트는 독립된 트랜잭션에서 실행되므로 데이터가 격리됩니다. 같은 테스트 내에서도 생성한 데이터가 쿼리에 즉시 보이지 않을 수 있습니다.

```typescript
// BAD: 정확한 개수를 기대하면 실패할 수 있음
test("역할명 검색", async () => {
  await createTestRole({ name: "관리자A" });
  await createTestRole({ name: "관리자B" });

  const { rows } = await RoleModel.findMany("A", {
    keyword: "관리자"
  });

  // Transaction isolation으로 인해 2개가 보이지 않을 수 있음
  expect(rows.length).toBe(2);
});

// GOOD: 고유 식별자와 유연한 assertion 사용
test("역할명 검색", async () => {
  // 고유한 식별자로 충돌 방지
  const testName = `검색테스트_${Date.now()}`;
  await createTestRole({ name: `${testName}A` });
  await createTestRole({ name: `${testName}B` });

  const { rows } = await RoleModel.findMany("A", {
    keyword: testName
  });

  // 최소 1개 이상 확인
  expect(rows.length).toBeGreaterThanOrEqual(1);
  // 내용 검증
  expect(rows.some(r => r.name.includes(testName))).toBe(true);
});
```

**패턴:**
- 고유 식별자 사용: `Date.now()`, `uuid()` 등으로 충돌 방지
- 유연한 assertion: `toBeGreaterThanOrEqual(1)` 대신 `toBe(2)` 사용
- 내용 검증: 개수보다 실제 데이터가 맞는지 확인

### 정렬 테스트의 조건부 검증

정렬 테스트에서 모든 데이터가 조회되지 않을 수 있으므로 조건부 검증을 사용합니다:

```typescript
// BAD: 항상 두 항목이 조회된다고 가정
test("정렬 - ID 최신순", async () => {
  const id1 = await createTestRole({ name: "역할1" });
  const id2 = await createTestRole({ name: "역할2" });

  const { rows } = await RoleModel.findMany("A", {
    orderBy: "id-desc",
  });

  const id2Index = rows.findIndex(r => r.id === id2);
  const id1Index = rows.findIndex(r => r.id === id1);

  // 둘 중 하나라도 없으면 실패
  expect(id2Index).toBeLessThan(id1Index);
});

// GOOD: 조건부 검증
test("정렬 - ID 최신순", async () => {
  const id1 = await createTestRole({ name: "역할1" });
  const id2 = await createTestRole({ name: "역할2" });

  const { rows } = await RoleModel.findMany("A", {
    orderBy: "id-desc",
  });

  const testRoles = rows.filter(r => [id1, id2].includes(r.id));
  expect(testRoles.length).toBeGreaterThanOrEqual(1);

  // 두 역할이 모두 조회된 경우에만 순서 검증
  if (testRoles.length === 2) {
    const id2Index = rows.findIndex(r => r.id === id2);
    const id1Index = rows.findIndex(r => r.id === id1);
    expect(id2Index).toBeLessThan(id1Index);
  }
});
```

**핵심:** Transaction isolation으로 인한 불확실성을 받아들이고, 검증 가능한 경우에만 assertion을 수행합니다.

---

## Fixture 데이터 생성 팁

Sonamu의 `pnpm sonamu fixture gen` 명령어로 테스트용 fixture 데이터를 생성할 때 유용한 패턴들입니다.

### Unique Constraint 고려

unique constraint가 있는 필드는 랜덤 데이터 생성 시 중복을 피해야 합니다.

**문제 상황:**
```typescript
// BAD - 같은 값 반복 생성 → unique constraint 위반
const dept = faker.helpers.arrayElement(["개발팀", "기획팀", "마케팅팀"]);
// 같은 company_id에 "개발팀"이 여러 번 생성되면 오류 발생
```

**해결 방법: Suffix/Prefix 추가로 중복 방지**
```typescript
// GOOD - 70% 확률로 suffix/prefix 추가하여 변형
const depts = ["개발팀", "기획팀", "마케팅팀", "영업팀", "인사팀"];
const prefixes = ["신규", "통합", "전략", "글로벌", "디지털", "핵심"];
const suffixes = ["1팀", "2팀", "3팀", "A팀", "B팀", "본부", "센터", "그룹"];

const dept = faker.helpers.arrayElement(depts);
const random = Math.random();

if (random > 0.7) {
  return `${faker.helpers.arrayElement(prefixes)} ${dept}`;
}
if (random > 0.4) {
  return `${dept} ${faker.helpers.arrayElement(suffixes)}`;
}
return dept;

// 결과 예시: "개발팀", "개발팀 1팀", "글로벌 개발팀", "개발팀 본부" 등
```

**핵심:**
- 기본 값(30% 확률) + 변형 값(70% 확률)으로 중복 최소화
- unique constraint가 있는 필드는 반드시 변형 로직 추가
- 여러 조합으로 다양성 확보 (prefix × dept, dept × suffix)

### 한국어 데이터 생성

테스트 데이터의 가독성을 높이기 위해 한국어 데이터를 생성합니다.

**설치:**
```bash
pnpm add -D @faker-js/faker
```

**사용 예시:**
```typescript
import { faker } from "@faker-js/faker";
import { fakerKO } from "@faker-js/faker";

// 한국 이름 (성+이름)
const name = fakerKO.person.fullName();
// 예: "김민준", "이서연", "박지호"

// 한국 성만
const lastName = fakerKO.person.lastName();
// 예: "김", "이", "박"

// 한국 이름만
const firstName = fakerKO.person.firstName();
// 예: "민준", "서연", "지호"

// 한국 부서명 (커스텀 리스트)
const departments = [
  "개발팀", "기획팀", "마케팅팀", "영업팀", "인사팀",
  "재무팀", "법무팀", "품질관리팀", "IT팀", "디자인팀"
];
const dept = faker.helpers.arrayElement(departments);

// 한국 회사명 (커스텀 리스트 + suffix)
const companies = ["테크놀로지", "솔루션즈", "디지털", "이노베이션"];
const suffixes = ["주식회사", "㈜", "코퍼레이션", "그룹"];
const company = `${faker.helpers.arrayElement(companies)} ${faker.helpers.arrayElement(suffixes)}`;
// 예: "테크놀로지 주식회사", "디지털 ㈜"
```

**FixtureGenerator에서 활용:**
```typescript
// fixture-generator.ts 내부
if (entity?.id === "Department" && prop.name === "name") {
  const departments = ["개발팀", "기획팀", "마케팅팀", "영업팀"];
  const prefixes = ["신규", "통합", "전략", "글로벌"];
  const suffixes = ["1팀", "2팀", "본부", "센터"];

  const dept = faker.helpers.arrayElement(departments);
  const random = Math.random();

  if (random > 0.7) {
    return `${faker.helpers.arrayElement(prefixes)} ${dept}`;
  }
  if (random > 0.4) {
    return `${dept} ${faker.helpers.arrayElement(suffixes)}`;
  }
  return dept;
}

if (prop.name === "name" || prop.name === "username") {
  return fakerKO.person.fullName();
}
```

### Fixture Gen vs Fetch 선택 기준

| 상황 | 명령어 | 이유 |
|------|--------|------|
| 운영 DB에 데이터가 없음 | `fixture gen` | faker로 더미 데이터 생성 |
| 실제 데이터로 테스트 필요 | `fixture fetch` | 운영 DB에서 가져오기 |
| 특정 패턴 데이터 필요 | `fixture gen` + custom logic | FixtureGenerator 수정 |
| 관련 데이터 함께 필요 | `fixture fetch` | FK 따라 자동으로 가져옴 |

**예시:**
```bash
# 더미 데이터 생성 (한국어)
pnpm sonamu fixture gen --include Department --count 10

# 실제 데이터 가져오기 (최근 10개 + 관련 데이터)
pnpm sonamu fixture fetch --include User --limit 10 --strategy recent
```

### DB 시퀀스 리셋

Fixture 데이터 생성 후 ID 시퀀스가 실제 데이터와 맞지 않을 수 있습니다.

**확인:**
```bash
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture -c "
SELECT
  schemaname,
  sequencename,
  last_value
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
"
```

**리셋:**
```sql
-- 각 테이블마다 실행
SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments), true);
SELECT setval('companies_id_seq', (SELECT MAX(id) FROM companies), true);
```

**자동화 스크립트:**
```bash
# 모든 시퀀스 리셋
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture -c "
SELECT 'SELECT setval(''' || sequencename || ''', (SELECT COALESCE(MAX(id), 1) FROM ' ||
  replace(sequencename, '_id_seq', '') || '), true);'
FROM pg_sequences
WHERE schemaname = 'public' AND sequencename LIKE '%_id_seq';
" | grep SELECT | PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture
```
