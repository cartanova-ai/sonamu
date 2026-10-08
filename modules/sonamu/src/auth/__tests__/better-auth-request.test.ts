import { type FastifyRequest } from "fastify";
import { describe, expect, test } from "vitest";

import { createBetterAuthRequest } from "../better-auth-request";

// createBetterAuthRequest가 실제로 사용하는 FastifyRequest 필드만 추린 최소 모킹 타입
type MockableRequestFields = Pick<FastifyRequest, "url" | "method" | "headers" | "body" | "ip">;

function createMockFastifyRequest(overrides: {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[]>;
  body?: unknown;
  ip?: string;
}): FastifyRequest {
  const mock: MockableRequestFields = {
    url: overrides.url ?? "/api/auth/callback/apple",
    method: overrides.method ?? "POST",
    headers: { host: "localhost:3000", ...overrides.headers },
    body: overrides.body ?? null,
    ip: overrides.ip ?? "127.0.0.1",
  };
  // SAFETY: 대상 함수는 위 필드만 접근하므로 최소 모킹을 FastifyRequest로 간주해도 안전하다.
  return mock as FastifyRequest;
}

describe("createBetterAuthRequest — urlencoded 본문 직렬화 (SON-549)", () => {
  test("urlencoded POST 콜백 본문을 JSON이 아닌 urlencoded로 직렬화한다", async () => {
    // Apple Sign-In form_post 콜백 형태의 본문
    const body = {
      state: "abc123",
      code: "authcode-456",
      user: '{"name":{"firstName":"길동"}}',
    };
    const request = createMockFastifyRequest({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const result = createBetterAuthRequest(request);
    const text = await result.text();

    // JSON 직렬화 결과가 아니어야 한다
    expect(text).not.toBe(JSON.stringify(body));

    // urlencoded로 재파싱 시 원본 값이 모두 복원되어야 한다
    const params = new URLSearchParams(text);
    expect(params.get("state")).toBe("abc123");
    expect(params.get("code")).toBe("authcode-456");
    expect(params.get("user")).toBe('{"name":{"firstName":"길동"}}');
  });

  test("charset 파라미터가 붙은 content-type도 urlencoded로 처리한다", async () => {
    const body = { state: "abc123", code: "authcode-456" };
    const request = createMockFastifyRequest({
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
    });

    const result = createBetterAuthRequest(request);
    const params = new URLSearchParams(await result.text());

    expect(params.get("state")).toBe("abc123");
    expect(params.get("code")).toBe("authcode-456");
  });

  test("특수문자(=, &, +, 공백, 한글)가 포함된 값이 왕복 보존된다", async () => {
    const trickyState = "a=b&c+d e한글";
    const body = { state: trickyState, code: "x" };
    const request = createMockFastifyRequest({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const result = createBetterAuthRequest(request);
    const params = new URLSearchParams(await result.text());

    expect(params.get("state")).toBe(trickyState);
    expect(params.get("code")).toBe("x");
  });

  test("본문이 이미 urlencoded 문자열이면 값이 그대로 보존된다", async () => {
    const request = createMockFastifyRequest({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "state=abc&code=def",
    });

    const result = createBetterAuthRequest(request);
    const params = new URLSearchParams(await result.text());

    expect(params.get("state")).toBe("abc");
    expect(params.get("code")).toBe("def");
  });

  test("배열 값은 반복 키로 직렬화되어 값 손실이 없다", async () => {
    const request = createMockFastifyRequest({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: { tags: ["a", "b"] },
    });

    const result = createBetterAuthRequest(request);
    const params = new URLSearchParams(await result.text());

    // "a,b"로 합쳐지지 않고 반복 키(tags=a&tags=b)로 유지되어야 한다
    expect(params.getAll("tags")).toEqual(["a", "b"]);
  });

  test("대소문자가 섞인 content-type 값도 urlencoded로 감지한다", async () => {
    // HTTP 미디어 타입은 대소문자를 구분하지 않으며(RFC 9110 §8.3.1),
    // Fastify 파서 조회도 소문자화된 타입으로 매칭하므로 브리지도 동일하게 감지해야 한다
    const body = { state: "mixed-case", code: "authcode-789" };
    const request = createMockFastifyRequest({
      headers: {
        "content-type": "Application/X-WWW-Form-Urlencoded; charset=UTF-8",
      },
      body,
    });

    const result = createBetterAuthRequest(request);
    const text = await result.text();

    expect(text).not.toBe(JSON.stringify(body));

    const params = new URLSearchParams(text);
    expect(params.get("state")).toBe("mixed-case");
    expect(params.get("code")).toBe("authcode-789");
  });

  test("urlencoded content-type에 중첩 객체 본문이면 JSON 직렬화 폴백을 유지한다", async () => {
    // qs 계열 파서가 생성하는 중첩 객체는 평탄한 레코드가 아니므로
    // 본문을 버리거나 예외를 던지지 않고 기존 JSON 직렬화로 보존해야 한다
    const body = { user: { name: "길동" } };
    const request = createMockFastifyRequest({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const result = createBetterAuthRequest(request);

    expect(await result.text()).toBe(JSON.stringify(body));
  });
});

describe("createBetterAuthRequest — 기존 동작 회귀 보장", () => {
  test("JSON POST 본문은 JSON.stringify 결과 그대로 전달한다", async () => {
    const body = { email: "user@example.com", password: "secret" };
    const request = createMockFastifyRequest({
      headers: { "content-type": "application/json" },
      body,
    });

    const result = createBetterAuthRequest(request);

    expect(await result.text()).toBe(JSON.stringify(body));
  });

  test("content-type 없는 POST 본문은 JSON.stringify를 유지한다", async () => {
    const body = { foo: "bar" };
    const request = createMockFastifyRequest({ body });

    const result = createBetterAuthRequest(request);

    expect(await result.text()).toBe(JSON.stringify(body));
  });

  test("GET 요청은 본문 없이 메서드와 URL을 보존한다", () => {
    const request = createMockFastifyRequest({
      url: "/api/auth/session?foo=bar",
      method: "GET",
      body: null,
    });

    const result = createBetterAuthRequest(request);

    expect(result.body).toBeNull();
    expect(result.method).toBe("GET");
    expect(result.url).toBe("http://localhost:3000/api/auth/session?foo=bar");
  });

  test("urlencoded 경로에서도 클라이언트 IP 치환과 기타 헤더가 유지된다", async () => {
    const request = createMockFastifyRequest({
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "9.9.9.9",
        "user-agent": "test-agent",
        cookie: "session=xyz",
      },
      body: { state: "abc" },
      ip: "1.2.3.4",
    });

    const result = createBetterAuthRequest(request, ["x-custom-ip"]);

    // replaceClientIpHeaders가 신뢰 가능한 request.ip로 치환해야 한다
    expect(result.headers.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(result.headers.get("x-real-ip")).toBe("1.2.3.4");
    expect(result.headers.get("x-custom-ip")).toBe("1.2.3.4");

    // 그 외 헤더는 변경 없이 전달되어야 한다
    expect(result.headers.get("user-agent")).toBe("test-agent");
    expect(result.headers.get("cookie")).toBe("session=xyz");
    expect(result.headers.get("content-type")).toBe("application/x-www-form-urlencoded");

    // urlencoded 본문 직렬화도 함께 보장한다
    const params = new URLSearchParams(await result.text());
    expect(params.get("state")).toBe("abc");
  });
});
