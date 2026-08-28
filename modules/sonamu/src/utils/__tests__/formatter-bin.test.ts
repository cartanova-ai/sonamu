import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { resolveOxlintBin } from "../formatter";

const OxlintManifestSchema = z
  .union([
    z.object({ bin: z.string().min(1) }),
    z.object({ bin: z.object({ oxlint: z.string().min(1) }) }).transform(({ bin }) => ({
      bin: bin.oxlint,
    })),
  ])
  .transform(({ bin }) => ({ bin }));

type ResolveOxlintBinOptions = {
  resolveModule: (specifier: string) => string;
  readFile: (filePath: string) => Promise<string>;
  access: (filePath: string, mode: number) => Promise<void>;
};

const tempRoots: string[] = [];

async function createTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sonamu-oxlint-manifest-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("oxlint 실행 파일 해석 회귀", () => {
  it("설치된 패키지 manifest에서 실행 가능한 로컬 절대 경로를 반환한다", async () => {
    const requireFromFormatter = createRequire(new URL("../formatter.ts", import.meta.url));
    const manifestPath = requireFromFormatter.resolve("oxlint/package.json");
    const manifest = OxlintManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
    const expectedBin = path.resolve(path.dirname(manifestPath), manifest.bin);
    const options: ResolveOxlintBinOptions = {
      resolveModule: (specifier) => requireFromFormatter.resolve(specifier),
      readFile: (filePath) => readFile(filePath, "utf8"),
      access,
    };

    const resolvedBin = await resolveOxlintBin(options);

    expect(resolvedBin).toBe(expectedBin);
    expect(path.isAbsolute(resolvedBin)).toBe(true);
    await expect(access(resolvedBin, constants.F_OK | constants.X_OK)).resolves.toBeUndefined();
  });

  it.each([
    ["manifest 파일이 없음", null],
    ["manifest JSON이 잘못됨", "{ invalid json"],
    ["manifest에 bin 필드가 없음", JSON.stringify({ name: "oxlint" })],
  ])("임시 패키지의 %s이면 해결 방법이 있는 오류를 반환한다", async (_caseName, manifest) => {
    const packageRoot = await createTempRoot();
    const manifestPath = path.join(packageRoot, "package.json");
    if (manifest !== null) await writeFile(manifestPath, manifest);
    const options: ResolveOxlintBinOptions = {
      resolveModule: vi.fn(() => manifestPath),
      readFile: vi.fn((filePath) => readFile(filePath, "utf8")),
      access: vi.fn(access),
    };

    await expect(resolveOxlintBin(options)).rejects.toMatchObject({
      code: "OXLINT_BIN_RESOLUTION_FAILED",
      message: expect.stringMatching(/oxlint.*(?:package\.json|bin)/i),
    });
    expect(options.resolveModule).toHaveBeenCalledWith("oxlint/package.json");
    expect(options.readFile).toHaveBeenCalledWith(manifestPath);
    expect(options.access).not.toHaveBeenCalled();
  });

  it("manifest가 가리키는 실행 파일이 없으면 실행 가능 여부를 검사하고 오류를 반환한다", async () => {
    const packageRoot = await createTempRoot();
    const manifestPath = path.join(packageRoot, "package.json");
    const missingBinPath = path.join(packageRoot, "bin", "oxlint");
    await writeFile(manifestPath, JSON.stringify({ bin: { oxlint: "bin/oxlint" } }));
    const options: ResolveOxlintBinOptions = {
      resolveModule: vi.fn(() => manifestPath),
      readFile: vi.fn((filePath) => readFile(filePath, "utf8")),
      access: vi.fn(access),
    };

    await expect(resolveOxlintBin(options)).rejects.toMatchObject({
      code: "OXLINT_BIN_RESOLUTION_FAILED",
      message: expect.stringMatching(/실행 파일.*없거나 실행할 수 없습니다/),
    });
    expect(options.access).toHaveBeenCalledWith(missingBinPath, constants.F_OK | constants.X_OK);
  });
});
