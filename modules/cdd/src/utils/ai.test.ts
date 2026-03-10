import { type ChildProcess, execFile } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { callAi } from "./ai.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

function makeChild(overrides?: Partial<ChildProcess>): ChildProcess {
  return {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    ...overrides,
  } as unknown as ChildProcess;
}

function setupExecFile(config: {
  stdout?: string;
  stderr?: string;
  error?: NodeJS.ErrnoException | null;
}): void {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = callback as (
      error: NodeJS.ErrnoException | null,
      stdout: string,
      stderr: string,
    ) => void;
    if (config.error) {
      cb(config.error, config.stdout ?? "", config.stderr ?? "");
    } else {
      cb(null, config.stdout ?? "", config.stderr ?? "");
    }
    return makeChild();
  });
}

const defaultOptions = {
  cwd: "/tmp",
  prompt: "test prompt",
  fallback: "fallback-value",
  parse: (v: unknown) => (typeof v === "string" ? v : null),
};

describe("callAi", () => {
  it("프롬프트를 stdin으로 전달한다", async () => {
    const writeFn = vi.fn();
    const endFn = vi.fn();

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, JSON.stringify({ result: '"hello"' }), "");
      return makeChild({ stdin: { write: writeFn, end: endFn } } as unknown as ChildProcess);
    });

    await callAi(defaultOptions);

    expect(writeFn).toHaveBeenCalledWith("test prompt");
    expect(endFn).toHaveBeenCalled();
  });

  it("정상 응답을 파싱하여 ok:true를 반환한다", async () => {
    setupExecFile({ stdout: JSON.stringify({ result: '"parsed-value"' }) });

    const result = await callAi(defaultOptions);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("parsed-value");
    }
  });

  it("claude 명령어가 없으면 reason:unavailable + fallback을 반환한다", async () => {
    const error = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(error, "", "");
      return makeChild();
    });

    const result = await callAi(defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unavailable");
      expect(result.value).toBe("fallback-value");
    }
  });

  it("timeout 시 reason:timeout + fallback을 반환한다", async () => {
    const error = new Error("timeout") as NodeJS.ErrnoException & { killed: boolean };
    error.killed = true;

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(error, "", "");
      return makeChild();
    });

    const result = await callAi(defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timeout");
      expect(result.value).toBe("fallback-value");
    }
  });

  it("비정상 종료 시 reason:non_zero_exit + fallback을 반환한다", async () => {
    const error = new Error("exit 1") as NodeJS.ErrnoException;
    error.code = 1 as unknown as string;

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(error, "some output", "error output");
      return makeChild();
    });

    const result = await callAi(defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("non_zero_exit");
      expect(result.value).toBe("fallback-value");
    }
  });

  it("JSON 파싱 실패 시 reason:invalid_json + fallback을 반환한다", async () => {
    setupExecFile({ stdout: "not json at all" });

    const result = await callAi(defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_json");
      expect(result.value).toBe("fallback-value");
    }
  });

  it("stdin이 null이면 reason:spawn_error + fallback을 반환한다", async () => {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      // 콜백은 호출하지 않아 resolve/reject는 stdin null 처리에서 발생
      void cb;
      return makeChild({ stdin: null } as unknown as ChildProcess);
    });

    const result = await callAi(defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("spawn_error");
      expect(result.value).toBe("fallback-value");
    }
  });

  it("parse()가 null을 반환하면 reason:invalid_shape + fallback을 반환한다", async () => {
    setupExecFile({ stdout: JSON.stringify({ result: "42" }) });

    const result = await callAi({
      ...defaultOptions,
      parse: (_v: unknown) => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_shape");
      expect(result.value).toBe("fallback-value");
    }
  });
});
