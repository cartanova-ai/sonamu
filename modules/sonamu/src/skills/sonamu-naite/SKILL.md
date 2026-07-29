---
name: sonamu-naite
description: Naite tracing system. Record values in source code with Naite.t(), verify in tests with Naite.get(). Supports chaining filters (fromFile, fromFunction, where), wildcard patterns, and DevRunner trace output. Use when tracing/debugging Model internals, verifying queries, or inspecting UpsertBuilder behavior.
---

# Naite (Tracing System)

Naite is a tracing system for recording values in source code and verifying them in tests.

**Source code:** `modules/sonamu/src/naite/naite.ts`

**How it works:**

1. **Source code**: Record values with `Naite.t("key", value)`
2. **Test code**: Retrieve recorded values with `Naite.get("key")`

---

## Recording in Source Code (Naite.t)

```typescript
// In Model or library code
import { Naite } from "sonamu";

// Record a query
Naite.t("esq-query", qb.toQuery());

// Inside UpsertBuilder
Naite.t("puri:ub-register", { tableName, uuid, isUuidReused, row });
Naite.t("puri:ub-upserted", { tableName, mode, rowCount, returnedIds });
```

---

## Verifying in Tests (Naite.get)

```typescript
// In test code
import { Naite } from "sonamu";

// Verify a recorded query
expect(Naite.get("esq-query").first()).not.contain("limit");

// Verify UpsertBuilder behavior
const trace = Naite.get("puri:ub-upserted").first();
expect(trace).toMatchObject({ tableName: "users", rowCount: 3 });
```

---

## Built-in Naite Keys (Sonamu)

| Key                                  | Description                    | Data                                                |
| ------------------------------------ | ------------------------------ | --------------------------------------------------- |
| `esq-query`                          | Executed SQL query             | Query string                                        |
| `puri:executed-query`                | Query executed by Puri         | Query string                                        |
| `puri:ub-register`                   | UpsertBuilder register call    | `{ tableName, uuid, isUuidReused, row }`            |
| `puri:ub-upserted`                   | UpsertBuilder upsert complete  | `{ tableName, mode, rowCount, returnedIds }`        |
| `puri:ub-ref-resolved`               | UBRef → actual ID substitution | `{ tableName, field, from, to }`                    |
| `puri:ub-batch-updated`              | updateBatch complete           | `{ tableName, rowCount, whereColumns }`             |
| `puri:ub-clean-orphans`              | cleanOrphans executed          | `{ tableName, cleanOrphans, deletedCount }`         |
| `puri:ub-inherit`                    | inherit option applied         | `{ tableName, inheritColumns, excludedFromUpdate }` |
| `mock:fs/promises:virtualFileSystem` | Virtual file system path       | File path string                                    |
| `fs/promises:writeFile`              | writeFile call                 | `{ path, data }`                                    |
| `fs/promises:rm`                     | rm call                        | `{ path, options }`                                 |

---

## Recording with Custom Keys

```typescript
// Record with a custom key in source code
Naite.t("user:created", { userId: 1, email: "test@test.com" });

// Virtual file system for mocking
Naite.t("mock:fs/promises:virtualFileSystem", "/path/to/virtual/file.ts");
```

---

## Naite.get() Retrieval Methods

```typescript
// Basic retrieval
Naite.get("key").first(); // first entry
Naite.get("key").last(); // last entry
Naite.get("key").at(2); // nth entry
Naite.get("key").result(); // all entries as an array
Naite.get("key").getTraces(); // raw trace array (includes call stack)

// Wildcard patterns
Naite.get("puri:*").result(); // all with puri: prefix
Naite.get("syncer:*:user").result(); // syncer:XXX:user pattern
```

---

## Chaining Filters

