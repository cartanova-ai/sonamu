import knex from "knex";
import { DEFAULT_SCHEMA, migrate } from "../src/database/base";
import { KNEX_GLOBAL_CONFIG } from "../src/testing/connection";

async function main() {
  const knexInstance = knex(KNEX_GLOBAL_CONFIG);
  await migrate(knexInstance, DEFAULT_SCHEMA);
  await knexInstance.destroy();
}

main();
