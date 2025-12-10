import type { Knex } from "knex";
import pgvector from "pgvector/knex";
import { DEFAULT_VECTOR_CONFIG } from "./config";
import { Embedding } from "./embedding";
import type {
  EmbeddingItem,
  EmbeddingProvider,
  HybridSearchOptions,
  HybridSearchResult,
  ProgressCallback,
  VectorConfig,
  VectorSearchOptions,
  VectorSearchResult,
} from "./types";

/**
 * 벡터 검색
 * pgvector를 활용한 벡터 검색 및 하이브리드 검색 지원
 */
export class VectorSearch<T = Record<string, unknown>> {
  private db: Knex;
  private config: VectorConfig;
  private embedding: Embedding;
  private tableName: string;

  constructor(db: Knex, tableName: string, config: Partial<VectorConfig> = {}) {
    this.db = db;
    this.tableName = tableName;
    this.config = {
      voyage: { ...DEFAULT_VECTOR_CONFIG.voyage, ...config.voyage },
      openai: { ...DEFAULT_VECTOR_CONFIG.openai, ...config.openai },
      chunking: { ...DEFAULT_VECTOR_CONFIG.chunking, ...config.chunking },
      search: { ...DEFAULT_VECTOR_CONFIG.search, ...config.search },
      pgvector: { ...DEFAULT_VECTOR_CONFIG.pgvector, ...config.pgvector },
    };
    this.embedding = new Embedding(config);
  }

  /**
   * 단일 항목에 임베딩 저장
   */
  async saveEmbedding(
    id: number,
    text: string,
    provider: EmbeddingProvider,
    embeddingColumn: string = "content_embedding",
  ): Promise<void> {
    const { embedding } = await this.embedding.embedOne(text, provider, "document");

    await this.db(this.tableName)
      .where("id", id)
      .update({
        [embeddingColumn]: pgvector.toSql(embedding),
      });
  }

  /**
   * 여러 항목에 임베딩 일괄 저장
   */
  async saveEmbeddingsBatch(
    items: EmbeddingItem[],
    provider: EmbeddingProvider,
    embeddingColumn: string = "content_embedding",
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const texts = items.map((item) => item.text);
    const embeddings = await this.embedding.embedBatch(texts, provider, "document", onProgress);

    await this.db.transaction(async (trx) => {
      for (let i = 0; i < items.length; i++) {
        await trx(this.tableName)
          .where("id", items[i].id)
          .update({
            [embeddingColumn]: pgvector.toSql(embeddings[i].embedding),
          });
      }
    });
  }

