import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  RECOMMENDED_ADMIN_TIMEOUTS,
  RECOMMENDED_CUTOVER,
  RECOMMENDED_WORKER_LIMITS,
} from "../../src/defaults";
import { createPostgresSynchronization } from "../../src/postgres";
import { createSearchCliPlugin, type SearchCliSetup } from "../../src/sonamu";
import { createTestDefinition, TEST_READ_LIFETIMES } from "../../src/testing";

// Stands in for the database: a command that got past the logical key reaches it.
const reachDatabase = vi.fn(() => {
  throw new Error("no database in unit tests");
});

function setupWith(keys: readonly string[]): SearchCliSetup {
  return {
    definitions: keys.map((key) =>
      createTestDefinition({ key, schema: z.object({ title: z.string() }) }),
    ),
    synchronization: createPostgresSynchronization({
      getPrimaryDatabase: reachDatabase,
      namespace: "app",
    }),
    admin: {
      lifetimes: { ...TEST_READ_LIFETIMES, retirementSafetyMarginMs: 60_000 },
      timeouts: RECOMMENDED_ADMIN_TIMEOUTS,
      cutover: RECOMMENDED_CUTOVER,
    },
    workerLimits: RECOMMENDED_WORKER_LIMITS,
  };
}

function inspectRunner(keys: readonly string[]) {
  const command = createSearchCliPlugin({ load: () => setupWith(keys) }).commands.find(
    (candidate) => candidate.path.join(" ") === "search inspect",
  );
  if (command === undefined) throw new Error("search inspect가 없습니다.");
  return (logicalKey?: string) =>
    Promise.resolve(
      command.run(
        { arguments: { logicalKey }, options: {}, dryRun: false },
        { command: "search.inspect", json: true, interactive: false },
      ),
    );
}

describe("검색 CLI 플러그인 선언", () => {
  const plugin = createSearchCliPlugin({ load: () => setupWith(["notes"]) });

  it("모든 명령이 search 아래에 있고, 변경 명령만 mutation을 선언하며 dry run은 미리보기가 있는 명령뿐이다", () => {
    expect(plugin.name).toBe("search");
    expect(
      plugin.commands.map((command) => [command.path.join(" "), command.mutation ?? null]),
    ).toEqual([
      ["search inspect", null],
      ["search init", { dryRun: true }],
      ["search backfill", { dryRun: false }],
      ["search cutover", { dryRun: true }],
      ["search rollback", { dryRun: false }],
      ["search retire-old", { dryRun: false }],
      ["search suspend", { dryRun: false }],
      ["search resume", { dryRun: false }],
      ["search verify", { dryRun: false }],
      ["search resume-target", { dryRun: false }],
      ["search reconcile", { dryRun: false }],
      ["search remark", { dryRun: false }],
      ["search retry-quarantined", { dryRun: false }],
      ["search drain", { dryRun: false }],
      ["search adopt-store", { dryRun: false }],
      ["search confirm-ownership", { dryRun: false }],
    ]);
  });

  it("인자와 옵션이 계약을 지킨다: 선택 인자는 logical key 하나이고, 옵션 키는 camelCase이며 타입별 속성만 쓴다", () => {
    for (const command of plugin.commands) {
      const where = command.path.join(" ");
      expect(command.description, where).toEqual(expect.any(String));
      for (const argument of command.arguments ?? []) {
        expect(argument, where).toEqual({
          name: "logicalKey",
          required: false,
          description: expect.any(String),
        });
      }
      for (const [key, option] of Object.entries(command.options ?? {})) {
        expect(key, where).toMatch(/^[a-z][a-zA-Z]*$/);
        if (option.type !== "string") expect(option.choices, `${where} --${key}`).toBeUndefined();
        if (option.type === "boolean") {
          expect([option.required, option.multiple], `${where} --${key}`).toEqual([
            undefined,
            undefined,
          ]);
        }
      }
      // Mutations carry the audit options; read-only commands do not.
      expect(Object.hasOwn(command.options ?? {}, "operationId"), where).toBe(
        command.mutation !== undefined,
      );
    }
  });
});

describe("logical key 규칙", () => {
  it("key가 하나면 생략할 수 있다", async () => {
    reachDatabase.mockClear();
    await expect(inspectRunner(["notes"])()).rejects.toThrow();
    expect(reachDatabase).toHaveBeenCalled();
  });

  it("key가 여럿이면 생략할 때 key 목록과 함께 거부하고, 지정한 key로는 진행한다", async () => {
    const run = inspectRunner(["notes", "posts"]);
    reachDatabase.mockClear();
    await expect(run()).rejects.toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
      exitCode: 2,
      details: { reason: "logical-key-required", keys: "notes, posts", retryable: false },
    });
    expect(reachDatabase).not.toHaveBeenCalled();
    await expect(run("posts")).rejects.toThrow();
    expect(reachDatabase).toHaveBeenCalled();
  });

  it("정의에 없는 key는 key 목록과 함께 거부한다", async () => {
    await expect(inspectRunner(["notes", "posts"])("other")).rejects.toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
      exitCode: 2,
      details: { reason: "logical-key-unknown", logicalKey: "other", keys: "notes, posts" },
    });
  });
});
