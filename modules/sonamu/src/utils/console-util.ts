import { type ChildProcess, spawn } from "child_process";

import chalk from "chalk";

const DEFAULT_LINE_PREFIX = "  │    ";

/**
 * 텍스트를 터미널 중앙에 정렬합니다.
 *
 * @note TTY 모드가 아닐 경우 (파이프, 리다이렉트, CI/CD 환경 등) 기본 폭 80을 사용합니다.
 */
export function centerText(text: string): string {
  const columns = process.stdout.columns ?? 80;
  const margin = Math.max(0, Math.floor((columns - text.length) / 2));
  return " ".repeat(margin) + text + " ".repeat(margin);
}

/** 타임라인 헤더 출력: ● Name (description) /path */
export function printTaskHeader(name: string, description: string, cwd: string): void {
  console.log(
    `\n${chalk.cyan.bold("●")} ${chalk.bold(name)} ${chalk.dim(`(${description})`)} ${chalk.dim(cwd)}`,
  );
}

/** 작업 시작 표시: ├─ ○ label   description */
export function printTaskStart(label: string, description?: string, isLast = false): void {
  const branch = isLast ? "└─" : "├─";
  const descPart = description ? `   ${chalk.dim(description)}` : "";
  console.log(`  ${chalk.dim(branch)} ${chalk.yellow("○")} ${label}${descPart}`);
}

/** 작업 성공 표시: ├─ ✓ label */
export function printTaskSuccess(label: string, isLast = false): void {
  const branch = isLast ? "└─" : "├─";
  console.log(`  ${chalk.dim(branch)} ${chalk.green("✓")} ${label}`);
}

/** 작업 실패 표시: ├─ ✗ label */
export function printTaskFailed(label: string, isLast = false): void {
  const branch = isLast ? "└─" : "├─";
  console.log(`  ${chalk.dim(branch)} ${chalk.red("✗")} ${label}`);
}

/** 작업 스킵 표시: ├─ ○ label   (skipped) */
export function printTaskSkipped(label: string, isLast = false): void {
  const branch = isLast ? "└─" : "├─";
  console.log(`  ${chalk.dim(branch)} ${chalk.dim("○")} ${label}   ${chalk.dim("(skipped)")}`);
}

/** 빌드 요약 출력 */
export function printBuildSummary(name: string, success: boolean, ms: number): void {
  if (success) {
    console.log(chalk.green(`\n✓ ${name} built in ${ms}ms.`));
  } else {
    console.error(chalk.red(`\n✗ ${name} build failed.`));
  }
}

/**
 * execSync와 비슷하지만 async이고, 출력 각 줄 앞에 line prefix를 붙여 스트리밍합니다.
 * 실패 시 에러를 throw합니다.
 */
export function execWithLinePrefix(cmd: string, options: { cwd: string }): Promise<void> {
  const { cwd } = options;
  const linePrefix = chalk.dim(DEFAULT_LINE_PREFIX);

  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cmd, {
      cwd,
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "1", // 자식 프로세스에서도 컬러 출력 유지
      },
    });

    let currentLine = "";

    const flushLine = () => {
      if (currentLine) {
        process.stdout.write(`${linePrefix}${currentLine}\n`);
        currentLine = "";
      }
    };

    const overwriteLine = () => {
      if (currentLine) {
        process.stdout.write(`\r${linePrefix}${currentLine}`);
      }
    };

    const processChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const char of text) {
        if (char === "\n") {
          flushLine();
        } else if (char === "\r") {
          overwriteLine();
        } else {
          currentLine += char;
        }
      }
    };

    child.stdout?.on("data", (chunk) => processChunk(chunk));
    child.stderr?.on("data", (chunk) => processChunk(chunk));

    child.on("close", (code) => {
      flushLine();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}