  /**
   * 벡터 검색 (코사인 유사도)
   */
  async search(
    query: string,
    provider: EmbeddingProvider,
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult<T>[]> {
    const {
      embeddingColumn = "content_embedding",
      limit = this.config.search.defaultLimit,
      threshold = this.config.search.similarityThreshold,
      where,
    } = options;

    // 쿼리 임베딩 (input_type: 'query' 중요!)
    const { embedding } = await this.embedding.embedOne(query, provider, "query");

    // pgvector 세션 설정
    if (this.config.pgvector.iterativeScan) {
      await this.db.raw("SET hnsw.iterative_scan = relaxed_order");
    }
    await this.db.raw(`SET hnsw.ef_search = ${this.config.pgvector.efSearch}`);

    // 코사인 유사도 = 1 - 코사인 거리
    const vectorStr = pgvector.toSql(embedding);
    let queryBuilder = this.db(this.tableName)
      .select("*")
      .select(this.db.raw(`1 - (${embeddingColumn} <=> ?::vector) AS similarity`, [vectorStr]))
      .whereNotNull(embeddingColumn)
      .orderByRaw(`${embeddingColumn} <=> ?::vector`, [vectorStr])
      .limit(limit);

    if (where) {
      queryBuilder = queryBuilder.whereRaw(where);
    }

    const rows = await queryBuilder;

    return rows
      .filter((row: { similarity: number }) => row.similarity >= threshold)
      .map((row: T & { similarity: number }) => ({
        id: (row as unknown as { id: number }).id,
        similarity: parseFloat(String(row.similarity)),
        data: row as T,
      }));
  }

  /**
   * 하이브리드 검색 (Vector + FTS)
   */
  async hybridSearch(
    query: string,
    provider: EmbeddingProvider,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult<T>[]> {
    const {
      embeddingColumn = "content_embedding",
      ftsColumn = "content_tsv",
      limit = this.config.search.defaultLimit,
      vectorWeight = this.config.search.vectorWeight,
      ftsWeight = this.config.search.ftsWeight,
    } = options;

    const { embedding } = await this.embedding.embedOne(query, provider, "query");
    const vectorStr = pgvector.toSql(embedding);

    // pgvector 세션 설정
    if (this.config.pgvector.iterativeScan) {
      await this.db.raw("SET hnsw.iterative_scan = relaxed_order");
    }
    await this.db.raw(`SET hnsw.ef_search = ${this.config.pgvector.efSearch}`);

    const sql = `
      WITH vector_search AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY ${embeddingColumn} <=> ?::vector) AS rank
        FROM ${this.tableName}
        WHERE ${embeddingColumn} IS NOT NULL
        ORDER BY ${embeddingColumn} <=> ?::vector
        LIMIT 50
      ),
      fts_search AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY ts_rank(${ftsColumn}, query) DESC) AS rank
        FROM ${this.tableName}, plainto_tsquery('simple', ?) query
        WHERE ${ftsColumn} @@ query
        LIMIT 50
      ),
      combined AS (
        SELECT
          COALESCE(v.id, f.id) AS id,
          COALESCE(1.0 / (60 + v.rank), 0) AS vector_score,
          COALESCE(1.0 / (60 + f.rank), 0) AS fts_score
        FROM vector_search v
        FULL OUTER JOIN fts_search f ON v.id = f.id
      )
      SELECT
        t.*,
        c.vector_score,
        c.fts_score,
        (c.vector_score * ? + c.fts_score * ?) AS similarity
      FROM combined c
      JOIN ${this.tableName} t ON c.id = t.id
      ORDER BY similarity DESC
      LIMIT ?
    `;

    const { rows } = await this.db.raw(sql, [
      vectorStr,
      vectorStr,
      query,
      vectorWeight,
      ftsWeight,
      limit,
    ]);

    return rows.map(
      (
        row: T & {
          similarity: number;
          vector_score: number;
          fts_score: number;
        },
      ) => ({
        id: (row as unknown as { id: number }).id,
        similarity: parseFloat(String(row.similarity)),
        vectorScore: parseFloat(String(row.vector_score)),
        ftsScore: parseFloat(String(row.fts_score)),
        data: row as T,
      }),
    );
  }

  /**
   * 임베딩 현황 조회
   */
  async getEmbeddingStatus(embeddingColumn: string = "content_embedding"): Promise<{
    total: number;
    withEmbedding: number;
    withoutEmbedding: number;
  }> {
    const result = await this.db(this.tableName)
      .count("* as total")
      .count(`${embeddingColumn} as with_embedding`)
      .first();

    const total = parseInt(String(result?.total ?? 0), 10);
    const withEmbedding = parseInt(String(result?.with_embedding ?? 0), 10);

    return {
      total,
      withEmbedding,
      withoutEmbedding: total - withEmbedding,
    };
  }

  /**
   * 임베딩이 없는 항목 ID 조회
   */
  async getItemsWithoutEmbedding(
    embeddingColumn: string = "content_embedding",
    limit: number = 100,
  ): Promise<number[]> {
    const rows = await this.db(this.tableName)
      .select("id")
      .whereNull(embeddingColumn)
      .orderBy("id")
      .limit(limit);

    return rows.map((row: { id: number }) => row.id);
  }

  /**
   * Embedding 인스턴스 반환 (고급 사용)
   */
  getEmbedding(): Embedding {
    return this.embedding;
  }
}
