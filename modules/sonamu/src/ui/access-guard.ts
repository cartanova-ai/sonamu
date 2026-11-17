import { randomBytes, timingSafeEqual } from "crypto";

import { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";

import { SD } from "../dict/sd";

/** Sonamu UI가 모든 API 요청에 붙이는 접근 토큰 헤더입니다. 커스텀 헤더라서 교차 출처 요청은 preflight를 거칩니다. */
export const SONAMU_UI_TOKEN_HEADER = "x-sonamu-ui-token";

/** ui-web index.html에서 서버가 접근 토큰으로 치환하는 자리표시자입니다. */
export const SONAMU_UI_TOKEN_PLACEHOLDER = "{{sonamuUIToken}}";

const SAME_ORIGIN_FETCH_SITES = new Set(["same-origin", "none"]);

let sonamuUIToken: string | undefined;

/**
 * 프로세스마다 한 번 만드는 Sonamu UI 접근 토큰을 반환합니다.
 *
 * 토큰은 동일 출처에서 받은 index.html에만 실리므로, 응답을 읽을 수 없는 다른 출처 웹페이지는
 * 토큰을 알 수 없고 form·no-cors fetch 같은 단순 요청으로는 커스텀 헤더를 보낼 수도 없습니다.
 */
export function getSonamuUIToken(): string {
  sonamuUIToken ??= randomBytes(32).toString("base64url");
  return sonamuUIToken;
}

function hasValidSonamuUIToken(request: FastifyRequest): boolean {
  // 헤더가 없거나 여러 번 온 요청은 토큰이 없는 요청으로 봅니다.
  const received = z.string().safeParse(request.headers[SONAMU_UI_TOKEN_HEADER]);
  if (!received.success) {
    return false;
  }
  const expected = Buffer.from(getSonamuUIToken());
  const actual = Buffer.from(received.data);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * 브라우저가 붙인 출처 표시로 다른 출처(같은 사이트의 다른 포트 포함)에서 온 요청인지 판정합니다.
 *
 * Sec-Fetch-Site가 있으면 same-origin·none만 같은 출처로 보고, 없으면 Origin과 Host를 비교합니다.
 * 둘 다 없는 요청(CLI 등 브라우저 밖 로컬 클라이언트)은 같은 출처로 봅니다.
 */
export function isCrossOriginRequest(request: FastifyRequest): boolean {
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite !== undefined) {
    return !SAME_ORIGIN_FETCH_SITES.has(fetchSite);
  }

  const origin = request.headers.origin;
  if (origin === undefined) {
    return false;
  }
  try {
    return new URL(origin).host !== request.headers.host;
  } catch {
    // Origin: null(샌드박스 iframe, data: URL 등)은 출처를 확인할 수 없으므로 교차 출처로 봅니다.
    return true;
  }
}

/**
 * index.html(접근 토큰 포함)을 내려줘도 되는 요청인지 판정합니다.
 *
 * 다른 출처 문서의 링크·주소창 이동(navigate)은 응답을 읽을 수 없으므로 허용하고,
 * 앱이 CORS를 넓게 열어 둔 경우를 대비해 다른 출처의 fetch·XHR로 HTML을 읽는 요청만 거부합니다.
 */
export function canServeSonamuUIToken(request: FastifyRequest): boolean {
  return !isCrossOriginRequest(request) || request.headers["sec-fetch-mode"] === "navigate";
}

/**
 * Sonamu UI API(/sonamu-ui/api/**)용 onRequest 훅입니다.
 *
 * 접근 토큰이 없거나 틀리면 401, 토큰이 있어도 다른 출처에서 온 요청이면 403으로
 * 본문을 파싱하기 전에 거부합니다.
 */
export async function requireSonamuUIToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (!hasValidSonamuUIToken(request)) {
    // async 훅에서 응답을 끝낼 때는 reply를 반환해야 핸들러로 넘어가지 않습니다.
    return reply.code(401).send({ message: SD("error.unauthorized"), issues: [] });
  }
  if (isCrossOriginRequest(request)) {
    return reply.code(403).send({ message: SD("error.forbidden"), issues: [] });
  }
  return undefined;
}

/**
 * DevRunner 라우트(/__test__/**)용 onRequest 훅입니다.
 *
 * `sonamu test` CLI처럼 브라우저 밖에서 오는 JSON 요청과 동일 출처 Sonamu UI 요청만 받습니다.
 * 다른 출처 요청은 403, 상태를 바꾸는 요청에 application/json이 아니면 415로 본문 파싱 전에 거부합니다.
 * form·no-cors fetch·본문 없는 POST 같은 단순 요청은 application/json을 보낼 수 없습니다.
 */
export async function rejectCrossOriginDevRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (isCrossOriginRequest(request)) {
    return reply.code(403).send({ message: SD("error.forbidden"), issues: [] });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return reply.code(415).send({ message: SD("error.badRequest"), issues: [] });
    }
  }
  return undefined;
}
