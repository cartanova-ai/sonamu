import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts", "**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    maxWorkers: 4,
    maxConcurrency: 3,
    setupFiles: ["src/testing/vitest-setup.ts"],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs", ".cjs", ".mts", ".cts"],
  },
});
