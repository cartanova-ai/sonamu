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

export function createBetterAuthRequest(
  request: FastifyRequest,
  ipAddressHeaders?: readonly string[],
): Request {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const headers = convertFastifyHeadersToStandard(request.headers);

  replaceClientIpHeaders(headers, request.ip, ipAddressHeaders);

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.body) init.body = serializeBody(request, headers);
  return new Request(url.toString(), init);
}
