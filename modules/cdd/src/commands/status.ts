import path from "node:path";
import chalk from "chalk";
import type { CddProject, SpecStatus } from "../core/types.js";
import { VALID_STATUSES } from "../core/types.js";
import type { OutputResult } from "../utils/output.js";
import { resolveFile } from "../utils/resolve.js";

const STATUS_COLORS: Record<SpecStatus, (s: string) => string> = {
  draft: chalk.gray,
  specifying: chalk.blue,
  implementing: chalk.yellow,
  validating: chalk.magenta,
  done: chalk.green,
};

function formatStatus(status: SpecStatus): string {
  const colorFn = STATUS_COLORS[status] ?? chalk.white;
  return colorFn(status);
}

function formatPath(absPath: string, projectRoot: string): string {
  return path.relative(projectRoot, absPath);
}

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
      console.error("소스 파일의 상태는 지원하지 않습니다.");
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

  for (const spec of project.specs) {
    if (spec.document.status in statusCounts) {
      statusCounts[spec.document.status]++;
    }
  }

  const data = {
    contracts: contractCount,
    specs: specCount,
    statusBreakdown: statusCounts,
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
    },
  };
}

function runSpecStatus(
  spec: {
    path: string;
    document: { summary: string; status: string };
    resolvedContracts: string[];
    resolvedDependsOnSpecs: string[];
  },
  project: CddProject,
): OutputResult {
  const relFile = formatPath(spec.path, project.projectRoot);

  const data = {
    path: relFile,
    summary: spec.document.summary,
    status: spec.document.status,
  };

  return {
    data,
    pretty() {
      console.log(chalk.bold(`Spec: ${relFile}`));
      console.log(`  summary:  ${spec.document.summary}`);
      console.log(`  status:   ${formatStatus(spec.document.status as SpecStatus)}`);
    },
  };
}

function runContractStatus(contract: { path: string }, project: CddProject): OutputResult {
  const relFile = formatPath(contract.path, project.projectRoot);
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
      if (referencingSpecs.length === 0) {
        console.log("  Referencing Specs: (none)");
      } else {
        console.log("  Referencing Specs:");
        for (const s of referencingSpecs) {
          console.log(`    - ${formatPath(s.path, project.projectRoot)}`);
        }
      }
    },
  };
}
