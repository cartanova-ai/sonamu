import assert from "assert";

import { type FastifyMultipartBaseOptions } from "@fastify/multipart";
import { getLogger } from "@logtape/logtape";
import { type HTTPMethods } from "fastify";
import inflection from "inflection";
import { isEqual } from "radashi";
import { type z } from "zod";

import { type CacheControlConfig } from "../cache-control/types";
import { type CompressConfig } from "../compress/types";
import { BaseModelClass } from "../database/base-model";
import { DB } from "../database/db";
import { PuriTransactionWrapper } from "../database/puri-wrapper";
import { type TransactionalOptions } from "../database/puri-wrapper";
import { UpsertBuilder } from "../database/upsert-builder";
import { convertDomainToCategory } from "../logger/category";
import { type DriverKey } from "../storage/drivers";
import { type KeyGenerator } from "../storage/types";
import { type ApiParam, type ApiParamType } from "../types/types";
import { getModelNameFromClassName } from "../utils/class-name";
import { BaseFrameClass } from "./base-frame";

export interface GuardKeys {
  query: true;
  admin: true;
  user: true;
}
export type GuardKey = keyof GuardKeys;
export type ServiceClient =
  | "axios"
  | "axios-multipart"
  | "tanstack-query"
  | "tanstack-mutation"
  | "tanstack-mutation-multipart"
  | "window-fetch";
export type ApiDecoratorOptions = {
  httpMethod?: HTTPMethods;
  contentType?:
    | "text/plain"
    | "text/html"
    | "text/xml"
    | "application/json"
    | "application/octet-stream";
  clients?: ServiceClient[];
  path?: string;
  resourceName?: string;
  guards?: GuardKey[];
  description?: string;
  timeout?: number;
  /** API 응답의 Cache-Control 헤더 설정. 설정하지 않으면 cacheControlHandler 또는 기본값이 적용됩니다. */
  cacheControl?: CacheControlConfig;
  /** API 응답의 압축 설정. false로 설정하면 압축을 비활성화합니다. */
  compress?: CompressConfig;
};
export type StreamDecoratorOptions = {
  type: "sse";
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 이벤트 키별로 넘겨주는 값이므로 어떤 타입이든 상관없음
  events: z.ZodObject<any>;
  path?: string;
  resourceName?: string;
  guards?: GuardKey[];
  description?: string;
};
export type WebSocketDecoratorOptions = {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 이벤트 키별로 넘겨주는 값이므로 어떤 타입이든 상관없음
  outEvents: z.ZodObject<any>;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- 이벤트 키별로 넘겨주는 값이므로 어떤 타입이든 상관없음
  inEvents: z.ZodObject<any>;
  path?: string;
  resourceName?: string;
  guards?: GuardKey[];
  description?: string;
  heartbeat?: number;
  namespace?: string;
};
export type ResolvedWebSocketDecoratorOptions = WebSocketDecoratorOptions & {
  // codegen이 타입 이름을 재사용할 수 있도록 syncer가 AST에서 보강하는 메타데이터
  outEventsTypeRef?: ApiParamType.Ref;
  inEventsTypeRef?: ApiParamType.Ref;
};

type BufferUploadOptions = {
  consume?: "buffer";
};
type StreamUploadOptions = {
  consume: "stream";
  destination: DriverKey;
  keyGenerator?: KeyGenerator;
};
export type UploadDecoratorOptions = {
  guards?: GuardKey[];
  description?: string;
  limits?: FastifyMultipartBaseOptions["limits"];
} & (BufferUploadOptions | StreamUploadOptions);

export const registeredApis: {
  /**
   * modelName은 모델 클래스 이름입니다. (ex. "UserModel")
   */
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
  streamOptions?: StreamDecoratorOptions;
  websocketOptions?: ResolvedWebSocketDecoratorOptions;
  uploadOptions?: UploadDecoratorOptions;
}[] = [];
export type ExtendedApi = {
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
  streamOptions?: StreamDecoratorOptions;
  websocketOptions?: ResolvedWebSocketDecoratorOptions;
  uploadOptions?: UploadDecoratorOptions;
  typeParameters: ApiParamType.TypeParam[];
  parameters: ApiParam[];
  returnType: ApiParamType;
};
type DecoratorTarget = { constructor: { name: string } };

const decoratorTypesByTarget = new WeakMap<DecoratorTarget, Map<string, symbol>>();

const DECORATOR_TYPES = {
  API: Symbol("api"),
  STREAM: Symbol("stream"),
  WEBSOCKET: Symbol("websocket"),
  UPLOAD: Symbol("upload"),
} as const;

