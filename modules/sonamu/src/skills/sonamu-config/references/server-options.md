# sonamu.config.ts — server Options

## server.auth Details (better-auth Authentication)

Sonamu provides an authentication system using better-auth.

### 1. Auto-generate Entities

```bash
pnpm sonamu auth generate
```

Generated entities:

- User - user (id, name, email, email_verified, image)
- Session - session (token, expires_at, user_id)
- Account - account (provider_id, access_token, etc.)
- Verification - email verification

### 2. server.auth Configuration

```typescript
server: {
  // Basic configuration (emailAndPassword enabled)
  auth: {
    emailAndPassword: { enabled: true },
  },

  // Add social login
  // auth: {
  //   emailAndPassword: { enabled: true },
  //   socialProviders: {
  //     google: {
  //       clientId: process.env.GOOGLE_CLIENT_ID!,
  //       clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //     },
  //   },
  // },
}
```

### 3. Authentication API Endpoints

Automatically registered under the `/api/auth/*` path:

| Endpoint                  | Method | Description |
| ------------------------- | ------ | ----------- |
| `/api/auth/sign-up/email` | POST   | Sign up     |
| `/api/auth/sign-in/email` | POST   | Sign in     |
| `/api/auth/sign-out`      | POST   | Sign out    |
| `/api/auth/get-session`   | GET    | Get session |

### 4. Accessing user/session from Context

```typescript
@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<UserSubsetA | null> {
  const { user, session } = Sonamu.getContext();
  if (!user) return null;
  return this.findById("A", user.id);
}
```

### 5. Field Mapping (camelCase → snake_case)

better-auth uses camelCase, Sonamu uses snake_case. Automatic mapping is applied:

| better-auth     | Sonamu           |
| --------------- | ---------------- |
| `emailVerified` | `email_verified` |
| `createdAt`     | `created_at`     |
| `userId`        | `user_id`        |
| `expiresAt`     | `expires_at`     |

## Guards System (Access Control)

The Sonamu permission system consists of 2 components:

1. GuardKeys - permission key definitions
2. guardHandler - permission check logic

### 1. Extending GuardKeys (Custom Permissions)

Source code: `modules/sonamu/src/api/decorators.ts` (GuardKeys interface)

Provided by default: `query`, `admin`, `user`

To add custom permissions, extend in `src/typings/sonamu.d.ts`:

File location: `src/typings/sonamu.d.ts`

```typescript
import {} from "sonamu";

declare module "sonamu" {
  export interface GuardKeys {
    query: true;
    admin: true;
    user: true;
    manager: true; // added
    superadmin: true; // added
  }
}
```

### 2. Using guards in the @api Decorator

```typescript
// user.model.ts
import { api } from "sonamu";

class UserModelClass extends BaseModelClass {
  @api({ httpMethod: "GET", guards: ["user"] })
  async me(): Promise<UserSubsetA | null> {
    // only logged-in users can access
  }

  @api({ httpMethod: "DELETE", guards: ["admin"] })
  async del(ids: number[]): Promise<number> {
    // only admins can access
  }

  @api({ httpMethod: "GET", guards: ["admin", "manager"] })
  async adminList(): Promise<UserSubsetA[]> {
    // admin or manager permission
  }
}
```

### 3. Implementing guardHandler

```typescript
import { Sonamu } from "sonamu";

// sonamu.config.ts
apiConfig: {
  guardHandler: (guard, request, api) => {
    // Access user from better-auth Context
    const { user } = Sonamu.getContext();

    switch (guard) {
      case "user":
        // login required
        if (!user) {
          throw new Error("Login is required");
        }
        break;

      case "admin":
        // admin permission (requires adding role field to User entity)
        if (!user || (user as any).role !== "admin") {
          throw new Error("Only admins can access");
        }
        break;

      case "manager":
        // manager permission (custom Guard example)
        if (!user || !["admin", "manager"].includes((user as any).role)) {
          throw new Error("Manager permission is required");
        }
        break;

      case "query":
        // allow all users (including unauthenticated)
        break;
    }
  },
},
```

NOTE: better-auth's default User entity does not have a `role` field. If role-based authentication is needed, add a `role` field to the User entity or create a separate Role entity.

### Menu/Screen Access Control by Permission

