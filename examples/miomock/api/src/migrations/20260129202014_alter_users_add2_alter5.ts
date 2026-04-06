import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    // add
    table.text("image").nullable();
    table
      .timestamp("updated_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    // alter column
    table.string("password", 255).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    // rollback - add
    table.dropColumns("image", "updated_at");
    // rollback - alter column
    table.string("password", 255).notNullable().alter();
  });
}
