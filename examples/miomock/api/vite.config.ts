import { defineConfig } from "vitest/config";
import NaiteVitestReporter from "./src/testing/naite-vitest-reporter";

export default defineConfig({
  plugins: [],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts", "**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    setupFiles: ["./src/testing/setup-mocks.ts", "./src/testing/setup-naite-trace.ts"],
    reporters: ["default", NaiteVitestReporter],
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
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
    includeTaskLocation: true
  },
});
