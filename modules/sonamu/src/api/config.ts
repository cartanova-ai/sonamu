import type { FastifyCorsOptions } from "@fastify/cors";
import type { FastifyFormbodyOptions } from "@fastify/formbody";
import type { FastifyMultipartOptions } from "@fastify/multipart";
import type { DeserializeFunction, SerializeFunction } from "@fastify/passport/dist/Authenticator";
import type { SecureSessionPluginOptions } from "@fastify/secure-session";
import type { FastifyStaticOptions } from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from "fastify";
import type { QsPluginOptions } from "fastify-qs";
import type { SsePluginOptions } from "fastify-sse-v2/lib/types";
import type { Knex } from "knex";
import type { Driver } from "../file-storage/driver";
import type { WorkflowOptions } from "../tasks/workflow-manager";
import type { Executable, SonamuFastifyConfig } from "../types/types";
import type { AuthContext, Context } from "./context";

export type DatabaseConfig = Omit<Knex.Config, "connection"> & {
  connection?: Knex.PgConnectionConfig;
};

export type SonamuConfig = {
  projectName?: string;

  api: {
    dir: string;
    route: {
      prefix: string;
    };
    timezone?: string;
  };
  sync: {
    targets: string[]; // "web", "app" 등
  };

  database: {
    // 데이터베이스
    database?: "postgresql";
    // 기본 데이터베이스 이름
    name: string;
    // 모든 환경에 적용될 기본 Knex 옵션
    defaultOptions: DatabaseConfig;
    // 환경별 설정
    environments?: {
      development?: DatabaseConfig;
      development_slave?: DatabaseConfig;
      production?: DatabaseConfig;
      production_slave?: DatabaseConfig;
      remote_fixture?: DatabaseConfig;
    };
  };

  server: SonamuServerOptions;
  tasks?: SonamuTaskOptions;
};

export type SonamuServerOptions = {
  // 프로젝트 외부에서 접근할 수 있는 URL. 기본값은 {server.listen.host}:{server.listen.port} 입니다.
  baseUrl?: string;

  fastify?: FastifyServerOptions;

  listen?: {
    port: number;
    host?: string;
  };

  plugins?: {
    cors?: boolean | FastifyCorsOptions;
    formbody?: boolean | FastifyFormbodyOptions;
    multipart?: boolean | FastifyMultipartOptions;
    qs?: boolean | QsPluginOptions;
    sse?: boolean | SsePluginOptions;
    static?: boolean | FastifyStaticOptions;
    session?: boolean | SecureSessionPluginOptions;

    custom?: (server: FastifyInstance) => void;
  };

  auth?:
    | boolean
    | {
        userSerializer: SerializeFunction<unknown, unknown>;
        userDeserializer: DeserializeFunction<unknown, unknown>;
      };

  apiConfig: SonamuFastifyConfig;

  storage?: Driver;

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
    defaultContext: Pick<Context, "reply" | "request" | "headers" | "createSSE" | "naiteStore"> &
      AuthContext,
  ) => Context | Promise<Context>;
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
  const start = performance.now();
  const configPath =
    process.env.HOT === "yes" || process.env.VITEST === "true"
      ? `${rootPath}/src/sonamu.config.ts`
      : `${rootPath}/dist/sonamu.config.js`;
  const { default: config } = await import(`file://${configPath}`);
  const importTime = performance.now() - start;
  process.env.NODE_ENV !== "test" &&
    console.log(`[TIMING] loadConfig took ${importTime.toFixed(2)}ms`);
  return config;
}
