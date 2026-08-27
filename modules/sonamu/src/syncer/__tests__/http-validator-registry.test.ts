import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { type AbsolutePath } from "../../utils/path-utils";
import { Syncer } from "../syncer";
import * as SyncerActions from "../syncer-actions";

const generateTemplateMock = vi.hoisted(() => vi.fn());
const checksumMocks = vi.hoisted(() => ({
  findChangedFilesUsingChecksums: vi.fn(),
  renewChecksums: vi.fn(),
}));

vi.mock("../code-generator", () => ({
  generateTemplate: generateTemplateMock,
}));

vi.mock("../checksum", () => checksumMocks);

describe("HTTP validator registry sync 정리", () => {
  const originalApiRootPath = Reflect.get(Sonamu, "_apiRootPath");
  const originalConfig = Reflect.get(Sonamu, "_config");
  const tempRoots: string[] = [];

  beforeEach(() => {
    generateTemplateMock.mockReset();
    checksumMocks.findChangedFilesUsingChecksums.mockReset();
    checksumMocks.renewChecksums.mockReset();
    checksumMocks.renewChecksums.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    Reflect.set(Sonamu, "_apiRootPath", originalApiRootPath);
    Reflect.set(Sonamu, "_config", originalConfig);
    vi.restoreAllMocks();
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it.each([
    { label: "opt-out", value: false as const },
    { label: "JIT", value: { api: "jit" as const } },
  ])("$label 정책은 남아 있는 generated registry를 제거한다", async ({ value }) => {
    const apiRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-registry-sync-test-"));
    tempRoots.push(apiRootPath);
    const registryPath = path.join(apiRootPath, "src/application/sonamu.validators.generated.ts");
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, "export const validators = new Map();\n");
    generateTemplateMock.mockResolvedValue([registryPath]);
    Reflect.set(Sonamu, "_apiRootPath", apiRootPath);
    Reflect.set(Sonamu, "_config", {
      api: { dir: "." },
      sync: { targets: [] },
      validation: { zodCompiler: value },
    });

    await SyncerActions.actionGenerateHttpValidators();

    await expect(access(registryPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(generateTemplateMock).not.toHaveBeenCalled();
  });

  it("registry-only drift를 경고로 넘기지 않고 즉시 재생성한다", async () => {
    const appRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-registry-drift-test-"));
    tempRoots.push(appRootPath);
    const apiRootPath = path.join(appRootPath, "api");
    const registryPath = path.join(
      apiRootPath,
      "src/application/sonamu.validators.generated.ts",
    ) as AbsolutePath;
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, "// drifted registry\n");
    Reflect.set(Sonamu, "_apiRootPath", apiRootPath);
    Reflect.set(Sonamu, "_config", {
      api: { dir: "api" },
      sync: { targets: [] },
      validation: { zodCompiler: { api: "aot" } },
    });
    const regenerate = vi
      .spyOn(SyncerActions, "actionGenerateHttpValidators")
      .mockResolvedValue(registryPath);
    vi.spyOn(SyncerActions, "actionCopySharedToTargetsIfNotExists").mockResolvedValue(undefined);
    vi.spyOn(SyncerActions, "actionGenerateSsrEntryServerIfNotExists").mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    checksumMocks.findChangedFilesUsingChecksums.mockResolvedValue([registryPath]);

    await new Syncer().sync();

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(checksumMocks.renewChecksums).toHaveBeenCalledTimes(1);
  });

  it("삭제된 registry가 checksum 변경 목록에서 빠져도 다른 tracked 변경 처리 중 복구한다", async () => {
    const appRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-missing-registry-test-"));
    tempRoots.push(appRootPath);
    const apiRootPath = path.join(appRootPath, "api");
    const registryPath = path.join(
      apiRootPath,
      "src/application/sonamu.validators.generated.ts",
    ) as AbsolutePath;
    const unrelatedPath = path.join(
      apiRootPath,
      "src/application/queries.generated.ts",
    ) as AbsolutePath;
    await mkdir(path.dirname(unrelatedPath), { recursive: true });
    await writeFile(unrelatedPath, "// unrelated tracked change\n");
    Reflect.set(Sonamu, "_apiRootPath", apiRootPath);
    Reflect.set(Sonamu, "_config", {
      api: { dir: "api" },
      sync: { targets: [] },
      validation: { zodCompiler: { api: "aot" } },
    });
    const order: string[] = [];
    vi.spyOn(SyncerActions, "actionGenerateHttpValidators").mockImplementation(async () => {
      order.push("registry");
      return registryPath;
    });
    vi.spyOn(SyncerActions, "actionCopySharedToTargetsIfNotExists").mockResolvedValue(undefined);
    vi.spyOn(SyncerActions, "actionGenerateSsrEntryServerIfNotExists").mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    checksumMocks.findChangedFilesUsingChecksums.mockResolvedValue([unrelatedPath]);
    checksumMocks.renewChecksums.mockImplementation(async () => {
      order.push("checksum");
    });

    await new Syncer().sync();

    expect(order).toEqual(["registry", "checksum"]);
  });
});
