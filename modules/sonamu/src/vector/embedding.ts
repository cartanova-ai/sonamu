import { type OpenAIProvider } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { type EmbeddingModel } from "ai";
import { type VoyageAIClient } from "voyageai";

import { Sonamu } from "../api/sonamu";
import { DEFAULT_VECTOR_CONFIG } from "./config";
import {
  type EmbeddingProvider,
  type EmbeddingResult,
  type ProgressCallback,
  type VectorConfig,
  type VectorInputType,
} from "./types";

/**
 * 임베딩 클라이언트
 * Voyage AI와 OpenAI 임베딩을 SDK 방식으로 통합 지원
 */
class EmbeddingClass {
  private config: VectorConfig;

  constructor(config: Partial<VectorConfig> = {}) {
    this.config = {
      voyage: { ...DEFAULT_VECTOR_CONFIG.voyage, ...config.voyage },
      openai: { ...DEFAULT_VECTOR_CONFIG.openai, ...config.openai },
      chunking: { ...DEFAULT_VECTOR_CONFIG.chunking, ...config.chunking },
      search: { ...DEFAULT_VECTOR_CONFIG.search, ...config.search },
      pgvector: { ...DEFAULT_VECTOR_CONFIG.pgvector, ...config.pgvector },
    };
  }

  /**
   * Voyage AI 클라이언트 초기화
   */
  private async getVoyageClient(): Promise<VoyageAIClient> {
    const { VoyageAIClient } = await import("voyageai");
    const apiKey = Sonamu.secrets?.voyage_api_key ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.");
    }
    return new VoyageAIClient({ apiKey });
  }

  /**
   * OpenAI provider 생성
   */
  private async getOpenAIProvider(): Promise<OpenAIProvider> {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const apiKey = Sonamu.secrets?.openai_api_key ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.");
    }
    return createOpenAI({ apiKey });
  }

  /**
   * 텍스트 임베딩 생성
   * @param texts - 임베딩할 텍스트 배열 (batchSize이상 시 자동 분할)
   * @param provider - 'voyage' | 'openai'
   * @param inputType - 'document' | 'query' (Voyage AI만 해당)
   * @param onProgress - 진행률 콜백
   */
  async embed(
    texts: string[],
    provider: EmbeddingProvider,
    inputType: VectorInputType = "document",
    onProgress?: ProgressCallback,
  ): Promise<EmbeddingResult[]> {
    const maxBatchSize =
      provider === "voyage" ? this.config.voyage.batchSize : this.config.openai.batchSize;

    // batchSize이하면 바로 호출
    if (texts.length <= maxBatchSize) {
      return provider === "voyage"
        ? await this.embedVoyage(texts, inputType)
        : await this.embedOpenAI(texts);
    }

    // batchSize이상이면 자동으로 나눠서 처리
    const batches = Array.from({ length: Math.ceil(texts.length / maxBatchSize) }, (_, i) =>
      texts.slice(i * maxBatchSize, (i + 1) * maxBatchSize),
    );

    const results = await Promise.all(
      batches.map((batch) =>
        provider === "voyage" ? this.embedVoyage(batch, inputType) : this.embedOpenAI(batch),
      ),
    );

    onProgress?.(texts.length, texts.length);
    return results.flat();
  }

  /**
   * 단일 텍스트 임베딩 (편의 메서드)
   */
  async embedOne(
    text: string,
    provider: EmbeddingProvider,
    inputType: VectorInputType = "document",
  ): Promise<EmbeddingResult> {
    const results = await this.embed([text], provider, inputType);
    return results[0];
  }

  /**
   * Voyage AI 임베딩
   */
  private async embedVoyage(
    texts: string[],
    inputType: VectorInputType,
  ): Promise<EmbeddingResult[]> {
    const client = await this.getVoyageClient();
    const voyageConfig = this.config.voyage;

    const response = await client.embed({
      input: texts,
      model: voyageConfig.model,
      inputType: inputType,
    });
    if (!response.data) {
      throw new Error("Voyage API: 응답 데이터가 없습니다.");
    }

    return response.data.map((item) => ({
      embedding: item.embedding ?? [],
      model: voyageConfig.model,
      tokenCount: response.usage?.totalTokens ?? 0,
    }));
  }

  /**
   * OpenAI 임베딩
   */
  private async embedOpenAI(texts: string[]): Promise<EmbeddingResult[]> {
    const openai = await this.getOpenAIProvider();
    const openaiConfig = this.config.openai;
    const model = openai.embeddingModel(openaiConfig.model);

    const { embeddings, usage } = await embedMany({
      model:
        /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ model as EmbeddingModel,
      values: texts,
    });

    return embeddings.map((embedding) => ({
      embedding,
      model: openaiConfig.model,
      tokenCount: usage?.tokens ?? 0,
    }));
  }

  /**
   * 임베딩 provider의 차원 수 반환
   */
  getDimensions(provider: EmbeddingProvider): number {
    return provider === "voyage" ? this.config.voyage.dimensions : this.config.openai.dimensions;
  }
}
export const Embedding = new EmbeddingClass();
