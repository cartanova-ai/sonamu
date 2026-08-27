import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeZodCompilerPolicy } from "../config";

describe("zod-compiler 정책 정규화", () => {
  it.each([undefined, false] as const)(
    "미설정 또는 false를 opt-out 정책으로 정규화한다",
    (policy) => {
      expect(normalizeZodCompilerPolicy(policy, ["web", "app"])).toEqual({
        api: false,
        targets: {},
      });
    },
  );

  it("API JIT 정책을 target registry 없이 정규화한다", () => {
    expect(normalizeZodCompilerPolicy({ api: "jit" }, ["web"])).toEqual({
      api: "jit",
      targets: {},
    });
  });

  it("API AOT 정책을 target registry 없이 정규화한다", () => {
    expect(normalizeZodCompilerPolicy({ api: "aot" }, ["web"])).toEqual({
      api: "aot",
      targets: {},
    });
  });

  it("지원하지 않는 target opt-in을 targets 설정 경로에서 거부한다", () => {
    expect(() =>
      normalizeZodCompilerPolicy(
        {
          api: "aot",
          targets: {
            web: "aot",
          },
        },
        ["web"],
      ),
    ).toThrowError(/validation\.zodCompiler\.targets/);
  });
});

describe("zod-compiler 빌드 전용 정책 로딩", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    vi.doUnmock("../sonamu");
    vi.doUnmock("../../database/db");
    vi.doUnmock("../../bin/ts-loader-registration");
    vi.resetModules();
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it("Sonamu와 DB를 초기화하지 않고 source config의 compiler 정책만 읽는다", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-compiler-policy-test-"));
    tempRoots.push(rootPath);
    await mkdir(path.join(rootPath, "src"), { recursive: true });
    await writeFile(path.join(rootPath, ".env"), "SONAMU_DB_HOST=localhost\n");
    await writeFile(
      path.join(rootPath, "src", "sonamu.config.ts"),
      `
export default {
  sync: { targets: ["web"] },
  validation: {
    zodCompiler: {
      api: "aot",
    },
  },
};
`,
    );

    const sonamuInit = vi.fn();
    const generateDBConfig = vi.fn();
    const setDBConfig = vi.fn();
    vi.doMock("../sonamu", () => ({ Sonamu: { init: sonamuInit } }));
    vi.doMock("../../database/db", () => ({
      DB: {
        generateDBConfig,
        setConfig: setDBConfig,
      },
    }));
    vi.doMock("../../bin/ts-loader-registration", () => ({
      ensureTsLoaderRegistered: vi.fn(async () => {}),
    }));

    const { loadBuildCompilerPolicy } = await import("../../bin/compiler-policy");

    await expect(loadBuildCompilerPolicy(rootPath)).resolves.toEqual({
      api: "aot",
      targets: {},
    });
    expect(sonamuInit).not.toHaveBeenCalled();
    expect(generateDBConfig).not.toHaveBeenCalled();
    expect(setDBConfig).not.toHaveBeenCalled();
  });
});
