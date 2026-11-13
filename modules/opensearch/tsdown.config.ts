import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    index: "src/index.ts",
    "postgres/index": "src/postgres/index.ts",
    "sonamu/index": "src/sonamu/index.ts",
    "admin/index": "src/admin/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: true,
  target: "esnext",
  unbundle: true,
});
