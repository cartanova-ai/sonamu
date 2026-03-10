import { describe, expect, it } from "vitest";
import type { CddProject } from "../core/types.js";
import type { AiCallOptions, AiCallResult } from "../utils/ai.js";
import type { GitHistoryCommit } from "../utils/git.js";
import type { SpecLogDeps } from "./spec-log.js";
import { groupCommitsByPeriod, runSpecLog, toPeriodKey } from "./spec-log.js";

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
    specs: [
      {
        path: "/project/contract/auth/login.spec.json",
        basename: "login",
        document: {
          summary: "login spec",
          status: "draft",
          lastModified: "2026-01-01",
          description: [],
          acceptanceCriteria: [],
          sources: [],
          contracts: [],
          modules: {},
          interfaces: {},
          dataFlow: [],
          errorHandling: {},
          constraints: [],
        },
      },
    ],
  };
}

function stubListFileHistory(commits: GitHistoryCommit[]): SpecLogDeps["listFileHistory"] {
  return async (_path, _opts) => commits;
}

function stubCallAiSuccess(value: { summary: string; phase: string }): SpecLogDeps["callAi"] {
  return async <U>(opts: AiCallOptions<U>): Promise<AiCallResult<U>> => {
    // 배치 호출에서는 prompt에 포함된 key들을 추출하여 모든 그룹에 동일한 결과를 매핑합니다.
    const keyMatches = opts.prompt.match(/\[([^\]]+)]/g) ?? [];
    const batchResponse: Record<string, { summary: string; phase: string }> = {};
    for (const match of keyMatches) {
      const key = match.slice(1, -1);
      if (key.includes("::")) {
        batchResponse[key] = value;
      }
    }

    const target = Object.keys(batchResponse).length > 0 ? batchResponse : value;
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

function stubCallAiFail(): SpecLogDeps["callAi"] {
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

// --- toPeriodKey ---

describe("toPeriodKey", () => {
  it("day 그룹핑에서 YYYY-MM-DD 형식을 반환한다", () => {
    expect(toPeriodKey("2025-01-15T10:30:00Z", "day")).toBe("2025-01-15");
    expect(toPeriodKey("2025-12-31T23:59:00Z", "day")).toBe("2025-12-31");
  });

  it("month 그룹핑에서 YYYY-MM 형식을 반환한다", () => {
    expect(toPeriodKey("2025-01-15T10:30:00Z", "month")).toBe("2025-01");
    expect(toPeriodKey("2025-12-01T00:00:00Z", "month")).toBe("2025-12");
  });

  it("week 그룹핑에서 YYYY-Www 형식을 반환한다", () => {
    // 2025-01-06은 월요일, ISO week 2
    expect(toPeriodKey("2025-01-06T12:00:00Z", "week")).toBe("2025-W02");
    // 2025-01-01은 수요일, ISO week 1
    expect(toPeriodKey("2025-01-01T00:00:00Z", "week")).toBe("2025-W01");
  });

  it("동일한 날짜는 항상 동일한 period key를 반환한다", () => {
    const a = toPeriodKey("2025-03-10T08:00:00Z", "day");
    const b = toPeriodKey("2025-03-10T20:00:00Z", "day");
    expect(a).toBe(b);
  });
});

// --- groupCommitsByPeriod ---

describe("groupCommitsByPeriod", () => {
  it("day 그룹핑으로 커밋을 날짜별 그룹화한다", () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({ hash: "a".repeat(40), authoredAt: "2025-01-15T10:00:00Z", subject: "first" }),
      makeCommit({ hash: "b".repeat(40), authoredAt: "2025-01-15T14:00:00Z", subject: "second" }),
      makeCommit({ hash: "c".repeat(40), authoredAt: "2025-01-16T09:00:00Z", subject: "third" }),
    ];

    const groups = groupCommitsByPeriod(commits, "day");
    expect(groups).toHaveLength(2);
    expect(groups[0].period).toBe("2025-01-15");
    expect(groups[0].commits).toHaveLength(2);
    expect(groups[1].period).toBe("2025-01-16");
    expect(groups[1].commits).toHaveLength(1);
  });

  it("week 그룹핑으로 커밋을 ISO week 기준 그룹화한다", () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({ authoredAt: "2025-01-06T10:00:00Z" }), // W02
      makeCommit({ authoredAt: "2025-01-07T10:00:00Z" }), // W02
      makeCommit({ authoredAt: "2025-01-13T10:00:00Z" }), // W03
    ];

    const groups = groupCommitsByPeriod(commits, "week");
    expect(groups).toHaveLength(2);
    expect(groups[0].period).toBe("2025-W02");
    expect(groups[0].commits).toHaveLength(2);
    expect(groups[1].period).toBe("2025-W03");
  });

  it("month 그룹핑으로 커밋을 월별 그룹화한다", () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({ authoredAt: "2025-01-05T10:00:00Z" }),
      makeCommit({ authoredAt: "2025-01-25T10:00:00Z" }),
      makeCommit({ authoredAt: "2025-02-01T10:00:00Z" }),
    ];

    const groups = groupCommitsByPeriod(commits, "month");
    expect(groups).toHaveLength(2);
    expect(groups[0].period).toBe("2025-01");
    expect(groups[0].commits).toHaveLength(2);
    expect(groups[1].period).toBe("2025-02");
  });

  it("시간순 정렬된다 (오래된 것 먼저)", () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({ authoredAt: "2025-03-01T10:00:00Z" }),
      makeCommit({ authoredAt: "2025-01-01T10:00:00Z" }),
      makeCommit({ authoredAt: "2025-02-01T10:00:00Z" }),
    ];

    const groups = groupCommitsByPeriod(commits, "month");
    expect(groups.map((g) => g.period)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("빈 커밋 목록에서 빈 배열을 반환한다", () => {
    const groups = groupCommitsByPeriod([], "day");
    expect(groups).toEqual([]);
  });
});

