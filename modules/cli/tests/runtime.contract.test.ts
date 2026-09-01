import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { type CliHandlers, type RunSonamuCliOptions } from "../src/runtime.js";

async function importProduction(relativePath: string) {
  return import(/* @vite-ignore */ new URL(relativePath, import.meta.url).href);
}

const cliPackageRoot = path.resolve(import.meta.dirname, "..");

async function readCliManifestVersion(): Promise<string> {
  const manifest: { version: string } = JSON.parse(
    await readFile(path.join(cliPackageRoot, "package.json"), "utf8"),
  );
  return manifest.version;
}

const manifestFixtureRoot = path.join(cliPackageRoot, "tests", ".manifest-version-fixture");

/**
 * CLI 소스를 임시 패키지 루트로 복사해 매니페스트 버전만 바꿔 실행합니다.
 *
 * 저장소 매니페스트와 다른 버전을 읽어내야 통과하므로,
 * 현재 매니페스트와 같은 값을 소스에 고정한 구현은 이 검사를 통과할 수 없습니다.
 */
async function loadCliWithManifestVersion(
  version: string,
): Promise<(options: RunSonamuCliOptions) => Promise<{ exitCode: number }>> {
  await rm(manifestFixtureRoot, { recursive: true, force: true });
  await mkdir(manifestFixtureRoot, { recursive: true });
  await cp(path.join(cliPackageRoot, "src"), path.join(manifestFixtureRoot, "src"), {
    recursive: true,
  });
  await writeFile(
    path.join(manifestFixtureRoot, "package.json"),
    JSON.stringify({ name: "cli-manifest-version-fixture", type: "module", version }),
    "utf8",
  );
  const { runSonamuCli } = await importProduction(
    pathToFileURL(path.join(manifestFixtureRoot, "src", "runtime.ts")).href,
  );
  return runSonamuCli;
}

async function* watchEvents() {
  yield { type: "started", runId: "r1" };
  yield { type: "finished", runId: "r1", ok: true };
}

function createHarness(overrides: Partial<RunSonamuCliOptions> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const setExitCode = vi.fn();
  const init = vi.fn(async () => undefined);
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
    [["unknown", "--non-interactive"], 2],
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

describe("CLI 버전 메타데이터", () => {
  afterAll(async () => {
    await rm(manifestFixtureRoot, { recursive: true, force: true });
  });

  it("--version은 주입 버전이 없을 때 CLI 패키지 매니페스트 버전을 보고한다", async () => {
    const manifestVersion = await readCliManifestVersion();
    const harness = createHarness({ args: ["--version"], version: undefined });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(manifestVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(harness.stdout.join("").trim()).toBe(manifestVersion);
  });

  it("매니페스트 버전이 바뀌면 --version 출력도 함께 바뀐다", async () => {
    const manifestVersion = await readCliManifestVersion();
    const fixtureVersion = "97.53.11-manifest-fixture";
    expect(fixtureVersion).not.toBe(manifestVersion);

    const runFixtureCli = await loadCliWithManifestVersion(fixtureVersion);
    const harness = createHarness({ args: ["--version"], version: undefined });

    const result = await runFixtureCli(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.stdout.join("").trim()).toBe(fixtureVersion);
  });
});

describe("운영 마이그레이션 실행 가드", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production에서 이유 없는 migrate run을 거절한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const handlers = { "migrate.run": vi.fn(async () => ({ applied: [] })) };
    const harness = createHarness({
      args: ["migrate", "run", "--execute", "--confirm", "--non-interactive"],
      handlers,
    });

    await expect(run(harness.options)).resolves.toMatchObject({
      exitCode: 3,
      error: { code: "CONFIRMATION_REQUIRED" },
    });
    expect(handlers["migrate.run"]).not.toHaveBeenCalled();
  });

  it("NODE_ENV=production에서도 --force-reason이 있으면 migrate run을 허용한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const handlers = { "migrate.run": vi.fn(async () => ({ applied: [] })) };
    const harness = createHarness({
      args: [
        "migrate",
        "run",
        "--execute",
        "--confirm",
        "--force-reason",
        "incident-42",
        "--non-interactive",
      ],
      handlers,
    });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(handlers["migrate.run"]).toHaveBeenCalledWith(
      expect.objectContaining({ execute: true, confirm: true, forceReason: "incident-42" }),
      expect.anything(),
    );
  });

  it("운영이 아닌 환경의 migrate run은 이유 없이도 그대로 실행한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const handlers = { "migrate.run": vi.fn(async () => ({ applied: [] })) };
    const harness = createHarness({
      args: ["migrate", "run", "--execute", "--confirm", "--non-interactive"],
      handlers,
    });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(handlers["migrate.run"]).toHaveBeenCalledOnce();
  });

  it("NODE_ENV=production이어도 migrate run dry-run은 가드를 통과한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const handlers = { "migrate.run": vi.fn(async () => ({ applied: [] })) };
    const harness = createHarness({
      args: ["migrate", "run", "--dry-run", "--non-interactive"],
      handlers,
    });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(handlers["migrate.run"]).toHaveBeenCalledOnce();
  });

  it("migrate apply와 rollback의 운영 이유 가드를 그대로 유지한다", async () => {
    const applyHandlers = { "migrate.apply": vi.fn() };
    const rollbackHandlers = { "migrate.rollback": vi.fn() };

    await expect(
      run(
        createHarness({
          args: ["migrate", "apply", "production", "--execute", "--confirm", "--non-interactive"],
          handlers: applyHandlers,
        }).options,
      ),
    ).resolves.toMatchObject({ exitCode: 3, error: { code: "CONFIRMATION_REQUIRED" } });
    await expect(
      run(
        createHarness({
          args: [
            "migrate",
            "rollback",
            "production",
            "--execute",
            "--confirm",
            "--non-interactive",
          ],
          handlers: rollbackHandlers,
        }).options,
      ),
    ).resolves.toMatchObject({ exitCode: 3, error: { code: "CONFIRMATION_REQUIRED" } });
    expect(applyHandlers["migrate.apply"]).not.toHaveBeenCalled();
    expect(rollbackHandlers["migrate.rollback"]).not.toHaveBeenCalled();
  });
});

