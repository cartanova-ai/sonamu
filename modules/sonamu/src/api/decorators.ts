import type { HTTPMethods } from "fastify";
import inflection from "inflection";
import type { ApiParam, ApiParamType } from "../types/types";
import { z } from "zod";

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
  guards?: string[];
  description?: string;
};
export type StreamDecoratorOptions = {
  type: "sse"; // | 'ws
  events: z.ZodObject<any>;
  path?: string;
  resourceName?: string;
  guards?: string[];
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
