import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const OPENSEARCH_PATTERN = /opensearch/i;

const DependencyMap = z.record(z.string(), z.string());
const Manifest = z.object({
  name: z.string().optional(),
  dependencies: DependencyMap.optional(),
  devDependencies: DependencyMap.optional(),
  optionalDependencies: DependencyMap.optional(),
  peerDependencies: DependencyMap.optional(),
});
type Manifest = z.infer<typeof Manifest>;

function readManifest(directory: string): Manifest {
  return Manifest.parse(JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")));
}

// Dependencies a default install pulls in; pnpm auto-installs peers, so they count.
function installedDependencyNames(manifest: Manifest): string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

// Resolves a package directory through parent node_modules as Node does.
function resolvePackageDirectory(fromDirectory: string, name: string): string | undefined {
  let current = fromDirectory;
  for (;;) {
    if (path.basename(current) !== "node_modules") {
      const candidate = path.join(current, "node_modules", name);
      if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

interface DependencyGraph {
  names: Set<string>;
  // Package directories actually visited.
  packages: number;
}

// Walks the installed production dependency graph of the root packages to the end.
function walkDependencyGraph(rootDirectories: readonly string[]): DependencyGraph {
  const names = new Set<string>();
  const visited = new Set<string>();
  const queue = rootDirectories.map((directory) => realpathSync(directory));
  while (queue.length > 0) {
    const directory = queue.pop();
    if (directory === undefined || visited.has(directory)) continue;
    visited.add(directory);
    for (const name of installedDependencyNames(readManifest(directory))) {
      // Uninstalled optional peers are still checked by name.
      names.add(name);
      const resolved = resolvePackageDirectory(directory, name);
      if (resolved !== undefined && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return { names, packages: visited.size };
}

function workspacePackageDirectories(): Map<string, string> {
  const modulesDirectory = path.join(REPO_ROOT, "modules");
  const byName = new Map<string, string>();
  for (const entry of readdirSync(modulesDirectory, { withFileTypes: true })) {
    const directory = path.join(modulesDirectory, entry.name);
    if (!entry.isDirectory() || !existsSync(path.join(directory, "package.json"))) continue;
    const { name } = readManifest(directory);
    if (name !== undefined) byName.set(name, directory);
  }
  return byName;
}

function templateManifestDirectories(): string[] {
  const templateRoot = path.join(REPO_ROOT, "modules/create-sonamu/template/src");
  return [
    templateRoot,
    path.join(templateRoot, "packages/api"),
    path.join(templateRoot, "packages/web"),
  ];
}

describe("의존성 경계", () => {
  it("sonamu와 create-sonamu 템플릿의 의존성 그래프에 OpenSearch가 없다", () => {
    const workspace = workspacePackageDirectories();
    const roots = ["sonamu", "create-sonamu", "@sonamu-kit/cli"].map((name) => {
      const directory = workspace.get(name);
      expect(directory, name).toBeDefined();
      return directory ?? "";
    });

    // A generated project installs the template's devDependencies too.
    const templateNames: string[] = [];
    for (const directory of templateManifestDirectories()) {
      const manifest = readManifest(directory);
      templateNames.push(
        ...installedDependencyNames(manifest),
        ...Object.keys(manifest.devDependencies ?? {}),
      );
    }
    expect(templateNames).toContain("sonamu");
    expect(templateNames.filter((name) => OPENSEARCH_PATTERN.test(name))).toEqual([]);

    // Workspace packages the template references are roots as well.
    for (const name of templateNames) {
      const directory = workspace.get(name);
      if (directory !== undefined) roots.push(directory);
    }

    const graph = walkDependencyGraph(roots);
    // Positive control: the walk really followed the graph.
    expect(graph.names).toContain("knex");
    expect(graph.packages).toBeGreaterThan(100);
    expect([...graph.names].filter((name) => OPENSEARCH_PATTERN.test(name))).toEqual([]);
    expect(graph.names).not.toContain("@sonamu-kit/opensearch");
  });

  it("런타임 import 경계: SDK, knex, pg는 어디서도, sonamu는 src/sonamu 밖에서 import하지 않는다", () => {
    const sourceRoot = path.join(PACKAGE_ROOT, "src");
    const files = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(sourceRoot, file));
    expect(files.length).toBeGreaterThanOrEqual(7);

    const violations: string[] = [];
    let relativeImports = 0;
    for (const file of files) {
      const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
      for (const specifier of runtimeImportSpecifiers(readFileSync(file, "utf8"))) {
        if (specifier.startsWith(".")) relativeImports += 1;
        const isSdk =
          specifier === "@opensearch-project/opensearch" ||
          specifier.startsWith("@opensearch-project/opensearch/");
        const isDatabase = ["knex", "pg"].includes(specifier) || /^(knex|pg)\//.test(specifier);
        const isSonamu = specifier === "sonamu" || specifier.startsWith("sonamu/");
        if (isSdk || isDatabase || (isSonamu && !relative.startsWith("sonamu/"))) {
          violations.push(`${relative} -> ${specifier}`);
        }
      }
    }
    // Positive control: the scanner really reads imports.
    expect(relativeImports).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("타입 전용 import까지 포함해 sonamu는 src/sonamu 밖에서 참조하지 않는다", () => {
    // sonamu is an optional peer: a .d.ts of another entry point needing its types would not compile without it.
    const sourceRoot = path.join(PACKAGE_ROOT, "src");
    const pattern = /(?:from\s*|import\s*\(\s*|import\s+)["']sonamu(?:\/[^"']*)?["']/;
    const outside: string[] = [];
    let inside = 0;
    for (const file of readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith(".ts")) continue;
      const relative = file.split(path.sep).join("/");
      if (!pattern.test(readFileSync(path.join(sourceRoot, file), "utf8"))) continue;
      if (relative.startsWith("sonamu/")) inside += 1;
      else outside.push(relative);
    }
    // Positive control: the pattern matches real imports.
    expect(inside).toBeGreaterThan(0);
    expect(outside).toEqual([]);
  });

  it("런타임 import 스캐너는 타입 전용 import를 제외하고 나머지를 모두 잡는다", () => {
    const source = [
      'import type { Knex } from "knex";',
      'import { type Client, type API } from "@opensearch-project/opensearch";',
      'export type { Foo } from "sonamu";',
      'import { DB } from "sonamu";',
      'import { type A, B } from "pg";',
      'import "side-effect";',
      'export * from "./errors";',
      'const lazy = await import("dynamic-target");',
      'import {\n  multi,\n  line,\n} from "multi-line";',
    ].join("\n");
    expect(runtimeImportSpecifiers(source).toSorted()).toEqual(
      ["./errors", "dynamic-target", "multi-line", "pg", "side-effect", "sonamu"].toSorted(),
    );
  });
});

// Import and export specifiers that survive compilation; TypeScript erases `import type`, `export type` and
// imports whose members are all `type`.
function runtimeImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticPattern = /^\s*(import|export)\s+([^;]*?)\s*from\s*["']([^"']+)["']/gm;
  for (const match of source.matchAll(staticPattern)) {
    const clause = match[2] ?? "";
    const specifier = match[3] ?? "";
    if (/^type\s/.test(clause)) continue;
    const braced = /^\{([^}]*)\}$/.exec(clause.trim());
    if (braced !== null) {
      const members = (braced[1] ?? "")
        .split(",")
        .map((member) => member.trim())
        .filter((member) => member.length > 0);
      if (members.length > 0 && members.every((member) => /^type\s/.test(member))) continue;
    }
    specifiers.push(specifier);
  }
  for (const match of source.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) {
    specifiers.push(match[1] ?? "");
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specifiers.push(match[1] ?? "");
  }
  return specifiers;
}
