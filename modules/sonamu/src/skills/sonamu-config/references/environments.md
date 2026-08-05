# Per-Environment Dotenv, Logging, Slack Approval

## What goes in which dotenv file

The layering order and the failure modes are in `SKILL.md`; this is what each file is for. All of them
sit in the api root and are gitignored in a generated project, so the values are per-machine.

| File | Contents |
| --- | --- |
| `.env` | Values shared by every environment, plus everything the Docker container needs — `CONTAINER_NAME`, `PROJECT_NAME`, `SONAMU_DB_USER`, `SONAMU_DB_PASSWORD`, `SONAMU_DB_PORT`. `pnpm docker:up` reads only this file |
| `.env.development` | The development database's `SONAMU_DB_*` |
| `.env.test` | The test database's `SONAMU_DB_*`, plus `SONAMU_DB_FIXTURE_*` — the fixture preset reads this file |
| `.env.staging`, `.env.production` | Remote `SONAMU_DB_HOST` and credentials, plus `SONAMU_DB_READONLY_*` when a replica exists |
| `.env.local` | Machine-specific overrides; wins over both of the above |

A generated project ships all five files. The four `.env.<environment>` files arrive fully commented
out, so every value falls through to `.env` until something is uncommented. `.env` itself is written
with real connection values when the generator sets up the Docker database, and is left commented out
when that step is declined — in which case the container variables above have to be filled in by hand
before `pnpm docker:up` works.

Development, pointing at the local container:

```env
# .env
CONTAINER_NAME=myproject-container
PROJECT_NAME=myproject
SONAMU_DB_HOST=0.0.0.0
SONAMU_DB_PORT=5432
SONAMU_DB_USER=postgres
SONAMU_DB_PASSWORD=1234
```

Production, in `.env.production`:

```env
SONAMU_DB_HOST=your-rds-endpoint.amazonaws.com
SONAMU_DB_PORT=5432
SONAMU_DB_USER=produser
SONAMU_DB_PASSWORD=strong-password-here
SONAMU_DB_READONLY_HOST=your-rds-replica.amazonaws.com
```

The database name is derived from `projectName`, so there is no name variable to set here unless the
existing database has a different name — then `SONAMU_DB_NAME`.

## logging

Logging is LogTape. The block takes four keys, all optional:

```typescript
import { getConsoleSink } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";

logging: {
  fastifyCategory: ["fastify"],   // default
  sinks: { console: getConsoleSink({ formatter: getPrettyFormatter({ timestamp: "time" }) }) },
  filters: { /* FilterLike per id */ },
  loggers: [
    { category: ["sonamu"], sinks: ["console"], lowestLevel: "debug" },
    { category: ["tasks"], sinks: ["console"], lowestLevel: "info" },
  ],
},
```

`loggers` is what decides whether anything is printed. A block with `sinks` alone declares outputs
nothing routes to, and the only lines that appear are Sonamu's own default Fastify logger.

Sonamu adds to whatever is declared:

- a `fastify-console` sink and filter, pretty-printed and restricted to requests under `/api`.
  Declaring either id yourself replaces Sonamu's.
- a logger for `fastifyCategory` (default `["fastify"]`) at `info`, unless `loggers` already contains
  an entry for that category.
- LogTape's own meta logger, silenced at `fatal`.

`logging: false` skips the LogTape setup entirely.

## slackConfirm

Requires a Slack approval in channel before pending migrations are applied to the listed presets:

```typescript
slackConfirm: {
  targets: ["staging", "production"],            // DB preset keys
  botToken: process.env.SLACK_BOT_TOKEN ?? "",   // xoxb-...
  channelId: process.env.SLACK_CHANNEL_ID ?? "", // C...
},
```

Three conditions gate the prompt, and it is skipped silently when any fails:

- `botToken` and `channelId` must both be non-empty. The generated config only sets the block when
  both environment variables exist, which is why an unconfigured project applies migrations directly.
- The apply must run through Sonamu UI. `sonamu migrate apply` and `sonamu migrate run` call the
  migrator directly and never consult Slack.
- At least one target host must be non-local. If every target resolves to `localhost`, `127.0.0.1`,
  `0.0.0.0`, or `::1`, approval is skipped.

`targets` entries are validated against the generated presets, and an unknown one fails the apply with
the valid list in the message.
