import { exec } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isFunctionValue, isObjectValue } from "../../utils/runtime-value";
import {
  assertApiZodCompilerBuildOutput,
  assertApiZodCompilerSourceRegistry,
  composeApiZodCompilerBuildConfig,
  createApiZodCompilerBuildWrapper,
  createWebTypecheckCommand,
  WEB_ARTIFACTS,
} from "../build-config";

const compilerPluginFake = vi.fn();
const execAsync = promisify(exec);
const webTypecheckRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    webTypecheckRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
  );
});
const compilerDependencies = {
  async loadCompilerPlugin() {
    return compilerPluginFake;
  },
};

describe("TypeScript 7 Web 빌드 정책", () => {
  it("선언을 만들지 않는 앱은 모든 project reference를 타입 검사한다", async () => {
    const webRoot = await mkdtemp(path.join(process.cwd(), ".sonamu-web-typecheck-test-"));
    webTypecheckRoots.push(webRoot);
    await writeFile(
      path.join(webRoot, "tsconfig.json"),
      `{
        // TypeScript가 지원하는 JSONC 형식을 유지합니다.
        "references": [
          { "path": "tsconfig.app.json" },
          { "path": "tsconfig.worker.json" },
        ],
      }`,
    );
    for (const project of ["app", "worker"]) {
      await writeFile(
        path.join(webRoot, `tsconfig.${project}.json`),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            declaration: true,
            declarationMap: true,
            emitDeclarationOnly: true,
            strict: true,
          },
          files: [`${project}.ts`],
        }),
      );
    }
    await writeFile(path.join(webRoot, "app.ts"), "export const app: string = 1;\n");
    await writeFile(path.join(webRoot, "worker.ts"), 'export const worker: string = "ok";\n');

    await expect(execAsync(createWebTypecheckCommand(), { cwd: webRoot })).rejects.toThrow();
    await writeFile(path.join(webRoot, "app.ts"), 'export const app: string = "ok";\n');
    await writeFile(path.join(webRoot, "worker.ts"), "export const worker: string = 1;\n");
    await expect(execAsync(createWebTypecheckCommand(), { cwd: webRoot })).rejects.toThrow();
    await writeFile(path.join(webRoot, "worker.ts"), 'export const worker: string = "ok";\n');
    await expect(execAsync(createWebTypecheckCommand(), { cwd: webRoot })).resolves.toBeDefined();

    for (const artifact of WEB_ARTIFACTS) {
      const command = artifact.buildCommand({ configFilePath: "" });
      expect(command).toContain("typecheck-web");
      expect(command).not.toContain("tsc -b");
    }
  });
});

