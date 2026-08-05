# PK Type Change

Changing a primary key's type — `integer` → `text`, `bigint` → `uuid` — cannot be done column by
column. PostgreSQL refuses to alter a column an FK constraint points at, so the PK and every
referencing FK have to change inside one transaction-shaped sequence.

Sonamu detects this case and writes that sequence for you. This path emits raw PostgreSQL DDL, so it
is Postgres-only.

## Generating it

Change the `id` prop's type in `entity.json` and generate:

```bash
pnpm sonamu migrate generate
```

Every `BelongsToOne` pointing at the entity follows automatically — a relation column takes the
referenced entity's id type, so each FK column changes in the same pass with no hand-editing.

The detector fires on `type` **or** `length`, so widening `varchar(64)` to `varchar(191)` on a PK
takes this path too, not the ordinary alter path.

The output is one consolidated `alter_<table>_pk_type` file, in a fixed order:

1. drop the FK constraints of every referencing table
2. drop self-referencing FKs, if any
3. drop the PK constraint
4. change the PK column type
5. change every referencing FK column type
6. restore the PK constraint
7. restore self-referencing FKs
8. restore the FK constraints

```typescript
// abbreviated — the generated file lists every referencing table
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_foreign"');
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT "users_pkey"');
  await knex.raw('ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text');
  await knex.raw('ALTER TABLE "accounts" ALTER COLUMN "user_id" TYPE text USING "user_id"::text');
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")');
  await knex.raw(
    'ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE',
  );
}
```

The referencing tables, their FK constraint names, and their `ON UPDATE` / `ON DELETE` actions are
read from the live schema, so the generator needs the DB it is diffing against to be current. `down`
mirrors the same shape with the cast reversed.

The **PK** constraint name is the one thing not read from the schema — it is written as
`<table>_pkey`, PostgreSQL's default. A table whose PK constraint was named something else fails on
the `DROP CONSTRAINT` line, and the fix is to correct that one name in the generated file.

A `string` PK becomes `varchar(N)` when the prop declares a `length` and `text` when it does not;
`uuid` stays `uuid`; everything else is written as `integer`.

Existing values are converted in place by the `USING` cast, so id `42` becomes `"42"`. Anything that
sorted or compared ids numerically is wrong afterwards.

## Delete the per-table migrations from the same run

The consolidated file covers the parent table. Each child table is still diffed on its own, and its
diff also shows the FK column changing type — so the same `migrate generate` run emits an
`alter_<child>` file per referencing table, each redoing work the consolidated file already does:

```
20260203154926_alter_accounts.ts        ← changes accounts.user_id only
20260203154930_alter_sessions.ts        ← changes sessions.user_id only
20260203154931_alter_users_pk_type.ts   ← consolidated, changes everything
```

Migrations run in filename order, and the timestamps are assigned in generation order — which sorts
plain alters ahead of FK-constraint files, and nothing else. Whether a child file lands before or
after the consolidated one is down to entity iteration order, so do not read the example above as the
order you will get.

A child file that lands first is the case that fails: it alters the FK column while the PK still has
its old type and the constraint is still in place, and PostgreSQL rejects the pair as incompatible
types. Landing after is not a fix either — the change has already been applied, so the file is at
best redundant.

Keep `alter_<table>_pk_type` and delete the others. If a per-table file also carries unrelated
changes, strip only its FK-column lines rather than deleting the file.

## The consolidated file is the whole diff for that table

Detection returns the PK migration and stops — every other pending change to that same table in that
run is dropped, with no warning. A new column added in the same edit simply does not appear in the
output, and the next `migrate generate` picks it up as if it were never requested.

So change the PK on its own: generate and apply the PK migration first, then make the rest of the
edits and generate again.

## Then apply

```bash
pnpm sonamu migrate run              # applies to the current environment's DB targets
pnpm sonamu migrate apply <targets>  # applies to specific DB targets
```

`sonamu sync` propagates the new id type through the generated types, so the compiler surfaces the
rest: subset types, `SaveParams`, list params, and the generated client all change together.
Hand-written signatures that took an id are the ones the compiler cannot fix for you.

## Verifying a constraint name

FK names come from the schema and match. The PK name is assumed, and a hand-edited migration has no
guarantee either way:

```sql
SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'users';
```
