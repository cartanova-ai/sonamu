import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("departments", (table) => {
    // alter column
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"))
      .alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("departments", (table) => {
    // rollback - alter column
    table
      .timestamp("created_at", { useTz: true, precision: 6 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"))
      .alter();
  });
}
