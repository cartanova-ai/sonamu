import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tags", (table) => {
    // add
    table.string("name_en", 30).nullable();
    table.string("name_ko", 30).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tags", (table) => {
    // rollback - add
    table.dropColumns("name_en", "name_ko");
  });
}
