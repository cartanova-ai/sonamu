#!/usr/bin/env ts-node

import { spawnSync, execSync } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { SWC_BUILD_COMMAND } from "./build-config";

const scriptPath = resolve(__dirname, "cli.js");
const args = process.argv.slice(2);

// build 명령어는 dist 없이도 실행 가능하도록 cli.ts 외부에서 처리(Sonamu.init에서 dist 필요)
function build() {
  try {
    execSync(SWC_BUILD_COMMAND, { cwd: process.cwd(), stdio: "inherit" });
  } catch (error) {
    console.error(chalk.red("Build failed."), error);
    process.exit(1);
  }
}

if (args[0] === "build") {
  console.log(chalk.blue("Building the project..."));
  build();
  console.log(chalk.green("Build completed successfully."));
  process.exit(0);
}

if (args[0] === "dev:serve") {
  build();
}

if (!existsSync(scriptPath)) {
  console.error(`Error: Script not found at ${scriptPath}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
