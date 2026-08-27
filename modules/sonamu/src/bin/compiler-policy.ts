import { pathToFileURL } from "node:url";

import { normalizeZodCompilerPolicy, type NormalizedZodCompilerPolicy } from "../api/config";
import { applyCurrentSnapshotToProcessEnv } from "../env";
import { isFunctionValue, isObjectValue } from "../utils/runtime-value";
import { ensureTsLoaderRegistered } from "./ts-loader-registration";

type BuildSourceConfig = {
  validation?: {
    zodCompiler?: unknown;
  };
};

export async function loadBuildCompilerPolicy(
  apiRootPath: string,
): Promise<NormalizedZodCompilerPolicy> {
  applyCurrentSnapshotToProcessEnv(apiRootPath);
  await ensureTsLoaderRegistered(apiRootPath);

  const configUrl = pathToFileURL(`${apiRootPath}/src/sonamu.config.ts`);
  configUrl.searchParams.set("sonamu-build", `${Date.now()}-${Math.random()}`);
  const imported =
    /* SAFETY: CLI 파서와 빌드 도구 입력 계약이 이 값의 타입을 보장한다. */ (await import(
      configUrl.href
    )) as { default: unknown };
  const configured = isFunctionValue(imported.default)
    ? await Promise.resolve(imported.default())
    : await Promise.resolve(imported.default);
  if (!isObjectValue(configured) || configured === null || Array.isArray(configured)) {
    throw new Error("sonamu.config.ts must export a configuration object");
  }

  const config: BuildSourceConfig = configured;
  return normalizeZodCompilerPolicy(config.validation?.zodCompiler);
}
