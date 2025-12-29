import { getLogger } from "@logtape/logtape";
import assert from "assert";
import type { HTTPMethods } from "fastify";
import inflection from "inflection";
import { isEqual } from "radashi";
import type { z } from "zod";
import { BaseModelClass } from "../database/base-model";
import { DB } from "../database/db";
import {
  PuriTransactionWrapper,
  type PuriWrapper,
  type TransactionalOptions,
} from "../database/puri-wrapper";
import { UpsertBuilder } from "../database/upsert-builder";
import { convertDomainToCategory } from "../logger/category";
import type { ApiParam, ApiParamType } from "../types/types";
import { BaseFrameClass } from "./base-frame";
import type { UploadContext } from "./context";
import { Sonamu } from "./sonamu";

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
};
export type StreamDecoratorOptions = {
  type: "sse"; // | 'ws
  // biome-ignore lint/suspicious/noExplicitAny: 이벤트 키별로 넘겨주는 값이므로 어떤 타입이든 상관없음
  events: z.ZodObject<any>;
  path?: string;
  resourceName?: string;
  guards?: GuardKey[];
  description?: string;
};
export type UploadDecoratorOptions = {
  mode?: "single" | "multiple";
};
export const registeredApis: {
  /**
   * modelName은 모델 클래스 이름입니다. (ex. "UserModel")
   */
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
  streamOptions?: StreamDecoratorOptions;
  uploadOptions?: UploadDecoratorOptions;
}[] = [];
export type ExtendedApi = {
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
  streamOptions?: StreamDecoratorOptions;
  uploadOptions?: UploadDecoratorOptions;
  typeParameters: ApiParamType.TypeParam[];
  parameters: ApiParam[];
  returnType: ApiParamType;
};
type DecoratorTarget = { constructor: { name: string } };

const DECORATOR_TYPES = {
  API: Symbol("api"),
  STREAM: Symbol("stream"),
} as const;

function checkSingleDecorator(target: DecoratorTarget, propertyKey: string, decoratorType: symbol) {
  const method = target[propertyKey as keyof typeof target] as { __decoratorType?: symbol };
  if (method?.__decoratorType && method?.__decoratorType !== decoratorType) {
    throw new Error(
      `@${String(decoratorType)} decorator can only be used once on ${target.constructor.name}.${propertyKey}. You can use only one of @api or @stream decorator on the same method.`,
    );
  } else {
    method.__decoratorType = decoratorType;
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
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
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
      (api) => api.modelName === modelName && api.methodName === methodName,
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
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
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
    const optionsWithDefaults = {
      ...options,
      httpMethod: "GET" as HTTPMethods,
    };

    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName,
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

export function transactional(options: TransactionalOptions = {}) {
  const { isolation, readOnly, dbPreset = "w" } = options;

  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
    assert(
      modelName,
      `modelName is required on @stream decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    descriptor.value = async function (this: BaseModelClass, ...args: unknown[]) {
      this.logger.debug("transactional: {model}.{method}", {
        model: modelName,
        method: methodName,
      });

      const existingContext = DB.transactionStorage.getStore();

      // AsyncLocalStorage 컨텍스트 없거나 해당 preset의 트랜잭션이 없으면 새로 시작
      const startTransaction = async () => {
        const puri = this.getPuri(dbPreset) as PuriWrapper;

        return puri.knex.transaction(
          async (trx) => {
            this.logger.debug("new transaction context: {dbPreset}", { dbPreset });
            const trxWrapper = new PuriTransactionWrapper(trx, new UpsertBuilder());
            // TransactionContext에 트랜잭션 저장
            DB.getTransactionContext().setTransaction(dbPreset, trxWrapper);

            try {
              return await originalMethod.apply(this, args);
            } finally {
              // 트랜잭션 제거
              this.logger.debug("delete transaction context: {dbPreset}", { dbPreset });
              DB.getTransactionContext().deleteTransaction(dbPreset);
            }
          },
          { isolationLevel: isolation, readOnly },
        );
      };

      // AsyncLocalStorage 컨텍스트가 없으면 새로 생성
      if (!existingContext) {
        return DB.runWithTransaction(startTransaction);
      }

      // 이미 AsyncLocalStorage 컨텍스트 안에 있는지 확인 후 해당 preset의 트랜잭션이 이미 있으면 재사용
      if (existingContext?.getTransaction(dbPreset)) {
        this.logger.debug("reuse transaction context: {dbPreset}", { dbPreset });
        return originalMethod.apply(this, args);
      }

      // 컨텍스트는 있지만 이 preset의 트랜잭션은 없는 경우 (같은 컨텍스트 내에서 실행)
      return startTransaction();
    };

    return descriptor;
  };
}

/**
 * api 데코레이터와 함께 사용할 수 있습니다.
 * @param options
 * @returns
 */
export function upload(options: UploadDecoratorOptions = {}) {
  return (target: DecoratorTarget, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
    assert(
      modelName,
      `modelName is required on @upload decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    // registeredApis에서 해당 API 찾아서 uploadOptions 추가
    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName,
    );
    if (existingApi) {
      existingApi.uploadOptions = options;
    } else {
      // 이 메소드에 붙은 @api 데코레이터가 아직 eval되지 않은 상황입니다. (만약 @api가 안 붙어 있었다면 심각한 상황입니다..!)
      // 여기에서 최초로 modelName과 methodName에 대해 registeredApis에 하나를 추가해주어야 합니다.
      // uploadOptions는 그대로 추가하고, path는 빈 스트링으로 추가해줍니다.
      // 이후 @api 데코레이터가 eval되면 실제 path로 덮어씌워지고, options가 추가됩니다.
      registeredApis.push({
        modelName,
        methodName,
        path: "",
        options: {},
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

      const { request } = Sonamu.getContext();
      const uploadContext: UploadContext = {
        file: undefined,
        files: [],
      };

      const { UploadedFile } = await import("../storage/uploaded-file");
      if (options.mode === "multiple") {
        const rawFilesIterator = request.files();
        for await (const rawFile of rawFilesIterator) {
          if (rawFile) {
            await rawFile.toBuffer();
            uploadContext.files.push(new UploadedFile(rawFile));
          }
        }
      } else {
        const rawFile = await request.file();
        if (rawFile) {
          uploadContext.file = new UploadedFile(rawFile);
        }
      }

      return Sonamu.uploadStorage.run({ uploadContext }, () => {
        return originalMethod.apply(this, args);
      });
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
function assertNoConflictingOptions(
  decoratorName: string,
  modelName: string,
  methodName: string,
  // biome-ignore lint/suspicious/noExplicitAny: <아 쉽게쉽게 좀 갑시다>
  existingOptions: Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: <이럴 때 아니면 any 언제 씁니까>
  newOptions: Record<string, any>,
) {
  Object.keys(newOptions).forEach((key) => {
    if (existingOptions[key] && !isEqual(existingOptions[key], newOptions[key])) {
      // 이것이 무슨 상황이냐면요, api.options가 덮어씌워지는 상황입니다.
      // 가령 @api({ resourceName: "Users" }) 데코레이터가 붙어있는 메서드에
      // @stream({ resourceName: "Posts" }) 같은 것이 붙어 있는 상황입니다.
      // 이렇게 되면 두 데코레이터가 같은 api의 options 속 같은 필드를 건드리게 되므로, 에러를 터뜨려줍니다.
      throw new Error(
        `@${decoratorName} decorator on ${modelName}.${methodName} has conflicting options: ${key}. The decorator is trying to override the existing option(${JSON.stringify(existingOptions[key])}) with the new option(${JSON.stringify(newOptions[key])}).`,
      );
    }
  });
}
