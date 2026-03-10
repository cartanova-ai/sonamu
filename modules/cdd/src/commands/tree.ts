import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import { formatStatus } from "../utils/format.js";
import type { OutputResult } from "../utils/output.js";

export function runTree(project: CddProject): OutputResult {
  const domains = collectDomains(project);

  const data = domains.map((domain) => {
    const contracts = project.contracts
      .filter((c) => c.domain === domain)
      .sort((a, b) => a.basename.localeCompare(b.basename))
      .map((c) => ({ type: "contract" as const, basename: c.basename }));

    const specs = project.specs
      .filter((s) => s.domain === domain)
      .sort((a, b) => a.basename.localeCompare(b.basename))
      .map((s) => ({ type: "spec" as const, basename: s.basename, status: s.document.status }));

    return { domain, items: [...contracts, ...specs] };
  });

  return {
    data,
    pretty() {
      for (const { domain, items } of data) {
        const label = domain === "" ? "(root)" : domain;
        console.log(chalk.bold.cyan(label));

        for (let i = 0; i < items.length; i++) {
          const connector = i === items.length - 1 ? "└── " : "├── ";
          const item = items[i];
          const line =
            item.type === "contract"
              ? `${chalk.white(item.basename)}.contract.json`
              : `${chalk.white(item.basename)}.spec.json [${formatStatus(item.status)}]`;
          console.log(`  ${connector}${line}`);
        }

        console.log();
      }
    },
  };
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
