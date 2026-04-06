# PostgreSQL 18 + pgvector 벡터 검색 가이드

> **환경**: PostgreSQL 18.x + pgvector 0.8.1
> **프레임워크**: Sonamu (TypeScript/Fastify)
> **임베딩**: Voyage AI (voyage-3) + OpenAI (text-embedding-3-small)
> **대상 테이블**: sync_fixtures

---

## 목차

1. [개요](#1-개요)
2. [환경 설정](#2-환경-설정)
3. [핵심 개념](#3-핵심-개념)
4. [테이블 설계](#4-테이블-설계)
5. [Sonamu 프레임워크 통합](#5-sonamu-프레임워크-통합)
6. [서비스 구현](#6-서비스-구현)
7. [사용 예제](#7-사용-예제)
8. [CLI 스크립트](#8-cli-스크립트)
9. [Voyage AI vs OpenAI 비교](#9-voyage-ai-vs-openai-비교)
10. [운영 체크리스트](#10-운영-체크리스트)

---

## 1. 개요

### 1.1 벡터 검색이란?

텍스트를 숫자 배열(벡터)로 변환 후, 수학적 거리 계산으로 "의미적으로 비슷한" 데이터를 찾는 기술입니다.

```
[저장]
"사용자 인증 API - JWT 토큰을 검증합니다" → [0.12, -0.45, 0.78, ...] → DB 저장

[검색]
"JWT 인증 방법" → [0.08, -0.52, 0.81, ...] → 유사도 계산 → 결과 반환
```

### 1.2 이 가이드의 접근 방식

```
✅ 기존 테이블(sync_fixtures)에 vector 컬럼만 추가
✅ 별도의 chunks 테이블 불필요 (400토큰 이하 가정)
✅ name + description 합쳐서 임베딩 (검색 품질 향상)
✅ Voyage AI와 OpenAI 비교 테스트 포함
```

---

## 2. 환경 설정

### 2.1 Docker Compose

```yaml
# database/docker-compose.yml
name: miomock
services:
  pg:
    platform: linux/arm64
    image: pgvector/pgvector:pg18
    container_name: miomock-pg
    volumes:
      - ./fixtures/init.sql:/docker-entrypoint-initdb.d/init.sql
      - ./pgdata:/var/lib/postgresql
    environment:
      POSTGRES_DB: miomock
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: miomock123
      TZ: Asia/Seoul
    ports:
      - "5432:5432"
```

```bash
cd database
docker-compose up -d
```

### 2.2 init.sql에 pgvector 활성화

```sql
-- database/fixtures/init.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.3 환경 변수 (Sonamu secrets)

Sonamu는 `Sonamu.secrets`를 통해 API 키를 자동으로 로드합니다.

```bash
# .env 또는 secrets 설정
# Voyage AI (https://www.voyageai.com)
voyage_api_key=pa-xxxxxxxxxxxxxxxx

# OpenAI (https://platform.openai.com)
openai_api_key=sk-xxxxxxxxxxxxxxxx
```

> **Note**: 환경변수 이름은 소문자 snake_case로 설정합니다. (`VOYAGE_API_KEY`가 아닌 `voyage_api_key`)

### 2.4 npm 패키지 설치

```bash
# pgvector Knex 헬퍼 패키지 (필수)
pnpm add pgvector
```

### 2.5 pgvector 이미지 태그 옵션

| 태그                           | 설명                            |
| ------------------------------ | ------------------------------- |
| `pgvector/pgvector:pg18`       | PostgreSQL 18 + pgvector (최신) |
| `pgvector/pgvector:pg17`       | PostgreSQL 17 + pgvector        |
| `pgvector/pgvector:0.8.1-pg18` | 특정 pgvector 버전 지정         |

---

## 3. 핵심 개념

### 3.1 기존 테이블에 벡터 추가 (권장)

```
✅ 단순한 방식 (400토큰 이하):
┌─────────────────────────────────────┐
│  sync_fixtures (기존 테이블)        │
│  + content_embedding vector(1024)   │
└─────────────────────────────────────┘

❌ 복잡한 방식 (청킹이 필요한 경우에만):
┌─────────────┐      ┌─────────────────┐
│  documents  │ 1:N  │  document_chunks│
│             │──────│  + embedding    │
└─────────────┘      └─────────────────┘
```

### 3.2 name + description 합쳐서 임베딩

```
이유:
┌─────────────────────────────────────────────────────────────────┐
│  name: "사용자 인증 API"                                        │
│  description: "JWT 토큰을 검증하고 사용자 정보를 반환합니다"    │
│                                                                 │
│  검색어: "인증 API" → name에 있음                               │
│  검색어: "JWT 검증" → description에 있음                        │
│                                                                 │
│  둘 다 찾으려면 합쳐서 임베딩하는 게 좋음                       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 input_type 파라미터 (Voyage AI)

Voyage AI는 **비대칭 임베딩**을 사용합니다:

| 상황           | input_type   | 설명             |
| -------------- | ------------ | ---------------- |
| DB에 저장할 때 | `"document"` | 긴 문서용 변환   |
| 검색할 때      | `"query"`    | 짧은 질문용 변환 |

```typescript
// ✅ 저장 시 (VectorSearch 내부에서 자동 처리)
await embed(`${name}\n${description}`, "document");

// ✅ 검색 시 (VectorSearch 내부에서 자동 처리)
await embed(searchQuery, "query");
```

> **Note**: `VectorSearch` 클래스가 저장/검색 시 `input_type`을 자동으로 설정합니다.

### 3.4 Iterative Scan (pgvector 0.8.0+)

WHERE 절로 필터링할 때 정확한 결과를 보장합니다:

```sql
SET hnsw.iterative_scan = relaxed_order;
```

> **Note**: `VectorSearch` 클래스가 검색 시 자동으로 설정합니다.

### 3.5 pgvector 연산자

| 연산자 | 설명                     | 용도                       |
| ------ | ------------------------ | -------------------------- |
| `<=>`  | Cosine distance          | ✅ 텍스트 유사도 (권장)    |
| `<->`  | L2 distance (Euclidean)  | 거리 기반 검색             |
| `<#>`  | Inner product (negative) | 정규화된 벡터, 추천 시스템 |
| `<+>`  | L1 distance (Manhattan)  | 특수한 경우                |

---

## 4. 테이블 설계

### 4.1 벡터 컬럼 추가

```sql
-- Voyage AI용 벡터 컬럼 (1024차원)
ALTER TABLE sync_fixtures
ADD COLUMN content_embedding vector(1024);

-- OpenAI 비교용 벡터 컬럼 (1536차원) - 선택
ALTER TABLE sync_fixtures
ADD COLUMN content_embedding_openai vector(1536);

-- 하이브리드 검색용 FTS 컬럼 - 선택
ALTER TABLE sync_fixtures
ADD COLUMN content_tsv tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
) STORED;
```

### 4.2 인덱스 생성

```sql
-- HNSW 인덱스 (권장 - 빠른 검색, 높은 정확도)
CREATE INDEX idx_sync_fixtures_embedding ON sync_fixtures
USING hnsw (content_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- OpenAI 벡터 인덱스 (비교용)
CREATE INDEX idx_sync_fixtures_embedding_openai ON sync_fixtures
USING hnsw (content_embedding_openai vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- FTS 인덱스 (하이브리드 검색용)
CREATE INDEX idx_sync_fixtures_fts ON sync_fixtures USING GIN (content_tsv);
```

### 4.3 인덱스 옵션 비교

| 인덱스      | 장점                   | 단점         | 권장 용도            |
| ----------- | ---------------------- | ------------ | -------------------- |
| **HNSW**    | 빠른 검색, 높은 정확도 | 빌드 시간 김 | 일반적인 경우 (권장) |
| **IVFFlat** | 빠른 빌드, 낮은 메모리 | 정확도 낮음  | 1M+ 레코드 대용량    |

```sql
-- IVFFlat 인덱스 (대용량)
CREATE INDEX idx_sync_fixtures_ivfflat
ON sync_fixtures USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 100);  -- sqrt(rows) 권장
```

---

## 5. Sonamu 프레임워크 통합

### 5.1 구현 완료 현황

| 구분                                             | 상태 | 비고                                              |
| ------------------------------------------------ | ---- | ------------------------------------------------- |
| Docker 환경 (pgvector/pgvector:pg18)             | ✅   | init.sql에 extension 추가 완료                    |
| Sonamu 타입 시스템 (VectorProp, VectorArrayProp) | ✅   | type guard, Zod 스키마 포함                       |
| 마이그레이션 코드 생성                           | ✅   | `table.specificType('embedding', 'vector(1536)')` |
| Sonamu UI (dimensions 입력)                      | ✅   |                                                   |
| Embedding/VectorSearch 서비스                    | ✅   | sonamu 모듈에 구현                                |

### 5.2 타입 정의

```typescript
// sonamu/src/types/types.ts
export type VectorProp = CommonProp & {
  type: "vector";
  dimensions: number;
};

export type VectorArrayProp = CommonProp & {
  type: "vector[]";
  dimensions: number;
};

// Type Guards
export function isVectorSingleProp(p: unknown): p is VectorProp {
  return (p as VectorProp)?.type === "vector";
}
export function isVectorArrayProp(p: unknown): p is VectorArrayProp {
  return (p as VectorArrayProp)?.type === "vector[]";
}
export function isVectorProp(p: unknown): p is VectorProp | VectorArrayProp {
  return isVectorSingleProp(p) || isVectorArrayProp(p);
}
```

### 5.3 Entity 정의 예시

```json
{
  "id": "Document",
  "table": "documents",
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "title", "type": "string", "length": 255 },
    { "name": "content", "type": "string" },
    {
      "name": "embedding",
      "type": "vector",
      "dimensions": 1024,
      "nullable": true,
      "desc": "Voyage AI voyage-3 벡터"
    }
  ]
}
```

### 5.4 자동 생성되는 마이그레이션 코드

```typescript
// 자동 생성됨
table.specificType("embedding", "vector(1024)").nullable();
```

### 5.5 Zod 스키마 변환

```typescript
// vector 타입의 Zod 스키마
embedding: z.array(z.number()); // vector
embeddings: z.array(z.array(z.number())); // vector[]
```

---

## 6. 서비스 구현

Sonamu 모듈에서 벡터 관련 클래스와 타입을 export합니다:

```typescript
import {
  DB,
  Embedding,
  VectorSearch,
  type EmbeddingProvider,
  type EmbeddingResult,
  type VectorSearchResult,
  type HybridSearchResult,
  type VectorSearchOptions,
  type HybridSearchOptions,
  type EmbeddingItem,
  type ProgressCallback,
} from "sonamu";
```

### 6.1 기본 설정 (DEFAULT_VECTOR_CONFIG)

```typescript
// sonamu/src/vector/config.ts
export const DEFAULT_VECTOR_CONFIG = {
  // Voyage AI 설정
  voyage: {
    apiKey: "", // Sonamu.secrets.voyage_api_key에서 자동 로드
    baseUrl: "https://api.voyageai.com/v1/embeddings",
    model: "voyage-3",
    dimensions: 1024,
    maxTokens: 32000,
    batchSize: 100,
  },

  // OpenAI 설정
  openai: {
    apiKey: "", // Sonamu.secrets.openai_api_key에서 자동 로드
    baseUrl: "https://api.openai.com/v1/embeddings",
    model: "text-embedding-3-small",
    dimensions: 1536,
    maxTokens: 8191,
    batchSize: 100,
  },

  // 검색 설정
  search: {
    defaultLimit: 10,
    similarityThreshold: 0.5,
    vectorWeight: 0.7,
    ftsWeight: 0.3,
  },

  // pgvector 설정
  pgvector: {
    iterativeScan: true, // WHERE 절 필터링 시 정확한 결과 보장
    efSearch: 100,
  },
};
```

### 6.2 타입 정의

```typescript
// sonamu/src/vector/types.ts

/** 임베딩 제공자 */
export type EmbeddingProvider = "voyage" | "openai";

/** 입력 타입 (Voyage AI 전용 - 비대칭 임베딩) */
export type VectorInputType = "document" | "query";

/** 임베딩 결과 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount: number;
}

/** 벡터 검색 결과 */
export interface VectorSearchResult<T = Record<string, unknown>> {
  id: number | string;
  similarity: number;
  data: T;
}

/** 하이브리드 검색 결과 (Vector + FTS) */
export interface HybridSearchResult<T = Record<string, unknown>> extends VectorSearchResult<T> {
  vectorScore?: number;
  ftsScore?: number;
}

/** 벡터 검색 옵션 */
export interface VectorSearchOptions {
  embeddingColumn?: string; // 기본값: "content_embedding"
  limit?: number; // 기본값: 10
  threshold?: number; // 기본값: 0.5
  where?: string; // SQL WHERE 절 (예: "is_active = true")
}

/** 하이브리드 검색 옵션 */
export interface HybridSearchOptions extends VectorSearchOptions {
  vectorWeight?: number; // 기본값: 0.7
  ftsWeight?: number; // 기본값: 0.3
  ftsColumn?: string; // 기본값: "content_tsv"
}

/** 임베딩 저장 항목 */
export interface EmbeddingItem {
  id: number;
  text: string;
}

/** 진행률 콜백 */
export type ProgressCallback = (processed: number, total: number) => void;
```

### 6.3 Embedding 클래스

```typescript
// sonamu/src/vector/embedding.ts
export class Embedding {
  constructor(config?: Partial<VectorConfig>);

  /**
   * 텍스트 임베딩 생성
   * @param texts - 임베딩할 텍스트 배열
   * @param provider - 'voyage' | 'openai'
   * @param inputType - 'document' | 'query' (Voyage AI만 해당)
   */
  async embed(
    texts: string[],
    provider: EmbeddingProvider,
    inputType?: VectorInputType,
  ): Promise<EmbeddingResult[]>;

  /**
   * 단일 텍스트 임베딩 (편의 메서드)
   */
  async embedOne(
    text: string,
    provider: EmbeddingProvider,
    inputType?: VectorInputType,
  ): Promise<EmbeddingResult>;

  /**
   * 배치 임베딩 (대량 처리)
   * - 100개씩 배치 처리
   * - Rate limiting 포함 (100ms between batches)
   */
  async embedBatch(
    texts: string[],
    provider: EmbeddingProvider,
    inputType?: VectorInputType,
    onProgress?: ProgressCallback,
  ): Promise<EmbeddingResult[]>;

  /**
   * 벡터를 PostgreSQL vector 타입 문자열로 변환
   */
  static toVectorString(embedding: number[]): string;

  /**
   * 임베딩 provider의 차원 수 반환
   */
  getDimensions(provider: EmbeddingProvider): number;
}
```

### 6.4 VectorSearch 클래스

```typescript
// sonamu/src/vector/vector-search.ts
import type { Knex } from "knex";

export class VectorSearch<T = Record<string, unknown>> {
  /**
   * @param db - Knex 인스턴스 (DB.getDB("w") 또는 DB.getDB("r"))
   * @param tableName - 테이블 이름
   * @param config - 옵션 설정 (기본값 자동 적용)
   */
  constructor(db: Knex, tableName: string, config?: Partial<VectorConfig>);

  /**
   * 단일 항목에 임베딩 저장
   * - input_type: "document"로 자동 설정
   */
  async saveEmbedding(
    id: number,
    text: string,
    provider: EmbeddingProvider,
    embeddingColumn?: string, // 기본값: "content_embedding"
  ): Promise<void>;

  /**
   * 여러 항목에 임베딩 일괄 저장
   * - input_type: "document"로 자동 설정
   * - 트랜잭션으로 일괄 처리
   */
  async saveEmbeddingsBatch(
    items: EmbeddingItem[],
    provider: EmbeddingProvider,
    embeddingColumn?: string,
    onProgress?: ProgressCallback,
  ): Promise<void>;

  /**
   * 벡터 검색 (코사인 유사도)
   * - input_type: "query"로 자동 설정
   * - hnsw.iterative_scan, ef_search 자동 설정
   */
  async search(
    query: string,
    provider: EmbeddingProvider,
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult<T>[]>;

  /**
   * 하이브리드 검색 (Vector + FTS)
   * - RRF(Reciprocal Rank Fusion) 사용
   */
  async hybridSearch(
    query: string,
    provider: EmbeddingProvider,
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResult<T>[]>;

  /**
   * 임베딩 현황 조회
   */
  async getEmbeddingStatus(embeddingColumn?: string): Promise<{
    total: number;
    withEmbedding: number;
    withoutEmbedding: number;
  }>;

  /**
   * 임베딩이 없는 항목 ID 조회
   */
  async getItemsWithoutEmbedding(embeddingColumn?: string, limit?: number): Promise<number[]>;

  /**
   * Embedding 인스턴스 반환 (고급 사용)
   */
  getEmbedding(): Embedding;
}
```

---

## 7. 사용 예제

### 7.1 도메인별 벡터 검색 래퍼

```typescript
// src/application/sync-fixture/sync-fixture.vector.ts
import {
  DB,
  VectorSearch,
  type EmbeddingProvider,
  type VectorSearchResult,
  type HybridSearchResult,
} from "sonamu";
import type { SyncFixtureSubsetA } from "../sonamu.generated";

// VectorSearch 인스턴스 (싱글톤)
let _vectorSearch: VectorSearch<SyncFixtureSubsetA> | null = null;

export function getVectorSearch(): VectorSearch<SyncFixtureSubsetA> {
  if (!_vectorSearch) {
    // DB.getDB("w")는 Knex 인스턴스를 반환
    _vectorSearch = new VectorSearch<SyncFixtureSubsetA>(DB.getDB("w"), "sync_fixtures");
  }
  return _vectorSearch;
}

/**
 * name + description을 합쳐서 임베딩용 텍스트 생성
 */
export function buildEmbeddingText(name: string, description: string | null): string {
  return `${name}\n${description || ""}`.trim();
}

/**
 * 단일 SyncFixture에 임베딩 저장
 */
export async function saveSyncFixtureEmbedding(
  id: number,
  name: string,
  description: string | null,
  provider: EmbeddingProvider = "voyage",
  embeddingColumn: string = "content_embedding",
): Promise<void> {
  const text = buildEmbeddingText(name, description);
  const vectorSearch = getVectorSearch();
  await vectorSearch.saveEmbedding(id, text, provider, embeddingColumn);
}

/**
 * 여러 SyncFixture에 임베딩 일괄 저장
 */
export async function saveSyncFixtureEmbeddingsBatch(
  items: Array<{ id: number; name: string; description: string | null }>,
  provider: EmbeddingProvider = "voyage",
  embeddingColumn: string = "content_embedding",
  onProgress?: (processed: number, total: number) => void,
): Promise<void> {
  const vectorSearch = getVectorSearch();
  const embeddingItems = items.map((item) => ({
    id: item.id,
    text: buildEmbeddingText(item.name, item.description),
  }));
  await vectorSearch.saveEmbeddingsBatch(embeddingItems, provider, embeddingColumn, onProgress);
}

/**
 * SyncFixture 벡터 검색
 */
export async function searchSyncFixtures(
  query: string,
  options: {
    provider?: EmbeddingProvider;
    embeddingColumn?: string;
    limit?: number;
    threshold?: number;
    where?: string;
  } = {},
): Promise<VectorSearchResult<SyncFixtureSubsetA>[]> {
  const vectorSearch = getVectorSearch();
  return vectorSearch.search(query, options.provider ?? "voyage", {
    embeddingColumn: options.embeddingColumn ?? "content_embedding",
    limit: options.limit ?? 10,
    threshold: options.threshold ?? 0.5,
    where: options.where,
  });
}

/**
 * SyncFixture 하이브리드 검색 (Vector + FTS)
 */
export async function hybridSearchSyncFixtures(
  query: string,
  options: {
    provider?: EmbeddingProvider;
    embeddingColumn?: string;
    ftsColumn?: string;
    limit?: number;
    vectorWeight?: number;
    ftsWeight?: number;
  } = {},
): Promise<HybridSearchResult<SyncFixtureSubsetA>[]> {
  const vectorSearch = getVectorSearch();
  return vectorSearch.hybridSearch(query, options.provider ?? "voyage", {
    embeddingColumn: options.embeddingColumn ?? "content_embedding",
    ftsColumn: options.ftsColumn ?? "content_tsv",
    limit: options.limit ?? 10,
    vectorWeight: options.vectorWeight ?? 0.7,
    ftsWeight: options.ftsWeight ?? 0.3,
  });
}

/**
 * 임베딩 현황 조회
 */
export async function getSyncFixtureEmbeddingStatus(embeddingColumn: string = "content_embedding") {
  const vectorSearch = getVectorSearch();
  return vectorSearch.getEmbeddingStatus(embeddingColumn);
}

/**
 * VectorSearch 인스턴스 초기화 및 DB 연결 종료
 */
export async function resetVectorSearch(): Promise<void> {
  _vectorSearch = null;
  await DB.destroy();
}
```

### 7.2 임베딩 저장

```typescript
import {
  saveSyncFixtureEmbeddingsBatch,
  getSyncFixtureEmbeddingStatus,
} from "./sync-fixture.vector";

async function migrateEmbeddings() {
  // 임베딩이 없는 항목 조회
  const fixtures = await db("sync_fixtures")
    .select("id", "name", "description")
    .whereNull("content_embedding")
    .limit(1000);

  console.log(`임베딩 대상: ${fixtures.length}개`);

  // 일괄 저장 (진행률 표시)
  await saveSyncFixtureEmbeddingsBatch(
    fixtures,
    "voyage",
    "content_embedding",
    (processed, total) => {
      const pct = ((processed / total) * 100).toFixed(1);
      console.log(`진행률: ${processed}/${total} (${pct}%)`);
    },
  );

  // 결과 확인
  const status = await getSyncFixtureEmbeddingStatus();
  console.log(`완료: ${status.withEmbedding}/${status.total}`);
}
```

### 7.3 벡터 검색

```typescript
import { searchSyncFixtures } from "./sync-fixture.vector";

async function search() {
  const results = await searchSyncFixtures("사용자 인증 JWT 토큰", {
    provider: "voyage",
    limit: 5,
    threshold: 0.5,
  });

  results.forEach((r, i) => {
    console.log(`${i + 1}. [${r.similarity.toFixed(4)}] ${r.data.name}`);
  });
}
```

### 7.4 필터링과 함께 검색

```typescript
// 활성화된 항목만 검색
const activeResults = await searchSyncFixtures("데이터베이스 최적화", {
  where: "is_active = true",
  limit: 5,
});

// 특정 status만 검색
const pendingResults = await searchSyncFixtures("데이터베이스 최적화", {
  where: "status = 'pending'",
  limit: 5,
});

// 복합 조건
const complexResults = await searchSyncFixtures("API 설계", {
  where: "is_active = true AND created_at > '2024-01-01'",
  limit: 10,
});
```

### 7.5 하이브리드 검색 (Vector + FTS)

```typescript
import { hybridSearchSyncFixtures } from "./sync-fixture.vector";

const results = await hybridSearchSyncFixtures("API 인증 보안", {
  vectorWeight: 0.7,
  ftsWeight: 0.3,
  limit: 10,
});

results.forEach((r, i) => {
  console.log(
    `${i + 1}. [Total: ${r.similarity.toFixed(4)}] ` +
      `[Vec: ${r.vectorScore?.toFixed(4)}] ` +
      `[FTS: ${r.ftsScore?.toFixed(4)}] ` +
      `${r.data.name}`,
  );
});
```

---

## 8. CLI 스크립트

### 8.1 vector-script.ts 사용법

`src/testing/vector-script.ts`는 임베딩 마이그레이션, 검색 테스트, 벤치마크를 위한 CLI 스크립트입니다.

```bash
# 임베딩 마이그레이션
npx tsx src/testing/vector-script.ts migrate [voyage|openai]

# 벡터 검색 테스트
npx tsx src/testing/vector-script.ts search "검색어" [voyage|openai]

# Voyage AI vs OpenAI 벤치마크
npx tsx src/testing/vector-script.ts benchmark

# 전체 작업 시간 측정
npx tsx src/testing/vector-script.ts timing [count]
```

> **Note**: `ts-node` 대신 `tsx`를 사용합니다. ESM 모듈 환경에서 더 안정적입니다.

### 8.2 마이그레이션 전체 순서

```bash
# 1. Fixture DB 초기화 (스키마 + 벡터 컬럼/인덱스 + 테스트 데이터 1000건)
pnpm seed

# 2. 임베딩 생성
npx tsx src/testing/vector-script.ts migrate voyage
npx tsx src/testing/vector-script.ts migrate openai  # 비교용 (선택)

# 3. 검색 테스트
npx tsx src/testing/vector-script.ts search "사용자 인증 API"

# 4. 벤치마크 실행
npx tsx src/testing/vector-script.ts benchmark

# 5. 단위 테스트 (vitest)
npx vitest run src/sonamu-test/vector.test.ts
```

> **Note**: `pnpm seed`는 `database/dumps/miomock_test_latest.sql`을 `miomock_fixture_remote` DB에 적용합니다.
> 이 덤프 파일에는 pgvector extension, 벡터 컬럼, HNSW 인덱스, sync_fixtures 테스트 데이터 1000건이 포함되어 있습니다.

---

## 9. Voyage AI vs OpenAI 비교

### 9.1 스펙 비교

| 항목          | Voyage AI (voyage-3) | OpenAI (text-embedding-3-small) |
| ------------- | -------------------- | ------------------------------- |
| 차원          | 1024                 | 1536                            |
| 컨텍스트      | 32K tokens           | 8K tokens                       |
| 가격          | $0.06/1M tokens      | $0.02/1M tokens                 |
| 비대칭 임베딩 | ✅ (document/query)  | ❌                              |

### 9.2 벤치마크 결과 (1000개 기준)

| 항목     | Voyage AI       | OpenAI          | 비교            |
| -------- | --------------- | --------------- | --------------- |
| 임베딩   | ~12초           | ~60초           | Voyage 5x 빠름  |
| 검색     | ~12ms           | ~15ms           | 비슷            |
| 저장공간 | 1024 \* 4 = 4KB | 1536 \* 4 = 6KB | Voyage 33% 절약 |

### 9.3 선택 가이드

| 상황           | 권장                    |
| -------------- | ----------------------- |
| 속도/성능 중시 | Voyage AI               |
| 비용 중시      | OpenAI                  |
| 긴 문서 처리   | Voyage AI (32K context) |
| 한국어 특화    | 둘 다 양호              |

---

## 10. 운영 체크리스트

### 10.1 설치 확인

```sql
-- PostgreSQL 버전 (18.x 확인)
SELECT version();

-- pgvector 버전 (0.8.x 확인)
SELECT extversion FROM pg_extension WHERE extname = 'vector';

-- 벡터 컬럼 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sync_fixtures'
  AND column_name LIKE '%embedding%';
```

### 10.2 인덱스 확인

```sql
-- HNSW 인덱스 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sync_fixtures'
  AND indexdef LIKE '%hnsw%';

-- 인덱스 크기 확인
SELECT
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname = 'sync_fixtures';
```

### 10.3 pgvector 설정 확인

```sql
-- Iterative Scan 상태 (권장: relaxed_order)
SHOW hnsw.iterative_scan;

-- ef_search 값 (권장: 100)
SHOW hnsw.ef_search;
```

### 10.4 임베딩 현황 확인

```sql
-- 임베딩 완료 현황
SELECT
  COUNT(*) AS total,
  COUNT(content_embedding) AS voyage_done,
  COUNT(content_embedding_openai) AS openai_done
FROM sync_fixtures;

-- 임베딩 없는 항목 확인
SELECT id, name
FROM sync_fixtures
WHERE content_embedding IS NULL
LIMIT 10;
```

### 10.5 검색 성능 확인

```sql
-- 실행 계획 확인 (Index Scan이 나오면 정상)
EXPLAIN ANALYZE
SELECT *, 1 - (content_embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
FROM sync_fixtures
WHERE content_embedding IS NOT NULL
ORDER BY content_embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

### 10.6 환경별 pgvector 지원

| 환경           | 지원 여부 | 비고              |
| -------------- | --------- | ----------------- |
| AWS RDS        | ✅        | PostgreSQL 15.4+  |
| GCP Cloud SQL  | ✅        | PostgreSQL 15+    |
| Supabase       | ✅        | 기본 제공         |
| Azure Database | ⚠️        | Flexible Server만 |

---

## 부록 A: 빠른 시작 (5분 가이드)

### 1단계: 환경 설정

```bash
cd database
docker-compose up -d
```

### 2단계: 마이그레이션 실행

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE sync_fixtures ADD COLUMN content_embedding vector(1024);

CREATE INDEX idx_sync_fixtures_embedding ON sync_fixtures
    USING hnsw (content_embedding vector_cosine_ops);
```

### 3단계: API 키 설정

```bash
# .env
voyage_api_key=pa-xxxxxxxxxxxxxxxx
```

### 4단계: 임베딩 저장

```typescript
import { DB, VectorSearch } from "sonamu";

const vectorSearch = new VectorSearch(DB.getDB("w"), "sync_fixtures");

const text = `${fixture.name}\n${fixture.description || ""}`;
await vectorSearch.saveEmbedding(fixture.id, text, "voyage");
```

### 5단계: 검색

```typescript
const results = await vectorSearch.search("JWT 인증 방법", "voyage", {
  limit: 10,
});

results.forEach((r) => {
  console.log(`[${r.similarity.toFixed(4)}] ${r.data.name}`);
});
```

---

## 부록 B: 트러블슈팅

### B.1 API Key 오류

```
Error: VOYAGE_API_KEY가 설정되지 않았습니다.
```

**해결**: `.env` 파일에 `voyage_api_key=pa-xxx` 추가 (소문자 snake_case 주의)

### B.2 pgvector extension 없음

```
ERROR: type "vector" does not exist
```

**해결**: `CREATE EXTENSION IF NOT EXISTS vector;` 실행

### B.3 ts-node 모듈 오류

```
Error: Cannot find module '...sync-fixture.vector.js'
```

**해결**: `ts-node` 대신 `tsx` 사용

```bash
npx tsx src/testing/vector-script.ts migrate voyage
```

### B.4 프로세스 종료되지 않음

스크립트 실행 후 프로세스가 종료되지 않는 경우:

**해결**: `resetVectorSearch()` 호출하여 DB 연결 종료

```typescript
try {
  // 작업 수행
} finally {
  await resetVectorSearch();
}
```

---

## 문서 정보

- **작성일**: 2025-12
- **환경**: PostgreSQL 18.1 + pgvector 0.8.1
- **프레임워크**: Sonamu (TypeScript/Fastify)
- **대상 테이블**: sync_fixtures
- **임베딩**: Voyage AI (voyage-3), OpenAI (text-embedding-3-small)
