import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("two_factors", (table) => {
    table.text("id").primary().notNullable();
    table.text("secret").notNullable();
    table.text("backup_codes").notNullable();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table
      .timestamp("updated_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.text("user_id").notNullable();
  });
  await knex.raw(`CREATE INDEX two_factors_user_id_idx ON two_factors (user_id);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("two_factors");
}
