---
name: sonamu-migration
description: Generates and applies Sonamu database migrations. Use when a schema change needs a migration, a migration fails or conflicts, FK ordering breaks an apply, or a primary key type must change. Covers sonamu migrate generate/run/apply/status, up and down functions, and CREATE/ALTER TABLE output.
---

# Migration

## Migrations are generated, not written

Sonamu diffs `entity.json` against the DB and emits the migration, so a hand-written file or a direct
`CREATE TABLE` / `ALTER TABLE` leaves the schema and the entity definition describing different
things — and the next generate run tries to reconcile the gap. That holds for a PK type change too:
edit the `id` prop and generate, and Sonamu writes the whole FK-drop → alter → FK-restore sequence
itself. See `references/pk-type-change.md`, which is worth reading before generating one — the run
also emits per-table files that have to be deleted.

The generator reads `entity.json` from disk, so no sync step is needed first. It does require
every existing migration to be applied to at least one DB, or it exits with:

```
마이그레이션 파일을 생성하려면 기존 마이그레이션이 최소 하나의 DB에 모두 적용되어 있어야 합니다.
```

Run `pnpm sonamu migrate status` to see what is pending, then `pnpm sonamu migrate run`.

Method 1: Sonamu UI

1. Open Sonamu UI in browser: `http://localhost:34900/sonamu-ui`
2. Check the prepared list in the Migration menu
3. Generate a migration file with the "Generate" button
4. Apply to the actual DB with the "Apply" button

Method 2: CLI

```bash
cd packages/api
pnpm sonamu migrate generate   # Generate migration file
pnpm sonamu migrate run         # Apply to actual DB
```

Cascading changes across tables belong in one file. A sequence like FK drop → type change → FK
restore leaves the schema in a state that violates its own constraints between steps, and each
migration file is applied on its own — so splitting the sequence fails at the first file.

## Basic Structure

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Apply changes
}

export async function down(knex: Knex): Promise<void> {
  // Rollback changes
}
```

## CREATE TABLE

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (table) => {
    table.increments().primary();
    table.string("email", 255).notNullable();
    table.string("username", 255).notNullable();
    table.text("role").notNullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.unique(["email"], "users_email_unique");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("users");
}
```

## ALTER TABLE

```typescript
// Add column
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("phone", 20).nullable();
  });
}

// Drop column
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumns("phone");
  });
}
```

## FOREIGN KEY

```typescript
export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    table.foreign("user_id").references("users.id").onUpdate("CASCADE").onDelete("CASCADE");
    table
      .foreign("department_id")
      .references("departments.id")
      .onUpdate("CASCADE")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    table.dropForeign(["user_id"]);
    table.dropForeign(["department_id"]);
  });
}
```

## Commands

Run from the `packages/api` directory:

```bash
cd packages/api
pnpm sonamu migrate run      # Run all pending migrations on local DB
pnpm sonamu migrate status   # Check migration status
pnpm sonamu migrate apply    # Apply to a specific DB configuration target
```

Note: `migrate up` and `migrate rollback` are not provided in the CLI. Rollback is available from Sonamu UI.

## Entity Type → DB Type

| Entity         | DB                        | Knex                                        |
| -------------- | ------------------------- | ------------------------------------------- |
| `string`       | `varchar(n)` / `text`     | `table.string(name, length)`                |
| `string[]`     | `varchar(n)[]` / `text[]` | `table.specificType(name, 'text[]')`        |
| `integer`      | `integer`                 | `table.integer(name)`                       |
| `integer[]`    | `integer[]`               | `table.specificType(name, 'integer[]')`     |
| `bigInteger`   | `bigint`                  | `table.bigInteger(name)`                    |
| `bigInteger[]` | `bigint[]`                | `table.specificType(name, 'bigint[]')`      |
| `boolean`      | `boolean`                 | `table.boolean(name)`                       |
| `boolean[]`    | `boolean[]`               | `table.specificType(name, 'boolean[]')`     |
| `number`       | `numeric(p,s)`            | `table.decimal(name, p, s)`                 |
| `numeric`      | `numeric(p,s)`            | `table.decimal(name, p, s)`                 |
| `date`         | `timestamptz`             | `table.timestamp(name, { useTz: true })`    |
| `date[]`       | `timestamptz[]`           | `table.specificType(name, 'timestamptz[]')` |
| `uuid`         | `uuid`                    | `table.uuid(name)`                          |
| `uuid[]`       | `uuid[]`                  | `table.specificType(name, 'uuid[]')`        |
| `json`         | `jsonb`                   | `table.jsonb(name)`                         |
| `enum`         | `text`                    | `table.text(name)`                          |
| `vector`       | `vector(n)`               | `table.specificType(name, 'vector(n)')`     |
| `vector[]`     | `vector(n)[]`             | `table.specificType(name, 'vector(n)[]')`   |
| `tsvector`     | `tsvector`                | `table.specificType(name, 'tsvector')`      |

## Execution order

Tables are created with their FK columns but no constraints; the constraints come after every
referenced table exists. Otherwise a FK points at a table that has not been created yet:

```
1. CREATE TABLE companies       (no dependencies)
2. CREATE TABLE departments     (company_id column only)
3. CREATE TABLE users           (no dependencies)
4. CREATE TABLE employees       (user_id, department_id columns only)
5. FOREIGN KEY departments      (company_id → companies.id)
6. FOREIGN KEY employees        (user_id → users.id, etc.)
```

`down` is what makes the migration reversible — an empty `down` cannot be rolled back.

## When sync fails

### 1. The built config is missing

`sonamu sync` loads `dist/sonamu.config.js`, so the API package has to have been built at least
once:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../api/dist/sonamu.config.js'
```

```bash
cd packages/api
pnpm build
```

A running `pnpm dev` sets `HOT=yes`, which switches the loader to `src/sonamu.config.ts` — that path
needs no build, which is why the same command can work in one shell and fail in another.

### 2. Verify DB Connection

```bash
# Check Docker containers
docker ps | grep container

# Check DB configuration in sonamu.config.ts
# - host, port, database, user, password
# - Distinguish PostgreSQL vs MySQL
```

### 3. Circular References

Split the migration, or set the FK to nullable and add it later.

## Full Workflow

```bash
cd packages/api

# 1. Build once, so sync can load dist/sonamu.config.js (skip if pnpm dev is running)
pnpm build

# 2. Run sync
pnpm sonamu sync

# 3. Generate and apply the migration
pnpm sonamu migrate generate
pnpm sonamu migrate run

# 4. Run scaffolding
pnpm sonamu scaffold model YourEntity   # and model_test / view_list / view_form as needed

# 5. Check/add orderBy cases in model (see sonamu-query's references/model-patterns.md)

# 6. Build API
pnpm build

# 7. Check/fix web form (see sonamu-frontend)

# 8. Build web
cd ../web && pnpm build
```
