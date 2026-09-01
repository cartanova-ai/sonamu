import { readdirSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "tsdown";

const migrationsDir = path.join(import.meta.dirname, "src/database/migrations");
const migrationEntries = Object.fromEntries(
  readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".ts"))
    .map((filename) => [
      `database/migrations/${filename.replace(/\.ts$/, "")}`,
      `src/database/migrations/${filename}`,
    ]),
);

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    index: "src/index.ts",
    internal: "src/internal.ts",
    ...migrationEntries,
  },
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: true,
  target: "esnext",
  unbundle: true,
});
