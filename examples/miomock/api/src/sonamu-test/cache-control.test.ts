import fastify from "fastify";
import { applyCacheHeaders, buildCacheControl, CachePresets, Sonamu } from "sonamu";
import { type CacheControlHandler, type Context, type SonamuFastifyConfig } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi);

async function createTestServer(cacheControlHandler?: CacheControlHandler) {
  const server = fastify();

  const config: SonamuFastifyConfig = {
    contextProvider: (defaultContext) =>
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      ({
        ...defaultContext,
        ip: "127.0.0.1",
        session: {},
      }) as Context,
    guardHandler: () => true,
    cacheControlHandler,
  };

  const userFindManyApi = Sonamu.syncer.apis.find(
    (api) => api.modelName === "UserModel" && api.methodName === "findMany",
  );
  if (!userFindManyApi) {
    throw new Error("UserModel.findMany API를 찾을 수 없습니다");
  }

  server.route({
    method: userFindManyApi.options.httpMethod ?? "GET",
    url: Sonamu.config.api.route.prefix + userFindManyApi.path,
    handler: Sonamu.createApiHandler(userFindManyApi, config),
  });
  return { server, api: userFindManyApi };
}

describe("cache-control", () => {
  describe("buildCacheControl", () => {
    describe("기본 동작", () => {
      test("noStore - 캐시 금지", () => {
        const result = buildCacheControl({ noStore: true });
        expect(result).toBe("no-store");
      });

      test("noStore는 다른 모든 설정을 무시합니다", () => {
        const result = buildCacheControl({
          noStore: true,
          visibility: "public",
          maxAge: 3600,
          immutable: true,
        });
        expect(result).toBe("no-store");
      });

      test("noCache - 매번 재검증", () => {
        const result = buildCacheControl({ noCache: true });
        expect(result).toBe("no-cache");
      });

      test("noCache + private", () => {
        const result = buildCacheControl({
          noCache: true,
          visibility: "private",
        });
        expect(result).toBe("private, no-cache");
      });

      test("visibility 기본값은 public", () => {
        const result = buildCacheControl({ maxAge: 60 });
        expect(result).toBe("public, max-age=60");
      });

      test("visibility: private", () => {
        const result = buildCacheControl({
          visibility: "private",
          maxAge: 60,
        });
        expect(result).toBe("private, max-age=60");
      });
    });

    describe("TTL 설정", () => {
      test("maxAge만 설정", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 3600,
        });
        expect(result).toBe("public, max-age=3600");
      });

      test("sMaxAge (CDN용)", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 60,
          sMaxAge: 300,
        });
        expect(result).toBe("public, max-age=60, s-maxage=300");
      });

      test("maxAge=0", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 0,
        });
        expect(result).toBe("public, max-age=0");
      });
    });

    describe("재검증 옵션", () => {
      test("mustRevalidate", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 60,
          mustRevalidate: true,
        });
        expect(result).toBe("public, max-age=60, must-revalidate");
      });

      test("proxyRevalidate", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 60,
          proxyRevalidate: true,
        });
        expect(result).toBe("public, max-age=60, proxy-revalidate");
      });

      test("immutable", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 31536000,
          immutable: true,
        });
        expect(result).toBe("public, max-age=31536000, immutable");
      });
    });

    describe("Stale 옵션", () => {
      test("staleWhileRevalidate", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 60,
          staleWhileRevalidate: 300,
        });
        expect(result).toBe("public, max-age=60, stale-while-revalidate=300");
      });

      test("staleIfError", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 60,
          staleIfError: 86400,
        });
        expect(result).toBe("public, max-age=60, stale-if-error=86400");
      });

      test("staleWhileRevalidate + staleIfError 조합", () => {
        const result = buildCacheControl({
          visibility: "public",
          maxAge: 60,
          staleWhileRevalidate: 300,
          staleIfError: 86400,
        });
        expect(result).toBe("public, max-age=60, stale-while-revalidate=300, stale-if-error=86400");
      });
    });
  });

  describe("CachePresets", () => {
    test("noStore 프리셋", () => {
      expect(buildCacheControl(CachePresets.noStore)).toBe("no-store");
    });

    test("noCache 프리셋", () => {
      expect(buildCacheControl(CachePresets.noCache)).toBe("no-cache");
    });

    test("shortLived 프리셋 (1분)", () => {
      expect(buildCacheControl(CachePresets.shortLived)).toBe("public, max-age=60");
    });

    test("ssr 프리셋 (10초 + stale-while-revalidate)", () => {
      expect(buildCacheControl(CachePresets.ssr)).toBe(
        "public, max-age=10, stale-while-revalidate=30",
      );
    });

    test("mediumLived 프리셋 (5분)", () => {
      expect(buildCacheControl(CachePresets.mediumLived)).toBe("public, max-age=300");
    });

    test("longLived 프리셋 (1시간)", () => {
      expect(buildCacheControl(CachePresets.longLived)).toBe("public, max-age=3600");
    });

    test("immutable 프리셋 (1년)", () => {
      expect(buildCacheControl(CachePresets.immutable)).toBe("public, max-age=31536000, immutable");
    });

    test("private 프리셋", () => {
      expect(buildCacheControl(CachePresets.private)).toBe("private, no-cache");
    });
  });

  describe("엣지 케이스", () => {
    test("빈 객체 - visibility만 출력", () => {
      const result = buildCacheControl({});
      expect(result).toBe("public");
    });

    test("visibility만 설정", () => {
      const result = buildCacheControl({ visibility: "private" });
      expect(result).toBe("private");
    });

    test("false 값은 무시됩니다", () => {
      const result = buildCacheControl({
        visibility: "public",
        maxAge: 60,
        mustRevalidate: false,
        immutable: false,
      });
      expect(result).toBe("public, max-age=60");
    });
  });
});

