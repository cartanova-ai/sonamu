import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
        isolate: false,
      },
    },
    environment: "node",
  },
});
