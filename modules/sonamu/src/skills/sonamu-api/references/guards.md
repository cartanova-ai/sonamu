# Guards

`guards` is a list of keys on any endpoint decorator. Sonamu enforces nothing on its own — it calls
`apiConfig.guardHandler` once per key, and the handler decides by throwing or returning.

```typescript
@api({ httpMethod: "GET", guards: ["user"] })
async getProfile() { }
```

## How the loop behaves

- **Every key runs, in order — the list is AND, not OR.** `guards: ["admin", "manager"]` means both
  checks must pass. There is no built-in way to express "either"; put the alternation inside one
  key's own logic instead.
- **An unhandled key passes silently.** A `switch` with no `default` lets a typo'd or newly added key
  through with no error, and the endpoint serves the request. Throwing in `default` turns that into a
  rejection instead.
- **The handler is synchronous** (`=> void`). A permission check needing a DB round trip cannot be
  awaited here; do it in the method body, or cache what the guard needs onto the Context in
  `contextProvider`.

A thrown error takes the normal error path — an HTTP status on the HTTP side, a close code on the WS
side (`1008` for `UnauthorizedException`, which the generated hook does not retry). Throw a
`SoException` subclass rather than a plain `Error` to control which. See `references/errors.md`.

## When guards run

`Sonamu.getContext()` works inside the handler on both transports — the Context is built first
either way. What differs is the request payload:

| | Order |
| --- | --- |
| HTTP | build Context → **guards** → zod-parse the query or body |
| WebSocket | parse params → register the connection → build Context → **guards** → activate |

So on HTTP the payload has not been parsed yet and `request.body` is still raw; on WebSocket the
connection parameters are already parsed by the time the guard runs. A WS guard that throws closes a
connection that was registered but never activated, so no broadcast reaches it.

## Declaring keys

`query`, `user`, and `admin` are pre-declared. They carry no behavior — they are names the handler
must implement, and `admin` rejects nobody until that branch is written. Additional keys are declared
by augmenting `GuardKeys`, which is what makes them type-check inside `guards`:

```typescript
// src/typings/sonamu.d.ts
import {} from "sonamu";

declare module "sonamu" {
  export interface GuardKeys {
    manager: true;
    evaluator: true;
  }
}
```

## `guardHandler`

Required on `apiConfig` — one function covering every key. Omitting it is a type error.

```typescript
// sonamu.config.ts
apiConfig: {
  guardHandler: (guard, request, api) => {
    const { user } = Sonamu.getContext();

    switch (guard) {
      case "query":
        return; // open to everyone, including unauthenticated

      case "user":
        if (!user) throw new UnauthorizedException(SD("auth.loginRequired"));
        return;

      case "admin":
        if (user?.role !== "admin") throw new UnauthorizedException(SD("auth.adminOnly"));
        return;

      case "manager":
        if (!user || !["admin", "manager"].includes(user.role)) {
          throw new UnauthorizedException(SD("auth.managerOnly"));
        }
        return;

      default:
        throw new UnauthorizedException(SD("auth.unknownGuard"));
    }
  },
},
```

The second argument is the raw `FastifyRequest`. It carries no user of its own, so read the user from
`Sonamu.getContext()` as above.

The third carries the endpoint's own metadata — `modelName`, `methodName`, `path`, `parameters`,
`typeParameters`, `returnType`, and `options` — so one branch can cover a whole model or read the
decorator's options rather than naming methods one by one.

Every `SoException` takes a `LocalizedString`, not a `string`, so the message comes from `SD(...)`; a
plain literal is a type error.

`user` and `session` on the Context come from better-auth. Typing `user.role` without a cast needs
`server.auth.user.additionalFields`; with no `auth` block configured at all, `user` is always `null`
and every key that tests it rejects. Both are the `sonamu-auth` skill's subject.
