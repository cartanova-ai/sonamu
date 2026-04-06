import { type Knex } from "knex";

import { DEFAULT_SCHEMA } from "../base";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(DEFAULT_SCHEMA).table("workflow_runs", (table) => {
    table.index(
      ["namespace_id", "status", "available_at", "created_at"],
      "workflow_runs_status_available_at_created_at_idx",
    );
    table.index(
      ["namespace_id", "workflow_name", "idempotency_key", "created_at"],
      "workflow_runs_workflow_name_idempotency_key_created_at_idx",
    );
    table.index(
      ["parent_step_attempt_namespace_id", "parent_step_attempt_id"],
      "workflow_runs_parent_step_idx",
    );
    table.index(["namespace_id", "created_at"], "workflow_runs_created_at_desc_idx");
    table.index(
      ["namespace_id", "status", "created_at"],
      "workflow_runs_status_created_at_desc_idx",
    );
    table.index(
      ["namespace_id", "workflow_name", "status", "created_at"],
      "workflow_runs_workflow_name_status_created_at_desc_idx",
    );
  });
  await knex.schema.withSchema(DEFAULT_SCHEMA).table("step_attempts", (table) => {
    table.index(
      ["namespace_id", "workflow_run_id", "created_at"],
      "step_attempts_workflow_run_created_at_idx",
    );
    table.index(
      ["namespace_id", "workflow_run_id", "step_name", "created_at"],
      "step_attempts_workflow_run_step_name_created_at_idx",
    );
    table.index(
      ["child_workflow_run_namespace_id", "child_workflow_run_id"],
      "step_attempts_child_workflow_run_idx",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(DEFAULT_SCHEMA).table("workflow_runs", (table) => {
    table.dropIndex(
      ["namespace_id", "status", "available_at", "created_at"],
      "workflow_runs_status_available_at_created_at_idx",
    );
    table.dropIndex(
      ["namespace_id", "workflow_name", "idempotency_key", "created_at"],
      "workflow_runs_workflow_name_idempotency_key_created_at_idx",
    );
    table.dropIndex(
      ["parent_step_attempt_namespace_id", "parent_step_attempt_id"],
      "workflow_runs_parent_step_idx",
    );
    table.dropIndex(["namespace_id", "created_at"], "workflow_runs_created_at_desc_idx");
    table.dropIndex(
      ["namespace_id", "status", "created_at"],
      "workflow_runs_status_created_at_desc_idx",
    );
    table.dropIndex(
      ["namespace_id", "workflow_name", "status", "created_at"],
      "workflow_runs_workflow_name_status_created_at_desc_idx",
    );
  });
  await knex.schema.withSchema(DEFAULT_SCHEMA).table("step_attempts", (table) => {
    table.dropIndex(
      ["namespace_id", "workflow_run_id", "created_at"],
      "step_attempts_workflow_run_created_at_idx",
    );
    table.dropIndex(
      ["namespace_id", "workflow_run_id", "step_name", "created_at"],
      "step_attempts_workflow_run_step_name_created_at_idx",
    );
    table.dropIndex(
      ["child_workflow_run_namespace_id", "child_workflow_run_id"],
      "step_attempts_child_workflow_run_idx",
    );
  });
}
