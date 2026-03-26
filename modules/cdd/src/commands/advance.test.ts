import type { SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProject } from "../core/loader.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { runAdvance } from "./advance.js";

function makeSpawnResult({
  status = 0,
  stdout = "",
  stderr = "",
  error,
}: {
  status?: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
} = {}): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
    error,
  };
}

async function createFixtureProject(
  spec: Record<string, unknown>,
  files: Record<string, string> = {},
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdd-advance-test-"));
  const contractDir = path.join(tmpDir, "contract");
  const schemaDir = path.join(contractDir, "schemas");

  fs.mkdirSync(schemaDir, { recursive: true });
  fs.writeFileSync(
    path.join(contractDir, "main.contract.json"),
    JSON.stringify({
      schema: "default-contract",
      features: { example: "예시 기능" },
    }),
  );
  fs.writeFileSync(
    path.join(schemaDir, "default-spec.schema.json"),
    JSON.stringify({
      id: "default-spec",
      type: "spec",
      fields: [],
    }),
  );
  fs.writeFileSync(path.join(contractDir, "feature.spec.json"), JSON.stringify(spec, null, 2));

  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
  }

  return {
    tmpDir,
    project: await loadProject(contractDir),
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe("runAdvance", () => {
  const mockedSpawnSync = vi.mocked(spawnSync);

  beforeEach(() => {
    mockedSpawnSync.mockReset();
  });

  afterEach(() => {
    mockedSpawnSync.mockReset();
  });

  it("useTestRef가 false면 implementing -> validating에서 testRef와 테스트 실행을 생략한다", async () => {
    const fixture = await createFixtureProject(
      {
        schema: "default-spec",
        useTestRef: false,
        summary: "문서 관리 UI",
        description: ["설명"],
        acceptanceCriteria: [
          {
            id: "ac-1",
            condition: "웹 화면이 렌더링된다",
            testRef: { target: "", pattern: "" },
          },
        ],
        status: "implementing",
        sources: ["src/page.tsx"],
        contracts: ["./main.contract.json"],
      },
      {
        "src/page.tsx": "export const page = true;\n",
      },
    );

    const result = runAdvance("feature", fixture.project);

    expect(result.exitCode).toBeUndefined();
    expect(result.data).toMatchObject({
      mode: "delegate",
      gate: { target: "validating" },
      references: { testFiles: [] },
    });
    expect((result.data as { checks: string[] }).checks.join(" ")).not.toContain("testRef");
    expect(mockedSpawnSync).not.toHaveBeenCalled();

    fixture.cleanup();
  });

  it("useTestRef가 없으면 기본값 true로 readiness 확인 후 sonamu test를 실행한다", async () => {
    mockedSpawnSync
      .mockReturnValueOnce(makeSpawnResult({ stdout: "DevRunner 상태:\n  ready:        true\n" }))
      .mockReturnValueOnce(makeSpawnResult({ stdout: "Tests: 1 passed, 0 failed, 1 total\n" }));

    const fixture = await createFixtureProject(
      {
        schema: "default-spec",
        summary: "로그인",
        description: ["설명"],
        acceptanceCriteria: [
          {
            id: "ac-1",
            condition: "로그인된다",
            testRef: { target: "src/login.test.ts", pattern: "로그인된다" },
          },
        ],
        status: "implementing",
        sources: ["src/login.ts"],
        contracts: ["./main.contract.json"],
      },
      {
        "src/login.ts": "export const login = true;\n",
        "src/login.test.ts": "it('로그인된다', () => {})\n",
      },
    );

    const result = runAdvance("feature", fixture.project);

    expect(result.exitCode).toBeUndefined();
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      ["sonamu", "test", "-s"],
      expect.objectContaining({ cwd: fixture.tmpDir, encoding: "utf8" }),
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      ["sonamu", "test"],
      expect.objectContaining({ cwd: fixture.tmpDir, encoding: "utf8" }),
    );
    expect(result.data).toMatchObject({
      mode: "delegate",
      gate: { target: "validating" },
    });

    fixture.cleanup();
  });

  it("readiness가 false면 pnpm test로 fallback한다", async () => {
    mockedSpawnSync
      .mockReturnValueOnce(makeSpawnResult({ stdout: "DevRunner 상태:\n  ready:        false\n" }))
      .mockReturnValueOnce(makeSpawnResult({ stdout: "Tests: 1 passed, 0 failed, 1 total\n" }));

    const fixture = await createFixtureProject(
      {
        schema: "default-spec",
        summary: "fallback",
        description: ["설명"],
        acceptanceCriteria: [
          {
            id: "ac-1",
            condition: "동작한다",
            testRef: { target: "src/fallback.test.ts", pattern: "동작한다" },
          },
        ],
        status: "implementing",
        sources: ["src/fallback.ts"],
        contracts: ["./main.contract.json"],
      },
      {
        "src/fallback.ts": "export const fallback = true;\n",
        "src/fallback.test.ts": "it('동작한다', () => {})\n",
      },
    );

    const result = runAdvance("feature", fixture.project);

    expect(result.exitCode).toBeUndefined();
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      ["test"],
      expect.objectContaining({ cwd: fixture.tmpDir, encoding: "utf8" }),
    );

    fixture.cleanup();
  });

  it("테스트 실행이 실패하면 transition을 차단한다", async () => {
    mockedSpawnSync
      .mockReturnValueOnce(makeSpawnResult({ stdout: "DevRunner 상태:\n  ready:        true\n" }))
      .mockReturnValueOnce(
        makeSpawnResult({
          status: 1,
          stderr: "Vitest failed\nAssertionError: expected true to be false\n",
        }),
      );

    const fixture = await createFixtureProject(
      {
        schema: "default-spec",
        summary: "실패",
        description: ["설명"],
        acceptanceCriteria: [
          {
            id: "ac-1",
            condition: "실패한다",
            testRef: { target: "src/fail.test.ts", pattern: "실패한다" },
          },
        ],
        status: "implementing",
        sources: ["src/fail.ts"],
        contracts: ["./main.contract.json"],
      },
      {
        "src/fail.ts": "export const fail = true;\n",
        "src/fail.test.ts": "it('실패한다', () => {})\n",
      },
    );

    const result = runAdvance("feature", fixture.project);

    expect(result.exitCode).toBe(1);
    expect(result.data).toMatchObject({
      currentStatus: "implementing",
      targetStatus: "validating",
    });
    expect(result.data).toHaveProperty("failures");
    expect(
      (result.data as { failures: Array<{ field: string; message: string }> }).failures,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "tests",
          message: expect.stringContaining("테스트 실행 실패"),
        }),
      ]),
    );

    fixture.cleanup();
  });

  it("useTestRef가 false면 validating -> done에서 testRef.pattern 검사를 생략한다", async () => {
    const fixture = await createFixtureProject(
      {
        schema: "default-spec",
        useTestRef: false,
        summary: "done",
        description: ["설명"],
        acceptanceCriteria: [
          {
            id: "ac-1",
            condition: "화면이 완료된다",
            testRef: { target: "", pattern: "" },
          },
        ],
        status: "validating",
        sources: ["src/done.tsx"],
        contracts: ["./main.contract.json"],
      },
      {
        "src/done.tsx": "export const done = true;\n",
      },
    );

    const result = runAdvance("feature", fixture.project);

    expect(result.exitCode).toBeUndefined();
    expect(result.data).toMatchObject({
      mode: "delegate",
      gate: { target: "done" },
      references: { testFiles: [] },
    });
    expect((result.data as { checks: string[] }).checks.join(" ")).not.toContain("testRef");
    expect(mockedSpawnSync).not.toHaveBeenCalled();

    fixture.cleanup();
  });
});
