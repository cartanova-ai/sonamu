import { dispose as logtapeDispose } from "@logtape/logtape";
import assert from "assert";
import { AsyncLocalStorage } from "async_hooks";
import type { Auth } from "better-auth";
import type { FSWatcher } from "chokidar";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "http";
import mime, { lookup as mimeLookup } from "mime-types";
import os from "os";
import path from "path";
import type { PoolConfig } from "pg";
import type { ZodObject } from "zod";
import {
  BASE_FIELD_MAPPINGS,
  convertFastifyHeadersToStandard,
  createMockSSEFactory,
  DB,
  isDaemonServer,
  merge,
  NotFoundException,
} from "..";
import type { CacheConfig, CacheManager } from "../cache/types";
import { applyCacheHeaders, CachePresets } from "../cache-control/cache-control";
import type { CacheControlConfig, CacheControlRequest } from "../cache-control/types";
import { toFastifyCompressOption } from "../compress/compress";
import type { CompressOptions } from "../compress/types";
import type { SonamuDBConfig } from "../database/db";
import { SD } from "../dict/sd";
import type { LocalizedString } from "../dict/types";
import { Naite } from "../naite/naite";
import { BufferedFile } from "../storage/buffered-file";
import type { StorageManager } from "../storage/storage-manager";
import type { KeyGenerator } from "../storage/types";
import { UploadedFile } from "../storage/uploaded-file";
import type { Syncer } from "../syncer/syncer";
import type { WorkflowManager } from "../tasks/workflow-manager";
import type { SonamuFastifyConfig } from "../types/types";
import { exists, fileExists } from "../utils/fs-utils";
import type { AbsolutePath } from "../utils/path-utils";
import type { SonamuConfig, SonamuServerOptions, SonamuTaskOptions } from "./config";
import type { Context } from "./context";
import type { ExtendedApi } from "./decorators";
import { getSecrets, type SonamuSecrets } from "./secret";

class SonamuClass {
  public isInitialized: boolean = false;
  public forTesting: boolean = false;
  public asyncLocalStorage: AsyncLocalStorage<{
    context: Context;
  }> = new AsyncLocalStorage();

