/**
 * pgvector 통합을 위한 타입 정의
 */

import { type JsonValue } from "../types/types";

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

/** 청크 정보 */
export interface Chunk {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

/** 벡터 검색 결과 */
export interface VectorSearchResult<T = Record<string, JsonValue>> {
  id: number | string;
  similarity: number;
  data: T;
}

/** 하이브리드 검색 결과 (Vector + FTS) */
export interface HybridSearchResult<T = Record<string, JsonValue>> extends VectorSearchResult<T> {
  vectorScore?: number;
  ftsScore?: number;
}

/** 벤치마크 결과 */
export interface BenchmarkResult {
  provider: EmbeddingProvider;
  embedTime: number;
  searchTime: number;
  results: VectorSearchResult[];
}

/** Voyage AI 설정 */
export interface VoyageConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
}

/** OpenAI 설정 */
export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
}

/** 청킹 설정 */
export interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  minChunkSize: number;
  skipThreshold: number;
  separators: string[];
}

/** 검색 설정 */
export interface SearchConfig {
  defaultLimit: number;
  similarityThreshold: number;
  vectorWeight: number;
  ftsWeight: number;
}

/** pgvector 설정 */
export interface PgvectorConfig {
  iterativeScan: boolean;
  efSearch: number;
}

/** 전체 벡터 설정 */
export interface VectorConfig {
  voyage: VoyageConfig;
  openai: OpenAIConfig;
  chunking: ChunkingConfig;
  search: SearchConfig;
  pgvector: PgvectorConfig;
}

/** 벡터 검색 옵션 */
export interface VectorSearchOptions {
  embeddingColumn?: string;
  limit?: number;
  threshold?: number;
  where?: string;
}

/** 하이브리드 검색 옵션 */
export interface HybridSearchOptions extends VectorSearchOptions {
  vectorWeight?: number;
  ftsWeight?: number;
  ftsColumn?: string;
}

/** 임베딩 저장 항목 */
export interface EmbeddingItem {
  id: number;
  text: string;
}

/** 진행률 콜백 */
export type ProgressCallback = (processed: number, total: number) => void;
