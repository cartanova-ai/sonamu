---
name: sonamu-fixture
description: Generates and manages Sonamu test data across the fixture, test, and live databases. Use when running fixture gen/fetch/explore/sync/init/import, writing cone.note or fixtureCompanions metadata, seeding sign-in-capable users, or when generated data is unrealistic, a relation fails with "데이터가 없습니다", or fixture rows land in the wrong database. Covers the 3-tier DB layout, dataSource strategies, fixtureGenerator, fixtureStrategy, and --use-llm.
---

# Fixture Data

Sonamu generates test data from entity definitions and moves it between three databases.

## Which database each command touches

```
current environment's DB (NODE_ENV)
          ↓ fixture fetch
     project_fixture
          ↓ fixture sync
       project_test
```

| DB                | Role                                        | Filled by                  |
| ----------------- | ------------------------------------------- | -------------------------- |
| `project`         | The environment you are running in          | Real usage                 |
| `project_fixture` | Reference store for tests                   | `fixture gen` / `fetch`    |
| `project_test`    | What tests actually run against             | `fixture sync`             |

| Command          | Reads                        | Writes                | Notes                                     |
| ---------------- | ---------------------------- | --------------------- | ----------------------------------------- |
| `fixture gen`    | fixture DB                   | fixture DB            | `User` is an exception — see below        |
| `fixture fetch`  | current environment (`r`)    | fixture DB            | Pulls relations to `maxDepth: 2`          |
| `fixture explore`| current environment (`r`)    | nothing               | Prints a table                            |
| `fixture sync`   | fixture DB                   | test DB               | Drops and recreates the test DB           |
| `fixture import` | the `production` config      | fixture, then test DB | Broken mixed-dialect path — see below     |
| `fixture init`   | current environment          | fixture + test DB     | MySQL only                                |

"Current environment" is the read connection for the running `NODE_ENV`, not production specifically.
Running `fixture fetch` under `NODE_ENV=test` copies the test DB into the fixture DB.

`fixture sync` runs `DROP DATABASE` on the test DB and restores it from a `pg_dump` of the fixture DB,
so anything written directly into the test DB is gone afterwards. `fixture import` calls `sync` once
it has copied the requested rows, so importing a single record also destroys and rebuilds the whole
test DB. The rows it copies are read from the database named by the **`production` config**, not from
whichever environment you are running under.

`fixture init` predates PostgreSQL support and shells out to `mysqldump`/`mysql`, so it is MySQL-only.
`fixture import` has no working end-to-end database path: its import phase emits MySQL-only `INSERT
IGNORE` with backtick-quoted cross-database names, then it always calls the PostgreSQL-only `sync`.
On MySQL the first phase can modify the fixture DB before `sync` fails; on PostgreSQL it fails during
the import phase. PostgreSQL-specific paths also appear outside those commands: the `sample` strategy
uses `ROW_NUMBER()`, `random` uses `RANDOM()`, and sequence reset uses `pg_get_serial_sequence`.
`fixture explore --strategy recent` avoids those paths and uses ordinary ordering and limiting.

```bash
pnpm sonamu fixture init
```

The registered import signature is `fixture import <EntityId> <recordIds>`, with comma-separated
numeric ids. Explicit arguments currently fail in the installed CLI parser with `Unknown type
#recordIds`; only the interactive menu parses the `number[]` prompt, and the mixed-dialect database
path still prevents that run from completing.

## fixture gen

```bash
pnpm sonamu fixture gen --include Post,Comment --count 10
pnpm sonamu fixture gen --all --exclude Admin,Log --count 3
```

| Option                | Effect                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `--include <ids>`     | Comma-separated EntityIds                                          |
| `--all`               | Every entity; `--exclude <ids>` removes from that set              |
| `--count <n>`         | Rows per entity; omitting it prompts with initial value `5`         |
| `--save-to <target>`  | `db` \| `file` \| `file:name.json` \| `none`; omitting it prompts    |
| `--use-llm`           | Generate values from `cone.note` (needs an Anthropic API key)      |
| `--no-cache`          | Disable the single-field LLM cache — see below                     |

`--save-to` does not control whether rows reach the fixture DB. Generation inserts them first, then
`--save-to` decides what else happens: `file` also writes JSON, `none` also prints JSON, `db` prints
nothing extra. There is no dry-run mode.

`--save-to file:name.json` writes every selected entity to that one filename in sequence, so with
more than one entity only the last survives. Plain `--save-to file` uses each entity's table name
and is safe for multiple entities. Both write under `test/fixtures/`.

There is no `--locale` on `fixture gen`; the locale is fixed to `ko`. That selects the Korean mapping
table, which is Korean for person, address, and company props — but `title`, `description`, and
`content` map to `faker.lorem.*` in every locale, so those come out as Latin filler regardless.

### Entities are not ordered for you

