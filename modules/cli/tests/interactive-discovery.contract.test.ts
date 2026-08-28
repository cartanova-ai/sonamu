import { describe, expect, it, vi } from "vitest";

const STANDALONE_COMMANDS = ["sync", "build", "dev", "start", "test"] as const;

const LEAF_COMMANDS = [
  "entity list",
  "entity show",
  "entity search",
  "entity apply",
  "fixture init",
  "fixture import",
  "fixture sync",
  "fixture gen",
  "fixture fetch",
  "fixture explore",
  "migrate run",
  "migrate apply",
  "migrate generate",
  "migrate status",
  "migrate connections",
  "migrate code",
  "migrate preview",
  "migrate shadow",
  "migrate rollback",
  "stub entity",
  "scaffold model",
  "scaffold model_test",
  "scaffold view_list",
  "scaffold view_form",
  "scaffold status",
  "scaffold preview",
  "scaffold batch",
  "cone gen",
  "build all",
  "build api",
  "build web",
  "dev all",
  "dev api",
  "dev web",
  "auth generate",
  "auth add-companions",
  "i18n list",
  "i18n check",
  "i18n import",
  "i18n export",
  "i18n create",
  "i18n update",
  "i18n delete",
  "task definitions",
  "task list",
  "task show",
  "task steps",
  "task watch",
  "task pause",
  "task resume",
  "task cancel",
  "cdd tree",
  "cdd read",
  "cdd rules",
  "cdd rule show",
  "cdd rule add",
  "cdd ac",
] as const;

const COMMAND_CANDIDATES = [...new Set([...STANDALONE_COMMANDS, ...LEAF_COMMANDS])].toSorted();
const ENTITY_IDS = ["Comment", "Post", "User"] as const;

interface EntityDiscoveryContext {
  readonly command: string;
  readonly candidates: readonly string[];
}

async function importRuntime() {
  return import(/* @vite-ignore */ new URL("../src/runtime.ts", import.meta.url).href);
}

function createPrompt() {
  return {
    select: vi.fn(
      async (): Promise<{ value?: string; cancelled?: boolean }> => ({ cancelled: true }),
    ),
    text: vi.fn(
      async (): Promise<{ value?: string; cancelled?: boolean }> => ({ cancelled: true }),
    ),
    confirm: vi.fn(
      async (): Promise<{ value?: boolean; cancelled?: boolean }> => ({ cancelled: true }),
    ),
  };
}

function createHarness(args: readonly string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const prompt = createPrompt();
  const command =
    vi.fn<(input: string, candidates: readonly string[]) => Promise<string | undefined>>();
  const entity =
    vi.fn<(input: string, context: EntityDiscoveryContext) => Promise<string | undefined>>();
  const value =
    vi.fn<(input: string, candidates: readonly string[]) => Promise<string | undefined>>();
  const init = vi.fn(async () => undefined);
  const destroy = vi.fn(async () => undefined);
  const setExitCode = vi.fn();
  const entities = vi.fn(async () => ENTITY_IDS);
  const handlers: Record<string, ReturnType<typeof vi.fn>> = {};

  return {
    options: {
      args,
      version: "0.10.12",
      interaction: {
        enabled: true,
        stdinIsTTY: true,
        stdoutIsTTY: true,
        prompt,
        discovery: { command, entity, value },
      },
      candidateProvider: { entities },
      output: {
        stdout: (chunk: string) => stdout.push(chunk),
        stderr: (chunk: string) => stderr.push(chunk),
      },
      exit: { setExitCode },
      lifecycle: { init, destroy },
      handlers,
    },
    stdout,
    stderr,
    prompt,
    command,
    entity,
    value,
    entities,
    init,
    destroy,
    setExitCode,
    handlers,
  };
}

