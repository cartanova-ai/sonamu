import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    // add
    table.json("image_urls").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("projects", (table) => {
    // rollback - add
    table.dropColumns("image_urls");
  });
}
