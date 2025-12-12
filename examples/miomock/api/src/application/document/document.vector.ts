import {
  DB,
  type EmbeddingProvider,
  type HybridSearchResult,
  VectorSearch,
  type VectorSearchResult,
} from "sonamu";
import type { DocumentSubsetA } from "../sonamu.generated";

/**
 * Document 벡터 검색
 * - title + content를 합쳐서 임베딩
 * - Voyage AI와 OpenAI 지원
 */

// VectorSearch 인스턴스
let _vectorSearch: VectorSearch<DocumentSubsetA> | null = null;

export function getVectorSearch(): VectorSearch<DocumentSubsetA> {
  if (!_vectorSearch) {
    _vectorSearch = new VectorSearch<DocumentSubsetA>(DB.getDB("w"), "documents");
  }
  return _vectorSearch;
}

/**
 * Document의 title + content를 합쳐서 임베딩용 텍스트 생성
 */
export function buildEmbeddingText(title: string, content: string | null): string {
  return `${title}\n${content || ""}`.trim();
}

/**
 * 단일 Document에 임베딩 저장
 */
export async function saveDocumentEmbedding(
  id: number,
  title: string,
  content: string | null,
  provider: EmbeddingProvider = "voyage",
  embeddingColumn: string = "content_embedding",
): Promise<void> {
  const text = buildEmbeddingText(title, content);
  const vectorSearch = getVectorSearch();
  await vectorSearch.saveEmbedding(id, text, provider, embeddingColumn);
}

/**
 * 여러 Document에 임베딩 일괄 저장
 */
export async function saveDocumentEmbeddingsBatch(
  items: Array<{ id: number; title: string; content: string | null }>,
  provider: EmbeddingProvider = "voyage",
  embeddingColumn: string = "content_embedding",
  onProgress?: (processed: number, total: number) => void,
): Promise<void> {
  const vectorSearch = getVectorSearch();
  const embeddingItems = items.map((item) => ({
    id: item.id,
    text: buildEmbeddingText(item.title, item.content),
  }));
  await vectorSearch.saveEmbeddingsBatch(embeddingItems, provider, embeddingColumn, onProgress);
}

/**
 * Document 벡터 검색
 */
export async function searchDocuments(
  query: string,
  options: {
    provider?: EmbeddingProvider;
    embeddingColumn?: string;
    limit?: number;
    threshold?: number;
    where?: string;
  } = {},
): Promise<VectorSearchResult<DocumentSubsetA>[]> {
  const {
    provider = "voyage",
    embeddingColumn = "content_embedding",
    limit = 10,
    threshold = 0.5,
    where,
  } = options;

  const vectorSearch = getVectorSearch();
  return vectorSearch.search(query, provider, {
    embeddingColumn,
    limit,
    threshold,
    where,
  });
}

/**
 * Document 하이브리드 검색 (Vector + FTS)
 */
export async function hybridSearchDocuments(
  query: string,
  options: {
    provider?: EmbeddingProvider;
    embeddingColumn?: string;
    ftsColumn?: string;
    limit?: number;
    vectorWeight?: number;
    ftsWeight?: number;
  } = {},
): Promise<HybridSearchResult<DocumentSubsetA>[]> {
  const {
    provider = "voyage",
    embeddingColumn = "content_embedding",
    ftsColumn = "content_tsv",
    limit = 10,
    vectorWeight = 0.7,
    ftsWeight = 0.3,
  } = options;

  const vectorSearch = getVectorSearch();
  return vectorSearch.hybridSearch(query, provider, {
    embeddingColumn,
    ftsColumn,
    limit,
    vectorWeight,
    ftsWeight,
  });
}

/**
 * 임베딩 현황 조회
 */
export async function getDocumentEmbeddingStatus(embeddingColumn: string = "content_embedding") {
  const vectorSearch = getVectorSearch();
  return vectorSearch.getEmbeddingStatus(embeddingColumn);
}

/**
 * 임베딩이 없는 Document 조회
 */
export async function getDocumentsWithoutEmbedding(
  embeddingColumn: string = "content_embedding",
  limit: number = 100,
): Promise<number[]> {
  const vectorSearch = getVectorSearch();
  return vectorSearch.getItemsWithoutEmbedding(embeddingColumn, limit);
}

/**
 * VectorSearch 인스턴스 초기화 및 DB 연결 종료
 */
export async function resetVectorSearch(): Promise<void> {
  _vectorSearch = null;
  await DB.destroy();
}
