#!/usr/bin/env ts-node

import { spawnSync } from "child_process";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

const cjsPath = resolve(__dirname, "bin/cli.js");
const esmPath = resolve(__dirname, "bin/cli.mjs");

const isESM = () => {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.type === "module";
  }
  return false;
};

const scriptPath = isESM() ? esmPath : cjsPath;

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
