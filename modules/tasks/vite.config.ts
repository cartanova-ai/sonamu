import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.test-hold.ts", "**/node_modules/**", "**/.yarn/**", "**/dist/**"],
    pool: "forks",
    maxWorkers: 2,
    isolate: true,
    restoreMocks: true,
  },
});
