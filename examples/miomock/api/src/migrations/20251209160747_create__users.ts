import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("email", 255).notNullable();
    table.string("username", 255).notNullable();
    table.string("password", 255).notNullable();
    table.timestamp("birth_date", { useTz: true }).nullable();
    table.text("role").notNullable();
    table.timestamp("last_login_at", { useTz: true }).nullable();
    table.text("bio").nullable();
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("false"));
    table.timestamp("deleted_at", { useTz: true }).nullable();

    // indexes
    table.unique(["email"], "users_email_unique");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("users");
}
