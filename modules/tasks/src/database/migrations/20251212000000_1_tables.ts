import type { Knex } from "knex";
import { DEFAULT_SCHEMA } from "../base";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(DEFAULT_SCHEMA).createTable("workflow_runs", (table) => {
    table.text("namespace_id").notNullable();
    table.text("id").notNullable();
    table.text("workflow_name").notNullable();
    table.text("version");
    table.text("status").notNullable();
    table.text("idempotency_key");
    table.jsonb("config").notNullable();
    table.jsonb("context");
    table.jsonb("input");
    table.jsonb("output");
    table.jsonb("error");
    table.integer("attempts").notNullable();
    table.text("parent_step_attempt_namespace_id");
    table.text("parent_step_attempt_id");
    table.text("worker_id");
    table.timestamp("available_at", { useTz: true, precision: 3 });
    table.timestamp("deadline_at", { useTz: true, precision: 3 });
    table.timestamp("started_at", { useTz: true, precision: 3 });
    table.timestamp("finished_at", { useTz: true, precision: 3 });
    table.timestamp("created_at", { useTz: true, precision: 3 }).notNullable();
    table.timestamp("updated_at", { useTz: true, precision: 3 }).notNullable();
    table.primary(["namespace_id", "id"]);
  });

  await knex.schema.withSchema(DEFAULT_SCHEMA).createTable("step_attempts", (table) => {
    table.text("namespace_id").notNullable();
    table.text("id").notNullable();
    table.text("workflow_run_id").notNullable();
    table.text("step_name").notNullable();
    table.text("kind").notNullable();
    table.text("status").notNullable();
    table.jsonb("config").notNullable();
    table.jsonb("context");
    table.jsonb("output");
    table.jsonb("error");
    table.text("child_workflow_run_namespace_id");
    table.text("child_workflow_run_id");
    table.timestamp("started_at", { useTz: true, precision: 3 });
    table.timestamp("finished_at", { useTz: true, precision: 3 });
    table.timestamp("created_at", { useTz: true, precision: 3 }).notNullable();
    table.timestamp("updated_at", { useTz: true, precision: 3 }).notNullable();
    table.primary(["namespace_id", "id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(DEFAULT_SCHEMA).dropTable("workflow_runs");
  await knex.schema.withSchema(DEFAULT_SCHEMA).dropTable("step_attempts");
}
