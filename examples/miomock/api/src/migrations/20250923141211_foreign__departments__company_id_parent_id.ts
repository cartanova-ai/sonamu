import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("departments", (table) => {
    // create fk
    table
      .foreign("company_id")
      .references("companies.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
    table
      .foreign("parent_id")
      .references("departments.id")
      .onUpdate("CASCADE")
      .onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("departments", (table) => {
    // drop fk
    table.dropForeign(["company_id"]);
    table.dropForeign(["parent_id"]);
  });
}
