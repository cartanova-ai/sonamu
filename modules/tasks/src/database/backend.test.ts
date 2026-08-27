import { randomUUID } from "node:crypto";

import knex from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { KNEX_GLOBAL_CONFIG } from "../testing/connection";
import { BackendPostgres } from "./backend";
import { testBackend } from "./backend.testsuite";
import { DEFAULT_SCHEMA } from "./base";

testBackend<BackendPostgres>({
  setup: async () => {
    const backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
      namespaceId: randomUUID(),
      runMigrations: false,
    });
    await backend.initialize();
    return backend;
  },
  teardown: async (backend) => {
    await backend.stop();
  },
});

describe("BackendPostgres", () => {
  const namespaceId = randomUUID();
  const db = knex(KNEX_GLOBAL_CONFIG);
  let backend: BackendPostgres;

  beforeAll(async () => {
    backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
      namespaceId,
      runMigrations: false,
    });
    await backend.initialize();
  });

  afterAll(async () => {
    await backend.stop();
    await db.destroy();
  });

  test("leaves deprecated succeeded function step attempts unchanged when reclaiming", async () => {
    const firstWorker = randomUUID();
    const workflowRun = await backend.createWorkflowRun({
      workflowName: randomUUID(),
      version: null,
      idempotencyKey: null,
      config: {},
      context: null,
      input: null,
      availableAt: null,
      deadlineAt: null,
    });
    const claimed = await backend.claimWorkflowRun({
      workerId: firstWorker,
      leaseDurationMs: 5,
    });
    if (!claimed) {
      throw new Error("expected workflow run to be claimed");
    }
    const stepAttempt = await backend.createStepAttempt({
      workflowRunId: workflowRun.id,
      workerId: firstWorker,
      stepName: "deprecated-succeeded-step",
      kind: "function",
      config: {},
      context: null,
    });

    const [succeeded] = await db
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts")
      .where("namespace_id", namespaceId)
      .where("id", stepAttempt.id)
      .update({
        status: "succeeded",
        output: JSON.stringify({ ok: true }),
        finished_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
      .returning("*");
    if (!succeeded) {
      throw new Error("expected step attempt fixture to update");
    }
    const succeededAttempt = await backend.getStepAttempt({
      stepAttemptId: stepAttempt.id,
    });
    if (!succeededAttempt) {
      throw new Error("expected succeeded step attempt fixture");
    }

    await sleep(10);
    await backend.claimWorkflowRun({
      workerId: randomUUID(),
      leaseDurationMs: 100,
    });

    const got = await backend.getStepAttempt({
      stepAttemptId: stepAttempt.id,
    });
    expect(got).toEqual(succeededAttempt);
  });

  test("rejects stale step attempt creation after a concurrent ownership change commits", async () => {
    const firstWorker = randomUUID();
    const secondWorker = randomUUID();
    const workflowRun = await backend.createWorkflowRun({
      workflowName: randomUUID(),
      version: null,
      idempotencyKey: null,
      config: {},
      context: null,
      input: null,
      availableAt: null,
      deadlineAt: null,
    });
    const claimed = await backend.claimWorkflowRun({
      workerId: firstWorker,
      leaseDurationMs: 100,
    });
    if (!claimed) {
      throw new Error("expected workflow run to be claimed");
    }

    const trx = await db.transaction();
    let committed = false;
    try {
      await trx
        .withSchema(DEFAULT_SCHEMA)
        .table("workflow_runs")
        .where("namespace_id", namespaceId)
        .where("id", workflowRun.id)
        .update({
          worker_id: secondWorker,
          updated_at: trx.fn.now(),
        });

      const createAttempt = backend.createStepAttempt({
        workflowRunId: workflowRun.id,
        workerId: firstWorker,
        stepName: "during-reclaim",
        kind: "function",
        config: {},
        context: null,
      });

      await sleep(20);
      await trx.commit();
      committed = true;

      await expect(createAttempt).rejects.toThrow("Failed to create step attempt");
    } catch (error) {
      if (!committed) {
        await trx.rollback();
      }
      throw error;
    }

    const attempts = await backend.listStepAttempts({
      workflowRunId: workflowRun.id,
    });
    expect(attempts.data).toHaveLength(0);
  });
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
