import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // add
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("false"));
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - add
    table.dropColumns("is_verified");
    // rollback - add indexes
    // rollback - drop indexes
  });
}
