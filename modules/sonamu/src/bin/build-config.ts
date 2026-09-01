import assert from "node:assert";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import chalk from "chalk";
import { type UserConfig } from "tsdown";

import { type NormalizedZodCompilerPolicy } from "../api/config";
import {
  execWithLinePrefix,
  printBuildSummary,
  printTaskFailed,
  printTaskHeader,
  printTaskStart,
  printTaskSuccess,
} from "../utils/console-util";
import { exists } from "../utils/fs-utils";
import { findApiRootPath, findAppRootPath } from "../utils/utils";
import { loadBuildCompilerPolicy } from "./compiler-policy";

export type BuildArtifact<BuildCommandArgs = {}> = {
  name: string;
  description: string;
  projectPath: string;
  preBuildCommand?: () => string;
  buildCommand: (args: BuildCommandArgs) => string;
  postBuildCommand?: () => string;
};

export type ApiTsdownBuildConfig = Pick<UserConfig, "entry" | "plugins">;

export function createWebTypecheckCommand(): string {
  const isSourceModule = path.extname(import.meta.filename) === ".ts";
  const scriptPath = path.join(
    import.meta.dirname,
    `typecheck-web.${isSourceModule ? "ts" : "js"}`,
  );
  const runner = isSourceModule ? "pnpm exec tsx" : JSON.stringify(process.execPath);
  return `${runner} ${JSON.stringify(scriptPath)}`;
}

type ZodCompilerPluginFactory = (typeof import("zod-compiler/rolldown"))["default"];

export interface ApiZodCompilerBuildDependencies {
  loadCompilerPlugin: () => Promise<ZodCompilerPluginFactory>;
}

const apiZodCompilerBuildDependencies: ApiZodCompilerBuildDependencies = {
  async loadCompilerPlugin() {
    return (await import("zod-compiler/rolldown")).default;
  },
};

export async function composeApiZodCompilerBuildConfig<T extends ApiTsdownBuildConfig>(
  baseConfig: T,
  options: {
    policy: NormalizedZodCompilerPolicy;
    registryPath?: string;
  },
  dependencies: ApiZodCompilerBuildDependencies = apiZodCompilerBuildDependencies,
): Promise<T & ApiTsdownBuildConfig> {
  if (options.policy.api !== "aot") {
    return baseConfig;
  }
  if (options.registryPath === undefined) {
    throw new Error("validation.zodCompiler.api requires the generated HTTP validator registry");
  }

  const zodCompiler = await dependencies.loadCompilerPlugin();
  const compilerPlugin = zodCompiler({
    codegenMode: "inline",
    include: [options.registryPath],
    output: "compact",
    schemas: "explicit",
  });

  let configuredPlugins: Exclude<UserConfig["plugins"], undefined>[];
  if (Array.isArray(baseConfig.plugins)) {
    configuredPlugins = baseConfig.plugins;
  } else if (baseConfig.plugins === undefined) {
    configuredPlugins = [];
  } else {
    configuredPlugins = [baseConfig.plugins];
  }

  return {
    ...baseConfig,
    plugins: [...configuredPlugins, compilerPlugin],
  };
}

