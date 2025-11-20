import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    include: ["src/**/*.test.ts"],
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
    environment: "node",
  },
  optimizeDeps: {
    include: ["lodash-es", "axios", "uuid"],
  },
});
