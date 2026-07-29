# Puri — Full-Text, Vector, and Fuzzy Search

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

- Puri is the standard for BOTH reads and writes in ALL contexts (Model, Frame, scripts) — do NOT run queries on a raw `DB.getDB()` handle (exceptions: migration files, `db.ts`, tests, and the `.knex` escape hatch)
- Inside a Frame, use the associated Model's `getPuri` (Frame exposes only `getDB` / `getUpsertBuilder`, not `getPuri`)
- Outside a Model, wrap knex with `new PuriWrapper(DB.getDB(which), new UpsertBuilder())`
- Use the `puri.knex` escape hatch only for non-entity / framework-internal tables (e.g. `workflow_runs`)
- MUST use `getPuri("r")` for read queries, `getPuri("w")` for write queries
- MUST include WHERE condition for UPDATE/DELETE operations
- MUST use `transaction()` for multiple write operations
- JSON/JSONB columns are automatically JSON.stringify'd on insert/update
