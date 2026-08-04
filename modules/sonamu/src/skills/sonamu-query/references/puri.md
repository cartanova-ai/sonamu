# Puri — Query Building

## Starting a Query

```typescript
// Read
const users = await this.getPuri("r").table("users").select({ id: "id", name: "username" });

// Write
await this.getPuri("w").table("users").where("id", 1).update({ is_active: false });

// Using aliases
const users = await db.table({ u: "users" }).select({ id: "u.id" });
```

### Where to obtain a Puri instance

Route every query — reads and writes alike — through Puri. Do NOT run queries directly on a raw `getDB()` knex handle (the only exceptions are migration files, `db.ts`, tests, and the `.knex` escape hatch below).

```typescript
// Inside a Model
const rows = await this.getPuri("r").table("users").select({ id: "id" });

// Inside a Frame — Frame has no getPuri (only getDB / getUpsertBuilder),
// so use the associated Model's getPuri
const rows = await UserModel.getPuri("r").table("users").select({ id: "id" });

// Outside a Model (seed / batch / monitoring scripts) — wrap knex in a PuriWrapper
import { DB, PuriWrapper, UpsertBuilder } from "sonamu";
const puri = new PuriWrapper(DB.getDB("r"), new UpsertBuilder());
const rows = await puri.table("users").select({ id: "id" });
```

`UpsertBuilder` is a required constructor argument even for read-only wrappers; it simply stays unused for pure reads.

### Escape hatch: `.knex` for non-entity / framework-internal tables

Puri's typed `.table()` only knows registered entity tables. For framework-internal or unregistered tables (e.g. `workflow_runs`), reach the raw knex handle via `puri.knex` instead of calling `DB.getDB()` directly:

```typescript
const puri = new PuriWrapper(DB.getDB("r"), new UpsertBuilder());
const runs = await puri.knex.table("workflow_runs").where("status", "running").select("*");
```

## SELECT

`.select()` takes an object argument, not strings. A string argument is spread
character-by-character, producing SQL like `select "i" as "0", "d" as "1", ...` — valid SQL that
selects nonsense. The type signature catches this, so it only slips through when the chain follows
an `as any` cast.

```typescript
// WRONG — character spread bug
db.table("files").select("files.entity_id", "files.file_type");

// CORRECT
db.table("files").select({ entity_id: "files.entity_id", file_type: "files.file_type" });
```

```typescript
// Basic select
const users = await db.table("users").select({ id: "id", name: "username" });

// All columns
const users = await db.table("users").selectAll();

// Nested objects (auto-converted during hydration)
db.select({
  id: "users.id",
  parent: {
    id: "parent.id",
    name: "parent.name",
  },
});

// Append to existing select
db.select({ id: "id" }).appendSelect({ name: "username" });
```

## Static Functions (for SELECT)

### Aggregate Functions

```typescript
// COUNT
const [{ total }] = await db.table("users").select({ total: Puri.count() });
const [{ cnt }] = await db.table("users").select({ cnt: Puri.count("id") });

// SUM / AVG / MAX / MIN
db.select({
  totalAmount: Puri.sum("amount"),
  avgPrice: Puri.avg("price"),
  maxScore: Puri.max("score"),
  minAge: Puri.min("age"),
});
```

### String Functions

```typescript
db.select({
  fullName: Puri.concat("first_name", "' '", "last_name"),
  upperName: Puri.upper("name"),
  lowerEmail: Puri.lower("email"),
});
```

### Raw SQL Expressions

Bind parameters can be passed as the second argument `params`. Do not interpolate values directly into SQL; use params instead.

```typescript
// Without parameters
db.select({
  custom: Puri.rawString("COALESCE(nickname, username)"),
  total: Puri.rawNumber("price * quantity"),
  isActive: Puri.rawBoolean("status = 'active'"),
  expireAt: Puri.rawDate("created_at + INTERVAL '30 days'"),
  tags: Puri.rawStringArray("string_to_array(tags, ',')"),
});

// Bind with params array (prevents SQL injection)
db.select({
  score: Puri.rawNumber(
    `word_similarity(?, items.title) * 5 + word_similarity(?, items.tags) * 2`,
    [query, query],
  ),
  label: Puri.rawString(`COALESCE(??, ?)`, ["items.name", "Unspecified"]),
});
```

