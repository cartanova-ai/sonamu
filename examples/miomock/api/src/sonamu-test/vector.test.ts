/**
 * Vector 모듈 테스트
 * - Embedding, VectorSearch, Chunking 클래스 기능 테스트
 * - 실제 API 호출이 필요한 테스트는 skip 처리
 */

import type { Knex } from "knex";
import { Chunking, DEFAULT_VECTOR_CONFIG, Embedding, VectorSearch } from "sonamu";
import { beforeAll, describe, expect, test, vi } from "vitest";

describe("vector.test.ts", () => {
  describe("Chunking", () => {
    const chunking = new Chunking();

    test("짧은 텍스트는 청킹하지 않아야 한다", () => {
      const text = "짧은 텍스트입니다.";
      const chunks = chunking.chunk(text);

      expect(chunks).toHaveLength(1);
      const firstChunk = chunks[0];
      expect(firstChunk).toBeDefined();
      expect(firstChunk?.text).toBe(text);
      expect(firstChunk?.index).toBe(0);
    });

    test("needsChunking이 올바르게 동작해야 한다", () => {
      const shortText = "짧은 텍스트";
      const longText = "a".repeat(1000);

      expect(chunking.needsChunking(shortText)).toBe(false);
      expect(chunking.needsChunking(longText)).toBe(true);
    });

    test("estimateChunkCount가 올바르게 계산되어야 한다", () => {
      const shortText = "짧은 텍스트";
      const longText = "a".repeat(1000);

      expect(chunking.estimateChunkCount(shortText)).toBe(1);
      expect(chunking.estimateChunkCount(longText)).toBeGreaterThan(1);
    });

    test("긴 텍스트를 여러 청크로 분할해야 한다", () => {
      const longText = "문장입니다. ".repeat(200);
      const chunks = chunking.chunk(longText);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(chunk.startOffset).toBeLessThan(chunk.endOffset);
      });
    });

    test("커스텀 설정으로 청킹이 가능해야 한다", () => {
      const customChunking = new Chunking({
        chunkSize: 100,
        chunkOverlap: 10,
        minChunkSize: 20,
      });

      const text = "a".repeat(300);
      const chunks = customChunking.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe("Embedding", () => {
    const embedding = new Embedding();

    test("toVectorString이 올바른 형식을 반환해야 한다", () => {
      const vector = [0.1, 0.2, 0.3, 0.4, 0.5];
      const result = Embedding.toVectorString(vector);

      expect(result).toBe("[0.1,0.2,0.3,0.4,0.5]");
    });

    test("빈 배열도 처리해야 한다", () => {
      const vector: number[] = [];
      const result = Embedding.toVectorString(vector);

      expect(result).toBe("[]");
    });

    test("부동소수점 정밀도가 유지되어야 한다", () => {
      const vector = [0.123456789, -0.987654321];
      const result = Embedding.toVectorString(vector);

      expect(result).toBe("[0.123456789,-0.987654321]");
    });

    // API 호출이 필요한 테스트는 skip
    test.skip("Voyage AI 임베딩 생성 (API 키 필요)", async () => {
      const result = await embedding.embedOne("테스트 텍스트", "voyage", "document");

      expect(result.embedding).toHaveLength(1024);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    test.skip("OpenAI 임베딩 생성 (API 키 필요)", async () => {
      const result = await embedding.embedOne("테스트 텍스트", "openai", "document");

      expect(result.embedding).toHaveLength(1536);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    test.skip("배치 임베딩 생성 (API 키 필요)", async () => {
      const texts = ["첫 번째 텍스트", "두 번째 텍스트", "세 번째 텍스트"];
      const results = await embedding.embed(texts, "voyage", "document");

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.embedding).toHaveLength(1024);
      });
    });
  });

  describe("VectorSearch", () => {
    let mockDb: Knex;

    beforeAll(() => {
      // Mock Knex 생성
      mockDb = {
        raw: vi.fn(),
        transaction: vi.fn(),
        cosineDistance: vi.fn(),
      } as unknown as Knex;

      // mock query builder
      const mockQueryBuilder = {
        count: vi.fn().mockReturnThis(),
        first: vi.fn(),
        select: vi.fn().mockReturnThis(),
        whereNull: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };

      (mockDb as unknown as (tableName: string) => typeof mockQueryBuilder) = vi
        .fn()
        .mockReturnValue(mockQueryBuilder);
    });

    test("VectorSearch 인스턴스가 생성되어야 한다", () => {
      const vectorSearch = new VectorSearch(mockDb, "test_table");

      expect(vectorSearch).toBeDefined();
      expect(vectorSearch.getEmbedding()).toBeInstanceOf(Embedding);
    });

    test("커스텀 설정으로 인스턴스 생성이 가능해야 한다", () => {
      const vectorSearch = new VectorSearch(mockDb, "test_table", {
        search: {
          defaultLimit: 20,
          similarityThreshold: 0.7,
          vectorWeight: 0.8,
          ftsWeight: 0.2,
        },
      });

      expect(vectorSearch).toBeDefined();
    });

    test("getEmbeddingStatus가 올바른 쿼리를 실행해야 한다", async () => {
      const mockFirst = vi.fn().mockResolvedValue({
        total: "100",
        with_embedding: "80",
      });
      // count().count().first() 체인 구조
      const mockCount = vi
        .fn()
        .mockReturnValue({ count: vi.fn().mockReturnValue({ first: mockFirst }) });
      const mockDbFn = vi.fn().mockReturnValue({ count: mockCount });

      const db = mockDbFn as unknown as Knex;
      const vectorSearch = new VectorSearch(db, "test_table");

      const status = await vectorSearch.getEmbeddingStatus();

      expect(status).toEqual({
        total: 100,
        withEmbedding: 80,
        withoutEmbedding: 20,
      });
      expect(mockDbFn).toHaveBeenCalledWith("test_table");
    });

    test("getItemsWithoutEmbedding이 올바른 쿼리를 실행해야 한다", async () => {
      const mockLimit = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhereNull = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockSelect = vi.fn().mockReturnValue({ whereNull: mockWhereNull });
      const mockDbFn = vi.fn().mockReturnValue({ select: mockSelect });

      const db = mockDbFn as unknown as Knex;
      const vectorSearch = new VectorSearch(db, "test_table");

      const ids = await vectorSearch.getItemsWithoutEmbedding("content_embedding", 10);

      expect(ids).toEqual([1, 2, 3]);
      expect(mockWhereNull).toHaveBeenCalledWith("content_embedding");
      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe("DEFAULT_VECTOR_CONFIG", () => {
    test("기본 설정값이 정의되어야 한다", () => {
      expect(DEFAULT_VECTOR_CONFIG).toBeDefined();
      expect(DEFAULT_VECTOR_CONFIG.voyage).toBeDefined();
      expect(DEFAULT_VECTOR_CONFIG.openai).toBeDefined();
      expect(DEFAULT_VECTOR_CONFIG.chunking).toBeDefined();
      expect(DEFAULT_VECTOR_CONFIG.search).toBeDefined();
      expect(DEFAULT_VECTOR_CONFIG.pgvector).toBeDefined();
    });

    test("Voyage AI 기본 설정이 올바라야 한다", () => {
      expect(DEFAULT_VECTOR_CONFIG.voyage.model).toBe("voyage-3");
      expect(DEFAULT_VECTOR_CONFIG.voyage.dimensions).toBe(1024);
      expect(DEFAULT_VECTOR_CONFIG.voyage.batchSize).toBe(128);
      expect(DEFAULT_VECTOR_CONFIG.voyage.maxTokens).toBe(32000);
    });

    test("OpenAI 기본 설정이 올바라야 한다", () => {
      expect(DEFAULT_VECTOR_CONFIG.openai.model).toBe("text-embedding-3-small");
      expect(DEFAULT_VECTOR_CONFIG.openai.dimensions).toBe(1536);
      expect(DEFAULT_VECTOR_CONFIG.openai.batchSize).toBe(100);
      expect(DEFAULT_VECTOR_CONFIG.openai.maxTokens).toBe(8191);
    });

    test("검색 기본 설정이 올바라야 한다", () => {
      expect(DEFAULT_VECTOR_CONFIG.search.defaultLimit).toBe(10);
      expect(DEFAULT_VECTOR_CONFIG.search.similarityThreshold).toBe(0.5);
      expect(DEFAULT_VECTOR_CONFIG.search.vectorWeight).toBe(0.7);
      expect(DEFAULT_VECTOR_CONFIG.search.ftsWeight).toBe(0.3);
    });

    test("pgvector 기본 설정이 올바라야 한다", () => {
      expect(DEFAULT_VECTOR_CONFIG.pgvector.iterativeScan).toBe(true);
      expect(DEFAULT_VECTOR_CONFIG.pgvector.efSearch).toBe(100);
    });
  });
});
