import { installSearchSchema } from "@sonamu-kit/opensearch/admin";
import { type Knex } from "knex";

// installSearchSchema applies only missing versions: this upgrades version 1 databases and is a no-op on new ones.
export async function up(knex: Knex): Promise<void> {
  await installSearchSchema(knex);
}

// Never reverted automatically: without the origin record and fences, copied databases go unnoticed.
export async function down(_knex: Knex): Promise<void> {
  throw new Error(
    "sonamu_search 스키마 버전 2는 자동으로 되돌리지 않습니다. 패키지는 버전 1 스키마로 동작하지 않으므로, 되돌리려면 이전 패키지 버전으로 돌아간 뒤 스키마를 직접 정리하세요.",
  );
}