Relation values are resolved by querying the fixture DB at generation time, while the topological
sort happens later, at insert time. Rows created earlier in the same run are still in memory, not in
the DB, so they cannot satisfy a foreign key. Generate parents in a separate earlier command:

```bash
pnpm sonamu fixture gen --include Company --count 5   # first
pnpm sonamu fixture gen --include Department --count 10
```

If the fixture DB has no eligible `Company` yet, a single command naming both fails on the
non-nullable relation regardless of the order you list them in. A pre-existing `Company` can satisfy
the relation, but a `Company` generated in that same command cannot:

```
FixtureGenerator: Department.company에 필요한 Company 데이터가 없습니다. 먼저 Company를 생성하거나 cone.dataSource를 설정하세요.
```

A nullable relation with nothing to point at gets `null` instead of throwing.

### Including `User` switches to a different path

Whenever the selection contains `User`, the command prompts for a mode before doing anything, even
with every option supplied. Choosing "로그인 가능한 사용자 fixture 생성":

- writes to the **current environment's DB**, not the fixture DB
- generates only `User`; every other selected entity is ignored, including under `--all`
- creates each user through the better-auth `sign-up/email` handler with the password `Test1234!`,
  then sets `email_verified = true` on the `users` table directly
- ignores `--save-to` entirely and prints the created credentials
- skips, with a warning, any email that already exists

The login-capable branch needs auth configured; without it, `Sonamu.auth.handler` throws. Choosing
"확인용 데이터" does not use the auth handler and falls back to the normal fixture-DB path.

### Cancelling the save-target prompt still writes rows

A non-interactive `fixture gen` is possible, but every prompt has to be pre-answered: `--include`
or `--all`, `--count`, `--save-to`, `--use-llm`, and no `User` in the selection. There is no
`--no-llm`, so the only way to skip the LLM confirm is to turn LLM generation on, and the `User`
mode prompt has no flag at all.

Cancelling is not uniform across those prompts:

| Prompt                                                       | Cancelled or left empty                              |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| Entity selection, count, `User` mode, `file:custom` filename | Prints `취소되었습니다` and returns, generating nothing |
| LLM confirm                                                  | Read as `false`; the run continues without LLM       |
| Save target                                                  | Not guarded — the run continues with no target       |

The save-target case is the damaging one. Generation runs to completion and inserts every row into
the fixture DB *before* the target is read, so cancelling there produces rows and then crashes on
the missing value:

```
Fixture 생성 중 오류가 발생했습니다.
...
TypeError: Cannot read properties of undefined (reading 'startsWith')
```

Cancelling that prompt is not an abort — the fixture DB has the rows. Pass `--save-to` so the
prompt never appears. The guarded prompts, by contrast, exit `0`, so a wrapper script reading only
the exit code cannot tell a cancel from a successful run.

### `--use-llm`

Without it, values come from faker, so data is structurally valid but semantically arbitrary. With
it, each prop's `cone.note` is sent to the LLM. A prop with no note is not sent at all and falls
back to faker either way, so check the notes first and refresh thin ones with
`pnpm sonamu cone gen <EntityId> --regenerate`. Model is fixed at `claude-sonnet-4-6`.

`--no-cache` is narrower than it reads. The normal path generates a whole row in one call and always
caches those values to hand out to the remaining props of that row; `--no-cache` does not turn that
off. It only disables the separate cache keyed by entity, prop, and note text, which is consulted by
the single-field fallback — the path taken when the row response comes back missing that field. So
the flag changes call volume only for those retries, never for the per-row call.

## fixture fetch

```bash
pnpm sonamu fixture fetch --include User,Post --strategy recent --limit 20
```

| Option                | Effect                                                     |
| --------------------- | ---------------------------------------------------------- |
| `--include` / `--all` / `--exclude` | Same as `fixture gen`                        |
| `--strategy <s>`      | `recent` \| `sample` \| `random`, default `recent`          |
| `--limit <n>`         | Rows per entity, default `10`                              |

Relations come along to `maxDepth: 2`, so fetching `Post` also imports its author and that author's
own `BelongsToOne` targets. The row count in the fixture DB exceeds `--limit` accordingly.

`recent` orders by the entity's `created_at` column and silently skips ordering when there is none,
which makes it behave like an unordered `limit`.

## fixture explore

```bash
pnpm sonamu fixture explore --include User --strategy recent --limit 10
```

Reads the current environment and prints a table; nothing is written. Default strategy is `sample`,
unlike `fetch`. `--include` takes exactly one EntityId — a comma-separated list throws on entity
lookup, and `--all`/`--exclude` are not read.

## Reference map

| Need | Read |
| --- | --- |
| Why a value came out the way it did, LLM behavior, silent fallbacks, sequence reset | `references/generation.md` |
| cone keys and what each one accepts, `cone gen`, dataSource strategies | `references/cone.md` |
