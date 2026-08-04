---
name: sonamu-vector
description: Implements semantic and hybrid search with pgvector. Use when generating embeddings, chunking documents, or combining vector similarity with full-text search. Covers the Voyage AI and OpenAI embedding providers, chunking strategies, and hybrid ranking.
---

# Vector Search Guide

Sonamu supports pgvector-based vector search. It integrates both Voyage AI and OpenAI embedding providers, and also supports hybrid search (Vector + Full-Text Search).

Source code: `modules/sonamu/src/vector/`

## Structure

| File           | Role                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `types.ts`     | Full type definitions (EmbeddingProvider, VectorSearchResult, VectorConfig, etc.) |
| `config.ts`    | Default configuration values + `createVectorConfig()` helper                      |
| `embedding.ts` | Embedding client (Voyage AI and OpenAI integration)                               |
| `chunking.ts`  | Text chunking (splitting long documents)                                          |

## Embedding Providers

| Provider | Model                    | Dimensions | maxTokens | batchSize | Package          |
| -------- | ------------------------ | ---------- | --------- | --------- | ---------------- |
| `voyage` | `voyage-3`               | 1024       | 32000     | 128       | `voyageai`       |
| `openai` | `text-embedding-3-small` | 1536       | 8191      | 100       | `@ai-sdk/openai` |

### API Key Configuration

```bash
# Environment variables
export VOYAGE_API_KEY=pa-...
export OPENAI_API_KEY=sk-...
```

Or in `sonamu.config.ts`:

```typescript
export default defineConfig({
  secret: {
    voyage_api_key: "pa-...",
    openai_api_key: "sk-...",
  },
});
```

Key priority: `Sonamu.secrets.voyage_api_key` → `process.env.VOYAGE_API_KEY`

## Embedding Usage

```typescript
import { Embedding } from "sonamu/vector";

// Single text
const result = await Embedding.embedOne("text to search", "voyage", "query");
// result: { embedding: number[], model: "voyage-3", tokenCount: 15 }

// Multiple texts (auto-splits when exceeding batchSize)
const results = await Embedding.embed(
  ["text1", "text2", ...],
  "voyage",
  "document",         // inputType: "document" | "query"
  (processed, total) => console.log(`${processed}/${total}`),  // progress callback
);

// Check number of dimensions
Embedding.getDimensions("voyage");  // 1024
Embedding.getDimensions("openai");  // 1536
```

### Voyage AI inputType (Asymmetric Embedding)

| inputType    | Use case                                |
| ------------ | --------------------------------------- |
| `"document"` | When embedding documents to store in DB |
| `"query"`    | When embedding search queries           |

Asymmetric embedding means the two sides are embedded differently on purpose. Using the same
`inputType` for both — or swapping them — produces vectors from the wrong half of the model, and
similarity scores degrade silently rather than erroring.

## Chunking Usage

Splits long documents into appropriately-sized pieces.

```typescript
import { Chunking } from "sonamu/vector";

const chunker = new Chunking({
  chunkSize: 500, // Maximum chunk size (character count)
  chunkOverlap: 50, // Overlap between chunks
  minChunkSize: 50, // Minimum chunk size
});

// Check if chunking is needed
chunker.needsChunking("short text"); // false

// Split into chunks
const chunks = chunker.chunk(longText);
// chunks: [{ index: 0, text: "...", startOffset: 0, endOffset: 500 }, ...]

// Estimate number of chunks
chunker.estimateChunkCount(longText); // 5
```

### Chunking Default Settings

| Option          | Default                           | Description                                              |
| --------------- | --------------------------------- | -------------------------------------------------------- |
| `chunkSize`     | 500                               | Maximum chunk size (character count)                     |
| `chunkOverlap`  | 50                                | Overlap between chunks                                   |
| `minChunkSize`  | 50                                | Minimum chunk size                                       |
| `skipThreshold` | 200                               | Passes through without chunking if at or below this size |
| `separators`    | `["\n\n", "\n", "。", ". ", ...]` | Split delimiters (in priority order)                     |

## Search Configuration

```typescript
import { createVectorConfig } from "sonamu/vector";

const config = createVectorConfig({
  search: {
    defaultLimit: 10,
    similarityThreshold: 0.5, // Results below this value are excluded
    vectorWeight: 0.7, // Vector weight in hybrid search
    ftsWeight: 0.3, // FTS weight in hybrid search
  },
  pgvector: {
    iterativeScan: true, // Use pgvector iterative scan
    efSearch: 100, // HNSW index search accuracy
  },
});
```

## Type Definitions

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
interface HybridSearchResult<T> extends VectorSearchResult<T> {
  vectorScore?: number;
  ftsScore?: number;
}
```

### VectorSearchOptions

```typescript
interface VectorSearchOptions {
  embeddingColumn?: string; // Embedding column name (default: "embedding")
  limit?: number;
  threshold?: number; // Similarity threshold
  where?: string; // SQL WHERE condition
}
```

### HybridSearchOptions

```typescript
interface HybridSearchOptions extends VectorSearchOptions {
  vectorWeight?: number; // Vector search weight
  ftsWeight?: number; // FTS weight
  ftsColumn?: string; // Target column name for FTS
}
```

## pgvector DB Setup

### Install Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Add Embedding Column

```sql
-- Voyage AI (1024 dimensions)
ALTER TABLE documents ADD COLUMN embedding vector(1024);

-- OpenAI (1536 dimensions)
ALTER TABLE documents ADD COLUMN embedding vector(1536);
```

### HNSW Index

```sql
-- Cosine similarity-based index
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

## References

- Source code: `modules/sonamu/src/vector/`
- pgvector official: https://github.com/pgvector/pgvector
- Voyage AI: https://docs.voyageai.com/
