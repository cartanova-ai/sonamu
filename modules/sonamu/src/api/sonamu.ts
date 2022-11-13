import chalk from "chalk";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { IncomingMessage, Server, ServerResponse } from "http";
import { ZodError } from "zod";
import { getZodObjectFromApi } from "./code-converters";
import { Context } from "./context";
import { BadRequestException } from "../exceptions/so-exceptions";
import { SMDManager } from "../smd/smd-manager";
import { fastifyCaster } from "./caster";
import { ApiParam, ApiParamType } from "../types/types";
import { Syncer } from "../syncer/syncer";
import { isLocal } from "../utils/controller";
import { DB, SonamuDBConfig } from "../database/db";
import { BaseModel } from "../database/base-model";
import { findApiRootPath } from "../utils/utils";
import path from "path";
import { existsSync, readFileSync } from "fs";
import { ApiDecoratorOptions } from "./decorators";

export type SonamuConfig = {
  api: {
    dir: string;
  };
  sync: {
    targets: string[];
  };
  route: {
    prefix: string;
  };
};
type SonamuFastifyConfig = {
  contextProvider: (
    defaultContext: Pick<Context, "headers" | "reply">,
    request: FastifyRequest,
    reply: FastifyReply
  ) => Context;
  guardHandler: (
    guard: string,
    request: FastifyRequest,
    api: {
      typeParameters: ApiParamType.TypeParam[];
      parameters: ApiParam[];
      returnType: ApiParamType;
      modelName: string;
      methodName: string;
      path: string;
      options: ApiDecoratorOptions;
    }
  ) => void;
};
class SonamuClass {
  public isInitialized: boolean = false;

  private _apiRootPath: string | null = null;
  set apiRootPath(apiRootPath: string) {
    this._apiRootPath = apiRootPath;
  }
  get apiRootPath(): string {
    if (this._apiRootPath === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this._apiRootPath!;
  }
  get appRootPath(): string {
    return this.apiRootPath.split(path.sep).slice(0, -1).join(path.sep);
  }

  private _dbConfig: SonamuDBConfig | null = null;
  set dbConfig(dbConfig: SonamuDBConfig) {
    this._dbConfig = dbConfig;
  }
  get dbConfig(): SonamuDBConfig {
    if (this._dbConfig === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this._dbConfig!;
  }

  private _syncer: Syncer | null = null;
  set syncer(syncer: Syncer) {
    this._syncer = syncer;
  }
  get syncer(): Syncer {
    if (this._syncer === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this._syncer!;
  }

  private _config: SonamuConfig | null = null;
  set config(config: SonamuConfig) {
    this._config = config;
  }
  get config(): SonamuConfig {
    if (this._config === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this._config;
  }

  async init() {
    if (this.isInitialized) {
      return;
    }
    console.time(chalk.cyan("Sonamu.init"));

    this.apiRootPath = await findApiRootPath();
    const configPath = path.join(this.apiRootPath, "sonamu.config.json");
    if (existsSync(configPath) === false) {
      throw new Error(`Cannot find sonamu.config.json in ${configPath}`);
    }
    this.config = JSON.parse(
      readFileSync(configPath).toString()
    ) as SonamuConfig;

    // DB 로드
    this.dbConfig = await DB.readKnexfile();
    console.log(chalk.green("DB Config Loaded!"));

    // SMD 로드
    await SMDManager.autoload();

    // Syncer
    this.syncer = new Syncer();

    // Autoload: SMD / Models / Types / APIs
    await this.syncer.autoloadModels();
    await this.syncer.autoloadTypes();
    await this.syncer.autoloadApis();

    if (isLocal()) {
      await this.syncer.sync();
    }

    this.isInitialized = true;
    console.timeEnd(chalk.cyan("Sonamu.init"));
  }

  async withFastify(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    config: SonamuFastifyConfig
  ) {
    if (this.isInitialized === false) {
      await this.init();
    }

    // 전체 라우팅 리스트
    server.get(
      `${this.config.route.prefix}/routes`,
      async (_request, _reply): Promise<any> => {
        return this.syncer.apis;
      }
    );

    // Healthcheck API
    server.get(
      `${this.config.route.prefix}/healthcheck`,
      async (_request, _reply): Promise<string> => {
        return "ok";
      }
    );

    // API 라우팅 등록
    this.syncer.apis.map((api) => {
      // model
      if (this.syncer.models[api.modelName] === undefined) {
        throw new Error(`정의되지 않은 모델에 접근 ${api.modelName}`);
      }
      const model = this.syncer.models[api.modelName];

      // 파라미터 정보로 zod 스키마 빌드
      const ReqType = getZodObjectFromApi(api, this.syncer.types);

      // route
      server.route({
        method: api.options.httpMethod!,
        url: this.config.route.prefix + api.path,
        handler: async (request, reply): Promise<unknown> => {
          (api.options.guards ?? []).every((guard) =>
            config.guardHandler(guard, request, api)
          );

          // request 파싱
          const which = api.options.httpMethod === "GET" ? "query" : "body";
          let reqBody: {
            [key: string]: unknown;
          };
          try {
            reqBody = fastifyCaster(ReqType).parse(request[which] ?? {});
          } catch (e) {
            if (e instanceof ZodError) {
              // TODO: BadRequest 에러 핸들링 (ZodError issues를 humanize하여 출력하는 로직 필요)
              throw new BadRequestException(
                `${(e as ZodError).issues[0].message}`,
                e.errors
              );
            } else {
              throw e;
            }
          }

          // 결과
          const result = await (model as any)[api.methodName].apply(
            model,
            api.parameters.map((param) => {
              // Context 인젝션
              if (ApiParamType.isContext(param.type)) {
                return config.contextProvider(
                  {
                    headers: request.headers,
                    reply,
                  },
                  request,
                  reply
                );
              } else {
                return reqBody[param.name];
              }
            })
          );
          reply.type(api.options.contentType ?? "application/json");
          return result;
        },
      }); // END server.route
    });
  }

  async destroy(): Promise<void> {
    await BaseModel.destroy();
  }
}
export const Sonamu = new SonamuClass();
