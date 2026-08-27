import assert from "node:assert";
import { randomUUID } from "node:crypto";

import { BackendPostgres, OpenWorkflow } from "../";
import { KNEX_GLOBAL_CONFIG } from "../testing/connection";

let sharedBackend: BackendPostgres | null = null;

async function getBackend(): Promise<BackendPostgres> {
  if (sharedBackend !== null) {
    return sharedBackend;
  }

  sharedBackend = new BackendPostgres(KNEX_GLOBAL_CONFIG, {
    runMigrations: true,
    namespaceId: randomUUID(),
  });

  await sharedBackend.initialize();
  return sharedBackend;
}

async function practice() {
  const backend = await getBackend();
  const ow = new OpenWorkflow({ backend });

  const sampleWorkflow = ow.defineWorkflow({ name: "sample-workflow" }, async ({ step }) => {
    const { result: result1 } = await step.run({ name: "test-1" }, async () => {
      return {
        result: ["Result from test-1"],
      };
    });

    await step.run({ name: "test-2" }, async () => {
      return await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    });

    return await step.run({ name: "test-3" }, async () => {
      return {
        result: [...result1, "Result from test-3"],
      };
    });
  });

  // create a worker that will listen to the channel and process the workflow runs
  const worker = ow.newWorker({ concurrency: 3 });
  await worker.start();

  const handle = await sampleWorkflow.run();

  await new Promise((resolve) => setTimeout(resolve, 3000));
  await worker.tick();

  const result = await handle.result();
  assert.deepEqual(result, {
    result: ["Result from test-1", "Result from test-3"],
  });

  await worker.stop();
  await backend.stop();
}

await practice();
