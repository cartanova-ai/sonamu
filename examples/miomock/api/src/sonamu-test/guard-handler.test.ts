import fastify from "fastify";
import {
  type Context,
  type GuardKey,
  Sonamu,
  type SonamuFastifyConfig,
  UnauthorizedException,
} from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

import { SD } from "../i18n/sd.generated";

bootstrap(vi);

beforeAll(async () => {
  // syncer가 로드한 실제 API 목록이 필요하므로 테스트 전용 초기화 대신 전체 초기화를 수행함
  Sonamu.isInitialized = false;
  await Sonamu.init(true, false, undefined, false);
});

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

type GuardTestUser = NonNullable<Context["user"]>;

function createGuardTestUser(role: "admin" | "normal"): GuardTestUser {
  const now = new Date();
  return {
    id: `guard-handler-${role}`,
    email: `guard-handler-${role}@example.com`,
    emailVerified: true,
    name: `guard-handler-${role}`,
    createdAt: now,
    updatedAt: now,
    role,
    created_at: now,
  };
}

/**
 * miomock의 실제 apiConfig(guardHandler)와 lifecycle.onError로 UserModel API를 띄우고 요청을 보냅니다.
 * guards를 넘기면 해당 API의 가드를 바꿔 끼우고, user를 넘기면 세션 대신 그 사용자를 컨텍스트에 넣습니다.
 */
async function requestUserApi({
  methodName,
  guards,
  user,
  payload,
}: {
  methodName: "del" | "findMany";
  guards?: GuardKey[];
  user: GuardTestUser | null;
  payload?: { ids: string[] };
}) {
  const { apiConfig, lifecycle } = Sonamu.config.server;
  const found = Sonamu.syncer.apis.find(
    (api) => api.modelName === "UserModel" && api.methodName === methodName,
  );
  if (!found) {
    throw new Error(`UserModel.${methodName} API를 찾을 수 없습니다`);
  }
  const api = guards ? { ...found, options: { ...found.options, guards } } : found;

  const server = fastify();
  if (lifecycle?.onError) {
    server.setErrorHandler(lifecycle.onError);
  }
  server.route({
    method: api.options.httpMethod ?? "GET",
    url: Sonamu.config.api.route.prefix + api.path,
    handler: Sonamu.createApiHandler(api, {
      ...apiConfig,
      contextProvider: async (defaultContext, request, reply) => ({
        ...(await apiConfig.contextProvider(defaultContext, request, reply)),
        user,
      }),
    }),
  });

  try {
    return await server.inject({
      method: api.options.httpMethod ?? "GET",
      // findMany는 subset 쿼리가 있어야 zod 검증을 통과함
      url:
        Sonamu.config.api.route.prefix + api.path + (methodName === "findMany" ? "?subset=A" : ""),
      payload,
    });
  } finally {
    await server.close();
  }
}

describe("guardHandler 반환값과 Promise 처리", () => {
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

describe("guardHandler", () => {
  test("admin 가드가 붙은 생성 del API는 비인증 요청을 403으로 거부한다", async () => {
    const response = await requestUserApi({
      methodName: "del",
      user: null,
      payload: { ids: ["guard-handler-victim"] },
    });

    expect(response.statusCode).toBe(403);
  });

  test("admin 가드는 admin이 아닌 사용자를 403으로 거부한다", async () => {
    const response = await requestUserApi({
      methodName: "findMany",
      guards: ["admin"],
      user: createGuardTestUser("normal"),
    });

    expect(response.statusCode).toBe(403);
  });

  test("admin 가드는 admin 사용자를 통과시킨다", async () => {
    const response = await requestUserApi({
      methodName: "findMany",
      guards: ["admin"],
      user: createGuardTestUser("admin"),
    });

    expect(response.statusCode).toBe(200);
  });

  test("user 가드는 비인증 요청을 401로 거부하고 로그인 사용자는 통과시킨다", async () => {
    const anonymous = await requestUserApi({
      methodName: "findMany",
      guards: ["user"],
      user: null,
    });
    const loggedIn = await requestUserApi({
      methodName: "findMany",
      guards: ["user"],
      user: createGuardTestUser("normal"),
    });

    expect(anonymous.statusCode).toBe(401);
    expect(loggedIn.statusCode).toBe(200);
  });

  test("구현하지 않은 가드 키는 로그인한 admin이어도 403으로 거부한다", async () => {
    const response = await requestUserApi({
      methodName: "findMany",
      guards: ["query"],
      user: createGuardTestUser("admin"),
    });

    expect(response.statusCode).toBe(403);
  });
});
