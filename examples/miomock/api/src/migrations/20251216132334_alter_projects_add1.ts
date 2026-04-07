import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // add (generated)
  await knex.raw(
    `ALTER TABLE "projects" ADD COLUMN "textsearchable_index_col" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'D')) STORED NOT NULL`,
  );
  await knex.raw(
    `CREATE INDEX projects_textsearchable_index_col_index ON projects USING gin(textsearchable_index_col);`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    // rollback - add
    table.dropColumns("textsearchable_index_col");
  });
}