// --- runSpecLog ---

describe("runSpecLog", () => {
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

    const deps: SpecLogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiFail(),
    };

    const result = await runSpecLog(
      "login",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      timeline: Array<{
        period: string;
        lines_delta: string;
        by_author: Array<{ author: string; lines_delta: string }>;
      }>;
    };

    expect(data.timeline).toHaveLength(1);
    expect(data.timeline[0].lines_delta).toBe("+165 -12");

    const alice = data.timeline[0].by_author.find((a) => a.author === "Alice");
    const bob = data.timeline[0].by_author.find((a) => a.author === "Bob");
    expect(alice?.lines_delta).toBe("+100 -10");
    expect(bob?.lines_delta).toBe("+65 -2");
  });

  it("AI 성공 시 summary와 phase가 채워진다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        subject: "feat: initial setup",
      }),
    ];

    const deps: SpecLogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiSuccess({ summary: "초기 인증 모듈을 구현했습니다.", phase: "drafting" }),
    };

    const result = await runSpecLog(
      "login",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      timeline: Array<{
        by_author: Array<{ summary: string; phase: string }>;
      }>;
    };

    expect(data.timeline[0].by_author[0].summary).toBe("초기 인증 모듈을 구현했습니다.");
    expect(data.timeline[0].by_author[0].phase).toBe("drafting");
  });

  it("AI 실패 시 summary/phase가 빈 문자열이고 명령은 성공한다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        subject: "fix: something",
      }),
    ];

    const deps: SpecLogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiFail(),
    };

    const result = await runSpecLog(
      "login",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      timeline: Array<{
        by_author: Array<{ summary: string; phase: string }>;
      }>;
    };

    expect(data.timeline[0].by_author[0].summary).toBe("");
    expect(data.timeline[0].by_author[0].phase).toBe("");
  });

  it("여러 period에 걸친 커밋이 올바르게 그룹화된다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        totalAdded: 50,
        totalRemoved: 5,
      }),
      makeCommit({
        hash: "b".repeat(40),
        authoredAt: "2025-01-16T10:00:00Z",
        totalAdded: 30,
        totalRemoved: 3,
      }),
    ];

    const deps: SpecLogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiFail(),
    };

    const result = await runSpecLog(
      "login",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      feature: string;
      group_by: string;
      timeline: Array<{ period: string; lines_delta: string }>;
    };

    expect(data.feature).toBe("login");
    expect(data.group_by).toBe("day");
    expect(data.timeline).toHaveLength(2);
    expect(data.timeline[0].period).toBe("2025-01-15");
    expect(data.timeline[0].lines_delta).toBe("+50 -5");
    expect(data.timeline[1].period).toBe("2025-01-16");
    expect(data.timeline[1].lines_delta).toBe("+30 -3");
  });

  it("동일 period 안에서 작성자별로 그룹화된다", async () => {
    const commits: GitHistoryCommit[] = [
      makeCommit({
        hash: "a".repeat(40),
        authoredAt: "2025-01-15T10:00:00Z",
        author: { name: "Alice", email: "a@t.com" },
        subject: "feat: alice work 1",
        totalAdded: 10,
        totalRemoved: 1,
      }),
      makeCommit({
        hash: "b".repeat(40),
        authoredAt: "2025-01-15T12:00:00Z",
        author: { name: "Bob", email: "b@t.com" },
        subject: "feat: bob work",
        totalAdded: 20,
        totalRemoved: 2,
      }),
      makeCommit({
        hash: "c".repeat(40),
        authoredAt: "2025-01-15T14:00:00Z",
        author: { name: "Alice", email: "a@t.com" },
        subject: "feat: alice work 2",
        totalAdded: 30,
        totalRemoved: 3,
      }),
    ];

    const deps: SpecLogDeps = {
      listFileHistory: stubListFileHistory(commits),
      callAi: stubCallAiFail(),
    };

    const result = await runSpecLog(
      "login",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as {
      timeline: Array<{
        by_author: Array<{
          author: string;
          commits: Array<{ hash: string; message: string }>;
          lines_delta: string;
        }>;
      }>;
    };

    expect(data.timeline).toHaveLength(1);
    const authors = data.timeline[0].by_author;
    expect(authors).toHaveLength(2);

    const alice = authors.find((a) => a.author === "Alice");
    expect(alice).toBeDefined();
    expect(alice?.commits).toHaveLength(2);
    expect(alice?.lines_delta).toBe("+40 -4");

    const bob = authors.find((a) => a.author === "Bob");
    expect(bob).toBeDefined();
    expect(bob?.commits).toHaveLength(1);
    expect(bob?.lines_delta).toBe("+20 -2");
  });

  it("커밋이 없으면 빈 timeline을 반환한다", async () => {
    const deps: SpecLogDeps = {
      listFileHistory: stubListFileHistory([]),
      callAi: stubCallAiFail(),
    };

    const result = await runSpecLog(
      "login",
      { cwd: "/project", groupBy: "day" },
      makeProject(),
      deps,
    );
    const data = result.data as { timeline: unknown[] };
    expect(data.timeline).toEqual([]);
  });
});
