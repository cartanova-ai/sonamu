import fs from "node:fs";
import path from "node:path";

import chalk from "chalk";

import { findWorkspaceRoot } from "../utils/workspace.js";

const CONTRACT_TEMPLATES = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "contract-templates",
);

function writeIfAbsent(filePath: string, sourcePath: string, force: boolean): void {
  const name = path.relative(process.cwd(), filePath);
  if (fs.existsSync(filePath) && !force) {
    console.log(chalk.dim(`⏭ ${name} already exists (preserved)`));
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.copyFileSync(sourcePath, filePath);
  console.log(chalk.green(`✓ ${name}`));
}

export function runContractInit(force: boolean): void {
  const workspaceRoot = findWorkspaceRoot();
  const contractDir = path.join(workspaceRoot, "contract");

  fs.mkdirSync(contractDir, { recursive: true });

  writeIfAbsent(
    path.join(contractDir, "planning.md"),
    path.join(CONTRACT_TEMPLATES, "planning.md"),
    force,
  );

  console.log(chalk.cyan("\n  contract init complete."));
  console.log(chalk.dim("  Next: write contract/{domain}/{domain}.contract.md for each domain."));
  console.log(
    chalk.dim("  Tip: add contract/rules/*.known-issues.json when recurring issues are found."),
  );
}
