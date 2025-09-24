import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // add
    table.text("bio").nullable();
    table.date("birth_date").nullable();
    table.integer("company_id").unsigned().nullable();
    table.string("email", 255).notNullable();
    table.boolean("is_verified").notNullable().defaultTo(knex.raw("false"));
    table.datetime("last_login_at").nullable();
    table.string("role", 30).notNullable();
    table.decimal("salary", 10, 2).nullable();
    table.string("username", 255).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - add
    table.dropColumns(
      "bio",
      "birth_date",
      "company_id",
      "email",
      "is_verified",
      "last_login_at",
      "role",
      "salary",
      "username",
    );
    // rollback - add indexes
    // rollback - drop indexes
  });
}
