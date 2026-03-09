import chalk from "chalk";
import type { CddProject, SpecStatus } from "../core/types.js";
import { formatStatus } from "../utils/format.js";

export function runStatus(project: CddProject): void {
  const contractCount = project.contracts.length;
  const specCount = project.specs.length;

  const statusCounts: Record<SpecStatus, number> = { draft: 0, "in-progress": 0, done: 0 };
  let totalRevisions = 0;
  let totalFeatures = 0;

  for (const spec of project.specs) {
    statusCounts[spec.document.status]++;
    for (const rev of spec.document.revisions) {
      totalRevisions++;
      totalFeatures += rev.features.length;
    }
  }

  console.log(chalk.bold("CDD Project Status"));
  console.log();
  console.log(`  Contracts:  ${chalk.white(String(contractCount))}`);
  console.log(`  Specs:      ${chalk.white(String(specCount))}`);
  console.log();
  console.log(chalk.bold("  Status Breakdown:"));
  console.log(`    ${formatStatus("done")}:         ${statusCounts.done}`);
  console.log(`    ${formatStatus("in-progress")}:  ${statusCounts["in-progress"]}`);
  console.log(`    ${formatStatus("draft")}:        ${statusCounts.draft}`);
  console.log();
  console.log(`  Revisions:  ${totalRevisions}`);
  console.log(`  Features:   ${totalFeatures}`);
}
