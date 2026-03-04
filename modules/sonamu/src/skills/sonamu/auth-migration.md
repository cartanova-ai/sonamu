---
name: sonamu-auth-migration
description: better-auth 등 외부 인증 통합 시 User.id 타입 변경 (integer→string). Entity, Migration, SaveParams, test-helpers 전체 프로세스. PK 타입 변경 후 플러그인 Entity/Migration 작성 패턴. Use when migrating User.id from integer to string PK, or writing plugin Entity/Migration after PK type change.
---

# Auth 시스템 Migration (better-auth 등 외부 인증 통합)

## Situation

외부 인증 시스템(better-auth, NextAuth 등)을 기존 Sonamu 프로젝트에 통합할 때 User.id 타입 변경이 필요한 경우

## Problem

- better-auth는 User.id를 string(text) 타입으로 요구
- 기존 시스템은 integer 타입 사용
- User를 참조하는 모든 FK도 함께 변경 필요
- Migration 순서 실수 시 FK constraint 위반

## Solution

### 1. Entity 타입 변경

```json
// user.entity.json
{
  "props": [{ "name": "id", "type": "string", "desc": "ID" }]
}
```

주의: integer에서 string으로 변경

### 2. 영향받는 FK 확인

```bash
# User를 참조하는 모든 relation 찾기
grep -r "with.*User" --include="*.entity.json"
```

일반적으로 영향받는 테이블:

- accounts.user_id
- sessions.user_id
- evaluation_committees.evaluator_id (또는 다른 User 참조 FK)
- project_participants.user_id
- reports.submitted_by_id

### 3. Migration 작성 순서 (필수)

잘못된 순서 - FK constraint 위반:

```typescript
// 잘못된 예
await knex.schema.alterTable("accounts", (table) => {
  table.text("user_id").alter(); // 실패: FK가 아직 users.id(integer)를 참조 중
});
```

올바른 순서:

```typescript
export async function up(knex: Knex): Promise<void> {
  // 1단계: 모든 FK 제약조건 제거
  await knex.raw(
    'ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_foreign"',
  );
  await knex.raw(
    'ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_foreign"',
  );
  await knex.raw(
    'ALTER TABLE "evaluation_committees" DROP CONSTRAINT "evaluation_committees_evaluator_id_foreign"',
  );
  await knex.raw(
    'ALTER TABLE "project_participants" DROP CONSTRAINT "project_participants_user_id_foreign"',
  );
  await knex.raw(
    'ALTER TABLE "reports" DROP CONSTRAINT "reports_submitted_by_id_foreign"',
  );

  // 2단계: PK 제약조건 제거
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT "users_pkey"');

  // 3단계: 모든 컬럼 타입 변경 (부모 PK + 자식 FK)
  await knex.raw(
    'ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text',
  );
  await knex.raw(
    'ALTER TABLE "accounts" ALTER COLUMN "user_id" TYPE text USING "user_id"::text',
  );
  await knex.raw(
    'ALTER TABLE "sessions" ALTER COLUMN "user_id" TYPE text USING "user_id"::text',
  );
  await knex.raw(
    'ALTER TABLE "evaluation_committees" ALTER COLUMN "evaluator_id" TYPE text USING "evaluator_id"::text',
  );
  await knex.raw(
    'ALTER TABLE "project_participants" ALTER COLUMN "user_id" TYPE text USING "user_id"::text',
  );
  await knex.raw(
    'ALTER TABLE "reports" ALTER COLUMN "submitted_by_id" TYPE text USING "submitted_by_id"::text',
  );

  // 4단계: PK 제약조건 복구
  await knex.raw(
    'ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")',
  );

  // 5단계: FK 제약조건 복구
  await knex.raw(
    'ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE',
  );
  await knex.raw(
    'ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE',
  );
  await knex.raw(
    'ALTER TABLE "evaluation_committees" ADD CONSTRAINT "evaluation_committees_evaluator_id_foreign" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
  await knex.raw(
    'ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
  await knex.raw(
    'ALTER TABLE "reports" ADD CONSTRAINT "reports_submitted_by_id_foreign" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
}
```

