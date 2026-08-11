# Model: Subsets, Lists, Counts, and Filters

## Generated Model contract

`BaseModelClass` supplies Puri and subset execution helpers. The generated Model defines
`findById`, `findOne`, `findMany`, `save`, and `del`; they are not inherited CRUD methods.

```typescript
import {
  api,
  asArray,
  BaseModelClass,
  exhaustive,
  NotFoundException,
  Puri,
  type ListResult,
} from "sonamu";
import type { UserSubsetKey, UserSubsetMapping } from "../sonamu.generated";
import { userLoaderQueries, userSubsetQueries } from "../sonamu.generated.sso";
import type { UserListParams } from "./user.types";

class UserModelClass extends BaseModelClass<
  UserSubsetKey,
  UserSubsetMapping,
  typeof userSubsetQueries,
  typeof userLoaderQueries
> {
  constructor() {
    super("User", userSubsetQueries, userLoaderQueries);
  }

  async findById<T extends UserSubsetKey>(
    subset: T,
    id: number,
  ): Promise<UserSubsetMapping[T]> {
    const { rows } = await this.findMany(subset, { id, num: 1, page: 1 });
    if (!rows[0]) throw new NotFoundException(`User ${id} not found`);
    return rows[0];
  }

  async findOne<T extends UserSubsetKey>(
    subset: T,
    listParams: UserListParams,
  ): Promise<UserSubsetMapping[T] | null> {
    const { rows } = await this.findMany(subset, { ...listParams, num: 1, page: 1 });
    return rows[0] ?? null;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async findMany<T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, UserSubsetMapping[T]>> {
    const params = {
      num: 24,
      page: 1,
      search: "id" as const,
      orderBy: "id-desc" as const,
      ...rawParams,
    } satisfies UserListParams;

    const { qb } = this.getSubsetQueries(subset);
    if (params.id) qb.whereIn("users.id", asArray(params.id));

    if (params.search && params.keyword) {
      if (params.search === "id") qb.where("users.id", Number(params.keyword));
      else exhaustive(params.search);
    }

    if (params.orderBy === "id-desc") qb.orderBy("users.id", "desc");
    else if (params.orderBy) exhaustive(params.orderBy);

    return this.executeSubsetQuery({ subset, qb, params });
  }
}
```

Keep the second `findMany` generic (`LP`) and return `ListResult<LP, ...>`. Replacing it with the
broad `UserListParams` type loses the conditional result shape for calls that pass a literal
`queryMode`.

`findById` delegates to `findMany`, limits the list to one row, and throws when the row is absent.
`findOne` has the same list semantics but returns `null`. Neither method is a primary-key shortcut:
all default filters, generated subset joins/loaders, and count behavior in `findMany` still run.

## Count, list, and pagination semantics

`executeSubsetQuery()` treats an omitted `queryMode` as `"both"`.

| `queryMode` | Queries | Result |
| --- | --- | --- |
| `"both"` or omitted | count, then list | `{ rows, total }` |
| `"list"` | list only | `{ rows }` |
| `"count"` | count only | `{ total }` |

- `page` is one-based. A positive `num` applies `LIMIT num OFFSET num * (page - 1)`.
- `num: 0` applies neither limit nor offset, so the list contains every matching row.
- Count clones the subset query, clears order/limit/offset and selection, then executes
  `COUNT(*)::integer`.
- Count is over SQL rows, not distinct entity IDs. A retained one-to-many JOIN can multiply
  `total`. `optimizeCountQuery: true` removes LEFT JOIN aliases unused by WHERE, but it is not a
  distinct count and cannot remove joins required by filters.
- Loaders, hydration, enhancers, and internal-field removal run only for list rows.

The generic result follows the input type, so retain a literal mode at the callsite:

```typescript
const { rows } = await UserModel.findMany("A", { queryMode: "list" });
const { total } = await UserModel.findMany("A", { queryMode: "count" });
```

## Generated subset queries and typing

Generated subset queries select to-one relation fields with JOINs and load to-many relations in
follow-up queries. A to-one relation whose subset field is only `relation.id` can select its local
foreign key without a JOIN. `executeSubsetQuery()` hydrates flattened aliases into nested objects.
A nested object from a nullable LEFT JOIN is inferred as `object | null`; its own nullable columns
remain nullable.

