import { randomUUID } from "node:crypto";

import knex from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { BackendPostgres } from ".";
import { OpenWorkflow } from "./client";
import { type SerializedError } from "./core/error";
import { type WorkflowRun } from "./core/workflow";
import { DEFAULT_SCHEMA } from "./database/base";
import { KNEX_GLOBAL_CONFIG } from "./testing/connection";

describe("StepExecutor", () => {
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

  test("executes step and returns result", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "executor-basic" }, async ({ step }) => {
      const result = await step.run({ name: "add" }, () => 5 + 3);
      return result;
    });

    const worker = client.newWorker();
    const handle = await workflow.run();
    await worker.tick();

    const result = await handle.result();
    expect(result).toBe(8);
  });

  test("caches step results for same step name", async () => {
    const client = new OpenWorkflow({ backend });

    let executionCount = 0;
    const workflow = client.defineWorkflow({ name: "executor-cached" }, async ({ step }) => {
      const first = await step.run({ name: "cached-step" }, () => {
        executionCount++;
        return "first-execution";
      });
      const second = await step.run({ name: "cached-step" }, () => {
        executionCount++;
        return "second-execution";
      });
      return { first, second };
    });

    const worker = client.newWorker();
    const handle = await workflow.run();
    await worker.tick();

    const result = await handle.result();
    expect(result).toEqual({
      first: "first-execution",
      second: "first-execution",
    });
    expect(executionCount).toBe(1);
  });

  test("different step names execute independently", async () => {
    const client = new OpenWorkflow({ backend });

    let executionCount = 0;
    const workflow = client.defineWorkflow(
      { name: "executor-different-steps" },
      async ({ step }) => {
        const first = await step.run({ name: "step-1" }, () => {
          executionCount++;
          return "a";
        });
        const second = await step.run({ name: "step-2" }, () => {
          executionCount++;
          return "b";
        });
        return { first, second };
      },
    );

    const worker = client.newWorker();
    const handle = await workflow.run();
    await worker.tick();

    const result = await handle.result();
    expect(result).toEqual({ first: "a", second: "b" });
    expect(executionCount).toBe(2);
  });

  test("propagates step errors with deadline exceeded", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "executor-error" }, async ({ step }) => {
      await step.run({ name: "failing-step" }, () => {
        throw new Error("Step failed intentionally");
      });
      return "should not reach";
    });

    const worker = client.newWorker();
    // Use deadline to force immediate failure without retries
    const handle = await workflow.run({}, { deadlineAt: new Date(Date.now() - 1000) });
    await worker.tick();
    await sleep(100);

    await expect(handle.result()).rejects.toThrow(/deadline exceeded/);
  });

  test("sleep puts workflow in sleeping status", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "executor-sleep" }, async ({ step }) => {
      await step.sleep("sleep-1", "5s");
      return "after sleep";
    });

    const handle = await workflow.run();
    const worker = client.newWorker();
    await worker.tick();

    const workflowRun = await waitForWorkflowStatus(backend, handle.workflowRun.id, "sleeping");
    expect(workflowRun?.status).toBe("sleeping");
    expect(workflowRun?.availableAt).not.toBeNull();
  });

  test("workflow resumes after sleep duration", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow({ name: "resume-after-sleep" }, async ({ step }) => {
      const value = await step.run({ name: "before" }, () => 5);
      await step.sleep("wait", "10ms");
      return value + 10;
    });

    const handle = await workflow.run();
    const worker = client.newWorker();

    // First tick - hits sleep
    await worker.tick();
    const sleeping = await waitForWorkflowStatus(backend, handle.workflowRun.id, "sleeping");
    expect(sleeping?.status).toBe("sleeping");

    // Wait for sleep to elapse
    await sleep(50);

    // Second tick - completes
    await worker.tick();

    const result = await handle.result();
    expect(result).toBe(15);
  });

  test("re-execution after reclaim leaves no duplicate running function attempts", async () => {
    const client = new OpenWorkflow({ backend });

    const workflow = client.defineWorkflow(
      { name: "reclaim-stale-function-step" },
      async ({ step }) => {
        return await step.run({ name: "work" }, () => "done");
      },
    );

    const handle = await workflow.run();
    const firstWorker = randomUUID();
    const claimed = await backend.claimWorkflowRun({
      workerId: firstWorker,
      leaseDurationMs: 5,
    });
    if (!claimed) {
      throw new Error("expected workflow run to be claimed");
    }
    await backend.createStepAttempt({
      workflowRunId: claimed.id,
      workerId: firstWorker,
      stepName: "work",
      kind: "function",
      config: {},
      context: null,
    });

    const [expired] = await db
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", namespaceId)
      .where("id", claimed.id)
      .update({
        available_at: db.raw("NOW() - INTERVAL '1 second'"),
        updated_at: db.fn.now(),
      })
      .returning("*");
    if (!expired) {
      throw new Error("expected workflow run fixture to expire");
    }

    const worker = client.newWorker();
    await worker.tick();

    const result = await handle.result();
    expect(result).toBe("done");

    const attempts = await backend.listStepAttempts({
      workflowRunId: handle.workflowRun.id,
    });
    const workAttempts = attempts.data.filter(
      (attempt) => attempt.stepName === "work" && attempt.kind === "function",
    );
    const runningFunctionAttempts = workAttempts.filter((attempt) => attempt.status === "running");

    expect(workAttempts).toHaveLength(2);
    expect(runningFunctionAttempts).toHaveLength(0);
  });
});

