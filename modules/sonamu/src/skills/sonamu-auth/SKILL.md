---
name: sonamu-auth
description: Sets up better-auth in a Sonamu project. Use when running auth generate, applying Guards to an endpoint, reading the session from Context, adding an auth plugin, or migrating User.id to a string primary key. Covers the generated User/Account/Session/Verification entities, guard configuration, and the admin, organization, 2fa, and passkey plugin wrappers.
---

# better-auth Authentication System

Plugin wrappers (admin, organization, 2fa, passkey and 6 more, plus snake_case mapping):
see `references/plugins.md`.

Changing User.id to a string PK for external auth: see `references/user-id-migration.md`.

## Automatic Entity Generation

Source code: `modules/sonamu/src/bin/cli.ts` (auth_generate),
`modules/sonamu/src/auth/auth-generator.ts`, `modules/sonamu/src/auth/better-auth-entities.ts`.

### Plugin selection

Plugins are chosen at generate time: each one adds its own entities and fields, so the generated
schema — and therefore the migration — depends on the set passed to `--plugins`.

Supported: `admin`, `organization`, `2fa`, `username`, `phone-number`, `api-key`, `jwt`, `passkey`,
`sso`, `anonymous` (see `references/plugins.md` for what each adds).

Adding one later is a re-run of `auth generate` plus another migration — the command only adds
missing entities and fields, so it is not destructive. The cheap window is before the first migration
runs: until then a plugin costs nothing but a regenerate, after that each addition is a schema change
against live tables.

```bash
# Basic entities only, no plugins
pnpm sonamu auth generate

# With plugins
pnpm sonamu auth generate --plugins admin,2fa,username
```

The 4 entities generated (`betterAuthV1` array):

| Entity       | Table         | Key fields                             |
| ------------ | ------------- | -------------------------------------- |
| User         | users         | id, name, email, email_verified, image |
| Session      | sessions      | id, token, expires_at, user_id         |
| Account      | accounts      | id, provider_id, access_token, user_id |
| Verification | verifications | id, identifier, value, expires_at      |

How it works:

- If the entity does not exist, it is created fresh
- If the entity already exists, only missing fields are added
- Fields with changed types are updated automatically
- Uses snake_case column names (better-auth uses camelCase)

## Adding Fixture Companions (`auth add-companions`)

After running `auth generate`, run this command once to add `fixtureCompanions` to the `id` prop of better-auth entities (User, etc.).

```bash
pnpm sonamu auth add-companions
```

Purpose: Enables automatic Account fixture creation when generating User fixtures. Without this, fixture gen creates User records without a corresponding credentials Account, breaking auth-dependent tests.

What it does:
- Reads `fixtureCompanions` from the `betterAuthV1` definitions
- Adds them to the existing entity.json `id` prop's cone
- Skips if `fixtureCompanions` already exists

When to run: Once, after `auth generate`, before running `fixture gen` for the first time. Re-running is safe (idempotent).

## Field Mapping (Applied Automatically)

Source code: `modules/sonamu/src/auth/better-auth-entities.ts` (BASE_FIELD_MAPPINGS)

| better-auth     | Sonamu           |
| --------------- | ---------------- |
| `emailVerified` | `email_verified` |
| `createdAt`     | `created_at`     |
| `userId`        | `user_id`        |
| `expiresAt`     | `expires_at`     |

## Config Setup

Source code: `modules/sonamu/src/api/config.ts` (SonamuServerOptions.auth)

```typescript
// sonamu.config.ts
server: {
  auth: {
    emailAndPassword: { enabled: true },
    // To add social login:
    // socialProviders: {
    //   google: {
    //     clientId: process.env.GOOGLE_CLIENT_ID!,
    //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    //   },
    // },
  },
}
```

## API Endpoints (Auto-registered)

| Path                      | Method | Description |
| ------------------------- | ------ | ----------- |
| `/api/auth/sign-up/email` | POST   | Sign up     |
| `/api/auth/sign-in/email` | POST   | Sign in     |
| `/api/auth/sign-out`      | POST   | Sign out    |
| `/api/auth/get-session`   | GET    | Get session |

## Accessing user/session from Context

