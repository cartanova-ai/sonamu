import { type SonamuCliCommandInput, type SonamuCliPlugin } from "sonamu";
import { describe, expect, it, vi } from "vitest";

import { createDefaultInteraction, type RunSonamuCliOptions } from "../src/runtime.js";

async function run(options: RunSonamuCliOptions) {
  const { runSonamuCli } = await import("../src/runtime.js");
  return runSonamuCli(options);
}

async function* indexEvents() {
  yield { type: "indexed", count: 1 };
  yield { type: "done" };
}

function createFixture() {
  const inspect = vi.fn(async (input: SonamuCliCommandInput) => ({ inspected: input }));
  const reindex = vi.fn(async (input: SonamuCliCommandInput) => ({ dryRun: input.dryRun }));
  const drop = vi.fn(async () => ({ dropped: true }));
  const stream = vi.fn(() => indexEvents());
  const plugin: SonamuCliPlugin = {
    name: "search",
    commands: [
      {
        path: ["search", "inspect"],
        description: "Inspect a search index",
        arguments: [
          { name: "indexName", description: "Index to inspect" },
          { name: "ids", type: "integer", required: false, variadic: true },
        ],
        options: {
          maxRounds: { type: "integer", description: "Rounds to sample" },
          format: { type: "string", choices: ["table", "raw"] },
          tags: { type: "string", multiple: true },
        },
        run: inspect,
      },
      { path: ["search", "reindex"], mutation: { dryRun: true }, run: reindex },
      { path: ["search", "drop"], mutation: { dryRun: false }, run: drop },
      { path: ["search", "stream"], run: stream },
    ],
  };
  return { plugin, inspect, reindex, drop, stream };
}

function createHarness(
  args: readonly string[],
  overrides: Partial<RunSonamuCliOptions> & { readonly tty?: boolean } = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const order: string[] = [];
  const fixture = createFixture();
  const loadPlugins = vi.fn(async () => [fixture.plugin]);
  const prompt = { select: vi.fn(), text: vi.fn(), confirm: vi.fn() };
  const discovery = { command: vi.fn(), entity: vi.fn(), value: vi.fn() };
  const tty = overrides.tty ?? false;
  const init = vi.fn(async () => {
    order.push("init");
  });
  const destroy = vi.fn(async () => {
    order.push("destroy");
  });
  const options: RunSonamuCliOptions = {
    args,
    version: "0.0.0",
    interaction: { enabled: true, stdinIsTTY: tty, stdoutIsTTY: tty, prompt, discovery },
    output: {
      stdout: (chunk: string) => stdout.push(chunk),
      stderr: (chunk: string) => stderr.push(chunk),
    },
    exit: { setExitCode: vi.fn() },
    lifecycle: { init, destroy },
    handlers: { sync: vi.fn(async () => ({ synced: true })) },
    loadPlugins,
    ...overrides,
  };
  return {
    options,
    stdout,
    stderr,
    order,
    init,
    destroy,
    loadPlugins,
    prompt,
    discovery,
    ...fixture,
  };
}