function checkSingleDecorator(target: DecoratorTarget, propertyKey: string, decoratorType: symbol) {
  const decoratorTypes = decoratorTypesByTarget.get(target) ?? new Map<string, symbol>();
  const existingDecoratorType = decoratorTypes.get(propertyKey);

  if (existingDecoratorType && existingDecoratorType !== decoratorType) {
    throw new Error(
      `@${decoratorType.description ?? String(decoratorType)} decorator can only be used once on ${target.constructor.name}.${propertyKey}. You can use only one of @api, @stream, @websocket, or @upload decorator on the same method.`,
    );
  } else {
    decoratorTypes.set(propertyKey, decoratorType);
    decoratorTypesByTarget.set(target, decoratorTypes);
  }
}

export function api(options: ApiDecoratorOptions = {}) {
  options = {
    httpMethod: "GET",
    contentType: "application/json",
    clients: ["axios"],
    ...options,
  };

  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const modelName = getModelNameFromClassName(target.constructor.name);
    assert(
      modelName,
      `modelName is required on @api decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    // 메서드에 걸린 데코레이터 중복 체크
    checkSingleDecorator(target, propertyKey, DECORATOR_TYPES.API);

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true,
    )}/${inflection.camelize(propertyKey, true)}`;
    const path = options.path ?? defaultPath;

    // 기존 동일한 메서드가 있는지 확인 후 있는 경우 override
    const existingApi = registeredApis.find(
      (registeredApi) =>
        registeredApi.modelName === modelName && registeredApi.methodName === methodName,
    );
    if (existingApi) {
      // 기존의 path와 새로운 path가 다르다면(=빈 스트링이 아니었는데 다른 스트링으로 바뀌게 된다면) 에러를 터뜨려줍니다.
      assertNoConflictingPath("api", modelName, methodName, existingApi.path, path);
      existingApi.path = path;

      // 기존의 옵션과 새로운 옵션이 겹치는 부분이 있다면 에러를 터뜨려줍니다.
      assertNoConflictingOptions("api", modelName, methodName, existingApi.options, options);
      existingApi.options = {
        ...existingApi.options, // 기존의 옵션을 존중하되
        ...options, // @api 데코레이터의 옵션을 추가합니다.
      };
    } else {
      registeredApis.push({
        modelName,
        methodName,
        path,
        options,
      });
    }

    const originalMethod = descriptor.value;
    descriptor.value = async function (this: BaseModelClass | BaseFrameClass, ...args: unknown[]) {
      if (this instanceof BaseModelClass) {
        getLogger(convertDomainToCategory(this.modelName, "model")).debug(
          "api: {httpMethod} {model}.{method}",
          {
            httpMethod: options.httpMethod,
            model: modelName,
            method: methodName,
          },
        );
      }

      if (this instanceof BaseFrameClass) {
        getLogger(convertDomainToCategory(this.frameName, "frame")).debug(
          "api: {httpMethod} {model}.{method}",
          {
            httpMethod: options.httpMethod,
            model: modelName,
            method: methodName,
          },
        );
      }

      return originalMethod.apply(this, args);
    };
  };
}

export function stream(options: StreamDecoratorOptions) {
  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const modelName = getModelNameFromClassName(target.constructor.name);
    assert(
      modelName,
      `modelName is required on @stream decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    // 메서드에 걸린 데코레이터 중복 체크
    checkSingleDecorator(target, propertyKey, DECORATOR_TYPES.STREAM);

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true,
    )}/${inflection.camelize(propertyKey, true)}`;
    const path = options.path ?? defaultPath;
    // stream 전용 필드(events, type)는 ApiDecoratorOptions에 속하지 않으므로 제외
    const { events: _, type: _type, ...apiOptions } = options;
    const optionsWithDefaults = {
      ...apiOptions,
      httpMethod:
        /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ "GET" as HTTPMethods,
    };

    const existingApi = registeredApis.find(
      (registeredApi) =>
        registeredApi.modelName === modelName && registeredApi.methodName === methodName,
    );
    if (existingApi) {
      // 기존의 path와 새로운 path가 다르다면(=빈 스트링이 아니었는데 다른 스트링으로 바뀌게 된다면) 에러를 터뜨려줍니다.
      assertNoConflictingPath("stream", modelName, methodName, existingApi.path, path);
      existingApi.path = path;

      // 기존의 옵션과 새로운 옵션이 겹치는 부분이 있다면 에러를 터뜨려줍니다.
      assertNoConflictingOptions(
        "stream",
        modelName,
        methodName,
        existingApi.options,
        optionsWithDefaults,
      );
      existingApi.options = {
        ...existingApi.options, // 기존의 옵션을 존중하되
        ...optionsWithDefaults, // @stream 데코레이터의 옵션을 추가합니다.
      };

      existingApi.streamOptions = options;
    } else {
      registeredApis.push({
        modelName,
        methodName,
        path,
        options: optionsWithDefaults,
        streamOptions: options,
      });
    }

    const originalMethod = descriptor.value;
    descriptor.value = async function (this: BaseModelClass | BaseFrameClass, ...args: unknown[]) {
      if (this instanceof BaseModelClass) {
        getLogger(convertDomainToCategory(this.modelName, "model")).debug(
          "stream: {model}.{method}",
          {
            model: modelName,
            method: methodName,
          },
        );
      }

      if (this instanceof BaseFrameClass) {
        getLogger(convertDomainToCategory(this.frameName, "frame")).debug(
          "stream: {model}.{method}",
          {
            model: modelName,
            method: methodName,
          },
        );
      }

      return originalMethod.apply(this, args);
    };
  };
}

