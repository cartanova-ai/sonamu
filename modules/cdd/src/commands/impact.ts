import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import { formatPath } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSourcePath } from "../utils/resolve.js";

export function runImpact(file: string | undefined, project: CddProject): OutputResult {
  if (!file) {
    console.error("파일 경로를 지정하세요: cdd impact <file>");
    process.exit(1);
  }

  const sourcePath = resolveSourcePath(file, project);

  const directSpecs = project.specs.filter((s) =>
    s.document.sources.some((src) => src === sourcePath),
  );

  const chainContractPaths = new Set<string>();
  for (const spec of directSpecs) {
    for (const rc of spec.resolvedContracts) {
      chainContractPaths.add(rc);
    }
  }

  const directSpecPaths = new Set(directSpecs.map((s) => s.path));
  const dependsOnPaths = new Set<string>();
  for (const spec of directSpecs) {
    for (const dep of spec.resolvedDependsOnSpecs) {
      if (!directSpecPaths.has(dep)) {
        dependsOnPaths.add(dep);
      }
    }
  }
  const dependsOnSpecs = project.specs.filter((s) => dependsOnPaths.has(s.path));

  const data = {
    source: sourcePath,
    directSpecs: directSpecs.map((s) => formatPath(s.path, project.projectRoot)),
    chainContracts: [...chainContractPaths].sort().map((p) => formatPath(p, project.projectRoot)),
    dependsOnSpecs: dependsOnSpecs.map((s) => formatPath(s.path, project.projectRoot)),
  };

  return {
    data,
    pretty() {
      console.log(chalk.bold(`Impact analysis: ${sourcePath}`));
      console.log();
      printSection("Direct Specs", directSpecs, project);
      printContractPaths("Chain Contracts", chainContractPaths, project);
      printSection("Depends On Specs", dependsOnSpecs, project);
    },
  };
}

function printSection(title: string, nodes: { path: string }[], project: CddProject): void {
  console.log(chalk.bold(`${title}:`));
  if (nodes.length === 0) {
    console.log("  (none)");
  } else {
    for (const n of nodes) {
      console.log(`  - ${formatPath(n.path, project.projectRoot)}`);
    }
  }
  console.log();
}

function printContractPaths(title: string, paths: Set<string>, project: CddProject): void {
  console.log(chalk.bold(`${title}:`));
  if (paths.size === 0) {
    console.log("  (none)");
  } else {
    for (const p of [...paths].sort()) {
      console.log(`  - ${formatPath(p, project.projectRoot)}`);
    }
  }
  console.log();
}
