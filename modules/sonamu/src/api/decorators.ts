import type { HTTPMethods } from "fastify";
import inflection from "inflection";
import type { ApiParam, ApiParamType } from "../types/types";
import { z } from "zod";
import { PuriWrapper, TransactionalOptions } from "../database/puri-wrapper";
import { DB } from "../database/db";
import { Sonamu } from "./sonamu";
import type { UploadContext } from "./context";

export interface GuardKeys {
  query: true;
  admin: true;
  user: true;
}
export type GuardKey = keyof GuardKeys;
export type ServiceClient =
  | "axios"
  | "axios-multipart"
  | "swr"
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
};
export type StreamDecoratorOptions = {
  type: "sse"; // | 'ws
  events: z.ZodObject<any>;
  path?: string;
  resourceName?: string;
  guards?: GuardKey[];
  description?: string;
};
export const registeredApis: {
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
  streamOptions?: StreamDecoratorOptions;
}[] = [];
export type ExtendedApi = {
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
  streamOptions?: StreamDecoratorOptions;
  typeParameters: ApiParamType.TypeParam[];
  parameters: ApiParam[];
  returnType: ApiParamType;
};

export function api(options: ApiDecoratorOptions = {}) {
  options = {
    httpMethod: "GET",
    contentType: "application/json",
    clients: ["axios"],
    ...options,
  };

  return function (target: Object, propertyKey: string) {
    const modelName = target.constructor.name.match(/(.+)Class$/)![1];
    const methodName = propertyKey;

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true
    )}/${inflection.camelize(propertyKey, true)}`;

    // 기존 동일한 메서드가 있는지 확인 후 있는 경우 override
    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName
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
  return function (target: Object, propertyKey: string) {
    const modelName = target.constructor.name.match(/(.+)Class$/)![1];
    const methodName = propertyKey;

    const defaultPath = `/${inflection.camelize(
      modelName.replace(/Model$/, "").replace(/Frame$/, ""),
      true
    )}/${inflection.camelize(propertyKey, true)}`;

    const existingApi = registeredApis.find(
      (api) => api.modelName === modelName && api.methodName === methodName
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
  const { isolation, dbPreset = "w" } = options;

  return function (
    _target: Object,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
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
        const puri = this.getPuri(dbPreset);

        return puri.transaction(
          async (trx: PuriWrapper) => {
            // TransactionContext에 트랜잭션 저장
            DB.getTransactionContext().setTransaction(dbPreset, trx);

            try {
              return await originalMethod.apply(this, args);
            } finally {
              // 트랜잭션 제거
              DB.getTransactionContext().deleteTransaction(dbPreset);
            }
          },
          { isolation }
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

export function upload() {
  return function (
    _target: Object,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const { request } = Sonamu.getContext();
      const uploadContext: UploadContext = {
        file: undefined,
        files: [],
      };

      const storage = Sonamu.storage;
      if (!storage) {
        throw new Error("Storage가 설정되지 않았습니다.");
      }

      if (request.file) {
        const rawFile = await request.file();
        if (rawFile) {
          const { FileStorage } = await import("./file-storage");
          uploadContext.file = new FileStorage(rawFile, storage);
        }
      }

      if (request.files) {
        const { FileStorage } = await import("./file-storage");
        const rawFilesIterator = request.files();
        for await (const rawFile of rawFilesIterator) {
          if (rawFile) {
            uploadContext.files.push(new FileStorage(rawFile, storage));
          }
        }
      }

      return Sonamu.uploadStorage.run({ uploadContext }, () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}
