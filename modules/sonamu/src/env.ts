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

/**
 * 런타임 NODE_ENV가 비어 있을 때 사용할 Sonamu 환경을 결정합니다.
 *
 * 우선순위는 런타임 `NODE_ENV` > `.env.local`의 `NODE_ENV` > `.env`의 `NODE_ENV` > `fallback` 입니다.
 * 환경별 파일(`.env.{environment}`)은 환경이 정해진 뒤에 읽으므로 판정에 쓰지 않습니다.
 * `env`는 읽기만 하고 바꾸지 않으며, 정해진 값이 Sonamu 환경이 아니면 에러를 던집니다.
 */
export function resolveSonamuEnvironment(
  rootPath: string,
  fallback: SonamuEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): SonamuEnvironment {
  if (env.NODE_ENV !== undefined && env.NODE_ENV !== "") {
    return getSonamuEnvironment(env);
  }

  const dotenvNodeEnv =
    readDotenvFile(path.join(rootPath, ".env.local")).NODE_ENV ||
    readDotenvFile(path.join(rootPath, ".env")).NODE_ENV;

  return getSonamuEnvironment({ NODE_ENV: dotenvNodeEnv || fallback });
}

/**
 * {@link resolveSonamuEnvironment}로 결정한 환경을 `env.NODE_ENV`에 기록하고 돌려줍니다.
 */
export function ensureSonamuEnvironment(
  rootPath: string,
  fallback: SonamuEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): SonamuEnvironment {
  const environment = resolveSonamuEnvironment(rootPath, fallback, env);
  env.NODE_ENV = environment;
  return environment;
}

/**
 * 서버 프로세스의 환경을 확정합니다.
 *
 * 소스 실행(`sonamu dev`의 `HOT=yes`, vitest)이 아닌 빌드 산출물 실행은 NODE_ENV가 없으면
 * production으로 봅니다. 미설정을 development로 보면 Sonamu UI와 dev 라우트가 프로덕션 포트에 열립니다.
 */
export function ensureServerEnvironment(
  rootPath: string,
  env: NodeJS.ProcessEnv = process.env,
): SonamuEnvironment {
  const isSourceRuntime = env.HOT === "yes" || env.VITEST === "true";
  return ensureSonamuEnvironment(rootPath, isSourceRuntime ? "development" : "production", env);
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
  // 개발 도구(sync, migrate 등)는 NODE_ENV 없이 실행되므로 기본값은 development로 유지합니다.
  const environment = resolveSonamuEnvironment(rootPath, "development");
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
