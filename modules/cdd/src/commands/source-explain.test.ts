import { describe, expect, it, vi } from "vitest";
import type { CddProject } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import type { GitDiffResult, GitHistoryCommit } from "../utils/git.js";
import type { ExplainDeps } from "./explain-core.js";
import type { SourceExplainData } from "./source-explain.js";
import { runSourceExplain } from "./source-explain.js";

function makeProject(): CddProject {
  return {
    projectRoot: "/project",
    contractDir: "/project/contract",
    specs: [],
    contracts: [],
  };
}

function makeCommit(overrides?: Partial<GitHistoryCommit>): GitHistoryCommit {
  return {
    hash: "abc123",
    author: { name: "Alice", email: "alice@test.com" },
    authoredAt: "2025-06-01T10:00:00+09:00",
    subject: "feat: add login",
    body: "",
    files: [],
    totalAdded: 10,
    totalRemoved: 2,
    ...overrides,
  };
}

function makeDiff(overrides?: Partial<GitDiffResult>): GitDiffResult {
  return {
    path: "/project/src/auth/login.ts",
    baseRef: "abc122",
    headRef: "abc123",
    diffText: "--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -1 +1 @@\n-old\n+new",
    ...overrides,
  };
}

function makeAiSuccessResult(
  data: Omit<SourceExplainData, "source">,
): AiCallResult<SourceExplainData> {
  return {
    ok: true,
    value: { source: "", ...data },
    rawText: JSON.stringify(data),
  };
}

function makeAiFailureResult(): AiCallResult<SourceExplainData> {
  return {
    ok: false,
    value: { source: "", changes: [], overall_summary: "", breaking_changes: [] },
    reason: "unavailable",
    rawText: "",
    stderr: "claude not found",
  };
}

describe("runSourceExplain", () => {
  it("--commit 지정 시 해당 커밋 기준 컨텍스트만 사용한다", async () => {
    const project = makeProject();
    const targetCommit = makeCommit({ hash: "target123" });
    const otherCommit = makeCommit({ hash: "other456" });

    const listFileHistoryStub = vi.fn().mockResolvedValue([otherCommit, targetCommit]);
    const getFileDiffStub = vi.fn().mockResolvedValue(makeDiff());
    const callAiStub = vi.fn().mockResolvedValue(
      makeAiSuccessResult({
        changes: [
          {
            section: "auth",
            author: "Alice",
            date: "2025-06-01",
            what: "Added auth module",
            why: "Login feature needed",
            impact: "medium" as const,
          },
        ],
        overall_summary: "Login module added",
        breaking_changes: [],
      }),
    );

    const deps: ExplainDeps = {
      listFileHistory: listFileHistoryStub,
      getFileDiff: getFileDiffStub,
      callAi: callAiStub,
    };

    const result = await runSourceExplain(
      "src/auth/login.ts",
      { cwd: "/project", commit: "target123" },
      project,
      deps,
    );

    expect(getFileDiffStub).toHaveBeenCalledWith("/project/src/auth/login.ts", {
      cwd: "/project",
      commit: "target123",
    });

    const aiPrompt = callAiStub.mock.calls[0][0].prompt as string;
    expect(aiPrompt).toContain("target123");
    expect(aiPrompt).not.toContain("other456");

    const data = result.data as SourceExplainData;
    expect(data.source).toBe("src/auth/login.ts");
    expect(data.changes).toHaveLength(1);
  });

  it("--commit 없을 때 since/until 기반 컨텍스트를 사용한다", async () => {
    const project = makeProject();
    const commit1 = makeCommit({ hash: "newest111" });
    const commit2 = makeCommit({ hash: "oldest222" });

    const listFileHistoryStub = vi.fn().mockResolvedValue([commit1, commit2]);
    const getFileDiffStub = vi.fn().mockResolvedValue(makeDiff());
    const callAiStub = vi.fn().mockResolvedValue(
      makeAiSuccessResult({
        changes: [],
        overall_summary: "Range summary",
        breaking_changes: [],
      }),
    );

    const deps: ExplainDeps = {
      listFileHistory: listFileHistoryStub,
      getFileDiff: getFileDiffStub,
      callAi: callAiStub,
    };

    await runSourceExplain(
      "src/auth/login.ts",
      { cwd: "/project", since: "2025-01-01", until: "2025-12-31" },
      project,
      deps,
    );

    expect(listFileHistoryStub).toHaveBeenCalledWith("/project/src/auth/login.ts", {
      cwd: "/project",
      since: "2025-01-01",
      until: "2025-12-31",
    });

    expect(getFileDiffStub).toHaveBeenCalledWith("/project/src/auth/login.ts", {
      cwd: "/project",
      baseRef: "oldest222~1",
      headRef: "newest111",
    });
  });

  it("AI 실패 시 빈 구조를 반환하고 명령은 성공한다", async () => {
    const project = makeProject();

    const deps: ExplainDeps = {
      listFileHistory: vi.fn().mockResolvedValue([makeCommit()]),
      getFileDiff: vi.fn().mockResolvedValue(makeDiff()),
      callAi: vi.fn().mockResolvedValue(makeAiFailureResult()),
    };

    const result = await runSourceExplain("src/auth/login.ts", { cwd: "/project" }, project, deps);
    const data = result.data as SourceExplainData;

    expect(data.source).toBe("src/auth/login.ts");
    expect(data.changes).toEqual([]);
    expect(data.overall_summary).toBe("");
    expect(data.breaking_changes).toEqual([]);
  });

  it("diff와 commits가 모두 없으면 AI를 호출하지 않는다", async () => {
    const project = makeProject();

    const callAiStub = vi.fn();
    const deps: ExplainDeps = {
      listFileHistory: vi.fn().mockResolvedValue([]),
      getFileDiff: vi.fn().mockResolvedValue(makeDiff({ diffText: "" })),
      callAi: callAiStub,
    };

    await runSourceExplain("src/auth/login.ts", { cwd: "/project" }, project, deps);
    expect(callAiStub).not.toHaveBeenCalled();
  });
});