describe("API zod-compiler 빌드 정책", () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    compilerPluginFake.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it.each([false, "jit"] as const)(
    "%s 정책은 registry 없이 기존 tsdown 설정을 유지한다",
    async (api) => {
      const baseConfig = {
        entry: ["src/index.ts"],
        plugins: [{ name: "custom" }],
      };

      expect(
        await composeApiZodCompilerBuildConfig(baseConfig, {
          policy: { api, targets: {} },
        }),
      ).toEqual(baseConfig);
      expect(compilerPluginFake).not.toHaveBeenCalled();
    },
  );

  it("기본 설정과 사용자 설정에 registry 전용 explicit compact inline plugin을 합성한다", async () => {
    const registryPath = "/project/api/src/application/sonamu.validators.generated.ts";
    const compilerPlugin = { name: "zod-compiler" };
    const customPlugin = { name: "custom" };
    compilerPluginFake.mockReturnValue(compilerPlugin);

    const defaultConfig = await composeApiZodCompilerBuildConfig(
      { entry: ["src/index.ts"] },
      {
        policy: { api: "aot", targets: {} },
        registryPath,
      },
      compilerDependencies,
    );
    const customConfig = await composeApiZodCompilerBuildConfig(
      { entry: ["src/index.ts"], plugins: [customPlugin] },
      {
        policy: { api: "aot", targets: {} },
        registryPath,
      },
      compilerDependencies,
    );

    expect(compilerPluginFake).toHaveBeenNthCalledWith(1, {
      codegenMode: "inline",
      include: [registryPath],
      output: "compact",
      schemas: "explicit",
    });
    expect(compilerPluginFake).toHaveBeenNthCalledWith(2, {
      codegenMode: "inline",
      include: [registryPath],
      output: "compact",
      schemas: "explicit",
    });
    expect(defaultConfig.plugins).toEqual([compilerPlugin]);
    expect(customConfig.plugins).toEqual([customPlugin, compilerPlugin]);
  });

  it("실제 build wrapper가 사용자 object entry와 plugin을 보존하면서 registry entry를 추가한다", async () => {
    const apiRootPath = await mkdtemp(path.join(process.cwd(), ".sonamu-build-wrapper-test-"));
    tempRoots.push(apiRootPath);
    const registryPath = path.join(apiRootPath, "src/application/sonamu.validators.generated.ts");
    const baseConfigPath = path.join(apiRootPath, "tsdown.config.mjs");
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      `export const fingerprint = "${"a".repeat(64)}";\nexport const validator = compile(schema);\n`,
    );
    await writeFile(
      baseConfigPath,
      `export default { entry: { index: "src/index.ts" }, plugins: [{ name: "custom" }] };\n`,
    );
    const wrapperPath = await createApiZodCompilerBuildWrapper({
      apiRootPath,
      baseConfigPath,
      policy: { api: "aot", targets: {} },
      registryPath,
    });
    const wrapperModule: unknown = await import(`${pathToFileURL(wrapperPath).href}?test=entry`);
    if (
      !isObjectValue(wrapperModule) ||
      wrapperModule === null ||
      !("default" in wrapperModule) ||
      !isFunctionValue(wrapperModule.default)
    ) {
      throw new Error("build wrapper가 default config factory를 내보내지 않았습니다");
    }
    const resolvedConfig: unknown = await wrapperModule.default();
    if (!isObjectValue(resolvedConfig) || resolvedConfig === null) {
      throw new Error("build wrapper가 tsdown config object를 반환하지 않았습니다");
    }
    const entry = "entry" in resolvedConfig ? resolvedConfig.entry : undefined;
    const plugins = "plugins" in resolvedConfig ? resolvedConfig.plugins : undefined;

    expect(entry).toMatchObject({ index: "src/index.ts" });
    expect(isObjectValue(entry) && entry !== null ? Object.values(entry) : []).toContain(
      registryPath,
    );
    expect(plugins).toEqual([
      { name: "custom" },
      expect.objectContaining({ name: "zod-compiler" }),
    ]);
  });

  it("entry가 undefined인 사용자 설정은 tsdown 기본 entry와 registry entry를 함께 보존한다", async () => {
    const apiRootPath = await mkdtemp(path.join(process.cwd(), ".sonamu-default-entry-test-"));
    tempRoots.push(apiRootPath);
    const registryPath = path.join(apiRootPath, "src/application/sonamu.validators.generated.ts");
    const baseConfigPath = path.join(apiRootPath, "tsdown.config.mjs");
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      `export const fingerprint = "${"c".repeat(64)}";\nexport const validator = compile(schema);\n`,
    );
    await writeFile(
      baseConfigPath,
      `export default { entry: undefined, plugins: [{ name: "custom" }] };\n`,
    );
    const wrapperPath = await createApiZodCompilerBuildWrapper({
      apiRootPath,
      baseConfigPath,
      policy: { api: "aot", targets: {} },
      registryPath,
    });
    const wrapperModule: unknown = await import(`${pathToFileURL(wrapperPath).href}?test=default`);
    if (
      !isObjectValue(wrapperModule) ||
      wrapperModule === null ||
      !("default" in wrapperModule) ||
      !isFunctionValue(wrapperModule.default)
    ) {
      throw new Error("build wrapper가 default config factory를 내보내지 않았습니다");
    }
    const resolvedConfig: unknown = await wrapperModule.default();
    if (
      !isObjectValue(resolvedConfig) ||
      resolvedConfig === null ||
      !("entry" in resolvedConfig) ||
      !isObjectValue(resolvedConfig.entry) ||
      resolvedConfig.entry === null
    ) {
      throw new Error("build wrapper가 기본 entry를 포함한 object entry를 반환하지 않았습니다");
    }

    expect(resolvedConfig.entry).toMatchObject({
      index: "src/index.ts",
      "application/sonamu.validators.generated": registryPath,
    });
    expect("plugins" in resolvedConfig ? resolvedConfig.plugins : undefined).toEqual([
      { name: "custom" },
      expect.objectContaining({ name: "zod-compiler" }),
    ]);
  });

  it("canonical registry key의 상대 entry는 같은 registry로 해석해 충돌 없이 보존한다", async () => {
    const apiRootPath = await mkdtemp(path.join(process.cwd(), ".sonamu-relative-entry-test-"));
    tempRoots.push(apiRootPath);
    const relativeRegistryPath = "./src/application/sonamu.validators.generated.ts";
    const registryPath = path.join(apiRootPath, "src/application/sonamu.validators.generated.ts");
    const baseConfigPath = path.join(apiRootPath, "tsdown.config.mjs");
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      `export const fingerprint = "${"b".repeat(64)}";\nexport const validator = compile(schema);\n`,
    );
    await writeFile(
      baseConfigPath,
      [
        "export default {",
        '  entry: { index: "src/index.ts",',
        `    "application/sonamu.validators.generated": ${JSON.stringify(relativeRegistryPath)} },`,
        "};",
        "",
      ].join("\n"),
    );
    const wrapperPath = await createApiZodCompilerBuildWrapper({
      apiRootPath,
      baseConfigPath,
      policy: { api: "aot", targets: {} },
      registryPath,
    });
    const wrapperModule: unknown = await import(`${pathToFileURL(wrapperPath).href}?test=relative`);
    if (
      !isObjectValue(wrapperModule) ||
      wrapperModule === null ||
      !("default" in wrapperModule) ||
      !isFunctionValue(wrapperModule.default)
    ) {
      throw new Error("build wrapper가 default config factory를 내보내지 않았습니다");
    }
    const resolvedConfig: unknown = await wrapperModule.default();
    if (
      !isObjectValue(resolvedConfig) ||
      resolvedConfig === null ||
      !("entry" in resolvedConfig) ||
      !isObjectValue(resolvedConfig.entry) ||
      resolvedConfig.entry === null
    ) {
      throw new Error("build wrapper가 object entry를 반환하지 않았습니다");
    }

    expect(resolvedConfig.entry).toMatchObject({
      index: "src/index.ts",
      "application/sonamu.validators.generated": relativeRegistryPath,
    });
  });

  it("REST API가 0개인 AOT registry를 compile 경계 없이 검증하고 wrapper로 내보낸다", async () => {
    const apiRootPath = await mkdtemp(path.join(process.cwd(), ".sonamu-zero-registry-test-"));
    tempRoots.push(apiRootPath);
    const registryPath = path.join(apiRootPath, "src/application/sonamu.validators.generated.ts");
    const baseConfigPath = path.join(apiRootPath, "tsdown.config.mjs");
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      [
        `export const fingerprint = "${"0".repeat(64)}";`,
        "export const routeIds = {};",
        "export const validators = new Map();",
        "",
      ].join("\n"),
    );
    await writeFile(baseConfigPath, `export default { entry: { index: "src/index.ts" } };\n`);

    await expect(assertApiZodCompilerSourceRegistry(registryPath)).resolves.toBeUndefined();
    const wrapperPath = await createApiZodCompilerBuildWrapper({
      apiRootPath,
      baseConfigPath,
      policy: { api: "aot", targets: {} },
      registryPath,
    });

    await expect(readFile(wrapperPath, "utf8")).resolves.toContain(registryPath);
    const registrySource = await readFile(registryPath, "utf8");
    expect(() =>
      assertApiZodCompilerBuildOutput([
        {
          code: registrySource,
          path: registryPath,
        },
      ]),
    ).not.toThrow();
  });

  it.each([
    {
      code: "export const validator = compile(schema);",
      label: "적용되지 않은 compile 경계",
    },
    {
      code: 'import { parse } from "virtual:zod-compiler/runtime";',
      label: "해석되지 않은 virtual runtime import",
    },
  ])("$label가 남은 AOT 산출물을 거부한다", ({ code }) => {
    expect(() =>
      assertApiZodCompilerBuildOutput([
        {
          code,
          path: "dist/application/sonamu.validators.generated.js",
        },
      ]),
    ).toThrow();
  });

  it("compile 경계와 virtual import가 제거된 AOT 산출물을 허용한다", () => {
    expect(() =>
      assertApiZodCompilerBuildOutput([
        {
          code: "export const validator = { parse(input) { return input; } };",
          path: "dist/application/sonamu.validators.generated.js",
        },
      ]),
    ).not.toThrow();
  });
});
