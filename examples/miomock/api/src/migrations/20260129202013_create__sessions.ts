import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sessions", (table) => {
    table.text("id").primary().notNullable();
    table.timestamp("expires_at", { useTz: true, precision: 3 }).notNullable();
    table.text("token").notNullable();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.timestamp("updated_at", { useTz: true, precision: 3 }).notNullable();
    table.text("ip_address").nullable();
    table.text("user_agent").nullable();
    table.text("user_id").notNullable();
  });
  await knex.raw(`CREATE UNIQUE INDEX sessions_token_unique ON sessions (token);`);
  await knex.raw(`CREATE INDEX sessions_user_id_idx ON sessions (user_id);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("sessions");
}
