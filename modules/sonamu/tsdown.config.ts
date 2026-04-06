import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: {
    "ai/index": "src/ai/index.ts",
    "ai/providers/rtzr/index": "src/ai/providers/rtzr/index.ts",
    "auth/plugins/index": "src/auth/plugins/index.ts",
    "bin/cli": "src/bin/cli.ts",
    "bin/hmr-hook-register": "src/bin/hmr-hook-register.ts",
    "bin/ts-loader-register": "src/bin/ts-loader-register.ts",
    "cache/index": "src/cache/index.ts",
    "dict/index": "src/dict/index.ts",
    "filter/index": "src/filter/index.ts",
    index: "src/index.ts",
    "ssr/index": "src/ssr/index.ts",
    "storage/index": "src/storage/index.ts",
    "testing/index": "src/testing/index.ts",
    "ui/cdd-types": "src/ui/cdd-types.ts",
    "vector/index": "src/vector/index.ts",
  },
  format: "esm",
  platform: "node",
  sourcemap: "inline",
  target: "esnext",
  unbundle: true,
});