핵심 원칙:

1. FK constraint가 존재하는 상태에서는 참조 컬럼 타입 변경 불가
2. 모든 FK 제거 후 타입 변경, 그 다음 FK 복구
3. 하나의 migration에서 모든 변경을 처리

### 4. Migration 재생성 시 주의사항

Entity 변경 후 `pnpm generate` 실행 시 중복 migration이 생성됨:

```
20260203154926_alter_accounts_alter5.ts           (accounts.user_id만 변경)
20260203154927_alter_evaluation_committees.ts    (evaluator_id만 변경)
20260203154928_alter_project_participants.ts     (user_id만 변경)
20260203154929_alter_reports.ts                  (submitted_by_id만 변경)
20260203154930_alter_sessions.ts                 (user_id만 변경)
20260203154931_alter_users_pk_type.ts           (통합: 모든 타입 변경)
```

문제점:

- 개별 migration들(154926-154930)이 FK 타입만 변경 시도
- 통합 migration(154931)도 같은 컬럼들을 변경
- 순서대로 실행하면 154926이 먼저 실행되어 FK constraint 위반

해결 방법 1: 개별 migration 삭제

```bash
rm 20260203154926_alter_accounts_alter5.ts
rm 20260203154927_alter_evaluation_committees.ts
rm 20260203154928_alter_project_participants.ts
rm 20260203154929_alter_reports.ts
rm 20260203154930_alter_sessions.ts
# 20260203154931_alter_users_pk_type.ts만 유지
```

해결 방법 2: 개별 migration에서 user_id 관련 변경 제거

- accounts, sessions migration에 updated_at 변경만 남기고 user_id 변경 제거
- evaluation_committees, project_participants, reports migration 삭제
- 통합 migration에서만 타입 변경 수행

### 5. SaveParams 타입 정의

Auth 관련 엔티티는 nullable 필드가 많으므로 SaveParams에서 모두 optional 처리 필요:

```typescript
// account.types.ts
export const AccountSaveParams = AccountBaseSchema.partial({
  id: true, // create와 update 구분을 위해
  created_at: true, // dbDefault로 자동 생성
  updated_at: true, // dbDefault로 자동 생성
  access_token: true, // nullable - OAuth 전용
  refresh_token: true, // nullable - OAuth 전용
  id_token: true, // nullable - OAuth 전용
  access_token_expires_at: true, // nullable
  refresh_token_expires_at: true, // nullable
  scope: true, // nullable - OAuth 전용
  password: true, // nullable - credential 전용
});
```

원칙:

- id: optional (create 시 생성, update 시 필수)
- created_at, updated_at: optional (dbDefault로 자동 생성)
- entity에서 nullable: true인 모든 필드: optional

이렇게 하지 않으면 테스트 작성 시 타입 에러 발생:

```typescript
// SaveParams에서 password가 optional이 아니면
await AccountModel.save([
  {
    provider_id: "google",
    // password 필드를 제공하지 않으면 타입 에러 발생
  },
]);
```

### 6. 테스트 작성 패턴

나쁜 예 - OAuth 계정에 불필요한 필드 제공:

```typescript
await AccountModel.save([
  {
    id: `acc_${Date.now()}`,
    account_id: "google_123",
    provider_id: "google",
    user_id: userId,
    access_token: "token_123",
    refresh_token: "refresh_123",
    id_token: "id_token_123",
    password: "hashed_password", // OAuth에는 불필요
    scope: "openid profile email",
    access_token_expires_at: new Date(),
    refresh_token_expires_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  },
]);
```

좋은 예 - 필수 필드와 의미있는 필드만 제공:

