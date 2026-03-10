import { describe, expect, it, vi } from "vitest";
import type { CddProject, SpecDocument, SpecNode } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import type { GitDiffResult, GitHistoryCommit } from "../utils/git.js";
import type { SpecExplainData, SpecExplainDeps } from "./spec-explain.js";
import { runSpecExplain } from "./spec-explain.js";

function makeSpecNode(overrides?: Partial<SpecNode>): SpecNode {
  return {
    path: "/project/contract/auth/login.spec.json",
    basename: "login",
    relativePath: "contract/auth/login.spec.json",
    document: {
      schemaVersion: 1,
      summary: "Login spec",
      description: [],
      acceptanceCriteria: [],
      lastModified: "2025-01-01",
      status: "done",
      sources: [],
      contracts: [],
      modules: {},
      interfaces: {},
      dataFlow: [],
      errorHandling: {},
      constraints: [],
    } satisfies SpecDocument,
    resolvedContracts: [],
    resolvedDependsOnSpecs: [],
    ...overrides,
  };
}

function makeProject(specNode: SpecNode): CddProject {
  return {
    projectRoot: "/project",
    contractDir: "/project/contract",
    specs: [specNode],
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
    path: "/project/contract/auth/login.spec.json",
    baseRef: "abc122",
    headRef: "abc123",
    diffText: "--- a/login.spec.json\n+++ b/login.spec.json\n@@ -1 +1 @@\n-old\n+new",
    ...overrides,
  };
}

function makeAiSuccessResult(
  data: Omit<SpecExplainData, "feature">,
): AiCallResult<SpecExplainData> {
  return {
    ok: true,
    value: { feature: "", ...data },
    rawText: JSON.stringify(data),
  };
}

function makeAiFailureResult(): AiCallResult<SpecExplainData> {
  return {
    ok: false,
    value: { feature: "", changes: [], overall_summary: "", breaking_changes: [] },
    reason: "unavailable",
    rawText: "",
    stderr: "claude not found",
  };
}

