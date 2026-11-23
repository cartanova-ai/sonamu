import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSDConfig } from "../../dict/sd";
import { DevVitestManager } from "../../testing/dev-vitest-manager";
import { type SonamuFastifyConfig } from "../../types/types";
import { getSonamuUIToken, SONAMU_UI_TOKEN_HEADER } from "../../ui/access-guard";
import { type SonamuConfig, type SonamuServerOptions } from "../config";
import { Sonamu } from "../sonamu";

const apiConfig: SonamuFastifyConfig = {
  contextProvider: (defaultContext) => defaultContext,
  guardHandler: () => undefined,
};
// 허용 Host 요청이 SON-618 접근 토큰 검사까지 통과해야 Host 검사만의 허용 여부를 확인할 수 있습니다.
const UI_TOKEN_HEADERS = { [SONAMU_UI_TOKEN_HEADER]: getSonamuUIToken() };

describe("로컬 서버의 Sonamu UI·dev 라우트 Host 검사", () => {
  const originalSnapshot = Sonamu.captureTestingSnapshot();
  const originalIsInitialized = Sonamu.isInitialized;
  const originalForTesting = Sonamu.forTesting;
  const originalServer = Sonamu.server;
  const originalDevVitestManager = Sonamu.devVitestManager;
  const originalNodeEnv = process.env.NODE_ENV;
  const servers: FastifyInstance[] = [];
  const tempRoots: string[] = [];

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    Sonamu.isInitialized = true;
    Sonamu.forTesting = false;
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sonamu-dev-host-guard-"));
    tempRoots.push(tempRoot);
    Reflect.set(Sonamu, "apiRootPathValue", path.join(tempRoot, "api"));
    Reflect.set(Sonamu, "syncerValue", { apis: [], models: {}, types: {} });
    // DevRunner 라우트가 실제 vitest를 띄우지 않도록 시작만 건너뜁니다.
    vi.spyOn(DevVitestManager.prototype, "start").mockResolvedValue(undefined);
  });

  afterEach(async () => {
    try {
      await Promise.allSettled(servers.splice(0).map(async (server) => await server.close()));
    } finally {
      Sonamu.restoreTestingSnapshot(originalSnapshot);
      Reflect.deleteProperty(Sonamu, "boot");
      Sonamu.isInitialized = originalIsInitialized;
      Sonamu.forTesting = originalForTesting;
      Sonamu.server = originalServer;
      Sonamu.devVitestManager = originalDevVitestManager;
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      await Promise.all(
        tempRoots.splice(0).map(async (tempRoot) => {
          await rm(tempRoot, { recursive: true, force: true });
        }),
      );
      vi.restoreAllMocks();
    }
  });

  async function createDevServer(
    server: SonamuServerOptions = { apiConfig },
  ): Promise<FastifyInstance> {
    const config: SonamuConfig = {
      api: { dir: "src", route: { prefix: "/api" } },
      i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
      sync: { targets: [] },
      validation: { zodCompiler: false },
      database: {},
      logging: false,
      test: { devRunner: { enabled: true } },
      server,
    };
    Reflect.set(Sonamu, "configValue", config);
    setSDConfig(config.i18n);
    // 프로세스 시그널을 등록하고 포트를 여는 private boot만 인스턴스 속성으로 가립니다(afterEach에서 제거).
    Reflect.set(Sonamu, "boot", async () => undefined);

    const created = await Sonamu.createServer({ enableSync: false, doSilent: true });
    servers.push(created);
    await created.ready();
    return created;
  }

  it.each(["/sonamu-ui/api/sonamu/config", "/sonamu-ui/", "/__test__/status"])(
    "Host: attacker.example 로 온 %s 요청은 403으로 거부한다",
    async (url) => {
      const server = await createDevServer();

      const response = await server.inject({ url, headers: { host: "attacker.example:34900" } });

      expect(response.statusCode).toBe(403);
    },
  );

  it.each(["/sonamu-ui/api/sonamu/config", "/__test__/status"])(
    "Host: localhost 로 온 %s 요청은 그대로 처리한다",
    async (url) => {
      const server = await createDevServer();

      const response = await server.inject({
        url,
        headers: { host: "localhost:34900", ...UI_TOKEN_HEADERS },
      });

      expect(response.statusCode).toBe(200);
    },
  );

  it("listen.host로 설정한 호스트 이름은 허용한다", async () => {
    const server = await createDevServer({
      apiConfig,
      listen: { port: 34900, host: "dev.example.test" },
    });

    const response = await server.inject({
      url: "/sonamu-ui/api/sonamu/config",
      headers: { host: "dev.example.test:34900", ...UI_TOKEN_HEADERS },
    });

    expect(response.statusCode).toBe(200);
  });

  it("devAllowedHosts로 지정한 호스트 이름은 Sonamu UI와 DevRunner에서 허용한다", async () => {
    const server = await createDevServer({ apiConfig, devAllowedHosts: ["local.example.com"] });

    for (const url of ["/sonamu-ui/api/sonamu/config", "/__test__/status"]) {
      const response = await server.inject({
        url,
        headers: { host: "local.example.com:34900", ...UI_TOKEN_HEADERS },
      });
      expect(response.statusCode).toBe(200);
    }
  });
});
