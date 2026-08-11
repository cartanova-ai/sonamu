# Puri: Typed Query Composition

## Obtain a wrapper

Models and Frames both expose `getPuri()`:

```typescript
const rdb = this.getPuri("r");
const wdb = this.getPuri("w");
```

In a standalone script, the public wrapper can be created explicitly after Sonamu/DB initialization:

```typescript
import { DB, PuriWrapper, UpsertBuilder } from "sonamu";

const db = new PuriWrapper(DB.getDB("r"), new UpsertBuilder());
```

`table()` and `from()` have the same overloads for a generated table name, an aliased table, or an
aliased Puri subquery:

```typescript
db.table("users");
db.table({ author: "users" });
db.from({ recent: recentUsersQuery });
```

The table names and column types come from the generated `DatabaseSchemaExtend` module
augmentation. An unregistered table is therefore intentionally outside the typed `table()` surface.

## SELECT and result types

`select()` takes one object. Keys become result property names; values are typed columns, nested
select objects, or `Puri` SQL expressions.

```typescript
const rows = await db
  .table("users")
  .select({
    id: "users.id",
    email: "users.email",
    normalizedName: Puri.lower("users.username"),
  });
// Array<{ id: string; email: string; normalizedName: string }>
```

Do not pass string arguments to `select()`. If an `any` cast bypasses the signature, the runtime
implementation treats the string as an object and can emit character-index aliases instead of the
requested columns.

For a generated subset query, extend both its SQL selection and inferred result with
`appendSelect()`:

```typescript
const { qb } = this.getSubsetQueries(subset);
qb.appendSelect({ score: Puri.rawNumber("COALESCE(??, 0)", ["users.score"]) });
```

Calling `select()` changes the Puri result type to the new selection. `appendSelect()` intersects the
new selection with the existing result type. Both add SQL select clauses; neither should be used as
a substitute for changing the Entity subset definition.

Puri's result declarations retain the selected type:

```typescript
const rows = await query; // T[]
const row = await query.first(); // T
const ids = await query.pluck("id"); // Array<T["id"]>
```

The awaited type of `first()` is declared as `T`, but the underlying Knex query can return
`undefined` when no row matches. Guard the runtime result whenever absence is possible; the
compiler does not require that check.

## WHERE and groups

```typescript
db.table("users")
  .where("users.status", "active")
  .where("users.age", ">=", 18)
  .where("users.deleted_at", null)
  .whereIn("users.role", ["admin", "member"])
  .whereNotIn("users.id", blockedIds);
```

The typed comparison operators are `=`, `!=`, `<>`, `>`, `>=`, `<`, `<=`, `like`, `not like`,
`ilike`, and `not ilike`. `where(column, null)` becomes `IS NULL`; `where(column, "!=", null)`
becomes `IS NOT NULL`.

Puri exposes OR through a group so the surrounding precedence is explicit:

```typescript
db.table("users")
  .whereGroup((group) => {
    group.where("users.role", "admin").orWhere("users.role", "owner");
  })
  .where("users.is_active", true);

db.table("users").orWhereGroup((group) => {
  group.where("users.role", "admin").where("users.is_verified", true);
});
```

`WhereGroup` supports nested `whereGroup`/`orWhereGroup`, AND/OR `where`, `whereIn`, `whereNotIn`,
and the grouped JSON/search variants. Top-level Puri deliberately has no general `orWhere()`.

For JSONB containment, use the typed serializer instead of pre-stringifying:

```typescript
db.table("events").whereJsonSupersetOf("events.payload", {
  context: { source: "api" },
});
```

For an operation with no typed helper, bind runtime values:

```typescript
db.table("users").whereRaw("EXTRACT(YEAR FROM ??) = ?", ["users.created_at", year]);
```

## JOINs and aliases

```typescript
db.table("employees")
  .join({ user: "users" }, "employees.user_id", "user.id")
  .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
  .select({
    employeeId: "employees.id",
    user: { id: "user.id", email: "user.email" },
    department: { id: "department.id", name: "department.name" },
  });
```

