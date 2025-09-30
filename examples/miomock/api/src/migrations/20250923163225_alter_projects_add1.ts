import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("projects", (table) => {
    // add
    table.text("description", "longtext").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("projects", (table) => {
    // rollback - add
    table.dropColumns("description");
    // rollback - add indexes
    // rollback - drop indexes
  });
}