UI access control by permission is handled on the frontend:

```typescript
// web/src/lib/auth.ts
export const menuPermissions = {
  dashboard: ["user", "admin", "manager"],
  userManagement: ["admin"],
  settings: ["admin", "manager"],
  reports: ["admin", "manager"],
};

export function canAccess(userRole: string, menu: keyof typeof menuPermissions) {
  return menuPermissions[menu].includes(userRole);
}
```

```tsx
// web/src/components/Sidebar.tsx
{
  canAccess(user.role, "userManagement") && (
    <MenuItem href="/admin/users">User Management</MenuItem>
  );
}
```

## server.plugins Details

### session (Session Management)

```typescript
session: {
  secret: process.env.SESSION_SECRET || "change-this-in-production",
  salt: process.env.SESSION_SALT || "mq9hDxBCDbsQDR6N",
  cookie: {
    domain: "localhost",  // change to actual domain in production
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 10,  // 10 years
  },
},
```

Production checklist:

- `SESSION_SECRET`: must be changed to a strong random string
- `SESSION_SALT`: change to a 16-character random string
- `cookie.domain`: change to the actual domain

### static (Static Files)

```typescript
static: {
  root: path.join(import.meta.dirname, "/../", "public"),
  prefix: "/api/public",
},
```

### multipart (File Upload)

```typescript
multipart: {
  limits: {
    fileSize: 1024 * 1024 * 30,  // 30MB
  },
},
```

## server.storage Details

### Local File System

```typescript
storage: {
  drivers: {
    fs: drivers.fs({
      location: path.join(import.meta.dirname, "/../public/uploaded"),
      visibility: "public",
      urlBuilder: {
        async generateURL(key) {
          return `/api/public/uploaded/${key}`;
        },
        async generateSignedURL(key) {
          return `/api/public/uploaded/${key}`;
        },
      },
    }),
  },
},
```

### AWS S3

```typescript
storage: {
  drivers: {
    s3: drivers.s3({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
      region: process.env.S3_REGION ?? "ap-northeast-2",
      bucket: process.env.S3_BUCKET ?? "my-bucket",
      visibility: "private",
    }),
  },
},
```

## server.cache Details

Sonamu uses BentoCache.

```typescript
import { drivers as cacheDrivers, store } from "sonamu/cache";

cache: {
  default: "main",
  stores: {
    main: store().useL1Layer(cacheDrivers.memory({ maxSize: "50mb" })),
  },
  ttl: "5m",
  prefix: "",
},
```

Available drivers:

- `memory` - in-memory cache (default)
- `file` - file-based cache
- `redis` - Redis cache
- `knex` - DB-based cache

For other drivers, refer to the [BentoCache documentation](https://bentocache.dev/).

## server.apiConfig Details

### contextProvider

Inject additional information into Context per request:

```typescript
contextProvider: (defaultContext, request) => {
  return {
    ...defaultContext,
    ip: request.ip,
    session: request.session,
    body: request.body,
    // custom fields can be added
  };
},
```

### guardHandler

Handle API guard processing:

```typescript
guardHandler: (guard, request, api) => {
  // access control based on guard value
  if (guard === "admin" && request.user?.role !== "admin") {
    throw new Error("Only admins can access");
  }
},
```

### cacheControlHandler

Set HTTP cache headers:

```typescript
cacheControlHandler: (req) => {
  switch (req.type) {
    case "assets":
      if (req.path.match(/-[a-f0-9]+\./)) {
        return CachePresets.immutable;  // files with hash
      }
      return CachePresets.longLived;

    case "api":
      if (req.method === "GET") {
        return CachePresets.shortLived;
      }
      return CachePresets.noCache;

    case "ssr":
      return CachePresets.ssr;

    case "csr":
      return CachePresets.shortLived;
  }
},
```

## server.lifecycle Details

```typescript
lifecycle: {
  onStart: () => {
    console.log(`🌲 Server listening on http://${host}:${port}`);
  },
  onShutdown: () => {
    console.log("graceful shutdown");
    // close DB connections, clean up resources, etc.
  },
  onError: (error, request, reply) => {
    console.error(error);
    reply.status(500).send({
      name: error.name,
      message: error.message,
    });
  },
},
```

