import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("documents", (table) => {
    // drop columns
    table.dropColumns("content_embedding", "content_embedding_openai");
    // add
    table.specificType("title_content_embedding", "vector(1024)").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("documents", (table) => {
    // rollback - add
    table.dropColumns("title_content_embedding");
    // rollback - drop columns
    table.specificType("content_embedding", "vector(1024)").nullable();
    table.specificType("content_embedding_openai", "vector(1536)").nullable();
  });
}
