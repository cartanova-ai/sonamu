import { createHash } from "node:crypto";

import { type z } from "zod";

import { type LoadedTypes } from "../syncer/module-loader";
import { isObjectValue } from "../utils/runtime-value";
import { fastifyCaster } from "./caster";
import { getZodObjectFromApi } from "./code-converters";
import { type NormalizedZodCompilerPolicy } from "./config";
import { type ExtendedApi } from "./decorators";

export type HttpRequestValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | null
  | undefined
  | HttpRequestValue[]
  | { [key: string]: HttpRequestValue };
export type HttpRequestParameters = Record<string, HttpRequestValue>;
export type HttpValidator = z.ZodType<object>;
type FastifyHttpValidator = ReturnType<typeof fastifyCaster>;
export type HttpValidatorRegistry = {
  fingerprint: string;
  validators: ReadonlyMap<string, HttpValidator>;
};

export function getHttpValidatorRouteKey(api: ExtendedApi): string {
  return JSON.stringify([api.modelName, api.methodName, api.options.httpMethod ?? "GET", api.path]);
}

export function getHttpValidatorRouteIdentifier(api: ExtendedApi): string {
  return createHash("sha256").update(getHttpValidatorRouteKey(api)).digest("hex");
}

function stableJson<Value>(value: Value): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (isObjectValue(value) && value !== null) {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function getHttpValidatorFingerprint(apis: readonly ExtendedApi[]): string {
  const metadata = apis
    .filter((api) => api.websocketOptions === undefined)
    .map((api) => ({
      key: getHttpValidatorRouteKey(api),
      parameters: api.parameters,
      typeParameters: api.typeParameters,
    }))
    .toSorted((left, right) => left.key.localeCompare(right.key));
  return createHash("sha256").update(stableJson(metadata)).digest("hex");
}

export function assertHttpValidatorRegistry(
  apis: readonly ExtendedApi[],
  registry: HttpValidatorRegistry,
): void {
  const expectedApis = apis.filter((api) => api.websocketOptions === undefined);
  const expectedFingerprint = getHttpValidatorFingerprint(expectedApis);
  if (registry.fingerprint !== expectedFingerprint) {
    throw new Error(
      `HTTP validator registry fingerprint mismatch: expected ${expectedFingerprint}, received ${registry.fingerprint}`,
    );
  }

  const expectedKeys = new Set(expectedApis.map(getHttpValidatorRouteKey));
  if (registry.validators.size !== expectedKeys.size) {
    throw new Error(
      `HTTP validator registry coverage mismatch: expected ${expectedKeys.size}, received ${registry.validators.size}`,
    );
  }
  for (const key of expectedKeys) {
    if (!registry.validators.has(key)) {
      throw new Error(`HTTP validator registry is missing ${key}`);
    }
  }
}

export interface HttpValidatorDependencies {
  createSchema(api: ExtendedApi, types: LoadedTypes): z.ZodObject;
  applyCaster(schema: z.ZodObject): FastifyHttpValidator;
  compileJit(
    validator: FastifyHttpValidator,
    options: { eager: true },
  ): Promise<FastifyHttpValidator>;
}

export const defaultHttpValidatorDependencies: HttpValidatorDependencies = {
  createSchema: getZodObjectFromApi,
  applyCaster: fastifyCaster,
  async compileJit(validator, options) {
    const { jit } = await import("zod-compiler/jit");
    return jit(validator, options);
  },
};

export async function createHttpValidator(
  options: {
    api: ExtendedApi;
    policy: NormalizedZodCompilerPolicy;
    types: LoadedTypes;
    aotRegistry?: HttpValidatorRegistry;
    allowAotSourceFallback?: boolean;
  },
  dependencies: HttpValidatorDependencies = defaultHttpValidatorDependencies,
): Promise<HttpValidator> {
  if (options.policy.api === "aot") {
    const routeKey = getHttpValidatorRouteKey(options.api);
    const compiled = options.aotRegistry?.validators.get(routeKey);
    if (compiled !== undefined) {
      return compiled;
    }
    if (options.allowAotSourceFallback === true) {
      // source dev에서는 build registry를 실행하지 않으므로 cached plain validator로 대체합니다.
    } else {
      throw new Error(`HTTP validator registry is missing ${routeKey}`);
    }
  }

  // Generic type parameter 처리 중 공유 references가 바뀌므로 route마다 사본을 넘깁니다.
  const validator = dependencies.applyCaster(
    dependencies.createSchema(options.api, { ...options.types }),
  );
  if (options.policy.api !== "jit") {
    return validator;
  }

  const originalParse = validator.parse;
  const originalSafeParse = validator.safeParse;
  const compiled = await dependencies.compileJit(validator, { eager: true });

  // upstream JIT는 컴파일 실패를 숨기므로 공개 메서드 설치 여부를 직접 확인합니다.
  if (compiled.parse === originalParse || compiled.safeParse === originalSafeParse) {
    throw new Error(
      `validation.zodCompiler.api JIT compilation failed for ${getHttpValidatorRouteKey(options.api)}`,
    );
  }

  return compiled;
}
