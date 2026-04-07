import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("milestones", (table) => {
    // create fk
    table.foreign("project_id").references("projects.id").onUpdate("CASCADE").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("milestones", (table) => {
    // drop fk
    table.dropForeign(["project_id"]);
  });
}
