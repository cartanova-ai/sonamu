import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    // add
    table.string("employee_number", 32).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    // rollback - add
    table.dropColumns("employee_number");
    // rollback - add indexes
    // rollback - drop indexes
  });
}
