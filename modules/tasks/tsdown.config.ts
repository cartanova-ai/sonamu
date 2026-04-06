import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    index: "src/index.ts",
    internal: "src/internal.ts",
  },
  format: "esm",
  platform: "node",
  sourcemap: true,
  target: "esnext",
  unbundle: true,
});
