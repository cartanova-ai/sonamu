import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { type NormalizedZodCompilerPolicy } from "../api/config";
import { exists } from "../utils/fs-utils";

export type BuildArtifact<BuildCommandArgs = {}> = {
  name: string;
  description: string;
  projectPath: string;
  preBuildCommand?: () => string;
  buildCommand: (args: BuildCommandArgs) => string;
  postBuildCommand?: () => string;
};

export type ApiTsdownBuildConfig = {
  plugins?: unknown[];
  [key: string]: unknown;
};

export async function composeApiZodCompilerBuildConfig<T extends ApiTsdownBuildConfig>(
  baseConfig: T,
  options: {
    policy: NormalizedZodCompilerPolicy;
    registryPath?: string;
  },
): Promise<T> {
  if (options.policy.api !== "aot") {
    return baseConfig;
  }
  if (options.registryPath === undefined) {
    throw new Error("validation.zodCompiler.api requires the generated HTTP validator registry");
  }

  const { default: zodCompiler } = await import("zod-compiler/rolldown");
  const compilerPlugin = zodCompiler({
    codegenMode: "inline",
    include: [options.registryPath],
    output: "compact",
    schemas: "explicit",
  });

  return {
    ...baseConfig,
    plugins: [...(baseConfig.plugins ?? []), compilerPlugin],
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
    buildCommand: ({ configFilePath }) =>
      `tsc --noEmit && pnpm exec tsdown --config ${JSON.stringify(configFilePath)}`,
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
      "tsc -b --noEmit && vite build --config vite.config.ts --outDir dist/client",
  },
  {
    name: "Web Server",
    description: "Web 프로젝트 서버 빌드 산출물",
    projectPath: "web",
    preBuildCommand: () => "rm -rf dist/server",
    buildCommand: () =>
      "tsc -b --noEmit && vite build --config vite.config.ts --ssr src/entry-server.generated.tsx --outDir dist/server",
    postBuildCommand: () =>
      "rm -rf ../api/web-dist && mkdir -p ../api/web-dist && cp -r dist/* ../api/web-dist",
  },
];
