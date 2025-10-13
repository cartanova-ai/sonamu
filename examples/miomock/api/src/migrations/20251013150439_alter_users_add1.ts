import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // add
    table.string("password", 255).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - add
    table.dropColumns("password");
    // rollback - add indexes
    // rollback - drop indexes
  });
}