```typescript
const row = await this.getPuri("r")
  .table("employees")
  .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
  .select({
    id: "employees.id",
    department: {
      id: "department.id",
      name: "department.name",
    },
  })
  .first();
// { id: number; department: { id: number; name: string } | null }
```

Puri declares the awaited `first()` result as the selected object type, although Knex can return
`undefined` at runtime when no employee matches. Guard `row` when absence is possible even though
the compiler does not enforce it.

`getSubsetQueries(subset)` returns two views of the same runtime query:

```typescript
const { qb, onSubset } = this.getSubsetQueries(subset);
qb.where("users.deleted_at", null); // valid for every subset query

if (subset === "P") {
  onSubset("P").where("employee__department.name", departmentName);
}
```

`onSubset("P")` changes only the TypeScript view; it neither switches the selected subset nor adds
its JOINs at runtime. Guard it with the same runtime subset condition. Passing the wrong key can
produce SQL that references an alias absent from the active generated query. The array overload
`onSubset(["A", "P"])` exposes the intersection of those subset query types.

When a condition needs a JOIN that some generated subsets already contain, use `ensureJoin()` or
`ensureLeftJoin()` rather than `onSubset()`; see `puri.md`.

## Computed and internal fields

Use `appendSelect()` for a query virtual declared on the Entity and `createEnhancers()` for a code
virtual:

```typescript
const { qb } = this.getSubsetQueries(subset);
qb.appendSelect({ normalized_name: Puri.lower("users.name") });

const enhancers = this.createEnhancers({
  A: (row) => ({ ...row, display_name: row.normalized_name.trim() }),
  P: (row) => ({ ...row, display_name: row.normalized_name.trim() }),
});

return this.executeSubsetQuery({ subset, qb, params, enhancers });
```

Generated `subsetsInternal` fields participate in the query and are available to enhancers, then
are removed from returned rows. If a subset's declared mapping contains a code virtual not produced
by its generated query/loaders, the enhancer for that subset is required by the type contract.

## `sonamuFilter`

`executeSubsetQuery()` normalizes and validates `params.sonamuFilter` before applying it. Runtime
validation accepts only Entity props with `toFilter: true`; a non-filterable field, unsupported
operator, malformed `in`/`between` value, or invalid enum value throws before the list/count query.

```typescript
const params = {
  num: 24,
  page: 1,
  sonamuFilter: {
    status: { in: ["active", "paused"] },
    budget: { gte: 1000, lte: 5000 },
    title: { contains: "launch" },
    deleted_at: { isNull: true },
  },
};
```

A direct scalar is equality. Operator objects may contain more than one operator; they are applied
with AND.

| Prop type | Operators |
| --- | --- |
| string | `eq`, `ne`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`, `isNull`, `isNotNull` |
| integer, numeric | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `between`, `isNull`, `isNotNull` |
| boolean | `eq`, `ne`, `isNull`, `isNotNull` |
| date, datetime | `eq`, `ne`, `before`, `after`, `between`, `isNull`, `isNotNull` |
| enum | `eq`, `ne`, `in`, `notIn`, `isNull`, `isNotNull` |
| JSON | `isNull`, `isNotNull` |

`between: [min, max]` becomes `>= min AND <= max`. URL strings that look numeric or boolean are
normalized; other strings, including date strings, stay strings. For OR groups, correlated
conditions, or relation columns, compose the Puri query directly instead of forcing them into
`sonamuFilter`.

## TS2589 and subset-query type depth

For `Type instantiation is excessively deep and possibly infinite` around a Model query:

1. Keep the generated `SubsetKey`, `SubsetMapping`, subset-query object, and loader-query object as
   the four `BaseModelClass` generic arguments. Hand-written aggregate Puri generics make the type
   graph larger and can hide the actual generated contract.
2. Add common conditions through `qb`; use a runtime subset guard plus `onSubset(key)` only for an
   alias unique to that subset.
3. Move a long computed expression behind the correctly typed `Puri.rawString`, `rawNumber`,
   `rawBoolean`, or `rawDate` helper. Bind values in its parameter array.
4. Split the chain into named steps to identify the operation that expands the type. Do not cast the
   entire Puri chain to `any`: that also disables column, nullability, and select-shape checks.
5. If the missing operation is not public Puri surface, keep the untyped boundary to
   `rawQuery()`/`.knex`, inspect its SQL and bindings, and explicitly type only the returned value.
   The supported boundaries and their trade-offs are in `puri.md`.
