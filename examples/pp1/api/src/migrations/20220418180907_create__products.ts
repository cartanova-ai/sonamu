import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("products", (table) => {
    // columns
    table.increments().primary();
    table.integer("brand_id").unsigned().notNullable();
    table.string("type", 32).notNullable();
    table.string("title", 128).notNullable();
    table.text("description", "mediumtext").notNullable();
    table.integer("price").notNullable();
    table.boolean("is_new").notNullable();
    table.timestamp("visible_until_at").notNullable();
    table.string("status", 32).notNullable();
    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.json("images").notNullable();
    table.uuid("uuid").nullable();

    // indexes
    table.index(["price"]);
    table.index(["is_new"]);
    table.index(["visible_until_at"]);
    table.index(["created_at"]);
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("products");
}
