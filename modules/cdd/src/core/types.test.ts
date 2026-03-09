import { describe, expect, it } from "vitest";
import {
  type CddProject,
  CONTRACT_REQUIRED_SECTIONS,
  type ContractDocument,
  type ContractNode,
  SPEC_FEATURE_SUBSECTIONS,
  SPEC_REQUIRED_SECTIONS,
  type SpecDocument,
  type SpecNode,
  type SpecRevision,
  type SpecStatus,
  type ValidationIssue,
} from "./types.js";

describe("types", () => {
  it("ContractDocument 형상 확인", () => {
    const doc: ContractDocument = {
      lastModified: "2026-03-09",
      content: ["## Overview", "", "설명"],
    };
    expect(doc.lastModified).toBe("2026-03-09");
    expect(doc.content).toHaveLength(3);
  });

  it("SpecDocument 형상 확인", () => {
    const rev: SpecRevision = {
      id: "rev-001",
      date: "2026-03-09",
      features: ["기능A"],
      status: "draft",
    };
    const doc: SpecDocument = {
      lastModified: "2026-03-09",
      status: "draft",
      sources: ["src/foo.ts"],
      contracts: ["./main.contract.json"],
      revisions: [rev],
      content: ["## Summary", "", "요약"],
    };
    expect(doc.revisions).toHaveLength(1);
    expect(doc.status).toBe("draft");
  });

  it("SpecStatus 값 제약 확인", () => {
    const statuses: SpecStatus[] = ["draft", "in-progress", "done"];
    expect(statuses).toHaveLength(3);
  });

  it("ContractNode/SpecNode 형상 확인", () => {
    const cn: ContractNode = {
      path: "/abs/contract/main.contract.json",
      domain: "",
      basename: "main",
      document: { lastModified: "2026-01-01", content: [] },
    };
    expect(cn.domain).toBe("");

    const sn: SpecNode = {
      path: "/abs/contract/auth/user.spec.json",
      domain: "auth",
      basename: "user",
      document: {
        lastModified: "2026-01-01",
        status: "done",
        sources: [],
        contracts: [],
        revisions: [],
        content: [],
      },
      resolvedContracts: ["/abs/contract/auth/main.contract.json"],
    };
    expect(sn.domain).toBe("auth");
  });

  it("CddProject 형상 확인", () => {
    const project: CddProject = {
      contractDir: "/abs/contract",
      projectRoot: "/abs",
      contracts: [],
      specs: [],
    };
    expect(project.contractDir).toBe("/abs/contract");
    expect(project.projectRoot).toBe("/abs");
  });

  it("ValidationIssue 형상 확인", () => {
    const issue: ValidationIssue = {
      severity: "error",
      path: "/some/file.json",
      message: "필수 섹션 누락",
    };
    expect(issue.severity).toBe("error");
  });

  it("CONTRACT_REQUIRED_SECTIONS 상수 확인", () => {
    expect(CONTRACT_REQUIRED_SECTIONS).toContain("Overview");
    expect(CONTRACT_REQUIRED_SECTIONS).toContain("Edge Cases");
    expect(CONTRACT_REQUIRED_SECTIONS).toHaveLength(6);
  });

  it("SPEC_REQUIRED_SECTIONS 상수 확인", () => {
    expect(SPEC_REQUIRED_SECTIONS).toContain("Summary");
    expect(SPEC_REQUIRED_SECTIONS).toContain("Features");
    expect(SPEC_REQUIRED_SECTIONS).toHaveLength(2);
  });

  it("SPEC_FEATURE_SUBSECTIONS 상수 확인", () => {
    expect(SPEC_FEATURE_SUBSECTIONS).toContain("Modules/Components");
    expect(SPEC_FEATURE_SUBSECTIONS).toContain("Technical Constraints");
    expect(SPEC_FEATURE_SUBSECTIONS).toHaveLength(5);
  });
});
