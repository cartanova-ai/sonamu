import type { Knex } from "knex";
import type { Driver } from "../file-storage/driver";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import type { SonamuFastifyConfig } from "../types/types";
import type { FastifyCorsOptions } from "@fastify/cors";
import type { FastifyFormbodyOptions } from "@fastify/formbody";
import type { FastifyMultipartOptions } from "@fastify/multipart";
import type { SecureSessionPluginOptions } from "@fastify/secure-session";
import type { FastifyStaticOptions } from "@fastify/static";
import type { QsPluginOptions } from "fastify-qs";
import type { SsePluginOptions } from "fastify-sse-v2/lib/types";
import type {
  DeserializeFunction,
  SerializeFunction,
} from "@fastify/passport/dist/Authenticator";

export type DatabaseConfig = Omit<Knex.Config, "connection"> & {
  connection?: Knex.MySql2ConnectionConfig;
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
  ui?: {
    port: number;
  };

  database: {
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
};

export type SonamuServerOptions = {
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
    onError?: (
      error: Error,
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void> | void;
  };
};

export type SonamuConfigExport = SonamuConfig | Promise<SonamuConfig>;

export function defineConfig(config: SonamuConfig): SonamuConfig;
export function defineConfig(
  config: Promise<SonamuConfig>
): Promise<SonamuConfig>;
export function defineConfig(config: SonamuConfigExport): SonamuConfigExport {
  return config;
}

export async function loadConfig(rootPath: string): Promise<SonamuConfig> {
  const start = performance.now();
  const configPath =
    process.env.HOT === "yes" || process.env.VITEST === "true"
      ? `${rootPath}/sonamu.config.ts`
      : `${rootPath}/dist/sonamu.config.js`;
  const { default: config } = await import(`file://${configPath}`);
  const importTime = performance.now() - start;
  console.log(`[TIMING] loadConfig took ${importTime.toFixed(2)}ms`);
  return config;
}
