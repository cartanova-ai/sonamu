import {
  DB,
  type EmbeddingProvider,
  type HybridSearchResult,
  VectorSearch,
  type VectorSearchResult,
} from "sonamu";
import type { SyncFixtureSubsetA } from "../sonamu.generated";

/**
 * SyncFixture 벡터 검색
 * - name + description을 합쳐서 임베딩
 * - Voyage AI와 OpenAI 지원
 */

// VectorSearch 인스턴스
let _vectorSearch: VectorSearch<SyncFixtureSubsetA> | null = null;

export function getVectorSearch(): VectorSearch<SyncFixtureSubsetA> {
  if (!_vectorSearch) {
    _vectorSearch = new VectorSearch<SyncFixtureSubsetA>(DB.getDB("w"), "sync_fixtures");
  }
  return _vectorSearch;
}

/**
 * SyncFixture의 name + description을 합쳐서 임베딩용 텍스트 생성
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
export async function getSyncFixtureEmbeddingStatus(embeddingColumn: string = "content_embedding") {
  const vectorSearch = getVectorSearch();
  return vectorSearch.getEmbeddingStatus(embeddingColumn);
}

/**
 * 임베딩이 없는 SyncFixture 조회
 */
export async function getSyncFixturesWithoutEmbedding(
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
