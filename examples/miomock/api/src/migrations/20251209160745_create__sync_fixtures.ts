import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sync_fixtures", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.timestamp("updated_at", { useTz: true }).nullable();
    table.string("name", 128).notNullable();
    table.string("code", 32).nullable();
    table.text("status").notNullable();
    table.integer("priority").nullable();
    table.boolean("is_active").notNullable().defaultTo(knex.raw("false"));
    table.text("description").nullable();
    table.jsonb("tags").nullable();

    // indexes
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("sync_fixtures");
}
