import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tags", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.text("name").notNullable();

    // indexes
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("tags");
}
