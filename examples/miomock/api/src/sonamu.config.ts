import path from "path";

import { getConsoleSink } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { admin, CachePresets, defineConfig, passkey, sonamuAuditLog, twoFactor } from "sonamu";
import { drivers as cacheDrivers, store } from "sonamu/cache";
import { drivers } from "sonamu/storage";

const host = "localhost";
const port = 10280;

export default defineConfig({
  projectName: "Miomock",
  api: {
    dir: "api",
    timezone: "Asia/Seoul",
    route: {
      prefix: "/api",
    },
  },
  i18n: {
    defaultLocale: "ko",
    supportedLocales: ["ko", "en", "ja"],
  },
  sync: {
    targets: ["web"],
  },
  validation: {
    zodCompiler: {
      api: "aot",
    },
  },
  database: {
    database: "pg",
    defaultOptions: {
      connection: {
        host: process.env.SONAMU_DB_HOST ?? "0.0.0.0",
        port: Number(process.env.SONAMU_DB_PORT ?? 5432),
        user: process.env.SONAMU_DB_USER ?? "postgres",
        password: process.env.SONAMU_DB_PASSWORD ?? "miomock123",
      },
    },
  },

  slackConfirm:
    process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID
      ? {
          targets: ["staging", "production"],
          botToken: process.env.SLACK_BOT_TOKEN ?? "",
          channelId: process.env.SLACK_CHANNEL_ID ?? "",
        }
      : undefined,

  test: {
    parallel: true,
    maxWorkers: 4,
    devRunner: { enabled: true },
  },

  logging: {
    sinks: {
      console: getConsoleSink({
        formatter: getPrettyFormatter({
          timestamp: "time",
          categoryWidth: 20,
          categoryTruncate: "middle",
        }),
      }),
    },
    loggers: [
      {
        category: ["sonamu"],
        sinks: ["console"],
        lowestLevel: process.env.NODE_ENV === "test" ? "warning" : "debug",
      },
      {
        category: ["sonamu", "internal", "tasks"],
        sinks: ["console"],
        lowestLevel: "error",
      },
      {
        category: ["tasks"],
        sinks: ["console"],
        lowestLevel: "info",
      },
    ],
  },

  tasks: {
    enableWorker: !["true", "1"].includes(process.env.DISABLE_WORKER ?? "false"),
    workerOptions: {
      concurrency: 1,
      usePubSub: true,
      listenDelay: 500,
    },
    contextProvider: (defaultContext) => {
      return {
        ...defaultContext,
        ip: "127.0.0.1",
      };
    },
  },

  server: {
    baseUrl: `http://${host}:${port}`,
    listen: { port, host },
    websocket: {
      telemetry: {
        defaults: {
          maxRecords: 1_000,
          maxBytes: 1024 * 1024,
        },
        events: {
          capturePayload: "preview",
        },
        metrics: {
          sampleIntervalMs: 10_000,
        },
      },
    },
    plugins: {
      ws: {
        options: {
          maxPayload: 64 * 1024,
        },
      },
      compress: {
        global: false,
        threshold: 1024,
        encodings: ["gzip"],
      },
      formbody: true,
      qs: true,
      multipart: { limits: { fileSize: 1024 * 1024 * 30 } },
      static: {
        root: path.join(import.meta.dirname, "/../", "public"),
        prefix: "/api/public",
      },
      sse: true,
      custom: (_server) => {
        // nothing yet
      },
    },

    auth: {
      appName: "Miomock",
      plugins: [
        twoFactor(),
        passkey(),
        admin({ defaultRole: "normal", adminRoles: ["admin"] }),
        sonamuAuditLog(),
      ],
      emailAndPassword: { enabled: true },
      baseURL: process.env.BETTER_AUTH_URL ?? `http://${host}:${port}`,
      secret: process.env.BETTER_AUTH_SECRET ?? "miomock-secret-key-change-this-in-production",
      session: {
        expiresIn: 60 * 60 * 24 * 365,
      },
      user: {
        fields: {
          name: "username",
          emailVerified: "is_verified",
        },
        additionalFields: {
          role: { type: "string", sonamuType: "UserRole" },
          created_at: { type: "date" },
        },
      },
    },

    apiConfig: {
      contextProvider: (defaultContext, request) => {
        return {
          ...defaultContext,
          ip: request.ip,
          body: request.body,
        };
      },
      guardHandler: (_guard, _request, _api) => {
        console.log("NOTHING YET");
      },
      cacheControlHandler: (req) => {
        switch (req.type) {
          case "assets":
            // Hash 포함된 파일: 영구 캐시
            if (req.path.match(/-[a-f0-9]+\./)) {
              return CachePresets.immutable;
            }
            return CachePresets.longLived;

          case "api":
            // GET 요청만 캐싱 고려
            if (req.method === "GET") {
              // 특정 경로는 짧은 캐시
              if (req.path.startsWith("/api/static-data")) {
                return CachePresets.shortLived;
              }
              if (req.path.startsWith("/api/terms")) {
                return CachePresets.mediumLived;
              }
            }
            // 기본: 캐시 없음
            return CachePresets.noCache;

          case "ssr":
            // SSR 페이지: 10초 캐시
            return CachePresets.ssr;

          case "csr":
            // CSR fallback (index.html): 1분 캐시
            return CachePresets.shortLived;
        }
      },
    },

    storage: {
      drivers: {
        fs: drivers.fs({
          location: path.join(import.meta.dirname, "/../public/uploaded"),
          visibility: "public",
          urlBuilder: {
            async generateURL(key) {
              return `/api/public/uploaded/${key}`;
            },
            async generateSignedURL(key) {
              return `/api/public/uploaded/${key}`;
            },
          },
        }),
        s3: drivers.s3({
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
          },
          region: "ap-northeast-2",
          bucket: "miomock",
          visibility: "private",
        }),
      },
    },

    cache: {
      default: "main",
      stores: {
        main: store().useL1Layer(cacheDrivers.memory({ maxSize: "50mb" })),
      },
      ttl: "5m",
      prefix: "",
    },

    lifecycle: {
      onStart: () => {
        console.log(`🌲 Server listening on http://${host}:${port}`);
      },
      onShutdown: () => {
        console.log("graceful shutdown");
      },
      onError: (error, _request, reply) => {
        console.error(error);
        reply.status(500).send({
          name: error.name,
          message: error.message,
        });
      },
    },
  },

  externalEditor: "Zed",
});
