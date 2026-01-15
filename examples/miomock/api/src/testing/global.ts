import dotenv from "dotenv";
import { ParallelDBManager } from "sonamu/test";

dotenv.config();

// 이 파일은 vitest.config.ts의 parallel 프로젝트 전용 globalSetup입니다.
// parallel 프로젝트에서만 실행되므로 환경변수 체크 없이 바로 worker DB를 생성합니다.
const WORKER_COUNT = 6;
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
  await ParallelDBManager.createWorkerDatabases({
    templateDb: TEMPLATE_DB,
    workerCount: WORKER_COUNT,
    connectionConfig,
  });

  return async function teardown() {
    await ParallelDBManager.dropWorkerDatabases({
      templateDb: TEMPLATE_DB,
      workerCount: WORKER_COUNT,
      connectionConfig,
    });
  };
}
