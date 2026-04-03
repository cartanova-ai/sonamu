#!/usr/bin/env node

import { cp, lstat, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import minimist from "minimist";
import { runAcAdd } from "./commands/ac-add.js";
import { runAcList } from "./commands/ac-list.js";
import { runRulesValidate } from "./commands/rules-validate.js";
import { findContractDir, loadProject } from "./core/loader.js";
import type { OutputResult } from "./utils/output.js";
import { printOutput } from "./utils/output.js";

const args = minimist(process.argv.slice(2), {
  string: ["cwd", "describe"],
  boolean: ["help", "raw", "json", "force", "dry-run"],
  alias: { h: "help" },
});

const rawFlag: boolean = args.raw || args.json;
const command = args._[0];

if (args.help || !command) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const cwd = args.cwd ?? process.cwd();
const cmdArgs = args._.slice(1);

let result: OutputResult;
switch (command) {
  case "ac": {
    const subCmd = cmdArgs[0];
    if (subCmd === "add") {
      result = runAcAdd(cmdArgs[1], cmdArgs[2], { describe: args.describe }, cwd);
    } else if (subCmd === "list") {
      result = await runAcList(cmdArgs[1], cwd);
    } else {
      console.error(`알 수 없는 ac 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: add, list");
      process.exit(1);
    }
    break;
  }
  case "rules": {
    if (cmdArgs[0] === "validate") {
      const contractDir = findContractDir(cwd);
      if (!contractDir) {
        console.error("contract/ 디렉토리를 찾을 수 없습니다.");
        process.exit(1);
      }
      const project = await loadProject(contractDir);
      result = runRulesValidate(project);
    } else {
      console.error(`알 수 없는 rules 서브커맨드: "${cmdArgs[0]}"`);
      console.error("사용 가능: validate");
      process.exit(1);
    }
    break;
  }
  case "agents": {
    const subCmd = cmdArgs[0];
    if (subCmd === "init") {
      await agentsInit(args.force);
    } else if (subCmd === "sync") {
      await agentsSync(args["dry-run"]);
    } else {
      console.error(`알 수 없는 agents 서브커맨드: "${subCmd}"`);
      console.error("사용 가능: init, sync");
      process.exit(1);
    }
    break;
  }
  default:
    console.error(`알 수 없는 명령어: "${command}"`);
    printHelp();
    process.exit(1);
}

printOutput(result, rawFlag);
if (result.exitCode) process.exit(result.exitCode);

function printHelp(): void {
  console.log(`Usage: cdd <command> [options]

Commands:
  ac add <file> [--describe <group>] <test-name>  AC 추가 (빈 테스트 스켈레톤 생성)
  ac list [file]                                   AC 목록 조회 (describe/test 트리)
  rules validate                                   Rules 파일 구조 검증
  agents init [--force]                            프로젝트에 CDD 에이전트 초기 설정
  agents sync [--dry-run]                          CDD 에이전트 프롬프트 최신화

Options:
  --cwd <dir>         작업 디렉토리 지정 (기본: 현재 디렉토리)
  --describe <group>  describe 그룹 지정 (ac add)
  --raw / --json      JSON 원본 출력
  --force             기존 파일 덮어쓰기 (agents init)
  --dry-run           변경 대상만 출력, 실제 변경 없음 (agents sync)
  -h, --help          도움말`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function findWorkspaceRoot(): Promise<string> {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (await exists(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const pkgPath = path.join(dir, "package.json");
    if (await exists(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {
        // 무시
      }
    }
    if (await exists(path.join(dir, ".agents"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

async function ensureSymlink(linkPath: string, target: string, force = false) {
  const name = path.basename(linkPath);
  try {
    const stat = await lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const current = await readlink(linkPath);
      if (current === target && !force) {
        console.log(chalk.dim(`⏭ ${name} symlink already exists (preserved)`));
        return;
      }
      await rm(linkPath, { force: true });
    } else {
      console.log(chalk.dim(`⏭ ${name} already exists (not a symlink, preserved)`));
      return;
    }
  } catch {
    // 존재하지 않으면 그대로 생성
  }
  try {
    await symlink(target, linkPath);
    console.log(chalk.green(`✓ ${name} → ${target} symlink created`));
  } catch (error) {
    console.log(
      chalk.yellow(
        `⚠ Failed to create ${name} symlink: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}

async function agentsInit(force = false) {
  const workspaceRoot = await findWorkspaceRoot();
  const sourceBase = path.resolve(import.meta.dirname, "..", "src", "agents");

  if (!(await exists(sourceBase))) {
    console.error(chalk.red("✗ Agents source not found in cdd package."));
    return;
  }

  const agentsDir = path.join(workspaceRoot, ".agents");
  const agentsMd = path.join(workspaceRoot, "AGENTS.md");
  const claudeLink = path.join(workspaceRoot, ".claude");
  const claudeMdLink = path.join(workspaceRoot, "CLAUDE.md");

  if ((await exists(agentsDir)) && !force) {
    console.log(chalk.dim("⏭ .agents/ already exists (preserved). Use --force to overwrite."));
  } else {
    if (force) {
      await rm(agentsDir, { recursive: true, force: true });
    }
    await cp(sourceBase, agentsDir, { recursive: true });
    await rm(path.join(agentsDir, "AGENTS.md.template"), { force: true });
    console.log(chalk.green("✓ .agents/ created"));
  }

  if (!(await exists(agentsMd))) {
    const templatePath = path.join(sourceBase, "AGENTS.md.template");
    if (!(await exists(templatePath))) {
      console.error(chalk.red("✗ AGENTS.md.template not found in cdd package."));
      return;
    }
    const templateContent = await readFile(templatePath, "utf-8");

    let projectName = "";
    const pkgPath = path.join(workspaceRoot, "package.json");
    if (await exists(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        projectName = pkg.name ?? "";
      } catch {
        // 무시
      }
    }

    const header = projectName ? `# ${projectName} — Agent Instructions\n\n` : "";
    await writeFile(agentsMd, `${header}${templateContent}`);
    console.log(chalk.green("✓ AGENTS.md created"));
  } else {
    console.log(chalk.dim("⏭ AGENTS.md already exists (preserved)"));
  }

  await ensureSymlink(claudeLink, ".agents", force);
  await ensureSymlink(claudeMdLink, "AGENTS.md", force);

  console.log(chalk.cyan("\n  agents init complete."));
  console.log(chalk.dim("  Run 'pnpm sonamu skills sync' first if you haven't already."));
  console.log(chalk.dim("  Then use /cdd slash command to start CDD workflow."));
}

async function agentsSync(dryRun = false) {
  const workspaceRoot = await findWorkspaceRoot();
  const sourceBase = path.resolve(import.meta.dirname, "..", "src", "agents");

  if (!(await exists(sourceBase))) {
    console.error(chalk.red("✗ Agents source not found in cdd package."));
    return;
  }

  const agentsDir = path.join(workspaceRoot, ".agents");
  if (!(await exists(agentsDir))) {
    console.log(chalk.yellow("⚠ .agents/ not found. Run 'cdd agents init' first."));
    return;
  }

  const syncTargets = ["agents", "workflow", "skills"];
  let updatedCount = 0;

  for (const target of syncTargets) {
    const src = path.join(sourceBase, target);
    const dest = path.join(agentsDir, target);

    if (!(await exists(src))) {
      console.log(chalk.yellow(`⚠ .agents/${target}/ skipped (source not found in cdd package)`));
      continue;
    }

    if (dryRun) {
      console.log(chalk.dim(`  [dry-run] would update .agents/${target}/`));
      updatedCount++;
      continue;
    }

    await rm(dest, { recursive: true, force: true });
    await cp(src, dest, { recursive: true });
    console.log(chalk.green(`✓ .agents/${target}/ updated`));
    updatedCount++;
  }

  if (dryRun) {
    console.log(chalk.cyan(`\n  [dry-run] ${updatedCount} directories would be updated.`));
  } else {
    console.log(chalk.cyan(`\n  agents sync complete. ${updatedCount} directories updated.`));
  }
}
