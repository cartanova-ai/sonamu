import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("employees", (table) => {
    // alter column
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"))
      .alter();
    // alter column
    table.timestamp("hire_date", { useTz: true, precision: 3 }).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("employees", (table) => {
    // rollback - alter column
    table
      .timestamp("created_at", { useTz: true, precision: 6 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"))
      .alter();
    // rollback - alter column
    table.timestamp("hire_date", { useTz: true, precision: 6 }).nullable().alter();
  });
}