```typescript
// OAuth 계정
await AccountModel.save([
  {
    id: `acc_${Date.now()}`,
    account_id: "google_123",
    provider_id: "google",
    user_id: userId,
    access_token: "token_123",
  },
]);

// Credential 계정
await AccountModel.save([
  {
    id: `acc_${Date.now()}`,
    account_id: "email_account",
    provider_id: "credential",
    user_id: userId,
    password: "hashed_password",
  },
]);
```

원칙:

- 각 provider 타입에 맞는 필드만 제공
- nullable 필드는 테스트에 필요한 경우에만 제공
- dbDefault 필드(created_at, updated_at)는 제공하지 않음

### 7. test-helpers 타입 수정

User.id가 string으로 변경되면 모든 헬퍼 함수의 타입도 수정 필요:

잘못된 타입:

```typescript
export async function createTestUser(): Promise<Number> { ... }
export async function createTestProjectParticipant(
  projectId: number,
  userId: number,  // 잘못됨
): Promise<number> { ... }
```

올바른 타입:

```typescript
export async function createTestUser(): Promise<string> { ... }
export async function createTestProjectParticipant(
  projectId: number,
  userId: string,  // 수정
): Promise<number> { ... }
```

확인 방법:

```bash
# test-helpers에서 user 관련 파라미터 찾기
grep -n "userId.*number" src/testing/test-helpers.ts
grep -n "evaluatorId.*number" src/testing/test-helpers.ts
grep -n "submittedById.*number" src/testing/test-helpers.ts
```

### 8. HasMany 관계의 joinColumn 처리

HasMany 관계 설정 시 joinColumn에 지정한 컬럼이 자식 엔티티에 존재해야 함:

잘못된 설정:

```json
// project.entity.json
{
  "props": [
    { "name": "files", "type": "relation", "with": "File",
      "relationType": "HasMany", "joinColumn": "entity_id" }
  ]
}

// file.entity.json - entity_id 컬럼 없음
{
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "url", "type": "string" }
  ]
}
```

에러 발생:

```
column files.entity_id does not exist
```

올바른 설정:

```json
// file.entity.json - entity_id 컬럼 추가
{
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "entity_id", "type": "integer", "desc": "엔티티 ID" },
    { "name": "url", "type": "string" }
  ]
}
```

주의사항:

- joinColumn은 자식 테이블의 실제 컬럼명
- 자식 엔티티에 해당 컬럼이 반드시 존재해야 함
- subset에도 포함시켜야 조회 가능

### 9. better-auth 플러그인 통합

#### PluginSchema 타입 매핑

better-auth 플러그인은 PluginSchema 타입으로 스키마를 정의합니다. camelCase 필드명이 자동으로 snake_case DB 컬럼명으로 매핑됩니다:

```typescript
// better-auth 플러그인 스키마 예시
const schema = {
  user: {
    fields: {
      phoneNumber: {
        // camelCase
        type: "string",
        required: false,
      },
    },
  },
};

// DB에는 phone_number로 저장됨 (snake_case)
```

Sonamu Entity에서는 DB 컬럼명(snake_case)을 그대로 사용:

```json
// user.entity.json
{
  "props": [
    {
      "name": "phone_number",
      "type": "string",
      "nullable": true,
      "desc": "전화번호"
    }
  ]
}
```

#### 플러그인 카테고리

| 카테고리     | 플러그인                                                    | 영향                                     |
| ------------ | ----------------------------------------------------------- | ---------------------------------------- |
| 기본 인증    | email/password, OAuth, magic link, email OTP, multi-session | User/Session/Account/Verification 테이블 |
| 사용자 확장  | username, phone number, admin, anonymous                    | User 테이블 필드 추가                    |
| 보안         | two-factor, passkey                                         | 새 테이블 필요 (TwoFactor, Passkey)      |
| 엔터프라이즈 | organization, API key, SSO, JWT                             | 새 테이블 필요 (Organization, Member 등) |

#### 스키마 요구사항별 분류

**기존 테이블 확장만 필요 (User/Session에 필드 추가)**: username, phone number, admin, anonymous, multi-session

