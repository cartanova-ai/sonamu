#!/usr/bin/env ts-node

import { spawnSync } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";

const scriptPath = resolve(__dirname, "cli.js");

if (!existsSync(scriptPath)) {
  console.error(`Error: Script not found at ${scriptPath}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [scriptPath, ...process.argv.slice(2)],
  {
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
