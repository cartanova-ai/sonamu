import { describe, expect, it } from "vitest";
import {
  type CddProject,
  CONTRACT_REQUIRED_SECTIONS,
  type ContractDocument,
  type ContractNode,
  SPEC_REQUIRED_FIELDS,
  type SpecDocument,
  type SpecNode,
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
    const doc: SpecDocument = {
      schemaVersion: 1,
      summary: "테스트 기능",
      description: ["테스트 설명"],
      acceptanceCriteria: ["조건 A를 만족한다"],
      lastModified: "2026-03-09",
      status: "draft",
      sources: ["src/test.ts"],
      contracts: ["./main.contract.json"],
      modules: { TestModule: "테스트 모듈" },
      interfaces: { "TestModule.run()": "실행" },
      dataFlow: ["1. 입력 -> 출력"],
      errorHandling: { TestError: "테스트 에러" },
      constraints: ["제약 사항"],
    };
    expect(doc.schemaVersion).toBe(1);
    expect(doc.summary).toBe("테스트 기능");
    expect(doc.status).toBe("draft");
  });

  it("SpecDocument에 dependsOnSpecs 옵션 필드를 포함할 수 있다", () => {
    const doc: SpecDocument = {
      schemaVersion: 1,
      summary: "의존성 테스트",
      description: [],
      acceptanceCriteria: [],
      lastModified: "2026-03-09",
      status: "draft",
      sources: [],
      contracts: ["./main.contract.json"],
      dependsOnSpecs: ["./other.spec.json"],
      modules: {},
      interfaces: {},
      dataFlow: [],
      errorHandling: {},
      constraints: [],
    };
    expect(doc.dependsOnSpecs).toEqual(["./other.spec.json"]);
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
        schemaVersion: 1,
        summary: "사용자",
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
      resolvedContracts: ["/abs/contract/auth/main.contract.json"],
      resolvedDependsOnSpecs: [],
    };
    expect(sn.domain).toBe("auth");
    expect(sn.resolvedDependsOnSpecs).toEqual([]);
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

  it("SPEC_REQUIRED_FIELDS 상수 확인", () => {
    expect(SPEC_REQUIRED_FIELDS).toContain("schemaVersion");
    expect(SPEC_REQUIRED_FIELDS).toContain("summary");
    expect(SPEC_REQUIRED_FIELDS).toContain("modules");
    expect(SPEC_REQUIRED_FIELDS).toContain("constraints");
    expect(SPEC_REQUIRED_FIELDS).toHaveLength(13);
  });
});
