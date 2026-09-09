import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { Template__entry_server } from "../../template/implementations/entry-server.template";
import { Template__http_validators } from "../../template/implementations/http_validators.template";
import { type Template } from "../../template/template";
import { TemplateManager } from "../../template/template-manager";
import { type AbsolutePath } from "../../utils/path-utils";
import { findChangedFilesUsingChecksums } from "../checksum";
import { Syncer } from "../syncer";
import { actionGenerateHttpValidators } from "../syncer-actions";

type ZodCompilerPolicy = NonNullable<SonamuConfig["validation"]>["zodCompiler"];

type TestProject = {
  apiRootPath: AbsolutePath;
  lockPath: string;
  registryPath: AbsolutePath;
  syncer: Syncer;
};

function toAbsolutePath(filePath: string): AbsolutePath {
  if (!path.isAbsolute(filePath)) {
    throw new Error(`절대 경로가 필요합니다: ${filePath}`);
  }
  // SAFETY: path.isAbsolute 검사로 AbsolutePath 계약을 확인했다.
  return filePath as AbsolutePath;
}

function sha1(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

const testConfig = {
  api: { dir: "api", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
  sync: { targets: ["web"] },
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
  let sonamuSnapshot: ReturnType<typeof Sonamu.captureTestingSnapshot>;
  let registeredTemplates: Template[];
  let templateManagerWasAutoloaded: boolean;

  beforeEach(() => {
    sonamuSnapshot = Sonamu.captureTestingSnapshot();
    registeredTemplates = TemplateManager.getAllKeys().map((key) => TemplateManager.get(key));
    templateManagerWasAutoloaded = TemplateManager.isAutoloaded;

    TemplateManager.reset();
    TemplateManager.registerAll([new Template__http_validators(), new Template__entry_server()]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    Sonamu.restoreTestingSnapshot(sonamuSnapshot);
    TemplateManager.reset();
    TemplateManager.registerAll(registeredTemplates);
    TemplateManager.isAutoloaded = templateManagerWasAutoloaded;
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  async function createTestProject(zodCompiler: ZodCompilerPolicy): Promise<TestProject> {
    const appRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-registry-sync-test-"));
    tempRoots.push(appRootPath);
    const apiRootPath = toAbsolutePath(path.join(appRootPath, "api"));
    const registryPath = toAbsolutePath(
      path.join(apiRootPath, "src/application/sonamu.validators.generated.ts"),
    );
    await Promise.all([
      mkdir(path.dirname(registryPath), { recursive: true }),
      mkdir(path.join(appRootPath, "web/src/services"), { recursive: true }),
    ]);

    const syncer = new Syncer();
    Sonamu.apiRootPath = apiRootPath;
    Sonamu.config = {
      ...testConfig,
      validation: { zodCompiler },
    };
    Sonamu.syncer = syncer;

    return {
      apiRootPath,
      lockPath: path.join(apiRootPath, "sonamu.lock"),
      registryPath,
      syncer,
    };
  }

  async function readLock(lockPath: string): Promise<Array<{ path: string; checksum: string }>> {
    // SAFETY: renewChecksums가 쓰는 sonamu.lock 직렬화 계약을 검증하는 테스트다.
    return JSON.parse(await readFile(lockPath, "utf-8")) as Array<{
      path: string;
      checksum: string;
    }>;
  }

  it.each([
    { label: "opt-out", value: false as const },
    { label: "JIT", value: { api: "jit" as const } },
  ])("$label 정책은 실제 generated registry를 제거한다", async ({ value }) => {
    const { registryPath } = await createTestProject(value);
    await writeFile(registryPath, "export const validators = new Map();\n");

    await actionGenerateHttpValidators();

    await expect(access(registryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("registry-only drift를 정본으로 복구하고 갱신된 checksum lock을 남긴다", async () => {
    const { lockPath, registryPath, syncer } = await createTestProject({ api: "aot" });
    await actionGenerateHttpValidators();
    const canonicalRegistry = await readFile(registryPath, "utf-8");
    await syncer.renewChecksums();
    await writeFile(registryPath, "// drifted registry\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await syncer.sync();

    expect(await readFile(registryPath, "utf-8")).toBe(canonicalRegistry);
    const registryLock = (await readLock(lockPath)).find((entry) =>
      entry.path.endsWith("sonamu.validators.generated.ts"),
    );
    expect(registryLock).toEqual({
      path: "api/src/application/sonamu.validators.generated.ts",
      checksum: sha1(canonicalRegistry),
    });
    await expect(findChangedFilesUsingChecksums()).resolves.toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("삭제된 registry는 다른 tracked 변경을 처리할 때 lock 갱신 전에 복구한다", async () => {
    const { apiRootPath, lockPath, registryPath, syncer } = await createTestProject({ api: "aot" });
    const otherGeneratedPath = path.join(apiRootPath, "src/application/queries.generated.ts");
    await actionGenerateHttpValidators();
    const canonicalRegistry = await readFile(registryPath, "utf-8");
    await writeFile(otherGeneratedPath, "// original generated output\n");
    await syncer.renewChecksums();
    await unlink(registryPath);
    await writeFile(otherGeneratedPath, "// drifted generated output\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await syncer.sync();

    expect(await readFile(registryPath, "utf-8")).toBe(canonicalRegistry);
    const lock = await readLock(lockPath);
    expect(lock).toContainEqual({
      path: "api/src/application/sonamu.validators.generated.ts",
      checksum: sha1(canonicalRegistry),
    });
    await expect(findChangedFilesUsingChecksums()).resolves.toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toContain("queries.generated.ts");
  });
});
