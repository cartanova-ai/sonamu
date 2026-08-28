import { type CommandResult, type JsonScalar } from "./types.js";

export type CliOutputMode = "human" | "json";

export interface CliError {
  code: string;
  message: string;
  hint?: string;
  details?: object | JsonScalar;
  exitCode: number;
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

export function createCliOutput(options: CliOutputOptions): CliOutput {
  const { mode, stdout, stderr } = options;

  return {
    success(command, data, warnings = []) {
      if (mode === "json") {
        stdout(serializeJson({ ok: true, command, data: data ?? null, warnings }));
        return;
      }

      stdout(`${formatHumanData(data)}\n`);
      for (const warning of warnings) stderr(`${warning}\n`);
    },

    error(command, error) {
      if (mode === "json") {
        const { exitCode, ...details } = error;
        stdout(serializeJson({ ok: false, command, error: details, exitCode }));
        return;
      }

      stderr(`${error.message}\n`);
      if (error.hint !== undefined) stderr(`${error.hint}\n`);
    },

    event(event) {
      stdout(serializeJson(event));
    },
  };
}
