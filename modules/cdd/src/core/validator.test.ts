import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "./loader.js";
import type { CddProject, ContractDocument, ContractNode, SpecNode } from "./types.js";
import { validateProject } from "./validator.js";

const MIOMOCK_CONTRACT_DIR = path.resolve(
  import.meta.dirname,
  "../../../..",
  "examples/miomock/api/contract",
);

describe("validator", () => {
  it("miomock 코퍼스에서 error 수준 이슈가 없다 (cross-project sources 제외)", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);
    const issues = validateProject(project);
    const errors = issues.filter(
      (i) => i.severity === "error" && !i.message.includes("프로젝트 루트를 벗어납니다"),
    );
    expect(errors).toEqual([]);
  });

  it("Contract overview가 비어있으면 경고를 생성한다", () => {
    const project = makeProject({
      contracts: [
        makeContractNode({
          overview: [],
        }),
      ],
    });
    const issues = validateProject(project);
    const overviewWarnings = issues.filter((i) => i.message.includes("overview가 비어 있습니다"));
    expect(overviewWarnings).toHaveLength(1);
  });

  it("잘못된 lastModified 형식에서 에러를 생성한다", () => {
    const project = makeProject({
      contracts: [
        makeContractNode({
          lastModified: "2026/03/09",
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("lastModified 형식"))).toBe(true);
  });

  it("유효하지 않은 status 값에서 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          status: "invalid" as "draft",
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("유효하지 않은 status 값"))).toBe(true);
  });

  it("summary가 비어있으면 경고를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          summary: "",
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("summary가 비어 있습니다"))).toBe(true);
  });

  it("sources 경로가 프로젝트 루트를 벗어나면 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          sources: ["../../etc/passwd"],
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
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("contract를 찾을 수 없습니다"))).toBe(true);
  });

  it("참조된 dependsOnSpecs가 존재하지 않으면 에러를 생성한다", () => {
    const project = makeProject({
      specs: [
        makeSpecNode({
          resolvedDependsOnSpecs: ["/nonexistent/spec.json"],
        }),
      ],
    });
    const issues = validateProject(project);
    expect(issues.some((i) => i.message.includes("참조된 spec을 찾을 수 없습니다"))).toBe(true);
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
  overrides: Partial<ContractDocument & { path: string; domain: string; basename: string }> = {},
): ContractNode {
  return {
    path: overrides.path ?? "/test/contract/main.contract.json",
    domain: overrides.domain ?? "",
    basename: overrides.basename ?? "main",
    document: {
      schema: overrides.schema ?? "default-contract",
      lastModified: overrides.lastModified ?? "2026-03-09",
      features: overrides.features ?? {},
      overview: overrides.overview ?? ["시스템 개요"],
      domainGlossary: overrides.domainGlossary ?? ["용어: 정의"],
      userRoles: overrides.userRoles ?? ["사용자: 설명"],
      businessRules: overrides.businessRules ?? ["규칙"],
      edgeCases: overrides.edgeCases ?? ["엣지 케이스"],
    },
  };
}

function makeSpecNode(
  overrides: Partial<{
    path: string;
    domain: string;
    basename: string;
    schemaVersion: number;
    summary: string;
    description: string[];
    acceptanceCriteria: Array<{
      id: string;
      condition: string;
      testRef: { target: string; pattern: string };
    }>;
    lastModified: string;
    status: "draft" | "specifying" | "implementing" | "validating" | "done";
    sources: string[];
    contracts: string[];
    modules: Record<string, string>;
    interfaces: Record<string, string>;
    dataFlow: string[];
    errorHandling: Record<string, string>;
    constraints: string[];
    resolvedContracts: string[];
    resolvedDependsOnSpecs: string[];
  }> = {},
): SpecNode {
  return {
    path: overrides.path ?? "/test/contract/test.spec.json",
    domain: overrides.domain ?? "",
    basename: overrides.basename ?? "test",
    document: {
      schemaVersion: overrides.schemaVersion ?? 2,
      summary: overrides.summary ?? "테스트 기능",
      description: overrides.description ?? ["테스트 설명"],
      acceptanceCriteria: overrides.acceptanceCriteria ?? [
        {
          id: "ac-test-1",
          condition: "조건 A",
          testRef: { target: "src/test.ts", pattern: "조건 A" },
        },
      ],
      lastModified: overrides.lastModified ?? "2026-03-09",
      status: overrides.status ?? "draft",
      sources: overrides.sources ?? ["src/test.ts"],
      contracts: overrides.contracts ?? ["./main.contract.json"],
      modules: overrides.modules ?? { TestModule: "테스트" },
      interfaces: overrides.interfaces ?? { "TestModule.run()": "실행" },
      dataFlow: overrides.dataFlow ?? ["1. 입력 -> 출력"],
      errorHandling: overrides.errorHandling ?? { TestError: "에러" },
      constraints: overrides.constraints ?? ["제약"],
    },
    resolvedContracts: overrides.resolvedContracts ?? [],
    resolvedDependsOnSpecs: overrides.resolvedDependsOnSpecs ?? [],
  };
}
