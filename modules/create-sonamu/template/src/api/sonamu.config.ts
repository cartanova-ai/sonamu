import path from "path";
import { defineConfig, FSDriver, S3Driver } from "sonamu";

const host = "localhost";
const port = 1028;

export default defineConfig({
  projectName: process.env.PROJECT_NAME ?? "SonamuProject",
  api: {
    dir: "api",
    timezone: "Asia/Seoul",
    route: {
      prefix: "/api",
    },
  },
  sync: {
    targets: ["web"],
  },
  ui: {
    port: 2028,
  },
  database: {
    database: "postgresql",
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
      session: {
        secret: process.env.SESSION_SECRET || "sonamu-secret-key-change-this-in-production",
        salt: process.env.SESSION_SALT || "mq9hDxBCDbsQDR6N",
        cookie: {
          domain: "localhost",
          path: "/",
          maxAge: 60 * 60 * 24 * 365 * 10,
        },
      },
      custom: (_server) => {
        // nothing yet
      },
    },

    auth: true,
    // auth: {
    //   userSerializer: async (user, _request) => user,
    //   userDeserializer: async (serialized, _request) => serialized,
    // },

    apiConfig: {
      contextProvider: (defaultContext, request) => {
        return {
          ...defaultContext,
          ip: request.ip,
          session: request.session,
          body: request.body,
        };
      },
      guardHandler: (_guard, _request, _api) => {
        console.log("NOTHING YET");
      },
    },

    storage: (() => {
      if (process.env.NODE_ENV === "production") {
        return new S3Driver({
          bucket: process.env.S3_BUCKET || "sonamu_default_bucket",
          region: process.env.S3_REGION || "ap-northeast-2",
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "sonamu_default_aws_access_key_id",
            secretAccessKey:
              process.env.AWS_SECRET_ACCESS_KEY ?? "sonamu_default_aws_secret_access_key",
          },
        });
      }
      return new FSDriver({
        location: path.join(import.meta.dirname, "/../", "public", "uploaded"),
        urlPrefix: "/api/public/uploaded",
      });
    })(),

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