describe("인자 없는 명령 탐색", () => {
  it("TTY에서 전체 명령 경로를 보여 주고 선택한 경로를 토큰화해 실행한다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness([]);
    harness.command.mockResolvedValue("entity list");
    harness.handlers["entity.list"] = vi.fn(async () => ["User"]);

    const result = await runSonamuCli(harness.options);

    expect(result).toMatchObject({ exitCode: 0, data: ["User"] });
    expect(harness.command).toHaveBeenCalledOnce();
    const [input, candidates] = harness.command.mock.calls[0];
    expect(input).toBe("");
    expect([...candidates].toSorted()).toEqual(COMMAND_CANDIDATES);
    expect(harness.handlers["entity.list"]).toHaveBeenCalledWith(
      expect.objectContaining({ passthrough: [] }),
      expect.objectContaining({ command: "entity.list" }),
    );
    expect(harness.setExitCode).toHaveBeenCalledWith(0);
  });

  it("명령 후보에 독립 실행 명령과 인자가 필요 없는 하위 경로를 포함한다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness(["syncc"]);
    harness.command.mockResolvedValue("sync");
    harness.handlers.sync = vi.fn(async () => ({ synced: true }));

    await expect(runSonamuCli(harness.options)).resolves.toMatchObject({ exitCode: 0 });

    expect(harness.command).toHaveBeenCalledWith("syncc", expect.any(Array));
    const candidates = harness.command.mock.calls[0][1];
    expect(candidates).toEqual(expect.arrayContaining([...STANDALONE_COMMANDS]));
    expect(candidates).toEqual(
      expect.arrayContaining([
        "entity list",
        "fixture fetch",
        "migrate connections",
        "i18n check",
        "task definitions",
        "cdd rules",
      ]),
    );
    expect(harness.handlers.sync).toHaveBeenCalledOnce();
  });

  it("명령 선택을 취소하면 수명주기와 핸들러를 호출하지 않고 130으로 끝난다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness([]);
    harness.command.mockResolvedValue(undefined);
    harness.handlers.sync = vi.fn();

    const result = await runSonamuCli(harness.options);

    expect(result).toMatchObject({ exitCode: 130, error: { code: "CANCELLED" } });
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.handlers.sync).not.toHaveBeenCalled();
  });
});

describe("엔티티 후보 탐색", () => {
  it.each([
    { args: ["entity", "show"], command: "entity.show" },
    { args: ["scaffold", "model"], command: "scaffold.model" },
    { args: ["cone", "gen"], command: "cone.gen" },
    {
      args: ["fixture", "import", "1", "--execute", "--confirm"],
      command: "fixture.import",
    },
  ])("$command의 누락 엔티티를 실제 후보에서 선택한다", async ({ args, command }) => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness(args);
    harness.entity.mockResolvedValue("User");
    harness.handlers[command] = vi.fn(async (input) => input);

    const result = await runSonamuCli(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.entities).toHaveBeenCalledWith({ command });
    expect(harness.entity).toHaveBeenCalledWith("", { command, candidates: ENTITY_IDS });
    const expectedInput =
      command === "fixture.import" ? { entityId: "User", recordIds: [1] } : { entityId: "User" };
    expect(harness.handlers[command]).toHaveBeenCalledWith(
      expect.objectContaining(expectedInput),
      expect.anything(),
    );
  });

  it.each([
    { args: ["entity", "show", "Usr"], command: "entity.show" },
    { args: ["scaffold", "model", "Usr"], command: "scaffold.model" },
    { args: ["cone", "gen", "Usr"], command: "cone.gen" },
    {
      args: ["fixture", "import", "Usr", "1", "--execute", "--confirm"],
      command: "fixture.import",
    },
  ])("$command의 오타를 실제 후보에서 교정한다", async ({ args, command }) => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness(args);
    harness.entity.mockResolvedValue("User");
    harness.handlers[command] = vi.fn(async (input) => input);

    const result = await runSonamuCli(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.entities).toHaveBeenCalledWith({ command });
    expect(harness.entity).toHaveBeenCalledWith("Usr", { command, candidates: ENTITY_IDS });
    const expectedInput =
      command === "fixture.import" ? { entityId: "User", recordIds: [1] } : { entityId: "User" };
    expect(harness.handlers[command]).toHaveBeenCalledWith(
      expect.objectContaining(expectedInput),
      expect.anything(),
    );
  });

  it.each([
    { args: ["entity", "show", "User"], command: "entity.show" },
    { args: ["scaffold", "model", "User"], command: "scaffold.model" },
    { args: ["cone", "gen", "User"], command: "cone.gen" },
    {
      args: ["fixture", "import", "User", "1", "--execute", "--confirm"],
      command: "fixture.import",
    },
  ])("$command의 유효한 명시 엔티티는 탐색과 질문을 생략한다", async ({ args, command }) => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness(args);
    harness.handlers[command] = vi.fn(async (input) => input);

    const result = await runSonamuCli(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.entities).toHaveBeenCalledWith({ command });
    expect(harness.entity).not.toHaveBeenCalled();
    expect(harness.prompt.select).not.toHaveBeenCalled();
    expect(harness.prompt.text).not.toHaveBeenCalled();
    const expectedInput =
      command === "fixture.import" ? { entityId: "User", recordIds: [1] } : { entityId: "User" };
    expect(harness.handlers[command]).toHaveBeenCalledWith(
      expect.objectContaining(expectedInput),
      expect.anything(),
    );
  });
});

