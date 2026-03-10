import { describe, expect, it } from "vitest";
import type { CddProject, SpecNode } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import type { GitBlameReport, GitHistoryCommit } from "../utils/git.js";
import type { SpecBlameDeps } from "./spec-blame.js";
import { runSpecBlame } from "./spec-blame.js";

// --- 테스트 헬퍼 ---

function makeProject(specNode: SpecNode): CddProject {
  return {
    contractDir: "/project/contract",
    projectRoot: "/project",
    contracts: [],
    specs: [specNode],
  };
}

function makeSpecNode(overrides?: Partial<SpecNode>): SpecNode {
  return {
    path: "/project/contract/auth/signin.spec.json",
    domain: "auth",
    basename: "signin",
    document: {
      schemaVersion: 1,
      summary: "signin spec",
      description: [],
      acceptanceCriteria: [],
      lastModified: "2026-01-01",
      status: "done",
      sources: [],
      contracts: [],
      modules: {},
      interfaces: {},
      dataFlow: [],
      errorHandling: {},
      constraints: [],
    },
    resolvedContracts: [],
    resolvedDependsOnSpecs: [],
    ...overrides,
  };
}

function makeCommit(
  author: string,
  added: number,
  removed: number,
  subject: string,
): GitHistoryCommit {
  return {
    hash: "a".repeat(40),
    author: { name: author, email: `${author.toLowerCase()}@test.com` },
    authoredAt: "2026-01-15T10:00:00+09:00",
    subject,
    body: "",
    files: [{ path: "contract/auth/signin.spec.json", added, removed }],
    totalAdded: added,
    totalRemoved: removed,
  };
}

function makeBlameReport(lines: Array<{ author: string; count: number }>): GitBlameReport {
  const blameLines = [];
  let lineNumber = 1;
  for (const { author, count } of lines) {
    for (let i = 0; i < count; i++) {
      blameLines.push({
        lineNumber: lineNumber++,
        commitHash: "b".repeat(40),
        author: { name: author, email: `${author.toLowerCase()}@test.com` },
        content: `line ${lineNumber}`,
      });
    }
  }
  return {
    revision: "HEAD",
    path: "/project/contract/auth/signin.spec.json",
    totalLines: blameLines.length,
    lines: blameLines,
  };
}

function makeStubDeps(
  history: GitHistoryCommit[],
  blame: GitBlameReport,
  aiRole?: string,
): SpecBlameDeps {
  return {
    listFileHistory: async () => history,
    blameFile: async () => blame,
    callAi: async <T>(opts: { fallback: T; parse: (v: unknown) => T | null }) => {
      const role = aiRole ?? "";
      const parsed = opts.parse(role);
      if (parsed !== null) {
        return { ok: true, value: parsed, rawText: role } as AiCallResult<T>;
      }
      return { ok: true, value: opts.fallback, rawText: "" } as AiCallResult<T>;
    },
  };
}

// --- 테스트 ---

