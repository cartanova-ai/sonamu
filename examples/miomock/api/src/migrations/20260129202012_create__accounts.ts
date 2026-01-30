import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("accounts", (table) => {
    table.text("id").primary().notNullable();
    table.text("account_id").notNullable();
    table.text("provider_id").notNullable();
    table.text("user_id").notNullable();
    table.text("access_token").nullable();
    table.text("refresh_token").nullable();
    table.text("id_token").nullable();
    table.timestamp("access_token_expires_at", { useTz: true, precision: 3 }).nullable();
    table.timestamp("refresh_token_expires_at", { useTz: true, precision: 3 }).nullable();
    table.text("scope").nullable();
    table.text("password").nullable();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.timestamp("updated_at", { useTz: true, precision: 3 }).notNullable();
  });
  await knex.raw(`CREATE INDEX accounts_user_id_idx ON accounts (user_id);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("accounts");
}
