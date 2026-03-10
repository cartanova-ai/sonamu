import { describe, expect, it } from "vitest";
import type { CddProject } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import type { GitBlameReport, GitHistoryCommit } from "../utils/git.js";
import type { SourceBlameDeps } from "./source-blame.js";
import { runSourceBlame } from "./source-blame.js";

// --- 테스트 헬퍼 ---

function makeProject(): CddProject {
  return {
    contractDir: "/project/contract",
    projectRoot: "/project",
    contracts: [],
    specs: [],
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
    files: [{ path: "src/auth/login.ts", added, removed }],
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
    path: "/project/src/auth/login.ts",
    totalLines: blameLines.length,
    lines: blameLines,
  };
}

function makeStubDeps(
  history: GitHistoryCommit[],
  blame: GitBlameReport,
  aiRole?: string,
): SourceBlameDeps {
  return {
    listFileHistory: async () => history,
    blameFile: async () => blame,
    callAi: async <T>(opts: { prompt: string; fallback: T; parse: (v: unknown) => T | null }) => {
      const role = aiRole ?? "";
      const nameMatches = opts.prompt.match(/\[([^\]]+)]/g) ?? [];
      const roleMap: Record<string, string> = {};
      for (const match of nameMatches) {
        roleMap[match.slice(1, -1)] = role;
      }
      const target = Object.keys(roleMap).length > 0 ? roleMap : role;
      const parsed = opts.parse(target);
      if (parsed !== null) {
        return { ok: true, value: parsed, rawText: JSON.stringify(target) } as AiCallResult<T>;
      }
      return { ok: true, value: opts.fallback, rawText: "" } as AiCallResult<T>;
    },
  };
}

// --- 테스트 ---

describe("runSourceBlame", () => {
  const project = makeProject();

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

    const result = await runSourceBlame(
      "src/auth/login.ts",
      { cwd: "/project" },
      project,
      makeStubDeps(history, blame),
    );
    const data = result.data as {
      source: string;
      primary_owner: string;
      contributors: Array<{ name: string; score: number }>;
    };

    expect(data.source).toBe("src/auth/login.ts");
    expect(data.contributors).toHaveLength(2);
    expect(data.primary_owner).toBe(data.contributors[0].name);
    expect(data.primary_owner).toBe("Alice");
  });

  it("current_ownership_pct는 blamed lines / total blamed lines이다", async () => {
    const history = [makeCommit("Alice", 10, 5, "feat: init")];
    const blame = makeBlameReport([
      { author: "Alice", count: 70 },
      { author: "Bob", count: 30 },
    ]);

    const result = await runSourceBlame(
      "src/auth/login.ts",
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

  it("결과는 score 내림차순 정렬이다", async () => {
    const history = [
      makeCommit("Bob", 80, 30, "feat: major work"),
      makeCommit("Alice", 5, 1, "fix: minor"),
    ];
    const blame = makeBlameReport([
      { author: "Bob", count: 90 },
      { author: "Alice", count: 10 },
    ]);

    const result = await runSourceBlame(
      "src/auth/login.ts",
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

    const deps: SourceBlameDeps = {
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

    const result = await runSourceBlame("src/auth/login.ts", { cwd: "/project" }, project, deps);
    const data = result.data as {
      contributors: Array<{ name: string; role: string }>;
    };

    expect(data.contributors).toHaveLength(1);
    expect(data.contributors[0].role).toBe("");
    expect(data.contributors[0].name).toBe("Alice");
  });
});
