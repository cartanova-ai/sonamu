import type { ViteUserConfig } from "vitest/config";
import { loadConfig } from "../api/config";

type VitestConfig = ViteUserConfig["test"];

/**
 * sonamu.config.ts의 test 설정을 기반으로 vitest 테스트 설정을 반환합니다.
 *
 * @example
 * ```typescript
 * // vitest.config.ts
 * import { getSonamuTestConfig } from "sonamu/test";
 * import { defineConfig } from "vitest/config";
 *
 * export default defineConfig(async () => ({
 *   test: await getSonamuTestConfig({
 *     setupFiles: ["./src/testing/setup-mocks.ts"],
 *   }),
 * }));
 * ```
 */
export async function getSonamuTestConfig(options?: VitestConfig): Promise<VitestConfig> {
  const { findApiRootPath } = await import("../utils/utils");
  const config = await loadConfig(findApiRootPath());

  const isParallel = config.test?.parallel ?? false;
  const maxWorkers = config.test?.maxWorkers ?? 4;

  if (isParallel) {
    return {
      pool: "forks",
      maxWorkers,
      isolate: false,
      env: {
        SONAMU_WORKER_DB: "true",
      },
      ...options,
    };
  }

  return options;
}
