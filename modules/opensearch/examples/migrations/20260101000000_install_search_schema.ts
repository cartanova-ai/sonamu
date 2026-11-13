import { installSearchSchema } from "@sonamu-kit/opensearch/admin";
import { type Knex } from "knex";

/** Role privileges are not part of the schema; grant them with grantSearchRoles (administration.ts). */
export async function up(knex: Knex): Promise<void> {
  await installSearchSchema(knex);
}

export async function down(): Promise<void> {
  // Never dropped automatically: the index ledger and intents cannot be recovered.
  throw new Error(
    "sonamu_search 스키마는 자동으로 지우지 않습니다. 운영자가 직접 DROP SCHEMA sonamu_search CASCADE를 실행하세요.",
  );
}
