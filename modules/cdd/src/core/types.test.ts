import { describe, expect, it } from "vitest";
import type {
  CddProject,
  ContractDocument,
  ContractNode,
  DelegatePayload,
  RulesDocument,
  RulesNode,
  SchemaDocument,
  SpecDocument,
  SpecNode,
  SpecStatus,
} from "./types.js";

describe("types", () => {
  it("ContractDocument 형상 확인", () => {
    const doc: ContractDocument = {
      schema: "default-contract",
      features: { signin: "로그인 기능" },
    };
    expect(doc.schema).toBe("default-contract");
    expect(doc.features).toEqual({ signin: "로그인 기능" });
  });

  it("SpecDocument 형상 확인", () => {
    const doc: SpecDocument = {
      schema: "default-spec",
      summary: "테스트 기능",
      description: ["테스트 설명"],
      acceptanceCriteria: [
        {
          id: "ac-test-1",
          condition: "조건 A를 만족한다",
          testRef: { target: "src/test.ts", pattern: "조건 A를 만족한다" },
        },
      ],
      status: "draft",
      sources: ["src/test.ts"],
      contracts: ["./main.contract.json"],
    };
    expect(doc.schema).toBe("default-spec");
    expect(doc.summary).toBe("테스트 기능");
    expect(doc.status).toBe("draft");
  });

  it("SpecDocument에 dependsOnSpecs 옵션 필드를 포함할 수 있다", () => {
    const doc: SpecDocument = {
      schema: "default-spec",
      summary: "의존성 테스트",
      description: [],
      acceptanceCriteria: [],
      status: "draft",
      sources: [],
      contracts: ["./main.contract.json"],
      dependsOnSpecs: ["./other.spec.json"],
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
        features: {},
      },
    };
    expect(cn.domain).toBe("");

    const sn: SpecNode = {
      path: "/abs/contract/auth/user.spec.json",
      domain: "auth",
      basename: "user",
      document: {
        schema: "default-spec",
        summary: "사용자",
        description: [],
        acceptanceCriteria: [],
        status: "done",
        sources: [],
        contracts: [],
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
      rules: [],
    };
    expect(project.contractDir).toBe("/abs/contract");
    expect(project.projectRoot).toBe("/abs");
    expect(project.rules).toEqual([]);
  });

  it("RulesDocument 형상 확인", () => {
    const doc: RulesDocument = {
      description: "웹 UI 규칙",
      rules: [
        {
          id: "use-numf",
          when: "금액 표시 시",
          instruction: "numF()를 사용합니다.",
          examples: ["numF(row.amount)"],
        },
      ],
    };
    expect(doc.description).toBe("웹 UI 규칙");
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0].examples).toEqual(["numF(row.amount)"]);
  });

  it("RulesNode 형상 확인", () => {
    const node: RulesNode = {
      path: "/abs/contract/rules/web.rules.json",
      basename: "web",
      document: {
        description: "웹 규칙",
        rules: [],
      },
    };
    expect(node.basename).toBe("web");
  });

  it("SchemaDocument 형상 확인", () => {
    const schema: SchemaDocument = {
      id: "default-spec",
      type: "spec",
      fields: [
        {
          name: "modules",
          type: "Record<string, string>",
          description: "모듈 구조와 책임 정의",
          required: true,
        },
        {
          name: "dataFlow",
          type: "string[]",
          description: "모듈 간 데이터 흐름 순서",
          required: true,
        },
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
