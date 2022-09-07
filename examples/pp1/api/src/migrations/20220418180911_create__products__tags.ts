import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("products__tags", (table) => {
    // columns
    table.increments().primary();
    table.integer("product_id").unsigned().notNullable();
    table.integer("tag_id").unsigned().notNullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("products__tags");
}
