import chalk from "chalk";
import type { CddProject, ContractNode, SpecNode } from "../core/types.js";
import { formatStatus } from "../utils/format.js";

export function runTree(project: CddProject): void {
  const domains = collectDomains(project);

  for (const domain of domains) {
    const label = domain === "" ? "(root)" : domain;
    console.log(chalk.bold.cyan(label));

    const contracts = project.contracts
      .filter((c) => c.domain === domain)
      .sort((a, b) => a.basename.localeCompare(b.basename));

    const specs = project.specs
      .filter((s) => s.domain === domain)
      .sort((a, b) => a.basename.localeCompare(b.basename));

    const items: { line: string }[] = [];

    for (const c of contracts) {
      items.push({ line: formatContractLine(c) });
    }
    for (const s of specs) {
      items.push({ line: formatSpecLine(s) });
    }

    for (let i = 0; i < items.length; i++) {
      const connector = i === items.length - 1 ? "└── " : "├── ";
      console.log(`  ${connector}${items[i].line}`);
    }

    console.log();
  }
}

function formatContractLine(c: ContractNode): string {
  return `${chalk.white(c.basename)}.contract.json`;
}

function formatSpecLine(s: SpecNode): string {
  const status = formatStatus(s.document.status);
  return `${chalk.white(s.basename)}.spec.json [${status}]`;
}

function collectDomains(project: CddProject): string[] {
  const domainSet = new Set<string>();
  for (const c of project.contracts) domainSet.add(c.domain);
  for (const s of project.specs) domainSet.add(s.domain);
  return [...domainSet].sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });
}
