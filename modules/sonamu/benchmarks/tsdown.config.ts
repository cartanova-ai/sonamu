import path from "node:path";

import { defineConfig } from "tsdown";
import zodCompiler from "zod-compiler/rolldown";

const entry = path.resolve(import.meta.dirname, "http-validator.bench.ts");
const aotEntry = path.resolve(import.meta.dirname, "http-validator-aot.bench.ts");

export default defineConfig({
  clean: true,
  dts: false,
  entry: [entry],
  format: "esm",
  outDir: path.resolve(import.meta.dirname, "dist"),
  outputOptions: {
    chunkFileNames: "[name].mjs",
  },
  platform: "node",
  plugins: [
    zodCompiler({
      codegenMode: "inline",
      include: [aotEntry],
      output: "compact",
      schemas: "explicit",
    }),
  ],
  sourcemap: false,
  target: "esnext",
});
