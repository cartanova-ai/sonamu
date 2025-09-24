import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // drop
    table.dropColumns("is_verified");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - drop
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("0"));
    // rollback - add indexes
    // rollback - drop indexes
  });
}
