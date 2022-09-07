import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("products", (table) => {
    // create fk
    table
      .foreign("brand_id")
      .references("brands.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("products", (table) => {
    // drop fk
    table.dropForeign(["brand_id"]);
  });
}
