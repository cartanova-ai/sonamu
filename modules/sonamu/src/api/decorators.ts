import assert from "assert";
import type { HTTPMethods } from "fastify";
import inflection from "inflection";
import type { z } from "zod";
import type { BaseModelClass } from "../database/base-model";
import { DB } from "../database/db";
import {
  PuriTransactionWrapper,
  type PuriWrapper,
  type TransactionalOptions,
} from "../database/puri-wrapper";
import type { ApiParam, ApiParamType } from "../types/types";
import type { UploadContext } from "./context";
import { Sonamu } from "./sonamu";

export interface GuardKeys {
  query: true;
  admin: true;
  user: true;
}
export type GuardKey = keyof GuardKeys;
export type ServiceClient = "axios" | "axios-multipart" | "swr" | "window-fetch";
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

export function api(options: ApiDecoratorOptions = {}) {
  options = {
    httpMethod: "GET",
    contentType: "application/json",
    clients: ["axios"],
    ...options,
  };

  return (target: DecoratorTarget, propertyKey: string) => {
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
    assert(
      modelName,
      `modelName is required on @api decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true,
    )}/${inflection.camelize(propertyKey, true)}`;

    // 기존 동일한 메서드가 있는지 확인 후 있는 경우 override
    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName,
    );
    if (existingApi) {
      existingApi.options = options;
    } else {
      registeredApis.push({
        modelName,
        methodName,
        path: options.path ?? defaultPath,
        options,
      });
    }
  };
}

export function stream(options: StreamDecoratorOptions) {
  return (target: DecoratorTarget, propertyKey: string) => {
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
    assert(
      modelName,
      `modelName is required on @stream decorator on ${target.constructor.name}.${propertyKey}`,
    );
    const methodName = propertyKey;

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true,
    )}/${inflection.camelize(propertyKey, true)}`;

    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName,
    );
    if (existingApi) {
      existingApi.options = options;
    } else {
      registeredApis.push({
        modelName,
        methodName,
        path: options.path ?? defaultPath,
        options: {
          ...options,
          httpMethod: "GET",
        },
        streamOptions: options,
      });
    }
  };
}

export function transactional(options: TransactionalOptions = {}) {
  const { isolation, readOnly, dbPreset = "w" } = options;

  return (_target: DecoratorTarget, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: BaseModelClass, ...args: unknown[]) {
      const existingContext = DB.transactionStorage.getStore();

      // 이미 AsyncLocalStorage 컨텍스트 안에 있는지 확인
      if (existingContext) {
        // 해당 preset의 트랜잭션이 이미 있으면 재사용
        if (existingContext.getTransaction(dbPreset)) {
          return originalMethod.apply(this, args);
        }
      }

      // AsyncLocalStorage 컨텍스트 없거나 해당 preset의 트랜잭션이 없으면 새로 시작
      const startTransaction = async () => {
        const puri = this.getPuri(dbPreset) as PuriWrapper;

        return puri.knex.transaction(
          async (trx) => {
            const trxWrapper = new PuriTransactionWrapper(trx, this.getUpsertBuilder());
            // TransactionContext에 트랜잭션 저장
            DB.getTransactionContext().setTransaction(dbPreset, trxWrapper);

            try {
              return await originalMethod.apply(this, args);
            } finally {
              // 트랜잭션 제거
              DB.getTransactionContext().deleteTransaction(dbPreset);
            }
          },
          { isolationLevel: isolation, readOnly },
        );
      };

      // AsyncLocalStorage 컨텍스트가 없으면 새로 생성
      if (!existingContext) {
        return DB.runWithTransaction(startTransaction);
      } else {
        // 컨텍스트는 있지만 이 preset의 트랜잭션은 없는 경우 (같은 컨텍스트 내에서 실행)
        return startTransaction();
      }
    };

    return descriptor;
  };
}

export function upload(options: UploadDecoratorOptions = {}) {
  return (_target: DecoratorTarget, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const modelName = _target.constructor.name.match(/(.+)Class$/)?.[1];
    assert(
      modelName,
      `modelName is required on @upload decorator on ${_target.constructor.name}.${_propertyKey}`,
    );
    const methodName = _propertyKey;

    // registeredApis에서 해당 API 찾아서 uploadOptions 추가
    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName,
    );
    if (existingApi) {
      existingApi.uploadOptions = options;
    }

    descriptor.value = async function (this: BaseModelClass, ...args: unknown[]) {
      const { request } = Sonamu.getContext();
      const uploadContext: UploadContext = {
        file: undefined,
        files: [],
      };

      const storage = Sonamu.storage;
      if (!storage) {
        throw new Error("Storage가 설정되지 않았습니다.");
      }

      const { FileStorage } = await import("../file-storage/file-storage");
      if (options.mode === "multiple") {
        const rawFilesIterator = request.files();
        for await (const rawFile of rawFilesIterator) {
          if (rawFile) {
            await rawFile.toBuffer();
            uploadContext.files.push(new FileStorage(rawFile, storage));
          }
        }
      } else {
        const rawFile = await request.file();
        if (rawFile) {
          uploadContext.file = new FileStorage(rawFile, storage);
        }
      }

      return Sonamu.uploadStorage.run({ uploadContext }, () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}