After more than one table is in scope, qualify columns with the table name or alias. Aliases also
let the same physical table participate more than once.

Generated subsets may have already registered a relation alias. Use `ensureJoin()` or
`ensureLeftJoin()` for a simple physical-table equality JOIN that may already exist:

```typescript
qb.ensureJoin({ company: "companies" }, "departments.company_id", "company.id").where(
  "company.name",
  companyName,
);
```

Puri compares the alias, physical table, JOIN kind, left column, and right column:

- an identical registered JOIN is reused;
- an unused alias adds the JOIN;
- a different definition under the same alias throws
  `Join alias "..." is already registered with a different definition.` before SQL execution.

Ordinary `join()`/`leftJoin()` also reject a duplicate alias; the identical-definition error directs
the caller to the matching `ensure*` method. `ensure*` does not accept callback or subquery JOINs,
because their equivalence is opaque. Use distinct aliases for independent joins.

## Existence queries

There is no public Puri `exists()`, `whereExists()`, `whereNotExists()`, or column-to-column WHERE
helper.

For a standalone boolean, select one typed row:

```typescript
const found = await db
  .table("users")
  .where("users.email", email)
  .select({ id: "users.id" })
  .limit(1)
  .first();
const exists = found !== undefined;
```

For a correlated predicate, a bound `whereRaw()` is the smallest Puri-preserving boundary when the
table and column identifiers are static:

```typescript
db.table("projects").whereRaw(
  `EXISTS (
     SELECT 1 FROM project_members
     WHERE project_members.project_id = projects.id
       AND project_members.user_id = ?
   )`,
  [userId],
);
```

Do not replace an existence predicate with a JOIN without checking cardinality: multiple matching
children duplicate parent rows and can inflate both list results and `COUNT(*)`.

When Knex's callback API is required, `query.rawQuery()` returns the underlying
`Knex.QueryBuilder`; `wrapper.knex` exposes the raw connection for an unregistered table. Both
boundaries discard Puri's schema/result inference for operations performed there. Keep the boundary
local, bind values, and explicitly type or validate the returned row shape.

## Sorting, limits, and locks

```typescript
query.orderBy("created_at", "desc", "last");
query.orderBy([
  { column: "is_pinned", order: "desc" },
  { column: "published_at", order: "desc", nulls: "last" },
  "title",
]);
query.orderBy(Puri.rawNumber("COALESCE(??, 0)", ["score"]), "desc");
query.limit(20).offset(40);
```

`orderBy` accepts source columns, selected aliases, string/number SQL expressions, `asc`/`desc`,
and `first`/`last` null placement. Generated `orderBy` enums are normally handled with an
`exhaustive(params.orderBy)` fallback, so a newly generated enum value remains a compile-time
prompt to add its query branch.

`limit()` and `offset()` reject negative values. `forUpdate()` and `forShare()` preserve the result
type; use them inside the transaction that protects the subsequent decision/write.

## Transactions

```typescript
await this.getPuri("w").transaction(async (trx) => {
  const account = await trx
    .table("accounts")
    .where("accounts.id", accountId)
    .forUpdate()
    .first();

  if (!account) throw new Error("Account not found");
  await trx.table("accounts").where("accounts.id", accountId).update({ balance: nextBalance });
  await trx.table("ledger_entries").insert({ account_id: accountId, amount });
});
```

The callback commits on return and rolls back on throw. Nested Puri transactions use a savepoint.
The wrapper accepts `{ isolation, readOnly, dbPreset }`; `dbPreset` defaults to `"w"`. A Model or
Frame `getPuri(dbPreset)` called within the matching transaction context resolves to its transaction
wrapper, but using the callback's `trx` keeps the boundary explicit.

Direct `insert()` and `update()` serialize registered JSON columns by replacing those properties on
the passed object with JSON strings. `update()` and `delete()` accept an unfiltered table query, so
predicate scope must be deliberate.
