import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    // add
    table.timestamp("ban_expires", { useTz: true, precision: 3 }).nullable();
    table.text("ban_reason").nullable();
    table.boolean("banned").nullable().defaultTo(knex.raw("false"));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    // rollback - add
    table.dropColumns("ban_expires", "ban_reason", "banned");
  });
}
