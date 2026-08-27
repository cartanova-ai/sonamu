import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findContractDir, loadProject, validateRulesStructure } from "./loader.js";

const MIOMOCK_CONTRACT_DIR = path.resolve(
  import.meta.dirname,
  "../../../..",
  "examples/miomock/contract",
);

describe("findContractDir", () => {
  it("contract 디렉토리가 있는 경우 절대 경로를 반환한다", () => {
    const miomockApi = path.dirname(MIOMOCK_CONTRACT_DIR);
    const result = findContractDir(miomockApi);
    expect(result).toBe(MIOMOCK_CONTRACT_DIR);
  });

  it("하위 디렉토리에서 시작해도 상위의 contract 디렉토리를 찾는다", () => {
    const subDir = path.join(MIOMOCK_CONTRACT_DIR, "auth");
    const result = findContractDir(subDir);
    expect(result).toBe(MIOMOCK_CONTRACT_DIR);
  });

  it("contract 디렉토리가 없으면 null을 반환한다", () => {
    const result = findContractDir(os.tmpdir());
    expect(result).toBeNull();
  });
});

describe("loadProject", () => {
  it("rules 파일을 로드한다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    expect(project.contractDir).toBe(MIOMOCK_CONTRACT_DIR);
    expect(project.projectRoot).toBe(path.dirname(MIOMOCK_CONTRACT_DIR));
    expect(project.rules.length).toBeGreaterThanOrEqual(1);

    const webRules = project.rules.find((r) => r.basename === "web");
    expect(webRules).toBeDefined();
    expect(webRules?.document.description).toBeTruthy();
    expect(webRules?.document.rules.length).toBeGreaterThan(0);
    assert(webRules?.path);
    expect(path.isAbsolute(webRules.path)).toBe(true);
  });

  it("rules 디렉토리가 없으면 빈 배열을 반환한다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-test-"));
    const contractDir = path.join(tmpDir, "contract");
    fs.mkdirSync(contractDir, { recursive: true });

    const project = await loadProject(contractDir);
    expect(project.rules).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("validateRulesStructure", () => {
  it("유효한 rules 구조를 통과시킨다", () => {
    const valid = {
      description: "테스트 규칙",
      rules: [
        { id: "rule-1", when: "조건", instruction: "지시" },
        { id: "rule-2", when: "조건2", instruction: "지시2", examples: ["예시"] },
      ],
    };
    expect(() => validateRulesStructure(valid, "test.rules.json")).not.toThrow();
  });

  it("description이 누락되면 에러를 던진다", () => {
    expect(() => validateRulesStructure({ rules: [] }, "test.rules.json")).toThrow(
      "description 필드가 문자열이 아닙니다",
    );
  });

  it("rules가 배열이 아니면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure({ description: "test", rules: "bad" }, "test.rules.json"),
    ).toThrow("rules 필드가 배열이 아닙니다");
  });

  it("rule의 id가 누락되면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure(
        { description: "test", rules: [{ when: "w", instruction: "i" }] },
        "test.rules.json",
      ),
    ).toThrow("rules[0].id가 비어 있거나 문자열이 아닙니다");
  });

  it("rule의 when이 누락되면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure(
        { description: "test", rules: [{ id: "r1", instruction: "i" }] },
        "test.rules.json",
      ),
    ).toThrow("rules[0].when이 비어 있거나 문자열이 아닙니다");
  });

  it("rule의 instruction이 누락되면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure(
        { description: "test", rules: [{ id: "r1", when: "w" }] },
        "test.rules.json",
      ),
    ).toThrow("rules[0].instruction이 비어 있거나 문자열이 아닙니다");
  });

  it("파일 내 id 중복이면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure(
        {
          description: "test",
          rules: [
            { id: "dup", when: "w1", instruction: "i1" },
            { id: "dup", when: "w2", instruction: "i2" },
          ],
        },
        "test.rules.json",
      ),
    ).toThrow('rules[1].id "dup"가 중복됩니다');
  });

  it("examples가 배열이 아니면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure(
        {
          description: "test",
          rules: [{ id: "r1", when: "w", instruction: "i", examples: "bad" }],
        },
        "test.rules.json",
      ),
    ).toThrow("rules[0].examples가 배열이 아닙니다");
  });

  it("examples 내 요소가 문자열이 아니면 에러를 던진다", () => {
    expect(() =>
      validateRulesStructure(
        {
          description: "test",
          rules: [{ id: "r1", when: "w", instruction: "i", examples: [123] }],
        },
        "test.rules.json",
      ),
    ).toThrow("rules[0].examples[0]가 문자열이 아닙니다");
  });
});
