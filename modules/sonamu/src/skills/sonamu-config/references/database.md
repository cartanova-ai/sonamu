# Database — Connections, Docker, Seed Dumps

## SONAMU_DB_* variables

These are the only database variables Sonamu reads. Each lives in `.env` or in the dotenv file of the
environment it applies to.

| Variable | Fallback |
| --- | --- |
| `SONAMU_DB_HOST` | `defaultOptions.connection.host`, then `0.0.0.0` |
| `SONAMU_DB_PORT` | `defaultOptions.connection.port`, then `5432` |
| `SONAMU_DB_USER` | `defaultOptions.connection.user`, then `postgres` |
| `SONAMU_DB_PASSWORD` | `defaultOptions.connection.password`, then unset |
| `SONAMU_DB_NAME` | the derived name for that preset |
| `SONAMU_DB_READONLY_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME` | the unprefixed variable |
| `SONAMU_DB_FIXTURE_HOST` / `_PORT` / `_USER` / `_PASSWORD` | the unprefixed variable |
| `SONAMU_DB_FIXTURE_NAME` | `{base}_fixture` — deliberately **not** `SONAMU_DB_NAME` |

A non-numeric `SONAMU_DB_PORT` throws `Invalid database port: <value>`.

`{base}` is `projectName` from `sonamu.config.ts`, lowercased with runs of non-alphanumerics replaced
by `_` and leading/trailing `_` trimmed. No `projectName` means `sonamu`.

## The nine presets

Every connection Sonamu opens comes from one of these:

| Preset | Dotenv file it reads | Database name |
| --- | --- | --- |
| `development`, `staging`, `production` | `.env.<preset>` | `SONAMU_DB_NAME` ?? `{base}_<preset>` |
| `test` | `.env.test` | `SONAMU_DB_NAME` ?? `{base}_test` |
| `fixture` | `.env.test` | `SONAMU_DB_FIXTURE_NAME` ?? `{base}_fixture` |
| `development_readonly`, `staging_readonly`, `production_readonly`, `test_readonly` | the matching environment file | `SONAMU_DB_READONLY_NAME` ?? `SONAMU_DB_NAME` ?? `{base}_<environment>` |

The fixture preset reading `.env.test` is why `SONAMU_DB_FIXTURE_*` belongs in `.env.test`, not
`.env.development`.

Outside `test`, `DB.getDB("w")` resolves to the current environment's preset and `DB.getDB("r")` to
its readonly twin, so a readonly replica is wired by adding `SONAMU_DB_READONLY_HOST` alone — the
remaining readonly fields fall back to the writer's.

Under `NODE_ENV=test` the two collapse: both arguments return the open test transaction if there is
one, otherwise a `test` writer pinned to `pool: { min: 1, max: 1 }`, or the per-worker database
`<test name>_<VITEST_POOL_ID>` when `SONAMU_WORKER_DB=true`. `test_readonly` is reachable only by
naming the preset explicitly.

## What defaultOptions can still set

`defaultOptions` is merged over these built-ins:

```typescript
{
  client: "postgresql",              // "pgnative" when database: "pgnative"
  pool: { min: 1, max: 5 },
  migrations: { directory: "./src/migrations" },
}
```

Two limits on `defaultOptions.connection`:

- `database` is always discarded. Names come from the table above, so a `database` written here looks
  applied and silently is not.
- In `development` and `test`, `host`, `port`, `user`, and `password` are discarded too, because
  Sonamu builds every preset from its own dotenv snapshot in those environments. A password written
  into `sonamu.config.ts` and left out of the dotenv files means an empty password and a failed
  connection locally, while the same config connects in staging and production, where snapshots are
  not read and these fields do act as fallbacks.

Fields outside that set (`ssl`, `application_name`, …) survive in every environment.

## Docker DB

```bash
pnpm docker:up     # docker compose --env-file .env -f database/docker-compose.yml up -d
pnpm docker:down
```

Run these commands from the API package root.

Both scripts pass `--env-file .env` and nothing else, so the values the container itself needs must
be in `.env`, not in `.env.development`:

