import { describe, expect, it, vi } from "vitest";

import { type CliHandlers, type RunSonamuCliOptions } from "../src/runtime.js";

async function importProduction(relativePath: string) {
  return import(/* @vite-ignore */ new URL(relativePath, import.meta.url).href);
}

async function* watchEvents() {
  yield { type: "started", runId: "r1" };
  yield { type: "finished", runId: "r1", ok: true };
}

function createHarness(overrides: Partial<RunSonamuCliOptions> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const setExitCode = vi.fn();
  const init = vi.fn(async () => ({ name: "sonamu" }));
  const destroy = vi.fn(async () => undefined);
  const prompt = {
    select: vi.fn(),
    text: vi.fn(),
    confirm: vi.fn(),
  };
  const discovery = {
    command: vi.fn(),
    entity: vi.fn(),
    value: vi.fn(),
  };
  const handlers = {
    sync: vi.fn(async (input) => ({ synced: true, input })),
    "scaffold.model": vi.fn(async (input) => ({ generated: input.entityId })),
  } satisfies CliHandlers;

  return {
    options: {
      args: ["sync"],
      version: "0.10.12",
      interaction: {
        enabled: true,
        stdinIsTTY: true,
        stdoutIsTTY: true,
        prompt,
        discovery,
      },
      output: {
        stdout: (chunk: string) => stdout.push(chunk),
        stderr: (chunk: string) => stderr.push(chunk),
      },
      exit: { setExitCode },
      lifecycle: { init, destroy },
      handlers,
      ...overrides,
    },
    stdout,
    stderr,
    setExitCode,
    init,
    destroy,
    prompt,
    discovery,
    handlers,
  };
}

async function run(options: RunSonamuCliOptions) {
  const { runSonamuCli } = await importProduction("../src/runtime.ts");
  return runSonamuCli(options);
}

describe("전역 인터페이스와 종료 정책", () => {
  it.each([["--help"], ["--version"], ["completion", "bash"]])(
    "%s 메타 명령은 Sonamu를 초기화하지 않고 성공한다",
    async (...args) => {
      const harness = createHarness({ args });
      const result = await run(harness.options);

      expect(result.exitCode).toBe(0);
      expect(harness.init).not.toHaveBeenCalled();
      expect(harness.destroy).not.toHaveBeenCalled();
    },
  );

  it("help, version, completion 내용을 주입 stdout에만 기록한다", async () => {
    const help = createHarness({ args: ["--help"] });
    const version = createHarness({ args: ["--version"] });
    const completion = createHarness({ args: ["completion", "zsh"] });

    await run(help.options);
    await run(version.options);
    await run(completion.options);

    expect(help.stdout.join("")).toMatch(/fixture|migrate|scaffold|completion/);
    expect(version.stdout.join("").trim()).toBe("0.10.12");
    expect(completion.stdout.join("")).toMatch(/compdef|sonamu/);
    expect(help.stderr.join("") + version.stderr.join("") + completion.stderr.join("")).toBe("");
  });

  it.each([
    [["unknown"], 2],
    [["scaffold", "model", "--non-interactive"], 2],
  ])("사용 오류 %j는 종료 코드 2를 반환하고 초기화하지 않는다", async (args, exitCode) => {
    const harness = createHarness({ args });
    const result = await run(harness.options);

    expect(result.exitCode).toBe(exitCode);
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.handlers["scaffold.model"]).not.toHaveBeenCalled();
  });

  it("도메인 실패는 종료 코드 1과 오류 결과를 반환한다", async () => {
    const domainError = Object.assign(new Error("동기화 실패"), { code: "SYNC_FAILED" });
    const harness = createHarness({
      handlers: { sync: vi.fn(async () => Promise.reject(domainError)) },
    });

    await expect(run(harness.options)).resolves.toMatchObject({
      exitCode: 1,
      error: { code: "SYNC_FAILED", message: "동기화 실패" },
    });
  });

  it("확인이 필요한 비대화형 작업은 종료 코드 3으로 끝난다", async () => {
    const harness = createHarness({
      args: ["migrate", "apply", "production", "--non-interactive"],
      handlers: { "migrate.apply": vi.fn() },
    });

    await expect(run(harness.options)).resolves.toMatchObject({
      exitCode: 3,
      error: { code: "CONFIRMATION_REQUIRED" },
    });
  });

  it("프롬프트 취소는 변경 없이 종료 코드 130을 반환한다", async () => {
    const harness = createHarness({ args: ["scaffold", "model"] });
    harness.prompt.select.mockResolvedValue({ cancelled: true });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(130);
    expect(harness.handlers["scaffold.model"]).not.toHaveBeenCalled();
  });
});

