import { AsyncLocalStorage } from "async_hooks";
import fs from "fs/promises";
import { type IncomingMessage, type Server, type ServerResponse } from "http";
import os from "os";
import path from "path";

import "@fastify/websocket";
import { dispose as logtapeDispose } from "@logtape/logtape";
import { type Auth, type BetterAuthOptions } from "better-auth";
import chalk from "chalk";
import { type FSWatcher } from "chokidar";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import mime, { lookup as mimeLookup } from "mime-types";
import { type WebSocket } from "ws";
import { type ZodObject } from "zod";

import { BASE_FIELD_MAPPINGS } from "../auth/better-auth-entities";
import { createBetterAuthRequest } from "../auth/better-auth-request";
import { applyCacheHeaders, CachePresets } from "../cache-control/cache-control";
import { type CacheControlConfig, type CacheControlRequest } from "../cache-control/types";
import { type CacheConfig, type CacheManager } from "../cache/types";
import { toFastifyCompressOption } from "../compress/compress";
import { type CompressOptions } from "../compress/types";
import { DB } from "../database/db";
import { type SonamuDBConfig } from "../database/db";
import { SD, setSDConfig } from "../dict/sd";
import { type LocalizedString } from "../dict/types";
import { getSonamuEnvironment, readAllEnvironmentSnapshots } from "../env";
import { NotFoundException } from "../exceptions/so-exceptions";
import { runtimeTypeOf } from "../runtime-type";
import { BufferedFile } from "../storage/buffered-file";
import { type StorageManager } from "../storage/storage-manager";
import { type KeyGenerator } from "../storage/types";
import { UploadedFile } from "../storage/uploaded-file";
import { createMockSSEFactory } from "../stream/sse";
import {
  type AnyWebSocketConnection,
  WebSocketRuntime,
  type WebSocketConnection,
} from "../stream/ws";
import {
  type TelemetryContextProvider,
  type WebSocketTelemetryConnectionContext,
} from "../stream/ws-telemetry";
import { type LoadedModels } from "../syncer/module-loader";
import { type Syncer } from "../syncer/syncer";
import { type WorkflowManager } from "../tasks/workflow-manager";
import { type DevVitestManager } from "../testing/dev-vitest-manager";
import { type SonamuFastifyConfig } from "../types/types";
import { centerText } from "../utils/console-util";
import { isDaemonServer } from "../utils/controller";
import { exists, fileExists } from "../utils/fs-utils";
import { type AbsolutePath } from "../utils/path-utils";
import {
  isBigIntValue,
  isFunctionValue,
  isNumberValue,
  isObjectValue,
  isStringValue,
  isSymbolValue,
} from "../utils/runtime-value";
import { convertFastifyHeadersToStandard, merge } from "../utils/utils";
import {
  normalizeZodCompilerPolicy,
  type SonamuConfig,
  type SonamuServerOptions,
  type SonamuTaskOptions,
} from "./config";
import { type Context, type RuntimeContext, type WebSocketContext } from "./context";
import { type ExtendedApi } from "./decorators";
import {
  assertHttpValidatorRegistry,
  createHttpValidator,
  getHttpValidatorRouteKey,
  type HttpValidator,
  type HttpValidatorRegistry,
} from "./http-validator";
import { getSecrets } from "./secret";
import { type SonamuSecrets } from "./secret";
import {
  createWebSocketReplyStub,
  resolveWebSocketCloseDescriptor,
  resolveWebSocketPluginOptions,
  resolveIntegratedViteHmrOptions,
} from "./websocket-helpers";

export {
  createWebSocketReplyStub,
  resolveWebSocketCloseDescriptor,
  resolveWebSocketPluginOptions,
} from "./websocket-helpers";

interface UploadedRequestFiles {
  bufferedFiles: BufferedFile[];
  uploadedFiles: UploadedFile[];
}

type ApiArgument =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | CallableFunction
  | object
  | null
  | undefined;
type ApiMethodResult = ApiArgument | void;

function toApiArgument<Value>(value: Value): ApiArgument {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (value === true) return true;
  if (value === false) return false;
  if (isStringValue(value)) return value;
  if (isNumberValue(value)) return value;
  if (isBigIntValue(value)) return value;
  if (isSymbolValue(value)) return value;
  if (isFunctionValue(value)) return value;
  if (isObjectValue(value)) {
    return value;
  }
  throw new Error("지원하지 않는 API 인수 타입입니다.");
}

function toApiArgumentMap<Value extends object>(value: Value): Map<string, ApiArgument> {
  return new Map(Object.entries(value).map(([key, item]) => [key, toApiArgument(item)]));
}

function createUnavailableSSE<T extends ZodObject>(_events: T): never {
  throw new Error(
    "createSSE is not available in websocket context. Define websocketContextProvider if your context setup depends on SSE helpers.",
  );
}

function printDimSummary(message: string): void {
  console.log(chalk.dim(`✓ ${message}`));
}

