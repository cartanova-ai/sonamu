# Errors — Status Codes and Close Codes

## What decides the response

An error thrown in an endpoint method propagates to Fastify's error handler for that scope. Which
handler that is depends on the project's config, and there are three cases:

| Config                                            | Result                                   |
| ------------------------------------------------- | ---------------------------------------- |
| `server.lifecycle.onError` set                    | That function decides everything         |
| `setupErrorHandler` via `server.plugins.custom`   | `SoException.statusCode`, clamped at 501  |
| Neither                                           | Fastify's default handler                |

The generated project template sets `lifecycle.onError`, and its handler answers **500 for every
error** regardless of the exception class:

```typescript
onError: (error, _request, reply) => {
  console.error(error);
  reply.status(500).send({ name: error.name, message: error.message });
},
```

So in a fresh project, throwing `NotFoundException` produces a 500 — the status codes below are not in
effect until the project changes that handler.

With no `lifecycle.onError` at all, Fastify's own handler takes the error's `statusCode` when it is
400 or above and 500 otherwise, and sends its own body. It does not clamp, so a 520 stays a 520:

```
520 {"statusCode":520,"message":"target gone"}
500 {"statusCode":500,"error":"Internal Server Error","message":"plain boom"}
```

`setupErrorHandler` is exported from `sonamu` and implements the SoException mapping, but nothing in
the framework installs it. A project installs it through `server.plugins.custom`, which receives the
`FastifyInstance` while plugins are being registered — before `listen`, so `setErrorHandler` is still
accepted there:

```typescript
// sonamu.config.ts
import { setupErrorHandler } from "sonamu";

server: {
  plugins: {
    custom: setupErrorHandler,
  },
},
```

The generated template ships that entry as an empty `custom: (_server) => {}`, so this is an edit to
an existing hook rather than a new one.

Setting both is what makes the mapping look like it did not install: `plugins.custom` runs during
plugin registration and `lifecycle.onError` is registered later, just before `listen`, and the last
`setErrorHandler` wins. Keeping `setupErrorHandler` means removing `lifecycle.onError` — or, if the
project wants its own handler, calling the mapping logic from inside it instead.

## SoException

| Exception                        | statusCode | Meaning                          |
| -------------------------------- | ---------- | -------------------------------- |
| `BadRequestException`            | 400        | Bad parameters or request        |
| `UnauthorizedException`          | 401        | Not logged in, or not permitted  |
| `NotFoundException`              | 404        | Record does not exist            |
| `InternalServerErrorException`   | 500        | Internal or upstream failure     |
| `ServiceUnavailableException`    | 503        | Not processable in this state    |
| `TargetNotFoundException`        | 520        | Target of an operation missing   |
| `AlreadyProcessedException`      | 541        | Already handled                  |
| `DuplicateRowException`          | 542        | Duplicate where none is allowed  |

```typescript
throw new NotFoundException(SD("user.notFound"));
throw new BadRequestException(SD("common.invalidParams"), zodError.issues);
```

The message is a `LocalizedString`, so it goes through `SD()` — see the `sonamu-i18n` skill. The
second argument is `payload`, and the only shape anything reads is an array of Zod issues.

`isSoException` is a duck-type check on `statusCode !== undefined`, not an `instanceof` — a Fastify
error carrying a `statusCode` passes it too.

## Response body under setupErrorHandler

The status is `Math.min(statusCode, 501)`, and any error without a `statusCode` becomes **400**, not
500. That clamp catches every exception above 501 — so `ServiceUnavailableException` (503),
`TargetNotFoundException` (520), `AlreadyProcessedException` (541), and `DuplicateRowException` (542)
all arrive as 501, distinguishable only by their message.

The body is `{ name, code, message, validationErrors }`, and JSON serialization drops the undefined
fields. `SoException` never sets `name` or `code`, so what actually goes out for a framework exception
is just:

```
501 {"name":"Error","message":"down"}
```

When `payload` is an array, it is treated as Zod issues: `message` is **replaced** by the first
issue's message plus its path, and the full array ships as `issues`:

```
400 {"name":"Error","message":"inner (a/0)","issues":[{"code":"custom","path":["a",0],"message":"inner"}]}
```

A non-array `payload` is not sent at all — it exists for the thrower's own use, not for the client.

On the client, the generated request wrapper turns a failed response into `SonamuError(code, message,
issues)`, where `code` is the HTTP status. `isSonamuError(e)` narrows it, and `defaultCatch` alerts
`e.message`.

## WebSocket close codes

There is no status code on the WS path, so `resolveWebSocketCloseDescriptor` maps the error to a close
code instead. This runs regardless of `lifecycle.onError` — it is not part of the HTTP error handler.

| Thrown                          | Code | Reason                            | Log level |
| ------------------------------- | ---- | --------------------------------- | --------- |
| `SoException` 400               | 1008 | `Invalid websocket handshake`     | warn      |
| `SoException` 401 / 403         | 1008 | `Unauthorized websocket connection` | warn    |
| Other `SoException` 4xx         | 1008 | `Rejected websocket connection`   | warn      |
| Anything else                   | 1011 | `WebSocket handler failed`        | error     |

The generated hook does not retry 1008, so a guard rejection fails fast rather than reconnecting three
times. Failures during the connection — not the handshake — use their own codes: 1007 for a malformed
envelope or a payload that fails `inEvents`, 1008 for an unknown event name, 1011 for a handler that
threw, 1013 when the outbound queue overflows.

## SSE

`createSSE` only attaches socket listeners; nothing is written until the first `publish`. An error
thrown before that goes through the normal HTTP error path. After it, the response is already
committed, so the error cannot become a status — publishing an error event and calling `end()` is how
the client learns about it:

```typescript
} catch (error) {
  const cause = isError(error) ? error : new Error("Unknown error");
  sse.publish("onError", { error: { name: cause.name, message: cause.message } });
}
await sse.end();
```

The payload is `JSON.stringify`d, so publishing the `Error` itself would send `{}` — see `sse.md`.
