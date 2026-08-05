# @api — Request In, Response Out

```typescript
@api({ httpMethod: "GET" })
async findById(id: number): Promise<User> { }
// → GET /api/user/findById?id=1
```

## Options

| Option         | Description                                       | Default            |
| -------------- | ------------------------------------------------- | ------------------ |
| `httpMethod`   | Route method                                      | `GET`              |
| `clients`      | Client kinds to generate                          | `["axios"]`        |
| `resourceName` | Renames the generated function and hook           | -                  |
| `guards`       | Authentication/authorization guards               | -                  |
| `path`         | Custom path, replacing `/{model}/{method}`        | -                  |
| `description`  | API description (for documentation)               | -                  |
| `timeout`      | Client-side abort after N ms                      | -                  |
| `contentType`  | Response Content-Type                             | `application/json` |
| `cacheControl` | Cache-Control header for the response             | -                  |
| `compress`     | Per-route response compression (`false` disables) | -                  |

### httpMethod

Write the method uppercase. The type is Fastify's `HTTPMethods`, so it also accepts `HEAD`, `OPTIONS`,
and WebDAV verbs — but only `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `PATCH` are routable in local
development, where every API is served from one catch-all route registered for exactly those methods.
A production-only method 404s while developing.

Both the server and the generated client decide where parameters live by comparing against `"GET"`:

- `GET` — parameters are read from the query string, and the client serializes them with
  `qs.stringify` into the URL.
- anything else — parameters are read from the JSON body, and the client sends them as `data`.

### resourceName

It renames the generated surface; it is not the queryKey.

```typescript
@api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Users" })
async findMany(params: UserListParams): Promise<ListResult<User>> { }
```

| Without `resourceName`         | With `resourceName: "Users"` |
| ------------------------------ | ---------------------------- |
| `findMany(...)`                | `getUsers(...)`              |
| `findManyQueryOptions(...)`    | `getUsersQueryOptions(...)`  |
| `useFindMany(...)`             | `useUsers(...)`              |

The queryKey stays `['{ModelName}', '{generated function name}', ...params]` — so renaming does move
the second element, because that element is the generated name.

A plural `resourceName` on a method named exactly `findMany` additionally generates
`use{ResourceName}Infinite` and `get{ResourceName}InfiniteQueryOptions`, which page through by
incrementing `page` and stop once the accumulated `rows` reach `total`.

### timeout

Emitted into the generated client as `signal: AbortSignal.timeout(ms)`. It aborts the request, not
the handler — the server runs the method to completion regardless.

### compress

Only applies in production. Local development serves every API from one catch-all route so that HMR
works, and Fastify's per-route compress option is not available on that path.

`compress: true` uses the global options from `server.plugins.compress`; an object overrides them;
`false` disables compression for the route.

### cacheControl

The decorator value wins over `server.cacheControlHandler`. With neither set, Sonamu sends no
Cache-Control header.

### contentType

Set on the reply before the return value is serialized. Changing it does not change how the value is
serialized — returning an object with `contentType: "text/plain"` still sends JSON text.

## clients

The plain request function is generated for every `@api` method regardless of what `clients` says —
`clients` only decides which *extra* surfaces come with it.

| Client                        | Generates                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| `axios`                       | Nothing extra; the plain `async function {name}(...)` is emitted either way |
| `tanstack-query`              | `{name}QueryOptions` + `use{Name}`, wrapped in `useRefreshable`    |
| `tanstack-mutation`           | `use{Name}Mutation`, taking one object holding all parameters      |
| `axios-multipart`             | Replaces the plain function with a multipart POST — see `upload.md` |
| `tanstack-mutation-multipart` | Multipart mutation hook — see `upload.md`                         |
| `window-fetch`                | Nothing. It remains in the `ServiceClient` type, but the active generator has no branch for it |

Read and write endpoints usually pair the plain function with its hook:

```typescript
@api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "Users" })
async findMany(params: UserListParams): Promise<ListResult<User>> { }

@api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
async save(params: UserSaveParams[]): Promise<number[]> { }
```

`use{Name}` comes back wrapped in `useRefreshable`, which adds `refresh` and `isRefreshing` on top of
the TanStack Query result.

The generated request wrapper converts a failed response into a client-side `SonamuError` carrying
`code` (the HTTP status), `message`, and `issues` — see `errors.md` for what the server puts in that
body.

## Context

Inside the method, `Sonamu.getContext()` returns the HTTP `Context`:

```typescript
@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<User | null> {
  const { user } = Sonamu.getContext();
  return user ? this.findById("A", user.id) : null;
}
```

`transport` is `"http"` here, and the object carries `request`, `reply`, `headers`, `locale`, `user`,
`session`, `naiteStore`, `createSSE`, and the upload file arrays. A `@websocket` method gets a
different shape — see `websocket.md`.
