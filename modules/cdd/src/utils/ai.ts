import { execFile } from "node:child_process";

// --- 타입 정의 ---

export interface AiCallOptions<T> {
  cwd: string;
  prompt: string;
  fallback: T;
  parse: (value: unknown) => T | null;
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
}

export type AiCallResult<T> =
  | { ok: true; value: T; rawText: string }
  | {
      ok: false;
      value: T;
      reason:
        | "unavailable"
        | "timeout"
        | "spawn_error"
        | "non_zero_exit"
        | "invalid_json"
        | "invalid_shape";
      rawText: string;
      stderr: string;
      exitCode?: number;
    };

// --- 공개 함수 ---

export async function callAi<T>(options: AiCallOptions<T>): Promise<AiCallResult<T>> {
  const timeout = options.timeoutMs ?? 120_000;
  const cliArgs = [
    "-p",
    "--model",
    "haiku",
    "--input-format",
    "text",
    "--output-format",
    "json",
    "--no-session-persistence",
  ];
  if (options.jsonSchema) {
    cliArgs.push("--json-schema", JSON.stringify(options.jsonSchema));
  }

  let stdout: string;
  let stderr: string;
  let exitCode: number | undefined;

  try {
    const result = await spawnClaude(cliArgs, options.prompt, {
      cwd: options.cwd,
      timeoutMs: timeout,
    });
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
  } catch (error: unknown) {
    if (isSpawnNotFound(error)) {
      return {
        ok: false,
        value: options.fallback,
        reason: "unavailable",
        rawText: "",
        stderr: String(error),
      };
    }
    if (isTimeoutError(error)) {
      return {
        ok: false,
        value: options.fallback,
        reason: "timeout",
        rawText: "",
        stderr: String(error),
      };
    }
    return {
      ok: false,
      value: options.fallback,
      reason: "spawn_error",
      rawText: "",
      stderr: String(error),
    };
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      value: options.fallback,
      reason: "non_zero_exit",
      rawText: stdout,
      stderr,
      exitCode,
    };
  }

  // JSON 파싱 시도
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      value: options.fallback,
      reason: "invalid_json",
      rawText: stdout,
      stderr,
      exitCode,
    };
  }

  // --output-format json 응답에서 result 필드 추출
  const content = extractContent(parsed);

  const value = options.parse(content);
  if (value === null) {
    return {
      ok: false,
      value: options.fallback,
      reason: "invalid_shape",
      rawText: stdout,
      stderr,
      exitCode,
    };
  }

  return { ok: true, value, rawText: stdout };
}

// --- 내부 함수 ---

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function spawnClaude(
  args: string[],
  stdinData: string,
  options: { cwd: string; timeoutMs: number },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      args,
      {
        cwd: options.cwd,
        maxBuffer: 50 * 1024 * 1024,
        timeout: options.timeoutMs,
      },
      (error, stdout, stderr) => {
        if (error) {
          // exitCode가 있는 non-zero exit는 결과로 반환
          if ("code" in error && typeof error.code === "number" && error.code !== 0) {
            resolve({
              stdout: typeof stdout === "string" ? stdout : "",
              stderr: typeof stderr === "string" ? stderr : "",
              exitCode: error.code,
            });
            return;
          }
          reject(error);
          return;
        }
        resolve({ stdout, stderr, exitCode: 0 });
      },
    );

    // stdin이 null이면 프롬프트를 전달할 수 없으므로 즉시 실패 처리합니다.
    if (!child.stdin) {
      reject(new Error("child.stdin is null: cannot write prompt"));
      return;
    }
    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

/** claude --output-format json 응답에서 실제 컨텐츠를 추출합니다 */
function extractContent(parsed: unknown): unknown {
  if (!isObjectWithResult(parsed)) return parsed;
  const { result } = parsed;
  // result가 JSON 문자열이면 한번 더 파싱
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}

function isObjectWithResult(v: unknown): v is { result: unknown } {
  return typeof v === "object" && v !== null && "result" in v;
}

function isSpawnNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "ENOENT") return true;
  return false;
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("killed" in error && error.killed === true) return true;
  if ("code" in error && error.code === "ETIMEDOUT") return true;
  return false;
}
