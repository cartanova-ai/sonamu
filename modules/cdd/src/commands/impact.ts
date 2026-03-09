import path from "node:path";
import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import { formatPath } from "../utils/format.js";

export function runImpact(file: string | undefined, project: CddProject): void {
  if (!file) {
    console.error("파일 경로를 지정하세요: cdd impact <file>");
    process.exit(1);
  }

  const resolvedFile = path.resolve(project.projectRoot, file);
  const relFile = path.relative(project.projectRoot, resolvedFile);

  // 1. 직접 영향 Spec: sources에 해당 파일이 포함된 Spec
  const directSpecs = project.specs.filter((s) =>
    s.document.sources.some((src) => path.resolve(project.projectRoot, src) === resolvedFile),
  );

  // 2. 체인 영향 Contract: 직접 영향 Spec이 참조하는 Contract
  const chainContractPaths = new Set<string>();
  for (const spec of directSpecs) {
    for (const rc of spec.resolvedContracts) {
      chainContractPaths.add(rc);
    }
  }

  // 3. 간접 영향 Spec: 체인 Contract를 공유하는 다른 Spec
  const directSpecPaths = new Set(directSpecs.map((s) => s.path));
  const indirectSpecs = project.specs.filter(
    (s) =>
      !directSpecPaths.has(s.path) && s.resolvedContracts.some((rc) => chainContractPaths.has(rc)),
  );

  console.log(chalk.bold(`Impact analysis: ${relFile}`));
  console.log();

  console.log(chalk.bold("Direct Specs:"));
  if (directSpecs.length === 0) {
    console.log("  (none)");
  } else {
    for (const s of directSpecs) {
      console.log(`  - ${formatPath(s.path, project.projectRoot)}`);
    }
  }
  console.log();

  console.log(chalk.bold("Chain Contracts:"));
  if (chainContractPaths.size === 0) {
    console.log("  (none)");
  } else {
    for (const cp of [...chainContractPaths].sort()) {
      console.log(`  - ${formatPath(cp, project.projectRoot)}`);
    }
  }
  console.log();

  console.log(chalk.bold("Indirect Specs:"));
  if (indirectSpecs.length === 0) {
    console.log("  (none)");
  } else {
    for (const s of indirectSpecs) {
      console.log(`  - ${formatPath(s.path, project.projectRoot)}`);
    }
  }
}
