---
name: sonamu-api
description: Exposes Model methods as HTTP, SSE, and WebSocket endpoints. Use when adding or changing an endpoint, choosing httpMethod/clients options, implementing a file upload, streaming SSE events, opening a WebSocket channel, or mapping a thrown error to a status or close code. Covers @api, @upload, @stream, @websocket, createSSE, ctx.ws, and SoException.
---

# Sonamu Endpoints

A method on a Model or Frame becomes an endpoint by carrying an endpoint decorator. `sonamu sync`
reads the decorator and regenerates a typed client function or hook for it.

Each reference below opens with a usage example of its decorator. The option types and the
decorator-time validation they describe live in `sonamu/src/api/decorators.ts`, which ships with the
package.

## Reference Map

| Need                                                                              | Read                        |
| --------------------------------------------------------------------------------- | --------------------------- |
| Request in, response out — options, defaults, generated client per `clients` value | `references/api.md`         |
| File upload — buffer vs stream, limits, storage destination                        | `references/upload.md`      |
| Server-to-client event stream                                                     | `references/sse.md`         |
| Bidirectional channel, rooms, broadcasting outside the handler                     | `references/websocket.md`   |
| A thrown error's status code, response body, or WebSocket close code              | `references/errors.md`      |

| Decorator    | Endpoint                    | Generated client                     |
| ------------ | --------------------------- | ------------------------------------ |
| `@api`       | Route with `httpMethod`     | Request function, plus hooks per `clients` |
| `@upload`    | POST multipart route        | `axios-multipart` + `tanstack-mutation-multipart` |
| `@stream`    | SSE route                   | `useSSEStream`-based hook            |
| `@websocket` | WebSocket route             | `useWebSocketChannel`-based hook     |

Guards are wired through the `guards` option on all four. The guard keys themselves, `guardHandler`,
and custom guards live in the `sonamu-auth` skill.

## Route path

The default path is the config prefix plus `/{model}/{method}`. The model name drops its `Model` or
`Frame` suffix, and both segments are camelized:

```typescript
// UserModel.findById  →  /api/user/findById
// ChatFrame.subscribeChat  →  /api/chat/subscribeChat
```

The prefix comes from `api.route.prefix` in `sonamu.config.ts` (`/api` in the generated project) and
is always prepended — including in the generated client's base URL. `path` replaces only the part
after the prefix.

## Mixing decorators on one method

`checkSingleDecorator` rejects two *different* endpoint decorators on the same method, because both
would claim the same route:

```
@api decorator can only be used once on UserModel.upload.
You can use only one of @api, @stream, @websocket, or @upload decorator on the same method.
```

It does not reject the same decorator applied twice. That case merges the two option objects instead,
and throws only when they disagree — a different `path` fails `assertNoConflictingPath`, and any
other option present in both with different values fails `assertNoConflictingOptions`:

```
@api decorator on UserModel.findMany has conflicting options: resourceName.
The decorator is trying to override the existing option("Users") with the new option("Members").
```
