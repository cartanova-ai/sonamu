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
 * Voyage AI와 OpenAI 임베딩을 통합 지원
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
    inputType: VectorInputType
  ): Promise<EmbeddingResult[]> {
    const voyageConfig = this.config.voyage;

    // config에서 설정된 apiKey 우선, 없으면 Sonamu.secrets에서 로드
    const apiKey = voyageConfig.apiKey || Sonamu.secrets?.voyage_api_key;
    if (!apiKey) {
      throw new Error(
        "VOYAGE_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요."
      );
    }

    const response = await fetch(voyageConfig.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: voyageConfig.model,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return data.data.map((item: { embedding: number[] }) => ({
      embedding: item.embedding,
      model: voyageConfig.model,
      tokenCount: data.usage?.total_tokens || 0,
    }));
  }

  /**
   * OpenAI 임베딩
   */
  private async embedOpenAI(texts: string[]): Promise<EmbeddingResult[]> {
    const openaiConfig = this.config.openai;

    // config에서 설정된 apiKey 우선, 없으면 Sonamu.secrets에서 로드
    const apiKey = openaiConfig.apiKey || Sonamu.secrets?.openai_api_key;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요."
      );
    }

    const response = await fetch(openaiConfig.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: openaiConfig.model,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return data.data.map((item: { embedding: number[] }) => ({
      embedding: item.embedding,
      model: openaiConfig.model,
      tokenCount: data.usage?.total_tokens || 0,
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
