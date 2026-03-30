---
name: sonamu-auth
description: Sonamu better-auth 인증 시스템. 엔티티 자동 생성, Guards 설정, Context 접근. Use when setting up authentication or implementing auth-related features.
---

# better-auth 인증 시스템

> 이 문서는 실제 Sonamu 소스코드를 기반으로 작성되었습니다.

## 엔티티 자동 생성

**소스코드:**
- CLI: `modules/sonamu/src/bin/cli.ts` (auth_generate 함수)
- 생성 로직: `modules/sonamu/src/auth/auth-generator.ts`
- 엔티티 정의: `modules/sonamu/src/auth/better-auth-entities.ts`

**IMPORTANT: generate 실행 전에 반드시 사용자에게 플러그인 사용 여부를 확인해야 합니다.**

플러그인 선택은 generate 시점에 함께 이루어지며, 나중에 추가도 가능하지만 처음부터 명시하는 것이 좋습니다.
지원 플러그인 목록과 용도는 `auth-plugins.md`를 참고하세요.

### 플러그인 확인 흐름

**[Step 1] generate 전 확인 (필수)**

> "어떤 인증 방식을 사용할 계획인가요? 기본 이메일/소셜 로그인 외에 추가 플러그인이 필요한지 확인해 주세요.
> 지원 플러그인: `admin`, `organization`, `2fa`, `username`, `phone-number`, `api-key`, `jwt`, `passkey`, `sso`, `anonymous`"

**[Step 1-A] 사용자가 "나중에 하겠다"고 응답한 경우:**

아래 안내를 제공한 후 플러그인 없이 generate를 진행합니다:

> "알겠습니다. 플러그인은 초기 마이그레이션 실행 전까지 추가하는 것이 가장 좋습니다.
> 마이그레이션 전에 다시 확인드리겠습니다."

그리고 **`plugins_deferred: true`** 상태를 기억합니다.

**[Step 2] migrate run 직전 재확인 (CRITICAL — `plugins_deferred: true`인 경우 반드시 실행)**

마이그레이션을 실행하기 전, 반드시 다시 확인합니다:

> "마이그레이션 실행 전입니다. 지금이 플러그인을 추가하기 가장 좋은 시점입니다.
> 추가할 플러그인이 있으면 알려주세요. 없으면 그대로 진행합니다.
> 지원 플러그인: `admin`, `organization`, `2fa`, `username`, `phone-number`, `api-key`, `jwt`, `passkey`, `sso`, `anonymous`"

- 플러그인 추가 시: `pnpm sonamu auth generate --plugins <목록>` 실행 후 migrate 진행
- 없으면: migrate 그대로 진행

```bash
# 플러그인 없이 기본 엔티티만
pnpm sonamu auth generate

# 플러그인 포함
pnpm sonamu auth generate --plugins admin,2fa,username
```

생성되는 4개 엔티티 (`betterAuthV1` 배열):

| 엔티티 | 테이블 | 주요 필드 |
|--------|--------|-----------|
| User | users | id, name, email, email_verified, image |
| Session | sessions | id, token, expires_at, user_id |
| Account | accounts | id, provider_id, access_token, user_id |
| Verification | verifications | id, identifier, value, expires_at |

**동작 방식:**
- 엔티티가 없으면 새로 생성
- 기존 엔티티가 있으면 누락된 필드만 추가
- 타입이 변경된 필드는 자동 업데이트
- snake_case 컬럼명 사용 (better-auth는 camelCase)

## 필드 매핑 (자동 적용)

**소스코드:** `modules/sonamu/src/auth/better-auth-entities.ts` (BASE_FIELD_MAPPINGS)

| better-auth | Sonamu |
|-------------|--------|
| `emailVerified` | `email_verified` |
| `createdAt` | `created_at` |
| `userId` | `user_id` |
| `expiresAt` | `expires_at` |

## Config 설정

**소스코드:** `modules/sonamu/src/api/config.ts` (SonamuServerOptions.auth)

```typescript
// sonamu.config.ts
server: {
  auth: {
    emailAndPassword: { enabled: true },
    // 소셜 로그인 추가 시
    // socialProviders: {
    //   google: {
    //     clientId: process.env.GOOGLE_CLIENT_ID!,
    //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    //   },
    // },
  },
}
```

## API 엔드포인트 (자동 등록)

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/auth/sign-up/email` | POST | 회원가입 |
| `/api/auth/sign-in/email` | POST | 로그인 |
| `/api/auth/sign-out` | POST | 로그아웃 |
| `/api/auth/get-session` | GET | 세션 조회 |

## Context에서 user/session 접근

**소스코드:** `modules/sonamu/src/api/context.ts` (AuthContext 타입 정의)

```typescript
import { Sonamu } from "sonamu";

