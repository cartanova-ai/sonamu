import path from "path";
import fs from "fs";
import { AsyncLocalStorage } from "async_hooks";
import chalk from "chalk";

import { ZodError } from "zod";
import { getZodObjectFromApi } from "./code-converters";
import {
  BadRequestException,
  NotFoundException,
} from "../exceptions/so-exceptions";
import { humanizeZodError } from "../utils/zod-error";
import { fastifyCaster } from "./caster";
import { ApiParam, ApiParamType } from "../types/types";
import { isLocal, isTest } from "../utils/controller";
import { findApiRootPath } from "../utils/utils";
import { DB, SonamuDBConfig } from "../database/db";
import { attachOnDuplicateUpdate } from "../database/knex-plugins/knex-on-duplicate-update";
import type { ApiDecoratorOptions, ExtendedApi } from "./decorators";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";
import type { Context } from "./context";
import type { Syncer } from "../syncer/syncer";
import type { FSWatcher } from "chokidar";
import { formatInTimeZone } from "date-fns-tz";

export type SonamuConfig = {
  projectName?: string;
  api: {
    dir: string;
  };
  sync: {
    targets: string[];
  };
  route: {
    prefix: string;
  };
  timezone?: string;
};
export type SonamuSecrets = {
  [key: string]: string;
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
  cache?: {
    get: (key: string) => Promise<unknown | null>;
    put: (key: string, value: unknown, ttl?: number) => Promise<void>;
    resolveKey: (
      path: string,
      reqBody: {
        [key: string]: unknown;
      }
    ) =>
      | {
          cache: false;
        }
      | {
          cache: true;
          key: string;
          ttl?: number;
        };
  };
};
class SonamuClass {
  public isInitialized: boolean = false;
  public asyncLocalStorage: AsyncLocalStorage<{
    context: Context;
  }> = new AsyncLocalStorage();

  public getContext(): Context {
    const store = this.asyncLocalStorage.getStore();
    if (store?.context) {
      return store.context;
    }
    throw new Error("Sonamu cannot find context");
  }

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

  private _secrets: SonamuSecrets | null = null;
  set secrets(secrets: SonamuSecrets) {
    this._secrets = secrets;
  }
  get secrets(): SonamuSecrets | null {
    return this._secrets;
  }

  // HMR 처리
  public watcher: FSWatcher | null = null;
  private pendingFiles: string[] = [];
  private hmrStartTime: number = 0;

  public server: FastifyInstance | null = null;

  async initForTesting() {
    await this.init(true, false, undefined, true);
  }

  async init(
    doSilent: boolean = false,
    enableSync: boolean = true,
    apiRootPath?: string,
    forTesting: boolean = false
  ) {
    if (this.isInitialized) {
      return;
    }
    !doSilent &&
      console.time(
        chalk.cyan(`Sonamu.init${forTesting ? " for testing" : ""}`)
      );

    // API 루트 패스
    this.apiRootPath = apiRootPath ?? (await findApiRootPath());
    const configPath = path.join(this.apiRootPath, "sonamu.config.json");
    const secretsPath = path.join(this.apiRootPath, "sonamu.secrets.json");
    if (fs.existsSync(configPath) === false) {
      throw new Error(`Cannot find sonamu.config.json in ${configPath}`);
    }
    this.config = JSON.parse(
      fs.readFileSync(configPath).toString()
    ) as SonamuConfig;
    if (fs.existsSync(secretsPath)) {
      this.secrets = JSON.parse(
        fs.readFileSync(secretsPath).toString()
      ) as SonamuSecrets;
    }

    // DB 로드
    this.dbConfig = await DB.readKnexfile();
    !doSilent && console.log(chalk.green("DB Config Loaded!"));
    attachOnDuplicateUpdate();

    // 테스팅인 경우 엔티티 로드 & 싱크 없이 중단
    if (forTesting) {
      this.isInitialized = true;
      return;
    }

    // Entity 로드
    const { EntityManager } = await import("../entity/entity-manager");
    await EntityManager.autoload(doSilent);

    // Syncer
    const { Syncer } = await import("../syncer/syncer");
    this.syncer = new Syncer();

    // Autoload: Models / Types / APIs
    await this.syncer.autoloadModels();
    await this.syncer.autoloadTypes();
    await this.syncer.autoloadApis();

    if (isLocal() && !isTest() && enableSync) {
      await this.syncer.sync();

      // FIXME: hmr 설정된 경우만 워처 시작
      this.startWatcher();

      this.syncer.syncUI();
    }

    this.isInitialized = true;
    !doSilent && console.timeEnd(chalk.cyan("Sonamu.init"));
  }

