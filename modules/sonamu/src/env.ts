import { existsSync, readFileSync } from "fs";
import path from "path";

import dotenv from "dotenv";

export const SONAMU_ENVIRONMENTS = ["test", "development", "staging", "production"] as const;

export type SonamuEnvironment = (typeof SONAMU_ENVIRONMENTS)[number];
export type EnvironmentSnapshot = Record<string, string>;
export type EnvironmentSnapshots = Record<SonamuEnvironment, EnvironmentSnapshot>;

export function isSonamuEnvironment(value: string | undefined): value is SonamuEnvironment {
  return SONAMU_ENVIRONMENTS.includes(value as SonamuEnvironment);
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

export function loadEnvironmentSnapshot(
  rootPath: string,
  environment: SonamuEnvironment,
  baseEnv: NodeJS.ProcessEnv = process.env,
): EnvironmentSnapshot {
  assertEnvironmentDotenvExists(rootPath, environment);

  return {
    ...readDotenvFile(path.join(rootPath, ".env")),
    ...readDotenvFile(path.join(rootPath, `.env.${environment}`)),
    ...readDotenvFile(path.join(rootPath, ".env.local")),
    ...baseEnv,
    NODE_ENV: environment,
  };
}

export function loadCurrentEnvironmentDotenv(rootPath: string): EnvironmentSnapshot {
  const environment = getSonamuEnvironment();
  const snapshot = loadEnvironmentSnapshot(rootPath, environment);

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }

  return snapshot;
}

export function loadAllEnvironmentSnapshots(
  rootPath: string,
  baseEnv: NodeJS.ProcessEnv = {},
): EnvironmentSnapshots {
  return Object.fromEntries(
    SONAMU_ENVIRONMENTS.map((environment) => [
      environment,
      loadEnvironmentSnapshot(rootPath, environment, baseEnv),
    ]),
  ) as EnvironmentSnapshots;
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
