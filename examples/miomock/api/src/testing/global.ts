import dotenv from "dotenv";
import { ParallelDBManager } from "sonamu/test";

dotenv.config();

// vitest.config.ts와 동일한 로직으로 worker 수 계산
const WORKER_COUNT = 4;
const TEMPLATE_DB = "miomock_test";

export async function setup() {
  if (WORKER_COUNT > 1) {
    await ParallelDBManager.createWorkerDatabases({
      templateDb: TEMPLATE_DB,
      workerCount: WORKER_COUNT,
      connectionConfig: {
        client: "pg",
        connection: {
          host: process.env.MIOMOCK_DB_HOST ?? "0.0.0.0",
          port: Number(process.env.MIOMOCK_DB_PORT ?? 5432),
          user: process.env.MIOMOCK_DB_USER ?? "postgres",
          password: process.env.MIOMOCK_DB_PASSWORD ?? "miomock123",
        },
      },
    });
  }

  return async function teardown() {
    if (WORKER_COUNT > 1) {
      await ParallelDBManager.dropWorkerDatabases({
        templateDb: TEMPLATE_DB,
        workerCount: WORKER_COUNT,
        connectionConfig: {
          client: "pg",
          connection: {
            host: process.env.MIOMOCK_DB_HOST ?? "0.0.0.0",
            port: Number(process.env.MIOMOCK_DB_PORT ?? 5432),
            user: process.env.MIOMOCK_DB_USER ?? "postgres",
            password: process.env.MIOMOCK_DB_PASSWORD ?? "miomock123",
          },
        },
      });
    }
  };
}
