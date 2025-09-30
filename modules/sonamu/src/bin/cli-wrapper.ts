#!/usr/bin/env ts-node

import { spawnSync, execSync } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import chalk from "chalk";

const scriptPath = resolve(__dirname, "cli.js");
const args = process.argv.slice(2);

// build 명령어는 dist 없이도 실행 가능하도록 직접 처리
if (args[0] === "build") {
  console.log(chalk.blue("Building the project..."));

  try {
    execSync(
      `swc src -d dist --strip-leading-paths --source-maps -C module.type=commonjs -C jsc.parser.syntax=typescript -C jsc.parser.decorators=true -C jsc.target=es5 && tsc --emitDeclarationOnly`,
      {
        cwd: process.cwd(),
        stdio: "inherit",
      }
    );
    console.log(chalk.green("Build completed successfully."));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red("Build failed."), error);
    process.exit(1);
  }
}

if (!existsSync(scriptPath)) {
  console.error(`Error: Script not found at ${scriptPath}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
