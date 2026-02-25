import path from "node:path";
import chalk from "chalk";
import type { SonamuConfig } from "../api/config";
import { loadConfig } from "../api/config";
import type { RunResult, TestCaseResult } from "../testing";
import { findApiRootPath } from "../utils/utils";

export async function testCommand(): Promise<void> {
  // VITEST=true 임시 설정으로 loadConfig가 src/sonamu.config.ts 경로를 사용하도록 함
  const prevVitest = process.env.VITEST;
  process.env.VITEST = "true";
  let config: SonamuConfig;
  try {
    const apiRootPath = findApiRootPath();
    config = await loadConfig(apiRootPath);
  } finally {
    if (prevVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = prevVitest;
    }
  }

  // process.argv 파싱: sonamu test [file...] --pattern "이름" --traces
  const args = process.argv.slice(3);
  const files: string[] = [];
  let pattern: string | undefined;
  let showTraces = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pattern" || arg === "-p") {
      pattern = args[++i];
    } else if (arg === "--traces" || arg === "-t") {
      showTraces = true;
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }

  if (!config.test?.devRunner?.enabled) {
    console.error(
      chalk.red(
        "devRunner가 활성화되지 않았습니다. sonamu.config.ts에서 test.devRunner.enabled: true 설정이 필요합니다",
      ),
    );
    process.exit(1);
  }

  const port = config.server.listen?.port ?? 3000;
  const host = config.server.listen?.host ?? "localhost";
  const routePrefix = config.test?.devRunner?.routePrefix ?? "/__test__";
  const url = `http://${host}:${port}${routePrefix}/run`;

  const payload: { files?: string[]; pattern?: string } = {};
  if (files.length > 0) {
    payload.files = files;
  }
  if (pattern) {
    payload.pattern = pattern;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 404) {
      console.error(
        chalk.red(
          "devRunner가 활성화되지 않았습니다. sonamu.config.ts에서 test.devRunner.enabled: true 설정이 필요합니다",
        ),
      );
      process.exit(1);
    }

    if (response.status === 500) {
      const errorBody = (await response.json()) as { error?: string };
      console.error(chalk.red("Vitest 인스턴스가 아직 준비되지 않았습니다"));
      if (errorBody.error) {
        console.error(chalk.red(errorBody.error));
      }
      process.exit(1);
    }

    if (!response.ok) {
      console.error(chalk.red(`예상하지 못한 응답: ${response.status}`));
      process.exit(1);
    }

    const result = (await response.json()) as RunResult;

    const { passed, failed: failedCount, total, durationMs } = result.summary;
    const passedStr = chalk.green(`${passed} passed`);
    const failedStr =
      failedCount > 0 ? chalk.red(`${failedCount} failed`) : `${failedCount} failed`;
    console.log(`\nTests: ${passedStr}, ${failedStr}, ${total} total`);
    console.log(chalk.dim(`Duration: ${durationMs}ms`));

    const failedTests = collectFailedFromResults(result.results);
    if (failedTests.length > 0) {
      console.log(chalk.red.bold("\nFailed tests:"));
      for (const f of failedTests) {
        console.log(`  ${chalk.red("x")} ${f.fullName} ${chalk.dim(`(${f.file})`)}`);
        if (f.error) {
          console.log(`    ${chalk.red(f.error.message)}`);
        }
      }
    }

    if (showTraces) {
      const testsWithTraces = collectTracesFromResults(result.results);
      if (testsWithTraces.length > 0) {
        console.log(chalk.cyan.bold("\nTraces:"));
        for (const { testName, file, traces } of testsWithTraces) {
          console.log(`\n  ${chalk.bold(testName)}`);
          console.log(`  ${chalk.dim(path.basename(file))}`);
          for (const trace of traces) {
            const loc = `${path.basename(trace.filePath)}:${trace.lineNumber}`;
            const valueStr =
              typeof trace.value === "string"
                ? trace.value
                : (JSON.stringify(trace.value, null, 2) ?? "undefined");
            console.log(`\n    ${chalk.yellow(`[${trace.key}]`)} ${chalk.dim(loc)}`);
            const indented = valueStr.split("\n").join("\n    ");
            console.log(`    ${indented}`);
          }
        }
      }
    }

    if (!result.ok) {
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof TypeError && err.cause) {
      console.error(
        chalk.red("dev 서버에 연결할 수 없습니다. sonamu dev가 실행 중인지 확인하세요"),
      );
      process.exit(1);
    }
    throw err;
  }
}

function collectFailedFromResults(nodes: TestCaseResult[]): TestCaseResult[] {
  const result: TestCaseResult[] = [];
  for (const node of nodes) {
    if (node.kind === "test" && node.state === "failed") {
      result.push(node);
    }
    if (node.children.length > 0) {
      result.push(...collectFailedFromResults(node.children));
    }
  }
  return result;
}

function collectTracesFromResults(
  nodes: TestCaseResult[],
): { testName: string; file: string; traces: TestCaseResult["traces"] }[] {
  const result: { testName: string; file: string; traces: TestCaseResult["traces"] }[] = [];
  for (const node of nodes) {
    if (node.kind === "test" && node.traces.length > 0) {
      result.push({ testName: node.fullName, file: node.file, traces: node.traces });
    }
    if (node.children.length > 0) {
      result.push(...collectTracesFromResults(node.children));
    }
  }
  return result;
}