**새 테이블 필요**: OAuth(Account), magic link/email OTP(Verification), two-factor(TwoFactor), passkey(Passkey), organization(Organization, Member, Invitation), API key(APIKey), SSO(SAMLProvider, SAMLConnection)

#### Entity 작성 패턴

**기존 테이블 확장** — User entity.json에 플러그인 필드 추가:

```json
// user.entity.json - 플러그인별 추가 필드 예시
// phone-number: phone_number(nullable), phone_number_verified(boolean, dbDefault:"false")
// admin: role(enum, dbDefault:"'user'"), banned(nullable), ban_reason(nullable), ban_expires(nullable)
// username: username(string)
// anonymous: is_anonymous(boolean, dbDefault:"false")
```

**새 테이블 생성** — Account/TwoFactor 등: `pnpm sonamu stub entity`로 생성 후 플러그인 스키마에 맞는 필드 추가. 주요 주의사항:

- `id`는 `string` 타입 (32자 alphanumeric)
- FK(`user_id`)도 `string` 타입 (User.id가 string이므로)
- `nullable` 필드는 반드시 `"nullable": true` 명시
- better-auth의 camelCase → Sonamu는 snake_case 사용

#### Migration 패턴

**기존 테이블 필드 추가** — `alterTable`로 플러그인 필드 추가:

```typescript
await knex.schema.alterTable("users", (table) => {
  table.string("phone_number", 255).nullable();
  table.boolean("phone_number_verified").defaultTo(false);
  table.text("role").notNullable().defaultTo("user");
});
```

**새 테이블 생성** — FK 없이 먼저 생성, 이후 FK 추가 (분리 필수!):

```typescript
// 1단계: 테이블 생성 (FK 없이)
await knex.schema.createTable("two_factors", (table) => {
  table.text("id").primary();
  table.text("user_id").notNullable(); // FK 컬럼만, foreign() 없이
  table.text("secret").notNullable();
});
// 2단계: FK 추가
await knex.schema.alterTable("two_factors", (table) => {
  table.foreign("user_id").references("users.id");
});
```

#### Sonamu 구현 예시

현재 Sonamu에서 구현된 플러그인:

- phone-number 플러그인: User.phone_number, User.phone_number_verified
- two-factor 플러그인: TwoFactor 테이블 (id, secret, backup_codes, user_id)

참조 경로:

- 예제 프로젝트: `sonamu/examples/miomock/`
- User Entity: `examples/miomock/api/src/application/user/user.entity.json`
- TwoFactor Entity: `examples/miomock/api/src/application/two_factor/two_factor.entity.json`

#### 플러그인 추가 순서

1. Entity 작성: `{entity}.entity.json`에 필드 정의
2. Migration 생성: Sonamu UI에서 자동 생성 또는 수동 작성
3. SaveParams 수정: nullable 필드는 모두 partial 처리
4. Model 작성: 비즈니스 로직 구현
5. test-helpers 수정: userId 등 타입이 변경된 파라미터 수정
6. 테스트 작성: 각 provider/플러그인별 테스트 케이스 작성

#### 플러그인별 주의사항

- **OAuth**: provider별로 다른 필드 사용. SaveParams에서 access_token/refresh_token/password 모두 optional
- **two-factor**: backup_codes는 JSON 문자열, secret은 TOTP 라이브러리로 생성
- **organization**: 3개 테이블 FK 관계. Migration 순서: Organization → Member, Invitation
- **passkey**: public_key는 WebAuthn 표준, counter는 replay 방지용
- **SSO**: metadata_url에서 IdP 메타데이터 자동 로드

## Common Mistakes

### 실수 1: Migration을 순서대로 개별 적용

```bash
# 잘못된 방법
pnpm migration:apply  # accounts.user_id 변경이 먼저 실행되어 실패
```

이유: accounts.user_id를 text로 변경하려 할 때 users.id는 아직 integer이므로 FK constraint 위반

