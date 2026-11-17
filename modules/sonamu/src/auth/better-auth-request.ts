import { type FastifyRequest } from "fastify";
import { z } from "zod";

import { convertFastifyHeadersToStandard } from "../utils/utils";
import { replaceClientIpHeaders } from "./audit-log/client-ip";

/** charset 등 파라미터나 대소문자 변형도 포함해 urlencoded content-type인지 판별한다 (RFC 9110 §8.3.1) */
function isUrlEncodedContentType(headers: Headers): boolean {
  return (
    headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded") ??
    false
  );
}

/** 파서가 본문을 가공하지 않고 넘긴 경우의 원문 urlencoded 문자열 */
const rawUrlEncodedBodySchema = z.string();

/** Fastify urlencoded 파서가 생성하는 키-값 본문 (반복 키는 배열로 파싱됨) */
const urlEncodedValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const urlEncodedRecordSchema = z.record(
  z.string(),
  z.union([urlEncodedValueSchema, z.array(urlEncodedValueSchema)]),
);

/**
 * Fastify가 파싱한 본문을 원래 content-type에 맞게 재직렬화한다.
 * urlencoded 본문을 JSON으로 재직렬화하면 better-auth가 폼 콜백(예: Apple form_post)을
 * 해석하지 못하므로(state_not_found), content-type과 본문 포맷을 일치시킨다.
 */
function serializeBody(request: FastifyRequest, headers: Headers): string {
  if (!isUrlEncodedContentType(headers)) return JSON.stringify(request.body);

  // 이미 urlencoded 문자열이면 그대로 전달해 값 왜곡을 피한다
  const rawBody = rawUrlEncodedBodySchema.safeParse(request.body);
  if (rawBody.success) return rawBody.data;

  const recordBody = urlEncodedRecordSchema.safeParse(request.body);
  // 예상 밖 형태의 본문은 기존 동작(JSON 직렬화)을 유지한다
  if (!recordBody.success) return JSON.stringify(request.body);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(recordBody.data)) {
    // 배열은 "a,b"로 합치지 않고 반복 키(tags=a&tags=b)로 직렬화한다
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) params.append(key, String(item));
  }
  return params.toString();
}

/**
 * better-auth에 넘길 요청 URL을 만든다.
 *
 * baseURL이 주어지면 그 origin에 request.url의 경로·쿼리만 붙인다.
 * Host 헤더와 절대형 request-target(`POST http://evil.example/api/auth/...`)은 클라이언트가
 * 마음대로 정할 수 있으므로 origin을 정하는 데 쓰지 않는다.
 * baseURL이 없으면(동적 baseURL 설정, 테스트 헬퍼) 기존처럼 Host 헤더로 만든다.
 */
function resolveRequestURL(request: FastifyRequest, baseURL: string | undefined): URL {
  if (!baseURL) return new URL(request.url, `http://${request.headers.host}`);

  const target = new URL(request.url, "http://localhost");
  const url = new URL(new URL(baseURL).origin);
  // 문자열로 이어 붙이면 "//host/..." 형태의 경로가 다시 호스트로 해석되므로 속성으로 대입한다
  url.pathname = target.pathname;
  url.search = target.search;
  return url;
}

/**
 * Fastify 요청을 better-auth handler용 표준 Request로 변환한다.
 *
 * @param request Fastify 요청
 * @param ipAddressHeaders better-auth `advanced.ipAddress.ipAddressHeaders` 설정
 * @param baseURL better-auth에 설정된 baseURL. 주면 요청 URL의 origin을 이 값으로 고정한다.
 */
export function createBetterAuthRequest(
  request: FastifyRequest,
  ipAddressHeaders?: readonly string[],
  baseURL?: string,
): Request {
  const url = resolveRequestURL(request, baseURL);
  const headers = convertFastifyHeadersToStandard(request.headers);

  replaceClientIpHeaders(headers, request.ip, ipAddressHeaders);

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.body) init.body = serializeBody(request, headers);
  return new Request(url.toString(), init);
}
