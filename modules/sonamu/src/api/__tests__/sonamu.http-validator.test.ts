import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type FastifyReply, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

import { type SonamuFastifyConfig } from "../../types/types";
import { fastifyCaster } from "../caster";
import { getZodObjectFromApi } from "../code-converters";
import { type Context } from "../context";
import { type ExtendedApi } from "../decorators";
import {
  assertHttpValidatorRegistry,
  createHttpValidator,
  getHttpValidatorFingerprint,
  getHttpValidatorRouteKey,
} from "../http-validator";
import { Sonamu } from "../sonamu";

const compilerMocks = vi.hoisted(() => ({
  jit: vi.fn(),
}));

vi.mock("zod-compiler/jit", () => ({
  jit: compilerMocks.jit,
}));

vi.mock("../code-converters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../code-converters")>();
  return {
    ...actual,
    getZodObjectFromApi: vi.fn(actual.getZodObjectFromApi),
  };
});

vi.mock("../caster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../caster")>();
  return {
    ...actual,
    fastifyCaster: vi.fn(actual.fastifyCaster),
  };
});

vi.mock("../http-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../http-validator")>();
  return {
    ...actual,
    assertHttpValidatorRegistry: vi.fn(actual.assertHttpValidatorRegistry),
    createHttpValidator: vi.fn(actual.createHttpValidator),
  };
});

function createApi(parameterType: "number" | "string" = "number"): ExtendedApi {
  return {
    modelName: "ReportModel",
    methodName: "findPage",
    path: "/report/findPage",
    options: {
      httpMethod: "GET",
    },
    typeParameters: [],
    parameters: [
      {
        name: "page",
        type: parameterType,
        optional: false,
      },
    ],
    returnType: "unknown",
  };
}

function createRequest(query: Record<string, unknown>): FastifyRequest {
  return {
    headers: {},
    method: "GET",
    query,
    url: "/report/findPage",
  } as FastifyRequest;
}