describe("runSpecBlame", () => {
  const spec = makeSpecNode();
  const project = makeProject(spec);

  it("history+blame를 합쳐 contributors와 primary_owner를 계산한다", async () => {
    const history = [
      makeCommit("Alice", 50, 10, "feat: initial"),
      makeCommit("Alice", 20, 5, "fix: typo"),
      makeCommit("Bob", 30, 15, "refactor: cleanup"),
    ];
    const blame = makeBlameReport([
      { author: "Alice", count: 60 },
      { author: "Bob", count: 40 },
    ]);

    const result = await runSpecBlame(
      "signin",
      { cwd: "/project" },
      project,
      makeStubDeps(history, blame),
    );
    const data = result.data as {
      feature: string;
      primary_owner: string;
      contributors: Array<{ name: string; score: number }>;
    };

    expect(data.feature).toBe("signin");
    expect(data.contributors).toHaveLength(2);
    expect(data.primary_owner).toBe(data.contributors[0].name);
    // Alice가 더 높은 점수를 받아야 함
    expect(data.primary_owner).toBe("Alice");
  });

  it("current_ownership_pct는 blamed lines / total blamed lines이다", async () => {
    const history = [makeCommit("Alice", 10, 5, "feat: init")];
    const blame = makeBlameReport([
      { author: "Alice", count: 70 },
      { author: "Bob", count: 30 },
    ]);

    const result = await runSpecBlame(
      "signin",
      { cwd: "/project" },
      project,
      makeStubDeps(history, blame),
    );
    const data = result.data as {
      contributors: Array<{ name: string; current_ownership_pct: number }>;
    };

    const alice = data.contributors.find((c) => c.name === "Alice");
    const bob = data.contributors.find((c) => c.name === "Bob");
    expect(alice?.current_ownership_pct).toBe(70);
    expect(bob?.current_ownership_pct).toBe(30);
  });

  it("since는 blame ownership 계산에 적용되지 않는다", async () => {
    let capturedHistoryOpts: { since?: string; until?: string } | undefined;
    let capturedBlameOpts: { revision?: string } | undefined;

    const deps: SpecBlameDeps = {
      listFileHistory: async (_path, opts) => {
        capturedHistoryOpts = { since: opts.since, until: opts.until };
        return [makeCommit("Alice", 10, 5, "feat: init")];
      },
      blameFile: async (_path, opts) => {
        capturedBlameOpts = { revision: opts.revision };
        return makeBlameReport([{ author: "Alice", count: 100 }]);
      },
      callAi: async <T>(opts: { fallback: T }) =>
        ({ ok: true, value: opts.fallback, rawText: "" }) as AiCallResult<T>,
    };

    await runSpecBlame(
      "signin",
      { cwd: "/project", since: "2026-01-01", until: "abc123" },
      project,
      deps,
    );

    // since가 listFileHistory에 전달됨
    expect(capturedHistoryOpts?.since).toBe("2026-01-01");
    // until이 listFileHistory에 전달됨
    expect(capturedHistoryOpts?.until).toBe("abc123");
    // until이 blameFile revision으로 전달됨
    expect(capturedBlameOpts?.revision).toBe("abc123");
  });

  it("가중치 점수가 zero-total 항목 재배분을 포함해 안정적으로 계산된다", async () => {
    // totalAdded=0, totalRemoved=0인 경우 (history 없음, blame만 있음)
    const history: GitHistoryCommit[] = [];
    const blame = makeBlameReport([
      { author: "Alice", count: 80 },
      { author: "Bob", count: 20 },
    ]);

    const result = await runSpecBlame(
      "signin",
      { cwd: "/project" },
      project,
      makeStubDeps(history, blame),
    );
    const data = result.data as {
      contributors: Array<{ name: string; score: number }>;
    };

    // 점수가 NaN이나 Infinity가 아니어야 함
    for (const c of data.contributors) {
      expect(Number.isFinite(c.score)).toBe(true);
      expect(c.score).toBeGreaterThanOrEqual(0);
    }

    // ownership만 반영되므로 Alice 80%, Bob 20% 비율에 근사
    const alice = data.contributors.find((c) => c.name === "Alice");
    const bob = data.contributors.find((c) => c.name === "Bob");
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice?.score).toBeGreaterThan(bob?.score);
  });

  it("결과는 score 내림차순 정렬이다", async () => {
    const history = [
      makeCommit("Bob", 80, 30, "feat: major work"),
      makeCommit("Alice", 5, 1, "fix: minor"),
    ];
    const blame = makeBlameReport([
      { author: "Bob", count: 90 },
      { author: "Alice", count: 10 },
    ]);

    const result = await runSpecBlame(
      "signin",
      { cwd: "/project" },
      project,
      makeStubDeps(history, blame),
    );
    const data = result.data as {
      contributors: Array<{ name: string; score: number }>;
    };

    for (let i = 1; i < data.contributors.length; i++) {
      expect(data.contributors[i - 1].score).toBeGreaterThanOrEqual(data.contributors[i].score);
    }
  });

  it("AI 실패 시 role이 빈 문자열이고 명령은 성공한다", async () => {
    const history = [makeCommit("Alice", 10, 5, "feat: init")];
    const blame = makeBlameReport([{ author: "Alice", count: 100 }]);

    const deps: SpecBlameDeps = {
      listFileHistory: async () => history,
      blameFile: async () => blame,
      callAi: async <T>(opts: { fallback: T }) =>
        ({
          ok: false,
          value: opts.fallback,
          reason: "unavailable" as const,
          rawText: "",
          stderr: "claude not found",
        }) as AiCallResult<T>,
    };

    const result = await runSpecBlame("signin", { cwd: "/project" }, project, deps);
    const data = result.data as {
      contributors: Array<{ name: string; role: string }>;
    };

    expect(data.contributors).toHaveLength(1);
    expect(data.contributors[0].role).toBe("");
    expect(data.contributors[0].name).toBe("Alice");
  });

  it("커밋 없는 blame-only contributor도 포함된다", async () => {
    const history = [makeCommit("Alice", 10, 5, "feat: init")];
    const blame = makeBlameReport([
      { author: "Alice", count: 60 },
      { author: "Charlie", count: 40 },
    ]);

    const result = await runSpecBlame(
      "signin",
      { cwd: "/project" },
      project,
      makeStubDeps(history, blame),
    );
    const data = result.data as {
      contributors: Array<{ name: string; commits: number }>;
    };

    const charlie = data.contributors.find((c) => c.name === "Charlie");
    expect(charlie).toBeDefined();
    expect(charlie?.commits).toBe(0);
  });
});
