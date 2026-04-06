import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("employees", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.integer("user_id").notNullable();
    table.integer("department_id").nullable();
    table.string("employee_number", 32).notNullable();
    table.decimal("salary", 10, 2).nullable();
    table.timestamp("hire_date", { useTz: true }).nullable();
    table.text("notes").nullable();

    // indexes
    table.unique(["user_id", "employee_number"], "employees_user_id_employee_number_unique");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("employees");
}