describe("executeWorkflow", () => {
  let backend: BackendPostgres;

  beforeAll(async () => {
    backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
      namespaceId: randomUUID(),
      runMigrations: false,
    });
    await backend.initialize();
  });

  afterAll(async () => {
    await backend.stop();
  });

  describe("successful execution", () => {
    test("executes a simple workflow", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow(
        { name: "simple-workflow" },
        ({ input }: { input: { a: number; b: number } }) => {
          return input.a + input.b;
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run({ a: 10, b: 5 });
      await worker.tick();

      const result = await handle.result();
      expect(result).toBe(15);
    });

    test("executes a multi-step workflow", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow<{ value: number }, number>(
        { name: "multi-step-workflow" },
        async ({ input, step }) => {
          const sum = await step.run({ name: "add" }, () => input.value + 5);
          const product = await step.run({ name: "multiply" }, () => sum * 2);
          return product;
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run({ value: 10 });
      await worker.tick();

      const result = await handle.result();
      expect(result).toBe(30);
    });

    test("returns null for workflows without return", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "void-workflow" }, () => null);

      const worker = client.newWorker();
      const handle = await workflow.run();
      await worker.tick();

      const result = await handle.result();
      expect(result).toBeNull();
    });

    test("returns null from workflow", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "null-workflow" }, () => null);

      const worker = client.newWorker();
      const handle = await workflow.run();
      await worker.tick();

      const result = await handle.result();
      expect(result).toBeNull();
    });
  });

  describe("error handling", () => {
    test("handles workflow errors with deadline exceeded", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "failing-workflow" }, () => {
        throw new Error("Workflow error");
      });

      const worker = client.newWorker();
      // Use deadline to skip retries - fails with deadline exceeded
      const handle = await workflow.run({}, { deadlineAt: new Date(Date.now() - 1000) });
      await worker.tick();
      await sleep(100);

      await expect(handle.result()).rejects.toThrow(/deadline exceeded/);
    });

    test("handles step errors with deadline exceeded", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "step-error-workflow" }, async ({ step }) => {
        await step.run({ name: "failing" }, () => {
          throw new Error("Step error");
        });
        return "unreachable";
      });

      const worker = client.newWorker();
      const handle = await workflow.run({}, { deadlineAt: new Date(Date.now() - 1000) });
      await worker.tick();
      await sleep(100);

      await expect(handle.result()).rejects.toThrow(/deadline exceeded/);
    });

    test("serializes non-Error exceptions", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "non-error-workflow" }, async ({ step }) => {
        await step.run({ name: "throw-object" }, () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw { custom: "error", code: 500 };
        });
        return "nope";
      });

      const worker = client.newWorker();
      const handle = await workflow.run({}, { deadlineAt: new Date() });
      await worker.tick();
      await sleep(100);

      await expect(handle.result()).rejects.toThrow();
    });
  });

  describe("sleep handling", () => {
    test("workflow enters sleeping status", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "sleep-workflow" }, async ({ step }) => {
        await step.sleep("wait", "5s");
        return "after sleep";
      });

      const handle = await workflow.run();
      const worker = client.newWorker();
      await worker.tick();

      const workflowRun = await waitForWorkflowStatus(backend, handle.workflowRun.id, "sleeping");
      expect(workflowRun?.status).toBe("sleeping");
    });

    test("resumes workflow after sleep duration", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow<{ value: number }, number>(
        { name: "resume-after-sleep" },
        async ({ input, step }) => {
          const sum = await step.run({ name: "add" }, () => input.value + 1);
          await step.sleep("wait", "10ms");
          return sum + 10;
        },
      );

      const handle = await workflow.run({ value: 5 });
      const worker = client.newWorker();

      // first tick - hits sleep
      await worker.tick();

      const sleeping = await waitForWorkflowStatus(backend, handle.workflowRun.id, "sleeping");
      expect(sleeping?.status).toBe("sleeping");

      // wait for sleep
      await sleep(50);

      await worker.tick();

      const result = await handle.result();
      expect(result).toBe(16);
    });
  });

  describe("workflow with complex data", () => {
    test("handles objects as input and output", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow(
        { name: "user-workflow" },
        ({ input }: { input: { name: string; age: number } }) => {
          return {
            greeting: `Hello, ${input.name}! You are ${String(input.age)} years old.`,
            processed: true,
          };
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run({ name: "Alice", age: 30 });
      await worker.tick();

      const result = await handle.result();
      expect(result).toEqual({
        greeting: "Hello, Alice! You are 30 years old.",
        processed: true,
      });
    });

    test("handles arrays in workflow", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow(
        { name: "array-workflow" },
        ({ input }: { input: { numbers: number[] } }) => {
          return input.numbers.reduce((a, b) => a + b, 0);
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run({ numbers: [1, 2, 3, 4, 5] });
      await worker.tick();

      const result = await handle.result();
      expect(result).toBe(15);
    });
  });

  describe("result type handling", () => {
    test("returns success with numeric result", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "numeric-result" }, async ({ step }) => {
        return await step.run({ name: "compute" }, () => 100 + 200);
      });

      const worker = client.newWorker();
      const handle = await workflow.run();
      await worker.tick();

      const result = await handle.result();
      expect(result).toBe(300);
    });

    test("returns success with string result", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow(
        { name: "string-result" },
        ({ input }: { input: { text: string } }) => {
          return input.text.toUpperCase();
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run({ text: "hello world" });
      await worker.tick();

      const result = await handle.result();
      expect(result).toBe("HELLO WORLD");
    });

    test("returns success with boolean result", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow(
        { name: "bool-result" },
        ({ input }: { input: { value: number } }) => {
          return input.value > 0;
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run({ value: 42 });
      await worker.tick();

      const result = await handle.result();
      expect(result).toBe(true);
    });
  });

  describe("step execution order", () => {
    test("executes steps in sequence", async () => {
      const client = new OpenWorkflow({ backend });

      const order: string[] = [];
      const workflow = client.defineWorkflow({ name: "sequence-workflow" }, async ({ step }) => {
        await step.run({ name: "first" }, () => order.push("first"));
        await step.run({ name: "second" }, () => order.push("second"));
        await step.run({ name: "third" }, () => order.push("third"));
        return order;
      });

      const worker = client.newWorker();
      const handle = await workflow.run();
      await worker.tick();

      const result = await handle.result();
      expect(result).toEqual(["first", "second", "third"]);
    });
  });

  describe("version handling", () => {
    test("passes version to workflow function", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow(
        { name: "version-workflow", version: "1.0.0" },
        ({ version }) => {
          return { receivedVersion: version };
        },
      );

      const worker = client.newWorker();
      const handle = await workflow.run();
      await worker.tick();

      const result = await handle.result();
      expect(result).toEqual({ receivedVersion: "1.0.0" });
    });

    test("passes null version when not specified", async () => {
      const client = new OpenWorkflow({ backend });

      const workflow = client.defineWorkflow({ name: "no-version-workflow" }, ({ version }) => {
        return { receivedVersion: version };
      });

      const worker = client.newWorker();
      const handle = await workflow.run();
      await worker.tick();

      const result = await handle.result();
      expect(result).toEqual({ receivedVersion: null });
    });
  });
});