올바른 방법: 하나의 migration에서 모든 변경 처리

### 실수 2: test-helpers 타입 미수정

```typescript
// User.id가 string인데 헬퍼 함수는 number 반환
async function createTestUser(): Promise<number> { ... }

// 사용 시 타입 에러
const userId = await createTestUser();  // string을 number에 할당 불가
await createTestProjectParticipant(projectId, userId);
```

수정 필요:

- createTestUser 반환 타입: string
- userId를 받는 모든 헬퍼 함수 파라미터: string

### 실수 3: HasMany joinColumn 누락

```json
// Parent
{ "name": "files", "relationType": "HasMany", "joinColumn": "entity_id" }

// Child에 entity_id 없으면 에러
```

에러 메시지: `column files.entity_id does not exist`

해결: Child 엔티티에 joinColumn에 지정한 컬럼 추가

### 실수 4: SaveParams에 nullable 필드를 optional로 처리하지 않음

```typescript
// SaveParams에서 password를 optional로 안하면
await AccountModel.save([
  {
    provider_id: "google",
    // password 없으면 타입 에러
  },
]);
```

### 실수 5: 중복 migration 미정리

Entity 변경 후 generate하면 개별 migration + 통합 migration 둘 다 생성됨. 개별 migration들을 제거하지 않으면 순서대로 실행되어 FK constraint 위반

### 실수 6: PluginSchema 필드명을 Sonamu Entity에 그대로 사용

better-auth의 camelCase(`phoneNumber`)가 아닌 snake_case(`phone_number`)를 Sonamu Entity에서 사용해야 함. better-auth가 camelCase→snake_case 자동 변환.

### 실수 7: 새 테이블 생성 시 FK를 테이블 생성과 동시에 추가

테이블 생성과 FK 추가를 분리해야 함. 테이블 생성 시 `foreign()`을 함께 쓰면 참조 테이블이 아직 없을 수 있음. → 위 "Migration 패턴" 참조.

## Checklist

**Entity 수정:**

- [ ] User.id 타입을 string으로 변경
- [ ] User를 참조하는 모든 FK 엔티티 확인 (grep으로 검색)
- [ ] HasMany 관계가 있다면 joinColumn 컬럼이 자식 엔티티에 존재하는지 확인
- [ ] better-auth 플러그인별 필요한 필드 확인 (기존 테이블 확장 vs 새 테이블)

**Migration 작성:**

- [ ] 통합 migration 작성 (FK 제거 - 타입 변경 - FK 복구 순서)
- [ ] 중복 생성된 개별 migration 파일 삭제
- [ ] down 함수도 올바른 순서로 작성
- [ ] 새 테이블 생성 시 FK 순서 확인 (테이블 생성 → FK 추가)

**타입 정의:**

- [ ] SaveParams에 nullable 필드 모두 partial 처리
- [ ] SaveParams에 dbDefault 필드(created_at, updated_at) partial 처리
- [ ] test-helpers의 userId 관련 파라미터를 string으로 수정
- [ ] test-helpers의 반환 타입 수정 (Promise<String> -> Promise<string>)

**테스트 코드:**

- [ ] 테스트에서 불필요한 nullable 필드 제거
- [ ] OAuth 계정과 credential 계정 테스트 분리
- [ ] 각 provider에 맞는 필드만 제공
- [ ] 플러그인별 테스트 케이스 작성 (phone-number, two-factor 등)

**실행:**

- [ ] stub 재생성: `pnpm stub`
- [ ] Migration 생성: `pnpm generate`
- [ ] 중복 migration 정리
- [ ] Migration 적용: `pnpm migration:apply`
- [ ] 전체 테스트 실행: `pnpm test`

## Related Skills

- migration: Migration 작성 기본, PK 타입 변경
- entity-basic: Entity 타입 정의
- entity-relations: BelongsToOne, HasMany 관계
- testing: 테스트 작성 패턴