export function assertApiZodCompilerBuildOutput(
  outputs: readonly { code: string; path: string }[],
): void {
  for (const output of outputs) {
    if (/\bcompile\s*\(/.test(output.code)) {
      throw new Error(`zod-compiler compile boundary remains in ${output.path}`);
    }
    if (output.code.includes("virtual:zod-compiler/runtime")) {
      throw new Error(`zod-compiler virtual runtime import remains in ${output.path}`);
    }
  }
}

export const HTTP_VALIDATOR_REGISTRY_SOURCE_PATH = "src/application/sonamu.validators.generated.ts";
export const HTTP_VALIDATOR_REGISTRY_BUILD_PATH = "dist/application/sonamu.validators.generated.js";

export async function assertApiZodCompilerSourceRegistry(registryPath: string): Promise<void> {
  if (!(await exists(registryPath))) {
    throw new Error(`Generated HTTP validator registry not found: ${registryPath}`);
  }
  const source = await readFile(registryPath, "utf8");
  if (!/fingerprint\s*=\s*["'][a-f0-9]{64}["']/.test(source)) {
    throw new Error(`Generated HTTP validator registry fingerprint is invalid: ${registryPath}`);
  }
  const declaresZeroRoutes = /\brouteIds\s*=\s*\{\s*\}\s*;/.test(source);
  if (!declaresZeroRoutes && !/\bcompile\s*\(/.test(source)) {
    throw new Error(`Generated HTTP validator registry has no compile boundary: ${registryPath}`);
  }
}

export async function createApiZodCompilerBuildWrapper(options: {
  apiRootPath: string;
  baseConfigPath: string;
  policy: NormalizedZodCompilerPolicy;
  registryPath: string;
}): Promise<string> {
  if (options.policy.api !== "aot") {
    return options.baseConfigPath;
  }

  await assertApiZodCompilerSourceRegistry(options.registryPath);
  const wrapperPath = path.join(
    options.apiRootPath,
    `.sonamu-zod-compiler-${process.pid}-${Date.now()}.mjs`,
  );
  const baseConfigUrl = pathToFileURL(options.baseConfigPath).href;
  const source = [
    `import path from "node:path";`,
    `import baseConfig from ${JSON.stringify(baseConfigUrl)};`,
    `import zodCompiler from "zod-compiler/rolldown";`,
    "",
    `const compilerPlugin = zodCompiler(${JSON.stringify({
      codegenMode: "inline",
      include: [options.registryPath],
      output: "compact",
      schemas: "explicit",
    })});`,
    `const registryPath = ${JSON.stringify(options.registryPath)};`,
    `const apiRootPath = ${JSON.stringify(options.apiRootPath)};`,
    `const canonicalOutDir = path.join(apiRootPath, "dist");`,
    `const registryEntryName = "application/sonamu.validators.generated";`,
    `const defaultEntry = { index: "src/index.ts" };`,
    "const resolvesToRegistry = (entry) =>",
    '  typeof entry === "string" && path.resolve(apiRootPath, entry) === registryPath;',
    "const appendRegistryEntry = (entry) => {",
    "  if (Array.isArray(entry)) {",
    "    return entry.some(resolvesToRegistry) ? entry : [...entry, registryPath];",
    "  }",
    '  if (typeof entry === "string") {',
    "    return resolvesToRegistry(entry) ? entry : [entry, registryPath];",
    "  }",
    '  if (typeof entry === "object" && entry !== null) {',
    "    if (Object.values(entry).some(resolvesToRegistry)) return entry;",
    "    if (registryEntryName in entry) {",
    "      throw new Error(`tsdown entry collision: ${registryEntryName}`);",
    "    }",
    "    return { ...entry, [registryEntryName]: registryPath };",
    "  }",
    "  if (entry === undefined) {",
    "    return { ...defaultEntry, [registryEntryName]: registryPath };",
    "  }",
    "  return { [registryEntryName]: registryPath };",
    "};",
    "const appendPlugin = (config) => ({",
    "  ...config,",
    "  // 런타임 loader가 참조하는 registry 경로를 빌드 설정과 일치시킵니다.",
    "  outDir: canonicalOutDir,",
    "  fixedExtension: false,",
    "  entry: appendRegistryEntry(config.entry),",
    "  plugins: [...(config.plugins ?? []), compilerPlugin],",
    "});",
    "const appendToResolvedConfig = (config) =>",
    "  Array.isArray(config) ? config.map(appendPlugin) : appendPlugin(config);",
    "",
    "export default async (...args) => {",
    '  const resolved = typeof baseConfig === "function"',
    "    ? await baseConfig(...args)",
    "    : await baseConfig;",
    "  return appendToResolvedConfig(resolved);",
    "};",
    "",
  ].join("\n");
  await writeFile(wrapperPath, source, "utf8");
  return wrapperPath;
}

/**
 * API 프로젝트 빌드 산출물에 대한 규칙들.
 * cli.ts의 build_api 함수가 이것을 보고 그대로 실행합니다.
 */
export const API_ARTIFACTS: BuildArtifact<{ configFilePath: string }>[] = [
  {
    name: "API",
    description: "API 프로젝트 빌드 산출물",
    projectPath: "api",
    preBuildCommand: () => "rm -rf dist",
    buildCommand: ({ configFilePath }) => {
      const configExtension = path.extname(configFilePath);
      const configLoader = [".ts", ".tsx"].includes(configExtension) ? " --config-loader tsx" : "";
      return `tsc --noEmit && pnpm exec tsdown --config ${JSON.stringify(configFilePath)}${configLoader}`;
    },
  },
];

/**
 * 웹 프로젝트 빌드 산출물에 대한 규칙들.
 * cli.ts의 build_web 함수가 이것을 보고 그대로 실행합니다.
 */
export const WEB_ARTIFACTS: BuildArtifact[] = [
  {
    name: "Web Client",
    description: "Web 프로젝트 클라이언트 빌드 산출물",
    projectPath: "web",
    preBuildCommand: () => "rm -rf dist/client",
    buildCommand: () =>
      `${createWebTypecheckCommand()} && vite build --config vite.config.ts --outDir dist/client`,
  },
  {
    name: "Web Server",
    description: "Web 프로젝트 서버 빌드 산출물",
    projectPath: "web",
    preBuildCommand: () => "rm -rf dist/server",
    buildCommand: () =>
      `${createWebTypecheckCommand()} && vite build --config vite.config.ts --ssr src/entry-server.generated.tsx --outDir dist/server`,
    postBuildCommand: () =>
      "rm -rf ../api/web-dist && mkdir -p ../api/web-dist && cp -r dist/* ../api/web-dist",
  },
];

export async function resolveApiBuildConfigPath(
  apiRootPath: string,
  dependencies: {
    exists: (candidatePath: string) => Promise<boolean>;
    moduleDir: string;
  } = {
    exists,
    moduleDir: import.meta.dirname,
  },
): Promise<string> {
  const localConfigPath = path.join(apiRootPath, "tsdown.config.ts");
  if (await dependencies.exists(localConfigPath)) {
    console.log(chalk.dim("Using tsdown.config.ts from project root..."));
    return localConfigPath;
  }

  console.log(chalk.dim("Using default tsdown API config from sonamu package..."));
  const compiledConfigPath = path.join(dependencies.moduleDir, "..", "tsdown.api.config.js");
  if (await dependencies.exists(compiledConfigPath)) {
    return compiledConfigPath;
  }
  return path.join(dependencies.moduleDir, "..", "..", "tsdown.api.config.ts");
}

async function runBuildSteps<T>(
  artifact: BuildArtifact<T>,
  options: { cwd: string; buildCommandArgs: T },
) {
  const steps = [
    { name: "pre-build", cmd: artifact.preBuildCommand?.() },
    { name: "build", cmd: artifact.buildCommand(options.buildCommandArgs) },
    { name: "post-build", cmd: artifact.postBuildCommand?.() },
  ].filter((step) => step.cmd !== undefined);

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const isLast = index === steps.length - 1;
    try {
      assert(step.cmd);
      printTaskStart(step.name, step.cmd, isLast);
      await execWithLinePrefix(step.cmd, { cwd: options.cwd });
      printTaskSuccess(step.name, isLast);
    } catch (error) {
      printTaskFailed(step.name, isLast);
      throw new Error(`${step.name} failed`, { cause: error });
    }
  }
}

export async function buildApiCommand(): Promise<void> {
  const apiRootPath = findApiRootPath();
  const baseConfigPath = await resolveApiBuildConfigPath(apiRootPath);
  const policy = await loadBuildCompilerPolicy(apiRootPath);
  const registryPath = path.join(apiRootPath, HTTP_VALIDATOR_REGISTRY_SOURCE_PATH);
  const configFilePath = await createApiZodCompilerBuildWrapper({
    apiRootPath,
    baseConfigPath,
    policy,
    registryPath,
  });
  const temporaryConfigPath = configFilePath === baseConfigPath ? undefined : configFilePath;
  const startedAt = Date.now();

  try {
    for (const artifact of API_ARTIFACTS) {
      printTaskHeader(artifact.name, artifact.description, apiRootPath);
      await runBuildSteps(artifact, {
        cwd: apiRootPath,
        buildCommandArgs: { configFilePath },
      });
    }
    if (policy.api === "aot") {
      const outputPath = path.join(apiRootPath, HTTP_VALIDATOR_REGISTRY_BUILD_PATH);
      if (!(await exists(outputPath))) {
        throw new Error(`Built HTTP validator registry not found: ${outputPath}`);
      }
      assertApiZodCompilerBuildOutput([
        { code: await readFile(outputPath, "utf8"), path: outputPath },
      ]);
    }
    printBuildSummary("API", true, Date.now() - startedAt);
  } catch (error) {
    printBuildSummary("API", false, Date.now() - startedAt);
    throw error;
  } finally {
    if (temporaryConfigPath !== undefined) await rm(temporaryConfigPath, { force: true });
  }
}

export async function buildWebCommand({
  skipIfMissing = false,
}: { skipIfMissing?: boolean } = {}): Promise<void> {
  const appRootPath = findAppRootPath();
  const webPath = path.join(appRootPath, "web");
  if (!(await exists(webPath))) {
    if (skipIfMissing) {
      console.log(chalk.gray("Web 디렉토리가 없으므로 Web 빌드를 건너뜁니다."));
      return;
    }
    throw new Error(`web 디렉토리를 찾을 수 없습니다: ${webPath}`);
  }

  const startedAt = Date.now();
  try {
    for (const artifact of WEB_ARTIFACTS) {
      const cwd = path.join(appRootPath, artifact.projectPath);
      printTaskHeader(artifact.name, artifact.description, cwd);
      await runBuildSteps(artifact, { cwd, buildCommandArgs: {} });
    }
    printBuildSummary("Web", true, Date.now() - startedAt);
  } catch (error) {
    printBuildSummary("Web", false, Date.now() - startedAt);
    throw error;
  }
}
