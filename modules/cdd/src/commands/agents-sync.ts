import fs from "node:fs";
import path from "node:path";

import chalk from "chalk";

import { findWorkspaceRoot } from "../utils/workspace.js";

// cdd 패키지가 단독으로 소유하는 서브디렉토리만 sync 대상으로 한다.
// skills/는 다른 패키지(sonamu 등)도 하위 폴더를 관리하므로 skills/cdd만 대상으로 한다.
const SYNC_TARGETS = ["agents", "workflow", "skills/cdd"];

export function runAgentsSync(dryRun: boolean): void {
  const workspaceRoot = findWorkspaceRoot();
  const sourceBase = path.resolve(import.meta.dirname, "..", "..", "src", "agents");

  if (!fs.existsSync(sourceBase)) {
    console.error(chalk.red("✗ Agents source not found in cdd package."));
    return;
  }

  const agentsDir = path.join(workspaceRoot, ".agents");
  if (!fs.existsSync(agentsDir)) {
    console.log(chalk.yellow("⚠ .agents/ not found. Run 'cdd agents init' first."));
    return;
  }

  let updatedCount = 0;

  for (const target of SYNC_TARGETS) {
    const src = path.join(sourceBase, target);
    const dest = path.join(agentsDir, target);

    if (!fs.existsSync(src)) {
      console.log(chalk.yellow(`⚠ .agents/${target}/ skipped (source not found in cdd package)`));
      continue;
    }

    if (dryRun) {
      console.log(chalk.dim(`  [dry-run] would update .agents/${target}/`));
      updatedCount++;
      continue;
    }

    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    console.log(chalk.green(`✓ .agents/${target}/ updated`));
    updatedCount++;
  }

  if (dryRun) {
    console.log(chalk.cyan(`\n  [dry-run] ${updatedCount} directories would be updated.`));
  } else {
    console.log(chalk.cyan(`\n  agents sync complete. ${updatedCount} directories updated.`));
  }
}
