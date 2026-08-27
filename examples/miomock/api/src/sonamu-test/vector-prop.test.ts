import { Entity, EntityManager, getMigrationSetFromEntity, PostgreSQLSchemaReader } from "sonamu";
import { type PgColumn } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeEach, describe, expect, vi } from "vitest";

import { mockEntityManagerGetMultiple } from "../testing/test-helpers";

bootstrap(vi);

// Vector 타입 테스트를 위한 엔티티
const VectorTestEntity = () =>
  new Entity({
    id: "VectorTest",
    table: "vector_tests",
    title: "벡터 테스트 엔티티",
    props: [
      { name: "id", type: "integer", desc: "ID" },
      { name: "title", type: "string", length: 255, desc: "제목" },
      { name: "content", type: "string", desc: "내용" },
      {
        name: "embedding",
        type: "vector",
        dimensions: 1536,
        nullable: true,
        desc: "OpenAI text-embedding-ada-002 벡터",
      },
      {
        name: "small_embedding",
        type: "vector",
        dimensions: 384,
        nullable: false,
        desc: "소형 임베딩 벡터",
      },
      {
        name: "multi_embeddings",
        type: "vector[]",
        dimensions: 768,
        nullable: true,
        desc: "여러 임베딩 벡터 배열",
      },
    ],
    indexes: [{ type: "index", columns: [{ name: "title" }], name: "idx_vector_tests_title" }],
    subsets: {
      A: ["id", "title", "content", "embedding", "multi_embeddings"],
      List: ["id", "title"],
    },
    enums: {},
  });

describe("vector-prop.test.ts", () => {
  beforeEach(() => {
    mockEntityManagerGetMultiple({
      VectorTest: VectorTestEntity(),
    });
  });

  describe("getMigrationSetFromEntity - Vector 타입", () => {
    test("vector 타입 컬럼이 올바르게 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("VectorTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const embeddingCol = result.columns.find((c) => c.name === "embedding");
      expect(embeddingCol).toMatchObject({
        type: "vector",
        dimensions: 1536,
        nullable: true,
      });

      const smallEmbeddingCol = result.columns.find((c) => c.name === "small_embedding");
      expect(smallEmbeddingCol).toMatchObject({
        type: "vector",
        dimensions: 384,
        nullable: false,
      });
    });

    test("vector[] 배열 타입 컬럼이 올바르게 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("VectorTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      const multiEmbeddingsCol = result.columns.find((c) => c.name === "multi_embeddings");
      expect(multiEmbeddingsCol).toMatchObject({
        type: "vector[]",
        dimensions: 768,
        nullable: true,
      });
    });

    test("vector 타입 컬럼과 일반 컬럼이 함께 변환되어야 한다", () => {
      // when
      const entity = EntityManager.get("VectorTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      expect(result.columns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "id", type: "integer" }),
          expect.objectContaining({ name: "title", type: "string", length: 255 }),
          expect.objectContaining({ name: "content", type: "string" }),
          expect.objectContaining({ name: "embedding", type: "vector", dimensions: 1536 }),
          expect.objectContaining({ name: "small_embedding", type: "vector", dimensions: 384 }),
          expect.objectContaining({ name: "multi_embeddings", type: "vector[]", dimensions: 768 }),
        ]),
      );
    });

    test("vector 테이블의 전체 MigrationSet이 올바르게 생성되어야 한다", () => {
      // when
      const entity = EntityManager.get("VectorTest");
      const result = getMigrationSetFromEntity(entity);

      // then
      expect(result.table).toBe("vector_tests");
      expect(result.columns).toHaveLength(6); // id, title, content, embedding, small_embedding, multi_embeddings
      expect(result.indexes).toHaveLength(1); // title index
    });
  });

  describe("resolveDBColType - Vector 타입", () => {
    test("USER-DEFINED vector 타입을 올바르게 인식해야 한다", () => {
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const col = {
        data_type: "USER-DEFINED",
        udt_name: "vector",
      } as PgColumn;

      const result = PostgreSQLSchemaReader.resolveDBColType(col);
      expect(result).toMatchObject({ type: "vector" });
    });

    test("vector 타입은 기본 dimensions 0을 반환해야 한다", () => {
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      // Note: 실제 dimensions는 getVectorDimensions 쿼리로 조회됨
      const col = {
        data_type: "USER-DEFINED",
        udt_name: "vector",
      } as PgColumn;

      const result = PostgreSQLSchemaReader.resolveDBColType(col);
      expect(result).toMatchObject({ type: "vector", dimensions: 0 });
    });

    // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
    test("vector[] 배열 타입을 올바르게 인식해야 한다", () => {
      // PostgreSQL에서 배열 타입은 udt_name이 _vector로 시작함
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const col = {
        data_type: "ARRAY",
        udt_name: "_vector",
      } as PgColumn;

      const result = PostgreSQLSchemaReader.resolveDBColType(col);
      expect(result).toMatchObject({ type: "vector[]", dimensions: 0 });
    });
  });

  describe("Entity 정의 검증", () => {
    test("VectorProp은 dimensions 필드가 필수여야 한다", () => {
      const entity = EntityManager.get("VectorTest");
      const embeddingProp = entity.props.find((p) => p.name === "embedding");

      expect(embeddingProp).toBeDefined();
      expect(embeddingProp?.type).toBe("vector");
      if (embeddingProp?.type === "vector") {
        expect(embeddingProp.dimensions).toBe(1536);
      }
    });

    test("여러 vector 컬럼이 서로 다른 dimensions를 가질 수 있어야 한다", () => {
      const entity = EntityManager.get("VectorTest");

      const embedding = entity.props.find((p) => p.name === "embedding");
      const smallEmbedding = entity.props.find((p) => p.name === "small_embedding");

      expect(embedding?.type).toBe("vector");
      expect(smallEmbedding?.type).toBe("vector");

      if (embedding?.type === "vector" && smallEmbedding?.type === "vector") {
        expect(embedding.dimensions).toBe(1536);
        expect(smallEmbedding.dimensions).toBe(384);
      }
    });

    test("VectorArrayProp은 dimensions 필드가 필수여야 한다", () => {
      const entity = EntityManager.get("VectorTest");
      const multiEmbeddingsProp = entity.props.find((p) => p.name === "multi_embeddings");

      expect(multiEmbeddingsProp).toBeDefined();
      expect(multiEmbeddingsProp?.type).toBe("vector[]");
      if (multiEmbeddingsProp?.type === "vector[]") {
        expect(multiEmbeddingsProp.dimensions).toBe(768);
      }
    });
  });
});
