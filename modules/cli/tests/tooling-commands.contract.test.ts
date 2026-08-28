import { describe, expect, it, vi } from "vitest";

import { type CliHandler } from "../src/runtime";
import { type CommandInput } from "../src/types";

async function importProduction(relativePath: string) {
  return import(/* @vite-ignore */ new URL(relativePath, import.meta.url).href);
}

async function parse(args: readonly string[]) {
  const { createSonamuProgram, parseSonamuArgs } = await importProduction("../src/program.ts");
  return parseSonamuArgs(createSonamuProgram({ version: "0.10.12" }), args);
}

describe("Web UI 대체 명령 문법", () => {
  const readCommands = [
    ["entity 목록", ["entity", "list"], { command: "entity.list" }],
    [
      "entity 상세",
      ["entity", "show", "User"],
      { command: "entity.show", arguments: { entityId: "User" } },
    ],
    [
      "entity 검색",
      ["entity", "search", "회원 이메일"],
      { command: "entity.search", arguments: { query: "회원 이메일" } },
    ],
    ["migrate 연결", ["migrate", "connections"], { command: "migrate.connections" }],
    [
      "migrate 코드",
      ["migrate", "code", "staging"],
      { command: "migrate.code", arguments: { target: "staging" } },
    ],
    [
      "migrate 미리보기",
      ["migrate", "preview", "production", "--action", "rollback"],
      {
        command: "migrate.preview",
        arguments: { target: "production" },
        options: { action: "rollback" },
      },
    ],
    [
      "migrate shadow",
      ["migrate", "shadow", "test"],
      { command: "migrate.shadow", arguments: { target: "test" } },
    ],
    [
      "i18n 목록",
      ["i18n", "list", "--locale", "ko"],
      { command: "i18n.list", options: { locale: "ko" } },
    ],
    ["i18n 검사", ["i18n", "check"], { command: "i18n.check" }],
    ["task 정의", ["task", "definitions"], { command: "task.definitions" }],
    ["task 목록", ["task", "list"], { command: "task.list" }],
    [
      "task 상세",
      ["task", "show", "run-1"],
      { command: "task.show", arguments: { runId: "run-1" } },
    ],
    [
      "task 단계",
      ["task", "steps", "run-1"],
      { command: "task.steps", arguments: { runId: "run-1" } },
    ],
    [
      "task 감시",
      ["task", "watch", "run-1"],
      { command: "task.watch", arguments: { runId: "run-1" } },
    ],
    ["CDD 트리", ["cdd", "tree"], { command: "cdd.tree" }],
    [
      "CDD 문서",
      ["cdd", "read", "users/signup.md"],
      { command: "cdd.read", arguments: { path: "users/signup.md" } },
    ],
    ["CDD 규칙 목록", ["cdd", "rules"], { command: "cdd.rules" }],
    [
      "CDD 규칙 상세",
      ["cdd", "rule", "show", "R1"],
      { command: "cdd.rule.show", arguments: { ruleId: "R1" } },
    ],
  ] as const;

  it.each(readCommands)("%s 입력을 손실 없이 해석한다", async (_name, args, expected) => {
    await expect(parse(args)).resolves.toMatchObject({
      arguments: {},
      options: {},
      passthrough: [],
      ...expected,
    });
  });

  it.each([
    [
      "entity patch 파일 preview",
      ["entity", "apply", "--file", "entity.patch.json"],
      {
        command: "entity.apply",
        options: { file: "entity.patch.json", dryRun: true, execute: false },
      },
    ],
    [
      "entity patch 표준 입력 실행",
      ["entity", "apply", "--file", "-", "--execute", "--confirm"],
      {
        command: "entity.apply",
        options: { file: "-", dryRun: false, execute: true, confirm: true },
      },
    ],
    [
      "migrate rollback preview",
      ["migrate", "rollback", "staging", "--dry-run"],
      {
        command: "migrate.rollback",
        arguments: { target: "staging" },
        options: { dryRun: true, execute: false },
      },
    ],
    [
      "migrate rollback 승인 실행",
      [
        "migrate",
        "rollback",
        "production",
        "--execute",
        "--confirm",
        "--force-reason",
        "incident-42",
      ],
      {
        command: "migrate.rollback",
        arguments: { target: "production" },
        options: {
          dryRun: false,
          execute: true,
          confirm: true,
          forceReason: "incident-42",
        },
      },
    ],
    [
      "기존 migrate apply 명시 실행",
      [
        "migrate",
        "apply",
        "staging",
        "production",
        "--execute",
        "--confirm",
        "--force-reason",
        "release-42",
      ],
      {
        command: "migrate.apply",
        arguments: { targets: ["staging", "production"] },
        options: { execute: true, confirm: true, forceReason: "release-42" },
      },
    ],
    [
      "i18n 삭제 실행",
      ["i18n", "delete", "user.email", "--execute", "--confirm"],
      {
        command: "i18n.delete",
        arguments: { key: "user.email" },
        options: { execute: true, confirm: true },
      },
    ],
    [
      "task 일시 정지 실행",
      ["task", "pause", "run-1", "--execute", "--confirm"],
      {
        command: "task.pause",
        arguments: { runId: "run-1" },
        options: { execute: true, confirm: true },
      },
    ],
    [
      "task 재개 실행",
      ["task", "resume", "run-1", "--execute", "--confirm"],
      {
        command: "task.resume",
        arguments: { runId: "run-1" },
        options: { execute: true, confirm: true },
      },
    ],
    [
      "task 취소 실행",
      ["task", "cancel", "run-1", "--execute", "--confirm"],
      {
        command: "task.cancel",
        arguments: { runId: "run-1" },
        options: { execute: true, confirm: true },
      },
    ],
    [
      "CDD 규칙 추가",
      [
        "cdd",
        "rule",
        "add",
        "--rule-key",
        "authentication",
        "--id",
        "R2",
        "--when",
        "탈퇴한 사용자가 로그인할 때",
        "--text",
        "탈퇴 사용자는 로그인할 수 없다",
      ],
      {
        command: "cdd.rule.add",
        options: {
          ruleKey: "authentication",
          id: "R2",
          when: "탈퇴한 사용자가 로그인할 때",
          text: "탈퇴 사용자는 로그인할 수 없다",
        },
      },
    ],
    [
      "CDD 인수 조건 추가",
      ["cdd", "ac", "--document", "users/signup.md", "--text", "중복 이메일 가입을 거절한다"],
      {
        command: "cdd.ac",
        options: {
          document: "users/signup.md",
          text: "중복 이메일 가입을 거절한다",
        },
      },
    ],
  ] as const)("%s의 안전 옵션을 보존한다", async (_name, args, expected) => {
    await expect(parse(args)).resolves.toMatchObject(expected);
  });

  it("scaffold 대상의 반복 값과 쉼표 값을 평탄화하고 덮어쓰기를 명시한다", async () => {
    await expect(
      parse([
        "scaffold",
        "batch",
        "--entity",
        "User,Post",
        "--entity",
        "Comment",
        "--template",
        "model,view_search_input",
        "--template",
        "view_list",
        "--overwrite",
      ]),
    ).resolves.toMatchObject({
      command: "scaffold.batch",
      options: {
        entities: ["User", "Post", "Comment"],
        templates: ["model", "view_search_input", "view_list"],
        overwrite: true,
      },
    });

    await expect(
      parse(["scaffold", "status", "--entity", "User", "--template", "view_search_input"]),
    ).resolves.toMatchObject({
      command: "scaffold.status",
      options: { entities: ["User"], templates: ["view_search_input"] },
    });
    await expect(
      parse(["scaffold", "preview", "--entity", "User", "--template", "model"]),
    ).resolves.toMatchObject({
      command: "scaffold.preview",
      options: { entities: ["User"], templates: ["model"] },
    });
  });

  it("fixture 조회 옵션을 타입과 순서를 유지해 해석한다", async () => {
    await expect(
      parse([
        "fixture",
        "fetch",
        "Order",
        "--source",
        "production",
        "--target",
        "fixture",
        "--field",
        "order_no",
        "--value",
        "A-10,A-20",
        "--value",
        "A-30",
        "--relation",
        "include",
        "--depth",
        "3",
        "--strategy",
        "recent",
        "--dry-run",
      ]),
    ).resolves.toMatchObject({
      command: "fixture.fetch",
      arguments: { entityId: "Order" },
      options: {
        source: "production",
        target: "fixture",
        field: "order_no",
        values: ["A-10", "A-20", "A-30"],
        relations: "include",
        depth: 3,
        strategy: "recent",
        dryRun: true,
      },
    });
  });

  it.each([
    ["import", ["i18n", "import", "--format", "workbook", "--file", "terms.xlsx"]],
    [
      "export",
      ["i18n", "export", "--format", "workbook", "--file", "terms.xlsx", "--locale", "ko"],
    ],
  ] as const)("i18n %s의 구조화된 파일 옵션을 해석한다", async (operation, args) => {
    const expectedOptions =
      operation === "export"
        ? { format: "workbook", file: "terms.xlsx", locale: "ko" }
        : { format: "workbook", file: "terms.xlsx" };

    await expect(parse(args)).resolves.toMatchObject({
      command: `i18n.${operation}`,
      options: expectedOptions,
    });
  });

  it.each(["create", "update"] as const)(
    "i18n %s의 반복 locale=value를 객체로 만든다",
    async (operation) => {
      await expect(
        parse(["i18n", operation, "user.name", "--value", "ko=이름", "--value", "en=Name"]),
      ).resolves.toMatchObject({
        command: `i18n.${operation}`,
        arguments: { key: "user.name" },
        options: { values: { ko: "이름", en: "Name" } },
      });
    },
  );

  it.each([
    [["entity", "apply", "--file", "patch.json", "--dry-run", "--execute"], "INVALID"],
    [["scaffold", "batch", "--entity", "User", "--template", "desktop"], "INVALID"],
    [["i18n", "create", "user.name", "--value", "broken"], "INVALID"],
  ] as const)("충돌하거나 구조가 잘못된 입력 %j을 사용 오류로 거절한다", async (args, code) => {
    await expect(parse(args)).rejects.toMatchObject({
      code: expect.stringContaining(code),
      exitCode: 2,
    });
  });
});

