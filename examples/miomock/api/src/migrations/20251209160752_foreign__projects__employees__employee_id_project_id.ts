import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("projects__employees", (table) => {
    // create fk
    table.foreign("employee_id").references("employees.id").onUpdate("CASCADE").onDelete("CASCADE");
    table.foreign("project_id").references("projects.id").onUpdate("CASCADE").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("projects__employees", (table) => {
    // drop fk
    table.dropForeign(["employee_id"]);
    table.dropForeign(["project_id"]);
  });
}
