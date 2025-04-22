import { HTTPMethods } from "fastify";
import inflection from "inflection";
import { ApiParam, ApiParamType } from "../types/types";

export type ServiceClient =
  | "axios"
  | "axios-multipart"
  | "swr"
  | "socketio"
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
export const registeredApis: {
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
}[] = [];
export type ExtendedApi = {
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
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

    const api = {
      modelName,
      methodName,
      path: options.path ?? defaultPath,
      options,
    };
    registeredApis.push(api);
  };
}
