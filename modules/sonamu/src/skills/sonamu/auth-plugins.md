---
name: sonamu-auth-plugins
description: better-auth 플러그인 래퍼 및 엔티티 자동 생성. Sonamu snake_case 스키마 매핑 포함. Use when adding auth plugins like admin, organization, 2fa, passkey, phone-number, jwt, api-key, sso, username, anonymous.
---

# better-auth 플러그인 가이드

Sonamu는 better-auth 플러그인을 snake_case 스키마 매핑과 함께 래핑하여 제공합니다.
`auth generate --plugins` 명령어로 플러그인 엔티티를 자동 생성할 수 있습니다.

**소스코드:**
- 래퍼: `modules/sonamu/src/auth/plugins/wrappers/`
- 엔티티 정의: `modules/sonamu/src/auth/plugins/entity-definitions/`
- 생성기: `modules/sonamu/src/auth/auth-generator.ts`

---

## 지원 플러그인

| 플러그인 ID | 래퍼 함수 | 패키지 | 용도 |
|------------|----------|--------|------|
| `admin` | `admin()` | `better-auth/plugins` | 관리자 기능, 사용자 밴/언밴, 세션 impersonation |
| `organization` | `organization()` | `better-auth/plugins` | 조직, 팀, 멤버, 초대 관리 |
| `2fa` | `twoFactor()` | `better-auth/plugins` | TOTP 기반 2단계 인증 |
| `username` | `username()` | `better-auth/plugins` | 사용자명 기반 인증 |
| `phone-number` | `phoneNumber()` | `better-auth/plugins` | 전화번호 인증 |
| `api-key` | `apiKey()` | `better-auth/plugins` | API 키 발급/관리, Rate Limit |
| `jwt` | `jwt()` | `better-auth/plugins` | JWT 토큰 + JWKS 키 관리 |
| `passkey` | `passkey()` | `@better-auth/passkey` | WebAuthn/Passkey 인증 |
| `sso` | `sso()` | `@better-auth/sso` | OIDC/SAML SSO 연동 |
| `anonymous` | `anonymous()` | `better-auth/plugins` | 익명 사용자 지원 |

---

## CLI 사용법

```bash
# 기본 엔티티만 (User, Session, Account, Verification)
pnpm sonamu auth generate

# 플러그인 포함
pnpm sonamu auth generate --plugins admin,organization

# 여러 플러그인
pnpm sonamu auth generate --plugins admin,2fa,phone-number,username
```

### 동작 방식

1. **기본 엔티티** 생성/업데이트 (User, Session, Account, Verification)
2. **플러그인별** 처리:
   - `entities`: 새 테이블 생성 (예: Organization → organizations, members, invitations, teams, team_members)
   - `additionalProps`: 기존 엔티티에 필드 추가 (예: admin → User에 ban_reason, ban_expires 추가)
   - `additionalIndexes`: 기존 엔티티에 인덱스 추가
3. 이미 존재하는 엔티티는 **누락된 필드만 추가**, 기존 필드 보존

---

## 래퍼 사용법 (sonamu.config.ts)

Sonamu 래퍼를 사용하면 snake_case 스키마 매핑이 자동 적용됩니다.

```typescript
// sonamu.config.ts
import { admin, organization, twoFactor, username } from "sonamu/auth/plugins";

export default defineConfig({
  server: {
    auth: {
      emailAndPassword: { enabled: true },
      plugins: [
        admin(),
        organization(),
        twoFactor(),
        username(),
      ],
    },
  },
});
```

**CRITICAL: `better-auth/plugins`에서 직접 import하지 마세요.** Sonamu 래퍼를 거쳐야 snake_case 매핑이 적용됩니다.

```typescript
// WRONG - snake_case 매핑 안 됨
import { admin } from "better-auth/plugins";

// CORRECT - Sonamu 래퍼
import { admin } from "sonamu/auth/plugins";
```

---

## 플러그인별 상세

### admin

**추가 엔티티:** 없음
**User에 추가되는 필드:** `role`, `banned`, `ban_reason`, `ban_expires`
**Session에 추가되는 필드:** `impersonated_by`

```typescript
import { admin } from "sonamu/auth/plugins";

// 기본 사용
admin()

// 옵션 커스터마이즈 (스키마 매핑은 자동 병합)
admin({ defaultRole: "user" })
```

스키마 매핑:
- `banReason` → `ban_reason`
- `banExpires` → `ban_expires`
- `impersonatedBy` → `impersonated_by`

### organization

**추가 엔티티:** Organization, Member, Invitation, Team, TeamMember
**Session에 추가되는 필드:** `active_organization_id`, `active_team_id`

```typescript
import { organization } from "sonamu/auth/plugins";

organization()
```

