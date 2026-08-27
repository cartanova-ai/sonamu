import { z } from "zod";

import { loadConfig } from "../api/config";
import { DB } from "../database/db";
import { ParallelDBManager } from "./parallel-db-manager";

const postgresConnectionSchema = z.object({ database: z.string() }).passthrough();

function restoreProcessEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
}

/**
 * vitest globalSetup 함수를 생성합니다.
 * sonamu.config.ts의 test 설정을 읽어서 병렬 테스트 환경을 구성합니다.
 *
 * @example
 * ```typescript
 * // src/testing/global.ts
 * export { setup } from "sonamu/test";
 * ```
 *
 * @example
 * ```typescript
 * // src/testing/global.ts
 * import { createGlobalSetup } from "sonamu/test";
 * export const setup = createGlobalSetup({ rootPath: process.cwd() });
 * ```
 */
export function createGlobalSetup() {
  return async function setup() {
    const { findApiRootPath } = await import("../utils/utils");
    const rootPath = findApiRootPath();
    const envBeforeConfigLoad = { ...process.env };
    const config = await loadConfig(rootPath);

    try {
      // 병렬 테스트가 비활성화된 경우 아무것도 하지 않음
      if (!config.test?.parallel) {
        return async function teardown() {
          // no-op
        };
      }

      const maxWorkers = config.test.maxWorkers ?? 4;
      const dbConfig = DB.generateDBConfig(config.database, config.projectName);
      const testConnection = postgresConnectionSchema.parse(dbConfig.test.connection);
      const templateDb = testConnection.database;

      const adminConnection = {
        ...testConnection,
        database: "postgres",
      };

      const connectionConfig = {
        client: config.database.database ?? ("pg" as const),
        connection: adminConnection,
      };

      const manager = new ParallelDBManager(maxWorkers, connectionConfig, templateDb);
      await manager.createWorkerDatabases();

      return async function teardown() {
        await manager.dropWorkerDatabases();
      };
    } finally {
      restoreProcessEnv(envBeforeConfigLoad);
    }
  };
}

/**
 * 기본 globalSetup 함수입니다.
 * sonamu.config.ts의 test 설정을 읽어서 병렬 테스트 환경을 구성합니다.
 *
 * @example
 * ```typescript
 * // src/testing/global.ts
 * export { setup } from "sonamu/test";
 * ```
 */
export const setup = createGlobalSetup();
