import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("tags", (table) => {
    // add indexes
    table.unique(["name"]);
    table.dropIndex(["name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("tags", (table) => {
    // rollback - add indexes
    table.dropUnique(["name"]);
    // rollback - drop indexes
    table.index(["name"]);
  });
}
