import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE INDEX projects_textsearchable_index_col_index ON projects USING gin(textsearchable_index_col);`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    table.dropIndex(["textsearchable_index_col"], "projects_textsearchable_index_col_index");
  });
}
