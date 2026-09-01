import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

interface PackageManifest {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
  files?: string[];
  exports?: Record<string, Record<string, string>>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

async function readRepositoryFile(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

async function readManifest(relativePath: string): Promise<PackageManifest> {
  return JSON.parse(await readRepositoryFile(relativePath));
}

function extractIndentedBlock(content: string, header: string) {
  const lines = content.split("\n");
  const start = lines.indexOf(header);
  if (start === -1) return "";

  const indentation = header.length - header.trimStart().length;
  const end = lines.findIndex((line, index) => {
    if (index <= start || line.trim() === "") return false;
    return line.length - line.trimStart().length <= indentation;
  });

  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function extractTomlSection(content: string, header: string) {
  const start = content.indexOf(header);
  if (start === -1) return "";

  const end = content.indexOf("\n[", start + header.length);
  return content.slice(start, end === -1 ? undefined : end);
}

function expectSafePublishBackupMapping(source: string) {
  expect(source).toMatch(
    /const\s+packageRoot\s*=\s*path\.(?:join|resolve)\(__dirname,\s*["']\.\.["']\)/,
  );
  expect(source).toMatch(
    /const\s+templateRoot\s*=\s*path\.(?:join|resolve)\(packageRoot,\s*["']template["']\)/,
  );
  expect(source).toMatch(
    /const\s+backupRoot\s*=\s*path\.(?:join|resolve)\(packageRoot,\s*["']\.publish-backups["']\)/,
  );
  expect(source).toMatch(/path\.relative\(templateRoot,\s*file\)/);
  expect(source).toMatch(/path\.isAbsolute\([^)]*\)/);
  expect(source).toMatch(/\.startsWith\(["'`]\.\./);
  expect(source).toMatch(/throw new Error/);
  expect(source).toMatch(/path\.join\(backupRoot,\s*[^)]*\)/);
  expect(source).not.toMatch(/`\$\{file\}\.bak`|\.bak["'`]/);
}

describe("최종 CLI 패키지 워크스페이스 통합", () => {
  it("CLI가 Optique 통합 패키지만 선언하고 기존 prompts 의존성을 제거한다", async () => {
    const manifest = await readManifest("modules/cli/package.json");

    expect(manifest.dependencies).toMatchObject({
      "@optique/clack": "catalog:",
      "@optique/logtape": "catalog:",
      "@optique/zod": "catalog:",
    });
    expect(manifest.dependencies?.prompts).toBeUndefined();
    expect(manifest.devDependencies?.["@types/prompts"]).toBeUndefined();
  });

  it("sonamu가 tooling 진입점만 공개하고 CLI 실행 파일과 tsicli를 소유하지 않는다", async () => {
    const manifest = await readManifest("modules/sonamu/package.json");

    expect(manifest.exports?.["./tooling"]).toEqual({
      import: "./dist/tooling/index.js",
      types: "./dist/tooling/index.d.ts",
      development: "./src/tooling/index.ts",
    });
    expect(manifest.bin).toBeUndefined();
    expect(manifest.dependencies?.tsicli).toBeUndefined();
    expect(manifest.devDependencies?.tsicli).toBeUndefined();
  });

  it("예제와 생성 템플릿이 CLI를 직접 의존하면서 sonamu 스크립트를 유지한다", async () => {
    for (const manifestPath of [
      "examples/miomock/api/package.json",
      "modules/create-sonamu/template/src/packages/api/package.json",
    ]) {
      const manifest = await readManifest(manifestPath);

      expect(manifest.dependencies).toMatchObject({
        "@sonamu-kit/cli": "workspace:^",
        sonamu: "workspace:^",
      });
      expect(manifest.scripts?.sonamu).toBe("sonamu");
    }
  });

  it("예제와 생성 템플릿의 seed가 seedOnly 후 fixture를 dry-run이 아닌 실행 모드로 호출한다", async () => {
    for (const manifestPath of [
      "examples/miomock/api/package.json",
      "modules/create-sonamu/template/src/packages/api/package.json",
    ]) {
      const manifest = await readManifest(manifestPath);

      expect(manifest.scripts?.seedOnly).toBe("bash database/scripts/seed.sh");
      expect(manifest.scripts?.seed).toBe(
        "pnpm seedOnly && sonamu fixture sync --execute --confirm",
      );
    }
  });

  it("예제와 생성 템플릿의 sync:dump가 마이그레이션을 명시적으로 승인해 실행한다", async () => {
    for (const manifestPath of [
      "examples/miomock/api/package.json",
      "modules/create-sonamu/template/src/packages/api/package.json",
    ]) {
      const manifest = await readManifest(manifestPath);

      expect(manifest.scripts?.["sync:dump"]).toContain("sonamu migrate run --execute --confirm");
    }
  });

  it("CI 유닛 테스트 준비가 마이그레이션을 명시적으로 승인해 실행한다", async () => {
    const source = await readRepositoryFile("scripts/miomock-unit-test.sh");

    expect(source).toContain("sonamu migrate run --execute --confirm");
  });

  it("create-sonamu 배포 준비가 sonamu와 CLI의 워크스페이스 버전을 모두 치환한다", async () => {
    const source = await readRepositoryFile("modules/create-sonamu/scripts/prepublish.mjs");

    expect(source).toMatch(/modules\/sonamu\/package\.json/);
    expect(source).toMatch(/modules\/cli\/package\.json/);
    expect(source).toMatch(
      /name\s*===\s*["']sonamu["'][\s\S]*?deps\[name\]\s*=\s*`\^\$\{[^}]+\.version\}`/,
    );
    expect(source).toMatch(
      /name\s*===\s*["']@sonamu-kit\/cli["'][\s\S]*?deps\[name\]\s*=\s*`\^\$\{[^}]+\.version\}`/,
    );
  });

  it("create-sonamu 배포 백업을 템플릿 밖의 전용 디렉터리에 안전하게 매핑한다", async () => {
    const [manifest, prepublish, postpublish] = await Promise.all([
      readManifest("modules/create-sonamu/package.json"),
      readRepositoryFile("modules/create-sonamu/scripts/prepublish.mjs"),
      readRepositoryFile("modules/create-sonamu/scripts/postpublish.mjs"),
    ]);

    expect(manifest.files).toContain("template");
    expect(manifest.files).not.toContain(".publish-backups");
    expectSafePublishBackupMapping(prepublish);
    expectSafePublishBackupMapping(postpublish);

    for (const source of [prepublish, postpublish]) {
      expect(source).toMatch(/src["'],\s*["']packages["'],\s*["']api["'],\s*["']package\.json/);
      expect(source).toMatch(/src["'],\s*["']packages["'],\s*["']web["'],\s*["']package\.json/);
    }
  });

  it("create-sonamu 배포 후 템플릿 원본을 복원하고 임시 산출물을 제거한다", async () => {
    const postpublish = await readRepositoryFile("modules/create-sonamu/scripts/postpublish.mjs");

    expect(postpublish).toMatch(
      /for\s*\(const file of templateFiles\)[\s\S]*?fs\.move\([^,]*backup[^,]*,\s*file,\s*\{\s*overwrite:\s*true\s*\}\)/,
    );
    expect(postpublish).toMatch(/fs\.remove\(backupRoot\)/);
    expect(postpublish).toMatch(/fs\.remove\(catalogJsonPath\)/);
  });

  it("명시적 배포 순서에서 sonamu, CLI, create-sonamu 순으로 처리한다", async () => {
    const source = await readRepositoryFile("scripts/publish.ts");
    const invocation = source.slice(source.lastIndexOf("publish("));
    const cliIndex = invocation.indexOf('"./modules/cli"');
    const sonamuIndex = invocation.indexOf('"./modules/sonamu"');
    const createSonamuIndex = invocation.indexOf('"./modules/create-sonamu"');

    expect(cliIndex).toBeGreaterThan(-1);
    expect(sonamuIndex).toBeGreaterThan(-1);
    expect(sonamuIndex).toBeLessThan(cliIndex);
    expect(cliIndex).toBeLessThan(createSonamuIndex);
  });

  it("워크스페이스와 루트 빌드가 CLI 패키지를 발견하고 빌드한다", async () => {
    const [workspace, mise, cliManifest] = await Promise.all([
      readRepositoryFile("pnpm-workspace.yaml"),
      readRepositoryFile("mise.toml"),
      readManifest("modules/cli/package.json"),
    ]);
    const packages = extractIndentedBlock(workspace, "packages:");
    const rootBuild = extractTomlSection(mise, "[tasks.build]");

    expect(packages).toContain("- modules/**/*");
    expect(cliManifest.name).toBe("@sonamu-kit/cli");
    expect(cliManifest.scripts?.build).toBeTruthy();
    expect(rootBuild).toMatch(/pnpm\s+--filter\s+!ui-web\s+-r\s+build/);
    expect(rootBuild).not.toContain("!@sonamu-kit/cli");
  });

  it("sonamu bin은 CLI 패키지만 소유하고 이전 래퍼와 소스는 존재하지 않는다", async () => {
    const modules = await readdir(path.join(repositoryRoot, "modules"), { withFileTypes: true });
    const owners: string[] = [];

    for (const module of modules) {
      if (!module.isDirectory()) continue;
      try {
        const manifest = await readManifest(`modules/${module.name}/package.json`);
        const ownsDefaultSonamuBin = manifest.name === "sonamu" && manifest.bin !== undefined;
        const ownsNamedSonamuBin = Object.prototype.hasOwnProperty.call(
          manifest.bin ?? {},
          "sonamu",
        );
        if (ownsDefaultSonamuBin || ownsNamedSonamuBin) {
          owners.push(manifest.name ?? module.name);
        }
      } catch {
        // 패키지 매니페스트가 없는 모듈은 실행 파일 소유권 검사에서 제외한다.
      }
    }

    expect(owners).toEqual(["@sonamu-kit/cli"]);
    for (const removedPath of ["modules/sonamu/bin/cli.js", "modules/sonamu/src/bin/cli.ts"]) {
      await expect(access(path.join(repositoryRoot, removedPath))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }

    const [workspace, lockfile] = await Promise.all([
      readRepositoryFile("pnpm-workspace.yaml"),
      readRepositoryFile("pnpm-lock.yaml"),
    ]);
    expect(`${workspace}\n${lockfile}`).not.toMatch(/\btsicli\b/);
  });

  it("Optique 1.2.4를 설치할 수 있도록 최소 배포 경과 시간 정책에서 제외한다", async () => {
    const workspace = await readRepositoryFile("pnpm-workspace.yaml");
    const exclusions = extractIndentedBlock(workspace, "minimumReleaseAgeExclude:");

    expect(workspace).toMatch(/^minimumReleaseAge:\s*2880$/m);
    expect(exclusions).toMatch(/^\s+- ["']?@optique\/\*["']?$/m);
    expect(exclusions).toMatch(/^\s+- typescript$/m);
  });

  it("miomock 설치 메타데이터의 sonamu bin이 CLI 워크스페이스 링크를 가리킨다", async () => {
    const [apiManifest, cliManifest, lockfile] = await Promise.all([
      readManifest("examples/miomock/api/package.json"),
      readManifest("modules/cli/package.json"),
      readRepositoryFile("pnpm-lock.yaml"),
    ]);
    const importer = extractIndentedBlock(lockfile, "  examples/miomock/api:");
    const workspaceLink = "../../../modules/cli";

    expect(apiManifest.dependencies?.["@sonamu-kit/cli"]).toBe("workspace:^");
    expect(importer).toMatch(
      /'@sonamu-kit\/cli':\n\s+specifier: workspace:\^\n\s+version: link:\.\.\/\.\.\/\.\.\/modules\/cli/,
    );
    expect(path.resolve(repositoryRoot, "examples/miomock/api", workspaceLink)).toBe(
      path.join(repositoryRoot, "modules/cli"),
    );
    expect(cliManifest.bin).toEqual({ sonamu: "./bin/sonamu.js" });
  });

  it("CLI는 sonamu를 peer로 요구하고 sonamu는 CLI를 런타임 의존하지 않는다", async () => {
    const [cliManifest, sonamuManifest] = await Promise.all([
      readManifest("modules/cli/package.json"),
      readManifest("modules/sonamu/package.json"),
    ]);

    expect(sonamuManifest.version).toBe("0.11.0");
    expect(cliManifest.version).toBe("0.1.0");
    expect(cliManifest.peerDependencies?.sonamu).toBe("^0.11.0");
    expect(cliManifest.dependencies?.sonamu).toBeUndefined();
    expect(sonamuManifest.dependencies?.["@sonamu-kit/cli"]).toBeUndefined();
    expect(sonamuManifest.optionalDependencies?.["@sonamu-kit/cli"]).toBeUndefined();
  });
});
