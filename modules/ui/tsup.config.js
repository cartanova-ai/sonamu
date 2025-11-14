// tsup.config.js
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["node/index.ts"],
  dts: true,
  format: ["esm"],
  target: "esnext",
  clean: true,
  sourcemap: true,
  shims: true,
  platform: "node",
  splitting: true,
});
