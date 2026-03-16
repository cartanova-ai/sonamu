import { describe, expect, it } from "vitest";
import type {
  CddProject,
  ContractDocument,
  ContractNode,
  DelegatePayload,
  SchemaDocument,
  SpecDocument,
  SpecNode,
  SpecStatus,
} from "./types.js";

describe("types", () => {
  it("ContractDocument 형상 확인", () => {
    const doc: ContractDocument = {
      schema: "default-contract",
      lastModified: "2026-03-09",
      features: { signin: "로그인 기능" },
      overview: ["시스템 개요"],
      domainGlossary: ["용어: 정의"],
      userRoles: ["일반 사용자: 설명"],
      businessRules: ["규칙 설명"],
      edgeCases: ["엣지 케이스 설명"],
    };
    expect(doc.lastModified).toBe("2026-03-09");
    expect(doc.schema).toBe("default-contract");
    expect(doc.features).toEqual({ signin: "로그인 기능" });
    expect(doc.overview).toHaveLength(1);
  });

  it("SpecDocument 형상 확인", () => {
    const doc: SpecDocument = {
      schema: "default-spec",
      schemaVersion: 2,
      summary: "테스트 기능",
      description: ["테스트 설명"],
      acceptanceCriteria: [
        {
          id: "ac-test-1",
          condition: "조건 A를 만족한다",
          testRef: { target: "src/test.ts", pattern: "조건 A를 만족한다" },
        },
      ],
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
    expect(doc.schema).toBe("default-spec");
    expect(doc.schemaVersion).toBe(2);
    expect(doc.summary).toBe("테스트 기능");
    expect(doc.status).toBe("draft");
  });

  it("SpecDocument에 dependsOnSpecs 옵션 필드를 포함할 수 있다", () => {
    const doc: SpecDocument = {
      schema: "default-spec",
      schemaVersion: 2,
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
    const statuses: SpecStatus[] = ["draft", "specifying", "implementing", "validating", "done"];
    expect(statuses).toHaveLength(5);
  });

  it("ContractNode/SpecNode 형상 확인", () => {
    const cn: ContractNode = {
      path: "/abs/contract/main.contract.json",
      domain: "",
      basename: "main",
      document: {
        schema: "default-contract",
        lastModified: "2026-01-01",
        features: {},
        overview: [],
        domainGlossary: [],
        userRoles: [],
        businessRules: [],
        edgeCases: [],
      },
    };
    expect(cn.domain).toBe("");

    const sn: SpecNode = {
      path: "/abs/contract/auth/user.spec.json",
      domain: "auth",
      basename: "user",
      document: {
        schema: "default-spec",
        schemaVersion: 2,
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

  it("SchemaDocument 형상 확인", () => {
    const schema: SchemaDocument = {
      id: "default-spec",
      type: "spec",
      fields: [
        { name: "modules", type: "Record<string, string>", required: true },
        { name: "dataFlow", type: "string[]", required: true },
      ],
    };
    expect(schema.fields).toHaveLength(2);
    expect(schema.fields[0].required).toBe(true);
  });

  it("DelegatePayload 형상 확인", () => {
    const payload: DelegatePayload = {
      mode: "delegate",
      gate: { layer1: "pass", target: "implementing", spec: "auth/signin.spec.json" },
      instruction: "검증하세요",
      references: {
        spec: "contract/auth/signin.spec.json",
        schema: "contract/schemas/default-spec.schema.json",
        contracts: ["contract/auth/main.contract.json"],
        sources: [],
        testFiles: [],
      },
      checks: ["A. 검증 항목"],
    };
    expect(payload.mode).toBe("delegate");
    expect(payload.gate.layer1).toBe("pass");
  });
});
