import { type ApiResponse, errors } from "@opensearch-project/opensearch";
import { describe, expect, it } from "vitest";

import {
  describeOpenSearchError,
  normalizeOpenSearchError,
} from "../../src/client/error-normalization";
import {
  SearchConfigurationError,
  SearchQueryInvalid,
  SearchTargetUnavailable,
  SearchTimeout,
  SearchUnavailable,
} from "../../src/errors";

interface EngineReply {
  statusCode: number;
  body: { error?: { type: string; reason: string } | string; status?: number };
}

// Real SDK ResponseError; statusCode and body are prototype getters.
function responseError(reply: EngineReply): errors.ResponseError {
  const meta = { ...reply, headers: {}, warnings: null };
  // SAFETY: the constructor reads only body, statusCode and headers.
  return new errors.ResponseError(meta as ApiResponse);
}

const SECRET = "secret-query-text password=hunter2";

describe("SDK 오류 분류", () => {
  it.each([
    [400, "parsing_exception", SearchQueryInvalid, "engine-rejected", false],
    [404, "index_not_found_exception", SearchTargetUnavailable, "index-not-found", false],
    [404, "search_phase_execution_exception", SearchQueryInvalid, "engine-rejected", false],
    [401, "security_exception", SearchUnavailable, "authentication", true],
    [403, "security_exception", SearchUnavailable, "authorization", true],
    [408, "timeout", SearchTimeout, "engine-timeout", true],
    [429, "es_rejected_execution_exception", SearchUnavailable, "engine-unavailable", true],
    [503, "unavailable_shards_exception", SearchUnavailable, "engine-unavailable", true],
    [504, "gateway_timeout", SearchTimeout, "engine-timeout", true],
  ] as const)(
    "실제 ResponseError %i %s를 상태와 error.type으로 분류한다",
    (status, type, ErrorClass, reason, retryable) => {
      const error = normalizeOpenSearchError(
        responseError({ statusCode: status, body: { error: { type, reason: SECRET }, status } }),
      );
      expect(error).toBeInstanceOf(ErrorClass);
      expect(error.details).toEqual({ reason, status, type });
      expect(error.retryable).toBe(retryable);
    },
  );

  it.each([
    [
      "TimeoutError",
      new errors.TimeoutError(SECRET, emptyResponseMeta()),
      SearchTimeout,
      "request-timeout",
    ],
    ["ConnectionError", new errors.ConnectionError(SECRET), SearchUnavailable, "connection"],
    [
      "NoLivingConnectionsError",
      new errors.NoLivingConnectionsError(SECRET, emptyResponseMeta()),
      SearchUnavailable,
      "connection",
    ],
    [
      "RequestAbortedError",
      new errors.RequestAbortedError(SECRET),
      SearchUnavailable,
      "request-aborted",
    ],
    [
      "DeserializationError",
      new errors.DeserializationError(SECRET, SECRET),
      SearchUnavailable,
      "invalid-response",
    ],
    [
      "SerializationError",
      new errors.SerializationError(SECRET, {}),
      SearchQueryInvalid,
      "serialization",
    ],
    [
      "ConfigurationError",
      new errors.ConfigurationError(SECRET),
      SearchConfigurationError,
      "client-configuration",
    ],
  ] as const)("실제 %s를 이름으로 분류한다", (_name, thrown, ErrorClass, reason) => {
    const error = normalizeOpenSearchError(thrown);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.details?.reason).toBe(reason);
  });

  it("SDK 메시지, 본문, 원래 오류를 패키지 오류에 싣지 않는다", () => {
    const thrown = responseError({
      statusCode: 400,
      body: { error: { type: "parsing_exception", reason: SECRET }, status: 400 },
    });
    const error = normalizeOpenSearchError(thrown);
    expect(error.message).not.toContain("secret");
    expect(error.localize("ko")).not.toContain("secret");
    expect(JSON.stringify(error.details)).not.toContain("secret");
    expect(JSON.stringify(error.messageParams)).not.toContain("secret");
    expect(error.cause).toBeUndefined();
  });

  it("error.type이 없거나 문자열 error인 옛 응답은 type unknown으로 분류한다", () => {
    expect(describeOpenSearchError(responseError({ statusCode: 500, body: {} }))).toEqual({
      kind: "response",
      status: 500,
      type: "unknown",
    });
    expect(
      describeOpenSearchError(
        responseError({ statusCode: 400, body: { error: SECRET, status: 400 } }),
      ),
    ).toEqual({ kind: "response", status: 400, type: "unknown" });
  });

  it("긴 error.type은 잘라서 싣는다", () => {
    const type = "x".repeat(500);
    const failure = describeOpenSearchError(
      responseError({ statusCode: 400, body: { error: { type, reason: "r" }, status: 400 } }),
    );
    expect(failure).toEqual({ kind: "response", status: 400, type: "x".repeat(120) });
  });

  it("SDK 오류가 아닌 값은 재시도할 수 없는 SearchUnavailable이다", () => {
    for (const thrown of [new Error(SECRET), SECRET, null, undefined, 42, { name: 7 }]) {
      const error = normalizeOpenSearchError(thrown);
      expect(error).toBeInstanceOf(SearchUnavailable);
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual({ reason: "unknown-client-error" });
    }
  });

  it("범위를 벗어난 상태의 ResponseError는 unknown이다", () => {
    expect(describeOpenSearchError(responseError({ statusCode: 999, body: {} }))).toEqual({
      kind: "unknown",
    });
  });

  it("이미 SearchError인 값은 그대로 돌려준다", () => {
    const original = new SearchTimeout();
    expect(normalizeOpenSearchError(original)).toBe(original);
  });
});

function emptyResponseMeta(): ApiResponse {
  const meta = { body: null, statusCode: null, headers: null, warnings: null };
  // SAFETY: the error constructors store meta without reading it.
  return meta as ApiResponse;
}
