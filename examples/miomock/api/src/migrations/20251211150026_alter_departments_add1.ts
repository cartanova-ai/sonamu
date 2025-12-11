import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // add (generated)
  await knex.raw(
    `ALTER TABLE "departments" ADD COLUMN "code" varchar(10) GENERATED ALWAYS AS ('DEP-' || LPAD(id::text, 3, '0')) STORED NOT NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("departments", (table) => {
    // rollback - add
    table.dropColumns("code");
  });
}
