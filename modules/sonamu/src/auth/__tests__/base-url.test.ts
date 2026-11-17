import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resolveAuthBaseURL } from "../base-url";

// better-auth가 baseURL로 읽는 환경 변수들. 실행 환경 값이 섞이지 않도록 매 테스트 비운다.
const BETTER_AUTH_URL_ENV_KEYS = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "PUBLIC_BETTER_AUTH_URL",
  "NUXT_PUBLIC_BETTER_AUTH_URL",
  "NUXT_PUBLIC_AUTH_URL",
  "BASE_URL",
];

beforeEach(() => {
  for (const key of BETTER_AUTH_URL_ENV_KEYS) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAuthBaseURL — Host 헤더 대신 설정값으로 baseURL 결정 (SON-612)", () => {
  test("auth.baseURL이 있으면 다른 설정보다 우선한다", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://env.example.com");
    const result = resolveAuthBaseURL(
      { auth: { baseURL: "https://auth.example.com" }, baseUrl: "https://server.example.com" },
      { local: false },
    );
    expect(result).toEqual({
      baseURL: "https://auth.example.com",
      requestBaseURL: "https://auth.example.com",
      source: "auth",
    });
  });

  test("동적 baseURL 설정(allowedHosts)은 그대로 넘기고 요청 origin은 고정하지 않는다", () => {
    const dynamic = { allowedHosts: ["app.example.com"], protocol: "https" as const };
    const result = resolveAuthBaseURL({ auth: { baseURL: dynamic } }, { local: false });
    expect(result).toEqual({ baseURL: dynamic, requestBaseURL: undefined, source: "auth" });
  });

  test("auth.baseURL이 없으면 better-auth 환경 변수를 server.baseUrl보다 먼저 쓴다", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://env.example.com");
    const result = resolveAuthBaseURL(
      { auth: {}, baseUrl: "https://server.example.com" },
      { local: false },
    );
    expect(result).toEqual({
      baseURL: "https://env.example.com/api/auth",
      requestBaseURL: "https://env.example.com/api/auth",
      source: "env",
    });
  });

  test("잘못된 환경 변수 값은 init을 깨뜨리지 않고 다음 설정으로 넘어간다", () => {
    vi.stubEnv("BETTER_AUTH_URL", "not a url");
    const result = resolveAuthBaseURL(
      { auth: {}, baseUrl: "https://server.example.com" },
      { local: false },
    );
    expect(result.source).toBe("server");
  });

  test("auth.baseURL과 환경 변수가 없으면 server.baseUrl의 origin에 basePath를 붙인다", () => {
    const result = resolveAuthBaseURL(
      { auth: {}, baseUrl: "https://server.example.com/ignored/path/" },
      { local: false },
    );
    expect(result).toEqual({
      baseURL: "https://server.example.com/api/auth",
      requestBaseURL: "https://server.example.com/api/auth",
      source: "server",
    });
  });

  test("auth.basePath를 바꿨으면 그 경로를 붙인다", () => {
    const result = resolveAuthBaseURL(
      { auth: { basePath: "/auth" }, baseUrl: "https://server.example.com" },
      { local: false },
    );
    expect(result.baseURL).toBe("https://server.example.com/auth");
  });

  test("로컬 환경에서 아무 설정도 없으면 listen 주소를 쓴다", () => {
    const result = resolveAuthBaseURL(
      { auth: {}, listen: { host: "127.0.0.1", port: 4000 } },
      { local: true },
    );
    expect(result).toEqual({
      baseURL: "http://127.0.0.1:4000/api/auth",
      requestBaseURL: "http://127.0.0.1:4000/api/auth",
      source: "listen",
    });
  });

  test("로컬 환경에서 listen도 없으면 boot()와 같은 localhost:3000을 쓴다", () => {
    const result = resolveAuthBaseURL({ auth: {} }, { local: true });
    expect(result.baseURL).toBe("http://localhost:3000/api/auth");
  });

  test("원격 환경에서 아무 설정도 없으면 Host로 대체하지 않고 none을 돌려준다", () => {
    const result = resolveAuthBaseURL(
      { auth: {}, listen: { host: "0.0.0.0", port: 4000 } },
      { local: false },
    );
    expect(result).toEqual({ baseURL: undefined, requestBaseURL: undefined, source: "none" });
  });

  test("원격 환경에서 server.baseUrl이 절대 http(s) URL이 아니면 쓰지 않는다", () => {
    const result = resolveAuthBaseURL(
      { auth: {}, baseUrl: "server.example.com:3000" },
      { local: false },
    );
    expect(result.source).toBe("none");
  });
});
