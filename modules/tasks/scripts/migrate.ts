import { DEFAULT_SCHEMA, migrate } from "../src/database/base";
import { KNEX_GLOBAL_CONFIG } from "../src/testing/connection";

async function main() {
  await migrate(KNEX_GLOBAL_CONFIG, DEFAULT_SCHEMA);
}

main();
