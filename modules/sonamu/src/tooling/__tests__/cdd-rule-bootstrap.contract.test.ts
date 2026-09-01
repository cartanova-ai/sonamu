import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDefaultCddToolingAdapter } from "../cdd-service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function createContractRoot() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sonamu-cdd-rule-"));
  temporaryDirectories.push(workspace);
  const contractRoot = path.join(workspace, "contract");
  await fs.mkdir(contractRoot);
  return contractRoot;
}

const RULE_INPUT = {
  ruleKey: "api",
  id: "api-1",
  when: "API 응답을 정의할 때",
  text: "모든 목록 응답은 페이지네이션을 포함한다",
  examples: ["GET /posts"],
  dryRun: false,
};

describe("CDD 규칙 최초 등록", () => {
  it("rules 디렉터리가 없어도 첫 규칙 파일을 만들어 저장한다", async () => {
    const contractRoot = await createContractRoot();
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.addRule(RULE_INPUT)).resolves.toMatchObject({
      key: "api",
      path: "rules/api.rules.json",
      rules: [
        {
          id: "api-1",
          when: "API 응답을 정의할 때",
          instruction: "모든 목록 응답은 페이지네이션을 포함한다",
          examples: ["GET /posts"],
        },
      ],
    });

    const saved = JSON.parse(
      await fs.readFile(path.join(contractRoot, "rules", "api.rules.json"), "utf8"),
    );
    expect(saved.rules).toHaveLength(1);
    expect(saved.rules[0].id).toBe("api-1");
  });

  it("rules 디렉터리는 있지만 규칙 키 파일이 없으면 새로 만든다", async () => {
    const contractRoot = await createContractRoot();
    await fs.mkdir(path.join(contractRoot, "rules"));
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.addRule(RULE_INPUT)).resolves.toMatchObject({
      key: "api",
      rules: [{ id: "api-1" }],
    });

    await expect(adapter.rules()).resolves.toMatchObject({
      rules: [{ key: "api", path: "rules/api.rules.json", ruleCount: 1 }],
    });
  });

  it("기존 규칙 문서에는 규칙을 이어붙이고 description을 보존한다", async () => {
    const contractRoot = await createContractRoot();
    await fs.mkdir(path.join(contractRoot, "rules"));
    await fs.writeFile(
      path.join(contractRoot, "rules", "api.rules.json"),
      JSON.stringify({
        description: "API 규칙",
        rules: [{ id: "api-0", when: "언제나", instruction: "기존 규칙" }],
      }),
      "utf8",
    );
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.addRule(RULE_INPUT)).resolves.toMatchObject({
      description: "API 규칙",
      rules: [{ id: "api-0" }, { id: "api-1" }],
    });
  });

  it("dryRun이면 규칙 파일을 만들지 않는다", async () => {
    const contractRoot = await createContractRoot();
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.addRule({ ...RULE_INPUT, dryRun: true })).resolves.toMatchObject({
      dryRun: true,
    });

    await expect(fs.access(path.join(contractRoot, "rules"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("깨진 JSON 규칙 문서는 빈 문서로 덮어쓰지 않고 실패한다", async () => {
    const contractRoot = await createContractRoot();
    const ruleFile = path.join(contractRoot, "rules", "api.rules.json");
    await fs.mkdir(path.join(contractRoot, "rules"));
    await fs.writeFile(ruleFile, "{ broken", "utf8");
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.addRule(RULE_INPUT)).rejects.toMatchObject({
      code: "INVALID_CDD_RULES",
    });
    await expect(fs.readFile(ruleFile, "utf8")).resolves.toBe("{ broken");
  });
});
