---
name: sonamu-auth
description: Wires better-auth into a Sonamu project — schema, session, and typed user fields. Use when running auth generate, configuring server.auth, adding an auth plugin, reading user or session from the Context, typing a custom User field, or when sign-in fails or user is always null. Covers auth generate --plugins, add-companions, server.auth, basePath, additionalFields, and SonamuUser.
---

# better-auth in Sonamu

Sonamu owns the schema and the request plumbing; better-auth owns the credential and session logic.
Three things have to line up, in this order:

1. `pnpm sonamu auth generate` writes the entity JSONs.
2. `pnpm sonamu migrate generate`, then `migrate run`, creates the tables.
3. `server.auth` in `sonamu.config.ts` turns on the better-auth instance and its routes.

Restricting an endpoint is a separate mechanism: `guards` and `guardHandler` enforce nothing
auth-specific and work with no `auth` block at all. They belong to the `sonamu-api` skill.

| Need                                                       | Read                        |
| ----------------------------------------------------------- | --------------------------- |
| Which plugin adds which tables and fields, and its wrapper | `references/plugins.md`     |
| Auth routes, client IP, reading `user`/`session`           | `references/runtime.md`     |
| `additionalFields`, `SonamuUser`, a `role` column          | `references/user-fields.md` |

## `auth generate`

```bash
pnpm sonamu auth generate                            # 4 core entities
pnpm sonamu auth generate --plugins admin,2fa        # plus per-plugin entities and fields
```

The core entities, all with snake_case columns:

| Entity       | Table         | Key fields                                     | Indexes                        |
| ------------ | ------------- | ---------------------------------------------- | ------------------------------ |
| User         | users         | id, name, email, email_verified, image         | `users_email_unique`           |
| Session      | sessions      | id, token, expires_at, user_id                 | `sessions_token_unique`, `sessions_user_id_idx` |
| Account      | accounts      | id, account_id, provider_id, password, user_id | `accounts_user_id_idx`         |
| Verification | verifications | id, identifier, value, expires_at              | `verifications_identifier_idx` |

Each also gets `created_at`/`updated_at`, an `A` subset covering its own columns, and `OrderBy` /
`SearchField` enums. `id` is a string on all four — better-auth generates the values, not the
database.

Re-running is additive — a missing entity is created, and an existing one gets its missing props,
indexes, and subsets. Nothing is deleted. The two paths differ in whether they touch a prop that
already exists:

| | On a prop that already exists |
| --- | --- |
| The four core entities | Rewritten when its `type` or its `cone.fixtureStrategy` differs from what Sonamu expects |
| A plugin's `additionalProps` | Left alone — no comparison is made, so a plugin never updates a prop it did not just add |

A rewrite replaces the whole prop object rather than merging into it, so anything you added to that
prop — `cone.note`, `desc`, `dbDefault`, `nullable` — is gone, and the `[UPDATE PROP]` line naming
the old and new type is the only notice. In practice this fires on `User.id`, the intended case, but
check the output for props you have edited by hand.

What is not free is the schema change — before the first migration a plugin costs one regenerate,
after it each addition is an ALTER against live tables. Settle the plugin set early.

An unknown `--plugins` value is reported and skipped, and the command still succeeds, so a typo
silently generates less than intended:

```
⚠ Unknown plugin: 2af
  Supported plugins: admin, username, phone-number, 2fa, sso, passkey, organization, api-key, jwt, anonymous, audit-log
```

The `[PLUGIN] <Name>` lines in the output are the confirmation of what was actually applied.

### `auth add-companions`

```bash
pnpm sonamu auth add-companions
```

Adds `cone.fixtureCompanions` to `User.id`, so that `fixture gen` on User also inserts a matching
`credential` Account. Without it, auth-dependent tests get Users with no Account at all. Run it once
after `auth generate`; it skips a prop that already has `fixtureCompanions`, so re-running is safe.

The generated Account uses the User's own email as both `account_id` and password, and Sonamu's
fixture generator stores that password **bcrypt**-hashed. better-auth verifies with scrypt, so
`sign-in/email` rejects fixture users until the project supplies a matching verifier:

```typescript
// sonamu.config.ts
emailAndPassword: {
  enabled: true,
  password: {
    verify: async ({ hash, password }) => (await import("bcrypt")).compare(password, hash),
  },
},
```

The cone key itself is the `sonamu-fixture` skill's subject.

## `server.auth`

```typescript
// sonamu.config.ts
server: {
  auth: {
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
  },
},
```

The type is better-auth's `BetterAuthOptions`, plus Sonamu's `user.additionalFields` extension.
Sonamu supplies the database adapter, and your config is spread over it — so setting `database`
yourself does not get ignored, it replaces the Knex adapter and every query goes somewhere else.
Leave it out.

## When it does not work

| Symptom | Cause |
| --- | --- |
| `user` and `session` are always `null`, every guard rejects | Step 3 skipped. No `auth` block means no better-auth instance and no routes — the tables sit unused |
| `Auth has not been initialized. Check auth config in sonamu.config.ts.` | `Sonamu.auth` reached with no `auth` block |
| Auth queries hit the wrong database, or nothing at all | `database` set inside `server.auth`, replacing the Knex adapter |
| `sign-in/email` rejects a fixture user | bcrypt/scrypt mismatch — see `auth add-companions` above |
| A plugin's endpoint 404s, or a query fails on a missing column | Wrapper registered without `auth generate --plugins <id>`, or generated without registering the wrapper. `references/plugins.md` |
| `ctx.user.<field>` does not type-check | The column exists but is not in `user.additionalFields`. `references/user-fields.md` |