Source code: `modules/sonamu/src/api/context.ts` (AuthContext type definition)

```typescript
import { Sonamu } from "sonamu";

@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<UserSubsetA | null> {
  const { user, session } = Sonamu.getContext();

  if (!user) return null;

  // user.id, user.email, user.name, etc. are accessible
  return this.findById("A", user.id);
}
```

## Using Guards

Source code: `modules/sonamu/src/api/decorators.ts` (GuardKeys interface)

### Built-in Guards

Sonamu provides 3 default guards:

- `query`: allows all users (including unauthenticated)
- `user`: allows only authenticated users
- `admin`: allows only users with admin privileges

```typescript
// Login required
@api({ httpMethod: "GET", guards: ["user"] })
async getProfile() {
  const { user } = Sonamu.getContext();
  return { userId: user.id };
}

// Admin only (requires adding a role field to the User entity)
@api({ httpMethod: "DELETE", guards: ["admin"] })
async deleteUser(id: string) {
  // Only admins can execute
}
```

### Adding Custom Guards

If additional permissions beyond the default guards are needed, extend the `GuardKeys` interface in `src/typings/sonamu.d.ts`.

File location: `src/typings/sonamu.d.ts`

```typescript
import {} from "sonamu";

declare module "sonamu" {
  export interface GuardKeys {
    query: true;
    user: true;
    admin: true;
    // Custom guards
    manager: true;
    evaluator: true;
    superadmin: true;
  }
}
```

You can now use the added guards in the `@api` decorator:

```typescript
// Manager permission
@api({ httpMethod: "GET", guards: ["manager"] })
async getReports() {
  // Only managers can execute
}

// Allow multiple guards simultaneously
@api({ httpMethod: "POST", guards: ["admin", "manager"] })
async createReport() {
  // Requires admin or manager permission
}
```

## Implementing guardHandler

Source code: `modules/sonamu/src/api/config.ts` (SonamuFastifyConfig.guardHandler)

```typescript
import { Sonamu } from "sonamu";

// sonamu.config.ts
apiConfig: {
  guardHandler: (guard, request, api) => {
    const { user } = Sonamu.getContext();

    switch (guard) {
      case "user":
        if (!user) {
          throw new Error("Login is required");
        }
        break;

      case "admin":
        // Requires adding a role field to the User entity
        if (!user || (user as any).role !== "admin") {
          throw new Error("Only admins can access this");
        }
        break;

      case "manager":
        // Custom guard: manager permission
        if (!user || !["admin", "manager"].includes((user as any).role)) {
          throw new Error("Manager permission is required");
        }
        break;

      case "evaluator":
        // Custom guard: evaluator permission
        if (!user || !["admin", "evaluator"].includes((user as any).role)) {
          throw new Error("Evaluator permission is required");
        }
        break;

      case "query":
        // Allow all users
        break;
    }
  },
}
```

## Adding role to the User Entity (Role-based Authorization)

Note: The default User entity from better-auth (`modules/sonamu/src/auth/better-auth-entities.ts`) does not have a `role` field.

If role-based authorization is needed, add it directly to the User entity:

```json
// src/application/sonamu.entity.json
{
  "id": "User",
  "props": [
    // ... existing fields
    {
      "name": "role",
      "type": "string",
      "default": "user",
      "desc": "User role (user, admin, manager)"
    }
  ]
}
```

Adding an enum:

```json
{
  "enums": {
    "UserRole": {
      "user": "Regular user",
      "admin": "Administrator",
      "manager": "Manager"
    }
  }
}
```

## Checklist

After setup, verify:

- Plugin set settled — adding one after the first migration is a schema change, not a regenerate
- Run `pnpm sonamu auth generate [--plugins ...]`
- Create and apply migration
- Configure `server.auth` in `sonamu.config.ts`
- Implement `guardHandler`
- Confirm user/session access from Context
- Add role to User entity if role-based authorization is needed

## Reference

Skills documentation:

- Detailed configuration: "server.auth details" section in `sonamu-config`
- Context API: "Context access" section in `sonamu-api`

Official documentation:

- Korean: `modules/docs/ko/api-development/authentication/setup.mdx`
- English: `modules/docs/en/api-development/authentication/setup.mdx`
