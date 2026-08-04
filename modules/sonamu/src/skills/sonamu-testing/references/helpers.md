# Test Helpers

## Fixture

### createFixtureLoader

```typescript
// api/src/testing/fixture.ts
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
import { loadFixtures } from "../../testing/fixture";

test("update company info", async () => {
  const f0 = await loadFixtures(["company01"]);

  await CompanyModel.save([
    {
      ...f0.company01,
      name: "Updated Company",
    },
  ]);

  const f1 = await loadFixtures(["company01"]);
  expect(f1.company01.name).toBe("Updated Company");
});
```

## Naite (Test Tracing System)

→ Detailed guide (key list, chaining filters, wildcard, del, internal structure): `sonamu-naite`

Naite is a tracing system that records values with `Naite.t("key", value)` in source code and validates them with `Naite.get("key")` in tests.

### Commonly Used Patterns in Tests

```typescript
import { Naite } from "sonamu";

// Query validation
expect(Naite.get("esq-query").first()).not.contain("limit");

// UpsertBuilder behavior validation
const trace = Naite.get("puri:ub-upserted").first();
expect(trace).toMatchObject({ tableName: "users", rowCount: 3 });

// Fetch methods: .first(), .last(), .at(n), .result() (full array)
// Filters: .fromFile("user.model.ts"), .fromFunction("findById"), .where("data.tableName", "=", "users")
```


## Test Helper: expectQuery

Helper for validating specific parts of SQL queries (see miomock for reference):

```typescript
// api/src/testing/expect-query.ts
import { type AST, Parser } from "node-sql-parser";
import { expect } from "vitest";

export type QueryPart =
  | "type"
  | "table"
  | "columns"
  | "set"
  | "where"
  | "join"
  | "orderBy"
  | "pagination"
  | "groupBy"
  | "having";

export function expectQuery(query: string, part?: QueryPart) {
  if (!part) return expect(query);
  const ast = parseQuery(query);
  const extractedSql = extractors[part](ast);
  return expect(extractedSql);
}
```

### Usage Examples

```typescript
import { expectQuery } from "../testing/expect-query";

test("validate select query", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").select({ id: "users.id" });
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "type").toBe("select");
  expectQuery(query, "table").toBe("users");
  expectQuery(query, "columns").toMatchInlineSnapshot(`""users"."id" AS \`id\`"`);
});

test("validate where condition", async () => {
  const db = UserModel.getPuri("r");
  await db.table("users").where("users.id", 1);
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "where").toMatchInlineSnapshot(`""users"."id" = 1"`);
});

test("validate join", async () => {
  const db = UserModel.getPuri("r");
  await db.table("employees").leftJoin("departments", "employees.department_id", "departments.id");
  const query = Naite.get("puri:executed-query").first();

  expectQuery(query, "join").toMatchInlineSnapshot(
    `"LEFT JOIN departments ON "employees"."department_id" = "departments"."id""`,
  );
});
```

## Test Helper: expectUB

UpsertBuilder state validation helper (see miomock for reference):

```typescript
// api/src/testing/expect-ub.ts
import type { UpsertBuilder } from "sonamu";
import { expect } from "vitest";

export type UBPart =
  | "tables"
  | "hasTable"
  | "rowCount"
  | "rows"
  | "row"
  | "refs"
  | "uniquesMap"
  | "uniqueIndexes";

export function expectUB<P extends UBPart>(
  ub: UpsertBuilder,
  part: P,
  tableName?: string,
  index?: number,
) {
  // ... implementation
}
```

### Usage Examples

```typescript
import { expectUB } from "../testing/expect-ub";

test("validate UpsertBuilder state", async () => {
  const ub = new UpsertBuilder();

  // initial state
  expectUB(ub, "hasTable", "users").toBe(false);
  expectUB(ub, "tables").toEqual([]);

  // after register
  ub.register("users", {
    email: "test@test.com",
    username: "test",
    password: "pw",
    role: "normal",
  });

  expectUB(ub, "hasTable", "users").toBe(true);
  expectUB(ub, "rowCount", "users").toBe(1);
  expectUB(ub, "row", "users", 0).toMatchObject({
    email: "test@test.com",
    username: "test",
  });

  // confirm reset after upsert
  await ub.upsert(wdb, "users");
  expectUB(ub, "rowCount", "users").toBe(0);
});
```
