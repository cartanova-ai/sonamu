import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("files", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("mime_type", 128).notNullable();
    table.string("name", 128).notNullable();
    table.string("url", 255).notNullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["url"]);
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("files");
}