describe("플러그인 명령 실행", () => {
  it("인자와 옵션을 파싱해 Sonamu 수명주기 안에서 run에 전달하고 사람용과 JSON으로 출력한다", async () => {
    const human = createHarness([
      "search",
      "inspect",
      "posts",
      "1",
      "2",
      "--max-rounds",
      "3",
      "--format",
      "raw",
    ]);
    human.inspect.mockImplementation(async (input) => {
      human.order.push("run");
      return { inspected: input };
    });

    const humanResult = await run(human.options);

    const expectedInput = {
      arguments: { indexName: "posts", ids: [1, 2] },
      options: { maxRounds: 3, format: "raw" },
      dryRun: false,
    };
    expect(humanResult.exitCode).toBe(0);
    expect(human.inspect).toHaveBeenCalledWith(expectedInput, {
      command: "search.inspect",
      json: false,
      interactive: false,
    });
    expect(human.order).toEqual(["init", "run", "destroy"]);
    expect(JSON.parse(human.stdout.join(""))).toEqual({ inspected: expectedInput });

    const json = createHarness(["search", "inspect", "posts", "--max-rounds", "3", "--json"]);
    await run(json.options);

    expect(json.stdout).toHaveLength(1);
    expect(JSON.parse(json.stdout[0])).toEqual({
      ok: true,
      command: "search.inspect",
      data: {
        inspected: {
          arguments: { indexName: "posts" },
          options: { maxRounds: 3 },
          dryRun: false,
        },
      },
      warnings: [],
    });
  });

  it("주지 않은 반복 옵션과 가변 인자는 빈 배열이 아니라 undefined로 전달한다", async () => {
    const absent = createHarness(["search", "inspect", "posts"]);
    await run(absent.options);
    const given = createHarness(["search", "inspect", "posts", "--tags", "a", "--tags", "b"]);
    await run(given.options);

    expect(absent.inspect.mock.calls[0][0].arguments.ids).toBeUndefined();
    expect(absent.inspect.mock.calls[0][0].options.tags).toBeUndefined();
    expect(given.inspect.mock.calls[0][0].options.tags).toEqual(["a", "b"]);
  });

  it("비동기 이터러블 결과는 이벤트마다 한 줄씩 스트리밍한다", async () => {
    const harness = createHarness(["search", "stream", "--json"]);

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.stdout.map((line) => JSON.parse(line))).toEqual([
      { type: "indexed", count: 1 },
      { type: "done" },
    ]);
  });

  it("run이 던진 오류의 code, exitCode, hint를 보고하고 수명주기를 해제한다", async () => {
    const harness = createHarness(["search", "stream", "--json"]);
    harness.stream.mockImplementation(() => {
      throw Object.assign(new Error("cluster unreachable"), {
        code: "SEARCH_UNAVAILABLE",
        exitCode: 4,
        hint: "Start OpenSearch.",
      });
    });

    const result = await run(harness.options);

    expect(result).toMatchObject({
      exitCode: 4,
      error: {
        code: "SEARCH_UNAVAILABLE",
        message: "cluster unreachable",
        hint: "Start OpenSearch.",
      },
    });
    expect(harness.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    [["search", "inspect", "posts", "--unknown"], "UNKNOWN_OPTION"],
    [["search", "inspect", "posts", "--max-rounds", "many"], "INVALID_OPTION_VALUE"],
    [["search", "inspect", "posts", "--format", "csv"], "INVALID_OPTION_VALUE"],
  ])("%j는 내장 명령과 같은 사용 오류 %s로 거부한다", async (args, code) => {
    const harness = createHarness(args);

    const result = await run(harness.options);

    expect(result).toMatchObject({ exitCode: 2, error: { code } });
    expect(harness.inspect).not.toHaveBeenCalled();
  });
});

describe("플러그인 변경 명령 승인", () => {
  it("dry run이 없는 변경 명령은 승인 없이 거부하고 승인하면 실행한다", async () => {
    const refused = createHarness(["search", "drop"]);
    await expect(run(refused.options)).resolves.toMatchObject({
      exitCode: 3,
      error: { code: "CONFIRMATION_REQUIRED" },
    });
    expect(refused.drop).not.toHaveBeenCalled();
    expect(refused.init).not.toHaveBeenCalled();

    const prompted = createHarness(["search", "drop"], { tty: true });
    prompted.prompt.confirm.mockResolvedValue({ value: false });
    await expect(run(prompted.options)).resolves.toMatchObject({ exitCode: 130 });
    expect(prompted.prompt.confirm).toHaveBeenCalledWith({
      message: "Run search.drop?",
      initial: false,
    });
    expect(prompted.drop).not.toHaveBeenCalled();

    const approved = createHarness(["search", "drop", "--execute", "--confirm"]);
    await expect(run(approved.options)).resolves.toMatchObject({ exitCode: 0 });
    expect(approved.drop).toHaveBeenCalledWith(
      { arguments: {}, options: {}, dryRun: false },
      expect.anything(),
    );
  });

  it("dry run이 있는 변경 명령은 승인 없이 dry run으로만 실행하고 실제 실행에는 승인이 필요하다", async () => {
    const dryRun = createHarness(["search", "reindex"]);
    await expect(run(dryRun.options)).resolves.toMatchObject({ exitCode: 0 });
    expect(dryRun.reindex).toHaveBeenCalledWith(
      { arguments: {}, options: {}, dryRun: true },
      expect.anything(),
    );

    const unapproved = createHarness(["search", "reindex", "--execute"]);
    await expect(run(unapproved.options)).resolves.toMatchObject({
      exitCode: 3,
      error: { code: "CONFIRMATION_REQUIRED" },
    });
    expect(unapproved.reindex).not.toHaveBeenCalled();

    const approved = createHarness(["search", "reindex", "--execute", "--confirm"]);
    await run(approved.options);
    expect(approved.reindex).toHaveBeenCalledWith(
      { arguments: {}, options: {}, dryRun: false },
      expect.anything(),
    );
  });
});

