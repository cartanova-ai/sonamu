#!/usr/bin/env tsx
/**
 * DataExplorer 테스트 스크립트
 *
 * 실행: pnpm tsx scripts/test-data-explorer.ts
 */

import { DB, EntityManager, Sonamu } from "sonamu";
import { DataExplorer } from "sonamu/test";

async function main() {
  console.log("=== DataExplorer 테스트 시작 ===\n");

  // Sonamu 초기화
  console.log("Sonamu 초기화 중...");
  await Sonamu.init();
  console.log("초기화 완료!\n");

  const db = DB.getDB("r");
  const explorer = new DataExplorer(db, EntityManager);

  try {
    // 1. Recent 전략 테스트
    console.log("1. Recent 전략 - 최근 User 5명 조회");
    const recentUsers = await explorer.explore("User", {
      strategy: "recent",
      limit: 5,
    });
    console.log(`   조회됨: ${recentUsers.length}명`);
    console.log("   첫 번째 유저:", {
      id: recentUsers[0]?.id,
      email: recentUsers[0]?.email,
      created_at: recentUsers[0]?.created_at,
    });
    console.log("");

    // 2. Sample 전략 테스트
    console.log("2. Sample 전략 - 균등 샘플링 10명");
    const sampledUsers = await explorer.explore("User", {
      strategy: "sample",
      limit: 10,
    });
    console.log(`   조회됨: ${sampledUsers.length}명`);
    console.log(
      "   ID 분포:",
      sampledUsers.map((u) => u.id),
    );
    console.log("");

    // 3. Query 전략 테스트
    console.log("3. Query 전략 - role이 'normal'인 User 조회");
    const normalUsers = await explorer.explore("User", {
      strategy: "query",
      where: { role: "normal" },
      orderBy: "id:asc",
      limit: 5,
    });
    console.log(`   조회됨: ${normalUsers.length}명`);
    normalUsers.forEach((user) => {
      console.log(`   - ID ${user.id}: ${user.email} (role: ${user.role})`);
    });
    console.log("");

    // 4. Random 전략 테스트
    console.log("4. Random 전략 - 랜덤 3명");
    const randomUsers = await explorer.explore("User", {
      strategy: "random",
      limit: 3,
    });
    console.log(`   조회됨: ${randomUsers.length}명`);
    console.log(
      "   ID:",
      randomUsers.map((u) => u.id),
    );
    console.log("");

    // 5. Relation 탐색 테스트 (Employee -> Department)
    console.log("5. ExploreRelation - Employee의 department 참조");
    const departments = await explorer.exploreRelation("Employee", "department", {
      limit: 3,
    });
    console.log(`   조회된 Department: ${departments.length}개`);
    departments.forEach((dept) => {
      console.log(`   - ID ${dept.id}: ${dept.name}`);
    });
    console.log("");

    // 6. 여러 Relation 병렬 조회 테스트
    console.log("6. ExploreRelations - Employee의 여러 relation 병렬 조회");
    const relations = await explorer.exploreRelations("Employee", ["department", "user"], {
      limit: 3,
    });
    console.log(`   department: ${relations.department?.length}개`);
    console.log(`   user: ${relations.user?.length}개`);
    console.log("");

    console.log("=== 테스트 완료! ===");
  } catch (error) {
    console.error("에러 발생:", error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
