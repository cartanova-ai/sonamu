import formbody from "@fastify/formbody";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type DevTestRouteManager } from "../dev-test-routes";
import { registerDevTestRoutes } from "../dev-test-routes";
import { type ManagerStatus, type RunResult } from "../dev-vitest-manager";

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

const defaultConfig = {
  enabled: true as const,
  routePrefix: "/__test__",
};
const dependencies = {
  manager: mockManager,
  apiRootPath: "/tmp/fixture-api",
  sseAvailable: false,
};

const okRunResult: RunResult = {
  ok: true,
  summary: { total: 3, passed: 2, failed: 0, skipped: 1, durationMs: 42 },
  results: [],
};

const okStatus: ManagerStatus = {
  ready: true,
  running: false,
  lastRunAt: null,
};

describe("registerDevTestRoutes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    mockManager.start.mockResolvedValue(undefined);
    mockManager.run.mockResolvedValue(okRunResult);
    mockManager.getStatus.mockReturnValue(okStatus);
    mockManager.shutdown.mockResolvedValue(undefined);
    await registerDevTestRoutes(app, defaultConfig, dependencies);
  });

  afterEach(async () => {
    await app.close();
  });

  it("라우트 등록 시 manager.start()가 호출된다", () => {
    expect(mockManager.start).toHaveBeenCalledTimes(1);
  });

  describe("POST /__test__/run", () => {
    it("정상 실행 시 RunResult를 반환한다", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/__test__/run",
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.summary.total).toBe(3);
      expect(body.summary.skipped).toBe(1);
    });

    it("files와 pattern을 manager.run()에 전달한다", async () => {
      await app.inject({
        method: "POST",
        url: "/__test__/run",
        payload: { files: ["foo.test.ts"], pattern: "my test" },
      });

      expect(mockManager.run).toHaveBeenCalledWith(
        {
          files: ["foo.test.ts"],
          pattern: "my test",
        },
        expect.any(String),
      );
    });

    it("manager.run()이 오류를 던지면 500을 반환한다", async () => {
      mockManager.run.mockRejectedValueOnce(new Error("DevVitestManager is not started"));

      const res = await app.inject({
        method: "POST",
        url: "/__test__/run",
        payload: {},
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toContain("not started");
    });
  });

  describe("GET /__test__/status", () => {
    it("ManagerStatus 구조를 반환한다", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/__test__/status",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        ready: true,
        running: false,
        lastRunAt: null,
      });
    });
  });

  describe("교차 출처 요청 차단", () => {
    // 스캐폴드 기본값처럼 formbody를 켠 서버에서 단순 요청 형식을 검증합니다.
    let formApp: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      formApp = Fastify();
      await formApp.register(formbody);
      await registerDevTestRoutes(formApp, defaultConfig, dependencies);
      vi.clearAllMocks();
      mockManager.run.mockResolvedValue(okRunResult);
      mockManager.getStatus.mockReturnValue(okStatus);
    });

    afterEach(async () => {
      await formApp.close();
    });

    it("다른 출처 웹페이지의 form·no-cors·본문 없는 POST는 테스트를 실행하지 않는다", async () => {
      const requests: { headers: Record<string, string>; payload?: string }[] = [
        {
          headers: {
            origin: "http://evil.example",
            "sec-fetch-site": "cross-site",
            "content-type": "application/x-www-form-urlencoded",
          },
          payload: "pattern=x",
        },
        {
          headers: {
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-site",
            "content-type": "text/plain;charset=UTF-8",
          },
          payload: "{}",
        },
        // Sec-Fetch-Site를 보내지 않는 브라우저는 Origin과 Host를 비교합니다.
        { headers: { origin: "http://evil.example" } },
        { headers: { origin: "null", "content-type": "application/json" }, payload: "{}" },
      ];
      for (const { headers, payload } of requests) {
        const res = await formApp.inject({
          method: "POST",
          url: "/__test__/run",
          headers: { host: "localhost:10280", ...headers },
          payload,
        });
        expect(res.statusCode, JSON.stringify(headers)).toBe(403);
      }
      expect(mockManager.run).not.toHaveBeenCalled();
      expect(mockManager.emitEvent).not.toHaveBeenCalled();
    });

    it("JSON이 아닌 POST는 출처 표시가 없어도 415로 거부한다", async () => {
      const requests: { headers: Record<string, string>; payload?: string }[] = [
        { headers: {} },
        { headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "pattern=x" },
        { headers: { "content-type": "text/plain" }, payload: "{}" },
      ];
      for (const { headers, payload } of requests) {
        const res = await formApp.inject({
          method: "POST",
          url: "/__test__/run",
          headers,
          payload,
        });
        expect(res.statusCode, JSON.stringify(headers)).toBe(415);
      }
      expect(mockManager.run).not.toHaveBeenCalled();
    });

    it("다른 출처의 GET /__test__/status는 403으로 거부한다", async () => {
      const res = await formApp.inject({
        method: "GET",
        url: "/__test__/status",
        headers: { origin: "http://evil.example", "sec-fetch-site": "cross-site" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("sonamu test CLI의 JSON 요청과 동일 출처 Sonamu UI 요청은 통과한다", async () => {
      const cliRes = await formApp.inject({
        method: "POST",
        url: "/__test__/run",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ files: ["foo.test.ts"] }),
      });
      expect(cliRes.statusCode).toBe(200);
      expect(mockManager.run).toHaveBeenCalledTimes(1);

      const uiRes = await formApp.inject({
        method: "GET",
        url: "/__test__/status",
        headers: { origin: "http://localhost:65000", "sec-fetch-site": "same-origin" },
      });
      expect(uiRes.statusCode).toBe(200);
    });
  });

  describe("server.close() onClose hook", () => {
    it("서버 종료 시 manager.shutdown()이 호출된다", async () => {
      await app.close();
      expect(mockManager.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe("커스텀 routePrefix", () => {
    it("routePrefix가 지정되면 해당 경로에 라우트가 등록된다", async () => {
      const customApp = Fastify();
      mockManager.start.mockResolvedValue(undefined);
      mockManager.getStatus.mockReturnValue(okStatus);
      mockManager.shutdown.mockResolvedValue(undefined);

      await registerDevTestRoutes(
        customApp,
        {
          enabled: true,
          routePrefix: "/api/test",
        },
        dependencies,
      );

      const res = await customApp.inject({ method: "GET", url: "/api/test/status" });
      expect(res.statusCode).toBe(200);

      await customApp.close();
    });
  });

  describe("GET /__test__/events (SSE)", () => {
    it("snapshot 이벤트가 sseAvailable을 포함한 상태를 발행한다", async () => {
      const sseApp = Fastify();
      const { FastifySSEPlugin } = await import("fastify-sse-v2");
      await sseApp.register(FastifySSEPlugin);
      mockManager.start.mockResolvedValue(undefined);
      mockManager.getStatus.mockReturnValue(okStatus);
      mockManager.shutdown.mockResolvedValue(undefined);

      await registerDevTestRoutes(sseApp, defaultConfig, {
        ...dependencies,
        sseAvailable: true,
      });
      const baseUrl = await sseApp.listen({ port: 0, host: "127.0.0.1" });

      const abortController = new AbortController();
      try {
        const res = await fetch(baseUrl + "/__test__/events", {
          headers: { accept: "text/event-stream" },
          signal: abortController.signal,
        });
        expect(res.body).not.toBeNull();
        if (res.body === null) throw new Error("SSE 응답 본문이 비어 있습니다");

        // 첫 snapshot 프레임이 도착할 때까지 스트림을 읽습니다.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!buffer.includes("event: snapshot")) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }

        const dataLine = buffer.split("\n").find((line) => line.startsWith("data: "));
        expect(dataLine).toBeDefined();
        if (dataLine === undefined) throw new Error("snapshot data 프레임이 없습니다");

        const payload: { status: ManagerStatus & { sseAvailable?: boolean } } = JSON.parse(
          dataLine.slice("data: ".length),
        );
        // SSE 스냅샷 상태는 HTTP status 응답과 같은 형태(sseAvailable 포함)여야 합니다.
        expect(payload.status).toEqual({
          ready: true,
          running: false,
          lastRunAt: null,
          sseAvailable: true,
        });
      } finally {
        abortController.abort();
        await sseApp.close();
      }
    });
  });
});
