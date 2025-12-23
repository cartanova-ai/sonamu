import assert from "assert";
import { AsyncLocalStorage } from "async_hooks";
import type { FSWatcher } from "chokidar";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";
import os from "os";
import path from "path";
import type { ZodObject } from "zod";
import { createMockSSEFactory, DB, isDaemonServer } from "..";
import type { SonamuDBConfig } from "../database/db";
import { Naite } from "../naite/naite";
import type { StorageManager } from "../storage/storage-manager";
import type { Syncer } from "../syncer/syncer";
import type { WorkflowManager } from "../tasks/workflow-manager";
import type { SonamuFastifyConfig } from "../types/types";
import type { AbsolutePath } from "../utils/path-utils";
import type { SonamuConfig, SonamuServerOptions, SonamuTaskOptions } from "./config";
import type { AuthContext, Context, UploadContext } from "./context";
import type { ExtendedApi } from "./decorators";

export type SonamuSecrets = {
  anthropic_api_key?: string;
  voyage_api_key?: string;
  openai_api_key?: string;
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
        createSSE: (schema: ZodObject) => createMockSSEFactory(schema),
        // biome-ignore lint/suspicious/noExplicitAny: 테스팅 환경에서 컨텍스트가 주입되지 않은 경우 빈 컨텍스트 리턴
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
    throw new Error("Sonamu cannot find upload context. Did you use @upload decorator?");
  }

  private _apiRootPath: AbsolutePath | null = null;
  set apiRootPath(apiRootPath: AbsolutePath) {
    this._apiRootPath = apiRootPath;
  }
  get apiRootPath(): AbsolutePath {
    if (this._apiRootPath === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this._apiRootPath;
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
    return this._dbConfig;
  }

  private _syncer: Syncer | null = null;
  set syncer(syncer: Syncer) {
    this._syncer = syncer;
  }
  get syncer(): Syncer {
    if (this._syncer === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this._syncer;
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

  private _storage: StorageManager | null = null;
  /**
   * StorageManager 인스턴스
   */
  get storage(): StorageManager {
    if (!this._storage) {
      throw new Error("Storage has not been initialized. Check storage config.");
    }
    return this._storage;
  }

  private _workflows: WorkflowManager | null = null;
  get workflows(): WorkflowManager {
    if (this._workflows === null) {
      throw new Error("Sonamu has not been initialized");
    }

    return this._workflows;
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
    forTesting: boolean = false,
  ) {
    if (this.isInitialized) {
      return;
    }

    if (!doSilent) {
      const chalk = (await import("chalk")).default;
      console.time(chalk.cyan(`Sonamu.init${forTesting ? " for testing" : ""}`));
    }

    // API 루트 패스
    const { findApiRootPath } = await import("../utils/utils");
    this.apiRootPath = apiRootPath ?? findApiRootPath();

    const { loadConfig } = await import("./config");
    this.config = await loadConfig(this.apiRootPath);
    // sonamu.config.ts 기본값 설정
    this.config.database.database = this.config.database.database ?? "postgresql";

    // API 키 환경변수 로드
    const secrets: SonamuSecrets = {};
    if (process.env.ANTHROPIC_API_KEY) {
      secrets.anthropic_api_key = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.VOYAGE_API_KEY) {
      secrets.voyage_api_key = process.env.VOYAGE_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) {
      secrets.openai_api_key = process.env.OPENAI_API_KEY;
    }
    if (Object.keys(secrets).length > 0) {
      this.secrets = secrets;
    }

    // DB 로드
    const { DB } = await import("../database/db");
    this.dbConfig = DB.generateDBConfig(this.config.database);
    if (!doSilent) {
      const chalk = (await import("chalk")).default;
      console.log(chalk.green("DB Config Loaded!"));
    }

    // Entity 로드
    // 테스트에서도 Entity 정보는 필요합니다.
    // upsert가 제대로 작동하려면 entity의 unique index 정보가 필요하기 때문입니다.
    const { EntityManager } = await import("../entity/entity-manager");
    await EntityManager.autoload(doSilent);

    // 테스팅인 경우 싱크 없이 중단
    if (forTesting) {
      this.isInitialized = true;
      return;
    }

    // Task 등록
    await this.initializeWorkflows(this.config.tasks);

    // Syncer
    const { Syncer } = await import("../syncer/syncer");
    this.syncer = new Syncer();

    // Autoload: Models / Types / APIs
    await this.syncer.autoloadTypes();
    await this.syncer.autoloadModels();
    await this.syncer.autoloadApis();
    await this.syncer.autoloadWorkflows();

    const { TemplateManager } = await import("../template");
    await TemplateManager.autoload();

    const { isLocal, isTest } = await import("../utils/controller");
    if (isLocal()) {
      // 로컬에서는 코드 생성을 위해 Biome 셋업이 필요함 (현재 apiRootPath 전달하여 실행)
      (await import("../utils/formatter")).setupBiome(this.apiRootPath);
    }

    const { isHotReloadServer } = await import("../utils/controller");
    if (isLocal() && !isTest() && isHotReloadServer() && enableSync) {
      await this.syncer.sync();

      await this.startWatcher();
    }

    this.isInitialized = true;
    if (!doSilent) {
      const chalk = (await import("chalk")).default;
      console.timeEnd(chalk.cyan("Sonamu.init"));
    }
  }

  async createServer(initOptions?: { enableSync?: boolean; doSilent?: boolean }) {
    if (this.isInitialized === false) {
      await this.init(initOptions?.doSilent, initOptions?.enableSync);
    }

    const options = this.config.server;
    const fastify = (await import("fastify")).default;
    const server = fastify(options.fastify);
    this.server = server;

    // Storage 설정 → StorageManager 생성
    if (options.storage) {
      const { StorageManager } = await import("../storage/storage-manager");
      this._storage = new StorageManager(options.storage);
    }

    // 플러그인 등록
    if (options.plugins) {
      await this.registerPlugins(server, options.plugins);
    }

    if (options.auth) {
      if (!options.plugins?.session) {
        throw new Error("Auth requires session plugin. Please add plugins.session configuration.");
      }

      await this.registerAuth(server, options.auth);
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
    },
  ) {
    if (this.isInitialized === false) {
      await this.init(options?.doSilent, options?.enableSync);
    }

    this.server = server;

    // timezone 설정
    const timezone = this.config.api.timezone;
    if (timezone) {
      // 타임존에 맞게 응답 날짜 스트링을 변환해주어야 합니다.
      // 가령 timezone이 "Asia/Seoul" 이면
      // "2025-11-21T00:00:00.000Z" 를 "2025-11-21T09:00:00+09:00" 으로 변환해주어야 합니다.
      const { formatInTimeZone } = await import("date-fns-tz");

      // ISO 8601 날짜 형식 정규식 (예: 2024-01-15T09:30:00.000Z)
      const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

      // T를 둘러싼 작은따옴표가 없다면 "2025-11-19176354618900018:56:29+09:00"와 같은 결과가 나옵니다.
      // 이는 date-fns 특입니다.
      // 이렇게 해도 괜찮습니다. "2025-11-19T18:56:29+09:00" 모양으로 잘 나옵니다.
      const DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX";

      server.setReplySerializer((payload) => {
        return JSON.stringify(payload, (_key, value) => {
          if (typeof value === "string" && ISO_DATE_REGEX.test(value)) {
            return formatInTimeZone(
              new Date(value),
              timezone as `${string}/${string}`,
              DATE_FORMAT,
            );
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
      async (_request, _reply): Promise<typeof this.syncer.apis> => {
        return this.syncer.apis;
      },
    );

    // Healthcheck API
    server.get(
      `${this.config.api.route.prefix}/healthcheck`,
      async (_request, _reply): Promise<string> => {
        return "ok";
      },
    );

    // Sonamu UI API
    const { sonamuUIApiPlugin } = await import("../ui/api");
    server.register(sonamuUIApiPlugin);

    // API 라우팅 (로컬HMR 상태와 구분)
    const { isLocal } = await import("../utils/controller");
    if (isLocal()) {
      server.all("*", async (request, reply) => {
        // Sonamu UI
        if (request.url.startsWith("/sonamu-ui")) {
          return;
        }

        const found = this.syncer.apis.find(
          (api) =>
            this.config.api.route.prefix + api.path === request.url.split("?")[0] &&
            (api.options.httpMethod ?? "GET") === request.method.toUpperCase(),
        );
        if (found) {
          return this.createApiHandler(found, config)(request, reply);
        }

        if (request.url.startsWith("/api/")) {
          const { NotFoundException } = await import("../exceptions/so-exceptions");
          throw new NotFoundException(`존재하지 않는 API 접근입니다. ${request.url}`);
        }

        // 일반 파일 접근시 별도의 에러 출력하지 않음
        return;
      });
    } else {
      for (const api of this.syncer.apis) {
        // model
        if (this.syncer.models[api.modelName] === undefined) {
          throw new Error(`정의되지 않은 모델에 접근 ${api.modelName}`);
        }

        // route
        server.route({
          method: api.options.httpMethod ?? "GET",
          url: this.config.api.route.prefix + api.path,
          handler: this.createApiHandler(api, config),
        }); // END server.route
      }
    }
  }

  createApiHandler(
    api: ExtendedApi,
    config: SonamuFastifyConfig,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
      (api.options.guards ?? []).every((guard) => config.guardHandler(guard, request, api));

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
          const { BadRequestException } = await import("../exceptions/so-exceptions");
          throw new BadRequestException(messages, {
            zodError: e,
          });
        } else {
          throw e;
        }
      }

      // Content-Type
      reply.type(api.options.contentType ?? "application/json");

      // Context 생성
      const context: Context = await this.createContext(config, request, reply);

      // 모델 메소드 args 생성하여 호출
      const { ApiParamType } = await import("../types/types");
      const args = api.parameters.map((param) => {
        // Context 인젝션
        if (ApiParamType.isContext(param.type)) {
          return context;
        } else {
          return reqBody[param.name];
        }
      });
      return this.invokeModelMethod(api, args, context, reply);
    };
  }

  async invokeModelMethod(
    api: ExtendedApi,
    args: unknown[],
    context: Context,
    reply: FastifyReply,
  ): Promise<unknown> {
    const model = this.syncer.models[api.modelName];
    return this.asyncLocalStorage.run({ context }, async () => {
      // biome-ignore lint/suspicious/noExplicitAny: model은 모델 인스턴스이므로 메서드 호출 가능
      const result = await (model as any)[api.methodName].apply(model, args);
      reply.type(api.options.contentType ?? "application/json");

      return result;
    });
  }

  async createContext(
    config: SonamuFastifyConfig,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<Context> {
    // createSSEFactory 함수에 미리 request의 socket과 reply를 바인딩.
    const { createSSEFactory } = await import("../stream/sse");
    const createSSE = (<T extends ZodObject>(
      _request: FastifyRequest,
      _reply: FastifyReply,
      _events: T,
    ) => createSSEFactory(_request.socket, _reply, _events)).bind(null, request, reply);

    const context: Context = {
      ...(await Promise.resolve(
        config.contextProvider(
          {
            request,
            reply,
            headers: request.headers,
            createSSE,
            naiteStore: Naite.createStore(),
            // auth
            user: request.user ?? null,
            passport: {
              login: request.login.bind(request) as AuthContext["passport"]["login"],
              logout: request.logout.bind(request) as AuthContext["passport"]["logout"],
            },
          },
          request,
          reply,
        ),
      )),
    };
    return context;
  }

  async startWatcher(): Promise<void> {
    const watchPath = [path.join(this.apiRootPath, "src")];

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
        "File path is not within the API root path",
      );

      if (event !== "change" && event !== "add") {
        return;
      }

      try {
        // sonamu.config.ts 변경 시 재시작
        const isConfigTs = filePath === path.join(this.apiRootPath, "src", "sonamu.config.ts");

        if (isConfigTs) {
          const relativePath = filePath.replace(this.apiRootPath, "api");
          const chalk = (await import("chalk")).default;
          console.log(
            chalk.bold(`Detected(${event}): ${chalk.blue(relativePath)} - Restarting...`),
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

  private async registerPlugins(server: FastifyInstance, plugins: SonamuServerOptions["plugins"]) {
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

    const registerPlugin = async <K extends keyof NonNullable<typeof plugins>>(
      key: K,
      pluginName: string,
    ) => {
      const option = plugins[key];
      if (!option) return;

      if (option === true) {
        server.register((await import(pluginName)).default);
      } else {
        server.register((await import(pluginName)).default, option);
      }
    };

    for (const [key, pluginName] of Object.entries(pluginsModules)) {
      await registerPlugin(key as keyof typeof plugins, pluginName);
    }

    if (plugins.custom) {
      plugins.custom(server);
    }
  }

  private async registerAuth(
    server: FastifyInstance,
    options: NonNullable<SonamuServerOptions["auth"]>,
  ) {
    // await import("fastify");
    const fastifyPassport = (await import("@fastify/passport")).default;
    server.register(fastifyPassport.initialize());
    server.register(fastifyPassport.secureSession());

    if (typeof options === "boolean") {
      fastifyPassport.registerUserSerializer(async (user, _request) => user);
      fastifyPassport.registerUserDeserializer(async (serialized, _request) => serialized);
    } else {
      fastifyPassport.registerUserSerializer(options.userSerializer);
      fastifyPassport.registerUserDeserializer(options.userDeserializer);
    }
  }

  private async initializeWorkflows(options: SonamuTaskOptions | undefined) {
    const { WorkflowManager } = await import("../tasks/workflow-manager");
    // NOTE: @sonamu-kit/tasks 안에선 knex config를 수정하기 때문에 connection이 아닌 config 째로 보냅니다.
    this._workflows = new WorkflowManager(DB.getDBConfig("w"));
    if (!options) {
      return;
    }

    const enableWorker = options.enableWorker ?? isDaemonServer();
    const defaultWorkerOptions = {
      concurrency: os.cpus().length - 1,
      usePubSub: true,
      listenDelay: 500,
    };

    if (enableWorker) {
      this.workflows.setupWorker({
        ...defaultWorkerOptions,
        ...options.workerOptions,
      });
    }
  }

  private async boot(server: FastifyInstance, options: SonamuServerOptions) {
    const port = options.listen?.port ?? 3000;
    const host = options.listen?.host ?? "localhost";

    server.addHook("onClose", async () => {
      await options.lifecycle?.onShutdown?.(server);
      await this.workflows.destroy();
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
        await this.workflows.startWorker();
        await options.lifecycle?.onStart?.(server);
      })
      .catch(async (err) => {
        const chalk = (await import("chalk")).default;
        console.error(chalk.red("Failed to start server:", err));
        await shutdown();
      });
  }

  private async handleFileChange(event: string, filePath: AbsolutePath): Promise<void> {
    // 첫 번째 파일이면 HMR 시작 시간 기록
    if (this.pendingFiles.length === 0) {
      this.hmrStartTime = Date.now();
    }
    this.pendingFiles.push(filePath);

    const relativePath = path.relative(this.apiRootPath, filePath);
    const chalk = (await import("chalk")).default;
    console.log(chalk.bold(`Detected(${event}): ${chalk.blue(relativePath)}`));

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
    await this._workflows?.destroy();
    await this.watcher?.close();
  }
}
export const Sonamu = new SonamuClass();