## WHERE

```typescript
// Basic
db.where("role", "admin");
db.where("age", ">=", 18);
db.where("deleted_at", null); // IS NULL
db.where("deleted_at", "!=", null); // IS NOT NULL

// Multiple conditions (AND)
db.where("role", "admin").where("is_active", true);

// IN / NOT IN
db.whereIn("role", ["admin", "moderator"]);
db.whereNotIn("status", ["deleted", "banned"]);

// LIKE
db.where("email", "like", `%${keyword}%`);

// Raw WHERE
db.whereRaw("EXTRACT(YEAR FROM created_at) = ?", [2024]);
```

### WHERE Grouping (Parentheses)

```typescript
// (role = 'admin' OR role = 'moderator') AND is_active = true
db.whereGroup((g) => {
  g.where("role", "admin").orWhere("role", "moderator");
}).where("is_active", true);

// OR group
db.where("status", "active").orWhereGroup((g) => {
  g.where("role", "admin").where("is_verified", true);
});
```

### JSONB Containment (`@>`)

Use `whereJsonSupersetOf()` to require a JSONB column to contain a JSON value. The column and
containment value are checked against the generated Entity type, and the value is serialized and
bound internally.

```typescript
db.table("products").whereJsonSupersetOf("metadata", { warranty: 2 });

// Aliased columns are supported.
db.table({ p: "products" }).whereJsonSupersetOf("p.metadata", {
  tags: ["featured"],
});
```

Inside a WHERE group, both AND and OR variants are available:

```typescript
db.whereGroup((g) => {
  g.where("status", "active").orWhereJsonSupersetOf("metadata", {
    tags: ["featured"],
  });
});
```

Do not call `JSON.stringify()` yourself. For other JSONB operators such as `->>`, `->`, and `?`,
continue to use parameterized `whereRaw()`.

## JOIN

```typescript
// INNER JOIN
db.table("employees")
  .join("users", "employees.user_id", "users.id")
  .select({ empId: "employees.id", userName: "users.username" });

// LEFT JOIN
db.table("employees").leftJoin("departments", "employees.department_id", "departments.id");

// Using aliases
db.table({ e: "employees" })
  .join({ u: "users" }, "e.user_id", "u.id")
  .leftJoin({ d: "departments" }, "e.department_id", "d.id");

// Complex JOIN conditions with callback
db.table("orders").join("products", (j) => {
  j.on("orders.product_id", "products.id").on("orders.store_id", "products.store_id");
});

// Subquery JOIN
const subquery = db
  .table("order_items")
  .select({ order_id: "order_id", total: Puri.sum("amount") })
  .groupBy("order_id");

db.table("orders")
  .join({ oi: subquery }, "orders.id", "oi.order_id")
  .select({ id: "orders.id", total: "oi.total" });
```

### Reusing generated JOINs

Use `ensureJoin()` or `ensureLeftJoin()` when a Model adds a JOIN that may already have been added
by a Subset query.

```typescript
db.table("patient_timeline_events")
  .ensureJoin(
    { patient: "patients" },
    "patient_timeline_events.patient_id",
    "patient.id",
  )
  .where("patient.organization_id", organizationId);
```

Puri compares JOINs by alias. If the alias, table, JOIN type, left column, and right column all
match, the existing JOIN is reused. If the alias is new, the JOIN is added. Reusing an alias with a
different definition throws an error before SQL execution.

Different aliases for the same physical table remain valid:

```typescript
db.table("documents")
  .ensureJoin({ created_by: "users" }, "documents.created_by_id", "created_by.id")
  .ensureJoin({ updated_by: "users" }, "documents.updated_by_id", "updated_by.id");
```

`ensureJoin()` and `ensureLeftJoin()` support table equality JOINs only. Callback and subquery JOINs
continue to use `join()` or `leftJoin()` and are not considered reusable.

## ORDER BY & LIMIT

```typescript
db.orderBy("created_at", "desc").limit(20).offset(40); // Page 3
```

### NULLS position & array form

`orderBy` has two overloads:

