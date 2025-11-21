import { AsyncLocalStorage } from "async_hooks";
import { readFile } from "fs/promises";
import path from "path";
import assert from "assert";
import type { FSWatcher } from "chokidar";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";
import type { ZodObject } from "zod";
import type { SonamuDBConfig } from "../database/db";
import type { Driver } from "../file-storage/driver";
import type { Syncer } from "../syncer/syncer";
import type { SonamuFastifyConfig } from "../types/types";
import { formatInTimeZone } from "../utils/utils";
import type { AuthContext, Context, UploadContext } from "./context";
import type { ExtendedApi } from "./decorators";
import type { SonamuConfig, SonamuServerOptions } from "./config";
import type { AbsolutePath } from "../utils/path-utils";

// 눈물을 머금고 fastify 정적 import..
// fastify, @fastify/passport가 둘다 동적으로 import되면 문제가 생김..
import fastify from "fastify";
import fastifyPassport from "@fastify/passport";

export type SonamuSecrets = {
  [key: string]: string;
};
class SonamuClass {
  public isInitialized: boolean = false;
  public asyncLocalStorage: AsyncLocalStorage<{
    context: Context;
  }> = new AsyncLocalStorage();

  public uploadStorage: AsyncLocalStorage<{
    uploadContext: UploadContext;
  }> = new AsyncLocalStorage();

  public getContext(): Context {
    const store = this.asyncLocalStorage.getStore();
    if (store?.context) {
      return store.context;
    }

    if (process.env.NODE_ENV === "test") {
      // 테스팅 환경에서 컨텍스트가 주입되지 않은 경우 빈 컨텍스트 리턴
      return {
        request: null,
        reply: null,
        headers: {},
        createSSE: () => {},
        naiteStore: new Map<string, any>(),
      } as unknown as Context;
    } else {
      throw new Error("Sonamu cannot find context");
    }
  }

  public getUploadContext(): UploadContext {
    const store = this.uploadStorage.getStore();
    if (store?.uploadContext) {
      return store.uploadContext;
    }
    throw new Error(
      "Sonamu cannot find upload context. Did you use @upload decorator?"
    );
  }

