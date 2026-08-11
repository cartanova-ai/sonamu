# Primary-key type or length changes

Read this before changing the `id` prop's type or the length of a string `id`. Sonamu detects either
difference and emits one PostgreSQL-specific `alter_<table>_pk_type` migration.

## Generate one isolated PK change

Change only the `id` prop, then run:

```bash
pnpm sonamu migrate generate
```

The PK branch returns before generating other column or index changes for that table. Foreign-key
definition changes are compared separately, but another column or index edited in the same pass can
be absent from the generated files without a warning. Apply the PK change and generate again for
the remaining entity changes.

For a relation or join table represented by entity definitions, the FK column type is derived from
the referenced entity's `id`. Those tables therefore appear changed in the same comparison.

## What the consolidated file does

The generated `up` function:

1. reads live foreign keys whose referenced table is the changed table in the `public` schema;
2. drops external and self-referencing FK constraints;
3. drops the `<table>_pkey` constraint;
4. alters `id` with `USING "id"::<new type>`;
5. alters every discovered referencing column with the same cast;
6. recreates the PK, self-referencing FKs, and external FKs.

`down` emits the same sequence with the old type. All statements are in one migration file, so the
normal Knex transaction setting can keep the constraint and type changes together.

## Review these generated assumptions

The special generator is intentionally narrow. Check every item before applying its output:

- `string` maps to `varchar(length)` when `length` exists and to `text` otherwise; `uuid` maps to
  `uuid`; every other declared `id` type maps to `integer`. In particular, declaring a `bigInteger`
  `id` does not make this path emit `bigint`.
- The PK constraint name is not read from the database. Both `up` and `down` use `<table>_pkey`.
  Replace that literal in the generated file when the live PK has a custom name.
- FK constraint names and `ON UPDATE` / `ON DELETE` actions come from the live schema. Recreated FKs
  always reference the changed table's `id`, and each result row is treated as a single-column FK.
  Review the file when the database has composite FKs or FKs to another unique column.
- `USING` is a direct PostgreSQL cast. Existing values must be convertible in both directions for
  `up` and `down`; for example, arbitrary text cannot be cast to integer or UUID. Replace the cast or
  add a data-conversion step when that condition is false.
- The generated file changes column types and constraints only. It does not replace an integer
  sequence/default with an ID-generation strategy for the new type.
- A later rollback can fail after new-format IDs have been inserted even when the original `up`
  cast succeeded. `down` is generated code to review, not proof that the data conversion is
  reversible.

## Remove overlapping FK-column alterations

The consolidated file already alters every live referencing column it discovers. The same generate
run can also write ordinary `alter_<referencing table>...` files because relation and join-table
columns changed in their own entity comparisons.

Inspect all files created by that run. In each ordinary file, remove the `up` and `down` alteration
for an FK column already handled by `alter_<table>_pk_type`. Delete an ordinary file only when those
are its only operations and no target has applied it. Keep unrelated operations in that file.

Do not rely on timestamps to make duplicate alterations harmless. Generated timestamps follow the
prepared-code order, and ordinary files can land on either side of the consolidated file.

After cleanup, apply with `pnpm sonamu migrate run` for the current environment or use the
interactive `pnpm sonamu migrate apply` target selector. `pnpm sonamu sync` updates generated
TypeScript types separately; it does not apply the database migration.
