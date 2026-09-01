import path from "node:path";

import { z } from "zod";

import { type CommandResult, type JsonScalar } from "./types.js";

export type CliOutputMode = "human" | "json";

export interface CliError {
  code: string;
  message: string;
  hint?: string;
  details?: object | JsonScalar;
  exitCode: number;
}

/** 파싱 결과에 따라 사람용 출력에만 적용하는 표시 설정입니다. */
export interface CliOutputDisplay {
  readonly traces: boolean;
}

export interface CliOutputOptions {
  mode: CliOutputMode;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

export interface CliOutput {
  success(command: string, data: CommandResult, warnings?: readonly string[]): void;
  error(command: string, error: CliError): void;
  event(event: CommandResult): void;
  configure(display: Partial<CliOutputDisplay>): void;
}

let executionTail: Promise<void> = Promise.resolve();
const discardAmbientOutput = () => undefined;
// SAFETY: JSON 격리 구간에서는 stdout write의 모든 오버로드를 성공 처리합니다.
const discardStdout = (() => true) as typeof process.stdout.write;

export async function runWithAmbientOutputIsolation<Result>(
  isolate: boolean,
  action: () => Result | Promise<Result>,
): Promise<Awaited<Result>> {
  let release!: () => void;
  const previous = executionTail;
  executionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  if (!isolate) {
    try {
      return await action();
    } finally {
      release();
    }
  }

  const original = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    stdoutWrite: process.stdout.write,
  };

  console.log = discardAmbientOutput;
  console.debug = discardAmbientOutput;
  console.info = discardAmbientOutput;
  console.warn = discardAmbientOutput;
  process.stdout.write = discardStdout;

  try {
    return await action();
  } finally {
    console.log = original.log;
    console.debug = original.debug;
    console.info = original.info;
    console.warn = original.warn;
    process.stdout.write = original.stdoutWrite;
    release();
  }
}

function serializeJson(value: CommandResult): string {
  // JSON 직렬화가 제어 문자를 이스케이프하므로 stdout에는 ANSI 바이트가 남지 않습니다.
  return `${JSON.stringify(value)}\n`;
}

export function formatHumanData(data: CommandResult): string {
  return JSON.stringify(data, null, 2) ?? "";
}

const testTraceSchema = z.object({
  key: z.string(),
  value: z.json().optional(),
  filePath: z.string().optional(),
  lineNumber: z.number().optional(),
});

// children은 같은 스키마로 한 단계씩 다시 해석해 재귀 스키마 없이 트리를 순회합니다.
const testCaseNodeSchema = z.object({
  kind: z.string().optional(),
  name: z.string().optional(),
  fullName: z.string().optional(),
  file: z.string().optional(),
  state: z.string().optional(),
  error: z.object({ message: z.string() }).nullish(),
  traces: z.array(testTraceSchema).optional(),
  children: z.array(z.unknown()).optional(),
});

const testRunResultSchema = z.object({
  ok: z.boolean(),
  summary: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
    durationMs: z.number(),
  }),
  results: z.array(z.unknown()),
});

type TestRunResult = z.infer<typeof testRunResultSchema>;
type TestCaseNode = z.infer<typeof testCaseNodeSchema>;
type TestTraceValue = z.infer<typeof testTraceSchema>["value"];
type TestRunResultSource = CommandResult | CliError["details"];

function collectTestCases(nodes: readonly unknown[], inheritedFile: string): TestCaseNode[] {
  return nodes.flatMap((node) => {
    const parsed = testCaseNodeSchema.safeParse(node);
    if (!parsed.success) return [];
    const current = { ...parsed.data, file: parsed.data.file ?? inheritedFile };
    return [current, ...collectTestCases(current.children ?? [], current.file ?? inheritedFile)];
  });
}

function testCaseLabel(testCase: TestCaseNode): string {
  return testCase.fullName ?? testCase.name ?? "";
}

