import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("projects__employees", (table) => {
    // columns
    table.increments().primary();
    table.integer("project_id").unsigned().notNullable();
    table.integer("employee_id").unsigned().notNullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("projects__employees");
}
