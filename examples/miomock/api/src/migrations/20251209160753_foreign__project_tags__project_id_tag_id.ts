import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("project_tags", (table) => {
    // create fk
    table.foreign("project_id").references("projects.id").onUpdate("CASCADE").onDelete("CASCADE");
    table.foreign("tag_id").references("tags.id").onUpdate("CASCADE").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("project_tags", (table) => {
    // drop fk
    table.dropForeign(["project_id"]);
    table.dropForeign(["tag_id"]);
  });
}
