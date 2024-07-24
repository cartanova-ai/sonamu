// tsup.config.js
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin/cli.ts", "src/bin/cli-wrapper.ts"],
  dts: true,
  format: ["esm", "cjs"],
  target: "es2020",
  clean: true,
  sourcemap: true,
  shims: true,
  platform: "node",
  splitting: true,
  banner(ctx) {
    if (ctx.format === "esm") {
      return {
        js: `const require = (await import('module')).createRequire(import.meta.url);`,
      };
    }
  },
  external: [
    "zod",
    "fastify",
    "inflection",
    "source-map-support",
    "typescript",
    "prettier",
  ],
});
