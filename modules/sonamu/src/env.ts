import { existsSync, readFileSync } from "fs";
import path from "path";

import dotenv from "dotenv";

export const SONAMU_ENVIRONMENTS = ["test", "development", "staging", "production"] as const;

export type SonamuEnvironment = (typeof SONAMU_ENVIRONMENTS)[number];
export interface EnvironmentSnapshot {
  [key: string]: string;
}
export type EnvironmentSnapshots = Record<SonamuEnvironment, EnvironmentSnapshot>;

export function isSonamuEnvironment(value: string | undefined): value is SonamuEnvironment {
  return SONAMU_ENVIRONMENTS.includes(
    /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ value as SonamuEnvironment,
  );
}

export function getSonamuEnvironment(env: NodeJS.ProcessEnv = process.env): SonamuEnvironment {
  const nodeEnv = env.NODE_ENV;

  if (nodeEnv === undefined || nodeEnv === "") {
    return "development";
  }

  if (isSonamuEnvironment(nodeEnv)) {
    return nodeEnv;
  }

  throw new Error(
    `Invalid NODE_ENV "${nodeEnv}". Sonamu supports only ${SONAMU_ENVIRONMENTS.join(", ")}.`,
  );
}

function readDotenvFile(filePath: string): EnvironmentSnapshot {
  if (!existsSync(filePath)) {
    return {};
  }

  return dotenv.parse(readFileSync(filePath));
}

function assertEnvironmentDotenvExists(rootPath: string, environment: SonamuEnvironment): void {
  const commonEnvPath = path.join(rootPath, ".env");
  const environmentEnvPath = path.join(rootPath, `.env.${environment}`);

  if (!existsSync(commonEnvPath) && !existsSync(environmentEnvPath)) {
    throw new Error(
      `Missing Sonamu dotenv file. Create ${commonEnvPath} or ${environmentEnvPath}.`,
    );
  }
}

function removePreloadedCommonDotenvValues(
  baseEnv: NodeJS.ProcessEnv,
  commonEnv: EnvironmentSnapshot,
  environmentEnv: EnvironmentSnapshot,
): NodeJS.ProcessEnv {
  const runtimeEnv = { ...baseEnv };

  for (const [key, commonValue] of Object.entries(commonEnv)) {
    if (environmentEnv[key] !== undefined && runtimeEnv[key] === commonValue) {
      delete runtimeEnv[key];
    }
  }

  return runtimeEnv;
}

export function readEnvironmentSnapshot(
  rootPath: string,
  environment: SonamuEnvironment,
  baseEnv: NodeJS.ProcessEnv = process.env,
): EnvironmentSnapshot {
  assertEnvironmentDotenvExists(rootPath, environment);
  const commonEnv = readDotenvFile(path.join(rootPath, ".env"));
  const environmentEnv = readDotenvFile(path.join(rootPath, `.env.${environment}`));
  const runtimeEnv = removePreloadedCommonDotenvValues(baseEnv, commonEnv, environmentEnv);

  return {
    ...commonEnv,
    ...environmentEnv,
    ...readDotenvFile(path.join(rootPath, ".env.local")),
    ...runtimeEnv,
    NODE_ENV: environment,
  };
}

export function readAllEnvironmentSnapshots(
  rootPath: string,
  baseEnv: NodeJS.ProcessEnv = {},
): EnvironmentSnapshots {
  return /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ Object.fromEntries(
    SONAMU_ENVIRONMENTS.map((environment) => [
      environment,
      readEnvironmentSnapshot(rootPath, environment, baseEnv),
    ]),
  ) as EnvironmentSnapshots;
}

export function applyCurrentSnapshotToProcessEnv(rootPath: string): EnvironmentSnapshot {
  const environment = getSonamuEnvironment();
  const snapshot = readEnvironmentSnapshot(rootPath, environment);

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }

  return snapshot;
}

export function isDevelopmentEnvironment(): boolean {
  return getSonamuEnvironment() === "development";
}

export function isStagingEnvironment(): boolean {
  return getSonamuEnvironment() === "staging";
}

export function isProductionEnvironment(): boolean {
  return getSonamuEnvironment() === "production";
}

export function isTestEnvironment(): boolean {
  return getSonamuEnvironment() === "test";
}