describe("tooling handler 구성", () => {
  it("모든 lifecycle 명령에 실행 handler를 등록한다", async () => {
    const [{ CLI_HANDLERS }, { COMMAND_LIFECYCLE_POLICIES }] = await Promise.all([
      importProduction("../src/handlers.ts"),
      importProduction("../src/lifecycle.ts"),
    ]);

    for (const command of Object.keys(COMMAND_LIFECYCLE_POLICIES)) {
      expect(CLI_HANDLERS[command], command).toEqual(expect.any(Function));
    }
  });
});

function createRuntimeHarness(
  args: readonly string[],
  command: string,
  handler: CliHandler = vi.fn(async () => ({})),
) {
  const stdout: string[] = [];
  return {
    handler,
    stdout,
    options: {
      args,
      version: "0.10.12",
      interaction: {
        enabled: false,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        prompt: { select: vi.fn(), text: vi.fn(), confirm: vi.fn() },
      },
      output: { stdout: (chunk: string) => stdout.push(chunk), stderr: vi.fn() },
      exit: { setExitCode: vi.fn() },
      handlers: { [command]: handler },
      lifecycle: { init: vi.fn(), destroy: vi.fn() },
    },
  };
}

async function* taskWatchEvents() {
  yield { type: "step", id: "step-1", state: "completed" };
  yield { type: "finished", id: "run-1", ok: true };
}

