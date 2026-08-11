import { type FastifyCompressOptions } from "@fastify/compress";
import { type FastifyCorsOptions } from "@fastify/cors";
import { type FastifyFormbodyOptions } from "@fastify/formbody";
import { type FastifyMultipartOptions } from "@fastify/multipart";
import { type FastifyStaticOptions } from "@fastify/static";
import { type WebsocketPluginOptions } from "@fastify/websocket";
import { type BetterAuthOptions } from "better-auth";
import {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import { type QsPluginOptions } from "fastify-qs";
import { type SsePluginOptions } from "fastify-sse-v2/lib/types";
import { type Knex } from "knex";

import { type CacheConfig } from "../cache/types";
import { type SonamuDBConfig } from "../database/db";
import { applyCurrentSnapshotToProcessEnv } from "../env";
import { type SonamuLoggingOptions } from "../logger/configure";
import { type StorageConfig } from "../storage/types";
import { type WebSocketRuntimeOptions } from "../stream/ws";
import { type WorkflowOptions } from "../tasks/workflow-manager";
import { type Executable, type SonamuFastifyConfig } from "../types/types";
import { type Context, type WebSocketContext } from "./context";

export type DatabaseConfig = Omit<Knex.Config, "connection"> & {
  connection?: Knex.PgConnectionConfig;
};

/**
 * i18n 설정
 */
export type SonamuI18nOptions = {
  /** 기본 locale (키 정의 기준 + 런타임 기본값) */
  defaultLocale: string;
  /** 지원하는 locale 목록 */
  supportedLocales: string[];
};

/**
 * Dev 서버 내 Vitest 상주 인스턴스 설정
 */
export type SonamuDevRunnerConfig = {
  /** DevRunner 활성화 여부 (기본: false) */
  enabled: boolean;
  /** 테스트 엔드포인트 경로 접두사 (기본: /__test__) */
  routePrefix?: string;
  /** vitest.config.ts 경로 (api-root 상대경로) */
  vitestConfigPath?: string;
};

/**
 * 테스트 설정
 * vitest 병렬 테스팅을 sonamu.config.ts 한 곳에서 관리하기 위한 설정입니다.
 */
export type SonamuTestConfig = {
  /** 병렬 테스팅 활성화 (기본: false) */
  parallel?: boolean;
  /** 병렬 실행 워커 수 (기본: 4) */
  maxWorkers?: number;
  /** Dev 서버 내 Vitest 상주 인스턴스 설정 */
  devRunner?: SonamuDevRunnerConfig;
};

export type ZodCompilerApiMode = false | "jit" | "aot";
export type ZodCompilerConfig =
  | false
  | {
      api?: ZodCompilerApiMode;
    };
export type NormalizedZodCompilerPolicy = {
  api: ZodCompilerApiMode;
  targets: Record<string, never>;
};

export function normalizeZodCompilerPolicy(
  value: unknown,
  _syncTargets: readonly string[] = [],
): NormalizedZodCompilerPolicy {
  if (value === undefined || value === false) {
    return { api: false, targets: {} };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("validation.zodCompiler must be false or an object");
  }

  const policy = value as Record<string, unknown>;
  const api = policy.api ?? false;
  if (api !== false && api !== "jit" && api !== "aot") {
    throw new Error("validation.zodCompiler.api must be false, 'jit', or 'aot'");
  }

  if ("targets" in policy) {
    throw new Error("validation.zodCompiler.targets is not supported in the API-only phase");
  }

  return { api, targets: {} };
}

export type SonamuConfig<TSinkId extends string = string, TFilterId extends string = string> = {
  projectName?: string;

  api: {
    dir: string;
    route: {
      prefix: string;
    };
    timezone?: string;
  };

  /**
   * i18n 설정
   *
   * @example
   * ```typescript
   * i18n: {
   *   defaultLocale: 'ko',
   *   supportedLocales: ['ko', 'en', 'ja'],
   * }
   * ```
   */
  i18n: SonamuI18nOptions;

  sync: {
    targets: string[]; // "web", "app" 등
  };

  validation?: {
    zodCompiler?: ZodCompilerConfig;
  };

  database: {
    // 데이터베이스(pg는 pg 모듈, pgnative는 pg-native 모듈의 설치가 필요합니다.)
    database?: "pg" | "pgnative";
    // 모든 환경에 적용될 기본 Knex 옵션
    defaultOptions?: DatabaseConfig;
  };

  logging?: false | SonamuLoggingOptions<TSinkId, TFilterId>;
  server: SonamuServerOptions;
  tasks?: SonamuTaskOptions;

  /**
   * 테스트 설정 (병렬 테스팅 등)
   *
   * @example
   * ```typescript
   * test: {
   *   parallel: true,
   *   maxWorkers: 4,
   * }
   * ```
   */
  test?: SonamuTestConfig;

  /**
   * 외부 에디터 설정 (CDD 등에서 파일 편집 시 사용)
   * 미설정 시 "vscode"를 기본값으로 사용합니다.
   *
   * @example
   * ```typescript
   * externalEditor: "cursor"
   * ```
   */
  externalEditor?: "Visual Studio Code" | "Zed" | "Cursor";

  /**
   * Slack 승인 설정 (Production 마이그레이션용)
   *
   * Production DB 마이그레이션 시 Slack을 통한 승인 프로세스를 활성화합니다.
   * 설정이 없으면 기존 동작(바로 실행)으로 동작합니다.
   *
   * @example
   * ```typescript
   * slackConfirm: {
   *   targets: ["production"],
   *   botToken: process.env.SLACK_BOT_TOKEN ?? "",
   *   channelId: process.env.SLACK_CHANNEL_ID ?? "",
   * }
   * ```
   */
  slackConfirm?: {
    /** 승인이 필요한 DB 키 목록 (예: ["production"]) */
    targets: (keyof SonamuDBConfig)[];
    /** Slack Bot Token (xoxb-...) */
    botToken: string;
    /** Slack Channel ID (C...) */
    channelId: string;
  };
};

export type SonamuServerOptions = {
  // 프로젝트 외부에서 접근할 수 있는 URL. 기본값은 {server.listen.host}:{server.listen.port} 입니다.
  baseUrl?: string;

  fastify?: Omit<FastifyServerOptions, "logger">;

  listen?: {
    port: number;
    host?: string;
  };

  plugins?: {
    /** 응답 압축 플러그인 (@fastify/compress) */
    compress?: boolean | FastifyCompressOptions;
    cors?: boolean | FastifyCorsOptions;
    formbody?: boolean | FastifyFormbodyOptions;
    multipart?: boolean | FastifyMultipartOptions;
    qs?: boolean | QsPluginOptions;
    sse?: boolean | SsePluginOptions;
    static?: boolean | FastifyStaticOptions;
    ws?: boolean | WebsocketPluginOptions;

    custom?: (server: FastifyInstance) => void;
  };

  /**
   * better-auth 인증 설정
   * Sonamu 확장으로 additionalFields에 sonamuType 속성 추가 가능
   * BetterAuth의 DBFieldAttribute를 확장할 수 없어서 우선 user만 적용
   */
  auth?: BetterAuthOptions & {
    user?: {
      additionalFields?: Record<
        string,
        NonNullable<NonNullable<BetterAuthOptions["user"]>["additionalFields"]>[string] & {
          sonamuType?: string;
        }
      >;
    };
  };

  /**
   * WebSocket runtime 설정.
   *
   * 단일 인스턴스에서는 기본값으로 충분하며, 멀티 인스턴스/대규모 환경에서는
   * presence store와 cluster bus를 여기서 주입합니다.
   */
  websocket?: WebSocketRuntimeOptions;

  apiConfig: SonamuFastifyConfig;

  /**
   * Storage 드라이버 설정.
   * saveToDisk(diskName, key) 호출 시 드라이버를 명시적으로 지정합니다.
   *
   * @example
   * ```typescript
   * import { drivers } from "sonamu/storage";
   *
   * storage: {
   *   drivers: {
   *     fs: drivers.fs({ location: "./uploads", urlBuilder: { ... } }),
   *     s3: drivers.s3({ bucket: "my-bucket", region: "ap-northeast-2", ... }),
   *   }
   * }
   * ```
   */
  storage?: StorageConfig;

  /**
   * Cache 설정 (BentoCache 기반)
   *
   * @example
   * ```typescript
   * import { drivers, store } from "sonamu/cache";
   *
   * cache: {
   *   default: 'main',
   *   stores: {
   *     main: store()
   *       .useL1Layer(drivers.memory({ maxSize: '100mb' }))
   *       .useL2Layer(drivers.redis({ connection: redisConnection }))
   *       .useBus(drivers.redisBus({ connection: redisConnection }))
   *   },
   *   ttl: '1h',
   * }
   * ```
   */
  cache?: CacheConfig;

  lifecycle?: {
    onStart?: (server: FastifyInstance) => Promise<void> | void;
    onShutdown?: (server: FastifyInstance) => Promise<void> | void;
    onError?: (error: Error, request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;
  };
};

export type SonamuTaskOptions = {
  // worker를 사용할지 여부, 기본적으로 daemon 모드에서만 사용됨.
  enableWorker?: boolean;
  workerOptions?: WorkflowOptions;
  contextProvider: (
    defaultContext: Pick<
      Context,
      | "transport"
      | "reply"
      | "request"
      | "headers"
      | "createSSE"
      | "naiteStore"
      | "locale"
      | "user"
      | "session"
    >,
  ) => Context | Promise<Context>;
  websocketContextProvider?: (
    defaultContext: Pick<
      WebSocketContext,
      "transport" | "request" | "headers" | "ws" | "naiteStore" | "locale" | "user" | "session"
    >,
    request: FastifyRequest,
  ) => WebSocketContext | Promise<WebSocketContext>;
};

export type SonamuSSROptions = {
  /**
   * Hydration 전략
   * - 'none': 항상 새로 렌더링 (hydration mismatch 걱정 없음, 권장)
   * - 'full': React hydration 시도 (서버 HTML 재사용, mismatch 주의)
   * @default 'none'
   */
  hydration?: "none" | "full";
};

// NOTE(Haze, 251209): config에는 T, Promise<T>, () => T, () => Promise<T>가 모두 올 수 있어야 함.
export function defineConfig(config: Executable<SonamuConfig>): Promise<SonamuConfig> {
  if (typeof config === "function") {
    return Promise.resolve(config());
  }

  return Promise.resolve(config);
}

/**
 * sonamu.config.ts 파일을 로드합니다.
 * 이 설정 파일은 환경에 따라 다른 경로에 있을 수 있습니다.
 * dist를 빌드하는 환경이라면 dist 바로 아래에 있을 것이고(cli-wrapper.ts에서 빌드),
 * 그렇지 않은 환경이라면 프로젝트 루트에 있을 것입니다.
 *
 * 이 함수는 의도적으로 다른 의존성의 사용을 최대한 배제하였습니다.
 * 이는 실행 초기에 최대한 빠르게 설정을 읽어올 수 있도록 하기 위함입니다.
 * 따라서 경로 concat과 URL scheme 추가도 단순한 문자열 조작으로 처리하였습니다.
 *
 * @param rootPath
 * @returns
 */
export async function loadConfig(rootPath: string): Promise<SonamuConfig> {
  applyCurrentSnapshotToProcessEnv(rootPath);

  const shouldLoadSourceConfig = process.env.HOT === "yes" || process.env.VITEST === "true";
  const configPath = shouldLoadSourceConfig
    ? `${rootPath}/src/sonamu.config.ts`
    : `${rootPath}/dist/sonamu.config.js`;

  if (shouldLoadSourceConfig) {
    const { ensureTsLoaderRegistered } = await import("../bin/ts-loader-registration");
    await ensureTsLoaderRegistered(rootPath);
  }

  const { default: config } = await import(`file://${configPath}`);
  return config;
}
