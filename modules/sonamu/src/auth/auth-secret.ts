import { type BetterAuthOptions } from "better-auth";

import { getSonamuEnvironment, type SonamuEnvironment } from "../env";

/**
 * 저장소·문서·better-auth 소스에 공개되어 누구나 아는 secret 목록입니다.
 * 이 값으로 서명하면 세션 쿠키와 이메일 인증 JWT를 누구나 위조할 수 있습니다.
 */
export const KNOWN_PUBLIC_AUTH_SECRETS: readonly string[] = [
  // 과거 miomock·create-sonamu 예시의 fallback
  "miomock-secret-key-change-this-in-production",
  // better-auth가 secret이 없을 때 쓰는 기본값(1.7.x)
  "better-auth-secret-12345678901234567890",
  // better-auth 문서와 이전 버전의 기본값
  "better-auth-secret-123456789",
];

type AuthSecretOptions = Pick<BetterAuthOptions, "secret" | "secrets">;

/**
 * better-auth(1.7.x createContext)와 같은 순서로 실제로 쓰일 secret 값을 모읍니다.
 * `secrets`(또는 BETTER_AUTH_SECRETS)가 있으면 그 값들이 서명·복호화에 쓰이고,
 * `secret`·BETTER_AUTH_SECRET·AUTH_SECRET은 이전 데이터 복호화용으로 함께 남습니다.
 */
export function resolveAuthSecretCandidates(
  options: AuthSecretOptions,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const versioned =
    options.secrets?.map((entry) => entry.value) ?? parseSecretsEnvValues(env.BETTER_AUTH_SECRETS);
  const legacy = options.secret || env.BETTER_AUTH_SECRET || env.AUTH_SECRET || "";

  return [...(versioned ?? []), legacy].filter((value) => value.trim() !== "");
}

function parseSecretsEnvValues(envValue: string | undefined): string[] | undefined {
  if (!envValue) {
    return undefined;
  }

  // 형식은 "<version>:<secret>,..."이며, 형식 오류는 better-auth가 따로 거부합니다.
  return envValue.split(",").map((entry) => {
    const colonIndex = entry.indexOf(":");
    return colonIndex === -1 ? "" : entry.slice(colonIndex + 1).trim();
  });
}

/**
 * better-auth secret이 없거나 공개된 값이면 오류를 던집니다.
 *
 * better-auth는 자기 기본 secret만, 그것도 production에서만 거부합니다. 설정에 공개 문자열 fallback이
 * 있으면 이 안전장치를 지나치므로, Sonamu가 test를 뺀 모든 환경(development·staging·production)에서
 * 서버 기동 전에 직접 확인합니다. 오류 메시지에는 secret 값을 넣지 않습니다.
 */
export function assertAuthSecretConfigured(
  options: AuthSecretOptions,
  env: NodeJS.ProcessEnv = process.env,
  environment: SonamuEnvironment = getSonamuEnvironment(env),
): void {
  if (environment === "test") {
    return;
  }

  const candidates = resolveAuthSecretCandidates(options, env);
  if (candidates.length === 0) {
    throw new Error(
      `better-auth secret is missing (NODE_ENV=${environment}). Set BETTER_AUTH_SECRET (or server.auth.secret) to a random value, e.g. \`openssl rand -base64 32\`. Sonamu refuses to start without it outside test.`,
    );
  }

  const publicSecrets = new Set(KNOWN_PUBLIC_AUTH_SECRETS);
  if (candidates.some((value) => publicSecrets.has(value.trim()))) {
    throw new Error(
      `better-auth secret is a publicly known value (NODE_ENV=${environment}). Anyone can forge session cookies and tokens with it. Set BETTER_AUTH_SECRET to a new random value, e.g. \`openssl rand -base64 32\`, and revoke existing sessions.`,
    );
  }
}
