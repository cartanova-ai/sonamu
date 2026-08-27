import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type AbsolutePath } from "../../utils/path-utils";
import { Syncer, type SyncerDependencies } from "../syncer";
import { actionGenerateHttpValidators } from "../syncer-actions";

function toAbsolutePath(filePath: string): AbsolutePath {
  if (!path.isAbsolute(filePath)) {
    throw new Error(`절대 경로가 필요합니다: ${filePath}`);
  }
  // SAFETY: path.isAbsolute 검사로 AbsolutePath 계약을 확인했다.
  return filePath as AbsolutePath;
}

function createDependencies() {
  return {
    actionCopySharedToTargetsIfNotExists: vi
      .fn<SyncerDependencies["actionCopySharedToTargetsIfNotExists"]>()
      .mockResolvedValue(undefined),
    actionGenerateHttpValidators: vi.fn<SyncerDependencies["actionGenerateHttpValidators"]>(),
    actionGenerateSsrEntryServerIfNotExists: vi
      .fn<SyncerDependencies["actionGenerateSsrEntryServerIfNotExists"]>()
      .mockResolvedValue([]),
    findChangedFilesUsingChecksums: vi.fn<SyncerDependencies["findChangedFilesUsingChecksums"]>(),
    renewChecksums: vi.fn<SyncerDependencies["renewChecksums"]>().mockResolvedValue(undefined),
  } satisfies SyncerDependencies;
}

const testConfig = {
  api: { dir: "api", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
  sync: { targets: [] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
} satisfies SonamuConfig;

describe("HTTP validator registry sync 정리", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
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
    Sonamu.apiRootPath = toAbsolutePath(apiRootPath);
    Sonamu.config = {
      ...testConfig,
      api: { ...testConfig.api, dir: "." },
      validation: { zodCompiler: value },
    };

    await actionGenerateHttpValidators();

    await expect(access(registryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("registry-only drift를 경고로 넘기지 않고 즉시 재생성한다", async () => {
    const appRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-registry-drift-test-"));
    tempRoots.push(appRootPath);
    const apiRootPath = path.join(appRootPath, "api");
    const registryPath = toAbsolutePath(
      path.join(apiRootPath, "src/application/sonamu.validators.generated.ts"),
    );
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, "// drifted registry\n");
    Sonamu.apiRootPath = toAbsolutePath(apiRootPath);
    Sonamu.config = {
      ...testConfig,
      validation: { zodCompiler: { api: "aot" } },
    };
    const dependencies = createDependencies();
    dependencies.actionGenerateHttpValidators.mockResolvedValue(registryPath);
    dependencies.findChangedFilesUsingChecksums.mockResolvedValue([registryPath]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await new Syncer(dependencies).sync();

    expect(dependencies.actionGenerateHttpValidators).toHaveBeenCalledTimes(1);
    expect(dependencies.renewChecksums).toHaveBeenCalledTimes(1);
  });

  it("삭제된 registry가 checksum 변경 목록에서 빠져도 다른 tracked 변경 처리 중 복구한다", async () => {
    const appRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-missing-registry-test-"));
    tempRoots.push(appRootPath);
    const apiRootPath = path.join(appRootPath, "api");
    const registryPath = toAbsolutePath(
      path.join(apiRootPath, "src/application/sonamu.validators.generated.ts"),
    );
    const unrelatedPath = toAbsolutePath(
      path.join(apiRootPath, "src/application/queries.generated.ts"),
    );
    await mkdir(path.dirname(unrelatedPath), { recursive: true });
    await writeFile(unrelatedPath, "// unrelated tracked change\n");
    Sonamu.apiRootPath = toAbsolutePath(apiRootPath);
    Sonamu.config = {
      ...testConfig,
      validation: { zodCompiler: { api: "aot" } },
    };
    const order: string[] = [];
    const dependencies = createDependencies();
    dependencies.actionGenerateHttpValidators.mockImplementation(async () => {
      order.push("registry");
      return registryPath;
    });
    dependencies.findChangedFilesUsingChecksums.mockResolvedValue([unrelatedPath]);
    dependencies.renewChecksums.mockImplementation(async () => {
      order.push("checksum");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await new Syncer(dependencies).sync();

    expect(order).toEqual(["registry", "checksum"]);
  });
});