1. Single column: `orderBy(column, direction?, nulls?)` — `nulls` is `"first" | "last"`
2. Array: `orderBy(entries[])` — each entry is a column string, a `Puri.raw*` SQL expression, or an object `{ column, order?, nulls? }`

```typescript
// Single column with NULLS position
db.orderBy("published_at", "desc", "last");

// Array form: multiple sort keys, per-key direction and NULLS
db.orderBy([
  { column: "is_pinned", order: "desc" },
  { column: "published_at", order: "desc", nulls: "last" },
  "title", // bare string defaults to asc
]);

// Sort by a SQL expression
db.orderBy([Puri.rawNumber("view_count * 2"), { column: "id", order: "desc" }]);
```

## GROUP BY & HAVING

```typescript
db.table("orders")
  .select({
    userId: "user_id",
    total: Puri.sum("amount"),
    count: Puri.count(),
  })
  .groupBy("user_id")
  .having("COUNT(*) > 5");

// Column, operator, value form
db.groupBy("user_id").having("count", ">", 10);
```

## INSERT

```typescript
// Basic INSERT
await db.table("users").insert({ username: "john", email: "john@test.com" });

// RETURNING
const [{ id }] = await db.table("users").insert({ username: "john" }).returning("id");

// Multiple columns RETURNING
const [row] = await db.table("users").insert({ username: "john" }).returning(["id", "created_at"]);

// All columns RETURNING
const [user] = await db.table("users").insert({ username: "john" }).returning("*");
```

### INSERT onConflict (Upsert)

```typescript
// DO NOTHING
await db.table("users").insert({ id: 1, username: "john" }).onConflict("id"); // or .onConflict("id", "nothing")

// DO UPDATE - specific columns only
await db
  .table("users")
  .insert({ id: 1, username: "john", email: "new@test.com" })
  .onConflict("id", { update: ["username", "email"] });

// DO UPDATE - with specified values
await db
  .table("users")
  .insert({ id: 1, username: "john" })
  .onConflict("id", {
    update: {
      username: "updated_john",
      updated_at: Puri.rawDate("NOW()"),
    },
  });

// Composite key conflict
await db
  .table("user_settings")
  .insert({ user_id: 1, key: "theme", value: "dark" })
  .onConflict(["user_id", "key"], { update: ["value"] });
```

## UPDATE

```typescript
await db.table("users").where("id", 1).update({ username: "updated" });

// INCREMENT / DECREMENT
await db.table("users").where("id", 1).increment("points", 10);
await db.table("users").where("id", 1).decrement("credit", 100);
```

## DELETE

```typescript
await db.table("users").where("id", 1).delete();
```

## Result Methods

| Method         | Returns                   | Description                     |
| -------------- | ------------------------- | ------------------------------- |
| `await query`  | `T[]`                     | Array result (Puri is Thenable) |
| `first()`      | `Promise<T \| undefined>` | First record                    |
| `pluck("col")` | `Promise<V[]>`            | Array of a specific column only |

```typescript
const users = await db.table("users").select({ id: "id" }); // T[]
const user = await db.table("users").where("id", 1).first(); // T | undefined
const ids = await db.table("users").where("role", "admin").pluck("id"); // number[]
```

## Utilities

```typescript
// Inspect query string
const sql = db.table("users").where("id", 1).toQuery();

// Debug log output (prints query to console, then continues chaining)
await db.table("users").where("id", 1).debug().first();

// Clone a query
const baseQuery = db.table("users").where("is_active", true);
const query1 = baseQuery.clone().where("role", "admin");
const query2 = baseQuery.clone().where("role", "user");

// Clear parts of a query
db.clear("select"); // Clear SELECT clause
db.clear("order"); // Clear ORDER BY
db.clear("limit"); // Clear LIMIT
db.clear("offset"); // Clear OFFSET

// Remove a specific JOIN
db.clearJoin("alias");
```

## Transactions

```typescript
await this.getPuri("w").transaction(async (trx) => {
  await trx.table("users").where("id", fromId).decrement("points", amount);
  await trx.table("users").where("id", toId).increment("points", amount);
  await trx.table("point_logs").insert({ from_id: fromId, to_id: toId, amount });
});
```

