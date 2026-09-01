import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const srcRoot = path.resolve(process.cwd(), "src");
const ignoredSuffixes = [".test.ts", ".test-hold.ts", ".ignore.ts", ".d.ts"];
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

export default {
  clean: true,
  deps: {
    neverBundle: [/^sonamu(?:\/.*)?$/],
  },
  dts: false,
  entry: await collectEntries(srcRoot),
  fixedExtension: false,
  format: "esm",
  outDir: path.resolve(process.cwd(), "dist"),
  platform: "node",
  sourcemap: "inline",
  target: "esnext",
  treeshake: false,
  unbundle: true,
};
