import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type DatabaseConfig, type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type SonamuDBConfig, type SonamuDBPreset } from "../../database/db";
import { setSDConfig } from "../../dict/sd";
import { registerMigrationsApi } from "../migrations-api";

// 운영 자격증명이 있는 dev 머신처럼 production preset이 원격 운영 DB를 가리키게 둡니다.
// 테스트는 이 주소에 연결하지 않으며, 연결을 시도하면 거부 대신 타임아웃이 나므로 회귀가 드러납니다.
function presetConfig(preset: SonamuDBPreset): DatabaseConfig {
  return {
    client: "postgresql",
    connection: preset.startsWith("production")
      ? { host: "prod-db.invalid", user: "prod_user", database: "app_production" }
      : { host: "localhost", database: preset },
  };
}

const dbConfig: SonamuDBConfig = {
  test: presetConfig("test"),
  fixture: presetConfig("fixture"),
  development: presetConfig("development"),
  staging: presetConfig("staging"),
  production: presetConfig("production"),
  test_readonly: presetConfig("test_readonly"),
  development_readonly: presetConfig("development_readonly"),
  staging_readonly: presetConfig("staging_readonly"),
  production_readonly: presetConfig("production_readonly"),
};

const config: SonamuConfig = {
  projectName: "sonamu-test",
  api: { dir: "src", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en"] },
  sync: { targets: [] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
};

describe("Sonamu UI 마이그레이션 API의 production 대상 제외", () => {
  const originalEnv = { ...process.env };
  let server: FastifyInstance;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    Sonamu.dbConfig = dbConfig;
    Sonamu.config = config;
    setSDConfig(config.i18n);
    server = Fastify();
    await registerMigrationsApi(server);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("커넥션 목록에 production이 없고 운영 DB 접속 정보도 노출하지 않는다", async () => {
    const response = await server.inject({ method: "GET", url: "/api/migrations/connections" });

    expect(response.statusCode).toBe(200);
    const body: { connections: { connKey: string }[] } = response.json();
    expect(body.connections.map(({ connKey }) => connKey)).toEqual([
      "test",
      "fixture",
      "development",
      "staging",
    ]);
    expect(response.body).not.toContain("prod-db.invalid");
  });

  it.each([
    "/api/migrations/apply",
    "/api/migrations/rollback",
    "/api/migrations/request-approval",
  ])("%s는 production 대상을 400으로 거부한다", async (url) => {
    const response = await server.inject({
      method: "POST",
      url,
      payload: { targets: ["production"] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("레거시 runAction 경로도 production 대상을 거부한다", async () => {
    const responses = await Promise.all(
      (["apply", "rollback"] as const).map((action) =>
        server.inject({
          method: "POST",
          url: "/api/migrations/runAction",
          payload: { action, targets: ["production"] },
        }),
      ),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
    }
  });

  it("production 단일 상태 조회와 비교 코드 조회는 DB 연결 전에 실패한다", async () => {
    const responses = await Promise.all([
      server.inject({ method: "GET", url: "/api/migrations/status?connKey=production" }),
      server.inject({
        method: "GET",
        url: "/api/migrations/prepared-codes?compareConnKey=production",
      }),
      server.inject({
        method: "POST",
        url: "/api/migrations/generatePreparedCodes",
        payload: { compareConnKey: "production" },
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.body).toContain("Migration target is not allowed");
    }
  });
});
