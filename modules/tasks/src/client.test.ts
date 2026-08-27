import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { BackendPostgres } from ".";
import { declareWorkflow, OpenWorkflow } from "./client";
import { KNEX_GLOBAL_CONFIG } from "./testing/connection";

describe("OpenWorkflow", () => {
  let backend: BackendPostgres;

  beforeEach(async () => {
    backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
      namespaceId: randomUUID(),
      runMigrations: false,
    });
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.stop();
  });

  test("enqueues workflow runs via backend", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "enqueue-test" }, noopFn);
    await workflow.run({ docUrl: "https://example.com" });

    const workerId = "enqueue-worker";
    const claimed = await backend.claimWorkflowRun({
      workerId,
      leaseDurationMs: 1000,
    });

    expect(claimed?.workflowName).toBe("enqueue-test");
    expect(claimed?.workerId).toBe(workerId);
    expect(claimed?.input).toEqual({ docUrl: "https://example.com" });
  });

  describe("schema validation", () => {
    describe("Zod schema", () => {
      const schema = z.object({
        userId: z.uuid(),
        count: z.number().int().positive(),
      });

      test("accepts valid input", async () => {
        const client = new OpenWorkflow({ backend });
        const workflow = client.defineWorkflow({ name: "schema-zod-valid", schema }, noopFn);

        const handle = await workflow.run({
          userId: randomUUID(),
          count: 3,
        });

        await handle.cancel();
      });

      test("rejects invalid input", async () => {
        const client = new OpenWorkflow({ backend });
        const workflow = client.defineWorkflow({ name: "schema-zod-invalid", schema }, noopFn);

        await expect(workflow.run({ userId: "not-a-uuid", count: 0 })).rejects.toThrow();
      });
    });
  });

  test("result resolves when workflow succeeds", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "result-success" }, noopFn);
    const handle = await workflow.run({ value: 1 });

    const workerId = "test-worker";
    const claimed = await backend.claimWorkflowRun({
      workerId,
      leaseDurationMs: 1000,
    });
    expect(claimed).not.toBeNull();
    if (!claimed) throw new Error("workflow run was not claimed");

    await backend.completeWorkflowRun({
      workflowRunId: claimed.id,
      workerId,
      output: { ok: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const result = await handle.result();
    expect(result).toEqual({ ok: true });
  });

  test("result rejects when workflow fails", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "result-failure" }, noopFn);
    await workflow.run({ value: 1 });

    const workerId = "test-worker";
    const claimed = await backend.claimWorkflowRun({
      workerId,
      leaseDurationMs: 1000,
    });
    expect(claimed).not.toBeNull();
    if (!claimed) throw new Error("workflow run was not claimed");

    // mark as failed (should reschedule))
    await backend.failWorkflowRun({
      workflowRunId: claimed.id,
      workerId,
      error: { message: "boom" },
    });

    const rescheduled = await backend.getWorkflowRun({
      workflowRunId: claimed.id,
    });
    expect(rescheduled?.status).toBe("pending");
    expect(rescheduled?.error).toEqual({ message: "boom" });
  });

  test("creates workflow run with deadline", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "deadline-test" }, noopFn);
    const deadline = new Date(Date.now() + 60_000); // in 1 minute
    const handle = await workflow.run({ value: 1 }, { deadlineAt: deadline });

    expect(handle.workflowRun.deadlineAt).not.toBeNull();
    expect(handle.workflowRun.deadlineAt?.getTime()).toBe(deadline.getTime());
  });

  test("creates workflow run with version", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "versioned-test", version: "v2.0" }, noopFn);
    const handle = await workflow.run({ value: 1 });

    expect(handle.workflowRun.version).toBe("v2.0");
  });

  test("creates workflow run without version", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "unversioned-test" }, noopFn);
    const handle = await workflow.run({ value: 1 });

    expect(handle.workflowRun.version).toBeNull();
  });

  test("cancels workflow run via handle", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "cancel-test" }, noopFn);
    const handle = await workflow.run({ value: 1 });

    await handle.cancel();

    const workflowRun = await backend.getWorkflowRun({
      workflowRunId: handle.workflowRun.id,
    });
    expect(workflowRun?.status).toBe("canceled");
    expect(workflowRun?.finishedAt).not.toBeNull();
  });

  describe("declareWorkflow / implementWorkflow API", () => {
    test("declareWorkflow returns a spec that can be used to schedule runs", async () => {
      const client = new OpenWorkflow({ backend });

      const spec = declareWorkflow({ name: "declare-test" });

      const handle = await client.runWorkflow(spec, { message: "hello" });
      expect(handle.workflowRun.workflowName).toBe("declare-test");

      await handle.cancel();
    });

    test("implementWorkflow registers the workflow for worker execution", async () => {
      const client = new OpenWorkflow({ backend });

      const spec = declareWorkflow({ name: "implement-test" });
      client.implementWorkflow(spec, ({ input }) => {
        return { received: input };
      });

      const handle = await client.runWorkflow(spec, { data: 42 });
      const worker = client.newWorker();
      await worker.tick();
      await sleep(100); // wait for background execution

      const result = await handle.result();
      expect(result).toEqual({ received: { data: 42 } });
    });

    test("implementWorkflow throws when workflow is already registered", async () => {
      const client = new OpenWorkflow({ backend });

      const spec = declareWorkflow({ name: "duplicate-test" });
      client.implementWorkflow(spec, noopFn);

      expect(() => {
        client.implementWorkflow(spec, noopFn);
      }).toThrow('Workflow "duplicate-test" is already registered');
    });

    test("implementWorkflow allows registering different versions of the same workflow", async () => {
      const client = new OpenWorkflow({ backend });

      const specV1 = declareWorkflow({
        name: "multi-version",
        version: "v1",
      });
      const specV2 = declareWorkflow({
        name: "multi-version",
        version: "v2",
      });

      // no throwing...
      client.implementWorkflow(specV1, noopFn);
      client.implementWorkflow(specV2, noopFn);
    });

    test("implementWorkflow throws for same name+version combination", async () => {
      const client = new OpenWorkflow({ backend });

      const spec1 = declareWorkflow({
        name: "version-duplicate",
        version: "v1",
      });
      const spec2 = declareWorkflow({
        name: "version-duplicate",
        version: "v1",
      });

      client.implementWorkflow(spec1, noopFn);

      expect(() => {
        client.implementWorkflow(spec2, noopFn);
      }).toThrow('Workflow "version-duplicate" (version: v1) is already registered');
    });

    test("declareWorkflow with schema validates input on runWorkflow", async () => {
      const client = new OpenWorkflow({ backend });

      const schema = z.object({
        email: z.email(),
      });
      const spec = declareWorkflow({
        name: "declare-schema-test",
        schema,
      });

      const handle = await client.runWorkflow(spec, {
        email: "test@example.com",
      });
      await handle.cancel();

      await expect(client.runWorkflow(spec, { email: "not-an-email" })).rejects.toThrow();
    });

    test("declareWorkflow with version sets version on workflow run", async () => {
      const client = new OpenWorkflow({ backend });

      const spec = declareWorkflow({
        name: "declare-version-test",
        version: "v1.2.3",
      });

      const handle = await client.runWorkflow(spec);
      expect(handle.workflowRun.version).toBe("v1.2.3");

      await handle.cancel();
    });

    test("defineWorkflow wraps declareWorkflow and implementWorkflow", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow<{ n: number }, { doubled: number }>(
        { name: "define-wrap-test" },
        ({ input }) => ({
          doubled: input.n * 2,
        }),
      );

      const handle = await workflow.run({ n: 21 });
      const worker = client.newWorker();
      await worker.tick();
      await sleep(100); // wait for background execution

      const result = await handle.result();
      expect(result).toEqual({ doubled: 42 });
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function noopFn() {
  // no-op
}
