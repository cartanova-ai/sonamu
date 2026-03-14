import path from "node:path";
import chalk from "chalk";
import type { CddProject, SpecStatus } from "../core/types.js";
import { VALID_STATUSES } from "../core/types.js";
import { formatPath, formatStatus } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";
import { resolveFile } from "../utils/resolve.js";

export function runStatus(fileRef: string | undefined, project: CddProject): OutputResult {
  if (!fileRef) {
    return runProjectStatus(project);
  }

  const resolved = resolveFile(fileRef, project);
  switch (resolved.kind) {
    case "spec":
      return runSpecStatus(resolved.node, project);
    case "contract":
      return runContractStatus(resolved.node, project);
    case "source":
      console.error(
        `소스 파일의 상태는 지원하지 않습니다. \`cdd impact ${fileRef}\`를 사용하세요.`,
      );
      process.exit(1);
  }
}

function runProjectStatus(project: CddProject): OutputResult {
  const contractCount = project.contracts.length;
  const specCount = project.specs.length;

  const statusCounts = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0])) as Record<
    SpecStatus,
    number
  >;
  let totalAcceptanceCriteria = 0;
  let specsWithDependencies = 0;

  for (const spec of project.specs) {
    if (spec.document.status in statusCounts) {
      statusCounts[spec.document.status]++;
    }
    totalAcceptanceCriteria += spec.document.acceptanceCriteria.length;
    if (spec.document.dependsOnSpecs && spec.document.dependsOnSpecs.length > 0) {
      specsWithDependencies++;
    }
  }

  const data = {
    contracts: contractCount,
    specs: specCount,
    statusBreakdown: statusCounts,
    acceptanceCriteria: totalAcceptanceCriteria,
    specsWithDependencies,
  };

  return {
    data,
    pretty() {
      console.log(chalk.bold("CDD Project Status"));
      console.log();
      console.log(`  Contracts:  ${chalk.white(String(contractCount))}`);
      console.log(`  Specs:      ${chalk.white(String(specCount))}`);
      console.log();
      console.log(chalk.bold("  Status Breakdown:"));
      console.log(`    ${formatStatus("done")}:          ${statusCounts.done}`);
      console.log(`    ${formatStatus("validating")}:    ${statusCounts.validating}`);
      console.log(`    ${formatStatus("implementing")}: ${statusCounts.implementing}`);
      console.log(`    ${formatStatus("specifying")}:   ${statusCounts.specifying}`);
      console.log(`    ${formatStatus("draft")}:        ${statusCounts.draft}`);
      console.log();
      console.log(`  Acceptance Criteria:  ${totalAcceptanceCriteria}`);
      console.log(`  Specs with deps:     ${specsWithDependencies}`);
    },
  };
}

function runSpecStatus(
  spec: {
    path: string;
    document: { summary: string; status: string; resolvedDependsOnSpecs?: string[] };
    resolvedContracts: string[];
    resolvedDependsOnSpecs: string[];
  },
  project: CddProject,
): OutputResult {
  const relFile = path.relative(project.projectRoot, spec.path);
  const contracts = project.contracts.filter((c) => spec.resolvedContracts.includes(c.path));
  const dependsOn = project.specs.filter(
    (s) => s.path !== spec.path && spec.resolvedDependsOnSpecs.includes(s.path),
  );
  const dependentSpecs = project.specs.filter(
    (s) => s.path !== spec.path && s.resolvedDependsOnSpecs.includes(spec.path),
  );

  const data = {
    path: relFile,
    summary: spec.document.summary,
    status: spec.document.status,
    contracts: contracts.map((c) => formatPath(c.path, project.projectRoot)),
    dependsOn: dependsOn.map((s) => formatPath(s.path, project.projectRoot)),
    dependentSpecs: dependentSpecs.map((s) => formatPath(s.path, project.projectRoot)),
  };

  return {
    data,
    pretty() {
      console.log(chalk.bold(`Spec: ${relFile}`));
      console.log(`  summary:  ${spec.document.summary}`);
      console.log(`  status:   ${formatStatus(spec.document.status as SpecStatus)}`);
      console.log();
      printSection("Contracts", contracts, project);
      printSection("Depends On", dependsOn, project);
      printSection("Dependent Specs", dependentSpecs, project);
    },
  };
}

function runContractStatus(contract: { path: string }, project: CddProject): OutputResult {
  const relFile = path.relative(project.projectRoot, contract.path);
  const referencingSpecs = project.specs.filter((s) => s.resolvedContracts.includes(contract.path));

  const data = {
    path: relFile,
    referencingSpecs: referencingSpecs.map((s) => formatPath(s.path, project.projectRoot)),
  };

  return {
    data,
    pretty() {
      console.log(chalk.bold(`Contract: ${relFile}`));
      console.log();
      printSection("Referencing Specs", referencingSpecs, project);
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
