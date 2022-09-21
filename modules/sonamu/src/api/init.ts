import chalk from "chalk";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { IncomingMessage, Server, ServerResponse } from "http";
import { ZodError } from "zod";
import { getZodObjectFromApi } from "./code-converters";
import { Context } from "./context";
import { BadRequestException } from "../exceptions/so-exceptions";
import { SMDManager } from "../smd/smd-manager";
import { fastifyCaster } from "../api/caster";
import { ApiParamType } from "../types/types";
import { Syncer } from "../syncer/syncer";
import { isLocal } from "../utils/controller";
import { DB } from "../database/db";
import { BaseModel } from "../database/base-model";

export type SonamuInitConfig = {
  prefix: string;
  appRootPath: string;
  syncTargets: string[];
  contextProvider: (
    defaultContext: Pick<Context, "headers" | "reply">,
    request: FastifyRequest,
    reply: FastifyReply
  ) => Context;
};
export async function init(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  config: SonamuInitConfig
) {
  // 전체 라우팅 리스트
  server.get(
    `${config.prefix}/routes`,
    async (_request, _reply): Promise<any> => {
      return apis;
    }
  );

  // Healthcheck API
  server.get(
    `${config.prefix}/healthcheck`,
    async (_request, _reply): Promise<string> => {
      return "ok";
    }
  );

  // Syncer
  const syncer = Syncer.getInstance({
    appRootPath: config.appRootPath,
    targets: config.syncTargets,
  });

  // DB 설정파일 확인
  await DB.readKnexfile();
  console.log(chalk.green("DB Config Loaded!"));

  // Autoload: SMD / Models / Types / APIs
  console.time(chalk.cyan("autoload&sync:"));
  await SMDManager.autoload();
  const importedModels = await syncer.autoloadModels(config.appRootPath);
  const references = await syncer.autoloadTypes(config.appRootPath);
  const apis = await syncer.autoloadApis(config.appRootPath);
  if (isLocal()) {
    await syncer.sync();
  }
  console.timeEnd(chalk.cyan("autoload&sync:"));

  // API 라우팅 등록
  apis.map((api) => {
    // model
    if (importedModels[api.modelName] === undefined) {
      throw new Error(`정의되지 않은 모델에 접근 ${api.modelName}`);
    }
    const model = importedModels[api.modelName];

    // 파라미터 정보로 zod 스키마 빌드
    const ReqType = getZodObjectFromApi(api, references);

    // route
    server.route({
      method: api.options.httpMethod!,
      url: config.prefix + api.path,
      handler: async (request, reply): Promise<unknown> => {
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

export async function destroy(): Promise<void> {
  await BaseModel.destroy();
}
