import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { type EmbeddingModel, embedMany } from "ai";
import { VoyageAIClient } from "voyageai";
import { Sonamu } from "../api/sonamu";
import { DEFAULT_VECTOR_CONFIG } from "./config";
import type {
  EmbeddingProvider,
  EmbeddingResult,
  ProgressCallback,
  VectorConfig,
  VectorInputType,
} from "./types";

/**
 * 임베딩 클라이언트
 * Voyage AI와 OpenAI 임베딩을 SDK 방식으로 통합 지원
 */
export class Embedding {
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
  private getVoyageClient(): VoyageAIClient {
    const apiKey = Sonamu.secrets?.voyage_api_key ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.");
    }
    return new VoyageAIClient({ apiKey });
  }

  /**
   * OpenAI provider 생성
   */
  private getOpenAIProvider(): OpenAIProvider {
    const apiKey = Sonamu.secrets?.openai_api_key ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.");
    }
    return createOpenAI({ apiKey });
  }

  /**
   * 텍스트 임베딩 생성
   * @param texts - 임베딩할 텍스트 배열
   * @param provider - 'voyage' | 'openai'
   * @param inputType - 'document' | 'query' (Voyage AI만 해당)
   */
  async embed(
    texts: string[],
    provider: EmbeddingProvider,
    inputType: VectorInputType = "document"
  ): Promise<EmbeddingResult[]> {
    if (provider === "voyage") {
      return this.embedVoyage(texts, inputType);
    } else {
      return this.embedOpenAI(texts);
    }
  }

  /**
   * 단일 텍스트 임베딩 (편의 메서드)
   */
  async embedOne(
    text: string,
    provider: EmbeddingProvider,
    inputType: VectorInputType = "document"
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
    const client = this.getVoyageClient();
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
    const openai = this.getOpenAIProvider();
    const openaiConfig = this.config.openai;
    const model = openai.embeddingModel(openaiConfig.model);

    const { embeddings, usage } = await embedMany({
      model: model as EmbeddingModel,
      values: texts,
    });

    return embeddings.map((embedding) => ({
      embedding,
      model: openaiConfig.model,
      tokenCount: usage?.tokens ?? 0,
    }));
  }

  /**
   * 배치 임베딩 (대량 처리)
   */
  async embedBatch(
    texts: string[],
    provider: EmbeddingProvider,
    inputType: VectorInputType = "document",
    onProgress?: ProgressCallback
  ): Promise<EmbeddingResult[]> {
    const batchSize =
      provider === "voyage"
        ? this.config.voyage.batchSize
        : this.config.openai.batchSize;

    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await this.embed(batch, provider, inputType);
      results.push(...batchResults);

      onProgress?.(Math.min(i + batchSize, texts.length), texts.length);

      // Rate limiting (100ms between batches)
      if (i + batchSize < texts.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * 벡터를 PostgreSQL vector 타입 문자열로 변환
   */
  static toVectorString(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
  }

  /**
   * 임베딩 provider의 차원 수 반환
   */
  getDimensions(provider: EmbeddingProvider): number {
    return provider === "voyage"
      ? this.config.voyage.dimensions
      : this.config.openai.dimensions;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
