import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("sessions", (table) => {
    // add
    table.text("impersonated_by").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("sessions", (table) => {
    // rollback - add
    table.dropColumns("impersonated_by");
  });
}
