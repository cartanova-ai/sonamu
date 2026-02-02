import path from "node:path";
import { defineConfig } from "sonamu";
import { drivers as cacheDrivers, store } from "sonamu/cache";
import { drivers } from "sonamu/storage";

const host = "localhost";
const port = 34900;

export default defineConfig({
  projectName: process.env.PROJECT_NAME ?? "SonamuProject",
  api: {
    dir: "api",
    timezone: "Asia/Seoul",
    route: {
      prefix: "/api",
    },
  },
  i18n: {
    defaultLocale: "ko",
    supportedLocales: ["ko", "en"],
  },
  sync: {
    targets: ["web"],
  },
  database: {
    database: "pg",
    name: process.env.DATABASE_NAME ?? "database_name",
    defaultOptions: {
      connection: {
        host: process.env.DB_HOST || "0.0.0.0",
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD,
      },
    },
  },

  server: {
    listen: { port, host },
    plugins: {
      formbody: true,
      qs: true,
      multipart: { limits: { fileSize: 1024 * 1024 * 30 } },
      static: {
        root: path.join(import.meta.dirname, "/../", "public"),
        prefix: "/api/public",
      },
      custom: (_server) => {
        // nothing yet
      },
    },
    
    auth:{
      emailAndPassword: { enabled: true },
      baseURL: process.env.BETTER_AUTH_URL ?? `http://${host}:${port}`,
      secret: process.env.BETTER_AUTH_SECRET ?? "miomock-secret-key-change-this-in-production",
      basePath: "/",
      session: {
        expiresIn: 60 * 60 * 24 * 365 * 10,
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
        if (_guard === "user") {
          console.log("user guard");
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
          region: process.env.S3_REGION ?? "ap-northeast-2",
          bucket: process.env.S3_BUCKET ?? "sonamu_default_bucket",
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
});
