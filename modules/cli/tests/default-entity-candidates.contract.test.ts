import { describe, expect, it, vi } from "vitest";

import {
  type CliCandidateProvider,
  type CliInteraction,
  type RunSonamuCliOptions,
  type RunSonamuCliResult,
} from "../src/runtime.js";

interface CandidateFramework {
  readonly findApiRootPath: () => string;
  readonly EntityManager: {
    readonly isAutoloaded: boolean;
    autoload(doSilent?: boolean, apiRootPath?: string): Promise<void>;
    getAllParentIds(): readonly string[];
    getAllIds(): readonly string[];
  };
  readonly Sonamu: {
    init(): Promise<void>;
  };
}

interface EntityCommandInput extends Record<string, unknown> {
  readonly entityId?: string;
}

interface PromptSpy {
  readonly select: ReturnType<typeof vi.fn>;
  readonly text: ReturnType<typeof vi.fn>;
  readonly confirm: ReturnType<typeof vi.fn>;
}

type TestRunOptions = RunSonamuCliOptions & {
  readonly defaultCandidateProviderFactory?: () => CliCandidateProvider;
};

interface RuntimeModule {
  createDefaultCandidateProvider(options?: {
    readonly loadFramework?: () => Promise<CandidateFramework>;
  }): CliCandidateProvider;
  createDefaultInteraction(options: {
    readonly prompt: PromptSpy;
    readonly stdinIsTTY: boolean;
    readonly stdoutIsTTY: boolean;
  }): CliInteraction;
  runSonamuCli(options: TestRunOptions): Promise<RunSonamuCliResult>;
}

async function importRuntime(): Promise<RuntimeModule> {
  const loaded: unknown = await import(
    /* @vite-ignore */ new URL("../src/runtime.ts", import.meta.url).href
  );
  // SAFETY: 테스트는 명시한 runtime 공개 export만 호출하고 반환 동작을 직접 검증합니다.
  return loaded as RuntimeModule;
}

function createFramework(events: string[] = []) {
  let autoloaded = false;
  const findApiRootPath = vi.fn(() => {
    events.push("후보:root");
    return "/workspace/api";
  });
  const init = vi.fn(async () => {
    throw new Error("후보 조회 중 Sonamu.init을 호출하면 안 됨");
  });
  const autoload = vi.fn(async () => {
    events.push("후보:autoload");
    autoloaded = true;
  });
  const getAllParentIds = vi.fn(() => {
    events.push("후보:parents");
    return ["Post", "User", "Post"];
  });
  const getAllIds = vi.fn(() => {
    events.push("후보:all");
    return ["User", "Comment", "Post"];
  });

  return {
    framework: {
      findApiRootPath,
      EntityManager: {
        get isAutoloaded() {
          return autoloaded;
        },
        autoload,
        getAllParentIds,
        getAllIds,
      },
      Sonamu: { init },
    } satisfies CandidateFramework,
    findApiRootPath,
    init,
    autoload,
    getAllParentIds,
    getAllIds,
  };
}

function createPrompt(selected?: string) {
  return {
    select: vi.fn(async () => (selected === undefined ? { cancelled: true } : { value: selected })),
    text: vi.fn(async () => ({ cancelled: true })),
    confirm: vi.fn(async () => ({ cancelled: true })),
  };
}

function createExecutionHarness(events: string[] = []) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const setExitCode = vi.fn();
  const init = vi.fn(async () => {
    events.push("명령:init");
  });
  const destroy = vi.fn(async () => {
    events.push("명령:destroy");
  });
  const handler = vi.fn(async (input: EntityCommandInput) => {
    events.push("명령:handler");
    return input;
  });

  return { stdout, stderr, setExitCode, init, destroy, handler };
}

function outputOptions(harness: ReturnType<typeof createExecutionHarness>) {
  return {
    output: {
      stdout: (chunk: string) => harness.stdout.push(chunk),
      stderr: (chunk: string) => harness.stderr.push(chunk),
    },
    exit: { setExitCode: harness.setExitCode },
    lifecycle: { init: harness.init, destroy: harness.destroy },
    handlers: { "entity.show": harness.handler, "fixture.import": harness.handler },
  };
}