| Variable | Used for |
| --- | --- |
| `CONTAINER_NAME` | compose project name and `container_name` |
| `PROJECT_NAME` | `{base}` for the databases `init.sh` creates |
| `SONAMU_DB_USER`, `SONAMU_DB_PASSWORD` | `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| `SONAMU_DB_PORT` | host side of `"${SONAMU_DB_PORT}:5432"` |

A password that exists only in `.env.development` produces an empty `POSTGRES_PASSWORD`, and the
container comes up with credentials the app cannot use.

`database/fixtures/init.sh` is mounted into `/docker-entrypoint-initdb.d/`, so it runs when the data
directory is first initialized. It installs the `vector` extension into `template1` and creates
`{base}_development`, `{base}_staging`, `{base}_production`, `{base}_test`, `{base}_fixture`, plus
`SONAMU_DB_NAME` and `SONAMU_DB_FIXTURE_NAME` when those are set. Setting `SONAMU_DB_NAME` after the
container already exists creates nothing — issue the `CREATE DATABASE` by hand or recreate the
container.

`init.sh`, `dump.sh`, and `seed.sh` derive `{base}` from the `PROJECT_NAME` environment variable,
while the runtime derives it from `projectName` in `sonamu.config.ts`. Hardcoding `projectName`
without setting `PROJECT_NAME` points the scripts at `sonamu_test` and `sonamu_fixture` while the app
uses the real names. Keep the two equal, or set `SONAMU_DB_NAME` and `SONAMU_DB_FIXTURE_NAME`
explicitly.

## Port conflicts

`pnpm docker:up` failing with a port already in use means another container holds the port:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

If the name matches this project's `CONTAINER_NAME`, an earlier instance is still up — `pnpm
docker:down && pnpm docker:up`.

If it belongs to another project, change `SONAMU_DB_PORT` in `.env` and run `pnpm docker:up` again.
That single value is enough: compose interpolates it into the port mapping, and the config reads the
same variable. Editing `docker-compose.yml` or hardcoding a port in `sonamu.config.ts` is not part of
the fix.

## Seed dumps

| Command | What it does |
| --- | --- |
| `pnpm dump` | `docker exec … pg_dump --inserts` of the **test** DB into `database/dumps/<dbname>_latest.sql` |
| `pnpm seedOnly` | `DROP DATABASE` + `CREATE DATABASE` on the **fixture** DB, then applies that dump file to it |
| `pnpm seed` | `seedOnly`, then `sonamu fixture sync` |
| `pnpm sync:dump` | `seed`, then `sonamu migrate run`, then `dump` |

All three scripts load `.env`, `.env.test`, and `.env.local` only.

`pnpm seedOnly` drops the fixture database outright, so anything in it that is not in the dump file is
gone. `pnpm seed` then pushes the result into the test DB through `fixture sync`. Neither touches
`{base}_development` or any remote environment.

To add base rows every developer and test run should have: insert them into the test DB, run
`pnpm dump`, then `pnpm seed`. The dump file is regenerated by `pnpm dump`, so edits to it survive
only until the next dump.

When rows are written into the dump file by hand, two constraints from `pg_dump --inserts` output
order apply — it emits `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` after the data section:

- Put `INSERT` statements before the foreign-key constraint section. After it, the apply fails on an
  FK violation because the referenced rows do not exist yet.
- Order the inserts along FK dependencies (parents first), and follow them with
  `SELECT pg_catalog.setval('public.<table>_id_seq', <max id>, true)` so the next generated id does
  not collide.

`sonamu fixture gen`, `fetch`, and the fixture/test/development relationship are covered by
`sonamu-fixture`.

## Files that carry connection settings

| File | Purpose |
| --- | --- |
| `<api-root>/.env` and `<api-root>/.env.<environment>` | `SONAMU_DB_*`, `CONTAINER_NAME`, `PROJECT_NAME` |
| `<api-root>/database/docker-compose.yml` | container definition, interpolates the variables above |
| `<api-root>/src/sonamu.config.ts` | `database.database` and `defaultOptions` |