  public getContext(): Context {
    const store = this.asyncLocalStorage.getStore();
    if (store?.context) {
      return store.context as Context;
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

  public readonly secrets: SonamuSecrets = getSecrets();

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

  private _cache: CacheManager | null = null;
  /**
   * CacheManager 인스턴스 (BentoCache)
   */
  get cache(): CacheManager {
    if (!this._cache) {
      throw new Error("Cache has not been initialized. Check cache config in sonamu.config.ts.");
    }
    return this._cache;
  }

  private _workflows: WorkflowManager | null = null;
  get workflows(): WorkflowManager {
    if (this._workflows === null) {
      throw new Error("Sonamu has not been initialized");
    }

    return this._workflows;
  }

  private _auth: Auth | null = null;
  get auth(): Auth {
    if (!this._auth) {
      throw new Error("Auth has not been initialized. Check auth config in sonamu.config.ts.");
    }
    return this._auth;
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
    this.forTesting = forTesting;

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

    // 설정을 로딩하는 것부터 시작
    const { loadConfig } = await import("./config");
    this.config = await loadConfig(this.apiRootPath);
    // sonamu.config.ts 기본값 설정
    this.config.database.database = this.config.database.database ?? "pg";
    this.config.database.defaultOptions.client = this.config.database.database ?? "pg";

    // 로깅 설정
    const { configureLogTape } = await import("../logger/configure");
    if (this.config.logging !== false) {
      await configureLogTape({
        ...this.config.logging,
      });
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

    // Cache 초기화
    await this.initializeCache(this.config.server.cache, forTesting);

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
    await this.syncer.autoloadSSRRoutes();

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
      await this.registerBetterAuth(server, options.auth);
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

    // Sonamu UI API (로컬 환경에서만)
    const { isLocal } = await import("../utils/controller");
    if (isLocal()) {
      const { sonamuUIApiPlugin } = await import("../ui/api");
      server.register(sonamuUIApiPlugin);
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

        server.route({
          method: api.options.httpMethod ?? "GET",
          url: this.config.api.route.prefix + api.path,
          handler: this.createApiHandler(api, config),
          compress: toFastifyCompressOption(api.options.compress, globalCompressOptions),
        });
      }

      if (hasWeb) {
        await this.setupStaticWebServer(server, webPath, config, globalCompressOptions);
      }
    }
  }

  /**
   * dev 모드 공통: catch-all에서 syncer.apis를 동적으로 탐색하여 API 요청을 처리합니다.
   * server.route()로 개별 등록하면 handler가 고정되어 HMR이 동작하지 않으므로,
   * 매 요청마다 syncer.apis를 조회하는 이 방식을 사용합니다.
   *
   * 요청이 /api(정확히는 this.config.api.route.prefix)로 시작하지 않는 경우라면 null을 반환하며 끝냅니다.
   */
  private handleDevApiRequest(
    request: FastifyRequest,
    config: SonamuFastifyConfig,
  ): ((request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) | null {
    const url = this.getPathnameFromUrl(request.url);
    const method = request.method;

    if (!url.startsWith(this.config.api.route.prefix)) {
      return null;
    }

    // syncer.apis의 path는 :param 형태를 포함할 수 있으므로 세그먼트 단위로 매칭합니다.
    // 정규식 생성 방식은 path 문자열 내 특수문자(., +, (, [ 등)로 오작동할 수 있어 사용하지 않습니다.
    const matchedApi = this.syncer.apis.find((api) => {
      if (this.syncer.models[api.modelName] === undefined) {
        return false;
      }
      const apiMethod = api.options.httpMethod ?? "GET";
      if (apiMethod !== method) return false;

      const fullPath = this.config.api.route.prefix + api.path;
      return this.isPathPatternMatch(fullPath, url);
    });

    if (!matchedApi) {
      throw new NotFoundException(SD("error.api.notFound"));
    }

    return this.createApiHandler(matchedApi, config);
  }

  /**
   * dev api 모드: Vite 없이 API 동적 라우팅만 제공합니다.
   * HMR을 위해 catch-all에서 매 요청마다 syncer.apis를 조회합니다.
   */
  private setupDevServer(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    config: SonamuFastifyConfig,
  ): void {
    server.route({
      method: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"],
      url: `${this.config.api.route.prefix}/*`,
      handler: async (request, reply) => {
        const handler = this.handleDevApiRequest(request, config);
        if (handler) {
          return handler(request, reply);
        }
        // 사실 /api로 시작하지 않는 요청은 여기에 들어오지도 않을 거라 이 라인은 도달 불가능입니다만,
        // 안전빵으로 남겨놓습니다.
        throw new NotFoundException(SD("error.api.notFound"));
      },
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: ViteDevServer 타입을 동적으로 로드해야 함
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

    this.viteServer = await vite.createServer({
      root: webPath,
      server: {
        middlewareMode: true,
        hmr: {
          server: server.server,
        },
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

    // catch-all 라우트에서 동적으로 API/SSR 처리
    // 개발 환경에서는 라우트별 compress 옵션을 포기하고 HMR 이점을 취합니다.
    server.route({
      method: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"],
      url: "/*",
      handler: async (request, reply) => {
        // 1. API 요청 처리
        const result = this.handleDevApiRequest(request, config);
        if (result) {
          return result(request, reply);
        }

        const url = request.url;

        // 2. SSR 라우트 처리
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

        // 3. CSR fallback
        try {
          const fs = await import("node:fs/promises");
          let template = await fs.readFile(
            path.join(this.viteServer.config.root, "index.html"),
            "utf-8",
          );
          template = await this.viteServer.transformIndexHtml(url, template);

          reply.type("text/html");
          return template;
        } catch (e) {
          this.viteServer.ssrFixStacktrace(e as Error);
          console.error(e);
          reply.status(500);
          return (e as Error).message;
        }
      },
    });

    // 서버 종료 시 Vite도 종료
    server.addHook("onClose", async () => {
      await this.viteServer.close();
    });

    console.log("✓ Vite dev server integrated");
  }

  private async setupStaticWebServer(
    server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    _webPath: string,
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
      const requestedFile = (request.params as { filename: string }).filename;
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
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
      // Context 생성
      const context: Context = await this.createContext(config, request, reply);

      return this.asyncLocalStorage.run({ context }, async () => {
        // guards 처리
        (api.options.guards ?? []).every((guard) => config.guardHandler(guard, request, api));

        // 파라미터 정보로 zod 스키마 빌드
        const { getZodObjectFromApi } = await import("./code-converters");
        const ReqType = getZodObjectFromApi(api, this.syncer.types);

        // request 파싱
        const which = api.options.httpMethod === "GET" ? "query" : "body";
        let reqBody: {
          [key: string]: unknown;
        };
        // 파일 업로드 있는 경우 임시 데이터
        const files: {
          bufferedFiles: BufferedFile[];
          uploadedFiles: UploadedFile[];
        } = {
          bufferedFiles: [],
          uploadedFiles: [],
        };

        try {
          const body = (request[which] ?? {}) as Record<string, unknown>;
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

          const { fastifyCaster } = await import("./caster");
          reqBody = fastifyCaster(ReqType).parse(body);
        } catch (e) {
          const { ZodError } = await import("zod");
          if (e instanceof ZodError) {
            const { humanizeZodError } = await import("../utils/zod-error");
            const messages = humanizeZodError(e)
              .map((issue) => issue.message)
              .join(" ");
            const { BadRequestException } = await import("../exceptions/so-exceptions");
            throw new BadRequestException(messages as LocalizedString, {
              zodError: e,
            });
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
            return reqBody[param.name];
          }
        });

        return this.invokeModelMethod(api, args, reply);
      });
    };
  }

  /**
   * URL에서 path params를 추출합니다.
   * 예: pattern="/admin/companies/:companyId", url="/admin/companies/123" → { companyId: "123" }
   */
  private extractPathParams(pattern: string, url: string): Record<string, string> {
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
    // biome-ignore lint/suspicious/noExplicitAny: SSR에서 다양한 타입의 params를 받아야 함
    params: any[],
    config: SonamuFastifyConfig,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<unknown> {
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

  async invokeModelMethod(
    api: ExtendedApi,
    args: unknown[],
    reply: FastifyReply,
  ): Promise<unknown> {
    const model = this.syncer.models[api.modelName];
    // biome-ignore lint/suspicious/noExplicitAny: model은 모델 인스턴스이므로 메서드 호출 가능
    const result = await (model as any)[api.methodName].apply(model, args);
    reply.type(api.options.contentType ?? "application/json");

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
    const session = (await this._auth?.api.getSession({ headers })) ?? null;

    const context: Context = {
      ...(await Promise.resolve(
        config.contextProvider(
          {
            request,
            reply,
            headers: request.headers,
            createSSE,
            naiteStore: Naite.createStore(),
            locale,
            // auth
            user: session?.user ?? null,
            session: session?.session ?? null,
          },
          request,
          reply,
        ),
      )),
    };
    return context;
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

    // compress 플러그인은 다른 플러그인보다 먼저 등록되어야 합니다.
    if (plugins.compress) {
      const compressPlugin = (await import("@fastify/compress")).default;
      const defaultOptions = {
        threshold: 1024,
        encodings: ["br", "gzip", "deflate"] as ("br" | "gzip" | "deflate")[],
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
      await registerPlugin(key as keyof typeof plugins, pluginName);
    }

    if (plugins.custom) {
      plugins.custom(server);
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

    // 사용자 설정과 기본값을 merge
    const mergedFieldMappings = merge(BASE_FIELD_MAPPINGS, options);

    // better-auth 인스턴스 생성
    const { betterAuth } = await import("better-auth");
    const { Pool } = await import("pg");

    this._auth = betterAuth({
      database: new Pool(DB.getDBConfig("w").connection as PoolConfig),
      ...mergedFieldMappings,
    });

    // better-auth 라우트 등록
    server.route({
      method: ["GET", "POST"],
      url: `${basePath}/*`,
      handler: async (request, reply) => {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const headers = convertFastifyHeadersToStandard(request.headers);
        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });

        const response = await this.auth.handler(req);

        reply.status(response.status);
        response.headers.forEach((value: string, key: string) => {
          reply.header(key, value);
        });
        return reply.send(response.body ? await response.text() : null);
      },
    });

    const chalk = (await import("chalk")).default;
    console.log(chalk.green(`✓ better-auth registered at ${basePath}/*`));
  }

  private async initializeCache(config: CacheConfig | undefined, forTesting: boolean) {
    const { setCacheManagerRef } = await import("../cache/decorator");

    // 테스트 환경에서 메모리 드라이버 자동 사용
    if (forTesting) {
      const { createTestCacheManager } = await import("../cache/cache-manager");
      this._cache = createTestCacheManager();
      setCacheManagerRef(this._cache);
      return;
    }

    // 설정이 없으면 캐시 비활성화
    if (!config) {
      setCacheManagerRef(null);
      return;
    }

    // 설정에 따라 CacheManager 생성
    const { createCacheManager } = await import("../cache/cache-manager");
    this._cache = createCacheManager(config);
    setCacheManagerRef(this._cache);
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
    // 먼저 처리해야함.
    await BaseModel.destroy();
    await Promise.allSettled([
      this._workflows?.destroy() ?? Promise.resolve(),
      this._cache?.disconnect() ?? Promise.resolve(),
      this.watcher?.close() ?? Promise.resolve(),
      logtapeDispose(),
    ]);
  }
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
