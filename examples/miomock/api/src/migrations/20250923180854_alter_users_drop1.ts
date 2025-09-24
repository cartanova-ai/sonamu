import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // drop
    table.dropColumns("salary");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("users", (table) => {
    // rollback - drop
    table.decimal("salary", 10, 2).nullable();
    // rollback - add indexes
    // rollback - drop indexes
  });
}
