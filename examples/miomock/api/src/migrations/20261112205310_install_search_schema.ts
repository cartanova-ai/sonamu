import { installSearchSchema } from "@sonamu-kit/opensearch/admin";
import { type Knex } from "knex";

// The schema has no entities, so the Sonamu migrator never diffs it and sonamu.lock does not list it.
export async function up(knex: Knex): Promise<void> {
  await installSearchSchema(knex);
}

// Never reverted automatically: the index ledger and target records would go with it.
export async function down(_knex: Knex): Promise<void> {
  throw new Error(
    "sonamu_search 스키마는 자동으로 되돌리지 않습니다. 검색 색인 원장과 대상 기록이 함께 사라지므로, 필요하면 DROP SCHEMA sonamu_search CASCADE를 직접 실행한 뒤 knex_migrations에서 이 마이그레이션 행을 지우세요.",
  );
}