describe("runSpecExplain", () => {
  it("--commit 지정 시 해당 커밋 기준 컨텍스트만 사용한다", async () => {
    const specNode = makeSpecNode();
    const project = makeProject(specNode);
    const targetCommit = makeCommit({ hash: "target123" });
    const otherCommit = makeCommit({ hash: "other456" });

    const listFileHistoryStub = vi.fn().mockResolvedValue([otherCommit, targetCommit]);
    const getFileDiffStub = vi.fn().mockResolvedValue(makeDiff());
    const callAiStub = vi.fn().mockResolvedValue(
      makeAiSuccessResult({
        changes: [
          {
            section: "modules",
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

    const deps: SpecExplainDeps = {
      listFileHistory: listFileHistoryStub,
      getFileDiff: getFileDiffStub,
      callAi: callAiStub,
    };

    const result = await runSpecExplain(
      "login",
      { cwd: "/project", commit: "target123" },
      project,
      deps,
    );

    // getFileDiff는 commit 옵션으로 호출되어야 함
    expect(getFileDiffStub).toHaveBeenCalledWith(specNode.path, {
      cwd: "/project",
      commit: "target123",
    });

    // AI 프롬프트에 target123 커밋 정보만 포함되어야 함
    const aiPrompt = callAiStub.mock.calls[0][0].prompt as string;
    expect(aiPrompt).toContain("target123");
    expect(aiPrompt).not.toContain("other456");

    const data = result.data as SpecExplainData;
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].section).toBe("modules");
  });

  it("--commit 없을 때 since/until 기반 컨텍스트를 사용한다", async () => {
    const specNode = makeSpecNode();
    const project = makeProject(specNode);
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

    const deps: SpecExplainDeps = {
      listFileHistory: listFileHistoryStub,
      getFileDiff: getFileDiffStub,
      callAi: callAiStub,
    };

    await runSpecExplain(
      "login",
      { cwd: "/project", since: "2025-01-01", until: "2025-12-31" },
      project,
      deps,
    );

    // listFileHistory에 since/until이 전달되어야 함
    expect(listFileHistoryStub).toHaveBeenCalledWith(specNode.path, {
      cwd: "/project",
      since: "2025-01-01",
      until: "2025-12-31",
    });

    // getFileDiff는 oldest~newest 범위로 호출되어야 함
    expect(getFileDiffStub).toHaveBeenCalledWith(specNode.path, {
      cwd: "/project",
      baseRef: "oldest222~1",
      headRef: "newest111",
    });
  });

  it("AI 성공 시 changes/overall_summary/breaking_changes 구조가 정확히 매핑된다", async () => {
    const specNode = makeSpecNode();
    const project = makeProject(specNode);

    const callAiStub = vi.fn().mockResolvedValue(
      makeAiSuccessResult({
        changes: [
          {
            section: "interfaces",
            author: "Bob",
            date: "2025-07-01",
            what: "Changed return type",
            why: "Type safety improvement",
            impact: "high" as const,
          },
          {
            section: "dataFlow",
            author: "Carol",
            date: "2025-07-02",
            what: "Added caching step",
            why: "Performance optimization",
            impact: "low" as const,
          },
        ],
        overall_summary: "Type safety and performance improvements",
        breaking_changes: ["Return type of loginHandler changed"],
      }),
    );

    const deps: SpecExplainDeps = {
      listFileHistory: vi.fn().mockResolvedValue([makeCommit()]),
      getFileDiff: vi.fn().mockResolvedValue(makeDiff()),
      callAi: callAiStub,
    };

    const result = await runSpecExplain("login", { cwd: "/project" }, project, deps);
    const data = result.data as SpecExplainData;

    expect(data.feature).toBe(specNode.basename);
    expect(data.changes).toHaveLength(2);
    expect(data.changes[0]).toEqual({
      section: "interfaces",
      author: "Bob",
      date: "2025-07-01",
      what: "Changed return type",
      why: "Type safety improvement",
      impact: "high",
    });
    expect(data.changes[1].impact).toBe("low");
    expect(data.overall_summary).toBe("Type safety and performance improvements");
    expect(data.breaking_changes).toEqual(["Return type of loginHandler changed"]);
  });

  it("AI 실패 시 빈 구조를 반환하고 명령은 성공한다", async () => {
    const specNode = makeSpecNode();
    const project = makeProject(specNode);

    const deps: SpecExplainDeps = {
      listFileHistory: vi.fn().mockResolvedValue([makeCommit()]),
      getFileDiff: vi.fn().mockResolvedValue(makeDiff()),
      callAi: vi.fn().mockResolvedValue(makeAiFailureResult()),
    };

    const result = await runSpecExplain("login", { cwd: "/project" }, project, deps);
    const data = result.data as SpecExplainData;

    expect(data.feature).toBe(specNode.basename);
    expect(data.changes).toEqual([]);
    expect(data.overall_summary).toBe("");
    expect(data.breaking_changes).toEqual([]);
    expect(result.exitCode).toBeUndefined();
  });

  it("live git 호출 없이 injected stub만 사용한다", async () => {
    const specNode = makeSpecNode();
    const project = makeProject(specNode);

    const listFileHistoryStub = vi.fn().mockResolvedValue([]);
    const getFileDiffStub = vi.fn().mockResolvedValue(makeDiff({ diffText: "" }));
    const callAiStub = vi.fn();

    const deps: SpecExplainDeps = {
      listFileHistory: listFileHistoryStub,
      getFileDiff: getFileDiffStub,
      callAi: callAiStub,
    };

    await runSpecExplain("login", { cwd: "/project" }, project, deps);

    expect(listFileHistoryStub).toHaveBeenCalled();
    // diff가 비어있고 commits도 없으면 AI 호출을 건너뜀
    expect(callAiStub).not.toHaveBeenCalled();
  });
});
