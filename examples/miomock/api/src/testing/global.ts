import dotenv from "dotenv";
import { ParallelDBManager } from "sonamu/test";

dotenv.config();

const WORKER_COUNT = 4;
const TEMPLATE_DB = "miomock_test";

const connectionConfig = {
  client: "pg" as const,
  connection: {
    host: process.env.MIOMOCK_DB_HOST ?? "0.0.0.0",
    port: Number(process.env.MIOMOCK_DB_PORT ?? 5432),
    user: process.env.MIOMOCK_DB_USER ?? "postgres",
    password: process.env.MIOMOCK_DB_PASSWORD ?? "miomock123",
  },
};

export async function setup() {
  const parallelDBManager = new ParallelDBManager(WORKER_COUNT, connectionConfig, TEMPLATE_DB);
  await parallelDBManager.createWorkerDatabases();

  return async function teardown() {
    await parallelDBManager.dropWorkerDatabases();
  };
}
