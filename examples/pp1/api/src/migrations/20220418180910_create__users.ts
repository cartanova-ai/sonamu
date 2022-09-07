import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("users", (table) => {
    // columns
    table.increments().primary();
    table.string("role", 32).notNullable();
    table.string("string_id", 128).notNullable();
    table.string("pw", 256).notNullable();
    table.string("name", 64).notNullable();
    table
      .integer("birthyear")
      .unsigned()
      .notNullable()
      .defaultTo(knex.raw("1900"));
    table.string("status", 64).notNullable();
    table
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("users");
}