const FAILED_TRACE_KEY = "요청본문-트레이스";
const PASSED_TRACE_KEY = "응답본문-트레이스";

interface TestCaseTrace {
  key: string;
  value: unknown;
  filePath: string;
  lineNumber: number;
  at: string;
}

interface TestCaseNode {
  id: string;
  kind: string;
  name: string;
  fullName: string;
  file: string;
  state: string;
  durationMs: number;
  counts: { total: number; passed: number; failed: number; skipped: number };
  error: { message: string } | null;
  traces: TestCaseTrace[];
  children: TestCaseNode[];
}

function testCaseNode(overrides: Partial<TestCaseNode>): TestCaseNode {
  return {
    id: "node",
    kind: "test",
    name: "case",
    fullName: "case",
    file: "src/user.test.ts",
    state: "passed",
    durationMs: 12,
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    error: null,
    traces: [],
    children: [],
    ...overrides,
  };
}

const failedRunResult = {
  ok: false,
  summary: { total: 2, passed: 1, failed: 1, skipped: 0, durationMs: 1234 },
  results: [
    testCaseNode({
      id: "file-1",
      kind: "file",
      name: "src/user.test.ts",
      fullName: "src/user.test.ts",
      state: "failed",
      counts: { total: 2, passed: 1, failed: 1, skipped: 0 },
      children: [
        testCaseNode({
          id: "test-1",
          name: "중복 이메일 가입을 거절한다",
          fullName: "User > 중복 이메일 가입을 거절한다",
          state: "failed",
          counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
          error: { message: "expected 409 to be 200" },
          traces: [
            {
              key: FAILED_TRACE_KEY,
              value: { email: "duplicate@example.com" },
              filePath: "src/user.test.ts",
              lineNumber: 42,
              at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ],
    }),
  ],
};

const passedRunResult = {
  ok: true,
  summary: { total: 1, passed: 1, failed: 0, skipped: 0, durationMs: 12 },
  results: [
    testCaseNode({
      id: "file-2",
      kind: "file",
      name: "src/order.test.ts",
      fullName: "src/order.test.ts",
      file: "src/order.test.ts",
      children: [
        testCaseNode({
          id: "test-2",
          name: "주문을 생성한다",
          fullName: "Order > 주문을 생성한다",
          file: "src/order.test.ts",
          traces: [
            {
              key: PASSED_TRACE_KEY,
              value: { orderNo: "A-10" },
              filePath: "src/order.test.ts",
              lineNumber: 11,
              at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ],
    }),
  ],
};

function testRunFailure() {
  return Object.assign(new Error("테스트 실행이 실패했습니다."), {
    code: "TEST_RUN_FAILED",
    exitCode: 1,
    result: failedRunResult,
  });
}

function printedOutput(harness: { stdout: string[]; stderr: string[] }) {
  return harness.stdout.join("") + harness.stderr.join("");
}

describe("sonamu test 사람용 출력", () => {
  it("실패한 테스트 이름, 파일, 오류 메시지를 사람용 출력에 남긴다", async () => {
    const handlers = { "test.run": vi.fn(async () => Promise.reject(testRunFailure())) };
    const harness = createHarness({ args: ["test", "--non-interactive"], handlers });

    const result = await run(harness.options);
    const printed = printedOutput(harness);

    expect(result.exitCode).toBe(1);
    expect(printed).toContain("User > 중복 이메일 가입을 거절한다");
    expect(printed).toContain("src/user.test.ts");
    expect(printed).toContain("expected 409 to be 200");
  });

  it("--traces를 준 실패 출력에는 테스트별 trace 항목을 함께 출력한다", async () => {
    const handlers = { "test.run": vi.fn(async () => Promise.reject(testRunFailure())) };
    const harness = createHarness({ args: ["test", "--traces", "--non-interactive"], handlers });

    const result = await run(harness.options);
    const printed = printedOutput(harness);

    expect(result.exitCode).toBe(1);
    expect(printed).toContain(FAILED_TRACE_KEY);
    expect(printed).toContain("duplicate@example.com");
  });

  it("--traces가 없으면 실패 출력에서 trace를 생략한다", async () => {
    const handlers = { "test.run": vi.fn(async () => Promise.reject(testRunFailure())) };
    const harness = createHarness({ args: ["test", "--non-interactive"], handlers });

    await run(harness.options);
    const printed = printedOutput(harness);

    expect(printed).not.toContain(FAILED_TRACE_KEY);
    expect(printed).not.toContain("duplicate@example.com");
  });

  it.each([
    ["--traces가 있으면", ["test", "--traces", "--non-interactive"], true],
    ["--traces가 없으면", ["test", "--non-interactive"], false],
  ] as const)("성공한 실행에서도 %s trace 표시 여부가 결정된다", async (_name, args, shown) => {
    const handlers = {
      "test.run": vi.fn(async () => ({ request: { files: [] }, result: passedRunResult })),
    };
    const harness = createHarness({ args: [...args], handlers });

    const result = await run(harness.options);
    const printed = printedOutput(harness);

    expect(result.exitCode).toBe(0);
    expect(printed.includes(PASSED_TRACE_KEY)).toBe(shown);
    expect(printed.includes("A-10")).toBe(shown);
  });

  it.each([
    ["--traces 없이", ["test", "--json", "--non-interactive"]],
    ["--traces와 함께", ["test", "--traces", "--json", "--non-interactive"]],
  ] as const)("JSON 실패 봉투는 %s 정규화한 결과 전체를 유지한다", async (_name, args) => {
    const handlers = { "test.run": vi.fn(async () => Promise.reject(testRunFailure())) };
    const harness = createHarness({ args: [...args], handlers });

    await run(harness.options);

    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      ok: false,
      command: "test.run",
      exitCode: 1,
      error: { code: "TEST_RUN_FAILED", details: { result: failedRunResult } },
    });
  });
});

describe("테스트 보고서 형식의 명령 범위", () => {
  it("test.run은 같은 payload를 사람용 테스트 보고서로 정리한다", async () => {
    const handlers = { "test.run": vi.fn(async () => ({ result: passedRunResult })) };
    const harness = createHarness({ args: ["test", "--non-interactive"], handlers });

    const result = await run(harness.options);
    const printed = printedOutput(harness);

    expect(result.exitCode).toBe(0);
    expect(printed).toContain("Tests: 1 passed, 0 failed, 1 total");
  });

  it("테스트 명령이 아니면 테스트 모양 payload여도 보고서로 재구성하지 않는다", async () => {
    const handlers = { sync: vi.fn(async () => ({ result: passedRunResult })) };
    const harness = createHarness({ args: ["sync", "--non-interactive"], handlers });

    const result = await run(harness.options);
    const printed = printedOutput(harness);

    expect(result.exitCode).toBe(0);
    // payload 모양이 아니라 명령으로 판정하므로 sync 결과는 원본 JSON 그대로 남습니다.
    expect(printed).not.toContain("Tests: 1 passed, 0 failed, 1 total");
    expect(printed).not.toContain("Duration: 12ms");
    expect(JSON.parse(printed)).toEqual({ result: passedRunResult });
  });

  it("테스트 명령이 아닌 실패는 오류 메시지만 남기고 테스트 보고서를 붙이지 않는다", async () => {
    const syncFailure = Object.assign(new Error("동기화 실패"), {
      code: "SYNC_FAILED",
      exitCode: 1,
      result: failedRunResult,
    });
    const handlers = { sync: vi.fn(async () => Promise.reject(syncFailure)) };
    const harness = createHarness({ args: ["sync", "--non-interactive"], handlers });

    const result = await run(harness.options);
    const printed = printedOutput(harness);

    expect(result.exitCode).toBe(1);
    expect(printed).toContain("동기화 실패");
    expect(printed).not.toContain("Failed tests:");
    expect(printed).not.toContain("User > 중복 이메일 가입을 거절한다");
  });
});
