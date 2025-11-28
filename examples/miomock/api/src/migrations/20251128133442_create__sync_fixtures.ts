import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sync_fixtures", (table) => {
    // columns
    table.increments().primary();
    table.timestamp("created_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.timestamp("updated_at").nullable();
    table.string("name", 128).notNullable();
    table.string("code", 32).nullable();
    table.string("status", 32).notNullable();
    table.integer("priority").nullable();
    table.boolean("is_active").notNullable().defaultTo(knex.raw("1"));
    table.text("description").nullable();
    table.json("tags").nullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("sync_fixtures");
}
