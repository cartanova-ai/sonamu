# Search Queries with Puri

Choose the query method that matches the database index already defined for the Entity. These
helpers compose SQL; they do not create extensions, indexes, embeddings, or language analyzers.

## PostgreSQL text search

`whereTsSearch()` emits `column @@ tsquery`, so pass a stored `tsvector`/search-vector column. The
public config type is `"simple" | "english"`; parser options are `to_tsquery`,
`plainto_tsquery`, `phraseto_tsquery`, and `websearch_to_tsquery`.

```typescript
import { Puri } from "sonamu";

const query = "query terms";
const rows = await this.getPuri("r")
  .table("documents")
  .whereTsSearch("documents.search_vector", query, {
    config: "english",
    parser: "websearch_to_tsquery",
  })
  .select({
    id: "documents.id",
    headline: Puri.tsHighlight("documents.content", query, {
      config: "english",
      startSel: "<mark>",
      stopSel: "</mark>",
      maxFragments: 3,
    }),
    rank: Puri.tsRank("documents.search_vector", query, { config: "english" }),
  })
  .orderBy("rank", "desc");
```

`Puri.tsRank()` and `tsRankCd()` accept a stored `tsvector` column string. For ranking an ordinary
text column, wrap it with `Puri.toTsVector(column, config)`. The public `whereTsSearch()` expression
type does not accept that `tsvector` expression, so an on-the-fly match needs a bound `whereRaw()`;
do not pass a text column directly to the `@@` helper. Keep the config/parser aligned between
matching, ranking, and highlighting.

```typescript
import { Puri } from "sonamu";

const search = "query terms";
const query = this.getPuri("r").table("documents").select({
  id: "documents.id",
  content: "documents.content",
});
const vector = Puri.toTsVector("documents.content", "english");
query.whereRaw("to_tsvector(?, ??) @@ websearch_to_tsquery(?, ?)", [
  "english",
  "documents.content",
  "english",
  search,
]);
query.appendSelect({ rank: Puri.tsRank(vector, search, { config: "english" }) });
const rows = await query.orderBy("rank", "desc");
```

## PGroonga

`whereSearch()` uses PGroonga's `&@~` operator. A multi-column call must use the same column order
and composition as its index; otherwise PostgreSQL may not use that index.

```typescript
import { Puri } from "sonamu";

const query = "query terms";
const rows = await this.getPuri("r")
  .table("projects")
  .whereSearch(["projects.name", "projects.description"], query, {
    weights: [3, 1],
  })
  .select({
    id: "projects.id",
    score: Puri.score(),
    name: Puri.highlight("projects.name", query),
    snippets: Puri.highlight(["projects.name", "projects.description"], query),
  })
  .orderBy("score", "desc");
```

The single-column highlight expression returns `string`; the column-array overload returns
`string[]`. The query argument may be one string or an array of search terms.

## pg_trgm Fuzzy Search

`whereFuzzy()` validates one of three operators and binds the query value:

| Option | SQL shape |
| --- | --- |
| omitted or `"<%"` | `? <% column` |
| `"%"` | `column % ?` |
| `"<<%"` | `? <<% column` |

```typescript
import { Puri } from "sonamu";

const query = "query terms";
const expression = Puri.rawString("?? || ' ' || ??", [
  "documents.title",
  "documents.content",
]);

const rows = await this.getPuri("r")
  .table("documents")
  .whereFuzzy(expression, query)
  .select({
    id: "documents.id",
    wordScore: Puri.wordSimilarity(expression, query),
    score: Puri.similarity("documents.title", query),
    strictScore: Puri.strictWordSimilarity(expression, query),
  })
  .orderBy("wordScore", "desc");
```

The typed `SqlExpression` form keeps combined columns parameterized. An invalid fuzzy operator
throws `Invalid fuzzy operator: ...` before query execution.

## pgvector

`vectorSimilarity()` requires a generated vector column and a non-empty array of finite numbers. It
adds a `similarity` result column, filters out null vectors, clears prior ordering, and orders by the
chosen pgvector distance operator.

```typescript
const embedding: number[] = [0.12, -0.34, 0.56];
const rows = await this.getPuri("r")
  .table("documents")
  .select({ id: "documents.id", title: "documents.title" })
  .vectorSimilarity("documents.embedding", embedding, {
    method: "cosine",
    threshold: 0.75,
    distinctOn: "documents.source_id",
  });
// Array<{ id: number; title: string; similarity: number }>
```

| `method` | `similarity` column | Threshold |
| --- | --- | --- |
| `"cosine"` (default) | `1 - cosine distance` | similarity `>= threshold` |
| `"l2"` | Euclidean distance | distance `<= threshold` |
| `"inner_product"` | inner product | similarity `>= threshold` |

`distinctOn` keeps the nearest candidate per distinct key by wrapping the initial query, then sorts
the wrapped result by `similarity DESC`. Because that final direction is fixed, do not use
`distinctOn` with `method: "l2"` when the desired final order is nearest-first; build the distinct
query explicitly instead.

When `vectorSimilarity()` is added to a Model `findMany`, the selected subset fields remain in the
result and `similarity` is appended. Put embedding generation and chunking in the `sonamu-vector`
workflow; pass only the validated numeric vector into this query.
