import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("employees", (table) => {
    table.unique(["employee_number", "user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    table.dropUnique(["employee_number", "user_id"]);
  });
}
