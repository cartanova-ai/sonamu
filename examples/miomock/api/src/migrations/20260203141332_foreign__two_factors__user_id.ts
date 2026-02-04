import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("two_factors", (table) => {
    // create fk
    table.foreign("user_id").references("users.id").onUpdate("RESTRICT").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("two_factors", (table) => {
    // drop fk
    table.dropForeign(["user_id"]);
  });
}
