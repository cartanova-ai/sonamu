# sonamu.config.ts — server Options

## server.auth

`server.auth` takes better-auth's `BetterAuthOptions` plus Sonamu's `user.additionalFields`
extension. Sonamu supplies the database adapter, registers the catch-all route under `basePath`
(default `/api/auth`), and resolves `user`/`session` onto the Context on every request. Leaving the
block out is valid — no better-auth instance is built and both are always `null`.

The `sonamu-auth` skill covers the option shape, `auth generate`, the plugin list, and the
snake_case field mapping.


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

Required — one function covering every key used in an endpoint's `guards`, rejecting by throwing.
The `sonamu-api` skill covers the signature, declaring keys, and a worked handler.

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

