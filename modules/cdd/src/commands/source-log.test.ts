import { describe, expect, it } from "vitest";
import type { CddProject } from "../core/types.js";
import type { AiCallOptions, AiCallResult } from "../utils/ai.js";
import type { GitHistoryCommit } from "../utils/git.js";
import type { LogDeps } from "./log-core.js";
import { runSourceLog } from "./source-log.js";

// --- 테스트 헬퍼 ---

function makeCommit(
  overrides: Partial<GitHistoryCommit> & { authoredAt: string },
): GitHistoryCommit {
  return {
    hash: "a".repeat(40),
    author: { name: "Alice", email: "alice@test.com" },
    subject: "feat: test",
    body: "",
    files: [],
    totalAdded: 0,
    totalRemoved: 0,
    ...overrides,
  };
}

function makeProject(): CddProject {
  return {
    contractDir: "/project/contract",
    projectRoot: "/project",
    contracts: [],
    specs: [],
  };
}

function stubListFileHistory(commits: GitHistoryCommit[]): LogDeps["listFileHistory"] {
  return async (_path, _opts) => commits;
}

function stubCallAiFail(): LogDeps["callAi"] {
  return async <U>(opts: AiCallOptions<U>): Promise<AiCallResult<U>> => {
    return {
      ok: false,
      value: opts.fallback,
      reason: "unavailable",
      rawText: "",
      stderr: "claude not found",
    };
  };
}

function stubCallAiSuccess(summary: string): LogDeps["callAi"] {
  return async <U>(opts: AiCallOptions<U>): Promise<AiCallResult<U>> => {
    const keyMatches = opts.prompt.match(/\[([^\]]+)]/g) ?? [];
    const batchResponse: Record<string, string> = {};
    for (const match of keyMatches) {
      const key = match.slice(1, -1);
      if (key.includes("::")) {
        batchResponse[key] = summary;
      }
    }

    const target = Object.keys(batchResponse).length > 0 ? batchResponse : summary;
    const parsed = opts.parse(target);
    if (parsed !== null) {
      return { ok: true, value: parsed, rawText: JSON.stringify(target) };
    }
    return {
      ok: false,
      value: opts.fallback,
      reason: "invalid_shape",
      rawText: "",
      stderr: "",
    };
  };
}

// --- 테스트 ---

describe("runSourceLog", () => {
  it("lines_delta를 period 레벨과 by_author 레벨 모두 올바르게 집계한다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        author: { name: "Alice", email: "a@t.com" },
        totalAdded: 100,
        totalRemoved: 10,
        subject: "feat: add auth",
      }),
      makeCommit({
        hash: "b".repeat(40),
        authoredAt: "2025-01-15T14:00:00Z",
        author: { name: "Bob", email: "b@t.com" },
        totalAdded: 65,
        totalRemoved: 2,
        subject: "feat: add login",
      }),
    ];

    const deps: LogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiFail(),
    };

    const result = await runSourceLog(
      "src/auth/login.ts",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      source: string;
      timeline: Array<{
        period: string;
        lines_delta: string;
        by_author: Array<{ author: string; lines_delta: string }>;
      }>;
    };

    expect(data.source).toBe("src/auth/login.ts");
    expect(data.timeline).toHaveLength(1);
    expect(data.timeline[0].lines_delta).toBe("+165 -12");

    const alice = data.timeline[0].by_author.find((a) => a.author === "Alice");
    const bob = data.timeline[0].by_author.find((a) => a.author === "Bob");
    expect(alice?.lines_delta).toBe("+100 -10");
    expect(bob?.lines_delta).toBe("+65 -2");
  });

  it("AI 성공 시 summary가 채워진다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        subject: "feat: initial setup",
      }),
    ];

    const deps: LogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiSuccess("초기 인증 모듈을 구현했습니다."),
    };

    const result = await runSourceLog(
      "src/auth/login.ts",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      timeline: Array<{
        by_author: Array<{ summary: string }>;
      }>;
    };

    expect(data.timeline[0].by_author[0].summary).toBe("초기 인증 모듈을 구현했습니다.");
  });

  it("AI 실패 시 summary가 빈 문자열이고 명령은 성공한다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        subject: "fix: something",
      }),
    ];

    const deps: LogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiFail(),
    };

    const result = await runSourceLog(
      "src/auth/login.ts",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      timeline: Array<{
        by_author: Array<{ summary: string }>;
      }>;
    };

    expect(data.timeline[0].by_author[0].summary).toBe("");
  });

  it("커밋이 없으면 빈 timeline을 반환한다", async () => {
    const deps: LogDeps = {
      listFileHistory: stubListFileHistory([]),
      callAi: stubCallAiFail(),
    };

    const result = await runSourceLog(
      "src/auth/login.ts",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as { timeline: unknown[] };
    expect(data.timeline).toEqual([]);
  });
});
