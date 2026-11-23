import { isIP } from "node:net";

import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import { type SonamuServerOptions } from "../api/config";
import { SD } from "../dict/sd";

/** Host 헤더에서 호스트 이름과 포트만 받아들입니다. userinfo·경로·공백이 섞인 값은 거부합니다. */
const HOST_HEADER_PATTERN =
  /^(?:\[(?<ipv6>[0-9a-f:.]+)\]|(?<name>[^\s:@/?#[\]\\]+))(?::\d{1,5})?$/i;

/** devAllowedHosts 항목은 포트·스킴·경로가 없는 호스트 이름이어야 합니다. */
const ALLOWED_HOSTNAME_PATTERN = /^[^\s:@/?#[\]\\]+$/;

/**
 * 개발 서버의 Sonamu UI·dev 라우트가 받아들일 Host 헤더인지 판정합니다.
 *
 * DNS rebinding은 공격자가 소유한 도메인 이름을 개발자 PC 주소로 바꿔치기하므로
 * 브라우저가 보내는 Host에는 공격자 도메인이 남습니다. 따라서 공격자가 이름을 소유할 수 없는
 * localhost, *.localhost, IP 리터럴과 설정에 적힌 호스트만 허용합니다.
 *
 * @param hostHeader 요청의 Host 헤더 값
 * @param configuredHostnames server.listen.host, server.baseUrl처럼 앱이 직접 설정한 호스트 이름
 */
export function isAllowedDevHost(
  hostHeader: string | undefined,
  configuredHostnames: readonly string[] = [],
): boolean {
  if (hostHeader === undefined) {
    return false;
  }
  const groups = HOST_HEADER_PATTERN.exec(hostHeader.trim())?.groups;
  if (groups === undefined) {
    return false;
  }

  const ipv6 = groups.ipv6;
  if (ipv6 !== undefined) {
    return isIP(ipv6) === 6;
  }

  const hostname = groups.name?.toLowerCase();
  if (hostname === undefined) {
    return false;
  }
  // IP 리터럴은 DNS를 거치지 않아 rebinding 대상이 될 수 없습니다(Vite allowedHosts 기본 규칙과 같음).
  if (isIP(hostname) !== 0) {
    return true;
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }
  return configuredHostnames.some((configured) => configured.toLowerCase() === hostname);
}

/**
 * 서버 설정에서 개발자가 직접 지정한 호스트 이름(listen.host, baseUrl의 호스트, devAllowedHosts)을 모읍니다.
 *
 * @throws devAllowedHosts에 포트·스킴이 붙는 등 호스트 이름이 아닌 항목이 있으면 Error를 던집니다.
 *   이런 항목은 어떤 Host와도 일치하지 않아 조용히 403만 내므로 부팅 시점에 알립니다.
 */
export function getConfiguredDevHostnames(
  serverOptions: Pick<SonamuServerOptions, "baseUrl" | "listen" | "devAllowedHosts">,
): string[] {
  const hostnames: string[] = [];
  const listenHost = serverOptions.listen?.host;
  if (listenHost !== undefined && listenHost !== "") {
    hostnames.push(listenHost);
  }
  if (serverOptions.baseUrl !== undefined) {
    try {
      hostnames.push(new URL(serverOptions.baseUrl).hostname.replace(/^\[(.*)\]$/, "$1"));
    } catch {
      // URL이 아닌 baseUrl은 허용 호스트에 더하지 않습니다.
    }
  }
  for (const allowed of serverOptions.devAllowedHosts ?? []) {
    if (!ALLOWED_HOSTNAME_PATTERN.test(allowed)) {
      throw new Error(
        `server.devAllowedHosts에는 포트·스킴 없는 호스트 이름만 지정할 수 있습니다: ${JSON.stringify(allowed)}`,
      );
    }
    hostnames.push(allowed);
  }
  return hostnames;
}

function isUnderPrefix(routeUrl: string, prefix: string): boolean {
  // prefix를 둔 플러그인의 "*" 라우트는 "/sonamu-ui*"로 합쳐지므로 "*" 경계도 같은 라우트 묶음으로 봅니다.
  return (
    routeUrl === prefix || routeUrl.startsWith(`${prefix}/`) || routeUrl.startsWith(`${prefix}*`)
  );
}

/**
 * 허용되지 않은 Host로 들어온 Sonamu UI·dev 라우트 요청을 403으로 거부하는 onRequest 훅을 등록합니다.
 *
 * 매칭된 라우트 경로(routeOptions.url)가 protectedPrefixes 아래일 때만 검사하므로
 * 앱 API와 404 응답에는 영향을 주지 않습니다. 보호할 라우트를 등록하기 전에 호출해야 합니다.
 */
export function registerDevHostGuard(
  server: FastifyInstance,
  options: { configuredHostnames: readonly string[]; protectedPrefixes: readonly string[] },
): void {
  const prefixes = options.protectedPrefixes
    .map((prefix) => prefix.replace(/\/+$/, ""))
    .filter((prefix) => prefix !== "");

  server.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
      const routeUrl = request.routeOptions.url;
      if (routeUrl === undefined || !prefixes.some((prefix) => isUnderPrefix(routeUrl, prefix))) {
        return undefined;
      }
      if (isAllowedDevHost(request.headers.host, options.configuredHostnames)) {
        return undefined;
      }
      // async 훅에서 응답을 끝낼 때는 reply를 반환해야 핸들러로 넘어가지 않습니다.
      return reply.code(403).send({ message: SD("error.forbidden"), issues: [] });
    },
  );
}
