import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("brands", (table) => {
    // alter column
    table.string("name", 128).notNullable().alter();
    // add indexes
    table.unique(["name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("brands", (table) => {
    // rollback - alter column
    table.string("name", 64).notNullable().alter();
    // rollback - add indexes
    table.dropUnique(["name"]);
  });
}
