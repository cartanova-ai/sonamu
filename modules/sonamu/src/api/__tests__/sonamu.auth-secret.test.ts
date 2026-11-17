import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SonamuFastifyConfig } from "../../types/types";
import { Sonamu } from "../sonamu";

const MIOMOCK_FALLBACK = "miomock-secret-key-change-this-in-production";

// secret 검사는 apiConfig를 쓰기 전에 실패해야 하므로, 핸들러가 불리면 곧바로 테스트를 실패시킨다.
const apiConfig: SonamuFastifyConfig = {
  contextProvider() {
    throw new Error("secret 검사 전에 contextProvider가 호출되면 안 된다");
  },
  guardHandler() {
    throw new Error("secret 검사 전에 guardHandler가 호출되면 안 된다");
  },
};

function setAuthConfig(auth: { secret?: string }): void {
  Reflect.set(Sonamu, "configValue", {
    sync: { targets: [] },
    api: { route: { prefix: "/api" } },
    server: { listen: { port: 0, host: "127.0.0.1" }, auth },
    validation: { zodCompiler: false },
  });
}

describe("Sonamu 서버 기동 시 better-auth secret 검사 (SON-600)", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  const originalInitialized = Sonamu.isInitialized;
  const servers: FastifyInstance[] = [];

  beforeEach(() => {
    Sonamu.isInitialized = true;
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_SECRETS", "");
    vi.stubEnv("AUTH_SECRET", "");
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => await server.close()));
    Sonamu.restoreTestingSnapshot(originalState);
    Sonamu.isInitialized = originalInitialized;
    vi.unstubAllEnvs();
  });

  it.each(["development", "staging", "production"])(
    "%s에서 secret 없이 createServer를 부르면 listen 전에 실패한다",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      setAuthConfig({});

      await expect(Sonamu.createServer({ doSilent: true })).rejects.toThrow(/secret is missing/);
    },
  );

  it("공개된 예시 fallback secret으로 createServer를 부르면 실패한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setAuthConfig({ secret: MIOMOCK_FALLBACK });

    await expect(Sonamu.createServer({ doSilent: true })).rejects.toThrow(/publicly known/);
  });

  it("기존 fastify에 붙이는 withFastify도 secret이 없으면 실패한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setAuthConfig({});
    const server = fastify();
    servers.push(server);

    await expect(Sonamu.withFastify(server, apiConfig, { doSilent: true })).rejects.toThrow(
      /secret is missing/,
    );
    // 검사가 서버를 Sonamu에 연결하거나 라우트를 등록하기 전에 실패해야 한다.
    expect(Sonamu.server).not.toBe(server);
    expect(server.hasRoute({ method: "GET", url: "/api/auth/*" })).toBe(false);
  });
});
