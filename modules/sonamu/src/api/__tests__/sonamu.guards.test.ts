import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type WebSocket } from "ws";
import { z } from "zod";

import { SD, setSDConfig } from "../../dict/sd";
import { UnauthorizedException } from "../../exceptions/so-exceptions";
import { WebSocketRuntime } from "../../stream/ws";
import { type SonamuFastifyConfig } from "../../types/types";
import { type WebSocketContext } from "../context";
import { type ExtendedApi, type GuardKey } from "../decorators";
import { Sonamu } from "../sonamu";

type GuardHandler = SonamuFastifyConfig["guardHandler"];
type ApiHandler = ReturnType<typeof Sonamu.createApiHandler>;
type RuntimeWebSocketConnection = Awaited<ReturnType<WebSocketRuntime["registerConnection"]>>;

function createHttpApi(guards: GuardKey[]): ExtendedApi {
  return {
    modelName: "AdminModel",
    methodName: "secret",
    path: "/admin/secret",
    options: {
      httpMethod: "GET",
      guards,
    },
    typeParameters: [],
    parameters: [],
    returnType: "unknown",
  };
}

function createConfig(guardHandler: GuardHandler): SonamuFastifyConfig {
  return {
    contextProvider: (defaultContext) => defaultContext,
    guardHandler,
  };
}

// 테스트가 만든 fastify 인스턴스와 WebSocket 클라이언트를 afterEach에서 정리한다
const servers: FastifyInstance[] = [];
const clients: WebSocket[] = [];

async function cleanupConnections(): Promise<void> {
  for (const client of clients.splice(0)) {
    client.terminate();
  }
  await Promise.all(servers.splice(0).map((server) => server.close()));
}

/**
 * 실제 fastify 서버에 핸들러를 올리고 inject로 요청해, 실제 FastifyRequest/FastifyReply로 실행된 핸들러의 결과 Promise를 돌려줍니다.
 * Promise를 그대로 반환하면 async 함수가 풀어버리므로 객체로 감싸서 반환합니다.
 */
async function invokeWithRealRequest(
  handler: ApiHandler,
): Promise<{ outcome: ReturnType<ApiHandler> }> {
  const server = Fastify();
  servers.push(server);
  const outcomes: ReturnType<ApiHandler>[] = [];
  server.get("/admin/secret", (request, reply) => {
    const outcome = handler(request, reply);
    outcomes.push(outcome);
    return outcome;
  });

  await server.inject({ method: "GET", url: "/admin/secret" });

  const outcome = outcomes[0];
  if (outcome === undefined) {
    throw new Error("API 핸들러가 호출되지 않았습니다");
  }
  return { outcome };
}

// 마이크로태스크와 setImmediate를 모두 비워 버려진 Promise rejection이 드러나게 한다
async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// false 거부 시 SD 사전 메시지를 쓰므로 Sonamu.init이 하는 i18n 설정을 테스트에서 대신한다
beforeAll(() => {
  setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko", "en"] });
});

describe("HTTP API guardHandler 실행", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection: NodeJS.UnhandledRejectionListener = (reason) => {
    unhandledRejections.push(reason);
  };
  let invokeModelMethod: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    unhandledRejections.length = 0;
    process.on("unhandledRejection", onUnhandledRejection);
    Reflect.set(Sonamu, "httpValidators", new WeakMap());
    Reflect.set(Sonamu, "pendingHttpValidators", new WeakMap());
    Reflect.set(Sonamu, "aotHttpValidatorRegistry", undefined);
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
      // 실제 createContext가 locale을 정할 때 읽는 i18n 설정
      i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en"] },
    });
    Reflect.set(Sonamu, "syncerValue", { types: {} });
    invokeModelMethod = vi
      .spyOn(Sonamu, "invokeModelMethod")
      .mockImplementation(async () => "top-secret");
  });

  afterEach(async () => {
    process.off("unhandledRejection", onUnhandledRejection);
    await cleanupConnections();
    Sonamu.restoreTestingSnapshot(originalState);
    vi.restoreAllMocks();
  });

  it("async guardHandler가 throw하면 요청을 거부하고 모델 메서드를 호출하지 않는다", async () => {
    const guardError = new UnauthorizedException(SD("error.unauthorized"));
    const handler = Sonamu.createApiHandler(
      createHttpApi(["admin"]),
      createConfig(async () => {
        await flushAsync();
        throw guardError;
      }),
    );

    const { outcome } = await invokeWithRealRequest(handler);
    await expect(outcome).rejects.toBe(guardError);
    await flushAsync();

    expect(invokeModelMethod).not.toHaveBeenCalled();
    expect(unhandledRejections).toEqual([]);
  });

  it("guardHandler가 false를 반환하면 401로 요청을 거부한다", async () => {
    const handler = Sonamu.createApiHandler(
      createHttpApi(["admin"]),
      createConfig(() => false),
    );

    const { outcome } = await invokeWithRealRequest(handler);
    await expect(outcome).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(invokeModelMethod).not.toHaveBeenCalled();
  });

  it("async guardHandler가 false로 resolve되면 401로 요청을 거부한다", async () => {
    const handler = Sonamu.createApiHandler(
      createHttpApi(["admin"]),
      createConfig(async () => false),
    );

    const { outcome } = await invokeWithRealRequest(handler);
    await expect(outcome).rejects.toBeInstanceOf(UnauthorizedException);
    expect(invokeModelMethod).not.toHaveBeenCalled();
  });

  it("동기 guardHandler의 throw는 기존처럼 요청을 거부한다", async () => {
    const guardError = new Error("Authentication required");
    const handler = Sonamu.createApiHandler(
      createHttpApi(["user"]),
      createConfig(() => {
        throw guardError;
      }),
    );

    const { outcome } = await invokeWithRealRequest(handler);
    await expect(outcome).rejects.toBe(guardError);
    expect(invokeModelMethod).not.toHaveBeenCalled();
  });

  it.each([
    ["undefined 반환", () => undefined],
    ["true 반환", () => true],
    ["async undefined", async () => undefined],
    ["async true", async () => true],
  ] satisfies [string, GuardHandler][])(
    "guardHandler가 %s이면 요청을 통과시킨다",
    async (_label, guardHandler) => {
      const handler = Sonamu.createApiHandler(createHttpApi(["user"]), createConfig(guardHandler));

      const { outcome } = await invokeWithRealRequest(handler);
      await expect(outcome).resolves.toBe("top-secret");
      expect(invokeModelMethod).toHaveBeenCalledTimes(1);
    },
  );

  it("여러 guard를 순서대로 기다리고 첫 거부에서 멈춘다", async () => {
    const calls: string[] = [];
    const handler = Sonamu.createApiHandler(
      createHttpApi(["user", "admin", "query"]),
      createConfig(async (guard) => {
        calls.push(`start:${guard}`);
        await flushAsync();
        calls.push(`end:${guard}`);
        return guard !== "admin";
      }),
    );

    const { outcome } = await invokeWithRealRequest(handler);
    await expect(outcome).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(calls).toEqual(["start:user", "end:user", "start:admin", "end:admin"]);
    expect(invokeModelMethod).not.toHaveBeenCalled();
  });
});

