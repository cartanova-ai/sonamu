import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (table) => {
    // columns
    table.increments().primary();
    table.timestamp("created_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("email", 255).notNullable();
    table.string("username", 255).notNullable();
    table.string("password", 255).notNullable();
    table.date("birth_date").nullable();
    table.string("role", 30).notNullable();
    table.datetime("last_login_at").nullable();
    table.text("bio").nullable();
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("false"));
    table.datetime("deleted_at").nullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
  await knex.raw(`ALTER TABLE users ADD FULLTEXT INDEX users_bio_index (bio) WITH PARSER ngram`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("users");
}
