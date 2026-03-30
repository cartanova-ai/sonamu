import { loadConfig } from "../api/config";
import { ParallelDBManager } from "./parallel-db-manager";

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
    const config = await loadConfig(rootPath);

    // 병렬 테스트가 비활성화된 경우 아무것도 하지 않음
    if (!config.test?.parallel) {
      return async function teardown() {
        // no-op
      };
    }

    const maxWorkers = config.test.maxWorkers ?? 4;
    const templateDb = `${config.database.name}_test`;

    const connectionConfig = {
      client: config.database.database ?? ("pg" as const),
      connection:
        config.database.environments?.test?.connection ?? config.database.defaultOptions.connection,
    };

    const manager = new ParallelDBManager(maxWorkers, connectionConfig, templateDb);
    await manager.createWorkerDatabases();

    return async function teardown() {
      await manager.dropWorkerDatabases();
    };
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
