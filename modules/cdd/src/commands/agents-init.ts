import fs from "node:fs";
import path from "node:path";

import chalk from "chalk";

import { findWorkspaceRoot } from "../utils/workspace.js";

const MANAGED_DIRS = ["agents", "workflow", "skills/cdd"];

function ensureSymlink(linkPath: string, target: string, force: boolean): void {
  const name = path.basename(linkPath);
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = fs.readlinkSync(linkPath);
      if (current === target && !force) {
        console.log(chalk.dim(`⏭ ${name} symlink already exists (preserved)`));
        return;
      }
      fs.rmSync(linkPath, { force: true });
    } else {
      console.log(chalk.dim(`⏭ ${name} already exists (not a symlink, preserved)`));
      return;
    }
  } catch {
    // 존재하지 않으면 그대로 생성
  }
  try {
    fs.symlinkSync(target, linkPath);
    console.log(chalk.green(`✓ ${name} → ${target} symlink created`));
  } catch (error) {
    console.log(
      chalk.yellow(
        `⚠ Failed to create ${name} symlink: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

export function runAgentsInit(force: boolean): void {
  const workspaceRoot = findWorkspaceRoot();
  const sourceBase = path.resolve(import.meta.dirname, "..", "..", "src", "agents");

  if (!fs.existsSync(sourceBase)) {
    console.error(chalk.red("✗ Agents source not found in cdd package."));
    return;
  }

  const agentsDir = path.join(workspaceRoot, ".agents");
  const agentsMd = path.join(workspaceRoot, "AGENTS.md");
  const claudeLink = path.join(workspaceRoot, ".claude");
  const claudeMdLink = path.join(workspaceRoot, "CLAUDE.md");

  if (!fs.existsSync(agentsDir)) {
    fs.cpSync(sourceBase, agentsDir, { recursive: true });
    fs.rmSync(path.join(agentsDir, "AGENTS.md.template"), { force: true });
    console.log(chalk.green("✓ .agents/ created"));
  } else if (force) {
    for (const dir of MANAGED_DIRS) {
      const src = path.join(sourceBase, dir);
      const dest = path.join(agentsDir, dir);
      if (fs.existsSync(src)) {
        fs.rmSync(dest, { recursive: true, force: true });
        fs.cpSync(src, dest, { recursive: true });
      }
    }
    console.log(chalk.green("✓ .agents/ managed directories updated"));
  } else {
    console.log(chalk.dim("⏭ .agents/ already exists (preserved). Use --force to overwrite."));
  }

  if (!fs.existsSync(agentsMd)) {
    const templatePath = path.join(sourceBase, "AGENTS.md.template");
    if (!fs.existsSync(templatePath)) {
      console.error(chalk.red("✗ AGENTS.md.template not found in cdd package."));
      return;
    }
    const templateContent = fs.readFileSync(templatePath, "utf-8");

    let projectName = "";
    const pkgPath = path.join(workspaceRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg: object = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if ("name" in pkg && Object.prototype.toString.call(pkg.name) === "[object String]") {
          projectName = String(pkg.name);
        }
      } catch {
        // 무시
      }
    }

    const header = projectName ? `# ${projectName} — Agent Instructions\n\n` : "";
    fs.writeFileSync(agentsMd, `${header}${templateContent}`);
    console.log(chalk.green("✓ AGENTS.md created"));
  } else {
    console.log(chalk.dim("⏭ AGENTS.md already exists (preserved)"));
  }

  ensureSymlink(claudeLink, ".agents", force);
  ensureSymlink(claudeMdLink, "AGENTS.md", force);

  console.log(chalk.cyan("\n  agents init complete."));
  console.log(chalk.dim("  Then use /cdd slash command to start CDD workflow."));
}