describe("API 응답 Cache-Control 헤더", () => {
  beforeAll(async () => {
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);
  });

  test("cacheControlHandler 미설정 시 Cache-Control 헤더 없음", async () => {
    const { server, api } = await createTestServer();

    const response = await server.inject({
      method: "GET",
      url: Sonamu.config.api.route.prefix + api.path,
      query: { subset: "A", num: "10", page: "1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBeUndefined();

    await server.close();
  });

  test("cacheControlHandler가 설정을 반환하면 Cache-Control 헤더 설정됨", async () => {
    const { server, api } = await createTestServer(() => CachePresets.shortLived);

    const response = await server.inject({
      method: "GET",
      url: Sonamu.config.api.route.prefix + api.path,
      query: { subset: "A", num: "10", page: "1" },
    });

    expect(response.headers["cache-control"]).toBe("public, max-age=60");

    await server.close();
  });
});

describe("applyCacheHeaders", () => {
  test("Cache-Control 헤더만 설정 (vary 없음)", async () => {
    const server = fastify();
    server.get("/test", (_req, reply) => {
      applyCacheHeaders(reply, { visibility: "public", maxAge: 60 });
      return { ok: true };
    });

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(response.headers.vary).toBeUndefined();

    await server.close();
  });

  test("Cache-Control과 Vary 헤더 모두 설정", async () => {
    const server = fastify();
    server.get("/test", (_req, reply) => {
      applyCacheHeaders(reply, {
        visibility: "public",
        maxAge: 300,
        vary: ["Accept-Language"],
      });
      return { ok: true };
    });

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.headers.vary).toBe("Accept-Language");

    await server.close();
  });

  test("여러 Vary 헤더 값", async () => {
    const server = fastify();
    server.get("/test", (_req, reply) => {
      applyCacheHeaders(reply, {
        visibility: "public",
        maxAge: 300,
        vary: ["Accept-Language", "Accept-Encoding"],
      });
      return { ok: true };
    });

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.headers.vary).toBe("Accept-Language, Accept-Encoding");

    await server.close();
  });

  test("빈 vary 배열은 Vary 헤더를 설정하지 않음", async () => {
    const server = fastify();
    server.get("/test", (_req, reply) => {
      applyCacheHeaders(reply, {
        visibility: "public",
        maxAge: 60,
        vary: [],
      });
      return { ok: true };
    });

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(response.headers.vary).toBeUndefined();

    await server.close();
  });
});