스키마 매핑:
- 모든 테이블: `createdAt` → `created_at`
- Member: `userId` → `user_id`, `organizationId` → `organization_id`
- Invitation: `inviterId` → `inviter_id`, `organizationId` → `organization_id`, `teamId` → `team_id`, `expiresAt` → `expires_at`
- Team: `organizationId` → `organization_id`, `updatedAt` → `updated_at`
- TeamMember: `teamId` → `team_id`, `userId` → `user_id`
- Session: `activeOrganizationId` → `active_organization_id`, `activeTeamId` → `active_team_id`

### 2fa (twoFactor)

**추가 엔티티:** TwoFactor
**User에 추가되는 필드:** `two_factor_enabled`

```typescript
import { twoFactor } from "sonamu/auth/plugins";

twoFactor()
```

스키마 매핑:
- User: `twoFactorEnabled` → `two_factor_enabled`
- TwoFactor: `userId` → `user_id`, `backupCodes` → `backup_codes`

### username

**User에 추가되는 필드:** `display_username`

```typescript
import { username } from "sonamu/auth/plugins";

username()
```

스키마 매핑:
- `displayUsername` → `display_username`

### phone-number

**User에 추가되는 필드:** `phone_number`, `phone_number_verified`

```typescript
import { phoneNumber } from "sonamu/auth/plugins";

phoneNumber({ sendOTP: async ({ phoneNumber, otp }) => { /* SMS 발송 */ } })
```

스키마 매핑:
- `phoneNumber` → `phone_number`
- `phoneNumberVerified` → `phone_number_verified`

### api-key

**추가 엔티티:** ApiKey (테이블: `api_keys`)

```typescript
import { apiKey } from "sonamu/auth/plugins";

apiKey()
```

스키마 매핑:
- `userId` → `user_id`, `lastRequest` → `last_request`, `requestCount` → `request_count`
- `rateLimitEnabled` → `rate_limit_enabled`, `rateLimitTimeWindow` → `rate_limit_time_window`
- `rateLimitMax` → `rate_limit_max`, `refillInterval` → `refill_interval`
- `refillAmount` → `refill_amount`, `lastRefillAt` → `last_refill_at`
- `expiresAt` → `expires_at`, `createdAt` → `created_at`, `updatedAt` → `updated_at`

### jwt

**추가 엔티티:** Jwks (테이블: `jwks`)

```typescript
import { jwt } from "sonamu/auth/plugins";

jwt()
```

스키마 매핑:
- `publicKey` → `public_key`, `privateKey` → `private_key`
- `createdAt` → `created_at`, `expiresAt` → `expires_at`

### passkey

**추가 엔티티:** Passkey (테이블: `passkeys`)
**패키지:** `@better-auth/passkey` (별도 설치 필요)

```bash
pnpm add @better-auth/passkey
```

```typescript
import { passkey } from "sonamu/auth/plugins";

passkey({ rpID: "localhost", rpName: "My App" })
```

스키마 매핑:
- `publicKey` → `public_key`, `userId` → `user_id`, `credentialID` → `credential_id`
- `deviceType` → `device_type`, `backedUp` → `backed_up`, `createdAt` → `created_at`

### sso

**패키지:** `@better-auth/sso` (별도 설치 필요)

```bash
pnpm add @better-auth/sso
```

```typescript
import { sso } from "sonamu/auth/plugins";

sso()
```

테이블: `sso_providers`
스키마 매핑:
- `oidcConfig` → `oidc_config`, `samlConfig` → `saml_config`
- `userId` → `user_id`, `providerId` → `provider_id`, `organizationId` → `organization_id`

### anonymous

**User에 추가되는 필드:** `is_anonymous`

```typescript
import { anonymous } from "sonamu/auth/plugins";

anonymous()
```

스키마 매핑:
- `isAnonymous` → `is_anonymous`

---

## 커스텀 스키마 옵션

래퍼 함수에 추가 옵션을 전달하면 Sonamu 기본 매핑과 자동 병합됩니다:

```typescript
admin({
  defaultRole: "user",
  schema: {
    user: {
      fields: {
        customField: "custom_field",  // 추가 매핑
      },
    },
  },
})
```

내부적으로 `merge(ADMIN_SCHEMA, options.schema)`가 실행되어 Sonamu 매핑이 보존됩니다.

---

## 플러그인 추가 후 작업 순서

1. `pnpm sonamu auth generate --plugins <플러그인 목록>`
2. Sonamu UI에서 생성된 엔티티 확인
3. `pnpm sonamu migrate run`으로 마이그레이션 실행
4. `sonamu.config.ts`에 래퍼 함수 추가
5. 필요시 `guardHandler`에 플러그인별 권한 로직 추가

---

## 참고

- **기본 인증 설정:** `auth.md`
- **PK 타입 변경 (better-auth → string PK):** `auth-migration.md`
- **소스코드:** `modules/sonamu/src/auth/plugins/`
