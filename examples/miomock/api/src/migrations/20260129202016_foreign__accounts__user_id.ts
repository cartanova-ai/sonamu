import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("accounts", (table) => {
    // create fk
    table.foreign("user_id").references("users.id").onUpdate("RESTRICT").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("accounts", (table) => {
    // drop fk
    table.dropForeign(["user_id"]);
  });
}