describe("플러그인 로딩 시점", () => {
  it("내장 명령은 플러그인을 로딩하지 않는다", async () => {
    const harness = createHarness(["sync"]);

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.loadPlugins).not.toHaveBeenCalled();
  });

  it("도움말은 플러그인 명령과 설명을 보여준다", async () => {
    const root = createHarness(["--help"]);
    const group = createHarness(["search", "--help"]);
    const command = createHarness(["search", "inspect", "--help"]);

    await run(root.options);
    await run(group.options);
    await run(command.options);

    expect(root.stdout.join("")).toMatch(/search/);
    expect(root.stdout.join("")).toMatch(/migrate/);
    expect(group.stdout.join("")).toMatch(/inspect[\s\S]*Inspect a search index/);
    expect(command.stdout.join("")).toMatch(/--max-rounds[\s\S]*Rounds to sample/);
    expect(command.stdout.join("")).toMatch(/Index to inspect/);
  });

  it("대화형 명령 선택기는 플러그인 명령을 후보로 보여준다", async () => {
    const harness = createHarness([], { tty: true });
    harness.discovery.command.mockResolvedValue(undefined);

    await run(harness.options);

    expect(harness.discovery.command).toHaveBeenCalledWith(
      "",
      expect.arrayContaining(["search", "sync"]),
    );
  });

  it("로딩에 실패해도 내장 명령 도움말을 보여주고 stderr에 한 줄로 알린다", async () => {
    const harness = createHarness(["--help"], {
      loadPlugins: async () => {
        throw new Error(
          "dist/sonamu.config.js not found. Build the project first (sonamu build).\nstack",
        );
      },
    });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.stdout.join("")).toMatch(/migrate/);
    expect(harness.stderr).toEqual([
      "Plugin commands could not be loaded: dist/sonamu.config.js not found. Build the project first (sonamu build).\n",
    ]);
  });

  it("셸 자동 완성은 로딩에 실패해도 stderr에 아무것도 쓰지 않고 내장 명령을 완성한다", async () => {
    const harness = createHarness(["completion", "zsh", "mig"], {
      loadPlugins: async () => {
        throw new Error("Build the project first (sonamu build).");
      },
    });

    const result = await run(harness.options);

    expect(result.exitCode).toBe(0);
    expect(harness.stdout.join("")).toMatch(/migrate/);
    expect(harness.stderr).toEqual([]);
  });

  it.each([
    [
      "로딩 실패",
      async () => {
        throw new Error("Build the project first (sonamu build).");
      },
      /could not be loaded: Build the project first/,
    ],
    ["제공 플러그인 없음", async () => [], /no CLI plugin provides it/],
  ])(
    "내장이 아닌 첫 단어는 %s 사유를 힌트로 단 알 수 없는 명령 오류가 된다",
    async (_title, loadPlugins, hint) => {
      const harness = createHarness(["search", "inspect"], { loadPlugins });

      const result = await run(harness.options);

      expect(result).toMatchObject({
        exitCode: 2,
        error: { code: "UNKNOWN_COMMAND", hint: expect.stringMatching(hint) },
      });
    },
  );

  it.each([
    [{ path: ["migrate", "search"] }, /"migrate" is a built-in command/],
    [{ path: ["help"] }, /"help" is reserved/],
    [{ path: ["search"], options: { json: { type: "boolean" } } }, /"--json" is reserved/],
  ] as const)(
    "CLI 문법과 충돌하는 플러그인 %j를 플러그인 이름과 함께 거부한다",
    async (declared, rule) => {
      const harness = createHarness(["--help"], {
        loadPlugins: async () => [{ name: "rogue", commands: [{ ...declared, run: () => null }] }],
      });

      await run(harness.options);

      expect(harness.stderr).toHaveLength(1);
      expect(harness.stderr[0]).toMatch(/CLI plugin "rogue"/);
      expect(harness.stderr[0]).toMatch(rule);
    },
  );

  it("터미널이 아닌 스트림에서는 기본 상호작용의 터미널 여부가 undefined가 아니라 false다", () => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
    try {
      expect(createDefaultInteraction({ stdoutIsTTY: true }).stdinIsTTY).toBe(false);
    } finally {
      if (original === undefined) Reflect.deleteProperty(process.stdin, "isTTY");
      else Object.defineProperty(process.stdin, "isTTY", original);
    }
  });
});