describe("기본 대화형 어댑터", () => {
  it("엔티티를 자유 입력 대신 실제 후보 자동완성으로 선택한다", async () => {
    const { createDefaultInteraction, runSonamuCli } = await importRuntime();
    const prompt = createPrompt();
    prompt.select.mockResolvedValue({ value: "User" });
    const interaction = createDefaultInteraction({
      prompt,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const harness = createHarness(["scaffold", "model"]);
    harness.options.interaction = interaction;
    harness.handlers["scaffold.model"] = vi.fn(async (input) => input);

    const result = await runSonamuCli(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.entities).toHaveBeenCalledWith({ command: "scaffold.model" });
    expect(prompt.select).toHaveBeenCalledWith({
      message: expect.stringMatching(/Entity/i),
      choices: ENTITY_IDS,
    });
    expect(prompt.text).not.toHaveBeenCalled();
    expect(harness.handlers["scaffold.model"]).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "User" }),
      expect.anything(),
    );
  });

  it.each([
    { stdinIsTTY: false, stdoutIsTTY: true, args: ["scaffold", "model"] },
    { stdinIsTTY: true, stdoutIsTTY: true, args: ["scaffold", "model", "--non-interactive"] },
  ])(
    "TTY/비대화형 조건이 $stdinIsTTY/$stdoutIsTTY이면 엔티티를 질문하지 않는다",
    async ({ stdinIsTTY, stdoutIsTTY, args }) => {
      const { createDefaultInteraction, runSonamuCli } = await importRuntime();
      const prompt = createPrompt();
      const interaction = createDefaultInteraction({ prompt, stdinIsTTY, stdoutIsTTY });
      const harness = createHarness(args);
      harness.options.interaction = interaction;
      harness.handlers["scaffold.model"] = vi.fn();

      const result = await runSonamuCli(harness.options);

      expect(result).toMatchObject({ exitCode: 2, error: { code: "MISSING_ARGUMENT" } });
      expect(prompt.select).not.toHaveBeenCalled();
      expect(prompt.text).not.toHaveBeenCalled();
      expect(harness.handlers["scaffold.model"]).not.toHaveBeenCalled();
    },
  );
});

describe("비대화형 무인자 실패", () => {
  it("TTY가 아니면 탐색하지 않고 명령 힌트와 함께 즉시 사용 오류를 반환한다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness([]);
    harness.options.interaction.stdinIsTTY = false;
    harness.command.mockRejectedValue(new Error("호출되면 안 됨"));

    const result = await runSonamuCli(harness.options);

    expect(result).toMatchObject({
      exitCode: 2,
      error: { code: "UNKNOWN_COMMAND", hint: expect.stringMatching(/command|help/i) },
    });
    expect(harness.command).not.toHaveBeenCalled();
    expect(harness.init).not.toHaveBeenCalled();
  });
});
