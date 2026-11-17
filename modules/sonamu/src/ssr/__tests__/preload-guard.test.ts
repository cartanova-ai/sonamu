import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

import { type Context } from "../../api/context";
import { type ExtendedApi, type GuardKey } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import { SD, setSDConfig } from "../../dict/sd";
import { UnauthorizedException } from "../../exceptions/so-exceptions";
import { type SonamuFastifyConfig } from "../../types/types";
import { SSRPreloadValidationException } from "../errors";
import { renderSSR } from "../renderer";
import { type SSRQuery, type SSRRoute } from "../types";

const SECRET = "ADMIN-ONLY-SECRET";

// guard 통과 여부를 가르는 로그인 사용자: better-auth User의 필수 필드를 모두 채운다
const ADMIN_USER: NonNullable<Context["user"]> = {
  id: "admin",
  name: "관리자",
  email: "admin@example.com",
  emailVerified: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

// 테스트 라우트 path(:id)의 params 모양을 런타임에 확인한다
const routeParamsSchema = z.object({ id: z.string() });

function createApi(guards?: GuardKey[]): ExtendedApi {
  const options: ExtendedApi["options"] = { httpMethod: "GET" };
  if (guards !== undefined) {
    options.guards = guards;
  }
  return {
    modelName: "SecretModel",
    methodName: "findById",
    path: "/secret/findById",
    options,
    typeParameters: [],
    parameters: [
      { name: "subset", type: "string", optional: false },
      { name: "id", type: "number", optional: false },
      { name: "context", type: { t: "ref", id: "Context" }, optional: false },
    ],
    returnType: "unknown",
  };
}

function createQuery(params: unknown[]): SSRQuery {
  // 생성된 queries 코드의 createSSRQuery와 같이 브랜드 필드까지 채운다
  return {
    modelName: "SecretModel",
    methodName: "findById",
    params,
    serviceKey: ["Secret", "getSecret"],
    __brand: "SSRQuery",
  };
}

/**
 * 실제 Fastify 요청 핸들러 안에서 fn을 실행해 진짜 FastifyRequest와 FastifyReply를 넘긴다.
 * fn의 결과를 그대로 돌려주고, fn이 거부하면 같은 이유로 거부한다.
 */
async function withRealRequest<T>(
  fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>,
): Promise<T> {
  const server = fastify();
  let outcome: PromiseSettledResult<T> | undefined;
  server.get("/admin/secret/:id", async (request, reply) => {
    [outcome] = await Promise.allSettled([fn(request, reply)]);
    return "";
  });
  try {
    await server.inject({ method: "GET", url: "/admin/secret/1" });
  } finally {
    await server.close();
  }
  if (outcome === undefined) {
    throw new Error("요청 핸들러가 실행되지 않았습니다");
  }
  if (outcome.status === "rejected") {
    throw outcome.reason;
  }
  return outcome.value;
}

// renderSSR dev 경로가 불러오는 entry 모듈: preload 데이터를 그대로 dehydratedState에 싣는다
const ENTRY_SERVER_SOURCE = `export async function render(_url: string, preloadedData: unknown[]) {
  return {
    html: "<html><body></body></html>",
    dehydratedState: { queries: preloadedData },
  };
}
`;

describe("SSR preload의 guards와 입력 검증", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  const tempRoots: string[] = [];
  const viteServers: ViteDevServer[] = [];
  let api: ExtendedApi;
  let findById: ReturnType<typeof vi.fn>;
  let user: Context["user"];

  // 실제 createContext가 만든 기본 컨텍스트에 테스트의 로그인 사용자를 얹는다.
  // admin 가드는 컨텍스트에 로그인 사용자가 없으면 거부한다.
  function createConfig(): SonamuFastifyConfig {
    return {
      contextProvider(defaultContext) {
        return { ...defaultContext, user };
      },
      guardHandler(guard) {
        if (guard === "admin" && Sonamu.getContext().user === null) {
          throw new UnauthorizedException(SD("error.unauthorized"));
        }
      },
    };
  }

  async function createDevVite(): Promise<ViteDevServer> {
    const root = await mkdtemp(path.join(os.tmpdir(), "sonamu-ssr-preload-"));
    tempRoots.push(root);
    await writeFile(path.join(root, "index.html"), "<html><body></body></html>");
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "entry-server.generated.tsx"), ENTRY_SERVER_SOURCE);
    // 포트·HMR 웹소켓·파일 감시 없이 미들웨어 모드로만 띄운다
    const vite = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    });
    viteServers.push(vite);
    return vite;
  }

  beforeEach(() => {
    api = createApi(["admin"]);
    findById = vi.fn(async (subset: string, id: number) => ({ subset, id, secret: SECRET }));
    user = null;
    Reflect.set(Sonamu, "httpValidators", new WeakMap());
    Reflect.set(Sonamu, "pendingHttpValidators", new WeakMap());
    const i18n = { defaultLocale: "ko", supportedLocales: ["ko", "en"] };
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
      i18n,
    });
    // guard 거부 메시지가 SD 사전을 쓰므로 Sonamu.init이 하는 i18n 설정을 테스트에서 대신한다
    setSDConfig(i18n);
    Reflect.set(Sonamu, "syncerValue", {
      types: {},
      apis: [api],
      models: { SecretModel: { findById } },
    });
  });

  afterEach(async () => {
    Sonamu.restoreTestingSnapshot(originalState);
    vi.restoreAllMocks();
    await Promise.all(viteServers.splice(0).map((vite) => vite.close()));
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it("guard가 거부하면 invokeApiForSSR이 모델 메서드를 호출하지 않는다", async () => {
    await expect(
      withRealRequest((request, reply) =>
        Sonamu.invokeApiForSSR(api, ["A", 1], createConfig(), request, reply),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).not.toHaveBeenCalled();
  });

  it("검증기를 통과하지 못한 params는 400 예외가 되고 모델 메서드를 호출하지 않는다", async () => {
    user = ADMIN_USER;

    const result = withRealRequest((request, reply) =>
      Sonamu.invokeApiForSSR(api, ["A", Number("abc")], createConfig(), request, reply),
    );
    await expect(result).rejects.toBeInstanceOf(SSRPreloadValidationException);
    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      payload: { zodError: expect.any(ZodError) },
    });
    expect(findById).not.toHaveBeenCalled();
  });

  it("guard와 검증을 통과하면 검증된 값과 Context로 모델 메서드를 호출한다", async () => {
    user = ADMIN_USER;

    await expect(
      withRealRequest((request, reply) =>
        Sonamu.invokeApiForSSR(api, ["A", 1], createConfig(), request, reply),
      ),
    ).resolves.toEqual({ subset: "A", id: 1, secret: SECRET });
    expect(findById).toHaveBeenCalledWith("A", 1, expect.objectContaining({ user }));
  });

  it("비인증 SSR 렌더링은 가드된 preload 데이터를 HTML에 싣지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route: SSRRoute = {
      path: "/admin/secret/:id",
      preload: (params) => [createQuery(["A", Number(params.id)])],
    };
    const vite = await createDevVite();

    const html = await withRealRequest((request, reply) =>
      renderSSR("/admin/secret/1", route, { id: "1" }, request, reply, createConfig(), vite),
    );

    expect(html).not.toContain(SECRET);
    expect(html).toContain('window.__SONAMU_SSR__ = {"queries":[]}');
    expect(findById).not.toHaveBeenCalled();
  });

  it("관리자 SSR 렌더링은 preload 데이터를 HTML에 싣는다", async () => {
    user = ADMIN_USER;
    const route: SSRRoute = {
      path: "/admin/secret/:id",
      preload: (params) => [createQuery(["A", Number(params.id)])],
    };
    const vite = await createDevVite();

    const html = await withRealRequest((request, reply) =>
      renderSSR("/admin/secret/1", route, { id: "1" }, request, reply, createConfig(), vite),
    );

    expect(html).toContain(SECRET);
  });

  it("잘못된 path param으로 만든 preload 인자는 SSR 응답을 400으로 만든다", async () => {
    // 가드 없는 API여도 검증은 적용된다
    api = createApi();
    Reflect.set(Sonamu, "syncerValue", {
      types: {},
      apis: [api],
      models: { SecretModel: { findById } },
    });
    const route: SSRRoute = {
      path: "/admin/secret/:id",
      preload: (params) => [createQuery(["A", Number(params.id)])],
    };
    const vite = await createDevVite();
    const config = createConfig();

    const server = fastify();
    server.get("/admin/secret/:id", async (request, reply) => {
      const params = routeParamsSchema.parse(request.params);
      const html = await renderSSR(request.url, route, params, request, reply, config, vite);
      reply.type("text/html");
      return html;
    });

    try {
      const invalid = await server.inject({ method: "GET", url: "/admin/secret/abc" });
      expect(invalid.statusCode).toBe(400);
      expect(findById).not.toHaveBeenCalled();

      const valid = await server.inject({ method: "GET", url: "/admin/secret/1" });
      expect(valid.statusCode).toBe(200);
      expect(valid.body).toContain(SECRET);
    } finally {
      await server.close();
    }
  });
});
