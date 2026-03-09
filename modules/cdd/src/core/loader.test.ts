import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findContractDir, loadProject } from "./loader.js";

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

    // 6개 contract: root main, auth/main, document/main, file/main, organization/main, project/main
    expect(project.contracts).toHaveLength(6);

    // 9개 spec
    expect(project.specs).toHaveLength(9);

    // 모든 경로가 절대 경로인지 확인
    for (const c of project.contracts) {
      expect(path.isAbsolute(c.path)).toBe(true);
    }
    for (const s of project.specs) {
      expect(path.isAbsolute(s.path)).toBe(true);
      for (const rc of s.resolvedContracts) {
        expect(path.isAbsolute(rc)).toBe(true);
      }
    }
  });

  it("도메인이 올바르게 파생된다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    const rootContract = project.contracts.find((c) => c.domain === "");
    expect(rootContract).toBeDefined();
    expect(rootContract!.basename).toBe("main");

    const authSpecs = project.specs.filter((s) => s.domain === "auth");
    expect(authSpecs.length).toBeGreaterThanOrEqual(1);
  });

  it("spec의 resolvedContracts가 올바른 절대 경로로 해소된다", async () => {
    const project = await loadProject(MIOMOCK_CONTRACT_DIR);

    const userSpec = project.specs.find((s) => s.basename === "user");
    expect(userSpec).toBeDefined();
    expect(userSpec!.resolvedContracts).toContain(
      path.resolve(MIOMOCK_CONTRACT_DIR, "auth/main.contract.json"),
    );
  });

  it("content가 string[]이 아닌 파일이면 에러를 던진다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-test-"));
    const contractDir = path.join(tmpDir, "contract");
    fs.mkdirSync(contractDir, { recursive: true });
    fs.writeFileSync(
      path.join(contractDir, "bad.contract.json"),
      JSON.stringify({ lastModified: "2026-01-01", content: "not an array" }),
    );

    await expect(loadProject(contractDir)).rejects.toThrow("content 필드가 배열이 아닙니다");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
