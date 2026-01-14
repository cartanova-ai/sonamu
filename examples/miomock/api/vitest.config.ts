import { NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

// CPU 코어 수 기반 worker 수 결정 (최소 1, 최대 코어 수의 절반)
const maxWorkers = 4;

export default defineConfig({
  plugins: [],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts", "**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    pool: "forks",
    maxWorkers,
    isolate: true,
    restoreMocks: true,
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.json",
      include: ["src/**/*type-safety.test.ts"],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/testing/**", "**/node_modules/**", "**/dist/**"],
    },
    includeTaskLocation: true,
    // 병렬 테스트 환경변수를 worker에 전달
    env: {
      SONAMU_PARALLEL_TEST: maxWorkers > 1 ? "true" : "false",
    },
  },
});
