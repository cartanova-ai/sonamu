import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // add (generated)
  await knex.raw(
    `ALTER TABLE "projects" ADD COLUMN "textsearchable_index_col" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))) STORED NOT NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    // rollback - add
    table.dropColumns("textsearchable_index_col");
  });
}
