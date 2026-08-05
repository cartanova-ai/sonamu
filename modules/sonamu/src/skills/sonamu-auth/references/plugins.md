# better-auth Plugins

Two halves that have to match: `auth generate --plugins <ids>` creates the schema, and a wrapper
function in `server.auth.plugins` turns the feature on. Generating without configuring leaves unused
tables; configuring without generating fails at the first query against a missing table or column.

`audit-log` is the exception on that second half — it swallows its own write failures, so it stays
silent instead of failing. See its section below.

## Supported plugins

| Plugin ID      | Wrapper            | Purpose                                               |
| -------------- | ------------------ | ----------------------------------------------------- |
| `admin`        | `admin()`          | Admin features, user ban/unban, session impersonation |
| `organization` | `organization()`   | Organization, team, member, and invitation management |
| `2fa`          | `twoFactor()`      | TOTP-based two-factor authentication                  |
| `username`     | `username()`       | Username-based authentication                         |
| `phone-number` | `phoneNumber()`    | Phone number authentication                           |
| `api-key`      | `apiKey()`         | API key issuance/management, rate limiting            |
| `jwt`          | `jwt()`            | JWT tokens + JWKS key management                      |
| `passkey`      | `passkey()`        | WebAuthn/Passkey authentication                       |
| `sso`          | `sso()`            | OIDC/SAML SSO integration                             |
| `anonymous`    | `anonymous()`      | Anonymous user support                                |
| `audit-log`    | `sonamuAuditLog()` | Appends auth events to an `audit_events` table        |

Nothing here needs an extra install. `api-key`, `passkey`, and `sso` live in their own
`@better-auth/*` packages upstream, but Sonamu depends on all three directly, so the wrappers resolve
from a plain `sonamu` install.

`audit-log` is the one that breaks the pattern: its wrapper is Sonamu's own rather than a wrapped
better-auth plugin, because the ingestion into `audit_events` is Sonamu's.

## What a plugin contributes

Each per-plugin section below is written in terms of three kinds of contribution, echoed under a
`[PLUGIN] <Name>` header when the id is passed to `auth generate --plugins`:

| Kind                | Effect                                     | Output line |
| ------------------- | ------------------------------------------ | ----------- |
| `entities`          | New tables of its own                      | `[CREATED]` |
| `additionalProps`   | Fields on entities that already exist      | `[ADD PROP]` |
| `additionalIndexes` | Indexes on entities that already exist     | `[ADD INDEX]` |

## Wrapper usage (sonamu.config.ts)

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

What matters is the Sonamu wrapper, not the specifier — the wrappers are re-exported from the package
root too, so `sonamu` and `sonamu/auth/plugins` are equivalent. `sonamuAuditLog` is root-only.

```typescript
// WRONG - upstream plugin, snake_case mapping not applied
import { admin } from "better-auth/plugins";

// CORRECT - either of these
import { admin } from "sonamu/auth/plugins";
import { admin, sonamuAuditLog } from "sonamu";
```

The wrapper is what applies the snake_case column mapping. The upstream import compiles and runs, but
reads camelCase columns the generated schema does not have.

## Per-Plugin Details

### admin

Additional entities: None
Fields added to User: `role`, `banned`, `ban_reason`, `ban_expires`
Fields added to Session: `impersonated_by`

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

Additional entities: Organization, Member, Invitation, Team, TeamMember
Fields added to Session: `active_organization_id`, `active_team_id`

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

Additional entities: TwoFactor
Fields added to User: `two_factor_enabled`

```typescript
import { twoFactor } from "sonamu/auth/plugins";

twoFactor();
```

Schema mapping:

- User: `twoFactorEnabled` → `two_factor_enabled`
- TwoFactor: `userId` → `user_id`, `backupCodes` → `backup_codes`

### username

Fields added to User: `username`, `display_username`
Indexes added to User: `users_username_unique`

`username` is the lookup column and `display_username` preserves the casing the user typed.

```typescript
import { username } from "sonamu/auth/plugins";

username();
```

Schema mapping:

- `displayUsername` → `display_username`

### phone-number

Fields added to User: `phone_number`, `phone_number_verified`
Indexes added to User: `users_phone_number_unique`

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

Additional entities: ApiKey (table: `api_keys`)

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

Note: `userId` became `referenceId` in v1.5.0. It is a polymorphic id — it points at a user or an
organization, so it carries no FK.

### jwt

Additional entities: Jwks (table: `jwks`)

```typescript
import { jwt } from "sonamu/auth/plugins";

jwt();
```

Schema mapping:

- `publicKey` → `public_key`, `privateKey` → `private_key`
- `createdAt` → `created_at`, `expiresAt` → `expires_at`

### passkey

Additional entities: Passkey (table: `passkeys`)

```typescript
import { passkey } from "sonamu/auth/plugins";

passkey({ rpID: "localhost", rpName: "My App" });
```

Schema mapping:

- `publicKey` → `public_key`, `userId` → `user_id`, `credentialID` → `credential_id`
- `deviceType` → `device_type`, `backedUp` → `backed_up`, `createdAt` → `created_at`

### sso

Additional entities: SsoProvider (table: `sso_providers`)

```typescript
import { sso } from "sonamu/auth/plugins";

sso();
```

Schema mapping:

- `oidcConfig` → `oidc_config`, `samlConfig` → `saml_config`
- `userId` → `user_id`, `providerId` → `provider_id`, `organizationId` → `organization_id`

### anonymous

Fields added to User: `is_anonymous`

```typescript
import { anonymous } from "sonamu/auth/plugins";

anonymous();
```

Schema mapping:

- `isAnonymous` → `is_anonymous`

### audit-log

Additional entities: AuditEvent (table: `audit_events`)

```typescript
import { sonamuAuditLog } from "sonamu";

sonamuAuditLog();
```

Takes no options, and the wrapper is Sonamu's own — there is no upstream plugin to confuse it with,
and no schema mapping, because the entity is declared in snake_case from the start.

Once registered, it hooks better-auth's user, session, account, verification, and organization events
and writes one row per event. Columns of note:

| Column                                    | What it holds                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `category`                                | enum `AuditEventCategory` — user, session, account, verification, organization, security |
| `event_type`, `event_key`                 | the better-auth event that fired                                                 |
| `actor_user_id`, `subject_user_id`        | who acted, and who it happened to — both nullable, both plain strings with no FK  |
| `dedupe_key`                              | sha256 of the event identity, `audit_events_dedupe_key_unique`                    |
| `payload_json`                            | the original event body, typed `AuditEventPayload`                               |
| `occurred_at` / `ingested_at`             | when the event happened vs. when the row was written                             |

Unlike every other entity here, `id` is an `integer` — the rows are Sonamu's, not better-auth's.

Two behaviors that produce no error:

- The insert is `ON CONFLICT (dedupe_key) DO NOTHING`, so a replayed event is dropped silently.
- An ingest failure is caught and logged, never thrown. Registering the wrapper without running
  `auth generate --plugins audit-log` first leaves auth working normally while every event is lost to
  a log line. An empty `audit_events` is the symptom to check.

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

## Steps After Adding a Plugin

1. `pnpm sonamu auth generate --plugins <full plugin list>` — pass every plugin you use, not just the
   new one. The command is additive, so omitting one does not remove it, but listing all of them
   keeps the command reproducible.
2. Migrate.
3. Add the wrapper to `server.auth.plugins`.

Changing `User.id` to a string PK on an existing integer schema is its own procedure — the
`sonamu-migration` skill covers it.
