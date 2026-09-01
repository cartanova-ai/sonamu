import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { defineConfig } from "tsdown";

const srcRoot = path.resolve(import.meta.dirname, "src");
const ignoredSuffixes = [".test.ts", ".test-d.ts", ".test-hold.ts", ".ignore.ts", ".d.ts"];
const ignoredDirectories = new Set(["__mocks__", "_templates", "wasted_src"]);
interface BuildEntries {
  [entryName: string]: string;
}

async function collectEntries(directory: string): Promise<BuildEntries> {
  const entries: BuildEntries = {};

  for (const entry of await readdir(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const absolutePath = path.join(directory, entry);
    const stats = await stat(absolutePath);

    if (stats.isDirectory()) {
      Object.assign(entries, await collectEntries(absolutePath));
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

async function createBuildEntries(): Promise<BuildEntries> {
  const entries = await collectEntries(srcRoot);
  const apiConfigEntryName = "tsdown.api.config";

  // 패키지 루트 설정이 src 엔트리와 같은 출력 경로를 덮어쓰지 않게 합니다.
  if (apiConfigEntryName in entries) {
    throw new Error(`tsdown entry collision: ${apiConfigEntryName}`);
  }
  entries[apiConfigEntryName] = path.resolve(import.meta.dirname, "tsdown.api.config.ts");
  return entries;
}

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: [/^tsdown(?:\/.*)?$/],
  },
  dts: false,
  entry: await createBuildEntries(),
  fixedExtension: false,
  format: "esm",
  platform: "node",
  sourcemap: "inline",
  target: "esnext",
  treeshake: false,
  unbundle: true,
});
