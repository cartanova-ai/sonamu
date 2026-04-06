---
name: sonamu-puri
description: Sonamu Puri type-safe query builder. SELECT, WHERE, JOIN, aggregate functions, FTS, vector search, transactions. Use when writing database queries in Model.
---

# Puri Query Builder

## Starting a Query

```typescript
// Read
const users = await this.getPuri("r").table("users").select({ id: "id", name: "username" });

// Write
await this.getPuri("w").table("users").where("id", 1).update({ is_active: false });

// Using aliases
const users = await db.table({ u: "users" }).select({ id: "u.id" });
```

## SELECT

> **CRITICAL: `.select()` must always be used with an object argument.**
>
> Passing a string argument causes the string to be spread character-by-character, generating incorrect SQL like `select "i" as "0", "d" as "1", ...`.
> Be especially careful when chaining after an `as any` cast.
>
> ```typescript
> // WRONG — character spread bug
> db.table("files").select("files.entity_id", "files.file_type");
>
> // CORRECT
> db.table("files").select({ entity_id: "files.entity_id", file_type: "files.file_type" });
> ```

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

## ORDER BY & LIMIT

```typescript
db.orderBy("created_at", "desc").limit(20).offset(40); // Page 3
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

---

## PostgreSQL Full-Text Search (tsvector)

### whereTsSearch

```typescript
// Basic search (websearch_to_tsquery, simple config)
db.whereTsSearch("search_vector", "search term");

// Specify config
db.whereTsSearch("search_vector", "search term", "korean");

// Detailed options
db.whereTsSearch("search_vector", "search term", {
  parser: "plainto_tsquery", // websearch_to_tsquery | plainto_tsquery | phraseto_tsquery
  config: "korean",
});
```

### tsHighlight (Search Term Highlighting)

```typescript
db.select({
  title: "title",
  highlighted: Puri.tsHighlight("content", "search term"),
});

// Options
db.select({
  highlighted: Puri.tsHighlight("content", "search term", {
    config: "korean",
    startSel: "<mark>",
    stopSel: "</mark>",
    maxFragments: 3,
    maxWords: 35,
    minWords: 15,
  }),
});
```

### tsRank / tsRankCd (Search Ranking)

The first argument must be `Puri.toTsVector()` rather than a column name string.

```typescript
// Must wrap with toTsVector() (required)
db.select({
  rank: Puri.tsRank(Puri.toTsVector("documents.search_vector"), "search term"),
})
  .whereTsSearch("documents.search_vector", "search term")
  .orderBy("rank", "desc");

// Specify config
db.select({
  rank: Puri.tsRank(Puri.toTsVector("documents.title", "korean"), "search term"),
});

// Options
db.select({
  rank: Puri.tsRank(Puri.toTsVector("documents.title"), "search term", {
    normalization: 1, // Document length normalization
    weights: [0.1, 0.2, 0.4, 1.0], // D, C, B, A weights
  }),
});

// tsRankCd (Cover Density)
db.select({
  rank: Puri.tsRankCd(Puri.toTsVector("documents.title"), "search term"),
});

// tsRankCd options
db.select({
  rank: Puri.tsRankCd(Puri.toTsVector("documents.title"), "search term", {
    parser: "phraseto_tsquery",
    normalization: 16,
  }),
});
```

---

## PGroonga Full-Text Search

### whereSearch

```typescript
// Single column search
db.whereSearch("title", "search term");

// Multi-column search (requires same column composition as index)
db.whereSearch(["title", "content"], "search term");

// Weight options
db.whereSearch(["title", "content"], "search term", {
  weights: [10, 1], // 10x weight on title
});
```

### score (Search Score)

```typescript
db.select({
  id: "id",
  title: "title",
  score: Puri.score(),
})
  .whereSearch("title", "search term")
  .orderBy("score", "desc");
```

### highlight (Highlighting)

```typescript
// Single column
db.select({
  highlighted: Puri.highlight("title", "search term"),
});

// Multiple columns (returns array)
db.select({
  highlighted: Puri.highlight(["title", "content"], "search term"),
});

// Array of search terms
db.select({
  highlighted: Puri.highlight("title", ["term1", "term2"]),
});
```

---

## Vector Search (pgvector)

### vectorSimilarity

```typescript
const embedding = await getEmbedding("search query");

// Default (cosine similarity)
const results = await db
  .table("documents")
  .select({ id: "id", title: "title" })
  .vectorSimilarity("embedding", embedding);
// → SELECT *, 1 - (embedding <=> '[...]'::vector) as similarity
//   ORDER BY embedding <=> '[...]'::vector

// L2 distance
db.vectorSimilarity("embedding", embedding, { method: "l2" });

// Inner product
db.vectorSimilarity("embedding", embedding, { method: "inner_product" });

// threshold filter
db.vectorSimilarity("embedding", embedding, {
  method: "cosine",
  threshold: 0.7, // only similarity >= 0.7
});

// distinctOn (deduplicate)
db.vectorSimilarity("embedding", embedding, {
  distinctOn: "document_id", // best similarity per document_id only
});
```

**Return value**: `similarity` column is automatically added

| method        | similarity meaning                   | sort order |
| ------------- | ------------------------------------ | ---------- |
| cosine        | 1 - distance (higher = more similar) | desc       |
| l2            | distance (lower = more similar)      | asc        |
| inner_product | -distance (higher = more similar)    | desc       |

---

## pg_trgm Fuzzy Search

Requires `CREATE EXTENSION IF NOT EXISTS pg_trgm`. Typically used together with a generated column created via the `searchText` prop and a GIN index.

### whereFuzzy — Candidate Filtering

The SQL operand order differs per operator:

| operator       | meaning                | SQL                  |
| -------------- | ---------------------- | -------------------- |
| `<%` (default) | word similarity        | `'query' <% column`  |
| `%`            | similarity             | `column % 'query'`   |
| `<<%`          | strict word similarity | `'query' <<% column` |

```typescript
puri.whereFuzzy("items.search_text", query);
puri.whereFuzzy("items.search_text", query, { operator: "%" });
puri.whereFuzzy("items.search_text", query, { operator: "<<%" });
```

### Similarity Scores — Static Methods

Returns `SqlExpression<"number">`, so use it as a score column in select:

```typescript
// Puri.wordSimilarity(column, query)       → word_similarity(?, ??)
// Puri.similarity(column, query)           → similarity(??, ?)
// Puri.strictWordSimilarity(column, query) → strict_word_similarity(?, ??)

const results = await this.getPuri("r")
  .table("items")
  .whereFuzzy("items.search_text", query)
  .select({
    id: "items.id",
    title: "items.title_ko",
    score: Puri.rawNumber(
      `word_similarity(?, items.title_ko) * 5 + word_similarity(?, items.title_en) * 3`,
      [query, query],
    ),
  })
  .orderByRaw("score DESC");
```

### Language-specific Characteristics

| Language | Suitability | Notes                                           |
| -------- | ----------- | ----------------------------------------------- |
| English  | Excellent   | Word-level splitting + word_similarity          |
| Korean   | Good        | Performance degrades for 1-2 character searches |
| Japanese | Good        | Performance degrades for 1-2 character searches |

---

## Rules

- MUST use `getPuri("r")` for read queries, `getPuri("w")` for write queries
- MUST include WHERE condition for UPDATE/DELETE operations
- MUST use `transaction()` for multiple write operations
- JSON/JSONB columns are automatically JSON.stringify'd on insert/update
