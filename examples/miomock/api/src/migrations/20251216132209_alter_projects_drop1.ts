import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    // drop columns
    table.dropColumns("textsearchable_index_col");
  });
}

export async function down(knex: Knex): Promise<void> {
  // rollback - drop columns (generated)
  await knex.raw(
    `ALTER TABLE "projects" ADD COLUMN "textsearchable_index_col" tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, (((COALESCE(name, ''::character varying))::text || ' '::text) || COALESCE(description, ''::text)))) STORED NOT NULL`,
  );
}
