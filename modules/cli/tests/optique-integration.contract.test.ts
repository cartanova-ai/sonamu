import { describe, expect, it, vi } from "vitest";

async function importProduction(relativePath: string) {
  return import(/* @vite-ignore */ new URL(relativePath, import.meta.url).href);
}

interface InteractionOverrides {
  stdinIsTTY?: boolean;
}

function interaction(overrides: InteractionOverrides = {}) {
  return {
    enabled: true,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    prompt: {
      select: vi.fn(),
      text: vi.fn(),
      confirm: vi.fn(),
      multiselect: vi.fn(),
    },
    ...overrides,
  };
}

describe("비동기 Optique 문법", () => {
  it("프로그램이 비동기 파서를 공개하고 비동기 인자 해석 결과를 반환한다", async () => {
    const { createSonamuProgram, parseSonamuArgs } = await importProduction("../src/program.ts");
    const program = createSonamuProgram({ version: "0.10.12" });

    expect(program.parser.mode).toBe("async");
    await expect(
      parseSonamuArgs(program, ["fixture", "fetch", "--strategy", "recent"]),
    ).resolves.toMatchObject({
      command: "fixture.fetch",
      options: { strategy: "recent" },
    });
  });
});

describe("LogTape 전역 옵션", () => {
  it("상세도와 출력 형식을 처리하되 핸들러 입력에는 전달하지 않는다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const handler = vi.fn(async (input) => input);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runSonamuCli({
      args: ["sync", "-vv", "--log-output=-", "--log-format=plain"],
      interaction: {
        enabled: false,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        prompt: { select: vi.fn(), text: vi.fn(), confirm: vi.fn() },
      },
      output: {
        stdout: (chunk: string) => stdout.push(chunk),
        stderr: (chunk: string) => stderr.push(chunk),
      },
      exit: { setExitCode: vi.fn() },
      lifecycle: { init: vi.fn(), destroy: vi.fn() },
      handlers: { sync: handler },
    });

    expect(result.exitCode).toBe(0);
    expect(handler).toHaveBeenCalledWith(
      expect.not.objectContaining({
        verbose: expect.anything(),
        logOutput: expect.anything(),
        logFormat: expect.anything(),
      }),
      expect.anything(),
    );
    expect(stdout.join("")).not.toContain("logtape");
  });

  it("지원하지 않는 로그 형식은 초기화 전에 사용 오류로 거부한다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const init = vi.fn();
    const handler = vi.fn();

    const result = await runSonamuCli({
      args: ["sync", "--log-format=xml"],
      interaction: {
        enabled: false,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        prompt: { select: vi.fn(), text: vi.fn(), confirm: vi.fn() },
      },
      output: { stdout: vi.fn(), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
      lifecycle: { init, destroy: vi.fn() },
      handlers: { sync: handler },
    });

    expect(result).toMatchObject({
      exitCode: 2,
      error: { code: "INVALID_OPTION_VALUE" },
    });
    expect(init).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("로그 출력값 대신 다음 옵션을 소비하지 않는다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const stdout: string[] = [];
    const init = vi.fn();
    const handler = vi.fn();

    const result = await runSonamuCli({
      args: ["sync", "--log-output", "--json"],
      interaction: {
        enabled: false,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        prompt: { select: vi.fn(), text: vi.fn(), confirm: vi.fn() },
      },
      output: { stdout: (chunk: string) => stdout.push(chunk), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
      lifecycle: { init, destroy: vi.fn() },
      handlers: { sync: handler },
    });

    expect(result).toMatchObject({ exitCode: 2, error: { code: "INVALID_OPTION_VALUE" } });
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: false,
      command: "sync",
      exitCode: 2,
      error: { code: "INVALID_OPTION_VALUE" },
    });
    expect(init).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("JSON 모드에서 로깅을 활성화해도 stdout에는 성공 봉투만 기록한다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const stdout: string[] = [];

    const result = await runSonamuCli({
      args: ["sync", "--json", "-vv", "--log-format=jsonl"],
      interaction: {
        enabled: false,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        prompt: { select: vi.fn(), text: vi.fn(), confirm: vi.fn() },
      },
      output: { stdout: (chunk: string) => stdout.push(chunk), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
      lifecycle: { init: vi.fn(), destroy: vi.fn() },
      handlers: { sync: vi.fn(async () => ({ synced: true })) },
    });

    expect(result.exitCode).toBe(0);
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).not.toContain("\u001b");
    expect(JSON.parse(stdout[0])).toEqual({
      ok: true,
      command: "sync",
      data: { synced: true },
      warnings: [],
    });
  });
});

describe("파서 소유 대화형 값", () => {
  it("누락된 마이그레이션 대상을 선택해 핸들러에 전달한다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const ui = interaction();
    ui.prompt.multiselect.mockResolvedValue({ value: ["staging"] });
    ui.prompt.confirm.mockResolvedValue({ value: true });
    const handler = vi.fn(async (input) => input);

    const result = await runSonamuCli({
      args: ["migrate", "apply"],
      interaction: ui,
      output: { stdout: vi.fn(), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
      lifecycle: { init: vi.fn(), destroy: vi.fn() },
      handlers: { "migrate.apply": handler },
    });

    expect(result.exitCode).toBe(0);
    expect(ui.prompt.multiselect).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ targets: ["staging"] }),
      expect.anything(),
    );
  });

  it("대상 선택 취소 시 수명주기와 핸들러를 시작하지 않는다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const ui = interaction();
    ui.prompt.multiselect.mockResolvedValue({ cancelled: true });
    const init = vi.fn();
    const handler = vi.fn();

    const result = await runSonamuCli({
      args: ["migrate", "apply"],
      interaction: ui,
      output: { stdout: vi.fn(), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
      lifecycle: { init, destroy: vi.fn() },
      handlers: { "migrate.apply": handler },
    });

    expect(result).toMatchObject({ exitCode: 130, error: { code: "CANCELLED" } });
    expect(init).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    { args: ["migrate", "apply", "--non-interactive"], stdinIsTTY: true },
    { args: ["migrate", "apply"], stdinIsTTY: false },
  ])("비대화형 또는 non-TTY에서는 대상 선택을 열지 않는다", async ({ args, stdinIsTTY }) => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const ui = interaction({ stdinIsTTY });

    const result = await runSonamuCli({
      args,
      interaction: ui,
      output: { stdout: vi.fn(), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
    });

    expect(result).toMatchObject({ exitCode: 2, error: { code: "MISSING_ARGUMENT" } });
    expect(ui.prompt.multiselect).not.toHaveBeenCalled();
  });

  it("명시 값과 프롬프트 값에 같은 마이그레이션 대상 검증을 적용한다", async () => {
    const { runSonamuCli } = await importProduction("../src/runtime.ts");
    const explicitUi = interaction();
    const promptedUi = interaction();
    promptedUi.prompt.multiselect.mockResolvedValue({ value: ["invalid-target"] });

    const explicit = await runSonamuCli({
      args: ["migrate", "apply", "invalid-target"],
      interaction: explicitUi,
      output: { stdout: vi.fn(), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
    });
    const prompted = await runSonamuCli({
      args: ["migrate", "apply"],
      interaction: promptedUi,
      output: { stdout: vi.fn(), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
    });

    expect(explicit).toMatchObject({ exitCode: 2, error: { code: "INVALID_ARGUMENT" } });
    expect(prompted).toMatchObject({ exitCode: 2, error: { code: "INVALID_ARGUMENT" } });
  });
});
