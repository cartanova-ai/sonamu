#!/usr/bin/env ts-node

import { spawnSync } from "child_process";
import { extname, resolve } from "path";
import { existsSync, readFileSync } from "fs";

const cjsPath = resolve(__dirname, "bin/cli.js");
const esmPath = resolve(__dirname, "bin/cli.mjs");

const isESM = () => {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  // package.json에 "type": "module" 설정 확인
  if (packageJson.type === "module") {
    return true;
  }

  // 환경 변수에서 ESM 여부 확인
  if (process.env.USE_ESM === "true") {
    return true;
  }

  // package.json에 "type": "module" 설정
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.type === "module";
  }

  // main 필드가 .mjs로 끝나는지 확인
  if (packageJson.main && extname(packageJson.main) === ".mjs") {
    return true;
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
