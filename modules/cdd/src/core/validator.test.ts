import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "./loader.js";
import type { CddProject, ContractNode, SpecNode } from "./types.js";
import { validateProject } from "./validator.js";

const MIOMOCK_CONTRACT_DIR = path.resolve(
  import.meta.dirname,
  "../../../..",
  "examples/miomock/api/contract",
);

describe("validator", () => {
  it("miomock 코퍼스에서 error 수준 이슈가 없다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);
    const issues = validateProject(project);
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("Contract 필수 섹션 누락 시 에러를 생성한다", () => {
    const project = makeProject({
      contracts: [
        makeContractNode({
          content: ["## Overview", "", "내용"],
        }),
      ],
    });
    const issues = validateProject(project);
    const sectionErrors = issues.filter((i) => i.message.includes("Contract 필수 섹션 누락"));
    expect(sectionErrors).toHaveLength(5);
  });

  it("잘못된 lastModified 형식에서 에러를 생성한다", () => {
    const project = makeProject({
      contracts: [
        makeContractNode({
          lastModified: "2026/03/09",
          content: makeValidContractContent(),
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("lastModified 형식"))).toBe(true);
  });

  it("Spec 필수 섹션 누락 시 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          content: ["## Summary", "", "요약만 있음"],
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes('Spec 필수 섹션 누락: "Features"'))).toBe(true);
  });

  it("Feature 블록에 하위 섹션 누락 시 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          content: [
            "## Summary",
            "",
            "요약",
            "",
            "## Features",
            "",
            "- 기능A",
            "",
            "### 기능A",
            "",
            "#### Modules/Components",
            "",
            "모듈 설명",
          ],
        }),
      ],
    });
    const issues = validateProject(project);
    const featureErrors = issues.filter((i) =>
      i.message.includes('Feature "기능A" 필수 하위 섹션 누락'),
    );
    expect(featureErrors).toHaveLength(4);
  });

  it("top-level status가 revision 최솟값과 불일치하면 경고를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          status: "done",
          revisions: [
            { id: "rev-001", date: "2026-01-01", features: ["A"], status: "done" },
            { id: "rev-002", date: "2026-01-02", features: ["B"], status: "draft" },
          ],
          content: makeValidSpecContent(),
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("불일치"))).toBe(true);
  });

  it("sources 경로가 프로젝트 루트를 벗어나면 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          sources: ["../../etc/passwd"],
          content: makeValidSpecContent(),
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("프로젝트 루트를 벗어납니다"))).toBe(true);
  });

  it("참조된 contract가 존재하지 않으면 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          resolvedContracts: ["/nonexistent/contract.json"],
          content: makeValidSpecContent(),
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("contract를 찾을 수 없습니다"))).toBe(true);
  });
});

function makeProject(overrides: Partial<CddProject> = {}): CddProject {
  return {
    contractDir: "/test/contract",
    projectRoot: "/test",
    contracts: [],
    specs: [],
    ...overrides,
  };
}

function makeContractNode(
  overrides: Partial<{
    lastModified: string;
    content: string[];
    path: string;
    domain: string;
    basename: string;
  }> = {},
): ContractNode {
  return {
    path: overrides.path ?? "/test/contract/main.contract.json",
    domain: overrides.domain ?? "",
    basename: overrides.basename ?? "main",
    document: {
      lastModified: overrides.lastModified ?? "2026-03-09",
      content: overrides.content ?? makeValidContractContent(),
    },
  };
}

function makeSpecNode(
  overrides: Partial<{
    path: string;
    domain: string;
    basename: string;
    lastModified: string;
    status: "draft" | "in-progress" | "done";
    sources: string[];
    contracts: string[];
    revisions: {
      id: string;
      date: string;
      features: string[];
      status: "draft" | "in-progress" | "done";
    }[];
    content: string[];
    resolvedContracts: string[];
  }> = {},
): SpecNode {
  return {
    path: overrides.path ?? "/test/contract/test.spec.json",
    domain: overrides.domain ?? "",
    basename: overrides.basename ?? "test",
    document: {
      lastModified: overrides.lastModified ?? "2026-03-09",
      status: overrides.status ?? "draft",
      sources: overrides.sources ?? ["src/test.ts"],
      contracts: overrides.contracts ?? ["./main.contract.json"],
      revisions: overrides.revisions ?? [
        { id: "rev-001", date: "2026-03-09", features: ["기능A"], status: "draft" },
      ],
      content: overrides.content ?? makeValidSpecContent(),
    },
    resolvedContracts: overrides.resolvedContracts ?? [],
  };
}

function makeValidContractContent(): string[] {
  return [
    "## Overview",
    "",
    "개요",
    "",
    "## Domain Glossary",
    "",
    "용어",
    "",
    "## Features/Capabilities",
    "",
    "기능",
    "",
    "## User Roles/Actors",
    "",
    "역할",
    "",
    "## Business Rules/Constraints",
    "",
    "규칙",
    "",
    "## Edge Cases",
    "",
    "엣지 케이스",
  ];
}

function makeValidSpecContent(): string[] {
  return [
    "## Summary",
    "",
    "요약",
    "",
    "## Features",
    "",
    "- 기능A",
    "",
    "### 기능A",
    "",
    "#### Modules/Components",
    "",
    "모듈",
    "",
    "#### Interfaces",
    "",
    "인터페이스",
    "",
    "#### Data Flow",
    "",
    "데이터 흐름",
    "",
    "#### Error Handling",
    "",
    "에러 처리",
    "",
    "#### Technical Constraints",
    "",
    "제약 사항",
  ];
}
