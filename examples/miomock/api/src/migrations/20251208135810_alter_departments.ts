import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("departments", (table) => {
    table.unique(["company_id", "name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("departments", (table) => {
    table.dropUnique(["company_id", "name"]);
  });
}
