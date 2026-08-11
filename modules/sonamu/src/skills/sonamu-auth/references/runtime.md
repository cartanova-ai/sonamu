# Auth at Request Time

What better-auth handles, what Sonamu handles, and where `user` comes from once `server.auth` is
configured.

## Routes

Everything under `basePath` is registered as one catch-all route accepting `GET` and `POST`, and
handled by better-auth itself. `basePath` defaults to `/api/auth`:

| Path                      | Method | Purpose     |
| ------------------------- | ------ | ----------- |
| `/api/auth/sign-up/email` | POST   | Sign up     |
| `/api/auth/sign-in/email` | POST   | Sign in     |
| `/api/auth/sign-out`      | POST   | Sign out    |
| `/api/auth/get-session`   | GET    | Get session |

The full set depends on which better-auth plugins are enabled. Startup prints the active path:

```
✓ Auth: better-auth at /api/auth/*
```

These are not Sonamu endpoints — no decorator declares them and `sonamu sync` generates no client for
them. Call them with better-auth's own client.

## Client IP

Sonamu rebuilds each request before handing it to better-auth. In the rebuilt request every client-IP
header is **deleted and rewritten to Fastify's `request.ip`** — `cf-connecting-ip`,
`x-forwarded-for`, `x-real-ip`, `x-vercel-forwarded-for`, plus anything listed in
`server.auth.advanced.ipAddress.ipAddressHeaders`. better-auth therefore never sees the incoming
header value, whichever header name it is configured to read.

So the only thing that decides what lands in `sessions.ip_address` is `request.ip`. Behind a proxy or
load balancer that means Fastify's `trustProxy`, which Sonamu passes straight through:

```typescript
// sonamu.config.ts
server: {
  fastify: { trustProxy: true },
},
```

Without it `request.ip` is the proxy's address and every IP header in the rebuilt request is set to
that — adding `ipAddressHeaders` does not help, because the list only widens which header names get
overwritten. Reach for it when a provider sends the real IP under a name outside the four above and
you want that header normalized too, not to select a source.

## Reading user and session

```typescript
import { Sonamu } from "sonamu";

@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<UserSubsetA | null> {
  const { user, session } = Sonamu.getContext();
  if (!user) return null;

  return this.findById("A", user.id);
}
```

The session is resolved while the Context is built, from the request headers, on **every** request —
guarded or not, and whether or not the method reads `user`. Both fields are `null` when there is no
valid session, so a method that assumes a guard already ran still needs the null check to satisfy the
type.

A project whose `contextProvider` writes to `reply` needs a separate `websocketContextProvider`; the
WS path has no reply. Session resolution itself is identical on both.

Typing `user.role` and other columns beyond better-auth's own is `user-fields.md`.