function printGreenSummary(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

export interface SonamuTestingSnapshot {
  apiRootPath: AbsolutePath | null;
  config: SonamuConfig | null;
  syncer: Syncer | null;
  httpValidators: WeakMap<ExtendedApi, HttpValidator>;
  pendingHttpValidators: WeakMap<ExtendedApi, Promise<HttpValidator>>;
  aotHttpValidatorRegistry: HttpValidatorRegistry | undefined;
  preparedApis: readonly ExtendedApi[];
  preparedModels: LoadedModels;
  websocketRuntime: WebSocketRuntime | null;
}

export interface SonamuHttpValidatorDependencies {
  createValidator: typeof createHttpValidator;
  assertRegistry: typeof assertHttpValidatorRegistry;
}

export const defaultSonamuHttpValidatorDependencies: SonamuHttpValidatorDependencies = {
  createValidator: createHttpValidator,
  assertRegistry: assertHttpValidatorRegistry,
};

class SonamuClass {
  public isInitialized: boolean = false;
  public forTesting: boolean = false;
  public asyncLocalStorage: AsyncLocalStorage<{
    context: RuntimeContext;
  }> = new AsyncLocalStorage();
  private httpValidators: WeakMap<ExtendedApi, HttpValidator> = new WeakMap();
  private pendingHttpValidators: WeakMap<ExtendedApi, Promise<HttpValidator>> = new WeakMap();
  private aotHttpValidatorRegistry: HttpValidatorRegistry | undefined;
  private preparedApis: readonly ExtendedApi[] = [];
  private preparedModels: LoadedModels = {};

  public getContext<T extends RuntimeContext = Context>(): T {
    const store = this.asyncLocalStorage.getStore();
    if (store?.context) {
      return /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ store.context as T;
    }

    if (process.env.NODE_ENV === "test") {
      // 테스팅 환경에서 컨텍스트가 주입되지 않은 경우 빈 컨텍스트 리턴
      const mockContext = {
        transport: "http",
        request: null,
        reply: null,
        headers: {},
        createSSE: (schema: ZodObject) => createMockSSEFactory(schema),
        locale: "",
        user: null,
        session: null,
        naiteStore: new Map<string, any>(),
      };
      // SAFETY: 테스트 기본 컨텍스트는 HTTP Context이며 기본 제네릭과 일치한다.
      return /* SAFETY: 테스트 기본 컨텍스트는 요청 범위가 없는 HTTP 컨텍스트 대체값입니다. */ mockContext as T &
        typeof mockContext;
    } else {
      throw new Error("Sonamu cannot find context");
    }
  }

  private apiRootPathValue: AbsolutePath | null = null;
  set apiRootPath(apiRootPath: AbsolutePath) {
    this.apiRootPathValue = apiRootPath;
  }
  get apiRootPath(): AbsolutePath {
    if (this.apiRootPathValue === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this.apiRootPathValue;
  }
  get appRootPath(): string {
    return this.apiRootPath.split(path.sep).slice(0, -1).join(path.sep);
  }

  private dbConfigValue: SonamuDBConfig | null = null;
  set dbConfig(dbConfig: SonamuDBConfig) {
    this.dbConfigValue = dbConfig;
  }
  get dbConfig(): SonamuDBConfig {
    if (this.dbConfigValue === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this.dbConfigValue;
  }

  private syncerValue: Syncer | null = null;
  set syncer(syncer: Syncer) {
    this.syncerValue = syncer;
  }
  get syncer(): Syncer {
    if (this.syncerValue === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this.syncerValue;
  }

  private configValue: SonamuConfig | null = null;
  set config(config: SonamuConfig) {
    this.configValue = config;
  }
  get config(): SonamuConfig {
    if (this.configValue === null) {
      throw new Error("Sonamu has not been initialized");
    }
    return this.configValue;
  }

  public readonly secrets: SonamuSecrets = getSecrets();

  private storageValue: StorageManager | null = null;
  /**
   * StorageManager 인스턴스
   */
  get storage(): StorageManager {
    if (!this.storageValue) {
      throw new Error("Storage has not been initialized. Check storage config.");
    }
    return this.storageValue;
  }

  private cacheValue: CacheManager | null = null;
  /**
   * CacheManager 인스턴스 (BentoCache)
   */
  get cache(): CacheManager {
    if (!this.cacheValue) {
      throw new Error("Cache has not been initialized. Check cache config in sonamu.config.ts.");
    }
    return this.cacheValue;
  }

  private workflowsValue: WorkflowManager | null = null;
  get workflows(): WorkflowManager {
    if (this.workflowsValue === null) {
      throw new Error("Sonamu has not been initialized");
    }

    return this.workflowsValue;
  }

  private authValue: Auth<BetterAuthOptions> | null = null;
  get auth(): Auth<BetterAuthOptions> {
    if (!this.authValue) {
      throw new Error("Auth has not been initialized. Check auth config in sonamu.config.ts.");
    }
    return this.authValue;
  }

  private devVitestManagerValue: DevVitestManager | null = null;
  get devVitestManager(): DevVitestManager | null {
    return this.devVitestManagerValue;
  }
  set devVitestManager(manager: DevVitestManager | null) {
    this.devVitestManagerValue = manager;
  }

  // Sonamu가 runtime을 직접 소유해 registry/connection lifecycle을 애플리케이션 수명주기와 동기화함
  private websocketRuntimeValue: WebSocketRuntime | null = null;
  // 같은 Fastify 인스턴스에 @fastify/websocket을 중복 등록하는 것을 WeakSet으로 차단함
  private readonly websocketPluginServers = new WeakSet<
    FastifyInstance<Server, IncomingMessage, ServerResponse>
  >();
  get websocketRuntime(): WebSocketRuntime {
    if (!this.websocketRuntimeValue) {
      throw new Error("WebSocket runtime has not been initialized.");
    }
    return this.websocketRuntimeValue;
  }
  set websocketRuntime(runtime: WebSocketRuntime | null) {
    this.websocketRuntimeValue = runtime;
  }

  captureTestingSnapshot(): SonamuTestingSnapshot {
    return {
      apiRootPath: this.apiRootPathValue,
      config: this.configValue,
      syncer: this.syncerValue,
      httpValidators: this.httpValidators,
      pendingHttpValidators: this.pendingHttpValidators,
      aotHttpValidatorRegistry: this.aotHttpValidatorRegistry,
      preparedApis: this.preparedApis,
      preparedModels: this.preparedModels,
      websocketRuntime: this.websocketRuntimeValue,
    };
  }

  restoreTestingSnapshot(snapshot: SonamuTestingSnapshot): void {
    this.apiRootPathValue = snapshot.apiRootPath;
    this.configValue = snapshot.config;
    this.syncerValue = snapshot.syncer;
    this.httpValidators = snapshot.httpValidators;
    this.pendingHttpValidators = snapshot.pendingHttpValidators;
    this.aotHttpValidatorRegistry = snapshot.aotHttpValidatorRegistry;
    this.preparedApis = snapshot.preparedApis;
    this.preparedModels = snapshot.preparedModels;
    this.websocketRuntimeValue = snapshot.websocketRuntime;
  }

  // HMR 처리: 파일 시스템 감시 + HMR/sync 사이클 실행은 watcher 모듈로 위임합니다.
  public watcher: FSWatcher | null = null;

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
    this.forTesting = forTesting;

    if (this.isInitialized) {
      return;
    }

    const initStart = performance.now();

    // API 루트 패스
    const { findApiRootPath } = await import("../utils/utils");
    this.apiRootPath = apiRootPath ?? findApiRootPath();
    const baseEnvBeforeConfigLoad = { ...process.env };

    // 설정을 로딩하는 것부터 시작
    const configStart = performance.now();
    const { loadConfig } = await import("./config");
    this.config = await loadConfig(this.apiRootPath);
    const configTime = performance.now() - configStart;
    setSDConfig(this.config.i18n);
    // sonamu.config.ts 기본값 설정
    this.config.database.database = this.config.database.database ?? "pg";
    this.config.database.defaultOptions = this.config.database.defaultOptions ?? {};
    this.config.database.defaultOptions.client = this.config.database.database ?? "pg";

    // 로깅 설정
    const { configureLogTape } = await import("../logger/configure");
    if (this.config.logging !== false) {
      await configureLogTape({
        ...this.config.logging,
      });
    }

    // DB 로드
    const { DB: RuntimeDB } = await import("../database/db");
    const { isLocal: isLocalEnvironment } = await import("../utils/controller");
    const environmentSnapshots = isLocalEnvironment()
      ? readAllEnvironmentSnapshots(this.apiRootPath, baseEnvBeforeConfigLoad)
      : undefined;
    this.dbConfig = RuntimeDB.generateDBConfig(
      this.config.database,
      this.config.projectName,
      environmentSnapshots,
    );
    RuntimeDB.setConfig(this.dbConfig);

    // Entity 로드
    // 테스트에서도 Entity 정보는 필요합니다.
    // upsert가 제대로 작동하려면 entity의 unique index 정보가 필요하기 때문입니다.
    const { EntityManager } = await import("../entity/entity-manager");
    await EntityManager.autoload(doSilent);

    // Cache 초기화
    await this.initializeCache(this.config.server.cache, forTesting);

    // BetterAuth 초기화
    const authConfig = this.config.server.auth;
    if (authConfig) {
      // 사용자 설정과 기본값을 merge
      const mergedFieldMappings = merge(BASE_FIELD_MAPPINGS, authConfig);

      // better-auth 인스턴스 생성
      const { betterAuth } = await import("better-auth");
      const { sonamuKnexAdapter } = await import("../auth/knex-adapter");

      const authOptions: BetterAuthOptions = {
        database: sonamuKnexAdapter(),
        ...mergedFieldMappings,
      };
      this.authValue = betterAuth(authOptions);
    }

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

    // Autoload: Models / Types / APIs / Workflows / Templates / SSR Routes
    await this.syncer.autoloadTypes();
    await this.syncer.autoloadModels();
    await this.syncer.autoloadApis();
    await this.syncer.autoloadWorkflows();
    const { TemplateManager } = await import("../template");
    await TemplateManager.autoload();
    await this.syncer.autoloadSsrRoutes();

    const { isLocal, isTest, isHotReloadServer } = await import("../utils/controller");
    if (isLocal() && !isTest() && isHotReloadServer() && enableSync) {
      await this.syncer.sync();
      await this.startWatcher();
    }

    this.isInitialized = true;
    this.initElapsed = performance.now() - initStart;
    this.configElapsed = configTime;
  }

  private initElapsed = 0;
  private configElapsed = 0;

  async createServer(initOptions?: { enableSync?: boolean; doSilent?: boolean }) {
    if (!this.isInitialized) {
      await this.init(initOptions?.doSilent, initOptions?.enableSync);
    }

    const options = this.config.server;
    const { default: fastify } = await import("fastify");
    const { getLogTapeFastifyLogger } = await import("@logtape/fastify");
    const server = fastify({
      ...options.fastify,
      logger:
        this.config.logging !== false
          ? getLogTapeFastifyLogger({
              category: this.config.logging?.fastifyCategory ?? ["fastify"],
            })
          : undefined,
    });
    this.server = server;
    this.websocketRuntime = new WebSocketRuntime(options.websocket);

    // Storage 설정 → StorageManager 생성
    if (options.storage) {
      const { StorageManager } = await import("../storage/storage-manager");
      this.storageValue = new StorageManager(options.storage);
    }

    // 플러그인 등록
    if (options.plugins) {
      await this.registerPlugins(server, options.plugins);
    }

    if (options.auth) {
      await this.registerBetterAuth(server, options.auth);
    }

    // API 라우팅 설정
    await this.withFastify(server, options.apiConfig, {
      enableSync: initOptions?.enableSync,
      doSilent: initOptions?.doSilent,
    });

    // 서버 시작
    await this.boot(server, options);

    if (!initOptions?.doSilent) {
      this.printStartupSummary();
    }

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
    if (!this.isInitialized) {
      await this.init(options?.doSilent, options?.enableSync);
    }

    this.server = server;
    this.websocketRuntime ??= new WebSocketRuntime(this.config.server.websocket);
    await this.refreshHttpValidators();

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
          if (isStringValue(value) && ISO_DATE_REGEX.test(value)) {
            return formatInTimeZone(
              new Date(value),
              /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ timezone as `${string}/${string}`,
              DATE_FORMAT,
            );
          }
          return value;
        });
      });
      // Timezone 로그는 printStartupSummary에서 통합 출력
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

    // Sonamu UI API (로컬 환경에서만)
    const { isLocal } = await import("../utils/controller");
    if (isLocal()) {
      const { sonamuUIApiPlugin } = await import("../ui/api");
      server.register(sonamuUIApiPlugin);
    }

    // DevRunner 테스트 엔드포인트 (로컬 환경 + devRunner 활성화 시)
    if (isLocal() && this.config.test?.devRunner?.enabled) {
      const { registerDevTestRoutes } = await import("../testing/dev-test-routes");
      await registerDevTestRoutes(server, this.config.test.devRunner);
    }

    const webPath = path.join(this.appRootPath, "web");
    const hasWeb = await exists(webPath);

    // 전역 compress 옵션 계산 (route.compress: true일 때 사용)
    const pluginCompress = this.config.server.plugins?.compress;
    const globalCompressOptions: CompressOptions | undefined = pluginCompress
      ? pluginCompress === true
        ? { threshold: 1024, encodings: ["br", "gzip", "deflate"] }
        : {
            threshold: pluginCompress.threshold,
            encodings: pluginCompress.encodings,
            customTypes: pluginCompress.customTypes,
          }
      : undefined;

    if (isLocal()) {
      // 로컬 개발 환경: catch-all로 API를 동적 매칭하여 HMR을 지원합니다.
      // SONAMU_DISABLE_INTEGRATED_WEB=yes로 설정하면 dev_api 모드에서 Vite 통합을 비활성화할 수 있습니다.
      const disableIntegratedWeb = process.env.SONAMU_DISABLE_INTEGRATED_WEB === "yes";
      if (hasWeb && !disableIntegratedWeb) {
        await this.setupDevServerWithVite(server, webPath, config);
      } else {
        this.setupDevServer(server, config);
      }
    } else {
      // 프로덕션 환경: 개별 API 라우트 + 정적 파일 서빙
      for (const api of this.syncer.apis) {
        if (this.syncer.models[api.modelName] === undefined) {
          throw new Error(`정의되지 않은 모델에 접근 ${api.modelName}`);
        }

        // @websocket route는 wsHandler로 등록하고, 같은 path의 일반 HTTP GET은 426 응답으로 upgrade를 강제함
        if (api.websocketOptions) {
          server.route({
            method: "GET",
            url: this.config.api.route.prefix + api.path,
            handler: this.createWebSocketUpgradeRequiredHandler(),
            wsHandler: this.createWebSocketHandler(api, config),
          });
          continue;
        }

        server.route({
          method: api.options.httpMethod ?? "GET",
          url: this.config.api.route.prefix + api.path,
          handler: await this.createApiHandler(api, config),
          compress: toFastifyCompressOption(api.options.compress, globalCompressOptions),
        });
      }

      // 프로덕션에서는 web 소스(appRoot/web) 유무와 무관하게,
      // api/web-dist 존재 여부를 setupStaticWebServer 내부에서 판단합니다.
      await this.setupStaticWebServer(server, config, globalCompressOptions);
    }
  }

  /**
   * dev 모드 공통: catch-all에서 마지막 준비 완료 API snapshot을 탐색하여 요청을 처리합니다.
   * server.route()로 개별 등록하면 handler가 고정되어 HMR이 동작하지 않으므로,
   * refresh 성공 시 교체되는 snapshot을 매 요청 조회합니다.
   *
   * 요청이 /api(정확히는 this.config.api.route.prefix)로 시작하지 않는 경우라면 null을 반환하며 끝냅니다.
   */
  private async handleDevApiRequest(
    request: FastifyRequest,
    config: SonamuFastifyConfig,
  ): Promise<((request: FastifyRequest, reply: FastifyReply) => Promise<ApiMethodResult>) | null> {
    const matchedApi = this.findMatchedApi(request, this.preparedApis, this.preparedModels);

    if (!matchedApi) {
      throw new NotFoundException(SD("error.api.notFound"));
    }

    // websocket route를 일반 HTTP로 직접 호출한 경우 426을 돌려줘 upgrade 없이 접근하는 것을 차단함
    if (matchedApi.websocketOptions) {
      return this.createWebSocketUpgradeRequiredHandler();
    }

    return await this.createApiHandler(matchedApi, config, this.preparedModels);
  }

  private findMatchedApi(
    request: FastifyRequest,
    apis: readonly ExtendedApi[],
    models: LoadedModels,
  ): ExtendedApi | undefined {
    const url = this.getPathnameFromUrl(request.url);
    const method = request.method;

    if (!url.startsWith(this.config.api.route.prefix)) {
      return undefined;
    }

    return apis.find((api) => {
      if (models[api.modelName] === undefined) {
        return false;
      }
      const apiMethod = api.options.httpMethod ?? "GET";
      if (apiMethod !== method) return false;

      const fullPath = this.config.api.route.prefix + api.path;
      return this.isPathPatternMatch(fullPath, url);
    });
  }

  /**
   * dev api 모드: Vite 없이 API 동적 라우팅만 제공합니다.
   * HMR을 위해 catch-all에서 매 요청마다 준비 완료 API snapshot을 조회합니다.
   */
  private setupDevServer(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    config: SonamuFastifyConfig,
  ): void {
    // upgrade는 실질적으로 GET에서만 성립하므로 GET + wsHandler 와 그 외 method를 별도 route로 분리함
    server.route({
      method: "GET",
      url: `${this.config.api.route.prefix}/*`,
      handler: async (request, reply) => {
        const handler = await this.handleDevApiRequest(request, config);
        if (handler) {
          return handler(request, reply);
        }
        // 등록된 API와 일치하지 않는 요청에 대한 fallback입니다.
        throw new NotFoundException(SD("error.api.notFound"));
      },
      wsHandler: async (connection, request) => {
        await this.handleDevWebSocketRequest(connection.socket, request, config);
      },
    });

    server.route({
      method: ["HEAD", "POST", "PUT", "DELETE", "PATCH"],
      url: `${this.config.api.route.prefix}/*`,
      handler: async (request, reply) => {
        const handler = await this.handleDevApiRequest(request, config);
        if (handler) {
          return handler(request, reply);
        }
        throw new NotFoundException(SD("error.api.notFound"));
      },
    });
  }

  private viteServer: any = null;

  /**
   * dev all 모드: Vite Dev Server를 통합하여 API + SSR + CSR을 모두 제공합니다.
   * API 동적 매칭은 handleDevApiRequest를 공유합니다.
   */
  private async setupDevServerWithVite(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    webPath: string,
    config: SonamuFastifyConfig,
  ): Promise<void> {
    // @fastify/middie 등록 (Connect-style middleware 지원)
    await server.register((await import("@fastify/middie")).default);

    const vite = await import("vite");
    // @fastify/websocket 플러그인이 활성화되면 HMR websocket과 server socket이 충돌하므로 dedicated 포트로 분리함
    const requiresDedicatedHmrServer = Boolean(this.config.server.plugins?.ws);
    const hmr = resolveIntegratedViteHmrOptions({
      httpServer: server.server,
      requiresDedicatedWebSocketServer: requiresDedicatedHmrServer,
    });

    this.viteServer = await vite.createServer({
      root: webPath,
      server: {
        middlewareMode: true,
        hmr,
      },
      appType: "custom",
    });

    // Vite middleware 등록 (Vite 에셋 처리)
    server.use((req, res, next) => {
      // API와 Sonamu UI는 Fastify 라우트가 처리하도록 skip
      if (req.url?.startsWith(this.config.api.route.prefix) || req.url?.startsWith("/sonamu-ui")) {
        return next();
      }
      // 나머지는 Vite middleware로 전달
      return this.viteServer.middlewares(req, res, next);
    });

    // WS upgrade 경로(GET)와 일반 HTTP 메서드를 별도 route로 분리해 websocket route가 HTML fallback에 먹히지 않도록 함
    server.route({
      method: "GET",
      url: `${this.config.api.route.prefix}/*`,
      handler: async (request, reply) => {
        const result = await this.handleDevApiRequest(request, config);
        if (result) {
          return result(request, reply);
        }
        throw new NotFoundException(SD("error.api.notFound"));
      },
      wsHandler: async (connection, request) => {
        await this.handleDevWebSocketRequest(connection.socket, request, config);
      },
    });

    server.route({
      method: ["HEAD", "POST", "PUT", "DELETE", "PATCH"],
      url: `${this.config.api.route.prefix}/*`,
      handler: async (request, reply) => {
        const result = await this.handleDevApiRequest(request, config);
        if (result) {
          return result(request, reply);
        }
        throw new NotFoundException(SD("error.api.notFound"));
      },
    });

    // catch-all 라우트에서 SSR/CSR 처리
    // 개발 환경에서는 라우트별 compress 옵션을 포기하고 HMR 이점을 취합니다.
    server.route({
      method: ["GET", "HEAD"],
      url: "/*",
      handler: async (request, reply) => {
        const url = request.url;

        // 1. SSR 라우트 처리
        const { matchSSRRoute, renderSSR } = await import("../ssr");
        const ssrMatch = matchSSRRoute(url);
        if (ssrMatch) {
          console.log(`[SSR] Matched route: ${ssrMatch.route.path}`);
          const html = await renderSSR(
            url,
            ssrMatch.route,
            ssrMatch.params,
            request,
            reply,
            config,
            this.viteServer,
          );
          reply.type("text/html");
          return html;
        }

        // 2. CSR fallback
        try {
          let template = await fs.readFile(
            path.join(this.viteServer.config.root, "index.html"),
            "utf-8",
          );
          template = await this.viteServer.transformIndexHtml(url, template);

          // ?hmr=false로 연 페이지는 HMR 웹소켓만 끊어 새로고침되지 않게 한다.
          const { HMR_OPT_OUT_SCRIPT, isHmrDisabledByQuery } = await import("../ssr/hmr-opt-out");
          if (isHmrDisabledByQuery(url)) {
            template = template.replace("<head>", `<head>\n${HMR_OPT_OUT_SCRIPT}`);
          }

          reply.type("text/html");
          return template;
        } catch (e) {
          this.viteServer.ssrFixStacktrace(
            /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ e as Error,
          );
          console.error(e);
          reply.status(500);
          return /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ (
            e as Error
          ).message;
        }
      },
    });

    // 서버 종료 시 Vite도 종료
    server.addHook("onClose", async () => {
      await this.viteServer.close();
    });

    if ("port" in hmr) {
      console.log(
        chalk.dim(
          `✓ Vite HMR using dedicated websocket port ${hmr.port} to avoid Fastify websocket conflicts`,
        ),
      );
    }
    console.log(chalk.dim("✓ Vite dev server integrated"));
  }

  private async setupStaticWebServer(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    config: SonamuFastifyConfig,
    globalCompressOptions: CompressOptions | undefined,
  ): Promise<void> {
    // 경로 명확화: api/web-dist/client (정적 파일), api/web-dist/server (SSR entry), api/dist/ssr (SSR routes - API 소유)
    const webDistPath = path.join(this.apiRootPath, "web-dist", "client");
    const ssrPath = path.join(this.apiRootPath, "web-dist", "server");
    const ssrEntryPath = path.join(ssrPath, "entry-server.generated.js");
    const ssrRoutesPath = path.join(this.apiRootPath, "dist", "ssr", "routes.js");

    if (!(await exists(webDistPath))) {
      console.warn(`⚠ Web dist not found: ${webDistPath}`);
      return;
    }

    // SSR entry 존재 여부 확인
    const ssrAvailable = await exists(ssrEntryPath);

    if (!ssrAvailable) {
      console.warn(`⚠ SSR entry not found: ${ssrEntryPath}`);
      console.warn("  SSR will be disabled. Only CSR will work.");
    }

    // SSR 라우트 로드 (production에서만, 사용자 프로젝트의 ssr/routes.ts)
    if (ssrAvailable) {
      if (await exists(ssrRoutesPath)) {
        // ts-loader라면 "file://"로 시작하는 fully-resolved path만 받기에 이를 처리해주는 importMembers를 사용해야 했겠지만,
        // 여기는 프로덕션 환경에서 loader 없이 돌아가기 때문에 "진짜 js 파일"의 "그냥" 절대경로를 바로 import해도 됩니다.
        // 이 내용은 이 함수 내에서 아래에 나올 다른 import 호출에도 동일하게 적용됩니다.
        await import(ssrRoutesPath);
        console.log("✓ SSR routes loaded");
      } else {
        console.warn(`⚠ SSR routes not found: ${ssrRoutesPath}`);
      }
    }

    // 롤링 업데이트 대응: asset hash 불일치 시 현재 버전 직접 서빙
    server.get("/assets/:filename", async (request, reply) => {
      const requestedFile =
        /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ (
          request.params as { filename: string }
        ).filename;
      const assetsDir = path.join(webDistPath, "assets");
      const safeFilePath = this.resolvePathWithinBaseDir(assetsDir, requestedFile);
      if (safeFilePath === null) {
        reply.status(403).send();
        return;
      }
      const normalizedRequestedFile = path.relative(assetsDir, safeFilePath).replace(/\\/g, "/");

      const assetPath = `/assets/${normalizedRequestedFile}`;

      // Cache-Control 헤더 결정
      const getCacheControlForAsset = (): CacheControlConfig => {
        const cacheReq: CacheControlRequest = {
          type: "assets",
          url: request.url,
          path: assetPath,
          method: request.method,
        };

        // 사용자 정의 핸들러 우선
        if (config.cacheControlHandler) {
          const result = config.cacheControlHandler(cacheReq);
          if (result) return result;
        }

        // 기본값: immutable
        return CachePresets.immutable;
      };

      // index-*.js 또는 index-*.css 요청인 경우
      if (/^index-[a-f0-9]+\.(js|css)$/.test(normalizedRequestedFile)) {
        const ext = normalizedRequestedFile.split(".").pop();
        const files = await fs.readdir(assetsDir);
        const currentFile = files.find((f) => f.startsWith("index-") && f.endsWith(`.${ext}`));

        if (currentFile) {
          const filePath = path.join(assetsDir, currentFile);
          const content = await fs.readFile(filePath);
          reply.type(ext === "js" ? "application/javascript" : "text/css");
          applyCacheHeaders(reply, getCacheControlForAsset());
          return reply.send(content);
        }
      }

      // 일반 파일 서빙
      const filePath = safeFilePath;
      if (await exists(filePath)) {
        const content = await fs.readFile(filePath);
        const ext = normalizedRequestedFile.split(".").pop();
        reply.type(ext === "js" ? "application/javascript" : ext === "css" ? "text/css" : "");
        if (normalizedRequestedFile.includes("-")) {
          applyCacheHeaders(reply, getCacheControlForAsset());
        }
        return reply.send(content);
      }

      reply.status(404).send();
    });

    // SSR 라우트 개별 등록 (compress 옵션이 라우트별로 적용되도록)
    if (ssrAvailable) {
      const { getSSRRoutes } = await import("../ssr");
      const { renderSSR } = await import("../ssr/renderer");
      const ssrRoutes = getSSRRoutes();

      for (const route of ssrRoutes) {
        server.route({
          method: ["GET", "HEAD"],
          url: route.path,
          compress: toFastifyCompressOption(route.compress ?? true, globalCompressOptions),
          handler: async (request, reply) => {
            const url = request.url;
            console.log(`[SSR] Matched route: ${route.path}`);

            const params = this.extractPathParams(route.path, url);
            const html = await renderSSR(url, route, params, request, reply, config);

            reply.type("text/html");
            return html;
          },
        });
      }
    }

    // CSR or Static File Fallback (SSR 라우트에 매칭되지 않는 모든 요청)
    server.route({
      method: ["GET", "HEAD"],
      url: "*",
      handler: async (request, reply) => {
        // /api, /sonamu-ui는 404 그대로
        if (request.url.startsWith("/api") || request.url.startsWith("/sonamu-ui")) {
          reply.status(404).send();
          return;
        }

        // CSR용 Cache-Control 헤더 설정
        if (config.cacheControlHandler) {
          const csrCacheReq: CacheControlRequest = {
            type: "csr",
            url: request.url,
            path: request.url.split("?")[0],
            method: request.method,
          };
          const csrCacheConfig = config.cacheControlHandler(csrCacheReq);

          if (csrCacheConfig) {
            applyCacheHeaders(reply, csrCacheConfig);
          }
        }

        // 정적 파일이 존재할 경우, 정적 파일을 먼저 서빙해야함
        const requestPath = this.getPathnameFromUrl(request.url);
        const safeFilePath = this.resolvePathWithinBaseDir(webDistPath, requestPath);
        if (safeFilePath === null) {
          reply.status(403).send();
          return;
        }
        if (await fileExists(safeFilePath)) {
          const content = await fs.readFile(safeFilePath);
          return reply.type(mimeLookup(safeFilePath) || "application/octet-stream").send(content);
        }

        // CSR fallback: index.html 서빙
        const indexPath = path.join(webDistPath, "index.html");
        return reply.type("text/html").send(await fs.readFile(indexPath, "utf-8"));
      },
    });

    console.log(`✓ Static web server configured with ${ssrAvailable ? "SSR" : "CSR only"} support`);
  }

  createApiHandler(
    api: ExtendedApi,
    config: SonamuFastifyConfig,
    models: LoadedModels = this.syncer.models,
    dependencies: SonamuHttpValidatorDependencies = defaultSonamuHttpValidatorDependencies,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<ApiMethodResult> {
    const preparedValidator = this.getOrCreateHttpValidator(api, dependencies);

    return async (request: FastifyRequest, reply: FastifyReply): Promise<ApiMethodResult> => {
      const validator =
        preparedValidator instanceof Promise ? await preparedValidator : preparedValidator;
      // Context 생성
      const context: Context = await this.createContext(config, request, reply);

      return this.asyncLocalStorage.run({ context }, async () => {
        // guards 처리
        runGuards({
          guards: api.options.guards,
          config,
          request,
          api,
        });

        // request 파싱
        const which = api.options.httpMethod === "GET" ? "query" : "body";
        let reqBody = new Map<string, ApiArgument>();
        // 파일 업로드 있는 경우 임시 데이터
        const files: UploadedRequestFiles = {
          bufferedFiles: [],
          uploadedFiles: [],
        };

        try {
          const body = request[which] ?? {};
          if (api.uploadOptions) {
            const parts = request.parts({
              limits: api.uploadOptions.limits,
            });

            // FormData의 field들을 임시로 저장
            const fields: Record<string, string> = {};

            if (api.uploadOptions.consume === "buffer" || !api.uploadOptions.consume) {
              // Buffer 모드: 메모리에 로드
              for await (const part of parts) {
                if (part.type === "file") {
                  // CRITICAL: 파일 스트림을 즉시 consume해야 다음 part로 넘어갈 수 있음
                  // 이 호출이 없으면 종종 multipart 파싱이 pending 상태로 타임아웃 발생
                  const buffer = await part.toBuffer();
                  files.bufferedFiles.push(new BufferedFile(part, buffer));
                } else if (part.type === "field") {
                  fields[part.fieldname] = String(part.value);
                }
              }
            } else if (api.uploadOptions.consume === "stream") {
              // Stream 모드: 즉시 저장소로 스트리밍
              const diskName = api.uploadOptions.destination;
              const disk = this.storage.use(diskName);

              // 우선순위: 데코레이터 > 전역 설정 > 기본값
              const keyGenerator: KeyGenerator =
                api.uploadOptions.keyGenerator ??
                this.config.server.storage?.keyGenerator ??
                defaultKeyGenerator;

              for await (const part of parts) {
                if (part.type === "file") {
                  const key = await keyGenerator({
                    filename: part.filename,
                    mimetype: part.mimetype,
                  });

                  await disk.putStream(key, part.file, {
                    contentType: part.mimetype,
                  });

                  const url = await disk.getUrl(key);
                  const signedUrl = await disk.getSignedUrl(key);

                  files.uploadedFiles.push(
                    new UploadedFile({
                      filename: part.filename,
                      mimetype: part.mimetype,
                      size: part.file.bytesRead,
                      url,
                      signedUrl,
                      key,
                      diskName,
                    }),
                  );
                } else if (part.type === "field") {
                  fields[part.fieldname] = String(part.value);
                }
              }
            }

            // qs로 중첩 구조 파싱: params[category] → { params: { category: "test" } }
            const qs = await import("qs");
            const parsed = qs.default.parse(fields);
            Object.assign(body, parsed);
          }

          reqBody = toApiArgumentMap(validator.parse(body));
        } catch (e) {
          const { ZodError } = await import("zod");
          if (e instanceof ZodError) {
            const { humanizeZodError } = await import("../utils/zod-error");
            const messages = humanizeZodError(e)
              .map((issue) => issue.message)
              .join(" ");
            const { BadRequestException } = await import("../exceptions/so-exceptions");
            throw new BadRequestException(
              /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ messages as LocalizedString,
              {
                zodError: e,
              },
            );
          } else {
            throw e;
          }
        }

        // Content-Type
        reply.type(api.options.contentType ?? "application/json");

        // Cache-Control 헤더 설정
        const apiCacheConfig = this.getApiCacheControl(api, request, config);
        if (apiCacheConfig) {
          applyCacheHeaders(reply, apiCacheConfig);
        }

        // 업로드 옵션이 있는 경우 파일 데이터를 Context에 추가
        if (api.uploadOptions) {
          const consume = api.uploadOptions.consume ?? "buffer";
          if (consume === "buffer") {
            context.bufferedFiles = files.bufferedFiles;
          } else if (consume === "stream") {
            context.uploadedFiles = files.uploadedFiles;
          }
        }

        // 모델 메소드 args 생성하여 호출
        const { ApiParamType } = await import("../types/types");
        const args = api.parameters.map((param) => {
          // Context 인젝션
          if (ApiParamType.isContext(param.type)) {
            return context;
          } else {
            return reqBody.get(param.name);
          }
        });

        return this.invokeModelMethod(api, args, reply, models);
      });
    };
  }

  private getOrCreateHttpValidator(
    api: ExtendedApi,
    dependencies: SonamuHttpValidatorDependencies,
  ): HttpValidator | Promise<HttpValidator> {
    const cached = this.httpValidators.get(api);
    if (cached !== undefined) {
      return cached;
    }
    const existing = this.pendingHttpValidators.get(api);
    if (existing !== undefined) {
      return existing;
    }
    const pending = this.buildHttpValidator(api, dependencies);
    this.pendingHttpValidators.set(api, pending);
    void pending.then(
      (validator) => {
        this.httpValidators.set(api, validator);
        this.pendingHttpValidators.delete(api);
      },
      () => {
        this.pendingHttpValidators.delete(api);
      },
    );
    return pending;
  }

  private async buildHttpValidator(
    api: ExtendedApi,
    dependencies: SonamuHttpValidatorDependencies,
  ): Promise<HttpValidator> {
    const policy = normalizeZodCompilerPolicy(this.config.validation?.zodCompiler);
    const sourceAot = process.env.HOT === "yes" || process.env.VITEST === "true";
    if (policy.api === "aot" && !sourceAot) {
      const registry = this.aotHttpValidatorRegistry ?? (await this.loadAotHttpValidatorRegistry());
      return this.getAotHttpValidator(api, registry);
    }

    return await dependencies.createValidator({
      api,
      policy,
      types: this.syncer.types,
      allowAotSourceFallback: sourceAot,
    });
  }

  private getAotHttpValidator(api: ExtendedApi, registry: HttpValidatorRegistry): HttpValidator {
    const routeKey = getHttpValidatorRouteKey(api);
    const validator = registry.validators.get(routeKey);
    if (validator === undefined) {
      throw new Error(`HTTP validator registry is missing ${routeKey}`);
    }
    return validator;
  }

  private async loadAotHttpValidatorRegistry(
    apis: readonly ExtendedApi[] = this.syncer.apis,
    dependencies: SonamuHttpValidatorDependencies = defaultSonamuHttpValidatorDependencies,
  ): Promise<HttpValidatorRegistry> {
    const { pathToFileURL } = await import("node:url");
    const registryPath = path.join(
      this.apiRootPath,
      "dist/application/sonamu.validators.generated.js",
    );
    if (!(await exists(registryPath))) {
      throw new Error(`Generated HTTP validator registry not found: ${registryPath}`);
    }

    const imported =
      /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ (await import(
        pathToFileURL(registryPath).href
      )) as {
        fingerprint?: unknown;
        validators?: unknown;
      };
    if (!isStringValue(imported.fingerprint) || !(imported.validators instanceof Map)) {
      throw new Error(`Invalid generated HTTP validator registry: ${registryPath}`);
    }
    for (const [key, validator] of imported.validators) {
      if (
        !isStringValue(key) ||
        !isObjectValue(validator) ||
        validator === null ||
        !("parse" in validator) ||
        !isFunctionValue(validator.parse)
      ) {
        throw new Error(`Invalid HTTP validator registry entry: ${String(key)}`);
      }
    }

    const registry: HttpValidatorRegistry = {
      fingerprint: imported.fingerprint,
      validators: imported.validators,
    };
    dependencies.assertRegistry(apis, registry);
    return registry;
  }

  async refreshHttpValidators(
    dependencies: SonamuHttpValidatorDependencies = defaultSonamuHttpValidatorDependencies,
  ): Promise<void> {
    const policy = normalizeZodCompilerPolicy(this.config.validation?.zodCompiler);
    const sourceAot = process.env.HOT === "yes" || process.env.VITEST === "true";
    const nextApis = [...this.syncer.apis];
    const nextModels = { ...this.syncer.models };
    const restApis = nextApis.filter((api) => api.websocketOptions === undefined);
    const next = new WeakMap<ExtendedApi, HttpValidator>();
    let nextAotRegistry: HttpValidatorRegistry | undefined;

    if (policy.api === "aot" && !sourceAot) {
      const registry = await this.loadAotHttpValidatorRegistry(nextApis, dependencies);
      for (const api of restApis) {
        next.set(api, this.getAotHttpValidator(api, registry));
      }
      nextAotRegistry = registry;
    } else {
      await Promise.all(
        restApis.map(async (api) => {
          const validator = await this.buildHttpValidator(api, dependencies);
          next.set(api, validator);
        }),
      );
    }

    // validator와 같은 revision의 API/model snapshot을 함께 공개해 HMR 중간 상태를 숨깁니다.
    this.httpValidators = next;
    this.pendingHttpValidators = new WeakMap();
    this.aotHttpValidatorRegistry = nextAotRegistry;
    this.preparedApis = nextApis;
    this.preparedModels = nextModels;
  }

  // WS path를 일반 HTTP GET으로 호출한 경우 426 + Upgrade 헤더로 명시적으로 websocket 접속을 유도함
  private createWebSocketUpgradeRequiredHandler() {
    return async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      reply.header("connection", "Upgrade").header("upgrade", "websocket").status(426).send({
        message: "WebSocket upgrade required",
      });
    };
  }

  // dev 모드의 catch-all wsHandler에서 실제 WS API로 디스패치함. 매칭되는 route가 없으면 1008로 닫음
  private async handleDevWebSocketRequest(
    socket: WebSocket,
    request: FastifyRequest,
    config: SonamuFastifyConfig,
  ): Promise<void> {
    const matchedApi = this.findMatchedApi(request, this.syncer.apis, this.syncer.models);
    if (!matchedApi?.websocketOptions) {
      const traceContext = this.websocketRuntime.telemetryController.createConnectionContext({
        headers: request.headers,
      });
      this.websocketRuntime.telemetryController.emit({
        name: "ws.connection.rejected",
        level: "warn",
        detail: {
          reason: "routeNotFound",
          path: request.url,
        },
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        sampled: traceContext.sampled,
      });
      socket.close(1008, "WebSocket route not found");
      return;
    }

    const handler = this.createWebSocketHandler(matchedApi, config);
    await handler({ socket }, request);
  }

  // WS route 핸들러의 실행 순서를 고정함:
  // 1) query param 파싱을 activation 전에 끝내 handshake 실패가 registry에 노출되지 않게 함
  // 2) `active: false`로 먼저 등록한 뒤 context 안에서 guard를 실행해 인증 정보를 참조할 수 있게 함
  // 3) context/guard 준비가 끝난 뒤 `activate()`해 브로드캐스트가 초기화 중간 상태를 보지 못하게 함
  // 에러 발생 시에는 resolveWebSocketCloseDescriptor 정책에 따라 close code를 매핑함
  createWebSocketHandlerForTesting(api: ExtendedApi, config: SonamuFastifyConfig) {
    return this.createWebSocketHandler(api, config);
  }

  private createWebSocketHandler(api: ExtendedApi, config: SonamuFastifyConfig) {
    return async (
      connection: {
        socket: WebSocket;
      },
      request: FastifyRequest,
    ): Promise<void> => {
      const socket = connection.socket;
      let wsContext: WebSocketContext<object, object> | null = null;
      let rawWs: ReturnType<WebSocketRuntime["registerConnection"]> | null = null;
      let preRegisterPhase: "guard" | "query" | "register" | "handler" = "guard";
      let traceContext: WebSocketTelemetryConnectionContext = {};

      try {
        traceContext = this.websocketRuntime.telemetryController.createConnectionContext({
          headers: request.headers,
        });

        preRegisterPhase = "query";
        const reqBody = await this.parseWebSocketRequestParams(api, request);
        preRegisterPhase = "register";
        rawWs = this.websocketRuntime.registerConnection(socket, {
          outEvents: api.websocketOptions!.outEvents,
          inEvents: api.websocketOptions!.inEvents,
          namespace: api.websocketOptions!.namespace,
          heartbeat: api.websocketOptions!.heartbeat,
          active: false,
          traceId: traceContext.traceId,
          spanId: traceContext.spanId,
          parentSpanId: traceContext.parentSpanId,
          sampled: traceContext.sampled,
        });

        const scopedWs = this.createScopedWebSocketConnection(rawWs, () => wsContext);
        wsContext = await this.createWebSocketContext(config, request, scopedWs);

        await this.asyncLocalStorage.run({ context: wsContext }, async () => {
          runGuards({
            guards: api.options.guards,
            config,
            request,
            api,
          });
        });

        this.websocketRuntime.activateConnection(rawWs.id);
        preRegisterPhase = "handler";

        const { ApiParamType } = await import("../types/types");
        const args = api.parameters.map((param) => {
          if (ApiParamType.isContext(param.type)) {
            return wsContext;
          }

          return reqBody.get(param.name);
        });

        await this.asyncLocalStorage.run({ context: wsContext }, async () => {
          await this.invokeModelMethod(api, args);
        });
      } catch (error) {
        const closeDescriptor = resolveWebSocketCloseDescriptor(error);
        if (!rawWs) {
          this.websocketRuntime.telemetryController.emit({
            name: "ws.connection.rejected",
            level: closeDescriptor.logLevel === "warn" ? "warn" : "error",
            detail: {
              reason: preRegisterPhase,
              code: closeDescriptor.code,
              path: api.path,
            },
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
            parentSpanId: traceContext.parentSpanId,
            sampled: traceContext.sampled,
          });
        }

        if (rawWs) {
          rawWs.close(closeDescriptor.code, closeDescriptor.reason);
        } else if (socket.readyState < 2) {
          socket.close(closeDescriptor.code, closeDescriptor.reason);
        }

        if (this.server?.log) {
          const payload = {
            err: error,
            modelName: api.modelName,
            methodName: api.methodName,
            path: api.path,
          };
          if (closeDescriptor.logLevel === "warn") {
            this.server.log.warn(payload, closeDescriptor.reason);
          } else {
            this.server.log.error(payload, closeDescriptor.reason);
          }
        } else {
          if (closeDescriptor.logLevel === "warn") {
            console.warn(closeDescriptor.reason, error);
          } else {
            console.error(closeDescriptor.reason, error);
          }
        }
      }
    };
  }

  // onMessage/onClose처럼 다른 tick에서 실행되는 callback은 ALS context가 끊기므로 wrapper에서 `asyncLocalStorage.run`으로 다시 감싸 복원함
  // publish/join/leave/setUserId 같은 즉시 실행 API는 단순 위임만 하고, deferred callback에만 context 복원을 적용함
  private createScopedWebSocketConnection<TOut extends object, TIn extends object>(
    ws: WebSocketConnection<TOut, TIn>,
    getContext: () => WebSocketContext | null,
  ): WebSocketConnection<TOut, TIn> {
    const telemetryController = this.websocketRuntimeValue?.telemetryController;
    const runInContext = <T>(callback: () => T): T => {
      const context = getContext();
      if (!context) {
        return callback();
      }

      return this.asyncLocalStorage.run({ context }, callback);
    };

    return {
      get id() {
        return ws.id;
      },
      get namespace() {
        return ws.namespace;
      },
      get closed() {
        return ws.closed;
      },
      get userId() {
        return ws.userId;
      },
      transport: "ws",
      publishUntyped(event, data) {
        ws.publishUntyped(event, data);
      },
      close(code, reason) {
        ws.close(code, reason);
      },
      onClose(callback) {
        ws.onClose(() => runInContext(callback));
      },
      onMessage(event, handler) {
        ws.onMessage(event, (data, messageTraceContext) =>
          runInContext(async () => {
            const eventName = String(event);
            const traceContext = messageTraceContext ?? getWebSocketTelemetryContext(ws);
            const startedAt = performance.now();

            telemetryController?.emit({
              name: "ws.handler.started",
              level: "debug",
              connectionId: ws.id,
              namespace: ws.namespace,
              userId: ws.userId,
              detail: { event: eventName },
              ...traceContext,
            });

            try {
              const result = await handler(data, messageTraceContext);
              const durationMs = performance.now() - startedAt;
              telemetryController?.emit({
                name: "ws.handler.completed",
                level: "debug",
                connectionId: ws.id,
                namespace: ws.namespace,
                userId: ws.userId,
                detail: { event: eventName },
                ...traceContext,
              });
              telemetryController?.recordSpan({
                operationName: "ws.message.process",
                kind: "internal",
                durationMs,
                status: "unset",
                connectionId: ws.id,
                namespace: ws.namespace,
                userId: ws.userId,
                attributes: { event: eventName },
                ...traceContext,
              });
              return result;
            } catch (error) {
              const durationMs = performance.now() - startedAt;
              telemetryController?.emit({
                name: "ws.handler.failed",
                level: "error",
                connectionId: ws.id,
                namespace: ws.namespace,
                userId: ws.userId,
                detail: { event: eventName },
                ...traceContext,
              });
              telemetryController?.recordSpan({
                operationName: "ws.message.process",
                kind: "internal",
                durationMs,
                status: "error",
                connectionId: ws.id,
                namespace: ws.namespace,
                userId: ws.userId,
                attributes: { event: eventName },
                errorType: error instanceof Error ? error.name : runtimeTypeOf(error),
                ...traceContext,
              });
              throw error;
            }
          }),
        );
      },
      publish(event, data) {
        ws.publish(event, data);
      },
      waitForClose() {
        return ws.waitForClose();
      },
      join(roomId) {
        ws.join(roomId);
      },
      leave(roomId) {
        ws.leave(roomId);
      },
      setUserId(userId) {
        ws.setUserId(userId);
      },
      clearUserId() {
        ws.clearUserId();
      },
    };
  }

  createScopedWebSocketConnectionForTesting<TOut extends object, TIn extends object>(
    ws: WebSocketConnection<TOut, TIn>,
    getContext: () => WebSocketContext | null,
  ): WebSocketConnection<TOut, TIn> {
    return this.createScopedWebSocketConnection(ws, getContext);
  }

  private async parseWebSocketRequestParams(
    api: ExtendedApi,
    request: FastifyRequest,
  ): Promise<Map<string, ApiArgument>> {
    const { getZodObjectFromApi } = await import("./code-converters");
    const ReqType = getZodObjectFromApi(api, this.syncer.types);

    try {
      const { fastifyCaster } = await import("./caster");
      return toApiArgumentMap(fastifyCaster(ReqType).parse(request.query ?? {}));
    } catch (e) {
      const { ZodError } = await import("zod");
      if (e instanceof ZodError) {
        const { humanizeZodError } = await import("../utils/zod-error");
        const messages = humanizeZodError(e)
          .map((issue) => issue.message)
          .join(" ");
        const { BadRequestException } = await import("../exceptions/so-exceptions");
        throw new BadRequestException(
          /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ messages as LocalizedString,
          {
            zodError: e,
          },
        );
      }

      throw e;
    }
  }

  /**
   * URL에서 path params를 추출합니다.
   * 예: pattern="/admin/companies/:companyId", url="/admin/companies/123" → { companyId: "123" }
   */
  private extractPathParams(pattern: string, url: string) {
    const patternParts = pattern.split("/").filter(Boolean);
    const urlParts = this.getPathnameFromUrl(url).split("/").filter(Boolean);
    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = urlParts[i];
      }
    }
    return params;
  }

  private isPathPatternMatch(pattern: string, url: string): boolean {
    const patternParts = pattern.split("/").filter(Boolean);
    const urlParts = this.getPathnameFromUrl(url).split("/").filter(Boolean);

    if (patternParts.length !== urlParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const urlPart = urlParts[i];
      if (patternPart.startsWith(":")) {
        continue;
      }
      if (patternPart !== urlPart) {
        return false;
      }
    }

    return true;
  }

  private getPathnameFromUrl(url: string): string {
    return url.split("?")[0];
  }

  private resolvePathWithinBaseDir(baseDir: string, inputPath: string): string | null {
    try {
      const decoded = decodeURIComponent(inputPath).replace(/\\/g, "/");
      if (decoded.includes("\0")) {
        return null;
      }
      const relativePath = decoded.replace(/^\/+/, "");
      const resolvedPath = path.resolve(baseDir, relativePath);
      const relativeFromBase = path.relative(baseDir, resolvedPath);
      if (relativeFromBase.startsWith("..") || path.isAbsolute(relativeFromBase)) {
        return null;
      }
      return resolvedPath;
    } catch {
      return null;
    }
  }

  /**
   * API 응답에 적용할 Cache-Control 설정을 결정합니다.
   * 우선순위: 개별 지정 > cacheControlHandler
   */
  private getApiCacheControl(
    api: ExtendedApi,
    request: FastifyRequest,
    config: SonamuFastifyConfig,
  ) {
    // 데코레이터 설정 우선
    if (api.options.cacheControl) {
      return api.options.cacheControl;
    }

    // 전역 핸들러
    if (config.cacheControlHandler) {
      const cacheReq: CacheControlRequest = {
        type: "api",
        url: request.url,
        path: request.routeOptions?.url ?? request.url.split("?")[0],
        method: request.method,
        api,
      };
      const result = config.cacheControlHandler(cacheReq);
      if (result) return result;
    }

    return null;
  }

  /**
   * SSR용 API 호출 (HTTP 오버헤드 없이 직접 호출)
   * createApiHandler의 로직을 재사용하되, request 파싱 대신 params 직접 사용
   */
  async invokeApiForSSR(
    api: ExtendedApi,
    params: any[],
    config: SonamuFastifyConfig,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<ApiMethodResult> {
    // Context 생성 (기존 메소드 재사용)
    const context = await this.createContext(config, request, reply);

    return this.asyncLocalStorage.run({ context }, async () => {
      // args 생성: Context 파라미터는 주입, 나머지는 params에서 가져오기
      const { ApiParamType } = await import("../types/types");
      let paramsIndex = 0;
      const args = api.parameters.map((param) => {
        if (ApiParamType.isContext(param.type)) {
          return context;
        }
        return params[paramsIndex++];
      });

      // 모델 메서드 호출 (기존 메서드 재사용)
      return this.invokeModelMethod(api, args, reply);
    });
  }

  async handleDevApiRequestForTesting(request: FastifyRequest, config: SonamuFastifyConfig) {
    return await this.handleDevApiRequest(request, config);
  }

  // WS 경로에서는 HTTP reply가 없으므로 reply를 optional로 받아 공통 호출 경로를 유지함
  async invokeModelMethod(
    api: ExtendedApi,
    args: unknown[],
    reply?: FastifyReply,
    models: LoadedModels = this.syncer.models,
  ): Promise<ApiMethodResult> {
    const model = models[api.modelName];
    if (model === undefined) {
      throw new Error(`Model not found: ${api.modelName}`);
    }
    const method =
      model[
        /* SAFETY: 동기화기가 모델 클래스에서 수집한 API 메서드 이름만 전달한다. */ api.methodName as keyof typeof model
      ];
    if (!isFunctionValue(method)) {
      throw new Error(`Model method not found: ${api.modelName}.${api.methodName}`);
    }
    const result = await Function.prototype.apply.call(method, model, args);
    reply?.type(api.options.contentType ?? "application/json");

    return result;
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

    // locale 감지
    const locale =
      this.detectLocale(request.headers["accept-language"], this.config.i18n.supportedLocales) ??
      this.config.i18n.defaultLocale;

    // auth context 추가
    const headers = convertFastifyHeadersToStandard(request.headers);
    const session = (await this.authValue?.api.getSession({ headers })) ?? null;

    const context: Context = await Promise.resolve(
      config.contextProvider(
        {
          transport: "http",
          request,
          reply,
          headers: request.headers,
          createSSE,
          naiteStore: new Map(),
          locale,
          // auth
          user: session?.user ?? null,
          session: session?.session ?? null,
        },
        request,
        reply,
      ),
    );
    return context;
  }

  // session/locale/store 같은 공통 state는 HTTP context와 공유하되, reply/createSSE 같은 HTTP 전용 helper는 노출하지 않음
  // 사용자가 websocketContextProvider를 주면 그대로 위임하고, 없으면 기존 contextProvider를 reply/SSE stub과 함께 재활용함
  async createWebSocketContext(
    config: SonamuFastifyConfig,
    request: FastifyRequest,
    ws: AnyWebSocketConnection,
  ): Promise<WebSocketContext> {
    const locale =
      this.detectLocale(request.headers["accept-language"], this.config.i18n.supportedLocales) ??
      this.config.i18n.defaultLocale;

    const headers = convertFastifyHeadersToStandard(request.headers);
    const session = (await this.authValue?.api.getSession({ headers })) ?? null;

    const defaultContext = {
      transport: "ws" as const,
      request,
      headers: request.headers,
      ws,
      naiteStore: new Map(),
      locale,
      user: session?.user ?? null,
      session: session?.session ?? null,
    };

    if (config.websocketContextProvider) {
      return {
        ...(await Promise.resolve(config.websocketContextProvider(defaultContext, request))),
      };
    }

    // reply/createSSE에 의존하는 contextProvider가 있으면 즉시 에러를 던져 transport misuse를 빨리 드러냄
    const replyStub = createWebSocketReplyStub();
    const httpLikeContext = await Promise.resolve(
      config.contextProvider(
        {
          transport: "http",
          request,
          reply: replyStub,
          headers: request.headers,
          createSSE: createUnavailableSSE,
          naiteStore: defaultContext.naiteStore,
          locale,
          user: defaultContext.user,
          session: defaultContext.session,
        },
        request,
        replyStub,
      ),
    );

    const {
      transport: _transport,
      reply: _reply,
      createSSE: _createSSE,
      bufferedFiles: _bufferedFiles,
      uploadedFiles: _uploadedFiles,
      ...rest
    } = httpLikeContext;

    return {
      ...rest,
      transport: "ws",
      request,
      headers: request.headers,
      ws,
    };
  }

  /**
   * Accept-Language 헤더에서 지원하는 locale을 찾습니다.
   * @example "ko-KR,ko;q=0.9,en;q=0.8" → "ko"
   */
  private detectLocale(
    acceptLanguage: string | undefined,
    supported: string[],
  ): string | undefined {
    if (!acceptLanguage) return undefined;

    // Accept-Language: ko-KR,ko;q=0.9,en;q=0.8
    const langs = acceptLanguage.split(",").map((lang) => {
      const [code] = lang.split(";");
      return code.trim().split("-")[0]; // ko-KR → ko
    });

    return langs.find((lang) => supported.includes(lang));
  }

  async startWatcher(): Promise<void> {
    // watcher 모듈은 file-patterns → Sonamu 순환을 피하기 위해 dynamic import 합니다.
    const { setupWatcher } = await import("../syncer/watcher");
    this.watcher = await setupWatcher((fileEvents) => this.runHmrSyncCycle(fileEvents));
  }

  /**
   * Watcher가 100ms batch로 모은 fileEvents 하나에 대해 한 번의 HMR/sync 사이클을 돕니다.
   * batch 큐잉 덕에 한 시점에 하나만 실행됨이 보장됩니다 (event-batcher가 직렬화).
   */
  private async runHmrSyncCycle(fileEvents: Map<AbsolutePath, "change" | "add">): Promise<void> {
    const startedAt = Date.now();

    for (const [filePath, event] of fileEvents) {
      const relativePath = path.relative(this.appRootPath, filePath);
      console.log(chalk.bold(`Detected(${event}): ${chalk.blue(relativePath)}`));
    }

    // 본체: 변경 흡수 + 체크섬 갱신.
    await this.syncer.hmrAndSync(fileEvents);
    await this.syncer.renewChecksums();

    const totalTime = Date.now() - startedAt;
    const msg = `HMR Done! ${chalk.bold.white(`${totalTime}ms`)}`;
    console.log(chalk.black.bgGreen(centerText(msg)));
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

    // compress 플러그인은 다른 플러그인보다 먼저 등록되어야 합니다.
    if (plugins.compress) {
      const compressPlugin = (await import("@fastify/compress")).default;
      const defaultOptions = {
        threshold: 1024,
        encodings: /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ [
          "br",
          "gzip",
          "deflate",
        ] as ("br" | "gzip" | "deflate")[],
      };

      if (plugins.compress === true) {
        server.register(compressPlugin, defaultOptions);
      } else {
        server.register(compressPlugin, {
          ...defaultOptions,
          ...plugins.compress,
        });
      }
    }

    const pluginsModules = {
      cors: "@fastify/cors",
      formbody: "@fastify/formbody",
      multipart: "@fastify/multipart",
      qs: "fastify-qs",
      sse: "fastify-sse-v2",
      static: "@fastify/static",
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
      await registerPlugin(
        /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ key as keyof typeof plugins,
        pluginName,
      );
    }

    if (plugins.ws) {
      await this.ensureWebSocketPlugin(server);
    }

    if (plugins.custom) {
      plugins.custom(server);
    }
  }

  // @fastify/websocket은 plugins.ws가 설정된 경우에만 등록하고, 같은 server에 중복 등록되지 않도록 WeakSet으로 기록함
  private async ensureWebSocketPlugin(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  ): Promise<void> {
    if (this.websocketPluginServers.has(server)) {
      return;
    }

    const pluginOption = this.config.server.plugins?.ws;
    if (!pluginOption) {
      return;
    }

    const websocketPlugin = (await import("@fastify/websocket")).default;
    const resolvedPluginOptions = resolveWebSocketPluginOptions({
      rawPluginOption: pluginOption,
    });
    if (resolvedPluginOptions) {
      await server.register(websocketPlugin, resolvedPluginOptions);
    } else {
      await server.register(websocketPlugin);
    }

    this.websocketPluginServers.add(server);
    this.warnOnPotentialWebSocketTimeoutConflicts(server);
  }

  // heartbeat interval이 Fastify keepAliveTimeout 이상이면 인프라가 먼저 idle 연결을 끊을 수 있어 경고만 남기고 넘어감
  private warnOnPotentialWebSocketTimeoutConflicts(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  ): void {
    const heartbeats = this.syncer.apis
      .map((api) => api.websocketOptions?.heartbeat ?? 30000)
      .filter((heartbeat) => heartbeat > 0);

    if (heartbeats.length === 0) {
      return;
    }

    const keepAliveTimeout = this.config.server.fastify?.keepAliveTimeout;
    if (!keepAliveTimeout || keepAliveTimeout <= 0) {
      return;
    }

    const largestHeartbeat = Math.max(...heartbeats);
    if (largestHeartbeat >= keepAliveTimeout) {
      server.log.warn(
        {
          keepAliveTimeout,
          largestHeartbeat,
        },
        "WebSocket heartbeat is greater than or equal to keepAliveTimeout; align infrastructure idle timeouts to avoid unexpected disconnects.",
      );
    }
  }

  /**
   * better-auth 라우트를 등록합니다.
   * /api/auth/* 경로로 인증 API가 자동 등록됩니다.
   */
  private async registerBetterAuth(
    server: FastifyInstance,
    options: NonNullable<SonamuServerOptions["auth"]>,
  ) {
    if (!options) return;

    const basePath = options.basePath ?? "/api/auth";

    // better-auth 라우트 등록
    server.route({
      method: ["GET", "POST"],
      url: `${basePath}/*`,
      handler: async (request, reply) => {
        const response = await this.auth.handler(
          createBetterAuthRequest(request, options.advanced?.ipAddress?.ipAddressHeaders),
        );

        reply.status(response.status);
        response.headers.forEach((value: string, key: string) => {
          reply.header(key, value);
        });
        return reply.send(response.body ? await response.text() : null);
      },
    });
  }

  private async printStartupSummary() {
    const activePreset = getSonamuEnvironment();

    printDimSummary(`Config loaded${formatTime(this.configElapsed)}`);

    // DB preset 목록
    printGreenSummary("DB");
    const { isLocal } = await import("../utils/controller");
    const presetNames =
      /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ Object.keys(
        this.dbConfig,
      ) as (keyof SonamuDBConfig)[];
    const maxLen = Math.max(...presetNames.map((n) => n.length));
    for (const name of presetNames) {
      const conn =
        /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ this
          .dbConfig[name].connection as
          | { host?: string; port?: number; database?: string }
          | undefined;
      const host = conn?.host ?? "localhost";
      const addr = `@ ${host}:${conn?.port ?? 5432}/${conn?.database ?? "(unknown)"}`;
      const padded = name.padEnd(maxLen);
      const remoteTag = isLocal() && !isLocalHost(host) ? chalk.yellow(` \u26a0 remote`) : "";

      if (name === activePreset) {
        console.log(chalk.green(`  \u25b8 ${padded} ${addr}`) + remoteTag);
      } else {
        console.log(chalk.dim(`    ${padded} ${addr}`) + remoteTag);
      }
    }

    if (this.config.server.auth) {
      const basePath = this.config.server.auth.basePath ?? "/api/auth";
      printDimSummary(`Auth: better-auth at ${basePath}/*`);
    }
    if (this.config.api.timezone) {
      printDimSummary(`Timezone: ${this.config.api.timezone}`);
    }
    printGreenSummary(`Sonamu ready${formatTime(this.initElapsed)}`);
  }

  private async initializeCache(config: CacheConfig | undefined, forTesting: boolean) {
    const { setCacheManagerRef } = await import("../cache/decorator");

    // 테스트 환경에서 메모리 드라이버 자동 사용
    if (forTesting) {
      const { createTestCacheManager } = await import("../cache/cache-manager");
      this.cacheValue = createTestCacheManager();
      setCacheManagerRef(this.cacheValue);
      return;
    }

    // 설정이 없으면 캐시 비활성화
    if (!config) {
      setCacheManagerRef(null);
      return;
    }

    // 설정에 따라 CacheManager 생성
    const { createCacheManager } = await import("../cache/cache-manager");
    this.cacheValue = createCacheManager(config);
    setCacheManagerRef(this.cacheValue);
  }

  private async initializeWorkflows(options: SonamuTaskOptions | undefined) {
    const { WorkflowManager } = await import("../tasks/workflow-manager");
    // NOTE: @sonamu-kit/tasks 안에선 knex config를 수정하기 때문에 connection이 아닌 config 째로 보냅니다.
    this.workflowsValue = new WorkflowManager(DB.getDBConfig("w"));
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
        console.error(chalk.red("Failed to start server:", err));
        await shutdown();
      });
  }

  async destroy(): Promise<void> {
    const { BaseModel } = await import("../database/base-model");
    // 먼저 처리해야함.
    await BaseModel.destroy();
    // WebSocket shutdown first to flush telemetry
    if (this.websocketRuntimeValue) {
      await this.websocketRuntimeValue.shutdown();
    }
    this.websocketRuntimeValue = null;
    // Then shut down remaining resources in parallel
    await Promise.allSettled([
      this.workflowsValue?.destroy() ?? Promise.resolve(),
      this.cacheValue?.disconnect() ?? Promise.resolve(),
      this.devVitestManagerValue?.shutdown() ?? Promise.resolve(),
      this.watcher?.close() ?? Promise.resolve(),
    ]);
    // LogTape dispose after WS shutdown so telemetry records are flushed first
    await logtapeDispose();
  }
}

