# Generate and apply

## Work from the API package root

Use the directory containing `src/sonamu.config.ts` and that package's `package.json`. In a
workspace, either change to that directory or use the package manager's filter form:

```bash
pnpm sonamu migrate status
# or, from the workspace root
pnpm --filter <api-package-name> sonamu migrate status
```

Sonamu fixes generation locations relative to this API root:

- entity input: `src/application/**/*.entity.json`
- generated-file catalog and output: `src/migrations/*.ts`

Do not embed a repository-specific package path in scripts or instructions.

The generated database config also points Knex status/list/apply operations at `./src/migrations`
by default. A project can override Knex options through `database.defaultOptions`; changing
`migrations.directory` redirects those Knex operations while Sonamu's own file catalog and writer
remain on `src/migrations`. Keep those paths aligned.

## Standalone config loading

Migration commands initialize Sonamu before running. A normal standalone CLI process imports
`dist/sonamu.config.js`; a dev-server process with `HOT=yes` imports `src/sonamu.config.ts`.
Starting a dev server in another shell does not set `HOT` for a separate CLI process.

If the standalone command reports that `dist/sonamu.config.js` is missing, build from the API
package root and retry:

```bash
pnpm build
```

## Generate from entity definitions and a current database

```bash
pnpm sonamu migrate status
pnpm sonamu migrate generate
```

Generation requires at least one writable database target whose migration status is `0`. Sonamu
uses that target as the comparison database, reads its live PostgreSQL table schema, and compares it
with the loaded entity definitions. If no table exists, it generates create files; otherwise it
generates alter files.

Files are written as `src/migrations/<timestamp>_<title>.ts`, with timestamps one second apart.
For new tables, column/index files have type `normal` and FK files have type `foreign`; Sonamu moves
all `foreign` files after all `normal` files so referenced tables can be created first.

Generation does not apply the files and does not run `sonamu sync`. Review every new migration
before choosing an apply command.

## Choose the apply command

| Command | Targets and behavior |
| --- | --- |
| `pnpm sonamu migrate run` | Calls Knex `migrate.latest()` for the current `NODE_ENV`; in `test`, it targets both `test` and `fixture`. |
| `pnpm sonamu migrate apply` | Opens the CLI multiselect, then calls `migrate.latest()` for the selected targets. Invoke it without positional target arguments. |
| Sonamu UI Migration apply | Uses the targets selected in the UI and can add configured approval handling. |

On a local runtime, writable configured targets are available and readonly keys are excluded. On a
non-local runtime, Sonamu permits only the target matching the current environment. Passing a
disallowed target fails with `Migration targets are not allowed in NODE_ENV=...`.

Selected databases are deduplicated by host, port, and database, then migrated sequentially. A
failure on a later target does not undo a target that completed earlier; use `migrate status` to
compare targets after any failure.
