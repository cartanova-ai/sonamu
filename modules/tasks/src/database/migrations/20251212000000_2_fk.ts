import { type Knex } from "knex";

import { DEFAULT_SCHEMA } from "../base";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(DEFAULT_SCHEMA).alterTable("step_attempts", (table) => {
    table
      .foreign(["namespace_id", "workflow_run_id"], "step_attempts_workflow_run_fk")
      .references(["namespace_id", "id"])
      .inTable(`${DEFAULT_SCHEMA}.workflow_runs`)
      .onDelete("cascade");
    table
      .foreign(
        ["child_workflow_run_namespace_id", "child_workflow_run_id"],
        "step_attempts_child_workflow_run_fk",
      )
      .references(["namespace_id", "id"])
      .inTable(`${DEFAULT_SCHEMA}.workflow_runs`)
      .onDelete("set null");
  });
  await knex.schema.withSchema(DEFAULT_SCHEMA).alterTable("workflow_runs", (table) => {
    table
      .foreign(
        ["parent_step_attempt_namespace_id", "parent_step_attempt_id"],
        "workflow_runs_parent_step_attempt_fk",
      )
      .references(["namespace_id", "id"])
      .inTable(`${DEFAULT_SCHEMA}.step_attempts`)
      .onDelete("set null");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(DEFAULT_SCHEMA).alterTable("step_attempts", (table) => {
    table.dropForeign(["namespace_id", "workflow_run_id"], "step_attempts_workflow_run_fk");
    table.dropForeign(
      ["child_workflow_run_namespace_id", "child_workflow_run_id"],
      "step_attempts_child_workflow_run_fk",
    );
  });
  await knex.schema.withSchema(DEFAULT_SCHEMA).alterTable("workflow_runs", (table) => {
    table.dropForeign(
      ["parent_step_attempt_namespace_id", "parent_step_attempt_id"],
      "workflow_runs_parent_step_attempt_fk",
    );
  });
}
