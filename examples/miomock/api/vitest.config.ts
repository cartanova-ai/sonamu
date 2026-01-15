import { NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";

const maxWorkers = 4;

export default defineConfig({
  plugins: [],
  test: {
    // migrator, syncer 등 오래 걸리는 테스트를 먼저 시작하여 병렬화 효율을 높입니다.
    include: ["src/**/migrator*.test.ts", "src/**/syncer*.test.ts", "src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts", "**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
    pool: "forks",
    maxWorkers,
    isolate: false, // worker 재사용 → 초기화 오버헤드 감소
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
    env: {
      SONAMU_PARALLEL_TEST: "true",
    },
  },
});
