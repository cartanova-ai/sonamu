/**
 * Vector 관련 스크립트
 * - 임베딩 마이그레이션
 * - 벡터 검색 테스트
 * - Voyage AI vs OpenAI 벤치마크
 * - 전체 작업 시간 측정
 *
 * 사용법:
 *   npx ts-node src/testing/vector-script.ts migrate [voyage|openai]
 *   npx ts-node src/testing/vector-script.ts search "검색어" [voyage|openai]
 *   npx ts-node src/testing/vector-script.ts benchmark
 *   npx ts-node src/testing/vector-script.ts timing [count]
 */

import dotenv from "dotenv";
import path from "path";

// Sonamu.init 전에 상위 sonamu 디렉토리의 .env 파일 로드
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../../../.env") });

import { DB, Embedding, type EmbeddingProvider, Sonamu } from "sonamu";
import {
  getSyncFixtureEmbeddingStatus,
  hybridSearchSyncFixtures,
  resetVectorSearch,
  saveSyncFixtureEmbeddingsBatch,
  searchSyncFixtures,
} from "../application/sync-fixture/sync-fixture.vector.js";

// ============================================================
// 1. 임베딩 마이그레이션
// ============================================================

async function migrateEmbeddings(provider: EmbeddingProvider = "voyage") {
  const embeddingColumn = provider === "voyage" ? "content_embedding" : "content_embedding_openai";

  console.log(`\n[${provider.toUpperCase()}] 임베딩 마이그레이션 시작...\n`);

  const db = DB.getDB("w");

  // 임베딩이 없는 fixtures 조회
  const { rows: fixtures } = await db.raw(`
    SELECT id, name, description
    FROM sync_fixtures
    WHERE ${embeddingColumn} IS NULL
    ORDER BY id
  `);

  if (fixtures.length === 0) {
    console.log("임베딩이 필요한 항목이 없습니다.");
    return;
  }

  console.log(`총 ${fixtures.length}개 fixture 임베딩 생성 시작...`);
  const startTime = Date.now();

  await saveSyncFixtureEmbeddingsBatch(
    fixtures.map((f: { id: number; name: string; description: string | null }) => ({
      id: f.id,
      name: f.name,
      description: f.description,
    })),
    provider,
    embeddingColumn,
    (processed, total) => {
      const percent = ((processed / total) * 100).toFixed(1);
      process.stdout.write(`\r  진행률: ${processed}/${total} (${percent}%)`);
    },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  완료! (소요 시간: ${elapsed}초)`);

  // 결과 확인
  const status = await getSyncFixtureEmbeddingStatus(embeddingColumn);
  console.log(`\n[임베딩 현황]`);
  console.log(`  전체: ${status.total}`);
  console.log(`  완료: ${status.withEmbedding}`);
  console.log(`  미완료: ${status.withoutEmbedding}`);
}

// ============================================================
// 2. 벡터 검색 테스트
// ============================================================

async function runSearch(query: string, provider: EmbeddingProvider = "voyage") {
  const embeddingColumn = provider === "voyage" ? "content_embedding" : "content_embedding_openai";

  console.log(`\n검색어: "${query}"`);
  console.log(`제공자: ${provider.toUpperCase()}\n`);

  // 벡터 검색
  console.log("=== 벡터 검색 결과 ===");
  const vectorResults = await searchSyncFixtures(query, {
    provider,
    embeddingColumn,
    limit: 5,
  });

  vectorResults.forEach((r, i) => {
    console.log(`${i + 1}. [${r.similarity.toFixed(4)}] ${r.data.name}`);
    if (r.data.description) {
      console.log(`   ${r.data.description.slice(0, 60)}...`);
    }
  });

  // 하이브리드 검색
  console.log("\n=== 하이브리드 검색 결과 (Vector 70% + FTS 30%) ===");
  const hybridResults = await hybridSearchSyncFixtures(query, {
    provider,
    embeddingColumn,
    limit: 5,
    vectorWeight: 0.7,
    ftsWeight: 0.3,
  });

  hybridResults.forEach((r, i) => {
    const vecScore = r.vectorScore?.toFixed(4) ?? "N/A";
    const ftsScore = r.ftsScore?.toFixed(4) ?? "N/A";
    console.log(
      `${i + 1}. [Total: ${r.similarity.toFixed(4)}] [Vec: ${vecScore}] [FTS: ${ftsScore}] ${r.data.name}`,
    );
  });

  // 필터링 검색 예제
  console.log("\n=== 활성화된 항목만 검색 ===");
  const activeResults = await searchSyncFixtures(query, {
    provider,
    embeddingColumn,
    limit: 3,
    where: "is_active = true",
  });

  activeResults.forEach((r, i) => {
    console.log(
      `${i + 1}. [${r.similarity.toFixed(4)}] ${r.data.name} (active: ${r.data.is_active})`,
    );
  });
}

// ============================================================
// 3. Voyage AI vs OpenAI 벤치마크
// ============================================================

async function runBenchmark() {
  const db = DB.getDB("w");
  const embedding = new Embedding();

  // DB에서 테스트 텍스트 가져오기
  const { rows: fixtures } = await db.raw(`
    SELECT name, description
    FROM sync_fixtures
    LIMIT 50
  `);

  if (fixtures.length === 0) {
    console.log("테스트 데이터가 없습니다. 먼저 데이터를 생성하세요.");
    return;
  }

  const testTexts = fixtures.map(
    (f: { name: string; description: string | null }) => `${f.name}\n${f.description || ""}`,
  );

  const testQueries = [
    "사용자 인증 API",
    "데이터베이스 연결 설정",
    "파일 업로드 처리",
    "에러 핸들링 방법",
    "캐시 관리 전략",
  ];

  console.log("\n========== 벤치마크 시작 ==========\n");
  console.log(`테스트 텍스트: ${testTexts.length}개`);
  console.log(`테스트 쿼리: ${testQueries.length}개\n`);

  // Voyage AI 임베딩 벤치마크
  console.log("1. Voyage AI 임베딩 테스트...");
  let voyageEmbedTime = 0;
  let voyageTokenCount = 0;
  try {
    const start = performance.now();
    const results = await embedding.embedBatch(testTexts, "voyage", "document");
    voyageEmbedTime = performance.now() - start;
    voyageTokenCount = results.reduce((sum, r) => sum + r.tokenCount, 0);
    console.log(`   - 시간: ${voyageEmbedTime.toFixed(2)}ms`);
    console.log(`   - 토큰: ${voyageTokenCount}`);
  } catch {
    console.log(`   - 실패: VOYAGE_API_KEY가 설정되지 않았거나 유효하지 않습니다.`);
  }

  // OpenAI 임베딩 벤치마크
  console.log("\n2. OpenAI 임베딩 테스트...");
  let openaiEmbedTime = 0;
  let openaiTokenCount = 0;
  try {
    const start = performance.now();
    const results = await embedding.embedBatch(testTexts, "openai", "document");
    openaiEmbedTime = performance.now() - start;
    openaiTokenCount = results.reduce((sum, r) => sum + r.tokenCount, 0);
    console.log(`   - 시간: ${openaiEmbedTime.toFixed(2)}ms`);
    console.log(`   - 토큰: ${openaiTokenCount}`);
  } catch {
    console.log(`   - 실패: OPENAI_API_KEY가 설정되지 않았거나 유효하지 않습니다.`);
  }

  // Voyage AI 검색 벤치마크
  console.log("\n3. Voyage AI 검색 테스트...");
  const voyageSearchTimes: number[] = [];
  try {
    for (const query of testQueries) {
      const start = performance.now();
      await searchSyncFixtures(query, {
        provider: "voyage",
        embeddingColumn: "content_embedding",
        limit: 10,
      });
      voyageSearchTimes.push(performance.now() - start);
    }
    const avgTime = voyageSearchTimes.reduce((a, b) => a + b, 0) / voyageSearchTimes.length;
    console.log(`   - 평균: ${avgTime.toFixed(2)}ms`);
  } catch {
    console.log(`   - 실패: 임베딩이 없거나 API 키 문제`);
  }

  // OpenAI 검색 벤치마크
  console.log("\n4. OpenAI 검색 테스트...");
  const openaiSearchTimes: number[] = [];
  try {
    for (const query of testQueries) {
      const start = performance.now();
      await searchSyncFixtures(query, {
        provider: "openai",
        embeddingColumn: "content_embedding_openai",
        limit: 10,
      });
      openaiSearchTimes.push(performance.now() - start);
    }
    const avgTime = openaiSearchTimes.reduce((a, b) => a + b, 0) / openaiSearchTimes.length;
    console.log(`   - 평균: ${avgTime.toFixed(2)}ms`);
  } catch {
    console.log(`   - 실패: 임베딩이 없거나 API 키 문제`);
  }

  // 결과 요약
  console.log("\n========== 결과 요약 ==========\n");
  console.log("| 항목 | Voyage AI | OpenAI | 비교 |");
  console.log("|------|-----------|--------|------|");

  if (voyageEmbedTime > 0 && openaiEmbedTime > 0) {
    console.log(
      `| 임베딩 | ${voyageEmbedTime.toFixed(0)}ms | ${openaiEmbedTime.toFixed(0)}ms | ${(openaiEmbedTime / voyageEmbedTime).toFixed(1)}x |`,
    );
  }

  if (voyageSearchTimes.length > 0 && openaiSearchTimes.length > 0) {
    const voyageAvg = voyageSearchTimes.reduce((a, b) => a + b, 0) / voyageSearchTimes.length;
    const openaiAvg = openaiSearchTimes.reduce((a, b) => a + b, 0) / openaiSearchTimes.length;
    console.log(
      `| 검색 | ${voyageAvg.toFixed(0)}ms | ${openaiAvg.toFixed(0)}ms | ${(openaiAvg / voyageAvg).toFixed(1)}x |`,
    );
  }

  console.log("| 차원 | 1024 | 1536 | 1.5x 저장공간 |");
  console.log("| 컨텍스트 | 32K | 8K | 4x 더 긺 |");
  console.log("| 가격 | $0.18/1M | $0.02/1M | 9x 비쌈 |");

  // 검색 품질 비교
  console.log("\n========== 검색 품질 비교 ==========\n");

  for (const query of testQueries.slice(0, 2)) {
    console.log(`검색어: "${query}"\n`);

    try {
      const voyageResults = await searchSyncFixtures(query, {
        provider: "voyage",
        embeddingColumn: "content_embedding",
        limit: 3,
      });
      console.log("Voyage AI:");
      voyageResults.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.similarity.toFixed(4)}] ${r.data.name}`);
      });
    } catch {
      console.log("Voyage AI: 결과 없음");
    }

    try {
      const openaiResults = await searchSyncFixtures(query, {
        provider: "openai",
        embeddingColumn: "content_embedding_openai",
        limit: 3,
      });
      console.log("\nOpenAI:");
      openaiResults.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.similarity.toFixed(4)}] ${r.data.name}`);
      });
    } catch {
      console.log("\nOpenAI: 결과 없음");
    }

    console.log("\n---\n");
  }
}

// ============================================================
// 4. 전체 작업 시간 측정 (9.6 예상 소요 시간)
// ============================================================

interface TimingResult {
  task: string;
  time: number;
  count?: number;
  status: "success" | "skipped" | "failed";
  error?: string;
}

async function runTiming(targetCount: number = 1000) {
  const db = DB.getDB("w");
  const results: TimingResult[] = [];

  console.log("\n========== 작업 시간 측정 시작 ==========\n");
  console.log(`목표 데이터 수: ${targetCount}개\n`);

  const totalStartTime = performance.now();

  // 0. 벡터 컬럼 존재 확인 및 생성
  console.log("0. 벡터 컬럼 확인...");
  try {
    const { rows: columns } = await db.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sync_fixtures'
      AND column_name IN ('content_embedding', 'content_embedding_openai')
    `);
    const existingColumns = columns.map((c: { column_name: string }) => c.column_name);

    if (!existingColumns.includes("content_embedding")) {
      console.log("   - content_embedding 컬럼 생성...");
      await db.raw("ALTER TABLE sync_fixtures ADD COLUMN content_embedding vector(1024)");
    }
    if (!existingColumns.includes("content_embedding_openai")) {
      console.log("   - content_embedding_openai 컬럼 생성...");
      await db.raw("ALTER TABLE sync_fixtures ADD COLUMN content_embedding_openai vector(1536)");
    }
    console.log("   - 완료");
  } catch (error) {
    console.log(`   - 벡터 컬럼 확인/생성 실패: ${error}`);
  }

  // 1. 테스트 데이터 INSERT 시간 측정
  console.log("\n1. 테스트 데이터 INSERT 측정...");
  try {
    // 기존 데이터 수 확인
    const {
      rows: [{ count: existingCount }],
    } = await db.raw("SELECT COUNT(*) as count FROM sync_fixtures");
    const existing = parseInt(existingCount);

    if (existing >= targetCount) {
      console.log(`   - 이미 ${existing}개 데이터 존재, INSERT 생략`);
      results.push({
        task: "테스트 데이터 INSERT",
        time: 0,
        count: existing,
        status: "skipped",
      });
    } else {
      const insertCount = targetCount - existing;
      const insertStart = performance.now();

      // status enum 값들
      const statuses = ["draft", "pending", "active", "completed", "archived"];

      // 배치로 INSERT
      const batchSize = 100;
      for (let i = 0; i < insertCount; i += batchSize) {
        const batch = Math.min(batchSize, insertCount - i);
        const values: string[] = [];
        const params: (string | boolean)[] = [];

        for (let j = 0; j < batch; j++) {
          const idx = existing + i + j + 1;
          const paramOffset = j * 4;
          values.push(
            `($${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3}, $${paramOffset + 4})`,
          );
          params.push(
            `테스트 Fixture ${idx}`,
            `자동 생성된 테스트 데이터입니다. 인덱스: ${idx}`,
            statuses[idx % statuses.length] ?? "draft",
            Math.random() > 0.2,
          );
        }

        await db.raw(
          `INSERT INTO sync_fixtures (name, description, status, is_active) VALUES ${values.join(", ")}`,
          params,
        );

        process.stdout.write(`\r   - 진행: ${Math.min(i + batchSize, insertCount)}/${insertCount}`);
      }

      const insertTime = performance.now() - insertStart;
      console.log(`\n   - 완료: ${insertCount}개 INSERT, ${(insertTime / 1000).toFixed(2)}초`);
      results.push({
        task: "테스트 데이터 INSERT",
        time: insertTime,
        count: insertCount,
        status: "success",
      });
    }
  } catch (error) {
    console.log(`   - 실패: ${error}`);
    results.push({
      task: "테스트 데이터 INSERT",
      time: 0,
      status: "failed",
      error: String(error),
    });
  }

  // 현재 데이터 수 확인
  const {
    rows: [{ count: totalCount }],
  } = await db.raw("SELECT COUNT(*) as count FROM sync_fixtures");
  const dataCount = parseInt(totalCount);

  // 2. Voyage AI 임베딩 시간 측정
  const VOYAGE_LIMIT = 1000; // Rate limit 제한으로 최대 200개까지만 처리
  console.log(`\n2. Voyage AI 임베딩 측정... (최대 ${VOYAGE_LIMIT}개)`);
  const voyageApiKey = Sonamu.secrets?.voyage_api_key;
  if (!voyageApiKey) {
    console.log("   - VOYAGE_API_KEY가 설정되지 않음, 생략");
    results.push({
      task: "Voyage AI 임베딩",
      time: 0,
      status: "skipped",
    });
  } else {
    try {
      const { rows: voyageFixtures } = await db.raw(`
        SELECT id, name, description
        FROM sync_fixtures
        WHERE content_embedding IS NULL
        ORDER BY id
        LIMIT ${VOYAGE_LIMIT}
      `);

      if (voyageFixtures.length === 0) {
        console.log("   - 모든 데이터에 Voyage 임베딩 존재, 생략");
        results.push({
          task: "Voyage AI 임베딩",
          time: 0,
          count: 0,
          status: "skipped",
        });
      } else {
        const voyageStart = performance.now();

        await saveSyncFixtureEmbeddingsBatch(
          voyageFixtures.map((f: { id: number; name: string; description: string | null }) => ({
            id: f.id,
            name: f.name,
            description: f.description,
          })),
          "voyage",
          "content_embedding",
          (processed, total) => {
            process.stdout.write(`\r   - 진행: ${processed}/${total}`);
          },
        );

        const voyageTime = performance.now() - voyageStart;
        console.log(`\n   - 완료: ${voyageFixtures.length}개, ${(voyageTime / 1000).toFixed(2)}초`);
        results.push({
          task: "Voyage AI 임베딩",
          time: voyageTime,
          count: voyageFixtures.length,
          status: "success",
        });
      }
    } catch (error) {
      console.log(`   - 실패: ${error}`);
      results.push({
        task: "Voyage AI 임베딩",
        time: 0,
        status: "failed",
        error: String(error),
      });
    }
  }

  // 3. OpenAI 임베딩 시간 측정
  console.log("\n3. OpenAI 임베딩 측정...");
  const openaiApiKey = Sonamu.secrets?.openai_api_key;
  if (!openaiApiKey) {
    console.log("   - OPENAI_API_KEY가 설정되지 않음, 생략");
    results.push({
      task: "OpenAI 임베딩",
      time: 0,
      status: "skipped",
    });
  } else {
    try {
      const { rows: openaiFixtures } = await db.raw(`
        SELECT id, name, description
        FROM sync_fixtures
        WHERE content_embedding_openai IS NULL
        ORDER BY id
      `);

      if (openaiFixtures.length === 0) {
        console.log("   - 모든 데이터에 OpenAI 임베딩 존재, 생략");
        results.push({
          task: "OpenAI 임베딩",
          time: 0,
          count: 0,
          status: "skipped",
        });
      } else {
        const openaiStart = performance.now();

        await saveSyncFixtureEmbeddingsBatch(
          openaiFixtures.map((f: { id: number; name: string; description: string | null }) => ({
            id: f.id,
            name: f.name,
            description: f.description,
          })),
          "openai",
          "content_embedding_openai",
          (processed, total) => {
            process.stdout.write(`\r   - 진행: ${processed}/${total}`);
          },
        );

        const openaiTime = performance.now() - openaiStart;
        console.log(`\n   - 완료: ${openaiFixtures.length}개, ${(openaiTime / 1000).toFixed(2)}초`);
        results.push({
          task: "OpenAI 임베딩",
          time: openaiTime,
          count: openaiFixtures.length,
          status: "success",
        });
      }
    } catch (error) {
      console.log(`   - 실패: ${error}`);
      results.push({
        task: "OpenAI 임베딩",
        time: 0,
        status: "failed",
        error: String(error),
      });
    }
  }

  // 4. 인덱스 생성 시간 측정
  // HNSW (Hierarchical Navigable Small World): 빠른 검색, 높은 정확도 - 권장
  // IVFFlat (Inverted File with Flat Compression): 빠른 빌드, 낮은 메모리 - 대용량 시
  console.log("\n4. 인덱스 생성 측정 (HNSW)...");
  try {
    // 기존 인덱스 삭제 후 재생성
    const indexStart = performance.now();

    await db.raw("DROP INDEX IF EXISTS idx_sync_fixtures_embedding_hnsw");
    await db.raw("DROP INDEX IF EXISTS idx_sync_fixtures_embedding_openai_hnsw");

    // HNSW 인덱스 생성 (권장 - 빠른 검색, 높은 정확도)
    // m: 노드당 최대 연결 수 (기본: 16)
    // ef_construction: 구성 시 탐색 범위 (기본: 64)
    if (dataCount >= 100) {
      await db.raw(`
        CREATE INDEX idx_sync_fixtures_embedding_hnsw
        ON sync_fixtures USING hnsw (content_embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);

      await db.raw(`
        CREATE INDEX idx_sync_fixtures_embedding_openai_hnsw
        ON sync_fixtures USING hnsw (content_embedding_openai vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
    }

    const indexTime = performance.now() - indexStart;
    console.log(`   - 완료: ${(indexTime / 1000).toFixed(2)}초`);
    results.push({
      task: "인덱스 생성",
      time: indexTime,
      status: "success",
    });
  } catch (error) {
    console.log(`   - 실패: ${error}`);
    results.push({
      task: "인덱스 생성",
      time: 0,
      status: "failed",
      error: String(error),
    });
  }

  const totalTime = performance.now() - totalStartTime;

  // 결과 요약 테이블 출력
  console.log("\n========== 소요 시간 측정 결과 ==========\n");
  console.log(`데이터 수: ${dataCount}개\n`);
  console.log("| 작업                 | 소요 시간     | 1000개 기준 예상 | 상태     |");
  console.log("| -------------------- | ------------- | ---------------- | -------- |");

  for (const r of results) {
    const timeStr = r.time > 0 ? `${(r.time / 1000).toFixed(1)}초` : "-";
    const estimated =
      r.time > 0 && r.count && r.count > 0
        ? `~${(((r.time / r.count) * 1000) / 1000).toFixed(1)}초`
        : r.task === "인덱스 생성" && r.time > 0
          ? `~${(r.time / 1000).toFixed(1)}초`
          : "-";
    const statusStr = r.status === "success" ? "완료" : r.status === "skipped" ? "생략" : "실패";
    console.log(
      `| ${r.task.padEnd(20)} | ${timeStr.padEnd(13)} | ${estimated.padEnd(16)} | ${statusStr.padEnd(8)} |`,
    );
  }

  console.log("| -------------------- | ------------- | ---------------- | -------- |");
  console.log(
    `| **총 소요 시간**     | ${(totalTime / 1000).toFixed(1)}초`.padEnd(49) +
      "|                  |          |",
  );

  // 9.6 예상 시간과 비교
  console.log("\n========== 예상 시간 vs 실측 시간 비교 ==========\n");
  console.log("| 작업                 | 예상 (1000개 기준)          | 실측              |");
  console.log("| -------------------- | --------------------------- | ----------------- |");
  console.log(
    `| 테스트 데이터 INSERT | ~1초                        | ${formatResultTime(results, "테스트 데이터 INSERT")} |`,
  );
  console.log(
    `| Voyage AI 임베딩     | ~20-30초 (10 batches × 2-3초) | ${formatResultTime(results, "Voyage AI 임베딩")} |`,
  );
  console.log(
    `| OpenAI 임베딩        | ~60-90초 (10 batches × 6-9초) | ${formatResultTime(results, "OpenAI 임베딩")} |`,
  );
  console.log(
    `| 인덱스 생성          | ~2-5초                      | ${formatResultTime(results, "인덱스 생성")} |`,
  );
  console.log(
    `${`| **총 소요 시간**     | **~2분**                    | **${(totalTime / 1000).toFixed(1)}초**`.padEnd(19)}|`,
  );
}

function formatResultTime(results: TimingResult[], taskName: string): string {
  const r = results.find((r) => r.task === taskName);
  if (!r) return "-".padEnd(17);
  if (r.status === "skipped") return "생략".padEnd(17);
  if (r.status === "failed") return "실패".padEnd(17);
  return `${(r.time / 1000).toFixed(1)}초`.padEnd(17);
}

// ============================================================
// CLI 실행
// ============================================================

async function main() {
  // Sonamu 초기화 (환경변수 로드)
  await Sonamu.init(true, false, undefined, true);

  const command = process.argv[2];

  try {
    switch (command) {
      case "migrate": {
        const provider = (process.argv[3] as EmbeddingProvider) || "voyage";
        await migrateEmbeddings(provider);
        break;
      }
      case "search": {
        const query = process.argv[3] || "사용자 인증 JWT 토큰";
        const provider = (process.argv[4] as EmbeddingProvider) || "voyage";
        await runSearch(query, provider);
        break;
      }
      case "benchmark": {
        await runBenchmark();
        break;
      }
      case "timing": {
        const count = parseInt(process.argv[3] ?? "1000") || 1000;
        await runTiming(count);
        break;
      }
      default:
        console.log(`
Vector 스크립트 사용법:

  npx ts-node src/testing/vector-script.ts migrate [voyage|openai]
    - 임베딩이 없는 sync_fixtures에 임베딩 생성

  npx ts-node src/testing/vector-script.ts search "검색어" [voyage|openai]
    - 벡터 검색, 하이브리드 검색, 필터링 검색 테스트

  npx ts-node src/testing/vector-script.ts benchmark
    - Voyage AI vs OpenAI 성능 비교

  npx ts-node src/testing/vector-script.ts timing [count]
    - 전체 작업 시간 측정 (기본값: 1000개)
    - 9.6 예상 소요 시간과 실측 시간 비교
        `);
    }
  } catch (error) {
    console.error("실행 실패:", error);
    process.exit(1);
  } finally {
    await resetVectorSearch();
  }
}

main();
