---
name: sonamu-auth
description: Sonamu better-auth authentication system. Automatic entity generation, Guards configuration, Context access. Use when setting up authentication or implementing auth-related features.
---

# better-auth Authentication System

> This document is based on actual Sonamu source code.

## Automatic Entity Generation

**Source code:**

- CLI: `modules/sonamu/src/bin/cli.ts` (auth_generate function)
- Generation logic: `modules/sonamu/src/auth/auth-generator.ts`
- Entity definitions: `modules/sonamu/src/auth/better-auth-entities.ts`

**IMPORTANT: Before running generate, you must confirm with the user which plugins they want to use.**

Plugin selection happens at generate time and can be added later, but it is best to specify them from the start.
Refer to `auth-plugins.md` for the list of supported plugins and their purposes.

### Plugin Confirmation Flow

**[Step 1] Confirm before generate (required)**

> "What authentication method do you plan to use? Please confirm whether you need additional plugins beyond the default email/social login.
> Supported plugins: `admin`, `organization`, `2fa`, `username`, `phone-number`, `api-key`, `jwt`, `passkey`, `sso`, `anonymous`"

**[Step 1-A] If the user responds "I'll do it later":**

Provide the following guidance and proceed with generate without plugins:

> "Understood. It's best to add plugins before the initial migration is run.
> I'll confirm again before the migration."

And remember the **`plugins_deferred: true`** state.

**[Step 2] Re-confirm just before migrate run (CRITICAL — must be done if `plugins_deferred: true`)**

Before running the migration, always confirm again:

> "You are about to run a migration. This is the best time to add plugins.
> If you want to add any plugins, please let me know. Otherwise, we'll proceed as-is.
> Supported plugins: `admin`, `organization`, `2fa`, `username`, `phone-number`, `api-key`, `jwt`, `passkey`, `sso`, `anonymous`"

- If adding plugins: run `pnpm sonamu auth generate --plugins <list>` then proceed with migrate
- If none: proceed with migrate as-is

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

**How it works:**

- If the entity does not exist, it is created fresh
- If the entity already exists, only missing fields are added
- Fields with changed types are updated automatically
- Uses snake_case column names (better-auth uses camelCase)

## Field Mapping (Applied Automatically)

**Source code:** `modules/sonamu/src/auth/better-auth-entities.ts` (BASE_FIELD_MAPPINGS)

| better-auth     | Sonamu           |
| --------------- | ---------------- |
| `emailVerified` | `email_verified` |
| `createdAt`     | `created_at`     |
| `userId`        | `user_id`        |
| `expiresAt`     | `expires_at`     |

## Config Setup

**Source code:** `modules/sonamu/src/api/config.ts` (SonamuServerOptions.auth)

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

**Source code:** `modules/sonamu/src/api/context.ts` (AuthContext type definition)

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

**Source code:** `modules/sonamu/src/api/decorators.ts` (GuardKeys interface)

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

**File location:** `src/typings/sonamu.d.ts`

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

**Source code:** `modules/sonamu/src/api/config.ts` (SonamuFastifyConfig.guardHandler)

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

**Note:** The default User entity from better-auth (`modules/sonamu/src/auth/better-auth-entities.ts`) does not have a `role` field.

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

- [ ] **[Before generate] Confirm with user whether plugins are needed**
  - If "later" → remember `plugins_deferred: true`, guide on optimal timing
- [ ] Run `pnpm sonamu auth generate [--plugins ...]`
- [ ] **[Before migrate] Re-confirm plugins if `plugins_deferred: true`** (CRITICAL)
- [ ] Create and apply migration
- [ ] Configure `server.auth` in `sonamu.config.ts`
- [ ] Implement `guardHandler`
- [ ] Confirm user/session access from Context
- [ ] Add role to User entity if role-based authorization is needed

## Reference

**Skills documentation:**

- Detailed configuration: "server.auth details" section in `config.md`
- Context API: "Context access" section in `api.md`

**Official documentation:**

- Korean: `modules/docs/ko/api-development/authentication/setup.mdx`
- English: `modules/docs/en/api-development/authentication/setup.mdx`
