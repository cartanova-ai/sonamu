import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type FastifyReply, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

import { type SonamuFastifyConfig } from "../../types/types";
import { type Context } from "../context";
import { type ExtendedApi } from "../decorators";
import {
  assertHttpValidatorRegistry,
  createHttpValidator,
  defaultHttpValidatorDependencies,
  getHttpValidatorFingerprint,
  getHttpValidatorRouteKey,
  type HttpValidatorDependencies,
} from "../http-validator";
import {
  defaultSonamuHttpValidatorDependencies,
  Sonamu,
  type SonamuHttpValidatorDependencies,
} from "../sonamu";

const createSchema = vi.fn(defaultHttpValidatorDependencies.createSchema);
const applyCaster = vi.fn(defaultHttpValidatorDependencies.applyCaster);
const compileJit = vi.fn(defaultHttpValidatorDependencies.compileJit);
const validatorDependencies: HttpValidatorDependencies = {
  createSchema,
  applyCaster,
  compileJit,
};
const createValidator = vi.fn((options: Parameters<typeof createHttpValidator>[0]) =>
  createHttpValidator(options, validatorDependencies),
);
const assertRegistry = vi.fn(assertHttpValidatorRegistry);
const lifecycleDependencies: SonamuHttpValidatorDependencies = {
  createValidator,
  assertRegistry,
};

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

function createRequest<Query extends object>(query: Query): FastifyRequest {
  return /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
    headers: {},
    method: "GET",
    query,
    url: "/report/findPage",
  } as FastifyRequest;
}

