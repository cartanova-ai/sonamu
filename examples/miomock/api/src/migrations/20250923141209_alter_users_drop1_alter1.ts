import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // drop foreign key first
    table.dropForeign(["company_id"]);
    // then drop column
    table.dropColumns("company_id");
    // alter column
    table
      .boolean("is_verified")
      .notNullable()
      .defaultTo(knex.raw("false"))
      .alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - add column back
    table.integer("company_id").unsigned().nullable();
    // rollback - add foreign key back
    table
      .foreign("company_id")
      .references("companies.id")
      .onUpdate("CASCADE")
      .onDelete("SET NULL");
    // rollback - alter column
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("0")).alter();
  });
}