describe("비대화형 실행 안전성", () => {
  it.each([
    ["entity apply", ["entity", "apply", "--file", "patch.json", "--execute"], "entity.apply"],
    [
      "scaffold batch",
      ["scaffold", "batch", "--entity", "User", "--template", "model", "--execute"],
      "scaffold.batch",
    ],
    ["migrate rollback", ["migrate", "rollback", "production", "--execute"], "migrate.rollback"],
    ["i18n delete", ["i18n", "delete", "user.email", "--execute"], "i18n.delete"],
    ["task pause", ["task", "pause", "run-1", "--execute"], "task.pause"],
  ] as const)(
    "%s는 실행 확인이 없으면 종료 코드 3이고 mutation을 호출하지 않는다",
    async (_name, args, command) => {
      const harness = createRuntimeHarness([...args, "--non-interactive", "--json"], command);
      const { runSonamuCli } = await importProduction("../src/runtime.ts");

      await expect(runSonamuCli(harness.options)).resolves.toMatchObject({
        exitCode: 3,
        error: { code: "CONFIRMATION_REQUIRED" },
      });
      expect(harness.handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["entity list", ["entity", "list"], "entity.list"],
    [
      "scaffold status",
      ["scaffold", "status", "--entity", "User", "--template", "model"],
      "scaffold.status",
    ],
    ["migrate connections", ["migrate", "connections"], "migrate.connections"],
    ["i18n check", ["i18n", "check"], "i18n.check"],
    ["task definitions", ["task", "definitions"], "task.definitions"],
    ["CDD tree", ["cdd", "tree"], "cdd.tree"],
  ] as const)(
    "%s 조회는 strict 비대화형 JSON 모드에서도 실행한다",
    async (_name, args, command) => {
      const harness = createRuntimeHarness(
        ["--non-interactive", ...args, "--json"],
        command,
        vi.fn(async (input: CommandInput) => ({ input })),
      );
      const { runSonamuCli } = await importProduction("../src/runtime.ts");

      await expect(runSonamuCli(harness.options)).resolves.toMatchObject({ exitCode: 0 });
      expect(harness.handler).toHaveBeenCalledOnce();
      expect(harness.stdout).toHaveLength(1);
      expect(JSON.parse(harness.stdout[0])).toMatchObject({ ok: true, command });
    },
  );

  it("task watch는 JSON 이벤트를 NDJSON으로만 출력한다", async () => {
    const harness = createRuntimeHarness(
      ["task", "watch", "run-1", "--non-interactive", "--json"],
      "task.watch",
      vi.fn(() => taskWatchEvents()),
    );
    const { runSonamuCli } = await importProduction("../src/runtime.ts");

    await expect(runSonamuCli(harness.options)).resolves.toMatchObject({ exitCode: 0 });
    expect(harness.stdout.map((line) => JSON.parse(line))).toEqual([
      { type: "step", id: "step-1", state: "completed" },
      { type: "finished", id: "run-1", ok: true },
    ]);
  });
});
