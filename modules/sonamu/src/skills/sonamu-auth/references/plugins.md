# better-auth Plugin Guide

Sonamu wraps better-auth plugins with snake_case schema mapping.
Use the `auth generate --plugins` command to auto-generate plugin entities.

**Source code:**

- Wrappers: `modules/sonamu/src/auth/plugins/wrappers/`
- Entity definitions: `modules/sonamu/src/auth/plugins/entity-definitions/`
- Generator: `modules/sonamu/src/auth/auth-generator.ts`

---

## Supported Plugins

| Plugin ID      | Wrapper function | Package                 | Purpose                                               |
| -------------- | ---------------- | ----------------------- | ----------------------------------------------------- |
| `admin`        | `admin()`        | `better-auth/plugins`   | Admin features, user ban/unban, session impersonation |
| `organization` | `organization()` | `better-auth/plugins`   | Organization, team, member, and invitation management |
| `2fa`          | `twoFactor()`    | `better-auth/plugins`   | TOTP-based two-factor authentication                  |
| `username`     | `username()`     | `better-auth/plugins`   | Username-based authentication                         |
| `phone-number` | `phoneNumber()`  | `better-auth/plugins`   | Phone number authentication                           |
| `api-key`      | `apiKey()`       | `@better-auth/api-key`  | API key issuance/management, rate limiting            |
| `jwt`          | `jwt()`          | `better-auth/plugins`   | JWT tokens + JWKS key management                      |
| `passkey`      | `passkey()`      | `@better-auth/passkey`  | WebAuthn/Passkey authentication                       |
| `sso`          | `sso()`          | `@better-auth/sso`      | OIDC/SAML SSO integration                             |
| `anonymous`    | `anonymous()`    | `better-auth/plugins`   | Anonymous user support                                |

---

## CLI Usage

```bash
# Base entities only (User, Session, Account, Verification)
pnpm sonamu auth generate

# With plugins
pnpm sonamu auth generate --plugins admin,organization

# Multiple plugins
pnpm sonamu auth generate --plugins admin,2fa,phone-number,username
```

### How It Works

1. **Base entities** are created/updated (User, Session, Account, Verification)
2. **Per-plugin** processing:
   - `entities`: creates new tables (e.g. Organization → organizations, members, invitations, teams, team_members)
   - `additionalProps`: adds fields to existing entities (e.g. admin → adds ban_reason, ban_expires to User)
   - `additionalIndexes`: adds indexes to existing entities
3. Entities that already exist have **only missing fields added**; existing fields are preserved

---

## Wrapper Usage (sonamu.config.ts)

Using Sonamu wrappers automatically applies snake_case schema mapping.

```typescript
// sonamu.config.ts
import { admin, organization, twoFactor, username } from "sonamu/auth/plugins";

export default defineConfig({
  server: {
    auth: {
      emailAndPassword: { enabled: true },
      plugins: [admin(), organization(), twoFactor(), username()],
    },
  },
});
```

**CRITICAL: Do not import directly from `better-auth/plugins`.** You must go through the Sonamu wrapper for snake_case mapping to apply.

```typescript
// WRONG - snake_case mapping not applied
import { admin } from "better-auth/plugins";

// CORRECT - Sonamu wrapper
import { admin } from "sonamu/auth/plugins";
```

---

## Per-Plugin Details

### admin

**Additional entities:** None
**Fields added to User:** `role`, `banned`, `ban_reason`, `ban_expires`
**Fields added to Session:** `impersonated_by`

```typescript
import { admin } from "sonamu/auth/plugins";

// Basic usage
admin();

// Customize options (schema mapping is automatically merged)
admin({ defaultRole: "user" });
```

Schema mapping:

- `banReason` → `ban_reason`
- `banExpires` → `ban_expires`
- `impersonatedBy` → `impersonated_by`

### organization

**Additional entities:** Organization, Member, Invitation, Team, TeamMember
**Fields added to Session:** `active_organization_id`, `active_team_id`

```typescript
import { organization } from "sonamu/auth/plugins";

organization();
```

Schema mapping:

- All tables: `createdAt` → `created_at`
- Member: `userId` → `user_id`, `organizationId` → `organization_id`
- Invitation: `inviterId` → `inviter_id`, `organizationId` → `organization_id`, `teamId` → `team_id`, `expiresAt` → `expires_at`
- Team: `organizationId` → `organization_id`, `updatedAt` → `updated_at`
- TeamMember: `teamId` → `team_id`, `userId` → `user_id`
- Session: `activeOrganizationId` → `active_organization_id`, `activeTeamId` → `active_team_id`