describe("기본 엔티티 후보 공급자", () => {
  it("entities 호출 전에는 프레임워크를 불러오지 않고 공개 루트 경로로 메타데이터만 autoload한다", async () => {
    const { createDefaultCandidateProvider } = await importRuntime();
    const events: string[] = [];
    const framework = createFramework(events);
    const loadFramework = vi.fn(async () => framework.framework);

    const provider = createDefaultCandidateProvider({ loadFramework });

    expect(loadFramework).not.toHaveBeenCalled();
    expect(framework.autoload).not.toHaveBeenCalled();

    await expect(provider.entities({ command: "entity.show" })).resolves.toEqual([
      "Post",
      "User",
      "Comment",
    ]);
    await expect(provider.entities({ command: "entity.show" })).resolves.toEqual([
      "Post",
      "User",
      "Comment",
    ]);
    expect(loadFramework).toHaveBeenCalledTimes(2);
    expect(framework.findApiRootPath).toHaveBeenCalledOnce();
    expect(framework.autoload).toHaveBeenCalledWith(true, "/workspace/api");
    expect(framework.init).not.toHaveBeenCalled();
    expect(framework.getAllParentIds).toHaveBeenCalledTimes(2);
    expect(framework.getAllIds).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      "후보:root",
      "후보:autoload",
      "후보:parents",
      "후보:all",
      "후보:parents",
      "후보:all",
    ]);
  });

  it.each([
    { label: "누락", args: ["entity", "show"] },
    { label: "오타", args: ["entity", "show", "Usr"] },
  ])("TTY에서 $label 엔티티를 기본 후보로 교정해 핸들러에 전달한다", async ({ args }) => {
    const { createDefaultCandidateProvider, createDefaultInteraction, runSonamuCli } =
      await importRuntime();
    const events: string[] = [];
    const framework = createFramework(events);
    const loadFramework = vi.fn(async () => framework.framework);
    const defaultCandidateProviderFactory = vi.fn(() =>
      createDefaultCandidateProvider({ loadFramework }),
    );
    const prompt = createPrompt("User");
    const interaction = createDefaultInteraction({
      prompt,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const harness = createExecutionHarness(events);

    const result = await runSonamuCli({
      args,
      interaction,
      defaultCandidateProviderFactory,
      ...outputOptions(harness),
    });

    expect(result).toMatchObject({ exitCode: 0, data: { entityId: "User" } });
    expect(defaultCandidateProviderFactory).toHaveBeenCalledOnce();
    expect(loadFramework).toHaveBeenCalledOnce();
    expect(prompt.select).toHaveBeenCalledWith({
      message: "Entity",
      choices: ["Post", "User", "Comment"],
    });
    expect(harness.handler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "User" }),
      expect.objectContaining({ command: "entity.show" }),
    );
    expect(framework.autoload).toHaveBeenCalledOnce();
    expect(harness.init).toHaveBeenCalledOnce();
    expect(harness.destroy).toHaveBeenCalledOnce();
    expect(events).toEqual([
      "후보:root",
      "후보:autoload",
      "후보:parents",
      "후보:all",
      "명령:init",
      "명령:handler",
      "명령:destroy",
    ]);
  });

  it("비대화형의 유효한 명시 엔티티는 기본 후보 공급자를 불러오지 않는다", async () => {
    const { createDefaultInteraction, runSonamuCli } = await importRuntime();
    const loadFramework = vi.fn(async () => createFramework().framework);
    const defaultCandidateProviderFactory = vi.fn(() => {
      throw new Error("호출되면 안 됨");
    });
    const prompt = createPrompt("Comment");
    const interaction = createDefaultInteraction({
      prompt,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const harness = createExecutionHarness();

    const result = await runSonamuCli({
      args: ["entity", "show", "User", "--non-interactive"],
      interaction,
      defaultCandidateProviderFactory,
      ...outputOptions(harness),
    });

    expect(result).toMatchObject({ exitCode: 0, data: { entityId: "User" } });
    expect(defaultCandidateProviderFactory).not.toHaveBeenCalled();
    expect(loadFramework).not.toHaveBeenCalled();
    expect(prompt.select).not.toHaveBeenCalled();
    expect(harness.handler).toHaveBeenCalledOnce();
  });

  it("fixture import의 비대화형 명시 엔티티도 기본 후보 공급자와 질문을 생략한다", async () => {
    const { createDefaultInteraction, runSonamuCli } = await importRuntime();
    const defaultCandidateProviderFactory = vi.fn(() => {
      throw new Error("호출되면 안 됨");
    });
    const prompt = createPrompt("Comment");
    const interaction = createDefaultInteraction({
      prompt,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const harness = createExecutionHarness();

    const result = await runSonamuCli({
      args: ["fixture", "import", "User", "1", "--execute", "--confirm", "--non-interactive"],
      interaction,
      defaultCandidateProviderFactory,
      ...outputOptions(harness),
    });

    expect(result).toMatchObject({
      exitCode: 0,
      data: { entityId: "User", recordIds: [1] },
    });
    expect(defaultCandidateProviderFactory).not.toHaveBeenCalled();
    expect(prompt.select).not.toHaveBeenCalled();
    expect(harness.handler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "User", recordIds: [1] }),
      expect.objectContaining({ command: "fixture.import" }),
    );
  });

  it("메타데이터 후보 로딩 실패를 도메인 오류로 반환하고 명령 lifecycle을 시작하지 않는다", async () => {
    const { createDefaultCandidateProvider, createDefaultInteraction, runSonamuCli } =
      await importRuntime();
    const framework = createFramework();
    const candidateError = Object.assign(new Error("엔티티 후보 로딩 실패"), {
      code: "ENTITY_CANDIDATE_LOAD_FAILED",
      exitCode: 4,
      hint: "entity.json을 확인하세요.",
    });
    framework.getAllIds.mockImplementation(() => {
      throw candidateError;
    });
    const loadFramework = vi.fn(async () => framework.framework);
    const defaultCandidateProviderFactory = vi.fn(() =>
      createDefaultCandidateProvider({ loadFramework }),
    );
    const prompt = createPrompt("User");
    const interaction = createDefaultInteraction({
      prompt,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const harness = createExecutionHarness();

    const result = await runSonamuCli({
      args: ["entity", "show"],
      interaction,
      defaultCandidateProviderFactory,
      ...outputOptions(harness),
    });

    expect(result).toMatchObject({
      exitCode: 1,
      error: {
        code: "ENTITY_CANDIDATE_LOAD_FAILED",
        hint: "entity.json을 확인하세요.",
      },
    });
    expect(framework.autoload).toHaveBeenCalledOnce();
    expect(prompt.select).not.toHaveBeenCalled();
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("후보 로딩 뒤 선택을 취소하면 명령 lifecycle과 핸들러를 실행하지 않는다", async () => {
    const { createDefaultCandidateProvider, createDefaultInteraction, runSonamuCli } =
      await importRuntime();
    const framework = createFramework();
    const loadFramework = vi.fn(async () => framework.framework);
    const defaultCandidateProviderFactory = vi.fn(() =>
      createDefaultCandidateProvider({ loadFramework }),
    );
    const prompt = createPrompt();
    const interaction = createDefaultInteraction({
      prompt,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const harness = createExecutionHarness();

    const result = await runSonamuCli({
      args: ["entity", "show"],
      interaction,
      defaultCandidateProviderFactory,
      ...outputOptions(harness),
    });

    expect(result).toMatchObject({ exitCode: 130, error: { code: "CANCELLED" } });
    expect(framework.autoload).toHaveBeenCalledOnce();
    expect(prompt.select).toHaveBeenCalledOnce();
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });
});
