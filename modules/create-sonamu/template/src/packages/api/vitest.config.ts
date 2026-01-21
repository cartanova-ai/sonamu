import { getSonamuTestConfig, NaiteVitestReporter } from "sonamu/test";
import { defineConfig } from "vitest/config";
import { PrioritySequencer } from "./custom-sequencer";

export default defineConfig(async () => ({
  plugins: [],
  test: await getSonamuTestConfig({
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
    server: {
      deps: {
        inline: ["sonamu"],
      },
    },
  }),
}));
