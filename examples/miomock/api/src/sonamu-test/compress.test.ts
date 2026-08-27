import fastify from "fastify";
import { CompressPresets, Sonamu, toFastifyCompressOption } from "sonamu";
import {
  type CompressConfig,
  type CompressOptions,
  type Context,
  type SonamuFastifyConfig,
} from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi);

type CreateTestServerOptions = {
  /** 전역 compress 플러그인 설정. undefined면 플러그인 미등록 */
  globalCompress?: CompressOptions & { global?: boolean };
  /** 라우트별 compress 설정 (@api({ compress }) 데코레이터 시뮬레이션) */
  routeCompress?: CompressConfig;
};

async function createTestServer(options: CreateTestServerOptions = {}) {
  const { globalCompress, routeCompress } = options;
  const server = fastify();

  if (globalCompress) {
    const compressPlugin = (await import("@fastify/compress")).default;
    await server.register(compressPlugin, {
      global: globalCompress.global ?? true,
      ...globalCompress,
    });
  }

  const config: SonamuFastifyConfig = {
    contextProvider: (defaultContext) =>
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      ({
        ...defaultContext,
        ip: "127.0.0.1",
        session: {},
      }) as Context,
    guardHandler: () => true,
  };

  const userFindManyApi = Sonamu.syncer.apis.find(
    (api) => api.modelName === "UserModel" && api.methodName === "findMany",
  );
  if (!userFindManyApi) {
    throw new Error("UserModel.findMany API를 찾을 수 없습니다");
  }

  const globalCompressOptions: CompressOptions | undefined = globalCompress
    ? {
        threshold: globalCompress.threshold,
        encodings: globalCompress.encodings,
        customTypes: globalCompress.customTypes,
      }
    : undefined;

  server.route({
    method: userFindManyApi.options.httpMethod ?? "GET",
    url: Sonamu.config.api.route.prefix + userFindManyApi.path,
    handler: Sonamu.createApiHandler(userFindManyApi, config),
    compress: toFastifyCompressOption(routeCompress, globalCompressOptions),
  });

  return { server, api: userFindManyApi };
}

describe("compress", () => {
  describe("CompressPresets", () => {
    test("disabled - 압축 비활성화", () => {
      expect(CompressPresets.disabled).toBe(false);
    });

    test("default - 기본 설정", () => {
      expect(CompressPresets.default).toEqual({
        threshold: 1024,
        encodings: ["br", "gzip", "deflate"],
      });
    });

    test("aggressive - 적극적 압축", () => {
      expect(CompressPresets.aggressive).toEqual({
        threshold: 256,
        encodings: ["br", "gzip", "deflate"],
      });
    });

    test("conservative - 보수적 압축", () => {
      expect(CompressPresets.conservative).toEqual({
        threshold: 4096,
        encodings: ["gzip", "deflate"],
      });
    });

    test("gzipOnly - gzip만 사용", () => {
      expect(CompressPresets.gzipOnly).toEqual({
        threshold: 1024,
        encodings: ["gzip"],
      });
    });
  });

  describe("@fastify/compress 플러그인 통합", () => {
    beforeAll(async () => {
      Sonamu.isInitialized = false;
      await Sonamu.init(true, false, undefined, false);
    });

    describe("전역 compress 플러그인", () => {
      test("플러그인 미등록 시 압축 없음", async () => {
        const { server, api } = await createTestServer({});

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBeUndefined();

        await server.close();
      });

      test("플러그인 등록 시 gzip 인코딩 지원", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { threshold: 0, encodings: ["gzip"] },
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBe("gzip");

        await server.close();
      });

      test("threshold보다 작은 응답은 압축하지 않음", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { threshold: 1024 * 1024, encodings: ["gzip"] },
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBeUndefined();

        await server.close();
      });
    });

    describe("@api({ compress }) 데코레이터", () => {
      test("compress: false - 전역 설정 무시하고 압축 비활성화", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { threshold: 0, encodings: ["gzip"] },
          routeCompress: false,
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBeUndefined();

        await server.close();
      });

      test("compress 옵션으로 threshold 오버라이드", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { threshold: 0, encodings: ["gzip"] },
          routeCompress: { threshold: 1024 * 1024 },
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBeUndefined();

        await server.close();
      });

      test("compress: undefined - 전역 설정 따름", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { threshold: 0, encodings: ["gzip"] },
          routeCompress: undefined,
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBe("gzip");

        await server.close();
      });

      test("global: false + compress: true - 해당 API만 압축 활성화", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { global: false, threshold: 0, encodings: ["gzip"] },
          routeCompress: true,
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBe("gzip");

        await server.close();
      });

      test("global: false + compress: undefined - 압축 안 됨", async () => {
        const { server, api } = await createTestServer({
          globalCompress: { global: false, threshold: 0, encodings: ["gzip"] },
          routeCompress: undefined,
        });

        const response = await server.inject({
          method: "GET",
          url: Sonamu.config.api.route.prefix + api.path,
          query: { subset: "A", num: "10", page: "1" },
          headers: { "accept-encoding": "gzip" },
        });

        expect(response.headers["content-encoding"]).toBeUndefined();

        await server.close();
      });
    });
  });
});
