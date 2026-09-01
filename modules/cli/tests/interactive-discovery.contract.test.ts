import { describe, expect, it, vi } from "vitest";

const ENTITY_IDS = ["Comment", "Post", "User"] as const;

interface EntityDiscoveryContext {
  readonly command: string;
  readonly candidates: readonly string[];
}

interface SelectRequest {
  readonly message: string;
  readonly choices?: readonly string[];
  readonly initial?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly hints?: Readonly<Record<string, string>>;
  readonly descriptions?: Readonly<Record<string, string>>;
}

async function importRuntime() {
  return import(/* @vite-ignore */ new URL("../src/runtime.ts", import.meta.url).href);
}

function createPrompt() {
  return {
    select: vi.fn(
      async (_request: SelectRequest): Promise<{ value?: string; cancelled?: boolean }> => ({
        cancelled: true,
      }),
    ),
    multiselect: vi.fn(
      async (): Promise<{ value?: readonly string[]; cancelled?: boolean }> => ({
        cancelled: true,
      }),
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
  it("최상위 그룹부터 하위 명령을 단계적으로 선택해 같은 핸들러를 실행한다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness([]);
    harness.command.mockResolvedValueOnce("migrate").mockResolvedValueOnce("migrate apply");
    harness.prompt.multiselect.mockResolvedValue({ value: ["development"] });
    harness.prompt.confirm.mockResolvedValue({ value: true });
    harness.handlers["migrate.apply"] = vi.fn(async (input) => input);

    const result = await runSonamuCli(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.command).toHaveBeenNthCalledWith(1, "", expect.any(Array));
    const topLevelCandidates = harness.command.mock.calls[0][1];
    expect(topLevelCandidates).toContain("migrate");
    expect(topLevelCandidates).not.toContain("migrate apply");
    expect(topLevelCandidates.every((candidate) => !candidate.includes(" "))).toBe(true);
    expect(harness.command).toHaveBeenNthCalledWith(
      2,
      "migrate",
      expect.arrayContaining(["migrate apply", "migrate status", "migrate rollback"]),
    );
    expect(harness.command.mock.calls[1][1]).not.toContain("entity list");
    expect(harness.prompt.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/migration targets/i) }),
    );
    expect(harness.handlers["migrate.apply"]).toHaveBeenCalledWith(
      expect.objectContaining({ passthrough: [], targets: ["development"] }),
      expect.objectContaining({ command: "migrate.apply" }),
    );
  });

  it.each([["migrate"], ["mig"]])(
    "불완전한 %s 입력에서 마이그레이션 하위 명령을 선택한다",
    async (...args) => {
      const { runSonamuCli } = await importRuntime();
      const harness = createHarness(args);
      if (args[0] === "mig") {
        harness.command.mockResolvedValueOnce("migrate").mockResolvedValueOnce("migrate status");
      } else {
        harness.command.mockResolvedValueOnce("migrate status");
      }
      harness.handlers["migrate.status"] = vi.fn(async () => ({ ok: true }));

      await expect(runSonamuCli(harness.options)).resolves.toMatchObject({ exitCode: 0 });

      const nestedCall = harness.command.mock.calls.at(-1);
      expect(nestedCall).toEqual([
        "migrate",
        expect.arrayContaining(["migrate run", "migrate status", "migrate rollback"]),
      ]);
      expect(nestedCall?.[1]).not.toContain("fixture init");
      expect(harness.handlers["migrate.status"]).toHaveBeenCalledOnce();
    },
  );

  it("명시한 CDD 그룹은 중복 없는 바로 아래 명령만 탐색한다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness(["cdd"]);
    harness.command.mockResolvedValue("cdd tree");
    harness.handlers["cdd.tree"] = vi.fn(async () => ({ ok: true }));

    await expect(runSonamuCli(harness.options)).resolves.toMatchObject({ exitCode: 0 });

    expect(harness.command).toHaveBeenCalledOnce();
    const candidates = harness.command.mock.calls[0][1];
    expect(candidates.filter((candidate) => candidate === "cdd rule")).toHaveLength(1);
    expect(candidates).not.toContain("cdd rule show");
    expect(harness.handlers["cdd.tree"]).toHaveBeenCalledOnce();
  });

  it("중첩 그룹을 한 단계씩 선택해 최종 명령 경로까지 탐색한다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness([]);
    harness.command
      .mockResolvedValueOnce("cdd")
      .mockResolvedValueOnce("cdd rule")
      .mockResolvedValueOnce("cdd rule show");
    harness.handlers["cdd.rule.show"] = vi.fn(async () => ({ shown: true }));
    const explicitHarness = createHarness(["cdd", "rule", "show"]);
    explicitHarness.options.interaction.enabled = false;
    explicitHarness.options.interaction.stdinIsTTY = false;
    explicitHarness.options.interaction.stdoutIsTTY = false;
    explicitHarness.handlers["cdd.rule.show"] = vi.fn(async () => ({ shown: true }));

    const [result, explicitResult] = await Promise.all([
      runSonamuCli(harness.options),
      runSonamuCli(explicitHarness.options),
    ]);

    expect(result.exitCode).toBe(explicitResult.exitCode);
    expect(result.error?.code).toBe(explicitResult.error?.code);

    expect(harness.command).toHaveBeenNthCalledWith(2, "cdd", expect.any(Array));
    const cddCandidates = harness.command.mock.calls[1][1];
    expect(cddCandidates.filter((candidate) => candidate === "cdd rule")).toHaveLength(1);
    expect(cddCandidates).not.toContain("cdd rule show");
    expect(harness.command).toHaveBeenNthCalledWith(
      3,
      "cdd rule",
      expect.arrayContaining(["cdd rule show", "cdd rule add"]),
    );
    expect(harness.handlers["cdd.rule.show"]).not.toHaveBeenCalled();
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(explicitHarness.handlers["cdd.rule.show"]).not.toHaveBeenCalled();
    expect(explicitHarness.init).not.toHaveBeenCalled();
    expect(explicitHarness.destroy).not.toHaveBeenCalled();
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

  it("잘못된 최상위 토큰의 자동완성을 취소하면 수명주기와 핸들러 없이 130으로 끝난다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness(["mig"]);
    harness.command.mockResolvedValue(undefined);
    harness.handlers["migrate.status"] = vi.fn();

    const result = await runSonamuCli(harness.options);

    expect(harness.command).toHaveBeenCalledWith("mig", expect.any(Array));
    expect(result).toMatchObject({ exitCode: 130, error: { code: "CANCELLED" } });
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.handlers["migrate.status"]).not.toHaveBeenCalled();
  });

  it("중첩 명령 선택을 취소하면 수명주기와 핸들러를 호출하지 않고 130으로 끝난다", async () => {
    const { runSonamuCli } = await importRuntime();
    const harness = createHarness([]);
    harness.command.mockResolvedValueOnce("migrate").mockResolvedValueOnce(undefined);
    harness.handlers["migrate.apply"] = vi.fn();

    const result = await runSonamuCli(harness.options);

    expect(result).toMatchObject({ exitCode: 130, error: { code: "CANCELLED" } });
    expect(harness.init).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.handlers["migrate.apply"]).not.toHaveBeenCalled();
  });

  it("기본 상호작용은 입력값과 의미 있는 명령 안내를 선택 프롬프트에 전달한다", async () => {
    const { createDefaultInteraction } = await importRuntime();
    const prompt = createPrompt();
    prompt.select.mockResolvedValue({ value: "migrate" });
    const interaction = createDefaultInteraction({ prompt, stdinIsTTY: true, stdoutIsTTY: true });

    await interaction.discovery?.command?.("mig", ["migrate", "fixture"]);

    expect(prompt.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/command/i),
        choices: ["migrate", "fixture"],
        initial: "mig",
      }),
    );
    const request = prompt.select.mock.calls[0][0];
    expect(request.message).not.toMatch(/select a value for/i);
    const presentation = request.labels ?? request.hints ?? request.descriptions;
    expect(presentation).toBeDefined();
    expect((presentation?.migrate ?? "").trim()).not.toBe("");
    expect((presentation?.fixture ?? "").trim()).not.toBe("");
  });

  it("정확한 마이그레이션 그룹은 빈 검색어와 하위 명령 설명으로 탐색한다", async () => {
    const { createDefaultInteraction } = await importRuntime();
    const prompt = createPrompt();
    const interaction = createDefaultInteraction({ prompt, stdinIsTTY: true, stdoutIsTTY: true });

    await interaction.discovery?.command?.("migrate", [
      "migrate run",
      "migrate apply",
      "migrate status",
    ]);

    expect(prompt.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/migrate command/i),
        choices: ["migrate run", "migrate apply", "migrate status"],
        initial: "",
        labels: {
          "migrate run": "run",
          "migrate apply": "apply",
          "migrate status": "status",
        },
      }),
    );
    const request = prompt.select.mock.calls[0][0];
    const runHint = request.hints?.["migrate run"] ?? "";
    const statusHint = request.hints?.["migrate status"] ?? "";
    expect.soft(runHint).not.toMatch(/continue with/i);
    expect.soft(statusHint).not.toMatch(/continue with/i);
    expect(`${runHint} ${statusHint}`).toMatch(
      /migration|pending|applied|execute|database|schema/i,
    );
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
