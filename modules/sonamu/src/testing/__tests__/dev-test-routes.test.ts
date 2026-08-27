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
});
