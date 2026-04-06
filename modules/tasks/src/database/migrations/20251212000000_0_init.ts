import { type Knex } from "knex";

import { DEFAULT_SCHEMA } from "../base";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createSchemaIfNotExists(DEFAULT_SCHEMA);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropSchemaIfExists(DEFAULT_SCHEMA, true);
}
