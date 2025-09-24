import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    // add
    table.decimal("salary", 10, 2).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("employees", (table) => {
    // rollback - add
    table.dropColumns("salary");
    // rollback - add indexes
    // rollback - drop indexes
  });
}
