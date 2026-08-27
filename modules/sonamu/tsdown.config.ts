import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "tsdown";

const srcRoot = path.resolve(import.meta.dirname, "src");
const ignoredSuffixes = [".test.ts", ".test-d.ts", ".test-hold.ts", ".ignore.ts", ".d.ts"];
const ignoredDirectories = new Set(["__mocks__", "_templates", "wasted_src"]);
interface BuildEntries {
  [entryName: string]: string;
}

function collectEntries(directory: string): BuildEntries {
  const entries: BuildEntries = {};

  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      Object.assign(entries, collectEntries(absolutePath));
      continue;
    }

    if (
      !absolutePath.endsWith(".ts") ||
      ignoredSuffixes.some((suffix) => absolutePath.endsWith(suffix))
    ) {
      continue;
    }

    const relativePath = path.relative(srcRoot, absolutePath);
    const entryName = relativePath.replace(/\.ts$/, "").split(path.sep).join("/");
    entries[entryName] = absolutePath;
  }

  return entries;
}

export default defineConfig({
  clean: true,
  dts: false,
  entry: collectEntries(srcRoot),
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: "inline",
  target: "esnext",
  treeshake: false,
  unbundle: true,
});
