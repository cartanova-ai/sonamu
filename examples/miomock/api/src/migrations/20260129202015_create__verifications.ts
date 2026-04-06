import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("verifications", (table) => {
    table.text("id").primary().notNullable();
    table.text("identifier").notNullable();
    table.text("value").notNullable();
    table.timestamp("expires_at", { useTz: true, precision: 3 }).notNullable();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table
      .timestamp("updated_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
  });
  await knex.raw(`CREATE INDEX verifications_identifier_idx ON verifications (identifier);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("verifications");
}
