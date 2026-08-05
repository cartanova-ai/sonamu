# sonamu.config.ts — server Options

## Top-level keys

| Key | Effect |
| --- | --- |
| `listen` | `{ port, host }`; defaults to port `3000`, host `localhost` |
| `baseUrl` | URL the project is reachable at from outside. Defaults to `http://{listen.host}:{listen.port}` (`http://localhost:3000` with no `listen`). Substituted into the generated shared client (`src/services/sonamu.shared.ts` in each sync target) at one site only: the WebSocket base used when `axios.defaults.baseURL` is unset — in a web target, only when there is also no `window` to take an origin from. HTTP requests always go through axios's own `baseURL`, and generated `.http` files emit a literal `{{baseUrl}}` for the REST client to resolve |
| `fastify` | Fastify server options passed straight through, minus `logger` — logging is configured by the top-level `logging` block |
| `apiConfig` | Required. `contextProvider` and `guardHandler` are both mandatory |
| `plugins` | Fastify plugin registration, below |
| `websocket` | WebSocket runtime — `nodeId`, `presenceStore`, `clusterBus`, `telemetry`. Defaults suffice on a single instance; `sonamu-api` covers the socket API |
| `auth`, `storage`, `cache`, `lifecycle` | Below |

## server.plugins

Each plugin registers only when its key is present and truthy: `true` uses the plugin's own defaults,
an object is passed as its options. Nothing is registered by default.

| Key | Module |
| --- | --- |
| `compress` | `@fastify/compress` — registered before the others, with `threshold: 1024` and `encodings: ["br", "gzip", "deflate"]` merged under any options given |
| `cors` | `@fastify/cors` |
| `formbody` | `@fastify/formbody` — `x-www-form-urlencoded` bodies |
| `multipart` | `@fastify/multipart` — file uploads |
| `qs` | `fastify-qs` — nested query strings |
| `sse` | `fastify-sse-v2` |
| `static` | `@fastify/static` |
| `ws` | `@fastify/websocket`. Setting it also moves Vite's HMR socket to its own port in local development |
| `custom` | `(server: FastifyInstance) => void`, called last |

There is no session plugin. Session state comes from `server.auth`, and `Context.session` is
populated from it.

```typescript
plugins: {
  formbody: true,
  qs: true,
  multipart: { limits: { fileSize: 1024 * 1024 * 30 } },
  static: {
    root: path.join(import.meta.dirname, "/../", "public"),
    prefix: "/api/public",
  },
},
```

## server.auth

`server.auth` takes better-auth's `BetterAuthOptions` plus Sonamu's `user.additionalFields`
extension. Sonamu supplies the database adapter, registers the catch-all route under `basePath`
(default `/api/auth`), and resolves `user`/`session` onto the Context on every request. Leaving the
block out is valid — no better-auth instance is built and both are always `null`.

The `sonamu-auth` skill covers the option shape, `auth generate`, the plugin list, and the
snake_case field mapping.

## server.storage

```typescript
import { drivers } from "sonamu/storage";

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

Driver keys are the disk names `saveToDisk(diskName, key)` takes, so both can coexist.

## server.cache

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

`sonamu/cache` re-exports the drivers `memory`, `file`, `redis`, `redisBus`, and `knex`, plus
`store`. A second layer and a bus are added with
`.useL2Layer(...)` and `.useBus(...)`; for driver options see the
[BentoCache documentation](https://bentocache.dev/).

## server.apiConfig

### contextProvider

Required. Whatever it returns becomes the `Context` every endpoint receives:

```typescript
contextProvider: (defaultContext, request, reply) => {
  return {
    ...defaultContext,
    ip: request.ip,
    body: request.body,
  };
},
```

`defaultContext` already carries `transport`, `request`, `reply`, `headers`, `createSSE`,
`naiteStore`, `locale`, `user`, and `session`. Dropping the spread drops those.

`websocketContextProvider` does the same for socket connections. Omitting it reuses `contextProvider`
with stubs in place of `reply` and `createSSE`: `reply` is a proxy that throws on any property access,
and `createSSE` throws when called.

```
FastifyReply is not available in websocket context. Define websocketContextProvider if your context setup depends on reply mutation.
```

So a `contextProvider` that reads from `reply` or calls `createSSE` needs the socket variant defined
alongside it. Either way `transport` is set to `"ws"` and `reply`, `createSSE`, `bufferedFiles`, and
`uploadedFiles` are stripped from the context the socket handler receives.

### guardHandler

Required — one function covering every key used in an endpoint's `guards`, rejecting by throwing.
The `sonamu-api` skill covers the signature, declaring keys, and a worked handler.

### cacheControlHandler

Sets HTTP cache headers per request type:

```typescript
cacheControlHandler: (req) => {
  switch (req.type) {
    case "assets":
      if (req.path.match(/-[a-f0-9]+\./)) {
        return CachePresets.immutable;  // hashed filenames
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

`CachePresets` is exported from `sonamu`.

## server.lifecycle

```typescript
lifecycle: {
  onStart: (server) => {
    console.log(`🌲 Server listening on http://${host}:${port}`);
  },
  onShutdown: (server) => {
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
