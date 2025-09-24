import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    // create fk
    table
      .foreign("user_id")
      .references("users.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
    table
      .foreign("department_id")
      .references("departments.id")
      .onUpdate("CASCADE")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    // drop fk
    table.dropForeign(["user_id"]);
    table.dropForeign(["department_id"]);
  });
}
