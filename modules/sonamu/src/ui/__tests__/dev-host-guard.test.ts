import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSDConfig } from "../../dict/sd";
import { type DevTestRouteManager } from "../../testing/dev-test-routes";
import { registerDevTestRoutes } from "../../testing/dev-test-routes";
import {
  getConfiguredDevHostnames,
  isAllowedDevHost,
  registerDevHostGuard,
} from "../dev-host-guard";

describe("isAllowedDevHost", () => {
  it.each([
    "localhost",
    "localhost:34900",
    "LOCALHOST:34900",
    "app.localhost:34900",
    "127.0.0.1:34900",
    "127.0.0.1",
    "[::1]:34900",
    "[::1]",
    "192.168.0.10:34900",
  ])("DNS로 바꿔치기할 수 없는 호스트 %s 는 허용한다", (host) => {
    expect(isAllowedDevHost(host)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "attacker.example",
    "attacker.example:34900",
    "localhost.attacker.example:34900",
    "attacker.example@localhost:34900",
    "localhost/attacker.example",
    "localhost:34900:1",
    "[attacker.example]:34900",
    "localhost evil",
  ])("공격자가 소유할 수 있거나 형식이 잘못된 Host %s 는 거부한다", (host) => {
    expect(isAllowedDevHost(host)).toBe(false);
  });

  it("설정한 호스트 이름은 포트와 대소문자에 관계없이 허용한다", () => {
    expect(isAllowedDevHost("Dev.Example.Test:34900", ["dev.example.test"])).toBe(true);
    expect(isAllowedDevHost("other.example.test:34900", ["dev.example.test"])).toBe(false);
  });
});

describe("getConfiguredDevHostnames", () => {
  it("listen.host와 baseUrl의 호스트 이름을 모은다", () => {
    expect(
      getConfiguredDevHostnames({
        listen: { port: 34900, host: "dev.example.test" },
        baseUrl: "https://api.example.test:8443/base",
      }),
    ).toEqual(["dev.example.test", "api.example.test"]);
  });

  it("IPv6 baseUrl은 대괄호를 벗기고, URL이 아닌 baseUrl은 무시한다", () => {
    expect(getConfiguredDevHostnames({ baseUrl: "http://[::1]:34900" })).toEqual(["::1"]);
    expect(getConfiguredDevHostnames({ baseUrl: "not a url" })).toEqual([]);
  });
});

// 라우트가 의존하는 매니저 기능을 모두 제공하는 테스트 대역입니다.
const mockManager = {
  start: vi.fn(),
  run: vi.fn(),
  getStatus: vi.fn(),
  emitEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  shutdown: vi.fn(),
} satisfies DevTestRouteManager;

describe("registerDevHostGuard", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 403 응답 메시지를 만드는 SD 사전이 동작하도록 i18n 설정을 채웁니다.
    setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });
    mockManager.start.mockResolvedValue(undefined);
    mockManager.getStatus.mockReturnValue({ ready: true, running: false, lastRunAt: null });
    app = Fastify();
    registerDevHostGuard(app, {
      configuredHostnames: ["dev.example.test"],
      protectedPrefixes: ["/sonamu-ui", "/custom-test/"],
    });
    // Sonamu UI 플러그인처럼 prefix를 가진 하위 플러그인과 와일드카드 SPA 라우트를 흉내 냅니다.
    await app.register(
      async (scope) => {
        scope.get("/api/sonamu/config", async () => ({ secret: "secret-config-value" }));
        scope.get("*", async () => "spa");
      },
      { prefix: "/sonamu-ui" },
    );
    await registerDevTestRoutes(
      app,
      { enabled: true, routePrefix: "/custom-test" },
      { manager: mockManager, apiRootPath: "/tmp/fixture-api", sseAvailable: false },
    );
    app.get("/api/user/me", async () => ({ ok: true }));
    app.get("/sonamu-uix", async () => "not-ui");
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    "/sonamu-ui/api/sonamu/config",
    "/sonamu-ui/",
    "/sonamu-ui/entities",
    "/custom-test/status",
  ])("Host: attacker.example 로 온 UI·dev 라우트 %s 요청은 403으로 거부한다", async (url) => {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { host: "attacker.example:34900" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ issues: [] });
    expect(response.body).not.toContain("secret-config-value");
  });

  it("Host: attacker.example 로 온 dev 상태 변경 요청도 핸들러 전에 403으로 거부한다", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/custom-test/run",
      headers: { host: "attacker.example:34900" },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(mockManager.run).not.toHaveBeenCalled();
  });

  it.each(["localhost:34900", "127.0.0.1:34900", "[::1]:34900", "dev.example.test:34900"])(
    "허용된 Host %s 로 온 UI·dev 라우트 요청은 그대로 처리한다",
    async (host) => {
      const config = await app.inject({ url: "/sonamu-ui/api/sonamu/config", headers: { host } });
      const status = await app.inject({ url: "/custom-test/status", headers: { host } });

      expect(config.statusCode).toBe(200);
      expect(status.statusCode).toBe(200);
    },
  );

  it("보호 대상이 아닌 앱 라우트는 Host와 관계없이 처리한다", async () => {
    const api = await app.inject({ url: "/api/user/me", headers: { host: "attacker.example" } });
    const lookalike = await app.inject({
      url: "/sonamu-uix",
      headers: { host: "attacker.example" },
    });

    expect(api.statusCode).toBe(200);
    expect(lookalike.statusCode).toBe(200);
  });
});
