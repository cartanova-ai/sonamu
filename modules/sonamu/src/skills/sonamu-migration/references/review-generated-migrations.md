# Review generated migrations

Generated migration files are ordinary Knex TypeScript modules with `up(knex)` and `down(knex)`.
Knex executes each source migration filename that is absent from that database's migration history.

## Keep the target schema in entity definitions

Edit `entity.json` for the intended steady-state table shape, then generate. Directly changing the
database or writing modeled column/index/FK DDL that is absent from the entity definition leaves a
difference that the next `migrate generate` tries to reverse or reconcile.

The generated file is the starting point, not a protected artifact. Edit it before its first apply
when the desired transition cannot be inferred from the before-and-after schemas.

## Cases that need inspection or a manual edit

### Rename a column

Sonamu matches columns by name. A rename is generated as dropping the old column and adding the new
one, which loses the old column's data. Replace both `up` and `down` with a rename operation when the
intent is to preserve that data.

### Backfill before a constraint

An added non-null column without `dbDefault` is emitted directly from its entity definition. The
generator does not invent a value for existing rows. Add the required backfill and order the
statements so existing data satisfies the new constraint.

### Convert data while changing a type

Ordinary column changes use Knex `.alter()`. Sonamu cannot infer domain-specific conversions. Add
the explicit conversion needed by existing rows, and make `down` honest about whether the change is
reversible. Primary-key type changes use a separate raw-DDL path described in
[pk-type-change.md](pk-type-change.md).

### Drop a column or remove an entity

Generated `down` can recreate a dropped column definition, but it cannot restore values deleted by
`up`. Preserve or archive data explicitly when rollback must restore them.

Removing an entity does not generate a table drop: comparison iterates the entities that are still
loaded. Add an explicit migration when the corresponding database table should be removed.

### Add a data-only migration

A data-only transition has no entity-schema diff, so `migrate generate` cannot create it. Add a
timestamped `.ts` migration under `src/migrations` with explicit `up` and `down` behavior. Keep
modeled schema changes represented in entity definitions even when a data step shares the same
file.

## Applied files are history

Editing an already-applied file does not rerun it on that database, while an unapplied target reads
the edited contents. That creates different transitions under one migration name. Check
`pnpm sonamu migrate status` before editing or deleting a file. When any target has applied it, use a
new forward migration. The UI can roll back the latest batch, but changing the original file is
consistent only after every target that recorded it has rolled it back and its `down` completed
safely.

## New-table FK ordering

Sonamu intentionally emits a table's columns and indexes separately from its FKs. It orders all
normal create files before foreign create files so every referenced table exists before constraints
are added. Do not treat this split as a missing FK.
