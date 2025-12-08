import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("companies", (table) => {
    table.unique(["name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("companies", (table) => {
    table.dropUnique(["name"]);
  });
}
