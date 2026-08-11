# Failure and recovery

Start every recovery by checking which files are pending on which database:

```bash
pnpm sonamu migrate status
```

`migrate status` reads migration files and queries each allowed writable target. A missing
`knex_migrations` table is treated as a new database: every source migration is pending and the
current version is `none`.

A connection-check failure or a non-missing-table failure from Knex `migrate.status()` reports that
target with `status: "error"`. A `migrate.list()` failure is different: Sonamu keeps the status
value computed separately, sets `pending` to an empty array, and puts the failure message in the
top-level `error` field. A migration-history validation failure can therefore retain numeric
`status: 0`. A `currentVersion()` failure likewise sets the top-level error while reporting
`currentVersion: "error"`.

Treat a top-level `error`, empty pending data paired with a history error, or otherwise inconsistent
history as unresolved even when a target says `status: 0`. Do not use that target to generate a
migration.

## Generation cannot find a current comparison database

`migrate generate` exits with:

```text
마이그레이션 파일을 생성하려면 기존 마이그레이션이 최소 하나의 DB에 모두 적용되어 있어야 합니다.
```

At least one target must have `status: 0`, and the status result must have no top-level `error` or
inconsistent migration history. The CLI generation gate checks only for numeric `status: 0`, so
inspect the full `pnpm sonamu migrate status` output before generating. In particular, a missing
applied filename can make `migrate.list()` fail while the independently calculated status remains
`0`; restore the filename as described below instead of generating against that database.

When the history is consistent but migrations are pending, apply them with
`pnpm sonamu migrate run` when it is the current environment, or select the target with the
interactive `pnpm sonamu migrate apply`, then generate again. A target with `status: "error"` needs
its connection or status failure fixed first.

## The built config is missing

A standalone migration command normally loads `dist/sonamu.config.js`. From the API package root:

```bash
pnpm build
pnpm sonamu migrate status
```

The dev-server process uses the source config because its own environment has `HOT=yes`; that does
not change config loading in another shell.

## Apply fails inside a migration

Sonamu calls Knex `migrate.latest()` once per unique target and processes targets sequentially.
Generated files do not opt out of transactions. With the default Knex migration configuration, the
pending batch for one target is wrapped in a transaction; a project's
`database.defaultOptions.migrations.disableTransactions` setting or a manual migration-level
transaction override can change that behavior.

After a failure:

1. Run `migrate status` and identify the failing target and pending filename.
2. If the file is still pending on every target shown by status, also check any environment that is
   not visible from this runtime. Correct its `up`/`down` only when none has applied it, then rerun
   the same apply command.
3. If another target already applied that filename, editing it will not update that target. Use a
   new corrective migration, or use the UI rollback path on the affected latest batch when its
   generated `down` is safe.

The CLI exposes `run`, `apply`, `generate`, and `status`; it does not expose a rollback command.
Sonamu UI rollback calls Knex rollback for the latest batch on each selected target. A generated
`down` can still fail or lose data, so inspect it before using rollback as recovery.

## An applied migration file is missing

Knex rejects an applied filename that is absent from the source directory with:

```text
The migration directory is corrupt, the following files are missing: ...
```

Restore the exact missing filename. A newly generated file has a different timestamp and does not
satisfy the recorded migration history.

Sonamu UI also refuses to delete a selected file when any visible target has already applied it:

```text
You cannot delete a migration file if there is already applied. Applied codes: ...
```

## The migration table is locked

Knex serializes migration runs with `knex_migrations_lock`. `Migration table is already locked`
means another run holds the lock or a previous abnormal termination left it stale. Sonamu has no
CLI unlock command. Confirm no migration is active, then use the project's approved Knex/database
recovery procedure before retrying; do not delete or rename migration files to bypass the lock.