### 2fa (twoFactor)

**Additional entities:** TwoFactor
**Fields added to User:** `two_factor_enabled`

```typescript
import { twoFactor } from "sonamu/auth/plugins";

twoFactor();
```

Schema mapping:

- User: `twoFactorEnabled` → `two_factor_enabled`
- TwoFactor: `userId` → `user_id`, `backupCodes` → `backup_codes`

### username

**Fields added to User:** `display_username`

```typescript
import { username } from "sonamu/auth/plugins";

username();
```

Schema mapping:

- `displayUsername` → `display_username`

### phone-number

**Fields added to User:** `phone_number`, `phone_number_verified`

```typescript
import { phoneNumber } from "sonamu/auth/plugins";

phoneNumber({
  sendOTP: async ({ phoneNumber, otp }) => {
    /* send SMS */
  },
});
```

Schema mapping:

- `phoneNumber` → `phone_number`
- `phoneNumberVerified` → `phone_number_verified`

### api-key

**Additional entities:** ApiKey (table: `api_keys`)
**Package:** `@better-auth/api-key` (must be installed separately)

```bash
pnpm add @better-auth/api-key
```

```typescript
import { apiKey } from "sonamu/auth/plugins";

apiKey();
```

Schema mapping:

- `referenceId` → `reference_id`, `configId` → `config_id`
- `lastRequest` → `last_request`, `requestCount` → `request_count`
- `rateLimitEnabled` → `rate_limit_enabled`, `rateLimitTimeWindow` → `rate_limit_time_window`
- `rateLimitMax` → `rate_limit_max`, `refillInterval` → `refill_interval`
- `refillAmount` → `refill_amount`, `lastRefillAt` → `last_refill_at`
- `expiresAt` → `expires_at`, `createdAt` → `created_at`, `updatedAt` → `updated_at`

Note: v1.5.0에서 `userId`가 `referenceId`로 변경됨. `referenceId`는 user 또는 organization을 참조하는 polymorphic ID.

### jwt

**Additional entities:** Jwks (table: `jwks`)

```typescript
import { jwt } from "sonamu/auth/plugins";

jwt();
```

Schema mapping:

- `publicKey` → `public_key`, `privateKey` → `private_key`
- `createdAt` → `created_at`, `expiresAt` → `expires_at`

### passkey

**Additional entities:** Passkey (table: `passkeys`)
**Package:** `@better-auth/passkey` (must be installed separately)

```bash
pnpm add @better-auth/passkey
```

```typescript
import { passkey } from "sonamu/auth/plugins";

passkey({ rpID: "localhost", rpName: "My App" });
```

Schema mapping:

- `publicKey` → `public_key`, `userId` → `user_id`, `credentialID` → `credential_id`
- `deviceType` → `device_type`, `backedUp` → `backed_up`, `createdAt` → `created_at`

### sso

**Package:** `@better-auth/sso` (must be installed separately)

```bash
pnpm add @better-auth/sso
```

```typescript
import { sso } from "sonamu/auth/plugins";

sso();
```

Table: `sso_providers`
Schema mapping:

- `oidcConfig` → `oidc_config`, `samlConfig` → `saml_config`
- `userId` → `user_id`, `providerId` → `provider_id`, `organizationId` → `organization_id`

### anonymous

**Fields added to User:** `is_anonymous`

```typescript
import { anonymous } from "sonamu/auth/plugins";

anonymous();
```

Schema mapping:

- `isAnonymous` → `is_anonymous`

---

## Custom Schema Options

Passing additional options to a wrapper function automatically merges them with Sonamu's default mapping:

```typescript
admin({
  defaultRole: "user",
  schema: {
    user: {
      fields: {
        customField: "custom_field", // additional mapping
      },
    },
  },
});
```

Internally, `merge(ADMIN_SCHEMA, options.schema)` is executed to preserve the Sonamu mapping.

---

## Steps After Adding a Plugin

1. `pnpm sonamu auth generate --plugins <plugin list>`
2. Confirm generated entities in Sonamu UI
3. Run migration with `pnpm sonamu migrate run`
4. Add wrapper functions to `sonamu.config.ts`
5. If needed, add plugin-specific permission logic to `guardHandler`

---

## References

- **Basic auth configuration:** `sonamu-auth`
- **Changing PK type (better-auth → string PK):** `references/user-id-migration.md`
- **Source code:** `modules/sonamu/src/auth/plugins/`