  async withFastify(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    config: SonamuFastifyConfig,
    options?: {
      enableSync?: boolean;
      doSilent?: boolean;
    }
  ) {
    if (this.isInitialized === false) {
      await this.init(options?.doSilent, options?.enableSync);
    }

    this.server = server;

    // timezone 설정
    const timezone = this.config.timezone;
    if (timezone) {
      const DATE_FORMAT = "yyyy-MM-dd HH:mm:ssXXX";
      // ISO 8601 날짜 형식 정규식 (예: 2024-01-15T09:30:00.000Z)
      const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

      server.setReplySerializer((payload) => {
        return JSON.stringify(payload, (_key, value) => {
          if (typeof value === "string" && ISO_DATE_REGEX.test(value)) {
            return formatInTimeZone(new Date(value), timezone, DATE_FORMAT);
          }
          return value;
        });
      });
      !options?.doSilent &&
        console.log(chalk.green(`Timezone set to ${timezone}`));
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

    // API 라우팅 (로컬HMR 상태와 구분)
    if (isLocal()) {
      server.all("*", (request, reply) => {
        const found = this.syncer.apis.find(
          (api) =>
            this.config.route.prefix + api.path === request.url.split("?")[0] &&
            (api.options.httpMethod ?? "GET") === request.method.toUpperCase()
        );
        if (found) {
          return this.getApiHandler(found, config)(request, reply);
        }
        throw new NotFoundException("존재하지 않는 API 접근입니다.");
      });
    } else {
      this.syncer.apis.map((api) => {
        // model
        if (this.syncer.models[api.modelName] === undefined) {
          throw new Error(`정의되지 않은 모델에 접근 ${api.modelName}`);
        }

        // route
        server.route({
          method: api.options.httpMethod!,
          url: this.config.route.prefix + api.path,
          handler: this.getApiHandler(api, config),
        }); // END server.route
      });
    }
  }

  getApiHandler(api: ExtendedApi, config: SonamuFastifyConfig) {
    return async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<unknown> => {
      (api.options.guards ?? []).every((guard) =>
        config.guardHandler(guard, request, api)
      );

      // 파라미터 정보로 zod 스키마 빌드
      const ReqType = getZodObjectFromApi(api, this.syncer.types);

      // request 파싱
      const which = api.options.httpMethod === "GET" ? "query" : "body";
      let reqBody: {
        [key: string]: unknown;
      };
      try {
        reqBody = fastifyCaster(ReqType).parse(request[which] ?? {});
      } catch (e) {
        if (e instanceof ZodError) {
          const messages = humanizeZodError(e)
            .map((issue) => issue.message)
            .join(" ");
          throw new BadRequestException(messages);
        } else {
          throw e;
        }
      }

      // Content-Type
      reply.type(api.options.contentType ?? "application/json");

      // 캐시
      const { cacheKey, cacheTtl, cachedData } = await (async () => {
        if (config.cache) {
          try {
            const cacheKeyRes = config.cache.resolveKey(api.path, reqBody);
            if (cacheKeyRes.cache === false) {
              return { cacheKey: null, cachedData: null };
            }

            const cacheKey = cacheKeyRes.key;
            const cacheTtl = cacheKeyRes.ttl;
            const cachedData = await config.cache.get(cacheKey);
            return { cacheKey, cacheTtl, cachedData };
          } catch (e) {
            console.error(e);
          }
          return { cacheKey: null, cachedData: null };
        }
        return { cacheKey: null, cachedData: null };
      })();
      if (cachedData !== null) {
        return cachedData;
      }

      // 결과 (AsyncLocalStorage 적용)
      const context = config.contextProvider(
        {
          headers: request.headers,
          reply,
        },
        request,
        reply
      );
      const model = this.syncer.models[api.modelName];
      return this.asyncLocalStorage.run({ context }, async () => {
        const result = await (model as any)[api.methodName].apply(
          model,
          api.parameters.map((param) => {
            // Context 인젝션
            if (ApiParamType.isContext(param.type)) {
              return context;
            } else {
              return reqBody[param.name];
            }
          })
        );
        reply.type(api.options.contentType ?? "application/json");

        // 캐시 키 있는 경우 갱신 후 저장
        if (config.cache && cacheKey) {
          await config.cache.put(cacheKey, result, cacheTtl);
        }
        return result;
      });
    };
  }

  startWatcher(): void {
    const watchPath = path.join(this.apiRootPath, "src");
    const chokidar = require("chokidar") as typeof import("chokidar");
    this.watcher = chokidar.watch(watchPath, {
      ignored: (path, stats) =>
        (!!stats?.isFile() &&
          !path.endsWith(".ts") &&
          !path.endsWith(".json")) ||
        path.endsWith("src/index.ts"),
      persistent: true,
      ignoreInitial: true,
    });
    this.watcher.on("all", async (event: string, filePath: string) => {
      if (event !== "change" && event !== "add") {
        return;
      }

      await this.handleFileChange(event, filePath);
    });
  }

  private async handleFileChange(
    event: string,
    filePath: string
  ): Promise<void> {
    // 첫 번째 파일이면 HMR 시작 시간 기록
    if (this.pendingFiles.length === 0) {
      this.hmrStartTime = Date.now();
    }

    this.pendingFiles.push(filePath);

    const relativePath = filePath.replace(this.apiRootPath, "api");
    console.log(chalk.bold(`Detected(${event}): ${chalk.blue(relativePath)}`));

    await this.syncer.syncFromWatcher([filePath]);

    // 처리 완료된 파일을 대기 목록에서 제거
    this.pendingFiles = this.pendingFiles.slice(1);

    // 모든 파일 처리가 완료되면 최종 메시지 출력
    if (this.pendingFiles.length === 0) {
      await this.finishHMR();
    }
  }

  private async finishHMR(): Promise<void> {
    await this.syncer.saveChecksums(await this.syncer.getCurrentChecksums());

    const endTime = Date.now();
    const totalTime = endTime - this.hmrStartTime;
    const msg = `HMR Done! ${chalk.bold.white(`${totalTime}ms`)}`;
    const margin = Math.max(0, (process.stdout.columns - msg.length) / 2);

    console.log(
      chalk.black.bgGreen(" ".repeat(margin) + msg + " ".repeat(margin))
    );
  }

  async destroy(): Promise<void> {
    const BaseModel = require("../database/base-model");
    await BaseModel.destroy();
  }
}
export const Sonamu = new SonamuClass();
