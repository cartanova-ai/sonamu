import { type FastifyReply, type FastifyRequest } from "fastify";

import { SD } from "../dict/sd";

/** Sonamu UI가 모든 요청에 붙이는 표식 헤더입니다. 커스텀 헤더라서 교차 출처 요청은 반드시 preflight를 거칩니다. */
export const SONAMU_UI_REQUEST_HEADER = "x-sonamu-ui";

const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

function isSameOriginUIRequest(request: FastifyRequest): boolean {
  // form·no-cors fetch 같은 단순 요청은 application/json을 보낼 수 없습니다.
  const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return false;
  }
  if (request.headers[SONAMU_UI_REQUEST_HEADER] !== "1") {
    return false;
  }

  // 앱이 CORS를 넓게 열어 preflight가 통과하더라도 브라우저가 붙인 출처 표시로 다시 거릅니다.
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite !== undefined) {
    return ALLOWED_FETCH_SITES.has(fetchSite);
  }

  // Sec-Fetch-Site를 보내지 않는 브라우저는 Origin과 Host를 비교합니다.
  const origin = request.headers.origin;
  if (origin === undefined) {
    return true;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

/**
 * 개발자 PC에서 프로세스를 실행하는 Sonamu UI 라우트용 onRequest 훅입니다.
 *
 * 동일 출처 Sonamu UI가 보낸 JSON 요청만 통과시키고, 다른 출처 웹페이지가 보낸
 * form·no-cors fetch·교차 출처 요청은 본문을 파싱하기 전에 403으로 거부합니다.
 */
export async function requireSameOriginUIRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (!isSameOriginUIRequest(request)) {
    // async 훅에서 응답을 끝낼 때는 reply를 반환해야 핸들러로 넘어가지 않습니다.
    return reply.code(403).send({ message: SD("error.forbidden"), issues: [] });
  }
  return undefined;
}
