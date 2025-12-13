import type { VectorConfig } from "./types";

/**
 * 벡터 검색 기본 설정
 * 사용자는 이 설정을 override하여 커스터마이즈할 수 있음
 */
export const DEFAULT_VECTOR_CONFIG: VectorConfig = {
  // Voyage AI 설정
  // apiKey는 Sonamu.secrets에서 로드되므로 여기서는 빈 문자열
  voyage: {
    apiKey: "",
    baseUrl: "https://api.voyageai.com/v1/embeddings",
    model: "voyage-3",
    dimensions: 1024,
    maxTokens: 32000,
    batchSize: 128,
  },

  // OpenAI 설정
  // apiKey는 Sonamu.secrets에서 로드되므로 여기서는 빈 문자열
  openai: {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1/embeddings",
    model: "text-embedding-3-small",
    dimensions: 1536,
    maxTokens: 8191,
    batchSize: 100,
  },

  // 청킹 설정 (필요시 사용)
  chunking: {
    chunkSize: 500,
    chunkOverlap: 50,
    minChunkSize: 50,
    skipThreshold: 200,
    separators: ["\n\n", "\n", "。", ". ", "! ", "? ", ", ", " "],
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
    iterativeScan: true,
    efSearch: 100,
  },
};

/**
 * 설정 생성 헬퍼 함수
 * 부분 설정만 제공하면 나머지는 기본값 사용
 */
export function createVectorConfig(overrides: Partial<VectorConfig> = {}): VectorConfig {
  return {
    voyage: { ...DEFAULT_VECTOR_CONFIG.voyage, ...overrides.voyage },
    openai: { ...DEFAULT_VECTOR_CONFIG.openai, ...overrides.openai },
    chunking: { ...DEFAULT_VECTOR_CONFIG.chunking, ...overrides.chunking },
    search: { ...DEFAULT_VECTOR_CONFIG.search, ...overrides.search },
    pgvector: { ...DEFAULT_VECTOR_CONFIG.pgvector, ...overrides.pgvector },
  };
}
