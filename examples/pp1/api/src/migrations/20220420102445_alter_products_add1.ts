import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("products", (table) => {
    // add
    table.timestamp("checked_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("products", (table) => {
    // rollback - add
    table.dropColumns("checked_at");
  });
}
