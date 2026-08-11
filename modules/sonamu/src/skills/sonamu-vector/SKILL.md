---
name: sonamu-vector
description: Generates text embeddings and character-based chunks for pgvector workflows. Use when calling Embedding.embed/embedOne, configuring Voyage/OpenAI keys, splitting text with Chunking, persisting embeddings, or handing vectors to Puri vectorSimilarity. Covers sonamu/vector, inputType, batchSize, getDimensions, and provider/config capability boundaries.
---

# Vector Search Guide

`sonamu/vector` exports embedding, chunking, configuration, and result types. It does not export a
search service: store vectors through the consuming project's Model and compose pgvector queries
with Puri from `"sonamu"`.

## Structure

| Task | Read |
| --- | --- |
| Install a provider, configure its key, call `Embedding.embedOne()` / `embed()`, or diagnose provider, batching, token-count, or dimension behavior | `references/embeddings.md` |
| Split text, tune `Chunking`, interpret offsets and overlap, or decide whether token-aware splitting is needed | `references/chunking.md` |
| Declare and persist a vector column, add an index, call `Puri.vectorSimilarity()`, or combine vector and text search | `references/persistence-and-search.md` |

Start at the text boundary: use `"document"` while generating stored Voyage vectors and `"query"`
while generating their search vectors. Then keep the provider/model and vector dimensions aligned
between both sides and the entity column.

## Embedding Providers

These are Sonamu's checked-in defaults, not a live statement of provider limits:

| Provider | Default model | `getDimensions()` | Split above | Recorded `maxTokens` | Runtime package |
| --- | --- | ---: | ---: | ---: | --- |
| `"voyage"` | `voyage-3` | 1024 | 128 texts | 32000 | `voyageai` |
| `"openai"` | `text-embedding-3-small` | 1536 | 100 texts | 8191 | `@ai-sdk/openai` |

The batch sizes affect `Embedding.embed()`. `dimensions` is returned as metadata, and `maxTokens`
is not checked before a request. Sonamu does not validate returned vector length against either
value.

### API Key Configuration

`sonamu/vector` eagerly re-exports the embedding module, and that module statically imports `ai`.
Install `ai` even when the only imported symbol is `Chunking`. The provider SDKs are loaded
dynamically, so install only the one whose provider path the application invokes:

```bash
pnpm add ai
pnpm add voyageai          # before invoking the Voyage path
pnpm add @ai-sdk/openai    # before invoking the OpenAI path
```

```dotenv
VOYAGE_API_KEY=pa-...
OPENAI_API_KEY=sk-...
```

There is no `secret` block for these keys in `sonamu.config.ts`. Missing keys throw
`VOYAGE_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.` or
`OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.` before the provider request.

## Embedding Usage

Import the singleton from the public subpath:

```typescript
import { Embedding } from "sonamu/vector";

const stored = await Embedding.embedOne(sourceText, "voyage", "document");
const query = await Embedding.embedOne(searchText, "voyage", "query");

const batch = await Embedding.embed(sourceTexts, "voyage", "document");
```

Each result is `{ embedding: number[]; model: string; tokenCount: number }`. The public batch method
is `embed()`; there is no exported Sonamu `embedMany()` wrapper. See
`references/embeddings.md` before treating `tokenCount` as a per-text count or relying on the
progress callback.

### Voyage AI inputType (Asymmetric Embedding)

`inputType` defaults to `"document"`. Voyage receives it unchanged; the OpenAI path ignores it.
For Voyage search, swapping the stored-document and query values still type-checks and reaches the
provider, so keep the two call sites explicit.

## Chunking Usage

`Chunking` is a delimiter-aware character splitter:

```typescript
import { Chunking } from "sonamu/vector";

const chunking = new Chunking({ chunkSize: 500, chunkOverlap: 50 });
const chunks = chunking.chunk(text);
// Array<{ index: number; text: string; startOffset: number; endOffset: number }>
```

