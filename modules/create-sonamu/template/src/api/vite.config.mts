import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    environment: "node",
  },
});
