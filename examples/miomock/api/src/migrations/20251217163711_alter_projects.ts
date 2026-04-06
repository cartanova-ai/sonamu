import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    table.dropIndex(["name", "description"], "projects_name_description_index");
  });
  await knex.raw(
    `CREATE INDEX projects_name_description_pgroonga_index ON projects USING pgroonga ((ARRAY[name::text,description::text])) WITH (tokenizer='TokenMecab');`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    table.dropIndex(["name", "description"], "projects_name_description_pgroonga_index");
  });
  await knex.raw(
    `CREATE INDEX projects_name_description_index ON projects USING pgroonga ((ARRAY[name::text,description::text]));`,
  );
}