function formatTraceValue(value: TestTraceValue): string {
  const text = z.string().safeParse(value);
  return text.success ? text.data : (JSON.stringify(value, null, 2) ?? "undefined");
}

/** DevRunner 결과를 구 CLI와 같은 형태의 사람용 진단 텍스트로 만듭니다. */
function formatTestRunResult(result: TestRunResult, showTraces: boolean): string {
  const { passed, failed, total, durationMs } = result.summary;
  const lines = [
    `Tests: ${passed} passed, ${failed} failed, ${total} total`,
    `Duration: ${durationMs}ms`,
  ];
  const testCases = collectTestCases(result.results, "").filter(
    (testCase) => testCase.kind === "test",
  );

  const failedCases = testCases.filter((testCase) => testCase.state === "failed");
  if (failedCases.length > 0) {
    lines.push("", "Failed tests:");
    for (const testCase of failedCases) {
      lines.push(`  x ${testCaseLabel(testCase)} (${testCase.file ?? ""})`);
      if (testCase.error) lines.push(`    ${testCase.error.message}`);
    }
  }

  // DevRunner는 항상 trace를 반환하므로 표시 여부는 --traces 요청으로만 결정합니다.
  const tracedCases = showTraces
    ? testCases.filter((testCase) => (testCase.traces ?? []).length > 0)
    : [];
  if (tracedCases.length > 0) {
    lines.push("", "Traces:");
    for (const testCase of tracedCases) {
      lines.push("", `  ${testCaseLabel(testCase)}`, `  ${path.basename(testCase.file ?? "")}`);
      for (const trace of testCase.traces ?? []) {
        const location = `${path.basename(trace.filePath ?? "")}:${trace.lineNumber ?? 0}`;
        lines.push("", `    [${trace.key}] ${location}`);
        lines.push(`    ${formatTraceValue(trace.value).split("\n").join("\n    ")}`);
      }
    }
  }

  return lines.join("\n");
}

function extractTestRunResult(source: TestRunResultSource): TestRunResult | undefined {
  const direct = testRunResultSchema.safeParse(source);
  if (direct.success) return direct.data;
  const container = z.object({ result: z.unknown() }).safeParse(source);
  if (!container.success) return undefined;
  const nested = testRunResultSchema.safeParse(container.data.result);
  return nested.success ? nested.data : undefined;
}

// 테스트 보고서 형식은 이 명령들에만 적용합니다.
// payload 모양만으로 판단하면 비슷한 결과를 돌려주는 다른 명령의 출력까지 임의로 재구성됩니다.
const TEST_REPORT_COMMANDS = new Set(["test.run"]);

function testReportOf(command: string, source: TestRunResultSource): TestRunResult | undefined {
  return TEST_REPORT_COMMANDS.has(command) ? extractTestRunResult(source) : undefined;
}

export function createCliOutput(options: CliOutputOptions): CliOutput {
  const { mode, stdout, stderr } = options;
  const display = { traces: false };

  return {
    configure(update) {
      if (update.traces !== undefined) display.traces = update.traces;
    },

    success(command, data, warnings = []) {
      if (mode === "json") {
        stdout(serializeJson({ ok: true, command, data: data ?? null, warnings }));
        return;
      }

      const testRunResult = testReportOf(command, data);
      stdout(
        testRunResult === undefined
          ? `${formatHumanData(data)}\n`
          : `${formatTestRunResult(testRunResult, display.traces)}\n`,
      );
      for (const warning of warnings) stderr(`${warning}\n`);
    },

    error(command, error) {
      if (mode === "json") {
        const { exitCode, ...details } = error;
        stdout(serializeJson({ ok: false, command, error: details, exitCode }));
        return;
      }

      stderr(`${error.message}\n`);
      const testRunResult = testReportOf(command, error.details);
      if (testRunResult !== undefined) {
        stderr(`${formatTestRunResult(testRunResult, display.traces)}\n`);
      }
      if (error.hint !== undefined) stderr(`${error.hint}\n`);
    },

    event(event) {
      stdout(serializeJson(event));
    },
  };
}