function getWebSocketTelemetryContext(
  ws: AnyWebSocketConnection,
): WebSocketTelemetryConnectionContext {
  if (!isTelemetryContextProvider(ws)) {
    return {};
  }

  return ws.getTelemetryContext();
}

function isTelemetryContextProvider(
  ws: AnyWebSocketConnection,
): ws is AnyWebSocketConnection & TelemetryContextProvider {
  return "getTelemetryContext" in ws && isFunctionValue(ws.getTelemetryContext);
}

export const Sonamu = new SonamuClass();

/**
 * stream 모드에서 키 생성 함수가 지정되지 않았을 때 사용하는 기본 함수입니다.
 */
function defaultKeyGenerator(file: { filename: string; mimetype: string }): string {
  const ext = mime.extension(file.mimetype) || "bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `uploads/${timestamp}-${random}.${ext}`;
}

function formatTime(ms: number): string {
  const formatted = ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  return ` (${formatted})`;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host) || host.endsWith(".local");
}

// `.every()`가 첫 guard 이후 순회를 멈추는 문제가 있어 `for...of`로 모든 guard를 순서대로 실행하도록 고정함
function runGuards({
  guards,
  config,
  request,
  api,
}: {
  guards: ExtendedApi["options"]["guards"] | undefined;
  config: Pick<SonamuFastifyConfig, "guardHandler">;
  request: FastifyRequest;
  api: ExtendedApi;
}): void {
  for (const guard of guards ?? []) {
    config.guardHandler(guard, request, api);
  }
}