  private _apiRootPath: AbsolutePath | null = null;
  set apiRootPath(apiRootPath: AbsolutePath) {
    this._apiRootPath = apiRootPath;
  }
  get apiRootPath(): AbsolutePath {
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

  private _storage: Driver | null = null;
  set storage(storage: Driver) {
    this._storage = storage;
  }
  get storage(): Driver | null {
    return this._storage;
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
    apiRootPath?: AbsolutePath,
    forTesting: boolean = false
  ) {
    if (this.isInitialized) {
      return;
    }

    if (!doSilent) {
      const chalk = (await import("chalk")).default;
      console.time(
        chalk.cyan(`Sonamu.init${forTesting ? " for testing" : ""}`)
      );
    }

    // API 루트 패스
    const { findApiRootPath } = await import("../utils/utils");
    this.apiRootPath = apiRootPath ?? findApiRootPath();
    const { loadConfig } = await import("./config");
    this.config = await loadConfig(this.apiRootPath);
    const secretsPath = path.join(this.apiRootPath, "sonamu.secrets.json");
    const { exists } = await import("../utils/fs-utils");
    if (await exists(secretsPath)) {
      this.secrets = JSON.parse(
        (await readFile(secretsPath)).toString()
      ) as SonamuSecrets;
    }

    // DB 로드
    const { DB } = await import("../database/db");
    this.dbConfig = DB.generateDBConfig(this.config.database);
    if (!doSilent) {
      const chalk = (await import("chalk")).default;
      console.log(chalk.green("DB Config Loaded!"));
    }
    const { attachOnDuplicateUpdate } = await import(
      "../database/knex-plugins/knex-on-duplicate-update"
    );
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
    await this.syncer.autoloadTypes();
    await this.syncer.autoloadModels();
    await this.syncer.autoloadApis();

    const { Template } = await import("../template");
    await Template.autoload();

    const { isLocal, isTest } = await import("../utils/controller");
    const { isHotReloadServer } = await import("../utils/esm-utils");
    if (isLocal() && !isTest() && isHotReloadServer() && enableSync) {
      await this.syncer.sync();

      await this.startWatcher();

      this.syncer.syncUI();
    }

    this.isInitialized = true;
    if (!doSilent) {
      const chalk = (await import("chalk")).default;
      console.timeEnd(chalk.cyan("Sonamu.init"));
    }
  }

  async createServer(initOptions?: {
    enableSync?: boolean;
    doSilent?: boolean;
  }) {
    if (this.isInitialized === false) {
      await this.init(initOptions?.doSilent, initOptions?.enableSync);
    }

    const options = this.config.server;
    const server = fastify(options.fastify);
    this.server = server;

    // Storage 설정 저장
    if (options.storage) {
      this.storage = options.storage;
    }

    // 플러그인 등록
    if (options.plugins) {
      this.registerPlugins(server, options.plugins);
    }

    if (options.auth) {
      if (!options.plugins?.session) {
        throw new Error(
          "Auth requires session plugin. Please add plugins.session configuration."
        );
      }

      this.registerAuth(server, options.auth);
    }

    // API 라우팅 설정
    await this.withFastify(server, options.apiConfig, {
      enableSync: initOptions?.enableSync,
      doSilent: initOptions?.doSilent,
    });

    // 서버 시작
    await this.boot(server, options);

    return server;
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
    const timezone = this.config.api.timezone;
    if (timezone) {
      const DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX";
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
      if (!options?.doSilent) {
        const chalk = (await import("chalk")).default;
        console.log(chalk.green(`Timezone set to ${timezone}`));
      }
    }

    // 전체 라우팅 리스트
    server.get(
      `${this.config.api.route.prefix}/routes`,
      async (_request, _reply): Promise<any> => {
        return this.syncer.apis;
      }
    );

    // Healthcheck API
    server.get(
      `${this.config.api.route.prefix}/healthcheck`,
      async (_request, _reply): Promise<string> => {
        return "ok";
      }
    );

    // API 라우팅 (로컬HMR 상태와 구분)
    const { isLocal } = await import("../utils/controller");
    if (isLocal()) {
      server.all("*", async (request, reply) => {
        const found = this.syncer.apis.find(
          (api) =>
            this.config.api.route.prefix + api.path ===
              request.url.split("?")[0] &&
            (api.options.httpMethod ?? "GET") === request.method.toUpperCase()
        );
        if (found) {
          return this.getApiHandler(found, config)(request, reply);
        }
        const { NotFoundException } = await import(
          "../exceptions/so-exceptions"
        );
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
          url: this.config.api.route.prefix + api.path,
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
      const { getZodObjectFromApi } = await import("./code-converters");
      const ReqType = getZodObjectFromApi(api, this.syncer.types);

      // request 파싱
      const which = api.options.httpMethod === "GET" ? "query" : "body";
      let reqBody: {
        [key: string]: unknown;
      };
      try {
        const { fastifyCaster } = await import("./caster");
        reqBody = fastifyCaster(ReqType).parse(request[which] ?? {});
      } catch (e) {
        const { ZodError } = await import("zod");
        if (e instanceof ZodError) {
          const { humanizeZodError } = await import("../utils/zod-error");
          const messages = humanizeZodError(e)
            .map((issue) => issue.message)
            .join(" ");
          const { BadRequestException } = await import(
            "../exceptions/so-exceptions"
          );
          throw new BadRequestException(messages, {
            zodError: e,
          });
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

      // createSSEFactory 함수에 미리 request의 socket과 reply를 바인딩.
      const { createSSEFactory } = await import("../stream/sse");
      const createSSE = (<T extends ZodObject>(
        _request: FastifyRequest,
        _reply: FastifyReply,
        _events: T
      ) => createSSEFactory(_request.socket, _reply, _events)).bind(
        null,
        request,
        reply
      );

      const context: Context = {
        ...(await Promise.resolve(
          config.contextProvider(
            {
              request,
              reply,
              headers: request.headers,
              createSSE,
              naiteStore: new Map<string, any>(),
              // auth
              user: request.user ?? null,
              passport: {
                login: request.login.bind(
                  request
                ) as AuthContext["passport"]["login"],
                logout: request.logout.bind(
                  request
                ) as AuthContext["passport"]["logout"],
              },
            },
            request,
            reply
          )
        )),
      };

      const model = this.syncer.models[api.modelName];
      return this.asyncLocalStorage.run({ context }, async () => {
        const { ApiParamType } = await import("../types/types");
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

  async startWatcher(): Promise<void> {
    const watchPath = [
      path.join(this.apiRootPath, "src"),
      path.join(this.apiRootPath, "sonamu.config.ts"),
    ];

    const chokidar = (await import("chokidar")).default;
    this.watcher = chokidar.watch(watchPath, {
      ignored: (path, stats) =>
        !!stats?.isFile() && !path.endsWith(".ts") && !path.endsWith(".json"),
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on("all", async (event: string, filePath: string) => {
      const absolutePath = filePath as AbsolutePath;
      assert(
        absolutePath.startsWith(this.apiRootPath),
        "File path is not within the API root path"
      );

      if (event !== "change" && event !== "add") {
        return;
      }

      try {
        // sonamu.config.ts 변경 시 재시작
        const isConfigTs =
          filePath === path.join(this.apiRootPath, "sonamu.config.ts");

        if (isConfigTs) {
          const relativePath = filePath.replace(this.apiRootPath, "api");
          const chalk = (await import("chalk")).default;
          console.log(
            chalk.bold(
              `Detected(${event}): ${chalk.blue(relativePath)} - Restarting...`
            )
          );
          process.kill(process.pid, "SIGUSR2");
          return;
        }

        await this.handleFileChange(event, absolutePath);
      } catch (e) {
        console.error(e);
      }
    });
  }

  /*
     A function that automatically handles init and destroy when using Sonamu via scripts.    
  */
  async runScript(fn: () => Promise<void>) {
    await this.init(true, false, undefined, false);
    try {
      await fn();
    } finally {
      await this.destroy();
    }
  }

  private registerPlugins(
    server: FastifyInstance,
    plugins: SonamuServerOptions["plugins"]
  ) {
    if (!plugins) {
      return;
    }

    const pluginsModules = {
      cors: "@fastify/cors",
      formbody: "@fastify/formbody",
      multipart: "@fastify/multipart",
      qs: "fastify-qs",
      sse: "fastify-sse-v2",
      static: "@fastify/static",
      session: "@fastify/secure-session",
    } as const;

    const registerPlugin = <K extends keyof NonNullable<typeof plugins>>(
      key: K,
      pluginName: string
    ) => {
      const option = plugins[key];
      if (!option) return;

      if (option === true) {
        server.register(import(pluginName));
      } else {
        server.register(import(pluginName), option);
      }
    };

    Object.entries(pluginsModules).forEach(([key, pluginName]) => {
      registerPlugin(key as keyof typeof plugins, pluginName);
    });

    if (plugins.custom) {
      plugins.custom(server);
    }
  }

  private async registerAuth(
    server: FastifyInstance,
    options: NonNullable<SonamuServerOptions["auth"]>
  ) {
    server.register(fastifyPassport.initialize());
    server.register(fastifyPassport.secureSession());

    if (typeof options === "boolean") {
      fastifyPassport.registerUserSerializer(
        async (user, _request) => user
      );
      fastifyPassport.registerUserDeserializer(
        async (serialized, _request) => serialized
      );
    } else {
      fastifyPassport.registerUserSerializer(options.userSerializer);
      fastifyPassport.registerUserDeserializer(
        options.userDeserializer
      );
    }
  }

  private async boot(server: FastifyInstance, options: SonamuServerOptions) {
    const port = options.listen?.port ?? 3000;
    const host = options.listen?.host ?? "localhost";

    server.addHook("onClose", async () => {
      await options.lifecycle?.onShutdown?.(server);
      await this.destroy();
    });

    const shutdown = async () => {
      try {
        await server.close();
        process.exit(0);
      } catch (err) {
        console.error("Error during shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (options.lifecycle?.onError) {
      server.setErrorHandler(options.lifecycle?.onError);
    }

    server
      .listen({ port, host })
      .then(async () => {
        await options.lifecycle?.onStart?.(server);
      })
      .catch(async (err) => {
        const chalk = (await import("chalk")).default;
        console.error(chalk.red("Failed to start server:", err));
        await shutdown();
      });
  }

  private async handleFileChange(
    event: string,
    filePath: AbsolutePath
  ): Promise<void> {
    // 첫 번째 파일이면 HMR 시작 시간 기록
    if (this.pendingFiles.length === 0) {
      this.hmrStartTime = Date.now();
    }
    this.pendingFiles.push(filePath);

    const relativePath = path.relative(this.apiRootPath, filePath);
    const chalk = (await import("chalk")).default;
    console.log(
      chalk.bold(
        `Detected(${event}): ${chalk.blue(relativePath)}`
      )
    );

    await this.syncer.syncFromWatcher(event, filePath);

    // 처리 완료된 파일을 대기 목록에서 제거
    this.pendingFiles = this.pendingFiles.slice(1);

    // 모든 파일 처리가 완료되면 최종 메시지 출력
    if (this.pendingFiles.length === 0) {
      await this.finishHMR();
    }
  }

  private async finishHMR(): Promise<void> {
    await this.syncer.renewChecksums();

    const endTime = Date.now();
    const totalTime = endTime - this.hmrStartTime;
    const [chalk, { centerText }] = await Promise.all([
      (await import("chalk")).default,
      import("../utils/console-util"),
    ]);
    const msg = `HMR Done! ${chalk.bold.white(`${totalTime}ms`)}`;

    console.log(chalk.black.bgGreen(centerText(msg)));
  }

  async destroy(): Promise<void> {
    const { BaseModel } = await import("../database/base-model");
    await BaseModel.destroy();
    await this.watcher?.close();
    this.storage?.destroy();
  }
}
export const Sonamu = new SonamuClass();
