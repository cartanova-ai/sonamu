# Test Helpers

## Fixture

### createFixtureLoader

`createFixtureLoader` turns a record of zero-argument async loaders into a typed `loadFixtures`
function. Requested loaders run concurrently with `Promise.all`.

```typescript
// src/testing/fixture.ts
import { createFixtureLoader } from "sonamu/test";

import { CompanyModel } from "../application/company/company.model";
import { UserModel } from "../application/user/user.model";

export const loadFixtures = createFixtureLoader({
  company01: async () => CompanyModel.findById("A", 1),
  user01: async () => UserModel.findById("A", 1),
});
```

### Using in tests

```typescript
const { company01, user01 } = await loadFixtures(["company01", "user01"]);
```

The return keys and values are inferred from the requested names. The helper only calls loaders: it
does not insert rows, synchronize fixture databases, sequence dependent writes, or cache results.
Because loaders run concurrently, use them for independent reads of an existing baseline; create a
dependent write chain explicitly inside the test.

## Naite (Test Tracing System)

`Naite.t(key, value)` records only when `NODE_ENV === "test"` and the current Sonamu context has a
Naite store. Sonamu's `test` and `testAs` wrappers create that store. `bootstrap` alone does not, and
raw Vitest `test`/Sonamu `test.each` callbacks therefore see an empty `Naite.get(...)` unless they
call `runWithMockContext` or `runWithContext`.

### Commonly Used Patterns in Tests

```typescript
import { Naite } from "sonamu";

const queries = Naite.get("puri:executed-query");
expect(queries.first()).toContain("select");
expect(queries.result()).toHaveLength(1);

const writes = Naite.get("puri:*").fromFunction("save").result();
expect(writes.length).toBeGreaterThan(0);
```

Useful terminal methods are `first()`, `last()`, `at(index)`, and `result()`. Filters include
`fromFile`, `fromFunction`, and `where`. See `sonamu-naite` for the full query surface.

The `test`/`testAs` wrappers serialize traces into Vitest task metadata after the callback. Explicit
`runWithMockContext`/`runWithContext` around a raw callback supplies a store for in-callback
`Naite.get` assertions, but does not perform that metadata assignment. Values exported by the
Sonamu test wrappers should be JSON-serializable: `Naite.t` accepts any value, but trace export warns
about non-serializable data and serialization can fail before DevRunner/reporters consume it.

`NaiteVitestReporter` marks run start/end for the local Naite extension. `bootstrap` reports each
test after rollback, and CI suppresses the extension socket messages. DevRunner's `--traces` output
comes only from traces attached to the test task by `test`/`testAs`.

## Test Helper: expectQuery

`expectQuery` is not exported by `sonamu/test`. Some projects define a local helper that parses the
SQL string recorded under `puri:executed-query` and returns a Vitest expectation for a selected AST
part.

```typescript
import { Naite } from "sonamu";

import { expectQuery } from "../../testing/expect-query";

await UserModel.getPuri("r").table("users").select({ id: "users.id" });
const query = Naite.get("puri:executed-query").first();

expectQuery(query, "type").toBe("select");
expectQuery(query, "table").toBe("users");
```

### Usage Examples

Inspect the project's local `QueryPart` union and parser dialect before using it. Common local parts
include `type`, `table`, `columns`, `set`, `values`, `where`, `join`, `orderBy`, `pagination`,
`groupBy`, and `having`, but Sonamu does not promise that helper signature or rendered SQL format.
For a simple invariant, a direct string or object assertion on the trace is less coupling than an
AST snapshot.

## Test Helper: expectUB

`expectUB` is also a project-local helper, not a framework export. A typical implementation reads
the public `UpsertBuilder.tables`/`hasTable` state, removes generated UUIDs, and returns a Vitest
expectation.

```typescript
import { expectUB } from "../../testing/expect-ub";

const ub = new UpsertBuilder();
ub.register("users", { email: "test@example.com" });

expectUB(ub, "hasTable", "users").toBe(true);
expectUB(ub, "rowCount", "users").toBe(1);
```

### Usage Examples

Read the local `UBPart` union before use. Common project parts are `tables`, `hasTable`, `rowCount`,
`rows`, `row`, `refs`, `uniquesMap`, and `uniqueIndexes`. These assertions inspect builder state;
use Naite's executed-query/upsert traces or query the DB when the behavior under test is execution.
