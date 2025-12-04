import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("projects", (table) => {
    // columns
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.string("name", 255).notNullable();
    table.text("status").notNullable();
    table.text("description").nullable();
    table.decimal("budget", 12, 2).nullable();
    table.timestamp("deadline", { useTz: true }).nullable();
    table.jsonb("image_urls").nullable();
    table.uuid("uuid").nullable();

    // indexes
    table.unique(["uuid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("projects");
}
