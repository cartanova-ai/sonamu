import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FixtureManager } from "../../testing/fixture-manager";
import { getSonamuUIToken, SONAMU_UI_TOKEN_HEADER } from "../access-guard";
import { aiClient } from "../ai-client";
import { sonamuUIApiPlugin } from "../api";
import { createConfig, createDBConfig, setupSonamu } from "./ui-test-helpers";

// 실제 sonamuUIApiPlugin을 거치므로 SON-618 접근 토큰을 보내야 DB 프리셋 검증까지 도달합니다.
const UI_TOKEN_HEADERS = { [SONAMU_UI_TOKEN_HEADER]: getSonamuUIToken() };

describe("Sonamu UI fixture API의 DB 프리셋 제한", () => {
  let app: ReturnType<typeof Fastify>;
  let cleanup: () => Promise<void>;
  const getFixturesSpy = vi.spyOn(FixtureManager, "getFixtures");
  const insertFixturesSpy = vi.spyOn(FixtureManager, "insertFixtures");

  beforeEach(async () => {
    ({ cleanup } = await setupSonamu(createConfig(), createDBConfig()));
    vi.spyOn(aiClient, "init").mockResolvedValue(undefined);
    getFixturesSpy.mockResolvedValue([]);
    insertFixturesSpy.mockResolvedValue([]);
    app = Fastify();
    await app.register(sonamuUIApiPlugin);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await cleanup();
    vi.clearAllMocks();
  });

  const search = { entityId: "User", field: "id", value: "1", searchType: "equals" };

  it.each([
    { sourceDB: "production", targetDB: "test" },
    { sourceDB: "production_readonly", targetDB: "fixture" },
    { sourceDB: "development", targetDB: "staging" },
    { sourceDB: ["development"], targetDB: "test" },
  ])("조회 요청 %j 는 400으로 거부하고 DB에 접근하지 않는다", async (dbs) => {
    const res = await app.inject({
      method: "POST",
      url: "/sonamu-ui/api/fixture",
      headers: UI_TOKEN_HEADERS,
      payload: { ...dbs, search },
    });

    expect(res.statusCode).toBe(400);
    expect(getFixturesSpy).not.toHaveBeenCalled();
  });

  it("development에서 test로 조회하는 요청은 허용한다", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sonamu-ui/api/fixture",
      headers: UI_TOKEN_HEADERS,
      payload: { sourceDB: "development", targetDB: "test", search },
    });

    expect(res.statusCode).toBe(200);
    expect(getFixturesSpy).toHaveBeenCalledWith("development", "test", search, undefined);
  });

  it.each(["production", "staging", "development_old"])(
    "저장 대상 db=%s 는 400으로 거부하고 쓰지 않는다",
    async (db) => {
      const res = await app.inject({
        method: "POST",
        url: "/sonamu-ui/api/fixture/import",
        headers: UI_TOKEN_HEADERS,
        payload: { db, fixtures: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(insertFixturesSpy).not.toHaveBeenCalled();
    },
  );

  it("fixture DB 저장 요청은 허용한다", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sonamu-ui/api/fixture/import",
      headers: UI_TOKEN_HEADERS,
      payload: { db: "fixture", fixtures: [] },
    });

    expect(res.statusCode).toBe(200);
    expect(insertFixturesSpy).toHaveBeenCalledWith("fixture", []);
  });
});
