import { describe, expect, it } from "vitest";

import type { CddProject, RulesDocument, RulesNode } from "./types.js";

describe("types", () => {
  it("CddProject 형상 확인", () => {
    const project: CddProject = {
      contractDir: "/abs/contract",
      projectRoot: "/abs",
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
});