export function websocket(options: WebSocketDecoratorOptions) {
  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const modelName = getModelNameFromClassName(target.constructor.name);
    assert(
      modelName,
      `modelName is required on @websocket decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    checkSingleDecorator(target, propertyKey, DECORATOR_TYPES.WEBSOCKET);

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true,
    )}/${inflection.camelize(propertyKey, true)}`;
    const path = options.path ?? defaultPath;
    const { outEvents: _outEvents, inEvents: _inEvents, ...apiOptions } = options;
    const optionsWithDefaults = {
      ...apiOptions,
      httpMethod:
        /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ "GET" as HTTPMethods,
    };

    const existingApi = registeredApis.find(
      (registeredApi) =>
        registeredApi.modelName === modelName && registeredApi.methodName === methodName,
    );
    if (existingApi) {
      assertNoConflictingPath("websocket", modelName, methodName, existingApi.path, path);
      existingApi.path = path;

      assertNoConflictingOptions(
        "websocket",
        modelName,
        methodName,
        existingApi.options,
        optionsWithDefaults,
      );
      existingApi.options = {
        ...existingApi.options,
        ...optionsWithDefaults,
      };

      existingApi.websocketOptions = options;
    } else {
      registeredApis.push({
        modelName,
        methodName,
        path,
        options: optionsWithDefaults,
        websocketOptions: options,
      });
    }

    const originalMethod = descriptor.value;
    descriptor.value = async function (this: BaseModelClass | BaseFrameClass, ...args: unknown[]) {
      if (this instanceof BaseModelClass) {
        getLogger(convertDomainToCategory(this.modelName, "model")).debug(
          "websocket: {model}.{method}",
          {
            model: modelName,
            method: methodName,
          },
        );
      }

      if (this instanceof BaseFrameClass) {
        getLogger(convertDomainToCategory(this.frameName, "frame")).debug(
          "websocket: {model}.{method}",
          {
            model: modelName,
            method: methodName,
          },
        );
      }

      return originalMethod.apply(this, args);
    };
  };
}