It has no token mode, semantic mode, Markdown mode, or `chunkText()` function. Character counts do
not enforce either provider's token limit. Read `references/chunking.md` for separator selection,
trimmed text versus source offsets, and configurations that can stop making progress.

### Chunking Default Settings

| Option | Default | Runtime effect |
| --- | ---: | --- |
| `chunkSize` | 500 | Separator target or hard-split size in UTF-16 code units |
| `chunkOverlap` | 50 | Source characters revisited at the next start position |
| `minChunkSize` | 50 | After the skip path, drops shorter trimmed chunks and supplies the minimum advance |
| `skipThreshold` | 200 | Text shorter than this returns as one trimmed chunk |
| `separators` | paragraph, newline, punctuation, comma, space | Priority order for finding a split at or before `chunkSize` |

`needsChunking()` checks only `text.length > chunkSize`; `estimateChunkCount()` is a fixed-size
estimate and does not simulate separators or `skipThreshold`.

## Search Configuration

`DEFAULT_VECTOR_CONFIG` and `createVectorConfig()` are public configuration-data helpers, but there
is no public configurable embedding client or search class that accepts their output. In particular,
`search`, `pgvector`, provider `baseUrl` / `apiKey`, and provider `maxTokens` do not alter requests or
queries. `Embedding` uses its import-time defaults, while `Chunking` accepts its own partial options.

Use Puri's `vectorSimilarity()` for database ranking and the PostgreSQL text-search methods in
`sonamu-query` for hybrid composition. Sonamu currently provides no reranker, embedding cache,
retry/rate-limit layer, or built-in hybrid rank merger.

## Type Definitions

`sonamu/vector` re-exports all declarations in its `types` module. `EmbeddingResult`, `Chunk`,
`EmbeddingProvider`, `VectorInputType`, `ChunkingConfig`, and `VectorConfig` describe active public
calls or data. The search and benchmark declarations below are types only; no exported runtime
search implementation produces them.

### VectorSearchResult

```typescript
interface VectorSearchResult<T = Record<string, unknown>> {
  id: number | string;
  similarity: number;
  data: T;
}
```

### HybridSearchResult

```typescript
interface HybridSearchResult<T = Record<string, unknown>> extends VectorSearchResult<T> {
  vectorScore?: number;
  ftsScore?: number;
}
```

### VectorSearchOptions

`VectorSearchOptions` is exported as a shape with `embeddingColumn`, `limit`, `threshold`, and raw
`where` fields. No public vector function consumes it. Puri has its own typed
`vectorSimilarity(column, embedding, { method, threshold, distinctOn })` options.

### HybridSearchOptions

`HybridSearchOptions` adds `vectorWeight`, `ftsWeight`, and `ftsColumn` to that inactive type. These
weights are not applied automatically; compose and normalize scores in project code when hybrid
ranking is required.

## pgvector DB Setup

Database structure is entity and migration work; query composition is Puri work. The full handoff is
in `references/persistence-and-search.md`.

### Install Extension

Sonamu's local PostgreSQL initialization installs the `vector` extension. For another database
environment, make the extension available before applying a migration containing a vector column.

### Add Embedding Column

Declare `{ "type": "vector", "dimensions": 1024 }` in the entity for Sonamu's default Voyage
dimension, or `1536` for its default OpenAI dimension, then generate and run the migration. The
entity schema requires `dimensions`; embedding generation does not infer or update it.

### HNSW Index

Declare an entity index with `type: "hnsw"` and an opclass matching the query distance operation.
Index shape and migration defaults belong to `sonamu-entity`; query operators and threshold behavior
belong to `sonamu-query`.

## References

- `references/embeddings.md` — provider setup, call contracts, batching, results, and failures
- `references/chunking.md` — exact character splitting and overlap behavior
- `references/persistence-and-search.md` — entity, persistence, Puri, and capability boundaries
