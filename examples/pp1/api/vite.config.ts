import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    threads: false,
    globals: true,
    globalSetup: ["./src/testing/global.ts"],
  },
});
