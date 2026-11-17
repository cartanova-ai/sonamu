import fastify from "fastify";
import { Sonamu, UnauthorizedException } from "sonamu";
import { type SonamuFastifyConfig } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

import { SD } from "../i18n/sd.generated";

bootstrap(vi);

type GuardHandler = SonamuFastifyConfig["guardHandler"];

// admin 가드가 걸린 UserModel.findMany 라우트를 실제 fastify 서버에 올린다
function createGuardedServer(guardHandler: GuardHandler) {
  const server = fastify();
  const config: SonamuFastifyConfig = {
    contextProvider: (defaultContext) => ({
      ...defaultContext,
      ip: "127.0.0.1",
    }),
    guardHandler,
  };

  const findManyApi = Sonamu.syncer.apis.find(
    (api) => api.modelName === "UserModel" && api.methodName === "findMany",
  );
  if (!findManyApi) {
    throw new Error("UserModel.findMany API를 찾을 수 없습니다");
  }
  const guardedApi = {
    ...findManyApi,
    options: { ...findManyApi.options, guards: ["admin" as const] },
  };

  server.route({
    method: guardedApi.options.httpMethod ?? "GET",
    url: Sonamu.config.api.route.prefix + guardedApi.path,
    handler: Sonamu.createApiHandler(guardedApi, config),
  });
  return { server, url: Sonamu.config.api.route.prefix + guardedApi.path };
}

describe("guardHandler 반환값과 Promise 처리", () => {
  beforeAll(async () => {
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);
  });

  test("async guardHandler가 throw하면 가드 예외의 상태 코드로 거부하고 모델 메서드를 실행하지 않는다", async () => {
    const invokeSpy = vi.spyOn(Sonamu, "invokeModelMethod");
    const { server, url } = createGuardedServer(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      throw new UnauthorizedException(SD("error.unauthorized"));
    });

    const response = await server.inject({
      method: "GET",
      url,
      query: { subset: "A", num: "10", page: "1" },
    });

    expect(response.statusCode).toBe(401);
    expect(invokeSpy).not.toHaveBeenCalled();
    await server.close();
  });

  test("guardHandler가 false를 반환하면 401로 거부한다", async () => {
    const invokeSpy = vi.spyOn(Sonamu, "invokeModelMethod");
    const { server, url } = createGuardedServer(() => false);

    const response = await server.inject({
      method: "GET",
      url,
      query: { subset: "A", num: "10", page: "1" },
    });

    expect(response.statusCode).toBe(401);
    expect(invokeSpy).not.toHaveBeenCalled();
    await server.close();
  });

  test("async guardHandler가 통과하면 요청을 처리한다", async () => {
    const { server, url } = createGuardedServer(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return true;
    });

    const response = await server.inject({
      method: "GET",
      url,
      query: { subset: "A", num: "10", page: "1" },
    });

    expect(response.statusCode).toBe(200);
    await server.close();
  });
});
