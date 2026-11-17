import { type BetterAuthOptions, getBaseURL, isDynamicBaseURLConfig } from "better-auth";

import { type SonamuServerOptions } from "../api/config";

/** better-auth의 baseURL 설정 타입 (문자열 또는 allowedHosts 동적 설정) */
export type AuthBaseURLConfig = NonNullable<BetterAuthOptions["baseURL"]>;

/**
 * baseURL을 어디서 얻었는지 나타낸다.
 * - auth: `server.auth.baseURL`에 직접 설정한 값
 * - env: better-auth가 읽는 환경 변수(`BETTER_AUTH_URL` 등)
 * - server: `server.baseUrl`
 * - listen: 로컬 환경에서만 쓰는 `server.listen` 기반 기본값
 * - none: 원격 환경(staging/production)에서 아무 설정도 없음
 */
export type AuthBaseURLSource = "auth" | "env" | "server" | "listen" | "none";

export type AuthBaseURLResolution = {
  baseURL: AuthBaseURLConfig | undefined;
  /**
   * better-auth에 넘기는 요청 URL의 origin을 고정할 문자열 baseURL.
   * 동적 설정(allowedHosts)은 better-auth가 Host를 허용 목록으로 검증하므로 undefined다.
   */
  requestBaseURL: string | undefined;
  source: AuthBaseURLSource;
};

/** better-auth의 withPath와 같은 규칙으로 basePath를 붙인다 */
function joinBasePath(origin: string, basePath: string): string {
  if (!basePath || basePath === "/") return origin;
  return `${origin}${basePath.startsWith("/") ? basePath : `/${basePath}`}`;
}

/** http(s) 절대 URL이면 origin을, 아니면 undefined를 돌려준다 */
function toHttpOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * better-auth가 자체적으로 읽는 환경 변수(`BETTER_AUTH_URL` 등) 규칙으로 baseURL을 구한다.
 * 요청 없이 호출하므로 Host 헤더를 보지 않는다. 값이 잘못되면 better-auth는 첫 요청에서야
 * 실패하므로, init(CLI 포함)을 깨뜨리지 않도록 미설정으로 취급한다.
 */
function getBaseURLFromEnv(basePath: string): string | undefined {
  try {
    return getBaseURL(undefined, basePath, undefined, true);
  } catch {
    return undefined;
  }
}

/**
 * better-auth에 넘길 baseURL을 결정한다.
 *
 * better-auth는 baseURL이 없으면 요청마다 request.url(=Host 헤더)로 baseURL을 정하고,
 * 그 값으로 비밀번호 리셋·이메일 인증 링크와 trustedOrigins를 만든다.
 * Host 헤더는 클라이언트가 임의로 바꿀 수 있으므로 항상 설정값에서 baseURL을 정한다.
 *
 * 우선순위: `auth.baseURL` → better-auth 환경 변수 → `server.baseUrl` → (로컬 환경만) `server.listen`.
 * 원격 환경에서 모두 없으면 `source: "none"`을 돌려주며, 서버 기동 시 거부한다.
 *
 * @param serverOptions sonamu.config.ts의 server 설정
 * @param options.local 로컬(development/test) 환경 여부
 */
export function resolveAuthBaseURL(
  serverOptions: Pick<SonamuServerOptions, "auth" | "baseUrl" | "listen">,
  options: { local: boolean },
): AuthBaseURLResolution {
  const authOptions = serverOptions.auth;
  const configured = authOptions?.baseURL;
  // 빈 문자열은 better-auth도 미설정으로 취급한다. 동적 설정(allowedHosts)은 Host를 허용 목록으로 검증하므로 그대로 둔다.
  if (configured) {
    return {
      baseURL: configured,
      requestBaseURL: isDynamicBaseURLConfig(configured) ? undefined : configured,
      source: "auth",
    };
  }

  const basePath = authOptions?.basePath ?? "/api/auth";

  const fromEnv = getBaseURLFromEnv(basePath);
  if (fromEnv) {
    return { baseURL: fromEnv, requestBaseURL: fromEnv, source: "env" };
  }

  // server.baseUrl은 외부에서 접근하는 주소이고, auth 라우트는 그 origin의 basePath에 등록된다.
  // 스킴이 없는 등 절대 URL이 아니면 better-auth가 init에서 예외를 던지므로 건너뛴다.
  const serverOrigin = serverOptions.baseUrl ? toHttpOrigin(serverOptions.baseUrl) : undefined;
  if (serverOrigin) {
    const baseURL = joinBasePath(serverOrigin, basePath);
    return { baseURL, requestBaseURL: baseURL, source: "server" };
  }

  if (options.local) {
    // boot()와 syncer가 쓰는 listen 기본값과 같다
    const host = serverOptions.listen?.host ?? "localhost";
    const port = serverOptions.listen?.port ?? 3000;
    const baseURL = joinBasePath(`http://${host}:${port}`, basePath);
    return { baseURL, requestBaseURL: baseURL, source: "listen" };
  }

  return { baseURL: undefined, requestBaseURL: undefined, source: "none" };
}
