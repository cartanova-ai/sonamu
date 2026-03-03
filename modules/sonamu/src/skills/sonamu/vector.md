---
name: sonamu-vector
description: pgvector 기반 벡터 검색. Embedding(Voyage AI/OpenAI), Chunking, 하이브리드 검색(Vector+FTS) 지원. Use when implementing vector search, semantic search, or text embedding features.
---

# 벡터 검색 가이드

Sonamu는 pgvector 기반 벡터 검색을 지원합니다. Voyage AI와 OpenAI 임베딩 프로바이더를 통합 지원하며, 하이브리드 검색(Vector + Full-Text Search)도 가능합니다.

**소스코드:** `modules/sonamu/src/vector/`

---

## 구조

| 파일 | 역할 |
|------|------|
| `types.ts` | 전체 타입 정의 (EmbeddingProvider, VectorSearchResult, VectorConfig 등) |
| `config.ts` | 기본 설정값 + `createVectorConfig()` 헬퍼 |
| `embedding.ts` | Embedding 클라이언트 (Voyage AI, OpenAI 통합) |
| `chunking.ts` | 텍스트 청킹 (긴 문서 분할) |

---

## 임베딩 프로바이더

| 프로바이더 | 모델 | 차원 | maxTokens | batchSize | 패키지 |
|-----------|------|------|-----------|-----------|--------|
| `voyage` | `voyage-3` | 1024 | 32000 | 128 | `voyageai` |
| `openai` | `text-embedding-3-small` | 1536 | 8191 | 100 | `@ai-sdk/openai` |

### API 키 설정

```bash
# 환경변수
export VOYAGE_API_KEY=pa-...
export OPENAI_API_KEY=sk-...
```

또는 `sonamu.config.ts`:
```typescript
export default defineConfig({
  secret: {
    voyage_api_key: "pa-...",
    openai_api_key: "sk-...",
  },
});
```

키 우선순위: `Sonamu.secrets.voyage_api_key` → `process.env.VOYAGE_API_KEY`

---

## Embedding 사용법

```typescript
import { Embedding } from "sonamu/vector";

// 단일 텍스트
const result = await Embedding.embedOne("검색할 텍스트", "voyage", "query");
// result: { embedding: number[], model: "voyage-3", tokenCount: 15 }

// 다수 텍스트 (batchSize 초과 시 자동 분할)
const results = await Embedding.embed(
  ["텍스트1", "텍스트2", ...],
  "voyage",
  "document",         // inputType: "document" | "query"
  (processed, total) => console.log(`${processed}/${total}`),  // 진행률 콜백
);

// 차원 수 확인
Embedding.getDimensions("voyage");  // 1024
Embedding.getDimensions("openai");  // 1536
```

### Voyage AI inputType (비대칭 임베딩)

| inputType | 용도 |
|-----------|------|
| `"document"` | DB에 저장할 문서 임베딩 시 |
| `"query"` | 검색 쿼리 임베딩 시 |

**CRITICAL: 저장 시 `"document"`, 검색 시 `"query"`를 사용해야 비대칭 임베딩이 올바르게 작동합니다.**

---

## Chunking 사용법

긴 문서를 적절한 크기로 분할합니다.

```typescript
import { Chunking } from "sonamu/vector";

const chunker = new Chunking({
  chunkSize: 500,     // 청크 최대 크기 (문자 수)
  chunkOverlap: 50,   // 청크 간 겹침
  minChunkSize: 50,   // 최소 청크 크기
});

// 청킹 필요 여부
chunker.needsChunking("짧은 텍스트");  // false

// 청크 분할
const chunks = chunker.chunk(longText);
// chunks: [{ index: 0, text: "...", startOffset: 0, endOffset: 500 }, ...]

// 예상 청크 수
chunker.estimateChunkCount(longText);  // 5
```

### 청킹 기본 설정

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `chunkSize` | 500 | 청크 최대 크기 (문자 수) |
| `chunkOverlap` | 50 | 청크 간 겹침 |
| `minChunkSize` | 50 | 최소 청크 크기 |
| `skipThreshold` | 200 | 이 크기 이하면 청킹 없이 통과 |
| `separators` | `["\n\n", "\n", "。", ". ", ...]` | 분할 기준 (우선순위 순) |

---

## 검색 설정

```typescript
import { createVectorConfig } from "sonamu/vector";

const config = createVectorConfig({
  search: {
    defaultLimit: 10,
    similarityThreshold: 0.5,  // 이 값 이하는 결과에서 제외
    vectorWeight: 0.7,         // 하이브리드 검색 시 벡터 가중치
    ftsWeight: 0.3,            // 하이브리드 검색 시 FTS 가중치
  },
  pgvector: {
    iterativeScan: true,       // pgvector iterative scan 사용
    efSearch: 100,             // HNSW 인덱스 검색 정확도
  },
});
```

---

## 타입 정의

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
  embeddingColumn?: string;  // 임베딩 컬럼명 (기본: "embedding")
  limit?: number;
  threshold?: number;        // 유사도 임계값
  where?: string;            // SQL WHERE 조건
}
```

### HybridSearchOptions

```typescript
interface HybridSearchOptions extends VectorSearchOptions {
  vectorWeight?: number;     // 벡터 검색 가중치
  ftsWeight?: number;        // FTS 가중치
  ftsColumn?: string;        // FTS 대상 컬럼명
}
```

---

## pgvector DB 설정

### 확장 설치

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 임베딩 컬럼 추가

```sql
-- Voyage AI (1024차원)
ALTER TABLE documents ADD COLUMN embedding vector(1024);

-- OpenAI (1536차원)
ALTER TABLE documents ADD COLUMN embedding vector(1536);
```

### HNSW 인덱스

```sql
-- 코사인 유사도 기반 인덱스
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

---

## 참고

- **소스코드**: `modules/sonamu/src/vector/`
- **pgvector 공식**: https://github.com/pgvector/pgvector
- **Voyage AI**: https://docs.voyageai.com/