```typescript
// Filter by file name
Naite.get("esq-query")
  .fromFile("user.model.ts") // only entries recorded from this file
  .result();

// Filter by function name
Naite.get("puri:executed-query")
  .fromFunction("findById") // only entries called from this function
  .result();

// fromFunction options
Naite.get("key")
  .fromFunction("save", { from: "direct" }) // direct calls only (stack[0])
  .fromFunction("save", { from: "indirect" }) // indirect calls only (stack[1+])
  .fromFunction("save", { from: "both" }); // both (default)

// Filter by data path (radash get path)
Naite.get("puri:ub-register")
  .where("data.tableName", "=", "users") // only where tableName is "users"
  .where("data.rowCount", ">", 5) // rowCount > 5
  .result();

// where operators: ">", "<", ">=", "<=", "=", "!=", "includes"
Naite.get("key")
  .where("data.query", "includes", "WHERE") // check if string includes substring
  .result();

// Combining filters
Naite.get("puri:executed-query")
  .fromFunction("findMany")
  .where("data", "includes", "users")
  .first();
```

---

## Naite.del() - Delete Values

```typescript
Naite.t("mock:fs/promises:virtualFileSystem", "/virtual/path");
// ... test ...
Naite.del("mock:fs/promises:virtualFileSystem");
```

---

## Test Examples

```typescript
test("query should not have a limit", async () => {
  await UserModel.findMany("A", { num: 0, page: 1 });

  expect(Naite.get("esq-query").first()).not.contain("limit");
  expect(Naite.get("esq-query").first()).not.contain("offset");
});

test("trace UpsertBuilder register", async () => {
  const ub = new UpsertBuilder();
  const ref = ub.register("users", { email: "test@test.com", username: "test" });

  const trace = Naite.get("puri:ub-register").first();
  expect(trace).toMatchObject({
    tableName: "users",
    uuid: ref.uuid,
    isUuidReused: false,
  });
});

test("trace upsert completion", async () => {
  // ... run upsert ...

  const trace = Naite.get("puri:ub-upserted").first();
  expect(trace).toMatchObject({
    tableName: "users",
    mode: "upsert",
    rowCount: 3,
  });
});
```

---

## Viewing Traces in DevRunner

Use the `sonamu test --traces` flag to view Naite traces directly in the CLI:

```bash
sonamu test user.model --traces
sonamu test user.model -t
```

Example output:

```
Tests: 5 passed, 0 failed, 5 total
Duration: 791ms

Traces:

  UserModel > BaseModel basic functionality > Model.findMany() with num = 0
  user.model.test.ts

    [esq-query] user.model.ts:113
    select "users"."id" as "id", ...

    [puri:executed-query] puri.ts:1349
    select COUNT(*)::integer as "total" from "users" limit 1
```

Trace data is fetched from `testCase.meta().traces` (collected in `afterEach` of `bootstrap.ts`) and serialized as the `SerializedTrace` type (exported from `naite.ts`).

See `sonamu-testing` for DevRunner details.

---

## Internal Structure

### NaiteStore

```typescript
type NaiteStore = Map<string, NaiteTrace[]>;

interface NaiteTrace {
  key: string;
  data: any;
  stack: StackFrame[]; // call stack information
  at: Date;
}

interface StackFrame {
  functionName: string | null;
  filePath: string; // path relative to TS file
  lineNumber: number; // line number in TS file
}
```

### SerializedTrace (for API responses / DevRunner)

```typescript
type SerializedTrace = {
  key: string;
  value: any;
  filePath: string;
  lineNumber: number;
  at: string;
};
```

---

## Debugging Uses

Naite can also be used for source code behavior analysis beyond tests:

- **Query tracing**: Use `esq-query` and `puri:executed-query` to see the actual SQL being executed
- **UpsertBuilder analysis**: Trace the full flow (register → upsert → ref-resolved → batch-updated) with `puri:ub-*` keys
- **File I/O tracing**: Use `fs/promises:*` keys to see file operations performed by the syncer and others
- **Isolate a specific function**: Use `.fromFunction("findById")` chaining to filter traces to only those originating from a specific method

---

## References

- **Testing guide**: `sonamu-testing`
- **DevRunner details**: `sonamu-testing`
- **expectQuery helper** (Naite-based): see "Test Helper: expectQuery" in `sonamu-testing`
