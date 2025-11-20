#!/usr/bin/env ts-node

import { spawnSync, execSync } from "child_process";
import { resolve } from "path";
import { existsSync, rmSync } from "fs";
import chalk from "chalk";
import {
  BUILD_DIR,
  SWC_BUILD_COMMAND,
  TSC_TYPE_CHECK_COMMAND,
} from "./build-config";

const scriptPath = resolve(import.meta.dirname, "cli.js");
const args = process.argv.slice(2);

// build 명령어는 dist 없이도 실행 가능하도록 cli.ts 외부에서 처리(Sonamu.init에서 dist 필요)
function build() {
  try {
    console.log(chalk.blue("Removing build directory..."));
    if (existsSync(BUILD_DIR)) {
      rmSync(BUILD_DIR, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(chalk.red("Remove build directory failed."), error);
    process.exit(1);
  }

  try {
    console.log(chalk.blue("Building with swc..."));
    execSync(SWC_BUILD_COMMAND, { cwd: process.cwd(), stdio: "inherit" });
  } catch (error) {
    console.error(chalk.red("Build failed."), error);
    process.exit(1);
  }
}

function checkTypes() {
  try {
    console.log(chalk.blue("Checking types with tsc..."));
    execSync(TSC_TYPE_CHECK_COMMAND, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch (error) {
    console.error(chalk.red("Type check failed."), error);
    process.exit(1);
  }
}

if (args[0] === "build") {
  console.log(chalk.blue("Building the project..."));
  build();
  checkTypes();
  console.log(chalk.green("Build completed successfully."));
  process.exit(0);
}

if (args[0] === "dev:serve") {
  // build();
}

if (!existsSync(scriptPath)) {
  console.error(`Error: Script not found at ${scriptPath}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "@sonamu-kit/loader", // Sonamu UI도 syncer를 다루므로, ts 로드 능력이 필요합니다.
    "--enable-source-maps",
    "--no-warnings",
    scriptPath,
    ...args
  ],
  {
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
