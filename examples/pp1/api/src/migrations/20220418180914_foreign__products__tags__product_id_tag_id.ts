import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("products__tags", (table) => {
    // create fk
    table
      .foreign("product_id")
      .references("products.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
    table
      .foreign("tag_id")
      .references("tags.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("products__tags", (table) => {
    // drop fk
    table.dropForeign(["product_id"]);
    table.dropForeign(["tag_id"]);
  });
}