describe("REST HTTP validator 생명주기", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  const originalVitest = process.env.VITEST;
  const originalHot = process.env.HOT;
  const tempRoots: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    createSchema.mockImplementation(defaultHttpValidatorDependencies.createSchema);
    applyCaster.mockImplementation(defaultHttpValidatorDependencies.applyCaster);
    compileJit.mockImplementation(defaultHttpValidatorDependencies.compileJit);
    createValidator.mockImplementation((options) =>
      createHttpValidator(options, validatorDependencies),
    );
    assertRegistry.mockImplementation(defaultSonamuHttpValidatorDependencies.assertRegistry);
    Reflect.set(Sonamu, "httpValidators", new WeakMap());
    Reflect.set(Sonamu, "pendingHttpValidators", new WeakMap());
    Reflect.set(Sonamu, "aotHttpValidatorRegistry", undefined);
    Reflect.set(Sonamu, "preparedApis", []);
  });

  afterEach(async () => {
    Sonamu.restoreTestingSnapshot(originalState);
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
    const reply = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      type: vi.fn().mockReturnThis(),
    } as FastifyReply;
    const config = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;

    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "syncerValue", { types });
    vi.spyOn(Sonamu, "createContext").mockResolvedValue(
      /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
        transport: "http",
      } as Context,
    );
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async (_api, args) => args);

    const handler = await Sonamu.createApiHandler(api, config, undefined, lifecycleDependencies);

    expect(createSchema).toHaveBeenCalledTimes(1);
    const converterCall = createSchema.mock.calls[0];
    expect(converterCall?.[0]).toBe(api);
    expect(converterCall?.[1]).toEqual(types);
    expect(converterCall?.[1]).not.toBe(types);
    expect(applyCaster).toHaveBeenCalledTimes(1);

    await expect(handler(createRequest({ page: "2" }), reply)).resolves.toEqual([2]);
    await expect(handler(createRequest({ page: "invalid" }), reply)).rejects.toMatchObject({
      statusCode: 400,
      payload: {
        zodError: expect.any(ZodError),
      },
    });

    expect(createSchema).toHaveBeenCalledTimes(1);
    expect(applyCaster).toHaveBeenCalledTimes(1);
    expect(compileJit).not.toHaveBeenCalled();
  });

  it("JIT를 첫 parse 전에 eager 설치하고 registry 없이 검증한다", async () => {
    const events: string[] = [];
    compileJit.mockImplementation(async (schema) => {
      const parse = schema.parse.bind(schema);
      const safeParse = schema.safeParse.bind(schema);
      Object.defineProperties(schema, {
        parse: {
          configurable: true,
          value<Input>(input: Input) {
            events.push("parse");
            return parse(input);
          },
        },
        safeParse: {
          configurable: true,
          value<Input>(input: Input) {
            return safeParse(input);
          },
        },
      });
      events.push("jit");
      return schema;
    });

    const validator = await createHttpValidator(
      {
        api: createApi(),
        policy: { api: "jit", targets: {} },
        types: {},
      },
      validatorDependencies,
    );

    expect(compileJit).toHaveBeenCalledWith(expect.any(z.ZodType), { eager: true });
    expect(validator.parse({ page: "3" })).toEqual({ page: 3 });
    expect(events).toEqual(["jit", "parse"]);
  });

  it("JIT가 public parse method를 교체하지 않으면 첫 parse 전에 setup을 실패시킨다", async () => {
    compileJit.mockImplementation(async (schema) => schema);

    await expect(
      createHttpValidator(
        {
          api: createApi(),
          policy: { api: "jit", targets: {} },
          types: {},
        },
        validatorDependencies,
      ),
    ).rejects.toThrow();
    expect(compileJit).toHaveBeenCalledWith(expect.any(z.ZodType), { eager: true });
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
    const config = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "syncerValue", { apis: [firstApi], types: {} });

    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    Sonamu.createApiHandler(firstApi, config, undefined, lifecycleDependencies);
    expect(createSchema).toHaveBeenCalledTimes(1);

    Reflect.set(Sonamu, "syncerValue", { apis: [revisedApi], types: {} });
    createSchema.mockImplementationOnce(() => {
      throw new Error("metadata refresh failed");
    });
    await expect(Sonamu.refreshHttpValidators(lifecycleDependencies)).rejects.toThrow(
      "metadata refresh failed",
    );

    Sonamu.createApiHandler(firstApi, config, undefined, lifecycleDependencies);
    expect(createSchema).toHaveBeenCalledTimes(2);

    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    Sonamu.createApiHandler(revisedApi, config, undefined, lifecycleDependencies);
    expect(createSchema).toHaveBeenCalledTimes(3);
  });

  it("HMR source에서 opt-out에서 AOT로 전환하면 새 metadata를 fallback validator로 교체한다", async () => {
    process.env.VITEST = "true";
    const firstApi = createApi("number");
    const revisedApi = createApi("string");
    const reply = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      type: vi.fn().mockReturnThis(),
    } as FastifyReply;
    const config = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    vi.spyOn(Sonamu, "createContext").mockResolvedValue(
      /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
        transport: "http",
      } as Context,
    );
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async (_api, args) => args);
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "syncerValue", { apis: [firstApi], types: {} });

    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    const firstHandler = Sonamu.createApiHandler(
      firstApi,
      config,
      undefined,
      lifecycleDependencies,
    );
    await expect(firstHandler(createRequest({ page: "5" }), reply)).resolves.toEqual([5]);

    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: { api: "aot" } },
    });
    Reflect.set(Sonamu, "syncerValue", { apis: [revisedApi], types: {} });
    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    const revisedHandler = Sonamu.createApiHandler(
      revisedApi,
      config,
      undefined,
      lifecycleDependencies,
    );
    await expect(revisedHandler(createRequest({ page: "5" }), reply)).resolves.toEqual(["5"]);

    Sonamu.createApiHandler(revisedApi, config, undefined, lifecycleDependencies);
    expect(createSchema).toHaveBeenCalledTimes(2);
  });

  it("HMR refresh는 API, validator, model registry를 준비 완료 snapshot으로 함께 공개한다", async () => {
    process.env.VITEST = "true";
    const previousApi = createApi("number");
    const revisedApi = {
      ...createApi("string"),
      methodName: "findPageV2",
    };
    const previousModel = {
      findPage<Page>(page: Page) {
        return { modelRevision: "previous", value: page };
      },
    };
    const revisedModel = {
      findPageV2<Page>(page: Page) {
        return { modelRevision: "revised", value: page };
      },
    };
    const request = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      ...createRequest({ page: "5" }),
      url: "/api/report/findPage",
    } as FastifyRequest;
    const reply = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      type: vi.fn().mockReturnThis(),
    } as FastifyReply;
    const config = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
      contextProvider(defaultContext: Context) {
        return defaultContext;
      },
      guardHandler() {},
    } as SonamuFastifyConfig;
    const invokeDevRequest = async () => {
      const handler = await Sonamu.handleDevApiRequestForTesting(request, config);
      if (handler === null) {
        throw new Error("개발 API handler를 찾지 못했습니다");
      }
      return await handler(request, reply);
    };

    Reflect.set(Sonamu, "configValue", {
      api: { route: { prefix: "/api" } },
      sync: { targets: [] },
      validation: { zodCompiler: false },
    });
    Reflect.set(Sonamu, "syncerValue", {
      apis: [previousApi],
      models: { ReportModel: previousModel },
      types: {},
    });
    vi.spyOn(Sonamu, "createContext").mockResolvedValue(
      /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
        transport: "http",
      } as Context,
    );

    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    createValidator.mockClear();

    type Validator = Awaited<ReturnType<typeof createHttpValidator>>;
    let rejectRefresh: ((error: Error) => void) | undefined;
    const blockedValidator = new Promise<Validator>((_resolve, reject) => {
      rejectRefresh = (error) => reject(error);
    });
    createValidator.mockImplementationOnce(async () => await blockedValidator);
    Reflect.set(Sonamu, "syncerValue", {
      apis: [revisedApi],
      models: { ReportModel: revisedModel },
      types: {},
    });

    const failedRefresh = Sonamu.refreshHttpValidators(lifecycleDependencies);
    const refreshSetupCalls = createValidator.mock.calls.length;
    const duringRefresh = await invokeDevRequest();
    const callsAfterRequest = createValidator.mock.calls.length;
    if (rejectRefresh === undefined) {
      throw new Error("refresh 실패 제어가 준비되지 않았습니다");
    }
    rejectRefresh(new Error("metadata refresh failed"));
    await expect(failedRefresh).rejects.toThrow("metadata refresh failed");
    const afterFailure = await invokeDevRequest();
    const callsAfterFailedRequest = createValidator.mock.calls.length;

    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    const afterSuccess = await invokeDevRequest();

    expect(refreshSetupCalls).toBe(1);
    expect(callsAfterRequest).toBe(1);
    expect(callsAfterFailedRequest).toBe(1);
    expect(duringRefresh).toEqual({ modelRevision: "previous", value: 5 });
    expect(afterFailure).toEqual({ modelRevision: "previous", value: 5 });
    expect(afterSuccess).toEqual({ modelRevision: "revised", value: "5" });
    expect(createValidator).toHaveBeenCalledTimes(2);
  });

  it("built AOT refresh는 metadata revision마다 registry를 한 번만 검증하고 plain validator를 만들지 않는다", async () => {
    delete process.env.VITEST;
    delete process.env.HOT;
    const config = /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {
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
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: { api: "aot" } },
    });

    Reflect.set(Sonamu, "apiRootPathValue", await createRegistryRoot(firstApis));
    Reflect.set(Sonamu, "syncerValue", { apis: firstApis, types: {} });
    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    for (const api of firstApis) {
      Sonamu.createApiHandler(api, config, undefined, lifecycleDependencies);
      Sonamu.createApiHandler(api, config, undefined, lifecycleDependencies);
    }

    Reflect.set(Sonamu, "apiRootPathValue", await createRegistryRoot(revisedApis));
    Reflect.set(Sonamu, "syncerValue", { apis: revisedApis, types: {} });
    await Sonamu.refreshHttpValidators(lifecycleDependencies);
    for (const api of revisedApis) {
      Sonamu.createApiHandler(api, config, undefined, lifecycleDependencies);
      Sonamu.createApiHandler(api, config, undefined, lifecycleDependencies);
    }

    expect(assertRegistry).toHaveBeenCalledTimes(2);
    expect(createSchema).not.toHaveBeenCalled();
    expect(applyCaster).not.toHaveBeenCalled();
  });
});
