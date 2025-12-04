import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("project_tags", (table) => {
    // columns
    table.increments().primary();
    table.integer("project_id").notNullable();
    table.integer("tag_id").notNullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("project_tags");
}