describe("REST HTTP validator 생명주기", () => {
  const originalConfig = Reflect.get(Sonamu, "_config");
  const originalApiRootPath = Reflect.get(Sonamu, "_apiRootPath");
  const originalSyncer = Reflect.get(Sonamu, "_syncer");
  const originalHttpValidators = Reflect.get(Sonamu, "httpValidators");
  const originalPendingHttpValidators = Reflect.get(Sonamu, "pendingHttpValidators");
  const originalAotRegistry = Reflect.get(Sonamu, "aotHttpValidatorRegistry");
  const originalPreparedApis = Reflect.get(Sonamu, "preparedApis");
  const originalVitest = process.env.VITEST;
  const originalHot = process.env.HOT;
  const tempRoots: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    compilerMocks.jit.mockReset();
    Reflect.set(Sonamu, "httpValidators", new WeakMap());
    Reflect.set(Sonamu, "pendingHttpValidators", new WeakMap());
    Reflect.set(Sonamu, "aotHttpValidatorRegistry", undefined);
    Reflect.set(Sonamu, "preparedApis", []);
  });

  afterEach(async () => {
    Reflect.set(Sonamu, "_apiRootPath", originalApiRootPath);
    Reflect.set(Sonamu, "_config", originalConfig);
    Reflect.set(Sonamu, "_syncer", originalSyncer);
    Reflect.set(Sonamu, "httpValidators", originalHttpValidators);
    Reflect.set(Sonamu, "pendingHttpValidators", originalPendingHttpValidators);
    Reflect.set(Sonamu, "aotHttpValidatorRegistry", originalAotRegistry);
    Reflect.set(Sonamu, "preparedApis", originalPreparedApis);
    if (originalVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = originalVitest;
    }
    if (originalHot === undefined) {
      delete process.env.HOT;
    } else {
      process.env.HOT = originalHot;
    }
    vi.restoreAllMocks();
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it("같은 REST handler에서 최종 validator를 한 번만 만들고 coercion과 Zod 오류 계약을 유지한다", async () => {
    const api = createApi();
    const types = {
      PageSchema: z.number(),
    };
    const reply = {
      type: vi.fn().mockReturnThis(),
    } as FastifyReply;
    const config = {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;

    Reflect.set(Sonamu, "_config", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "_syncer", { types });
    vi.spyOn(Sonamu, "createContext").mockResolvedValue({ transport: "http" } as Context);
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async (_api, args) => args);

    const handler = await Sonamu.createApiHandler(api, config);

    expect(getZodObjectFromApi).toHaveBeenCalledTimes(1);
    const converterCall = vi.mocked(getZodObjectFromApi).mock.calls[0];
    expect(converterCall?.[0]).toBe(api);
    expect(converterCall?.[1]).toEqual(types);
    expect(converterCall?.[1]).not.toBe(types);
    expect(fastifyCaster).toHaveBeenCalledTimes(1);

    await expect(handler(createRequest({ page: "2" }), reply)).resolves.toEqual([2]);
    await expect(handler(createRequest({ page: "invalid" }), reply)).rejects.toMatchObject({
      statusCode: 400,
      payload: {
        zodError: expect.any(ZodError),
      },
    });

    expect(getZodObjectFromApi).toHaveBeenCalledTimes(1);
    expect(fastifyCaster).toHaveBeenCalledTimes(1);
    expect(compilerMocks.jit).not.toHaveBeenCalled();
  });

  it("JIT를 첫 parse 전에 eager 설치하고 registry 없이 검증한다", async () => {
    const events: string[] = [];
    compilerMocks.jit.mockImplementation((schema: z.ZodType) => {
      const parse = schema.parse.bind(schema);
      const safeParse = schema.safeParse.bind(schema);
      Object.defineProperties(schema, {
        parse: {
          configurable: true,
          value(input: unknown) {
            events.push("parse");
            return parse(input);
          },
        },
        safeParse: {
          configurable: true,
          value(input: unknown) {
            return safeParse(input);
          },
        },
      });
      events.push("jit");
      return schema;
    });

    const validator = await createHttpValidator({
      api: createApi(),
      policy: { api: "jit", targets: {} },
      types: {},
    });

    expect(compilerMocks.jit).toHaveBeenCalledWith(expect.any(z.ZodType), { eager: true });
    expect(validator.parse({ page: "3" })).toEqual({ page: 3 });
    expect(events).toEqual(["jit", "parse"]);
  });

  it("JIT가 public parse method를 교체하지 않으면 첫 parse 전에 setup을 실패시킨다", async () => {
    compilerMocks.jit.mockImplementation((schema: z.ZodType) => schema);

    await expect(
      createHttpValidator({
        api: createApi(),
        policy: { api: "jit", targets: {} },
        types: {},
      }),
    ).rejects.toThrow();
    expect(compilerMocks.jit).toHaveBeenCalledWith(expect.any(z.ZodType), { eager: true });
  });

  it("AOT registry의 fingerprint와 route coverage 불일치를 거부한다", () => {
    const api = createApi();
    const validator = z.object({ page: z.number() });
    const validators = new Map([[getHttpValidatorRouteKey(api), validator]]);

    expect(() =>
      assertHttpValidatorRegistry([api], {
        fingerprint: "stale",
        validators,
      }),
    ).toThrow(/fingerprint mismatch/);
    expect(() =>
      assertHttpValidatorRegistry([api], {
        fingerprint: getHttpValidatorFingerprint([api]),
        validators: new Map(),
      }),
    ).toThrow(/coverage mismatch/);
  });

  it("AOT registry validator를 우선 선택하고 source 실행에서는 명시적으로 fallback한다", async () => {
    const api = createApi();
    const compiled = z.object({ page: z.number() });
    const registry = {
      fingerprint: getHttpValidatorFingerprint([api]),
      validators: new Map([[getHttpValidatorRouteKey(api), compiled]]),
    };

    await expect(
      createHttpValidator({
        api,
        policy: { api: "aot", targets: {} },
        types: {},
        aotRegistry: registry,
      }),
    ).resolves.toBe(compiled);

    const sourceFallback = await createHttpValidator({
      api,
      policy: { api: "aot", targets: {} },
      types: {},
      allowAotSourceFallback: true,
    });
    expect(sourceFallback).not.toBe(compiled);
    expect(sourceFallback.parse({ page: "4" })).toEqual({ page: 4 });

    await expect(
      createHttpValidator({
        api,
        policy: { api: "aot", targets: {} },
        types: {},
      }),
    ).rejects.toThrow(/registry is missing/);
  });

  it("metadata refresh가 실패하면 기존 cache를 유지하고 성공 후 새 validator를 재사용한다", async () => {
    const firstApi = createApi("number");
    const revisedApi = createApi("string");
    const config = {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    Reflect.set(Sonamu, "_config", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "_syncer", { apis: [firstApi], types: {} });

    await Sonamu.refreshHttpValidators();
    Sonamu.createApiHandler(firstApi, config);
    expect(getZodObjectFromApi).toHaveBeenCalledTimes(1);

    Reflect.set(Sonamu, "_syncer", { apis: [revisedApi], types: {} });
    vi.mocked(getZodObjectFromApi).mockImplementationOnce(() => {
      throw new Error("metadata refresh failed");
    });
    await expect(Sonamu.refreshHttpValidators()).rejects.toThrow("metadata refresh failed");

    Sonamu.createApiHandler(firstApi, config);
    expect(getZodObjectFromApi).toHaveBeenCalledTimes(2);

    await Sonamu.refreshHttpValidators();
    Sonamu.createApiHandler(revisedApi, config);
    expect(getZodObjectFromApi).toHaveBeenCalledTimes(3);
  });

  it("HMR source에서 opt-out에서 AOT로 전환하면 새 metadata를 fallback validator로 교체한다", async () => {
    process.env.VITEST = "true";
    const firstApi = createApi("number");
    const revisedApi = createApi("string");
    const reply = {
      type: vi.fn().mockReturnThis(),
    } as FastifyReply;
    const config = {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    vi.spyOn(Sonamu, "createContext").mockResolvedValue({ transport: "http" } as Context);
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async (_api, args) => args);
    Reflect.set(Sonamu, "_config", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "_syncer", { apis: [firstApi], types: {} });

    await Sonamu.refreshHttpValidators();
    const firstHandler = Sonamu.createApiHandler(firstApi, config);
    await expect(firstHandler(createRequest({ page: "5" }), reply)).resolves.toEqual([5]);

    Reflect.set(Sonamu, "_config", {
      sync: { targets: [] },
      validation: { zodCompiler: { api: "aot" } },
    });
    Reflect.set(Sonamu, "_syncer", { apis: [revisedApi], types: {} });
    await Sonamu.refreshHttpValidators();
    const revisedHandler = Sonamu.createApiHandler(revisedApi, config);
    await expect(revisedHandler(createRequest({ page: "5" }), reply)).resolves.toEqual(["5"]);

    Sonamu.createApiHandler(revisedApi, config);
    expect(getZodObjectFromApi).toHaveBeenCalledTimes(2);
  });

  it("HMR refresh는 API, validator, model registry를 준비 완료 snapshot으로 함께 공개한다", async () => {
    process.env.VITEST = "true";
    const previousApi = createApi("number");
    const revisedApi = {
      ...createApi("string"),
      methodName: "findPageV2",
    };
    const previousModel = {
      findPage(page: unknown) {
        return { modelRevision: "previous", value: page };
      },
    };
    const revisedModel = {
      findPageV2(page: unknown) {
        return { modelRevision: "revised", value: page };
      },
    };
    const request = {
      ...createRequest({ page: "5" }),
      url: "/api/report/findPage",
    } as FastifyRequest;
    const reply = {
      type: vi.fn().mockReturnThis(),
    } as FastifyReply;
    const config = {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    const handleDevApiRequest: (
      request: FastifyRequest,
      config: SonamuFastifyConfig,
    ) => Promise<((request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) | null> =
      Reflect.get(Sonamu, "handleDevApiRequest");
    const invokeDevRequest = async (): Promise<unknown> => {
      const handler = await handleDevApiRequest.call(Sonamu, request, config);
      if (handler === null) {
        throw new Error("개발 API handler를 찾지 못했습니다");
      }
      return await handler(request, reply);
    };

    Reflect.set(Sonamu, "_config", {
      api: { route: { prefix: "/api" } },
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "_syncer", {
      apis: [previousApi],
      models: { ReportModel: previousModel },
      types: {},
    });
    vi.spyOn(Sonamu, "createContext").mockResolvedValue({ transport: "http" } as Context);

    await Sonamu.refreshHttpValidators();
    vi.mocked(createHttpValidator).mockClear();

    type Validator = Awaited<ReturnType<typeof createHttpValidator>>;
    let rejectRefresh: ((error: Error) => void) | undefined;
    const blockedValidator = new Promise<Validator>((_resolve, reject) => {
      rejectRefresh = (error) => reject(error);
    });
    vi.mocked(createHttpValidator).mockImplementationOnce(async () => await blockedValidator);
    Reflect.set(Sonamu, "_syncer", {
      apis: [revisedApi],
      models: { ReportModel: revisedModel },
      types: {},
    });

    const failedRefresh = Sonamu.refreshHttpValidators();
    const refreshSetupCalls = vi.mocked(createHttpValidator).mock.calls.length;
    const duringRefresh = await invokeDevRequest().catch((error: unknown) => error);
    const callsAfterRequest = vi.mocked(createHttpValidator).mock.calls.length;
    if (rejectRefresh === undefined) {
      throw new Error("refresh 실패 제어가 준비되지 않았습니다");
    }
    rejectRefresh(new Error("metadata refresh failed"));
    await expect(failedRefresh).rejects.toThrow("metadata refresh failed");
    const afterFailure = await invokeDevRequest().catch((error: unknown) => error);
    const callsAfterFailedRequest = vi.mocked(createHttpValidator).mock.calls.length;

    await Sonamu.refreshHttpValidators();
    const afterSuccess = await invokeDevRequest();

    expect(refreshSetupCalls).toBe(1);
    expect(callsAfterRequest).toBe(1);
    expect(callsAfterFailedRequest).toBe(1);
    expect(duringRefresh).toEqual({ modelRevision: "previous", value: 5 });
    expect(afterFailure).toEqual({ modelRevision: "previous", value: 5 });
    expect(afterSuccess).toEqual({ modelRevision: "revised", value: "5" });
    expect(createHttpValidator).toHaveBeenCalledTimes(2);
  });

  it("built AOT refresh는 metadata revision마다 registry를 한 번만 검증하고 plain validator를 만들지 않는다", async () => {
    delete process.env.VITEST;
    delete process.env.HOT;
    const config = {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    const createRegistryRoot = async (apis: ExtendedApi[]): Promise<string> => {
      const apiRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-built-aot-refresh-test-"));
      tempRoots.push(apiRootPath);
      const registryPath = path.join(
        apiRootPath,
        "dist/application/sonamu.validators.generated.js",
      );
      await mkdir(path.dirname(registryPath), { recursive: true });
      const entries = apis.map(
        (api) =>
          `[${JSON.stringify(getHttpValidatorRouteKey(api))}, { parse(input) { return input; } }]`,
      );
      await writeFile(
        registryPath,
        [
          `export const fingerprint = ${JSON.stringify(getHttpValidatorFingerprint(apis))};`,
          `export const validators = new Map([${entries.join(",")}]);`,
          "",
        ].join("\n"),
      );
      return apiRootPath;
    };
    const firstApis = [
      createApi("number"),
      { ...createApi("number"), methodName: "findOther", path: "/report/findOther" },
    ];
    const revisedApis = [
      createApi("string"),
      { ...createApi("string"), methodName: "findOther", path: "/report/findOther" },
    ];
    Reflect.set(Sonamu, "_config", {
      sync: { targets: [] },
      validation: { zodCompiler: { api: "aot" } },
    });

    Reflect.set(Sonamu, "_apiRootPath", await createRegistryRoot(firstApis));
    Reflect.set(Sonamu, "_syncer", { apis: firstApis, types: {} });
    await Sonamu.refreshHttpValidators();
    for (const api of firstApis) {
      Sonamu.createApiHandler(api, config);
      Sonamu.createApiHandler(api, config);
    }

    Reflect.set(Sonamu, "_apiRootPath", await createRegistryRoot(revisedApis));
    Reflect.set(Sonamu, "_syncer", { apis: revisedApis, types: {} });
    await Sonamu.refreshHttpValidators();
    for (const api of revisedApis) {
      Sonamu.createApiHandler(api, config);
      Sonamu.createApiHandler(api, config);
    }

    expect(assertHttpValidatorRegistry).toHaveBeenCalledTimes(2);
    expect(getZodObjectFromApi).not.toHaveBeenCalled();
    expect(fastifyCaster).not.toHaveBeenCalled();
  });
});