export function transactional(options: TransactionalOptions = {}) {
  const { isolation, readOnly, dbPreset = "w" } = options;

  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const modelName = getModelNameFromClassName(target.constructor.name);
    assert(
      modelName,
      `modelName is required on @transactional decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    descriptor.value = async function (this: BaseModelClass, ...args: unknown[]) {
      this.logger.debug("transactional: {model}.{method}", {
        model: modelName,
        method: methodName,
      });

      // 해당 preset의 트랜잭션이 없으면 새 트랜잭션과 scope를 함께 시작한다.
      const startTransaction = async () => {
        const puri = this.getPuri(dbPreset);

        return puri.knex.transaction(
          async (trx) => {
            this.logger.debug("new transaction context: {dbPreset}", { dbPreset });
            const trxWrapper = new PuriTransactionWrapper(trx, new UpsertBuilder());

            return DB.runWithTransactionScope(dbPreset, trxWrapper, () =>
              originalMethod.apply(this, args),
            );
          },
          { isolationLevel: isolation, readOnly },
        );
      };

      const existingTransaction = DB.transactionStorage.getStore()?.getTransaction(dbPreset);
      if (existingTransaction) {
        this.logger.debug("reuse transaction context: {dbPreset}", { dbPreset });
        // 다른 preset이 안쪽에 있어도 이 메서드가 재사용한 트랜잭션을 현재 scope로 표시한다.
        return DB.runWithTransactionScope(dbPreset, existingTransaction, () =>
          originalMethod.apply(this, args),
        );
      }

      return startTransaction();
    };

    return descriptor;
  };
}

/**
 * 파일 업로드 API를 생성해줍니다. (@api 데코레이터 없이 독립적으로 사용)
 * @param options
 * @returns
 */
export function upload(options: UploadDecoratorOptions = { consume: "buffer" }) {
  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const modelName = getModelNameFromClassName(target.constructor.name);
    assert(
      modelName,
      `modelName is required on @upload decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    // 메서드에 걸린 데코레이터 중복 체크
    checkSingleDecorator(target, propertyKey, DECORATOR_TYPES.UPLOAD);

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true,
    )}/${inflection.camelize(methodName, true)}`;

    // registeredApis에서 해당 API 찾아서 uploadOptions 추가
    const existingApi = registeredApis.find(
      (registeredApi) =>
        registeredApi.modelName === modelName && registeredApi.methodName === methodName,
    );

    if (existingApi) {
      // 재등록 시 업로드 옵션만 갱신
      existingApi.uploadOptions = options;
    } else {
      // 새로 등록
      registeredApis.push({
        modelName,
        methodName,
        path: defaultPath,
        options: {
          httpMethod: "POST",
          clients: ["axios-multipart", "tanstack-mutation-multipart"],
          guards: options.guards,
          description: options.description,
        },
        uploadOptions: options,
      });
    }

    descriptor.value = async function (this: BaseModelClass | BaseFrameClass, ...args: unknown[]) {
      if (this instanceof BaseModelClass) {
        getLogger(convertDomainToCategory(this.modelName, "model")).debug(
          "upload: {model}.{method}",
          {
            model: modelName,
            method: methodName,
          },
        );
      }

      if (this instanceof BaseFrameClass) {
        getLogger(convertDomainToCategory(this.frameName, "frame")).debug(
          "upload: {model}.{method}",
          {
            model: modelName,
            method: methodName,
          },
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 기존의 path와 새로운 path가 다르다면(=값이 있던 스트링이 다른 값이 있는 스트링으로 바뀌게 된다면) 에러를 터뜨려줍니다.
 * @param decoratorName 데코레이터 이름
 * @param modelName 모델 이름
 * @param methodName 메서드 이름
 * @param existingPath 기존의 path
 * @param newPath 새로운 path
 */
function assertNoConflictingPath(
  decoratorName: string,
  modelName: string,
  methodName: string,
  existingPath: string,
  newPath: string,
) {
  if (existingPath !== "" && newPath !== "" && existingPath !== newPath) {
    // 이것이 무슨 상황이냐면요, api.path가 덮어씌워지는 상황입니다.
    // 가령 @api({ path: "/api/v1/users" }) 데코레이터가 붙어있는 메서드에
    // @stream({ path: "/api/v1/users/stream" }) 같은 것이 붙어 있는 상황입니다.
    // 이렇게 되면 두 데코레이터가 같은 api의 path 필드를 건드리게 되므로, 에러를 터뜨려줍니다.
    throw new Error(
      `@${decoratorName} decorator on ${modelName}.${methodName} has conflicting path: ${newPath}. The decorator is trying to override the existing path(${existingPath}) with the new path(${newPath}).`,
    );
  }
}

/**
 * 기존의 옵션과 새로운 옵션이 겹치는 부분이 있다면 에러를 터뜨려줍니다.
 * @param decoratorName 데코레이터 이름
 * @param modelName 모델 이름
 * @param methodName 메서드 이름
 * @param existingOptions 기존의 옵션
 * @param newOptions 새로운 옵션
 */
function assertNoConflictingOptions<ExistingOptions extends object, NewOptions extends object>(
  decoratorName: string,
  modelName: string,
  methodName: string,
  existingOptions: ExistingOptions,
  newOptions: NewOptions,
) {
  const existingEntries = new Map(Object.entries(existingOptions));
  Object.entries(newOptions).forEach(([key, newValue]) => {
    const existingValue = existingEntries.get(key);
    if (existingValue && !isEqual(existingValue, newValue)) {
      // 이것이 무슨 상황이냐면요, api.options가 덮어씌워지는 상황입니다.
      // 가령 @api({ resourceName: "Users" }) 데코레이터가 붙어있는 메서드에
      // @stream({ resourceName: "Posts" }) 같은 것이 붙어 있는 상황입니다.
      // 이렇게 되면 두 데코레이터가 같은 api의 options 속 같은 필드를 건드리게 되므로, 에러를 터뜨려줍니다.
      throw new Error(
        `@${decoratorName} decorator on ${modelName}.${methodName} has conflicting options: ${key}. The decorator is trying to override the existing option(${JSON.stringify(existingValue)}) with the new option(${JSON.stringify(newValue)}).`,
      );
    }
  });
}
