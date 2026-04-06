import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("departments", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("name", 128).notNullable();
    table.integer("company_id").notNullable();
    table.integer("parent_id").nullable();

    // indexes
    table.unique(["company_id", "name"], "departments_company_id_name_unique");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("departments");
}
