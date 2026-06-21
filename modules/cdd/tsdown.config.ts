import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    index: "src/index.ts",
    lib: "src/lib.ts",
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: "inline",
  target: "esnext",
  unbundle: true,
});
