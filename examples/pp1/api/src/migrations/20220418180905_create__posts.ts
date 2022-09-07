import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("posts", (table) => {
    // columns
    table.increments().primary();
    table.string("type", 64).notNullable();
    table.string("title", 256).nullable();
    table.text("content").notNullable();
    table.integer("author_id").unsigned().notNullable();
    table.string("status", 64).notNullable();
    table.decimal("rating").nullable();
    table.json("images").notNullable();
    table.string("source_url", 512).nullable();
    table.boolean("is_public").notNullable();
    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("posts");
}
