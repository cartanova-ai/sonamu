// tsup.config.js
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["node/index.ts"],
  dts: true,
  format: ["cjs"],
  target: "es2020",
  clean: true,
  sourcemap: true,
  shims: true,
  platform: "node",
  splitting: true,
});
