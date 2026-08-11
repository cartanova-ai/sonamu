---
name: sonamu-config
description: Configures a Sonamu project through sonamu.config.ts and its dotenv files. Use when editing .env, .env.<environment>, or sonamu.config.ts, wiring database, storage, cache, logging, or tasks options, starting the Docker DB, resolving a port conflict, or on an Invalid NODE_ENV, Missing Sonamu dotenv file, or removed database.name error. Covers SONAMU_DB_* variables and DB presets.
---

# Sonamu Configuration

Configuration lives in two places, both under the API package root. Sonamu calls that directory the
api root; its parent is the app root, which is what
`api.dir` and `sync.targets` are relative to.

| File | Holds |
| --- | --- |
| `.env`, `.env.<environment>`, `.env.local` | connection values and secrets |
| `src/sonamu.config.ts` | everything else, exported through `defineConfig` |

## Which config file actually runs

`src/sonamu.config.ts` is loaded only when `HOT=yes` (set by `sonamu dev`) or `VITEST=true`.
Otherwise the runtime imports `dist/sonamu.config.js`. `sonamu start` therefore runs the built
copy — editing the source config changes nothing there until `sonamu build` runs again.

`defineConfig` accepts an object, a promise, or a function returning either, so a config that has to
await something is valid.

## Environments and dotenv layering

`NODE_ENV` selects the environment and must be `test`, `development`, `staging`, or `production`.
Unset or empty means `development`; anything else throws before any other work happens:

```
Invalid NODE_ENV "local". Sonamu supports only test, development, staging, production.
```

For the selected environment, values are layered in this order, later winning:

1. `.env`
2. `.env.<environment>`
3. `.env.local`
4. values already present in `process.env`

Step 4 carries one exception worth knowing: a `process.env` value identical to the one in `.env` is
dropped when `.env.<environment>` also defines that key, so the environment file wins instead of
losing to an inherited common value. `NODE_ENV` is then forced to the resolved environment.

At least one of `.env` or `.env.<environment>` must exist, or:

```
Missing Sonamu dotenv file. Create /path/to/api/.env or /path/to/api/.env.production.
```

In `development` and `test`, Sonamu reads all four environments' dotenv files at startup, not only
the current one — that is what lets a migration run against staging or production from a developer
machine. The existence check runs once per environment, so with no `.env` present all four of
`.env.development`, `.env.test`, `.env.staging`, `.env.production` are required. One committed `.env`
satisfies the check for every environment.

Which variables Sonamu itself reads is a short list: `NODE_ENV`, the `SONAMU_DB_*` family, and
`PROJECT_NAME` where the shell scripts use it. Everything else in a generated `.env`
(`AWS_ACCESS_KEY_ID`, `S3_BUCKET`, `BETTER_AUTH_SECRET`, `SLACK_BOT_TOKEN`, …) is read by the
project's own `sonamu.config.ts` through `process.env`, so those names are conventions the project
can change. See `references/database.md` for the `SONAMU_DB_*` table and `CONTAINER_NAME`.

## sonamu.config.ts sections

```typescript
import { defineConfig } from "sonamu";

export default defineConfig({
  projectName: process.env.PROJECT_NAME ?? "MyProject",
  api: { dir: "api", timezone: "Asia/Seoul", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en"] },
  sync: { targets: ["web"] },
  database: { database: "pg", defaultOptions: { /* knex options */ } },
  server: { listen: { port: 34900, host: "localhost" }, apiConfig: { /* … */ } },
  // optional below
  logging: { /* LogTape config, or false to disable */ },
  test: { parallel: true, maxWorkers: 4, devRunner: { enabled: true } },
  tasks: { contextProvider: (defaultContext) => defaultContext },
  slackConfirm: { targets: ["production"], botToken: "", channelId: "" },
  externalEditor: "Cursor",
});
```

| Key | Required | Effect |
| --- | --- | --- |
| `projectName` | | Base name for every generated database name, lowercased with non-alphanumerics collapsed to `_`. Omitted means `sonamu` |
| `api.dir` | ✓ | API-root directory name relative to the app root. Used to resolve generated i18n and dictionary files |
| `api.route.prefix` | ✓ | Prefix every generated route is mounted under |
| `api.timezone` | | Rewrites ISO-8601 UTC strings in responses to that zone's offset (`…T00:00:00.000Z` → `…T09:00:00+09:00` for `Asia/Seoul`), and schedules task workflows in it |
| `i18n` | ✓ | `defaultLocale` plus `supportedLocales`; see `sonamu-i18n` |
| `sync.targets` | ✓ | Sibling directory names under the app root that receive synced types |
| `database` | ✓ | `database: "pg" \| "pgnative"` (default `pg`; `pgnative` needs the `pg-native` module) and `defaultOptions` knex options. See `references/database.md` |
| `server.apiConfig` | ✓ | `contextProvider` and `guardHandler` are both required. See `references/server-options.md` |
| `server.listen` | | Defaults to port `3000`, host `localhost` |
| `logging` | | LogTape configuration, or `false` to skip logging setup entirely. See `references/environments.md` |
| `test` | | `parallel` (default false), `maxWorkers` (default 4), `devRunner`; see `sonamu-testing` |
| `tasks` | | Task queue options; `contextProvider` is required once the block exists. See `sonamu-tasks` |
| `slackConfirm` | | Slack approval before migrating listed DB presets. See `references/environments.md` |
| `externalEditor` | | `"Visual Studio Code"` (default), `"Zed"`, or `"Cursor"` — the editor CDD opens files with |

`test.devRunner` takes `enabled`, `routePrefix` (default `/__test__`), and `vitestConfigPath`. There
is no `watch` option; adding one is a type error.

### database

Connection values come from the environment, not from this block:

```typescript
database: {
  database: "pg",
  defaultOptions: {
    connection: {
      host: process.env.SONAMU_DB_HOST || "0.0.0.0",
      port: Number(process.env.SONAMU_DB_PORT) || 5432,
      user: process.env.SONAMU_DB_USER || "postgres",
      password: process.env.SONAMU_DB_PASSWORD,
    },
  },
},
```

A `name` or `environments` key here throws at startup:

```
Sonamu database.name and database.environments were removed. Use SONAMU_DB_* dotenv variables instead.
```

Database names are derived, never configured — `references/database.md` covers the derivation, the
nine presets, and which connection fields `defaultOptions` can still set.

## Reference Map

| Need | Read |
| --- | --- |
| `SONAMU_DB_*` variables, DB presets and names, Docker DB, port conflicts, seed dumps | `references/database.md` |
| Per-environment dotenv contents, logging, slackConfirm | `references/environments.md` |
| `server.plugins`, storage, cache, apiConfig, websocket, lifecycle | `references/server-options.md` |
