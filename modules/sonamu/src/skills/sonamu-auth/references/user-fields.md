# Custom User Fields

The generated User carries only what better-auth defines. A column of your own — a role, a
tenant id, a timestamp — has to be declared in two places to be readable as `ctx.user.<field>`: the
entity that creates the column, and `user.additionalFields` that puts it in better-auth's model.

## `user.additionalFields`

Sonamu extends the standard better-auth entry with `sonamuType`, which names a Sonamu type — an enum
id, typically — instead of a primitive:

```typescript
// sonamu.config.ts
auth: {
  user: {
    additionalFields: {
      role: { type: "string", sonamuType: "UserRole" },
      created_at: { type: "date" },
    },
  },
},
```

`sonamu sync` turns that into a `SonamuUser` type and binds it to the Context:

```typescript
export type SonamuUser = User & {
  role: UserRole;
  created_at: Date;
};
```

So `ctx.user.role` is typed as `UserRole` with no cast. A field with `required: false` becomes
optional on the generated type.

Two ways to end up without it:

- `auth` configured but no `additionalFields` — `SonamuUser` is generated as a bare alias of
  better-auth's `User`, so any extra column needs a cast to read. The cast is the signal that the
  field is missing from the config, not the pattern to follow.
- no `auth` block at all — neither `SonamuUser` nor the Context binding is generated, and `ctx.user`
  stays better-auth's `User | null`.

## A role field

The generated User has no `role`. Two ways to get the column:

- `--plugins admin` adds `role`, `banned`, `ban_reason`, `ban_expires` to User and `impersonated_by`
  to Session, and gives better-auth its own admin APIs. The generated `role` is a nullable string
  whose DB default is `user`, independent of the wrapper's `defaultRole` — `admin({ defaultRole:
  "normal" })` still leaves rows inserted outside better-auth on `user`.
- Adding the prop to `user.entity.json` yourself, when all you need is the column:

```json
{
  "name": "role",
  "type": "enum",
  "id": "UserRole",
  "desc": "권한"
}
```

An `enum` prop needs its `id` registered in the entity's `enums` — see the `sonamu-entity` skill.

Declare it in `user.additionalFields` either way, but for different reasons:

- **Via the admin plugin.** The plugin declares `role` in its own model, so better-auth already
  returns it at runtime. What is missing is the type: the `SonamuUser` generator reads only
  `additionalFields`, so without the entry `ctx.user.role` does not type-check even though the value
  is there.
- **Via a hand-added prop.** better-auth does not know the column at all, so it is neither selected
  nor returned — `additionalFields` is what puts it in the model, and the type follows from that.

## Column naming

better-auth speaks camelCase and the generated schema is snake_case. Sonamu ships the mapping for the
core entities, so `emailVerified` → `email_verified`, `createdAt` → `created_at`,
`userId` → `user_id`, `expiresAt` → `expires_at`, and so on across all four tables.

Your `server.auth` is merged into that mapping rather than replacing it, so a `user.fields` entry of
your own adds to the defaults instead of dropping them. Only a key you set yourself overrides the
Sonamu value.