@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<UserSubsetA | null> {
  const { user, session } = Sonamu.getContext();
  
  if (!user) return null;
  
  // user.id, user.email, user.name 등 접근 가능
  return this.findById("A", user.id);
}
```

## Guards 활용

**소스코드:** `modules/sonamu/src/api/decorators.ts` (GuardKeys 인터페이스)

### 기본 제공 Guard

Sonamu는 3가지 기본 Guard를 제공합니다:
- `query`: 모든 사용자 허용 (비로그인 포함)
- `user`: 로그인한 사용자만 허용
- `admin`: 관리자 권한 사용자만 허용

```typescript
// 로그인 필수
@api({ httpMethod: "GET", guards: ["user"] })
async getProfile() {
  const { user } = Sonamu.getContext();
  return { userId: user.id };
}

// 관리자 권한 (User에 role 필드 추가 필요)
@api({ httpMethod: "DELETE", guards: ["admin"] })
async deleteUser(id: string) {
  // 관리자만 실행 가능
}
```

### 커스텀 Guard 추가

기본 Guard 외에 추가 권한이 필요한 경우, `src/typings/sonamu.d.ts`에서 `GuardKeys` 인터페이스를 확장합니다.

**파일 위치:** `src/typings/sonamu.d.ts`

```typescript
import {} from "sonamu";

declare module "sonamu" {
  export interface GuardKeys {
    query: true;
    user: true;
    admin: true;
    // 커스텀 Guard 추가
    manager: true;
    evaluator: true;
    superadmin: true;
  }
}
```

이제 추가한 Guard를 `@api` 데코레이터에서 사용할 수 있습니다:

```typescript
// 매니저 권한
@api({ httpMethod: "GET", guards: ["manager"] })
async getReports() {
  // 매니저만 실행 가능
}

// 여러 Guard 동시 허용
@api({ httpMethod: "POST", guards: ["admin", "manager"] })
async createReport() {
  // admin 또는 manager 권한 필요
}
```

## guardHandler 구현

**소스코드:** `modules/sonamu/src/api/config.ts` (SonamuFastifyConfig.guardHandler)

```typescript
import { Sonamu } from "sonamu";

// sonamu.config.ts
apiConfig: {
  guardHandler: (guard, request, api) => {
    const { user } = Sonamu.getContext();
    
    switch (guard) {
      case "user":
        if (!user) {
          throw new Error("로그인이 필요합니다");
        }
        break;
        
      case "admin":
        // User 엔티티에 role 필드 추가 필요
        if (!user || (user as any).role !== "admin") {
          throw new Error("관리자만 접근 가능합니다");
        }
        break;
      
      case "manager":
        // 커스텀 Guard: 매니저 권한
        if (!user || !["admin", "manager"].includes((user as any).role)) {
          throw new Error("매니저 권한이 필요합니다");
        }
        break;
      
      case "evaluator":
        // 커스텀 Guard: 평가위원 권한
        if (!user || !["admin", "evaluator"].includes((user as any).role)) {
          throw new Error("평가위원 권한이 필요합니다");
        }
        break;
        
      case "query":
        // 모든 사용자 허용
        break;
    }
  },
}
```

## User 엔티티에 role 추가 (권한 기반 인증)

**참고:** better-auth의 기본 User 엔티티(`modules/sonamu/src/auth/better-auth-entities.ts`)는 `role` 필드가 없습니다.

권한 기반 인증이 필요하면 User 엔티티에 직접 추가:

```json
// src/application/sonamu.entity.json
{
  "id": "User",
  "props": [
    // ... 기존 필드들
    {
      "name": "role",
      "type": "string",
      "default": "user",
      "desc": "사용자 역할 (user, admin, manager)"
    }
  ]
}
```

Enum 추가:

```json
{
  "enums": {
    "UserRole": {
      "user": "일반 사용자",
      "admin": "관리자",
      "manager": "매니저"
    }
  }
}
```

## 체크리스트

설정 후 확인 사항:
- [ ] **[generate 전] 사용자에게 플러그인 필요 여부 확인**
  - "나중에" 응답 시 → `plugins_deferred: true` 기억, 최적 시점 안내
- [ ] `pnpm sonamu auth generate [--plugins ...]` 실행
- [ ] **[migrate 전] `plugins_deferred: true`인 경우 플러그인 재확인** (CRITICAL)
- [ ] 마이그레이션 생성 및 적용
- [ ] `sonamu.config.ts`에 `server.auth` 설정
- [ ] `guardHandler` 구현
- [ ] Context에서 user/session 접근 확인
- [ ] 권한 기반 인증 필요 시 User 엔티티에 role 추가

## 참고

**Skills 문서:**
- 상세 설정: `config.md`의 "server.auth 상세" 섹션
- Context API: `api.md`의 "Context 접근" 섹션

**공식 문서:**
- 한글: `modules/docs/ko/api-development/authentication/setup.mdx`
- 영어: `modules/docs/en/api-development/authentication/setup.mdx`