describe("대화형 입력 정책", () => {
  it("stdin과 stdout이 TTY이고 값이 없을 때만 질문한다", async () => {
    const harness = createHarness({ args: ["scaffold", "model"] });
    harness.prompt.select.mockResolvedValue({ value: "User" });

    await run(harness.options);

    expect(harness.prompt.select).toHaveBeenCalledOnce();
    expect(harness.handlers["scaffold.model"]).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "User" }),
      expect.anything(),
    );
  });

  it("명시한 값이 있으면 질문하지 않는다", async () => {
    const harness = createHarness({ args: ["scaffold", "model", "User"] });

    await run(harness.options);

    expect(harness.prompt.select).not.toHaveBeenCalled();
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    "TTY 조건이 %s/%s이면 누락 값을 즉시 사용 오류로 반환한다",
    async (stdinIsTTY, stdoutIsTTY) => {
      const harness = createHarness({
        args: ["scaffold", "model"],
        interaction: {
          enabled: true,
          stdinIsTTY,
          stdoutIsTTY,
          prompt: { select: vi.fn(), text: vi.fn(), confirm: vi.fn() },
        },
      });

      const result = await run(harness.options);

      expect(result).toMatchObject({
        exitCode: 2,
        error: { code: "MISSING_ARGUMENT", hint: expect.stringMatching(/entity|argument|option/i) },
      });
    },
  );

  it("주입한 퍼지 탐색기로 명령과 엔티티 후보를 결정한다", async () => {
    const harness = createHarness({ args: ["scafold", "model", "Usr"] });
    const { discovery } = harness;
    discovery.command.mockResolvedValue("scaffold");
    discovery.entity.mockResolvedValue("User");

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(discovery.command).toHaveBeenCalledWith("scafold", expect.anything());
    expect(discovery.entity).toHaveBeenCalledWith("Usr", expect.anything());
  });

  it("주입한 퍼지 값 탐색기로 제한된 옵션 후보를 결정한다", async () => {
    const handlers = { "fixture.fetch": vi.fn(async (input) => input) };
    const harness = createHarness({
      args: ["fixture", "fetch", "--include", "User", "--strategy", "recnt"],
      handlers,
    });
    const { discovery } = harness;
    discovery.value.mockResolvedValue("recent");

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(discovery.value).toHaveBeenCalledWith("recnt", ["recent", "sample", "random"]);
    expect(handlers["fixture.fetch"]).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "recent" }),
      expect.anything(),
    );
  });
});

describe("코딩 에이전트 출력", () => {
  it("유한 JSON 성공은 한 줄 봉투만 stdout에 쓴다", async () => {
    const harness = createHarness({ args: ["sync", "--json"] });

    await run(harness.options);

    expect(harness.stdout).toHaveLength(1);
    expect(harness.stdout[0].endsWith("\n")).toBe(true);
    expect(harness.stdout[0]).not.toContain("\u001b");
    expect(harness.stdout[0]).not.toMatch(/Sonamu|progress/i);
    expect(JSON.parse(harness.stdout[0])).toEqual({
      ok: true,
      command: "sync",
      data: expect.any(Object),
      warnings: [],
    });
  });

  it("JSON 실패는 구조화된 오류와 종료 코드를 한 줄로 쓴다", async () => {
    const harness = createHarness({ args: ["sync", "--json", "--unknown"] });

    await run(harness.options);

    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toEqual({
      ok: false,
      command: "sync",
      error: {
        code: "UNKNOWN_OPTION",
        message: expect.any(String),
        hint: expect.any(String),
      },
      exitCode: 2,
    });
    expect(harness.stderr.join("")).toBe("");
  });

  it("watch JSON은 이벤트마다 NDJSON 한 줄을 쓴다", async () => {
    const harness = createHarness({
      args: ["task", "watch", "r1", "--json"],
      handlers: { "task.watch": vi.fn(() => watchEvents()) },
    });

    await run(harness.options);

    expect(harness.stdout).toHaveLength(2);
    expect(harness.stdout.every((line) => line.endsWith("\n"))).toBe(true);
    expect(harness.stdout.map((line) => JSON.parse(line).type)).toEqual(["started", "finished"]);
  });
});
