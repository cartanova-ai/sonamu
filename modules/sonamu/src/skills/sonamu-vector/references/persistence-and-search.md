# Persistence and Search Handoff

The vector module creates numbers; it does not store or search them. A complete flow crosses three
public boundaries:

1. `Embedding` from `"sonamu/vector"` generates document and query vectors.
2. An entity `vector` prop plus the project's Model persistence stores the document vector.
3. A Puri instance's `vectorSimilarity()` method from `"sonamu"` ranks rows using the query vector.

## Entity and migration

Declare the dimension in the entity source of truth:

```json
{
  "name": "embedding",
  "type": "vector",
  "dimensions": 1024,
  "nullable": true,
  "desc": "Content embedding"
}
```

Use 1024 with Sonamu's default Voyage model and 1536 with its default OpenAI model. The entity
schema requires `dimensions`, generated schema types expose the value as `number[]`, and generated
database metadata marks the column as a vector. Run the consuming project's normal entity sync and
migration workflow; `sonamu-entity` owns field and index declarations, while `sonamu-migration` owns
generation and execution.

Embedding does not inspect the entity and persistence does not regenerate vectors. Generate and
save them explicitly:

```typescript
import { Embedding } from "sonamu/vector";

const result = await Embedding.embedOne(content, "voyage", "document");
const wdb = this.getPuri("w");
wdb.ubRegister("documents", { title, content, embedding: result.embedding });
await wdb.ubUpsert("documents");
```

Sonamu does not compare `result.embedding.length` with the entity dimension. The PostgreSQL write
or query is therefore the dimension-enforcement boundary unless project code validates it first.

## Puri search

Generate the query with the same provider/model used for stored vectors, then pass only the numeric
array to Puri:

```typescript
import { Embedding } from "sonamu/vector";

const { embedding } = await Embedding.embedOne(search, "voyage", "query");
const rows = await this.getPuri("r")
  .table("documents")
  .select({ id: "documents.id", title: "documents.title" })
  .vectorSimilarity("documents.embedding", embedding, {
    method: "cosine",
    threshold: 0.75,
  });
```

`vectorSimilarity()` is available on Puri from the main `"sonamu"` surface, not
`"sonamu/vector"`. It accepts a generated vector column plus
`{ method?: "cosine" | "l2" | "inner_product"; threshold?: number; distinctOn?: column }`, appends
`similarity`, filters out null stored vectors, replaces prior ordering, and orders by the selected
pgvector distance operator. Detailed threshold and `distinctOn` behavior belongs to
`sonamu-query`.

Puri validates that the query vector is a non-empty array of finite numbers and throws
`Invalid embedding vector: expected a non-empty array of finite numbers` otherwise. It does not
validate vector length. A non-finite threshold throws
`Invalid vectorSimilarity threshold: <value>`; database errors otherwise propagate.

## Index and hybrid boundaries

Declare `hnsw` or `ivfflat` indexes in the entity. Match the opclass to the query method:

| Query method | pgvector operator | Index opclass |
| --- | --- | --- |
| `cosine` | `<=>` | `vector_cosine_ops` |
| `l2` | `<->` | `vector_l2_ops` |
| `inner_product` | `<#>` | `vector_ip_ops` |

The vector package's `search`, `pgvector`, `VectorSearchOptions`, `HybridSearchOptions`, and result
types do not execute a search. There is no exported `VectorSearch` class, hybrid rank merger, or
reranker. Compose PostgreSQL full-text search and vector expressions in the Model, normalize their
scores for the project's ranking rule, and return the project's own result type; `sonamu-query`
documents the active Puri APIs.