describe("WebSocket guardHandler 실행", () => {
  const originalState = Sonamu.captureTestingSnapshot();

  afterEach(async () => {
    await cleanupConnections();
    Sonamu.restoreTestingSnapshot(originalState);
    vi.restoreAllMocks();
  });

  async function runWebSocketHandler(guardHandler: GuardHandler) {
    const closeCalls: [number | undefined, string | undefined][] = [];
    const rawWs: RuntimeWebSocketConnection = {
      id: "ws-guard",
      namespace: "chat",
      transport: "ws" as const,
      closed: false,
      publishUntyped() {},
      close(code, reason) {
        closeCalls.push([code, reason]);
      },
      onClose() {},
      onMessage() {},
      publish() {},
      waitForClose() {
        return Promise.resolve();
      },
      join() {
        return Promise.resolve();
      },
      leave() {
        return Promise.resolve();
      },
      setUserId() {
        return Promise.resolve();
      },
      clearUserId() {
        return Promise.resolve();
      },
    };
    const runtime = new WebSocketRuntime({ nodeId: "websocket-guard-await-test" });
    vi.spyOn(runtime, "registerConnection").mockResolvedValue(rawWs);
    const activateConnection = vi
      .spyOn(runtime, "activateConnection")
      .mockImplementation(async () => {});
    vi.spyOn(Sonamu, "createWebSocketContext").mockImplementation(async (_config, request, ws) => {
      const context: WebSocketContext = {
        transport: "ws",
        request,
        headers: request.headers,
        ws,
        naiteStore: new Map(),
        locale: "ko",
        user: null,
        session: null,
      };
      return context;
    });
    const invokeModelMethod = vi
      .spyOn(Sonamu, "invokeModelMethod")
      .mockImplementation(async () => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const api: ExtendedApi = {
      modelName: "ChatFrame",
      methodName: "subscribe",
      path: "/chat/subscribe",
      options: { guards: ["admin"] },
      websocketOptions: {
        outEvents: z.object({}),
        inEvents: z.object({}),
      },
      typeParameters: [],
      parameters: [],
      returnType: "void",
    };
    Sonamu.websocketRuntime = runtime;
    Reflect.set(Sonamu, "syncerValue", { types: {} });

    // 실제 @fastify/websocket 라우트에 연결해 실제 socket과 FastifyRequest로 핸들러를 실행한다
    const wsHandler = Sonamu.createWebSocketHandlerForTesting(api, createConfig(guardHandler));
    const server = Fastify();
    servers.push(server);
    await server.register(fastifyWebsocket);
    const handled = new Promise<void>((resolve, reject) => {
      server.get(api.path, { websocket: true }, (socket, request) => {
        wsHandler(socket, request).then(resolve, reject);
      });
    });
    await server.ready();
    clients.push(await server.injectWS(api.path));
    await handled;

    return { closeCalls, activateConnection, invokeModelMethod };
  }

  it("async guardHandler가 throw하면 1008로 닫고 핸들러를 실행하지 않는다", async () => {
    const result = await runWebSocketHandler(async () => {
      await flushAsync();
      throw new UnauthorizedException(SD("error.unauthorized"));
    });

    expect(result.closeCalls).toEqual([[1008, "Unauthorized websocket connection"]]);
    expect(result.activateConnection).not.toHaveBeenCalled();
    expect(result.invokeModelMethod).not.toHaveBeenCalled();
  });

  it("guardHandler가 false를 반환하면 1008로 닫고 핸들러를 실행하지 않는다", async () => {
    const result = await runWebSocketHandler(async () => false);

    expect(result.closeCalls).toEqual([[1008, "Unauthorized websocket connection"]]);
    expect(result.activateConnection).not.toHaveBeenCalled();
    expect(result.invokeModelMethod).not.toHaveBeenCalled();
  });
});
