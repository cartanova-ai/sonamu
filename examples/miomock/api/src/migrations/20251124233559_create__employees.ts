import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("employees", (table) => {
    // columns
    table.increments().primary();
    table.timestamp("created_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.integer("user_id").unsigned().notNullable();
    table.integer("department_id").unsigned().nullable();
    table.string("employee_number", 32).notNullable();
    table.decimal("salary", 10, 2).nullable();
    table.date("hire_date").nullable();
    table.text("notes").nullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("employees");
}
