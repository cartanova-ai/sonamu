import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("passkeys", (table) => {
    table.text("id").primary().notNullable();
    table.text("name").nullable();
    table.text("public_key").notNullable();
    table.text("credential_id").notNullable();
    table.integer("counter").notNullable();
    table.text("device_type").notNullable();
    table.boolean("backed_up").notNullable();
    table.text("transports").nullable();
    table.text("aaguid").nullable();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.text("user_id").notNullable();
  });
  await knex.raw(`CREATE INDEX passkeys_user_id_idx ON passkeys (user_id);`);
  await knex.raw(`CREATE INDEX passkeys_credential_id_idx ON passkeys (credential_id);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("passkeys");
}
