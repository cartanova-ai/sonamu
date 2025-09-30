import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (_table) => {});
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (_table) => {});
}
