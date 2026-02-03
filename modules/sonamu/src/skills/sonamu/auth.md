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

```bash
pnpm sonamu auth generate
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

**소스코드:** `modules/sonamu/src/auth/better-auth-entities.ts` (SONAMU_FIELD_MAPPINGS)

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

**소스코드:** `modules/sonamu/src/api/config.ts` (GuardKeys 타입)

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

## guardHandler 구현

**소스코드:** `modules/sonamu/src/api/config.ts` (SonamuFastifyConfig.guardHandler)

```typescript
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
- [ ] `pnpm sonamu auth generate` 실행
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
