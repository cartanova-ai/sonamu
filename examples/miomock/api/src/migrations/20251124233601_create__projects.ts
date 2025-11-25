import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("projects", (table) => {
    // columns
    table.increments().primary();
    table.timestamp("created_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("name", 255).notNullable();
    table.string("status", 32).notNullable();
    table.text("description", "longtext").nullable();
    table.decimal("budget", 12, 2).nullable();
    table.datetime("deadline").nullable();
    table.json("image_urls").nullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("projects");
}
