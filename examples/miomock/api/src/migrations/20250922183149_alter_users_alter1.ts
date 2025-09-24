import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // alter column
    table
      .boolean("is_verified")
      .notNullable()
      .defaultTo(knex.raw("false"))
      .alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - alter column
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("0")).alter();
    // rollback - add indexes
    // rollback - drop indexes
  });
}
