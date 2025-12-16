import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("documents", (table) => {
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("title", 255).notNullable();
    table.text("content").nullable();
    table.text("status").notNullable();
    table.specificType("title_content_embedding", "vector(1024)").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("documents");
}
