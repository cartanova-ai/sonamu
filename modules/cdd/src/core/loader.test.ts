import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findContractDir, loadProject, validateRulesStructure } from "./loader.js";

const MIOMOCK_CONTRACT_DIR = path.resolve(
  import.meta.dirname,
  "../../../..",
  "examples/miomock/api/contract",
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
  it("miomock 코퍼스에서 정규화된 절대 경로와 예상 노드 수를 반환한다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    expect(project.contractDir).toBe(MIOMOCK_CONTRACT_DIR);
    expect(project.projectRoot).toBe(path.dirname(MIOMOCK_CONTRACT_DIR));

    expect(project.contracts).toHaveLength(8);
    expect(project.specs).toHaveLength(30);

    for (const c of project.contracts) {
      expect(path.isAbsolute(c.path)).toBe(true);
    }
    for (const s of project.specs) {
      expect(path.isAbsolute(s.path)).toBe(true);
      for (const rc of s.resolvedContracts) {
        expect(path.isAbsolute(rc)).toBe(true);
      }
      for (const rd of s.resolvedDependsOnSpecs) {
        expect(path.isAbsolute(rd)).toBe(true);
      }
    }
  });

  it("도메인이 올바르게 파생된다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    const rootContract = project.contracts.find((c) => c.domain === "");
    expect(rootContract).toBeDefined();
    expect(rootContract?.basename).toBe("main");

    const authSpecs = project.specs.filter((s) => s.domain === "auth");
    expect(authSpecs.length).toBeGreaterThanOrEqual(1);
  });

  it("spec의 resolvedContracts가 올바른 절대 경로로 해소된다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    const signinSpec = project.specs.find((s) => s.basename === "signin");
    expect(signinSpec).toBeDefined();
    expect(signinSpec?.resolvedContracts).toContain(
      path.resolve(MIOMOCK_CONTRACT_DIR, "auth/main.contract.json"),
    );
  });

  it("필수 필드가 누락된 contract 파일이면 에러를 던진다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-test-"));
    const contractDir = path.join(tmpDir, "contract");
    fs.mkdirSync(contractDir, { recursive: true });
    fs.writeFileSync(
      path.join(contractDir, "bad.contract.json"),
      JSON.stringify({ lastModified: "2026-01-01" }),
    );

    await expect(loadProject(contractDir)).rejects.toThrow("schema 필드가 문자열이 아닙니다");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rules 파일을 로드한다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    expect(project.rules.length).toBeGreaterThanOrEqual(1);

    const webRules = project.rules.find((r) => r.basename === "web");
    expect(webRules).toBeDefined();
    expect(webRules?.document.description).toBeTruthy();
    expect(webRules?.document.rules.length).toBeGreaterThan(0);
    expect(path.isAbsolute(webRules?.path)).toBe(true);
  });

  it("rules 디렉토리가 없으면 빈 배열을 반환한다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-test-"));
    const contractDir = path.join(tmpDir, "contract");
    fs.mkdirSync(contractDir, { recursive: true });

    const project = await loadProject(contractDir);
    expect(project.rules).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("필수 필드가 누락된 spec 파일이면 에러를 던진다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-test-"));
    const contractDir = path.join(tmpDir, "contract");
    fs.mkdirSync(contractDir, { recursive: true });
    fs.writeFileSync(
      path.join(contractDir, "bad.spec.json"),
      JSON.stringify({ lastModified: "2026-01-01", status: "draft" }),
    );

    await expect(loadProject(contractDir)).rejects.toThrow("schema 필드가 문자열이 아닙니다");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("useTestRef가 boolean이 아니면 에러를 던진다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-test-"));
    const contractDir = path.join(tmpDir, "contract");
    fs.mkdirSync(contractDir, { recursive: true });
    fs.writeFileSync(
      path.join(contractDir, "bad.spec.json"),
      JSON.stringify({
        schema: "default-spec",
        useTestRef: "no",
        summary: "bad",
        description: [],
        acceptanceCriteria: [],
        status: "draft",
        sources: [],
        contracts: [],
      }),
    );

    await expect(loadProject(contractDir)).rejects.toThrow("useTestRef 필드가 boolean이 아닙니다");

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
