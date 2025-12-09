import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("companies", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.text("name").notNullable();

    // indexes
    table.unique(["name"], "companies_name_unique");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("companies");
}