describe("executeWorkflow with dynamic retryPolicy", () => {
  let backend: BackendPostgres;

  beforeAll(async () => {
    backend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
      namespaceId: randomUUID(),
      runMigrations: false,
    });
    await backend.initialize();
  });

  afterAll(async () => {
    await backend.stop();
  });

  test("calls failWorkflowRun with forceComplete=true when shouldRetry returns false", async () => {
    const client = new OpenWorkflow({ backend });

    // shouldRetry가 false를 반환하는 retryPolicy
    const workflow = client.defineWorkflow(
      {
        name: "dynamic-retry-false",
        retryPolicy: {
          maxAttempts: 10, // 정적으로는 10번까지 허용하지만
          shouldRetry: () => ({ shouldRetry: false, delayMs: 0 }), // 동적으로 즉시 거부
        },
      },
      () => {
        throw new Error("Intentional failure");
      },
    );

    const worker = client.newWorker();
    const handle = await workflow.run();
    await worker.tick();
    await sleep(100);

    // shouldRetry가 false를 반환했으므로 즉시 failed 상태가 되어야 합니다
    const workflowRun = await backend.getWorkflowRun({
      workflowRunId: handle.workflowRun.id,
    });
    expect(workflowRun?.status).toBe("failed");
    expect(workflowRun?.attempts).toBe(1); // 한 번만 시도하고 종료
  });

  test("calls failWorkflowRun with forceComplete=false when shouldRetry returns true", async () => {
    const client = new OpenWorkflow({ backend });

    // shouldRetry가 true를 반환하는 retryPolicy
    const workflow = client.defineWorkflow(
      {
        name: "dynamic-retry-true",
        retryPolicy: {
          maxAttempts: 2,
          shouldRetry: () => ({ shouldRetry: true, delayMs: 1000 }),
        },
      },
      () => {
        throw new Error("Intentional failure");
      },
    );

    const worker = client.newWorker();
    const handle = await workflow.run();
    await worker.tick();
    await sleep(100);

    // shouldRetry가 true를 반환했으므로 pending 상태로 재시도 대기
    const workflowRun = await backend.getWorkflowRun({
      workflowRunId: handle.workflowRun.id,
    });
    expect(workflowRun?.status).toBe("pending");
    expect(workflowRun?.attempts).toBe(1);
  });

  test("receives correct error and attempt number in shouldRetry function", async () => {
    const client = new OpenWorkflow({ backend });

    const receivedErrors: SerializedError[] = [];
    let receivedAttempt: number | null = null;

    const workflow = client.defineWorkflow(
      {
        name: "dynamic-retry-params",
        retryPolicy: {
          maxAttempts: 10,
          shouldRetry: (error, attempt) => {
            receivedErrors.push(error);
            receivedAttempt = attempt;
            return { shouldRetry: false, delayMs: 0 };
          },
        },
      },
      () => {
        throw new Error("Test error message");
      },
    );

    const worker = client.newWorker();
    const handle = await workflow.run();
    await worker.tick();
    await sleep(100);

    // shouldRetry 함수가 올바른 파라미터를 받았는지 확인
    const [receivedError] = receivedErrors;
    if (!receivedError) throw new Error("재시도 정책이 오류를 받지 못했습니다.");
    expect(receivedError.message).toBe("Test error message");
    expect(receivedAttempt).toBe(1); // 첫 번째 시도 후이므로 1

    const workflowRun = await backend.getWorkflowRun({
      workflowRunId: handle.workflowRun.id,
    });
    expect(workflowRun?.status).toBe("failed");
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWorkflowStatus(
  backend: BackendPostgres,
  workflowRunId: string,
  status: WorkflowRun["status"],
): Promise<Awaited<ReturnType<BackendPostgres["getWorkflowRun"]>>> {
  const deadline = Date.now() + 2_000;
  let workflowRun = await backend.getWorkflowRun({ workflowRunId });

  while (workflowRun?.status !== status && Date.now() < deadline) {
    await sleep(20);
    workflowRun = await backend.getWorkflowRun({ workflowRunId });
  }

  return workflowRun;
}
