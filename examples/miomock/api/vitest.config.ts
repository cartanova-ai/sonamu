import { NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";
import { PrioritySequencer } from "./custom-sequencer";

const maxWorkers = 4;

export default defineConfig({
  plugins: [],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts", "**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts"],
    sequence: {
      sequencer: PrioritySequencer,
    },
    reporters: ["default", NaiteVitestReporter],
    restoreMocks: true,
    pool: "forks",
    maxWorkers,
    isolate: false,
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
