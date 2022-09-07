import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("practices", (table) => {
    // columns
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("practices");
}
