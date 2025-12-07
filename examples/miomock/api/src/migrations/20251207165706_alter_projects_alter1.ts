import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    // drop & add column
    table.dropColumn("image_urls");
  });

  await knex.schema.alterTable("projects", (table) => {
    // drop & add column
    table.specificType("image_urls", "text[]").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    // rollback - drop & add column
    table.dropColumn("image_urls");
  });

  await knex.schema.alterTable("projects", (table) => {
    // rollback - drop & add column
    table.jsonb("image_urls").nullable();
  });
}
