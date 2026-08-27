/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LAST_VERIFIED_FILE = ".last-verified";
const ROOT_DIR = resolve(import.meta.dirname, "..");

interface VerifiedState {
  head: string;
  "pnpm-lock.yaml": string;
  "pnpm-workspace.yaml": string;
}

function exec(command: string, args: string[], silent = false): string {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf-8",
    stdio: silent ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${[command, ...args].join(" ")}`);
  }
  return result.stdout?.trim() ?? "";
}

function getFileHash(filepath: string): string {
  const content = readFileSync(resolve(ROOT_DIR, filepath), "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

function readLastVerified(): VerifiedState | null {
  const filepath = resolve(ROOT_DIR, LAST_VERIFIED_FILE);
  if (!existsSync(filepath)) return null;

  const lines = readFileSync(filepath, "utf-8").trim().split("\n");
  let head: string | undefined;
  let pnpmLockHash: string | undefined;
  let pnpmWorkspaceHash: string | undefined;

  for (const line of lines) {
    const [key, value] = line.split("=");
    if (key === "head") {
      head = value;
    } else if (key === "pnpm-lock.yaml") {
      pnpmLockHash = value;
    } else if (key === "pnpm-workspace.yaml") {
      pnpmWorkspaceHash = value;
    }
  }

  if (head === undefined || pnpmLockHash === undefined || pnpmWorkspaceHash === undefined) {
    return null;
  }

  return {
    head,
    "pnpm-lock.yaml": pnpmLockHash,
    "pnpm-workspace.yaml": pnpmWorkspaceHash,
  };
}

function writeLastVerified(state: VerifiedState): void {
  const content = Object.entries(state)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  writeFileSync(resolve(ROOT_DIR, LAST_VERIFIED_FILE), content);
}

function getCurrentState(): VerifiedState {
  return {
    head: exec("git", ["rev-parse", "HEAD"], true),
    "pnpm-lock.yaml": getFileHash("pnpm-lock.yaml"),
    "pnpm-workspace.yaml": getFileHash("pnpm-workspace.yaml"),
  };
}

function getChangedPackages(fromCommit: string): Set<string> {
  const changedFiles = exec("git", ["diff", "--name-only", fromCommit, "HEAD"], true)
    .split("\n")
    .filter(Boolean);

  const packages = new Set<string>();

  for (const file of changedFiles) {
    // modules/xxx 형태
    if (file.startsWith("modules/")) {
      const pkgName = file.split("/")[1];
      packages.add(pkgName);
    }
    // examples/miomock 형태
    else if (file.startsWith("examples/miomock/")) {
      packages.add("miomock-api");
    }
  }

  return packages;
}

async function verifyClean() {
  console.log("🧹 Running clean verification...\n");

  exec("mise", ["exec", "--", "pnpm", "install"]);
  console.log("✓ Install completed\n");

  exec("mise", ["run", "build"]);
  console.log("✓ Build completed\n");

  exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "sonamu", "migrate", "run"]);
  console.log("✓ Migration completed\n");

  exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "sonamu", "fixture", "sync"]);
  console.log("✓ Fixture sync completed\n");

  exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "test"]);
  console.log("✓ Test completed\n");

  exec("mise", ["run", "check"]);
  console.log("✓ Lint/format check completed\n");

  writeLastVerified(getCurrentState());
  console.log("✅ Clean verification completed!");
}

async function verifyFast() {
  console.log("⚡ Running fast verification...\n");

  const lastState = readLastVerified();

  // .last-verified 없으면 clean 모드
  if (!lastState) {
    console.log("No previous verification found, running clean mode...\n");
    return verifyClean();
  }

  const currentState = getCurrentState();

  // Lock 파일 변경 체크
  const lockChanged =
    lastState["pnpm-lock.yaml"] !== currentState["pnpm-lock.yaml"] ||
    lastState["pnpm-workspace.yaml"] !== currentState["pnpm-workspace.yaml"];

  if (lockChanged) {
    console.log("📦 Lock files changed, running install + full build...\n");
    exec("mise", ["exec", "--", "pnpm", "install"]);
    console.log("✓ Install completed\n");

    exec("mise", ["run", "build"]);
    console.log("✓ Build completed\n");

    exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "sonamu", "migrate", "run"]);
    console.log("✓ Migration completed\n");

    exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "sonamu", "fixture", "sync"]);
    console.log("✓ Fixture sync completed\n");

    exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "test"]);
    console.log("✓ Test completed\n");

    writeLastVerified(currentState);
    console.log("✅ Fast verification completed!");
    return;
  }

  // 변경된 패키지 찾기
  const changedPackages = getChangedPackages(lastState.head);

  if (changedPackages.size === 0) {
    console.log("✨ Nothing changed, skipping verification");
    return;
  }

  console.log(`📝 Changed packages: ${Array.from(changedPackages).join(", ")}\n`);

  // 필터 문자열 생성: {pkg1}{pkg2}{pkg3}...
  const filterStr = Array.from(changedPackages)
    .map((pkg) => `{${pkg}}`)
    .join("");

  exec("mise", ["exec", "--", "pnpm", "--filter", `${filterStr}...`, "build"]);
  console.log("✓ Build completed\n");

  exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "sonamu", "migrate", "run"]);
  console.log("✓ Migration completed\n");

  exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "sonamu", "fixture", "sync"]);
  console.log("✓ Fixture sync completed\n");

  exec("mise", ["exec", "--", "pnpm", "--filter", "miomock-api", "test"]);
  console.log("✓ Test completed\n");

  exec("mise", ["run", "check"]);
  console.log("✓ Lint/format check completed\n");

  writeLastVerified(currentState);
  console.log("✅ Fast verification completed!");
}

// CLI
const mode = process.argv[2];

(async () => {
  try {
    if (mode === "clean") {
      await verifyClean();
    } else if (mode === "fast") {
      await verifyFast();
    } else {
      console.error("Usage: ts-node verify.ts [clean|fast]");
      process.exit(1);
    }
    exec("say", [
      "-v",
      "Yuna",
      `소나무 ${mode === "clean" ? "클린" : "빠른"}검증 성공했습니다![[slnc 1000]]`,
    ]);
  } catch (e) {
    exec("say", [
      "-v",
      "Yuna",
      `소나무 ${mode === "clean" ? "클린" : "빠른"}검증 실패![[slnc 1000]]`,
    ]);
    if (e instanceof Error) {
      console.error("\n❌ Verification failed:", e.message);
    }
    process.exit(1);
  }
})();
