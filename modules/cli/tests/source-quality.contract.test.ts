import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const sourceRoots = ["modules/cli/src", "modules/sonamu/src/tooling"] as const;
const sourceFiles = [
  "modules/create-sonamu/scripts/prepublish.mjs",
  "modules/sonamu/src/bin/fixture.ts",
  "modules/sonamu/src/testing/fixture-manager.ts",
  "modules/sonamu/tsdown.api.config.ts",
  "modules/sonamu/tsdown.config.ts",
] as const;

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(target);
      return /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) ? [target] : [];
    }),
  );
  return files.flat();
}

async function implementationSources(): Promise<Array<{ file: string; source: string }>> {
  const discovered = await Promise.all(
    sourceRoots.map((root) => collectSourceFiles(path.join(repositoryRoot, root))),
  );
  const files = [
    ...discovered.flat(),
    ...sourceFiles.map((file) => path.join(repositoryRoot, file)),
  ];
  return Promise.all(
    files.map(async (file) => ({
      file: path.relative(repositoryRoot, file),
      source: await readFile(file, "utf8"),
    })),
  );
}

describe("SON-535 소스 품질", () => {
  it("lint 억제나 정적 분석 우회 표식을 포함하지 않는다", async () => {
    const separator = "-";
    const forbidden = [
      ["oxlint", "disable"].join(separator),
      ["eslint", "disable"].join(separator),
      ["biome", "ignore"].join(separator),
      ["no", "semgrep"].join(""),
      ["ts", "ignore"].join(separator),
      ["ts", "expect", "error"].join(separator),
    ];

    for (const { file, source } of await implementationSources()) {
      expect(
        forbidden.filter((marker) => source.includes(marker)),
        file,
      ).toEqual([]);
    }
  });

  it("Node.js blocking sync API를 사용하지 않는다", async () => {
    const suffix = ["S", "y", "n", "c"].join("");
    const prefixes = [
      "exec",
      "execFile",
      "spawn",
      "readFile",
      "writeFile",
      "appendFile",
      "readdir",
      "stat",
      "lstat",
      "exists",
      "access",
      "mkdir",
      "rm",
      "unlink",
      "rename",
      "copyFile",
      "open",
      "close",
      "realpath",
    ];
    const blockingApi = new RegExp(`\\b(?:${prefixes.join("|")})${suffix}\\b`, "g");

    for (const { file, source } of await implementationSources()) {
      expect(source.match(blockingApi) ?? [], file).toEqual([]);
    }
  });
});
