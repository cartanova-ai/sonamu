import { type Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("milestones", (table) => {
    table.increments().primary();
    table
      .timestamp("created_at", { useTz: true, precision: 3 })
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP"));
    table.integer("project_id").notNullable();
    table.string("name", 255).notNullable();
    table.text("description").nullable();
    table.timestamp("due_date", { useTz: true, precision: 3 }).notNullable();
    table.timestamp("completed_at", { useTz: true, precision: 3 }).nullable();
  });
  await knex.raw(`CREATE INDEX milestones_project_id_index ON milestones (project_id);`);
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("milestones");
}
